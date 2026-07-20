[CmdletBinding()]
param(
    [switch]$SkipSmoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $root 'artifacts\app'
$runningOnWindows = $PSVersionTable.PSEdition -eq 'Desktop' -or $IsWindows
$venvPython = if ($runningOnWindows) {
    Join-Path $root '.venv\Scripts\python.exe'
} else {
    Join-Path $root '.venv/bin/python'
}

function Copy-CleanTree {
    param(
        [Parameter(Mandatory)] [string]$Source,
        [Parameter(Mandatory)] [string]$Destination
    )

    $sourcePath = (Resolve-Path $Source).Path
    Get-ChildItem $sourcePath -Recurse -File | Where-Object {
        $_.FullName -notmatch '[\\/](__pycache__|\.pytest_cache|\.ruff_cache)[\\/]' -and
        $_.Extension -notin @('.pyc', '.pyo')
    } | ForEach-Object {
        $relative = [System.IO.Path]::GetRelativePath($sourcePath, $_.FullName)
        $destinationFile = Join-Path $Destination $relative
        $destinationDirectory = Split-Path -Parent $destinationFile
        New-Item $destinationDirectory -ItemType Directory -Force | Out-Null
        Copy-Item $_.FullName $destinationFile -Force
    }
}

if (-not (Test-Path $venvPython)) {
    throw 'Run scripts/bootstrap.ps1 before packaging.'
}
if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
    throw 'Frontend dependencies are missing. Run scripts/bootstrap.ps1 before packaging.'
}

Set-Location $root
Push-Location (Join-Path $root 'frontend')
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
} finally {
    Pop-Location
}

if (Test-Path $artifactRoot) {
    Remove-Item $artifactRoot -Recurse -Force
}
New-Item $artifactRoot -ItemType Directory -Force | Out-Null

Copy-CleanTree (Join-Path $root 'backend\app') (Join-Path $artifactRoot 'app')
Copy-CleanTree (Join-Path $root 'data') (Join-Path $artifactRoot 'data')
Copy-CleanTree (Join-Path $root 'frontend\dist') (Join-Path $artifactRoot 'frontend\dist')
Copy-Item (Join-Path $root 'backend\requirements.txt') (Join-Path $artifactRoot 'requirements.txt')
Copy-Item (Join-Path $root 'scripts\startup.sh') (Join-Path $artifactRoot 'startup.sh')

$manifestFiles = Get-ChildItem $artifactRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
    [ordered]@{
        path = [System.IO.Path]::GetRelativePath($artifactRoot, $_.FullName).Replace('\', '/')
        bytes = $_.Length
        sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
$manifest = [ordered]@{
    schemaVersion = '1.0'
    source = 'Avatar GPT Realtime Solution Accelerator'
    files = @($manifestFiles)
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $artifactRoot 'package-manifest.json') -Encoding utf8

& (Join-Path $root 'scripts\privacy-scan.ps1') -ScanPath $artifactRoot -IncludeBuildOutput
if (-not $SkipSmoke) {
    & $venvPython (Join-Path $root 'scripts\smoke_package.py') $artifactRoot
    if ($LASTEXITCODE -ne 0) { throw 'Packaged application smoke check failed.' }
}

Write-Host "Package ready at $artifactRoot"