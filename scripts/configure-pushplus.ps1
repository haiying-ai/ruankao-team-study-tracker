param(
  [Parameter(Mandatory = $true)][string]$EnvId,
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$Topic = ''
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$tempConfig = Join-Path ([System.IO.Path]::GetTempPath()) "ruankao-pushplus-$([guid]::NewGuid().ToString('N')).json"

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

if ([string]::IsNullOrWhiteSpace($Topic)) {
  $Topic = Read-Host "PushPlus Topic（普通群组编码）"
}
if ([string]::IsNullOrWhiteSpace($Topic)) {
  throw "PushPlus Topic 不能为空"
}

$token = Read-PlainSecret "PushPlus Token（输入内容不会显示）"
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "PushPlus Token 不能为空"
}
$config = @{
  envId = $EnvId
  functionRoot = 'functions'
  functions = @(@{
    name = 'daily-notification'; runtime = 'Nodejs20.19'; handler = 'index.main'; timeout = 30
    memorySize = 256; installDependency = $true
    envVariables = @{ PUSHPLUS_TOKEN = $token; PUSHPLUS_TOPIC = $Topic; SITE_URL = $SiteUrl }
    triggers = @(
      @{ name = 'morning-0700'; type = 'timer'; config = '0 0 7 * * * *' },
      @{ name = 'retry-0710'; type = 'timer'; config = '0 10 7 * * * *' }
    )
  })
}

try {
  $json = $config | ConvertTo-Json -Depth 10
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tempConfig, $json, $utf8NoBom)
  Push-Location $projectRoot
  & npx.cmd tcb --config-file $tempConfig fn deploy daily-notification --dir functions/daily-notification --runtime Nodejs20.19 --install-dependency true --force
  if ($LASTEXITCODE -ne 0) { throw "PushPlus function update failed" }
  Write-Host "PushPlus configuration deployed." -ForegroundColor Green
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tempConfig -Force -ErrorAction SilentlyContinue
  $token = $null
}
