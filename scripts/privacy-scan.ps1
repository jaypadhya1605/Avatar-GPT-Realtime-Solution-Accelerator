[CmdletBinding()]
param(
    [string]$ScanPath = (Split-Path -Parent $PSScriptRoot),
    [switch]$IncludeBuildOutput
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path $ScanPath).Path
$textExtensions = @(
    '.bicep', '.css', '.excalidraw', '.html', '.in', '.js', '.json', '.md', '.ps1',
    '.py', '.sh', '.svg', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml'
)
$excludedPathSegments = @(
    '.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache', '.ruff_cache'
)
if (-not $IncludeBuildOutput) {
    $excludedPathSegments += @('dist', 'artifacts')
}

function Test-ExcludedPath {
    param([Parameter(Mandatory)] [string]$RelativePath)

    $segments = $RelativePath.Replace('\', '/').Split('/')
    return [bool]($segments | Where-Object { $excludedPathSegments -contains $_ } | Select-Object -First 1)
}

$customerPattern = @(
    ('provi' + 'dence'),
    ('app-prov-' + 'empathy'),
    ('msft non ' + 'prod')
) -join '|'
$checks = [ordered]@{
    'customer or deployment identifier' = "(?i)$customerPattern"
    'private key material' = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    'storage account key' = '(?i)AccountKey\s*='
    'signed URL query parameter' = '(?i)[?&](?:sig|se|sp|sv|spr|skoid|sktid)='
    'non-placeholder client secret' = '(?i)(?:AZURE_CLIENT_SECRET|client_secret)\s*[=:]\s*["'']?(?!<|\$\{|YOUR-|REPLACE-)[A-Za-z0-9_~.+/=-]{12,}'
}
$failures = [System.Collections.Generic.List[string]]::new()

$files = @(Get-ChildItem $root -Recurse -File | Where-Object {
    $relative = [System.IO.Path]::GetRelativePath($root, $_.FullName)
    -not (Test-ExcludedPath $relative) -and $textExtensions -contains $_.Extension.ToLowerInvariant()
})
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    foreach ($check in $checks.GetEnumerator()) {
        if ($content -match $check.Value) {
            $relative = [System.IO.Path]::GetRelativePath($root, $file.FullName)
            $failures.Add("$($check.Key): $relative")
        }
    }
}

$originalImages = @(Get-ChildItem $root -Recurse -File | Where-Object {
    $relative = [System.IO.Path]::GetRelativePath($root, $_.FullName)
    -not (Test-ExcludedPath $relative) -and $_.Extension -match '^\.(jpe?g)$'
})
foreach ($image in $originalImages) {
    $relative = [System.IO.Path]::GetRelativePath($root, $image.FullName)
    $failures.Add("original JPEG asset is not publishable: $relative")
}

if ($failures.Count -gt 0) {
    $failures | Sort-Object -Unique | ForEach-Object { Write-Error $_ }
    throw 'Privacy scan failed.'
}

Write-Host "Privacy scan passed for $($files.Count) text files."