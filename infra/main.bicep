targetScope = 'subscription'

@description('Azure Developer CLI environment name used for tags and deterministic resource names.')
@minLength(1)
@maxLength(30)
param environmentName string

@description('Primary Azure region. East US 2 supports the default Voice Live model and Custom Photo Avatar creation at publication time.')
param location string = 'eastus2'

@description('Azure region for App Service. Defaults to the primary region.')
param appServiceLocation string = location

@description('Resource group name. Override when an organization enforces a naming convention.')
param resourceGroupName string = 'rg-avatar-gpt-${environmentName}'

@description('Linux App Service plan SKU. B1 is the smallest baseline with Always On support.')
param appServiceSku string = 'B1'

@description('Log Analytics retention in days.')
@minValue(30)
@maxValue(730)
param logRetentionInDays int = 30

@description('Maximum duration of a realtime session in minutes.')
@minValue(1)
@maxValue(60)
param sessionMaxMinutes int = 15

@description('Enable Custom Photo Avatar. This Limited Access Preview stays disabled by default.')
param customPhotoAvatarEnabled bool = false

@description('Custom Photo Avatar character for scenario SCN-001. Leave empty while Preview is disabled.')
param customPhotoAvatarCharacterScn001 string = ''

@description('Custom Photo Avatar character for scenario SCN-002. Leave empty while Preview is disabled.')
param customPhotoAvatarCharacterScn002 string = ''

@description('Custom Photo Avatar character for scenario SCN-003. Leave empty while Preview is disabled.')
param customPhotoAvatarCharacterScn003 string = ''

var tags = {
  application: 'Avatar GPT Realtime Solution Accelerator'
  dataClassification: 'SyntheticOnly'
  environment: environmentName
  managedBy: 'azd'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources './resources.bicep' = {
  name: 'avatar-gpt-${uniqueString(environmentName, resourceGroupName)}'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    appServiceLocation: appServiceLocation
    appServiceSku: appServiceSku
    customPhotoAvatarCharacterScn001: customPhotoAvatarCharacterScn001
    customPhotoAvatarCharacterScn002: customPhotoAvatarCharacterScn002
    customPhotoAvatarCharacterScn003: customPhotoAvatarCharacterScn003
    customPhotoAvatarEnabled: customPhotoAvatarEnabled
    logRetentionInDays: logRetentionInDays
    sessionMaxMinutes: sessionMaxMinutes
    tags: tags
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_AI_ACCOUNT_NAME string = resources.outputs.aiAccountName
output AZURE_VOICELIVE_ENDPOINT string = resources.outputs.voiceLiveEndpoint
output SERVICE_WEB_NAME string = resources.outputs.webAppName
output SERVICE_WEB_URI string = resources.outputs.webAppUri
output WEB_APP_PRINCIPAL_ID string = resources.outputs.webAppPrincipalId