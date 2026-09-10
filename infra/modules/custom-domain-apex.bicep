targetScope = 'resourceGroup'

@description('Existing Static Web App name.')
param staticWebAppName string

@description('Apex hostname to bind.')
param apexHostname string

resource swa 'Microsoft.Web/staticSites@2023-01-01' existing = {
  name: staticWebAppName
}

resource apexCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-11-01' = {
  parent: swa
  name: apexHostname
  properties: {
    validationMethod: 'dns-txt-token'
  }
}

output validationToken string = apexCustomDomain.properties.validationToken
output staticWebAppDefaultHostname string = swa.properties.defaultHostname
output staticWebAppResourceId string = swa.id
