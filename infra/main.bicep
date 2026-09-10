targetScope = 'subscription'

@description('Azure region used for portfolio resources and deployment metadata.')
param location string = 'westus2'

@description('Portfolio-specific resource group.')
param portfolioResourceGroupName string = 'rg-portfolio-prod'

@description('Shared personal infrastructure resource group.')
param sharedResourceGroupName string = 'rg-personal-shared'

@description('Static Web App resource name.')
param staticWebAppName string = 'research-portfolio'

@description('Azure DNS zone name. Supply the registered personal domain at deployment time.')
param dnsZoneName string

@description('GitHub owner used for workload-identity federation.')
param githubOwner string = 'pH34r-pH'

@description('GitHub repository used for deployment federation.')
param githubRepository string = 'portfolio'

resource portfolioRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: portfolioResourceGroupName
  location: location
  tags: {
    project: 'portfolio'
    scope: 'application'
  }
}

resource sharedRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: sharedResourceGroupName
  location: location
  tags: {
    scope: 'personal-shared'
  }
}

module portfolioCore 'modules/portfolio-core.bicep' = {
  name: 'portfolio-core'
  scope: resourceGroup(portfolioRg.name)
  params: {
    location: location
    staticWebAppName: staticWebAppName
    githubOwner: githubOwner
    githubRepository: githubRepository
  }
}

module sharedCore 'modules/shared-core.bicep' = {
  name: 'personal-shared-core'
  scope: resourceGroup(sharedRg.name)
  params: {
    dnsZoneName: dnsZoneName
  }
}

module portfolioAccess 'modules/portfolio-access.bicep' = {
  name: 'portfolio-access'
  scope: resourceGroup(portfolioRg.name)
  params: {
    principalId: portfolioCore.outputs.deploymentPrincipalId
  }
}

module sharedDnsAccess 'modules/dns-access.bicep' = {
  name: 'shared-dns-access'
  scope: resourceGroup(sharedRg.name)
  params: {
    principalId: portfolioCore.outputs.deploymentPrincipalId
    dnsZoneName: dnsZoneName
  }
  dependsOn: [
    sharedCore
  ]
}

output staticWebAppName string = staticWebAppName
output staticWebAppDefaultHostname string = portfolioCore.outputs.staticWebAppDefaultHostname
output dnsZoneName string = sharedCore.outputs.dnsZoneName
output azureClientId string = portfolioCore.outputs.deploymentClientId
output azureTenantId string = tenant().tenantId
output azureSubscriptionId string = subscription().subscriptionId
