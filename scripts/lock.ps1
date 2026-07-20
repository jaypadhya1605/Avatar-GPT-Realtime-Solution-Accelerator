[CmdletBinding()]
param()

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
    throw 'Run scripts/bootstrap.ps1 before regenerating dependency locks.'
}

Set-Location $root
& $venvPython -m piptools compile --allow-unsafe --generate-hashes --resolver=backtracking --strip-extras --output-file backend/requirements.txt backend/requirements.in
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the runtime dependency lock.' }
& $venvPython -m piptools compile --allow-unsafe --generate-hashes --resolver=backtracking --strip-extras --output-file backend/requirements-dev.txt backend/requirements-dev.in
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the development dependency lock.' }

Write-Host 'Python dependency locks regenerated.'