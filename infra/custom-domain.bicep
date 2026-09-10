targetScope = 'subscription'

@description('Portfolio-specific resource group.')
param portfolioResourceGroupName string = 'rg-portfolio-prod'

@description('Shared personal infrastructure resource group.')
param sharedResourceGroupName string = 'rg-personal-shared'

@description('Existing Static Web App name.')
param staticWebAppName string = 'research-portfolio'

@description('Existing Azure DNS zone name and apex hostname.')
param dnsZoneName string

@description('WWW hostname prefix.')
param wwwLabel string = 'www'

module apexBinding 'modules/custom-domain-apex.bicep' = {
  name: 'portfolio-apex-binding'
  scope: resourceGroup(portfolioResourceGroupName)
  params: {
    staticWebAppName: staticWebAppName
    apexHostname: dnsZoneName
  }
}

module dnsRecords 'modules/custom-domain-dns.bicep' = {
  name: 'portfolio-domain-dns'
  scope: resourceGroup(sharedResourceGroupName)
  params: {
    dnsZoneName: dnsZoneName
    wwwLabel: wwwLabel
    apexValidationToken: apexBinding.outputs.validationToken
    staticWebAppDefaultHostname: apexBinding.outputs.staticWebAppDefaultHostname
    staticWebAppResourceId: apexBinding.outputs.staticWebAppResourceId
  }
}

module wwwBinding 'modules/custom-domain-www.bicep' = {
  name: 'portfolio-www-binding'
  scope: resourceGroup(portfolioResourceGroupName)
  params: {
    staticWebAppName: staticWebAppName
    wwwHostname: '${wwwLabel}.${dnsZoneName}'
  }
  dependsOn: [
    dnsRecords
  ]
}

output apexHostname string = dnsZoneName
output wwwHostname string = '${wwwLabel}.${dnsZoneName}'
output staticWebAppDefaultHostname string = apexBinding.outputs.staticWebAppDefaultHostname
