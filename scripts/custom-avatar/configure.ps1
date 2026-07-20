[CmdletBinding(DefaultParameterSetName = 'Enable', SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory, ParameterSetName = 'Enable')]
    [ValidateNotNullOrEmpty()]
    [string]$Scenario001Character,

    [Parameter(Mandatory, ParameterSetName = 'Enable')]
    [ValidateNotNullOrEmpty()]
    [string]$Scenario002Character,

    [Parameter(Mandatory, ParameterSetName = 'Enable')]
    [ValidateNotNullOrEmpty()]
    [string]$Scenario003Character,

    [Parameter(Mandatory, ParameterSetName = 'Disable')]
    [switch]$Disable,

    [string]$Environment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

foreach ($command in @('az', 'azd')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found."
    }
}

function Get-AzdEnvironmentValue {
    param([Parameter(Mandatory)] [string]$Name)

    $arguments = @('env', 'get-value', $Name, '--no-prompt')
    if ($Environment) {
        $arguments += @('--environment', $Environment)
    }
    $output = & azd @arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read '$Name' from the selected azd environment."
    }
    $value = ([string[]]$output -join [Environment]::NewLine).Trim()
    if (-not $value) {
        throw "The selected azd environment does not contain '$Name'. Run azd up first."
    }
    return $value
}

az account show --output none 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'Azure CLI is not signed in. Run az login and select the deployment subscription.'
}

$resourceGroup = Get-AzdEnvironmentValue -Name 'AZURE_RESOURCE_GROUP'
$webAppName = Get-AzdEnvironmentValue -Name 'SERVICE_WEB_NAME'
$enabled = if ($Disable) { 'false' } else { 'true' }
$settings = @(
    "AZURE_CUSTOM_PHOTO_AVATAR_ENABLED=$enabled"
    "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_001=$(if ($Disable) { '' } else { $Scenario001Character })"
    "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_002=$(if ($Disable) { '' } else { $Scenario002Character })"
    "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_003=$(if ($Disable) { '' } else { $Scenario003Character })"
)
$operation = if ($Disable) {
    'disable Custom Photo Avatar and clear all character settings'
} else {
    'enable Custom Photo Avatar with three scenario-specific characters'
}

if ($PSCmdlet.ShouldProcess($webAppName, $operation)) {
    $setArguments = @(
        'webapp', 'config', 'appsettings', 'set',
        '--resource-group', $resourceGroup,
        '--name', $webAppName,
        '--settings'
    ) + $settings + @('--only-show-errors', '--output', 'none')
    & az @setArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to update the Custom Photo Avatar application settings.'
    }

    az webapp restart `
        --resource-group $resourceGroup `
        --name $webAppName `
        --only-show-errors
    if ($LASTEXITCODE -ne 0) {
        throw 'Application settings were updated, but the web app restart failed.'
    }

    Write-Host "Custom Photo Avatar is now $enabled for '$webAppName'."
    Write-Host 'Character names were not written to repository or azd environment files.'
}