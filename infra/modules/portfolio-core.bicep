targetScope = 'resourceGroup'

@description('Azure region for the portfolio resources.')
param location string

@description('Static Web App resource name.')
param staticWebAppName string

@description('GitHub repository owner used by workload identity federation.')
param githubOwner string

@description('GitHub repository name used by workload identity federation.')
param githubRepository string

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
  tags: {
    project: 'portfolio'
  }
}

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${staticWebAppName}-github'
  location: location
  tags: {
    project: 'portfolio'
    purpose: 'github-oidc-deployment'
  }
}

resource mainFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubOwner}/${githubRepository}:ref:refs/heads/main'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

resource prFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-pull-request'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubOwner}/${githubRepository}:pull_request'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

output staticWebAppDefaultHostname string = swa.properties.defaultHostname
output staticWebAppResourceId string = swa.id
output deploymentPrincipalId string = deploymentIdentity.properties.principalId
output deploymentClientId string = deploymentIdentity.properties.clientId
