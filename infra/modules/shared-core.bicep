targetScope = 'resourceGroup'

@description('Azure DNS zone name for the personal domain.')
param dnsZoneName string

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: dnsZoneName
  location: 'global'
  tags: {
    scope: 'personal-shared'
  }
}

output dnsZoneName string = dnsZone.name
output dnsZoneResourceId string = dnsZone.id
output nameServers array = dnsZone.properties.nameServers
