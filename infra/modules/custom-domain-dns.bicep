targetScope = 'resourceGroup'

@description('Existing Azure DNS zone name.')
param dnsZoneName string

@description('Label used for the WWW record.')
param wwwLabel string = 'www'

@description('TXT validation token emitted by Static Web Apps for the apex custom domain.')
param apexValidationToken string

@description('Static Web App default hostname.')
param staticWebAppDefaultHostname string

@description('Static Web App resource ID used for the apex alias record.')
param staticWebAppResourceId string

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' existing = {
  name: dnsZoneName
}

// Static Web Apps' DNS-token flow uses the _dnsauth.www label for apex
// ownership validation when the apex and www bindings are coordinated.
resource apexTxtRecord 'Microsoft.Network/dnsZones/TXT@2018-05-01' = {
  parent: dnsZone
  name: '_dnsauth.${wwwLabel}'
  properties: {
    TTL: 300
    TXTRecords: [
      {
        value: [
          apexValidationToken
        ]
      }
    ]
  }
}

resource wwwCnameRecord 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: dnsZone
  name: wwwLabel
  properties: {
    TTL: 300
    CNAMERecord: {
      cname: staticWebAppDefaultHostname
    }
  }
}

resource apexAliasRecord 'Microsoft.Network/dnsZones/A@2018-05-01' = {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 300
    targetResource: {
      id: staticWebAppResourceId
    }
  }
}

output apexValidationRecordName string = apexTxtRecord.name
output wwwRecordName string = wwwCnameRecord.name
output apexRecordName string = apexAliasRecord.name
