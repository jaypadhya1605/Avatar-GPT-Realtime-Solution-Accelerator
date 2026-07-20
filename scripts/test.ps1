[CmdletBinding()]
param(
    [switch]$SkipInfrastructure
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
    throw 'Run scripts/bootstrap.ps1 before testing.'
}

$env:APP_ENV = 'test'
$env:APP_MODE = 'mock'
$env:PERSIST_RESULTS = 'false'
Set-Location $root

Get-ChildItem (Join-Path $root 'scripts') -Recurse -Filter '*.ps1' | ForEach-Object {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $_.FullName,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null
    if ($parseErrors.Count -gt 0) {
        throw "PowerShell parse failed for '$($_.FullName)': $($parseErrors[0].Message)"
    }
}

Push-Location (Join-Path $root 'backend')
try {
    & $venvPython -m ruff check app tests
    if ($LASTEXITCODE -ne 0) { throw 'Backend lint failed.' }
    & $venvPython -m ruff format --check app tests
    if ($LASTEXITCODE -ne 0) { throw 'Backend formatting check failed.' }
    & $venvPython -m compileall -q app tests
    if ($LASTEXITCODE -ne 0) { throw 'Backend compilation check failed.' }
    & $venvPython -m pytest
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
} finally {
    Pop-Location
}

Push-Location (Join-Path $root 'frontend')
try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Frontend lint failed.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
} finally {
    Pop-Location
}

& $venvPython (Join-Path $root 'scripts\validate_assets.py')
if ($LASTEXITCODE -ne 0) { throw 'Asset validation failed.' }
& $venvPython (Join-Path $root 'scripts\validate_docs.py')
if ($LASTEXITCODE -ne 0) { throw 'Documentation validation failed.' }
& (Join-Path $root 'scripts\privacy-scan.ps1')

if (-not $SkipInfrastructure) {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI is required for Bicep validation.'
    }
    az bicep lint --file (Join-Path $root 'infra\main.bicep')
    if ($LASTEXITCODE -ne 0) { throw 'Subscription Bicep lint failed.' }
    az bicep lint --file (Join-Path $root 'infra\resources.bicep')
    if ($LASTEXITCODE -ne 0) { throw 'Resource Bicep lint failed.' }
    az bicep build --file (Join-Path $root 'infra\main.bicep') --stdout | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Bicep compilation failed.' }
}

Write-Host 'All checks passed.'