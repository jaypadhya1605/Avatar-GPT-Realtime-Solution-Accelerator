targetScope = 'resourceGroup'

@description('Azure Developer CLI environment name used for runtime build labeling.')
param environmentName string

@description('Primary Azure region for Foundry and monitoring resources.')
param location string

@description('Azure region for the App Service plan and web app.')
param appServiceLocation string

@description('Linux App Service plan SKU.')
param appServiceSku string

@description('Log Analytics retention in days.')
param logRetentionInDays int

@description('Maximum duration of a realtime session in minutes.')
param sessionMaxMinutes int

@description('Enable the Custom Photo Avatar Limited Access Preview.')
param customPhotoAvatarEnabled bool

@description('Custom Photo Avatar character for SCN-001.')
param customPhotoAvatarCharacterScn001 string

@description('Custom Photo Avatar character for SCN-002.')
param customPhotoAvatarCharacterScn002 string

@description('Custom Photo Avatar character for SCN-003.')
param customPhotoAvatarCharacterScn003 string

@description('Common resource tags.')
param tags object

var resourceToken = take(toLower(uniqueString(subscription().id, resourceGroup().id, environmentName)), 10)
var appServicePlanName = 'asp-avatar-gpt-${resourceToken}'
var webAppName = 'app-avatar-gpt-${resourceToken}'
var aiAccountName = 'ai-avatar-gpt-${resourceToken}'
var logAnalyticsName = 'log-avatar-gpt-${resourceToken}'
var applicationInsightsName = 'appi-avatar-gpt-${resourceToken}'
var webAppUri = 'https://${webAppName}.azurewebsites.net'
var voiceLiveEndpoint = 'https://${aiAccountName}.services.ai.azure.com/'
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var foundryUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'
var monitoringMetricsPublisherRoleId = '3913510d-42f4-4e42-8a64-420c390055eb'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    retentionInDays: logRetentionInDays
    sku: {
      name: 'PerGB2018'
    }
    workspaceCapping: {
      dailyQuotaGb: 1
    }
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    DisableLocalAuth: true
    Flow_Type: 'Redfield'
    Request_Source: 'rest'
    WorkspaceResourceId: logAnalytics.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: appServicePlanName
  location: appServiceLocation
  kind: 'linux'
  tags: tags
  sku: {
    name: appServiceSku
    capacity: 1
  }
  properties: {
    reserved: true
    zoneRedundant: false
  }
}

resource webApp 'Microsoft.Web/sites@2024-11-01' = {
  name: webAppName
  location: appServiceLocation
  kind: 'app,linux'
  tags: union(tags, {
    'azd-service-name': 'web'
  })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    clientAffinityEnabled: false
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    serverFarmId: appServicePlan.id
    siteConfig: {
      alwaysOn: true
      appCommandLine: 'bash startup.sh'
      appSettings: [
        {
          name: 'APP_ENV'
          value: 'azure'
        }
        {
          name: 'APP_MODE'
          value: 'azure'
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: webAppUri
        }
        {
          name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
          value: 'Authorization=AAD'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsights.properties.ConnectionString
        }
        {
          name: 'AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_001'
          value: customPhotoAvatarCharacterScn001
        }
        {
          name: 'AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_002'
          value: customPhotoAvatarCharacterScn002
        }
        {
          name: 'AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_003'
          value: customPhotoAvatarCharacterScn003
        }
        {
          name: 'AZURE_CUSTOM_PHOTO_AVATAR_ENABLED'
          value: string(customPhotoAvatarEnabled)
        }
        {
          name: 'AZURE_CUSTOM_PHOTO_AVATAR_MODEL'
          value: 'vasa-1'
        }
        {
          name: 'AZURE_CUSTOM_PHOTO_AVATAR_OUTPUT_PROTOCOL'
          value: 'webrtc'
        }
        {
          name: 'AZURE_VOICELIVE_ENDPOINT'
          value: voiceLiveEndpoint
        }
        {
          name: 'AZURE_VOICELIVE_MODEL'
          value: 'gpt-realtime-1.5'
        }
        {
          name: 'AZURE_VOICELIVE_TRANSCRIPTION_MODEL'
          value: 'azure-speech'
        }
        {
          name: 'BUILD_LABEL'
          value: environmentName
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
        {
          name: 'FRONTEND_DIST_PATH'
          value: 'frontend/dist'
        }
        {
          name: 'OTEL_SERVICE_NAME'
          value: 'avatar-gpt-realtime'
        }
        {
          name: 'PERSIST_RESULTS'
          value: 'false'
        }
        {
          name: 'PYTHONUNBUFFERED'
          value: '1'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'SESSION_MAX_MINUTES'
          value: string(sessionMaxMinutes)
        }
        {
          name: 'WEBSITE_HEALTHCHECK_MAXPINGFAILURES'
          value: '5'
        }
        {
          name: 'WEBSITE_HTTPLOGGING_RETENTION_DAYS'
          value: '7'
        }
      ]
      ftpsState: 'Disabled'
      healthCheckPath: '/healthz'
      http20Enabled: true
      linuxFxVersion: 'PYTHON|3.12'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      webSocketsEnabled: true
    }
  }
}

resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: webApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: webApp
  name: 'scm'
  properties: {
    allow: false
  }
}

resource aiAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: aiAccountName
  location: location
  kind: 'AIServices'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: aiAccountName
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Allow'
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource cognitiveServicesUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiAccount.id, webApp.id, cognitiveServicesUserRoleId)
  scope: aiAccount
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
  }
}

resource foundryUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiAccount.id, webApp.id, foundryUserRoleId)
  scope: aiAccount
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', foundryUserRoleId)
  }
}

resource telemetryPublisherRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(applicationInsights.id, webApp.id, monitoringMetricsPublisherRoleId)
  scope: applicationInsights
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', monitoringMetricsPublisherRoleId)
  }
}

output webAppName string = webApp.name
output webAppUri string = 'https://${webApp.properties.defaultHostName}'
output webAppPrincipalId string = webApp.identity.principalId
output aiAccountName string = aiAccount.name
output voiceLiveEndpoint string = voiceLiveEndpoint