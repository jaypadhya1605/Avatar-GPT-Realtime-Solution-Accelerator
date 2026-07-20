[CmdletBinding()]
param(
    [int]$Port = 8000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runningOnWindows = $PSVersionTable.PSEdition -eq 'Desktop' -or $IsWindows
$venvPython = if ($runningOnWindows) {
    Join-Path $root '.venv\Scripts\python.exe'
} else {
    Join-Path $root '.venv/bin/python'
}
if (-not (Test-Path $venvPython)) {
    throw 'Run scripts/bootstrap.ps1 before starting the application.'
}

Push-Location (Join-Path $root 'frontend')
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
} finally {
    Pop-Location
}

$env:APP_ENV = 'local'
$env:APP_MODE = 'mock'
$env:BUILD_LABEL = 'local-mock'
$env:ALLOWED_ORIGINS = "http://localhost:$Port"
$env:FRONTEND_DIST_PATH = (Join-Path $root 'frontend\dist')
$env:PERSIST_RESULTS = 'false'

Write-Host "Starting the synthetic mock experience at http://localhost:$Port"
Push-Location (Join-Path $root 'backend')
try {
    & $venvPython -m uvicorn app.main:app --host 127.0.0.1 --port $Port
} finally {
    Pop-Location
}