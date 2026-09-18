[CmdletBinding()]
param(
  [ValidateSet('Api', 'Notification', 'Frontend', 'All')]
  [string]$Target = 'All',
  [string]$ConfigPath = '',
  [switch]$PlanOnly,
  [ValidateRange(30, 300)]
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (-not $ConfigPath) { $ConfigPath = Join-Path $projectRoot 'deploy/cloudbase-deploy.config.json' }
$ConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)
$workRoot = Join-Path $projectRoot '.cloudbase-deploy'
$logRoot = Join-Path $workRoot 'logs'
$stageRoot = Join-Path $workRoot 'stage'
$artifactRoot = Join-Path $projectRoot 'deploy/artifacts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Assert-ChildPath([string]$Path, [string]$Parent) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes the permitted root: $full"
  }
  return $full
}

foreach ($dir in @($workRoot, $logRoot, $stageRoot, $artifactRoot)) {
  [System.IO.Directory]::CreateDirectory($dir) | Out-Null
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "Deployment config not found: $ConfigPath"
}
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if (-not $config.envId -or -not $config.siteUrl) { throw 'envId and siteUrl are required in deployment config' }
$node = (Get-Command node -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path -Parent $node) 'node_modules/npm/bin/npm-cli.js'
$cli = Join-Path $projectRoot 'node_modules/@cloudbase/cli/dist/standalone/cli.js'
$esbuild = Join-Path $projectRoot 'node_modules/esbuild/bin/esbuild'
$commandRunner = Join-Path $projectRoot 'scripts/run-command-timeout.mjs'
foreach ($required in @($npmCli, $cli, $esbuild, $commandRunner)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required tool not found: $required" }
}

function Invoke-CapturedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$Label,
    [int]$LimitSeconds = 180
  )
  $safeLabel = $Label -replace '[^A-Za-z0-9_.-]', '_'
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $stdoutPath = Join-Path $logRoot "$stamp-$safeLabel.out.log"
  $stderrPath = Join-Path $logRoot "$stamp-$safeLabel.err.log"
  $requestPath = Join-Path $logRoot "$stamp-$safeLabel.request.json"
  $resultPath = Join-Path $logRoot "$stamp-$safeLabel.result.json"
  $requestJson = @{
    filePath = $FilePath
    args = $Arguments
    cwd = $WorkingDirectory
    timeoutSeconds = $LimitSeconds
    stdoutPath = $stdoutPath
    stderrPath = $stderrPath
    resultPath = $resultPath
  } | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($requestPath, $requestJson, $utf8NoBom)
  & $node $commandRunner $requestPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
    throw "Command runner failed for $Label"
  }
  $run = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
  $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
  return [pscustomobject]@{
    ExitCode = [int]$run.exitCode
    TimedOut = [bool]$run.timedOut
    Stdout = $stdout
    Stderr = $stderr
    StdoutPath = $stdoutPath
    StderrPath = $stderrPath
  }
}

function Invoke-Tcb([string[]]$Arguments, [string]$Label, [int]$LimitSeconds = 90) {
  return Invoke-CapturedProcess -FilePath $node -Arguments (@($cli) + $Arguments) `
    -WorkingDirectory $projectRoot -Label $Label -LimitSeconds $LimitSeconds
}

function Convert-TcbJson([string]$Text) {
  $start = $Text.IndexOf('{')
  if ($start -lt 0) { throw 'CloudBase CLI did not return JSON' }
  return $Text.Substring($start) | ConvertFrom-Json
}

function Get-FunctionState([string]$FunctionName) {
  $result = Invoke-Tcb @('-e', $config.envId, 'fn', 'detail', $FunctionName, '--json') "detail-$FunctionName" 30
  try {
    if ($result.TimedOut -or $result.ExitCode -ne 0) {
      throw "Unable to read function state. See $($result.StderrPath)"
    }
    $payload = Convert-TcbJson $result.Stdout
    if (-not $payload.data) { throw "Function not found: $FunctionName" }
    return [pscustomobject]@{
      Status = $payload.data.Status
      Available = $payload.data.AvailableStatus
      Modified = [string]$payload.data.ModTime
    }
  } finally {
    # fn detail JSON can contain environment variables and source code.
    Remove-Item -LiteralPath $result.StdoutPath -Force -ErrorAction SilentlyContinue
  }
}

function Remove-TcbTemp([string]$FunctionName) {
  if ($FunctionName -notmatch '^[A-Za-z0-9_-]+$') { throw "Unsafe function name: $FunctionName" }
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $target = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ".cloudbase_temp_$FunctionName"))
  if (-not $target.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean outside the system temp directory: $target"
  }
  if (Test-Path -LiteralPath $target -PathType Container) {
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
  }
}

function Build-FunctionArtifact([string]$FunctionName, [string]$SourceRelative) {
  $source = Assert-ChildPath (Join-Path $projectRoot $SourceRelative) $projectRoot
  $entry = Join-Path $source 'index.js'
  $package = Join-Path $source 'package.json'
  if (-not (Test-Path -LiteralPath $entry -PathType Leaf) -or -not (Test-Path -LiteralPath $package -PathType Leaf)) {
    throw "Function source must contain index.js and package.json: $source"
  }

  $stage = Assert-ChildPath (Join-Path $stageRoot $FunctionName) $workRoot
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  [System.IO.Directory]::CreateDirectory($stage) | Out-Null
  $bundlePath = Join-Path $stage 'index.js'
  $bundle = Invoke-CapturedProcess -FilePath $node `
    -Arguments @($esbuild, $entry, '--bundle', '--platform=node', '--target=node20', '--format=cjs', "--outfile=$bundlePath") `
    -WorkingDirectory $source -Label "bundle-$FunctionName" -LimitSeconds 120
  if ($bundle.TimedOut -or $bundle.ExitCode -ne 0) { throw "Function bundle failed (exit $($bundle.ExitCode)). See $($bundle.StderrPath)" }
  $bundlePackage = @{
    name = "cloudbase-$FunctionName-bundle"; version = '1.0.0'; private = $true; main = 'index.js'
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $stage 'package.json'), $bundlePackage, $utf8NoBom)

  $loadCheck = Invoke-CapturedProcess -FilePath $node `
    -Arguments @('-e', "const m=require(process.argv[1]);if(typeof m.main!=='function')process.exit(2)", $bundlePath) `
    -WorkingDirectory $stage -Label "load-$FunctionName" -LimitSeconds 30
  if ($loadCheck.TimedOut -or $loadCheck.ExitCode -ne 0) { throw "Bundled function cannot be loaded. See $($loadCheck.StderrPath)" }

  $zipPath = Assert-ChildPath (Join-Path $artifactRoot "$FunctionName.zip") $projectRoot
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entries = @($zip.Entries | ForEach-Object FullName)
    if ($entries.Count -ne 2 -or $entries -notcontains 'index.js' -or $entries -notcontains 'package.json') {
      throw "Unexpected ZIP contents: $($entries -join ', ')"
    }
  } finally { $zip.Dispose() }
  $zipSize = (Get-Item -LiteralPath $zipPath).Length
  if ($zipSize -gt 1.5MB) {
    throw "ZIP is $([math]::Round($zipSize / 1MB, 2)) MB; CloudBase zip mode limit is 1.5 MB"
  }
  return [pscustomobject]@{ Stage = $stage; Zip = $zipPath; ZipBytes = $zipSize }
}

function Deploy-Function([string]$FunctionName, [string]$SourceRelative) {
  Write-Host "Preparing $FunctionName..." -ForegroundColor Cyan
  $artifact = Build-FunctionArtifact $FunctionName $SourceRelative
  Write-Host "Artifact: $($artifact.Zip) ($([math]::Round($artifact.ZipBytes / 1KB, 1)) KB)"
  if ($PlanOnly) { return }

  $before = Get-FunctionState $FunctionName
  # CLI 3.x ignores --yes in its config-less interactive code-update branch.
  # A name-only local config selects the non-interactive code-only branch;
  # Type/Runtime/Handler and all environment settings still come from the cloud.
  $codeConfigPath = Assert-ChildPath (Join-Path $workRoot "code-update-$FunctionName.json") $workRoot
  $codeConfig = @{
    envId = $config.envId
    functionRoot = '.cloudbase-deploy/stage'
    functions = @(@{ name = $FunctionName })
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($codeConfigPath, $codeConfig, $utf8NoBom)
  Remove-TcbTemp $FunctionName
  try {
    $deploy = Invoke-Tcb @(
      '--config-file', $codeConfigPath, '-e', $config.envId, 'fn', 'code', 'update', $FunctionName,
      '--dir', $artifact.Stage, '--deployMode', 'zip', '--yes'
    ) "deploy-$FunctionName" $TimeoutSeconds
    if (-not $deploy.TimedOut -and $deploy.ExitCode -ne 0) {
      throw "CloudBase update failed. See $($deploy.StderrPath)"
    }
    $after = $null
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
      try { $after = Get-FunctionState $FunctionName } catch { $after = $null }
      if ($after -and $after.Modified -ne $before.Modified -and $after.Status -eq 'Active') { break }
      Start-Sleep -Seconds 5
    }
    if (-not $after -or $after.Modified -eq $before.Modified -or $after.Status -ne 'Active') {
      throw "Cloud did not confirm the update. Upload fallback ZIP manually: $($artifact.Zip)"
    }
    Write-Host "$FunctionName updated at $($after.Modified)." -ForegroundColor Green
  } finally {
    Remove-TcbTemp $FunctionName
  }
}

function Run-ProjectCheck([string]$ScriptName, [int]$LimitSeconds = 180) {
  $result = Invoke-CapturedProcess -FilePath $node -Arguments @($npmCli, 'run', $ScriptName) `
    -WorkingDirectory $projectRoot -Label $ScriptName -LimitSeconds $LimitSeconds
  if ($result.TimedOut -or $result.ExitCode -ne 0) { throw "npm run $ScriptName failed. See $($result.StderrPath)" }
}

function Deploy-Frontend {
  Write-Host 'Checking and building frontend...' -ForegroundColor Cyan
  Run-ProjectCheck 'typecheck'
  Run-ProjectCheck 'test'
  Run-ProjectCheck 'build'
  if ($PlanOnly) { return }
  $deploy = Invoke-Tcb @(
    '-e', $config.envId, 'hosting', 'deploy', (Join-Path $projectRoot 'dist'),
    '--safe', '--verify', '--entry', 'index.html', '--yes'
  ) 'deploy-frontend' 180
  if ($deploy.TimedOut -or $deploy.ExitCode -ne 0) { throw "Frontend deployment failed. See $($deploy.StderrPath)" }

  $localIndex = Get-Content -LiteralPath (Join-Path $projectRoot 'dist/index.html') -Raw
  $assetMatch = [regex]::Match($localIndex, 'assets/index-[^"'']+\.js')
  if (-not $assetMatch.Success) { throw 'Unable to identify the local frontend asset hash' }
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $remoteIndex = (Invoke-WebRequest -UseBasicParsing -Uri "$($config.siteUrl)/?v=$stamp" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20).Content
  if (-not $remoteIndex.Contains($assetMatch.Value)) { throw 'CDN verification failed: remote index does not reference the new asset' }
  # A PWA-only fix can leave the main asset hash unchanged. Verify the worker too.
  $workerPath = Join-Path $projectRoot 'dist/sw.js'
  if (Test-Path -LiteralPath $workerPath -PathType Leaf) {
    $workerResponse = Invoke-WebRequest -UseBasicParsing -Uri "$($config.siteUrl)/sw.js?v=$stamp" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $remoteWorkerHash = [BitConverter]::ToString($sha.ComputeHash($workerResponse.RawContentStream.ToArray())).Replace('-', '')
    } finally { $sha.Dispose() }
    $localWorkerHash = (Get-FileHash -LiteralPath $workerPath -Algorithm SHA256).Hash
    if ($remoteWorkerHash -ne $localWorkerHash) { throw 'CDN verification failed: service worker hash differs from local build' }
    Write-Host "Service worker verified: $localWorkerHash" -ForegroundColor Green
  }
  Write-Host "Frontend verified: $($config.siteUrl)" -ForegroundColor Green
  Write-Host 'Asset integrity is verified; also smoke-test actual browser navigation and PWA refresh.' -ForegroundColor Yellow
}

$targets = switch ($Target) {
  'Api' { @('Api') }
  'Notification' { @('Notification') }
  'Frontend' { @('Frontend') }
  'All' { @('Api', 'Notification', 'Frontend') }
}

if ($targets -contains 'Api') { Deploy-Function $config.apiFunction.name $config.apiFunction.source }
if ($targets -contains 'Notification') { Deploy-Function $config.notificationFunction.name $config.notificationFunction.source }
if ($targets -contains 'Frontend') { Deploy-Frontend }

if ($PlanOnly) {
  Write-Host 'Plan-only validation completed; no cloud resources were changed.' -ForegroundColor Yellow
} else {
  Write-Host 'Deployment and verification completed.' -ForegroundColor Green
}
