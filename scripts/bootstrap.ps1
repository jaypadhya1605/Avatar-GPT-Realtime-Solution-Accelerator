[CmdletBinding()]
param(
    [switch]$Recreate,
    [switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$venvRoot = Join-Path $root '.venv'
$runningOnWindows = $PSVersionTable.PSEdition -eq 'Desktop' -or $IsWindows
if ($runningOnWindows -and $root.Length -gt 110) {
    throw 'The checkout path is too long for some Python packages on Windows. Use a shorter checkout path or enable Windows long-path support.'
}

function Resolve-Python312 {
    $candidates = @()
    if ($runningOnWindows -and (Get-Command py -ErrorAction SilentlyContinue)) {
        $candidates += [pscustomobject]@{ Command = 'py'; Arguments = @('-3.12') }
    }
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        $uvPython = & uv python find 3.12 2>$null
        if ($LASTEXITCODE -eq 0 -and $uvPython) {
            $candidates += [pscustomobject]@{ Command = $uvPython; Arguments = @() }
        }
    }
    if (Get-Command python3.12 -ErrorAction SilentlyContinue) {
        $candidates += [pscustomobject]@{ Command = 'python3.12'; Arguments = @() }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $candidates += [pscustomobject]@{ Command = 'python'; Arguments = @() }
    }

    foreach ($candidate in $candidates) {
        $arguments = @($candidate.Arguments) + @('-c', 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        $version = & $candidate.Command @arguments 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -eq '3.12') {
            return $candidate
        }
    }
    throw 'Python 3.12 is required. Install it before running bootstrap.'
}

Set-Location $root
if ($Recreate -and (Test-Path $venvRoot)) {
    Remove-Item $venvRoot -Recurse -Force
}

if (-not (Test-Path $venvRoot)) {
    $python = Resolve-Python312
    $arguments = @($python.Arguments) + @('-m', 'venv', $venvRoot)
    & $python.Command @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the Python virtual environment.' }
}

$venvPython = if ($runningOnWindows) {
    Join-Path $venvRoot 'Scripts\python.exe'
} else {
    Join-Path $venvRoot 'bin/python'
}

& $venvPython -m pip install --disable-pip-version-check --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Failed to update pip in the project virtual environment.' }
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $root 'backend\requirements-dev.txt')
if ($LASTEXITCODE -ne 0) { throw 'Failed to install Python dependencies.' }

if (-not $SkipFrontend) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Node.js and npm are required. Install Node.js 20 or newer.'
    }
    Push-Location (Join-Path $root 'frontend')
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install frontend dependencies.' }
    } finally {
        Pop-Location
    }
}

Write-Host 'Bootstrap complete.'