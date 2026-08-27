param(
  [Parameter(Mandatory = $true)][string]$EnvId
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $projectRoot 'cloudbase\policy.rego'
$tempPolicy = Join-Path ([System.IO.Path]::GetTempPath()) "ruankao-team-policy-$([guid]::NewGuid().ToString('N')).rego"

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$teamCode = Read-PlainSecret 'Team code (input is hidden)'
if ([string]::IsNullOrWhiteSpace($teamCode)) { throw 'Team code cannot be empty' }

try {
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $teamHashBytes = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($teamCode))
    $teamHash = ([BitConverter]::ToString($teamHashBytes) -replace '-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }

  $policy = [IO.File]::ReadAllText($templatePath).Replace('__TEAM_CODE_SHA256__', $teamHash)
  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($tempPolicy, $policy, $utf8NoBom)
  Push-Location $projectRoot
  node scripts/set-cloudbase-policy.mjs $EnvId $tempPolicy
  if ($LASTEXITCODE -ne 0) { throw 'Team access policy update failed' }
  Write-Host 'Team access policy enabled.' -ForegroundColor Green
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tempPolicy -Force -ErrorAction SilentlyContinue
  $teamCode = $null
  $teamHash = $null
}
