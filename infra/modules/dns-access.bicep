targetScope = 'resourceGroup'

@description('Principal ID of the GitHub deployment managed identity.')
param principalId string

@description('Existing Azure DNS zone name.')
param dnsZoneName string

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' existing = {
  name: dnsZoneName
}

var dnsZoneContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'befefa01-2a29-4197-83a8-272ff33ce314'
)

resource dnsZoneAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(dnsZone.id, principalId, dnsZoneContributorRoleDefinitionId)
  scope: dnsZone
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: dnsZoneContributorRoleDefinitionId
  }
}
