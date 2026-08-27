param(
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [string]$AdminName = "admin"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$setupToken = Read-PlainSecret "One-time setup token"
$teamCode = Read-PlainSecret "Team code"
$adminPin = Read-PlainSecret "Admin PIN"

try {
  Push-Location $projectRoot
  $env:CLOUDBASE_API_URL = $ApiUrl
  $env:SETUP_TOKEN = $setupToken
  $env:TEAM_CODE = $teamCode
  $env:ADMIN_PIN = $adminPin
  $env:ADMIN_NAME = $AdminName
  npm run setup:cloudbase
  if ($LASTEXITCODE -ne 0) { throw "Team initialization failed" }
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  Remove-Item Env:CLOUDBASE_API_URL,Env:SETUP_TOKEN,Env:TEAM_CODE,Env:ADMIN_PIN,Env:ADMIN_NAME -ErrorAction SilentlyContinue
  $setupToken = $null; $teamCode = $null; $adminPin = $null
}
