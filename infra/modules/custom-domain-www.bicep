targetScope = 'resourceGroup'

@description('Existing Static Web App name.')
param staticWebAppName string

@description('WWW hostname to bind.')
param wwwHostname string

resource swa 'Microsoft.Web/staticSites@2023-01-01' existing = {
  name: staticWebAppName
}

resource wwwCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-11-01' = {
  parent: swa
  name: wwwHostname
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output validationStatus string = wwwCustomDomain.properties.status
