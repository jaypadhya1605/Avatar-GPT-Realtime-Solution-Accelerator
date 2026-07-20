[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipAzureSignIn
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$requiredCommands = @('az', 'azd', 'node', 'npm')
foreach ($command in $requiredCommands) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found."
    }
}

if (-not $SkipTests) {
    & (Join-Path $root 'scripts\test.ps1')
    & (Join-Path $root 'scripts\package.ps1')
}

if (-not $SkipAzureSignIn) {
    $accountJson = az account show --output json 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Azure CLI is not signed in. Run az login and select the intended subscription.'
    }
    $account = $accountJson | ConvertFrom-Json
    if ($account.state -ne 'Enabled') {
        throw 'The selected Azure subscription is not enabled.'
    }

    foreach ($provider in @('Microsoft.CognitiveServices', 'Microsoft.Insights', 'Microsoft.OperationalInsights', 'Microsoft.Web')) {
        $state = az provider show --namespace $provider --query registrationState --output tsv
        if ($LASTEXITCODE -ne 0 -or $state -ne 'Registered') {
            throw "Azure resource provider '$provider' is not registered."
        }
    }
}

azd version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Azure Developer CLI is unavailable.' }
Write-Host 'Preflight checks passed. No Azure resources were changed.'