# Azure infrastructure

The portfolio uses two Azure resource groups with deliberately different ownership boundaries.

## `rg-portfolio-prod`

Owned by this application. Contains:

- Azure Static Web App (`research-portfolio`)
- user-assigned managed identity (`research-portfolio-github`)
- GitHub OIDC federated credential restricted to `pH34r-pH/portfolio` `refs/heads/main`
- Contributor assignment for that identity scoped only to this resource group

The GitHub identity may update portfolio-owned Azure resources without receiving subscription-wide Contributor access.

## `rg-personal-shared`

Shared personal infrastructure. Initially contains:

- the public Azure DNS zone for the personal domain

The portfolio GitHub identity receives only **DNS Zone Contributor** on the declared zone. It does not receive Contributor on `rg-personal-shared`, so future shared resources placed in the group are not automatically writable by the portfolio deployment identity.

## Why bootstrap is privileged

`main.bicep` is subscription-scoped because it creates resource groups and role assignments. The limited GitHub deployment identity cannot bootstrap or modify its own privilege boundary. This is intentional.

Run `main.bicep` from an administrator-authenticated Azure CLI session for:

- first deployment;
- changes to resource-group ownership;
- changes to role assignments;
- changes to the GitHub federation trust boundary.

Normal application-infrastructure changes inside `rg-portfolio-prod` can subsequently use the GitHub OIDC workflow.

## Domain binding

`custom-domain.bicep` is also subscription-scoped only to coordinate modules in two resource groups. It binds the apex domain to the Static Web App, places the required validation/routing records in the shared DNS zone, then binds `www` through CNAME delegation.

Because domain ownership and shared DNS are rarely changed, this remains an administrator-run operation rather than giving the portfolio identity broad deployment rights over `rg-personal-shared`.

## GitHub variables after bootstrap

Set these repository **variables** (not secrets) from `main.bicep` outputs:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

No client secret is required. The Azure federated credential trusts only the repository's `main` branch. Public pull requests are not given an Azure federation subject.

## Templates

- `main.bicep` — privileged subscription bootstrap and ownership boundary.
- `modules/portfolio-core.bicep` — Static Web App + GitHub managed identity/federation.
- `modules/shared-core.bicep` — Azure DNS zone.
- `modules/portfolio-access.bicep` — portfolio-resource-group Contributor assignment.
- `modules/dns-access.bicep` — zone-scoped DNS Zone Contributor assignment.
- `custom-domain.bicep` — cross-resource-group custom-domain orchestration.
- `modules/custom-domain-*.bicep` — apex binding, DNS records, and `www` binding.

## Validation

`Bicep Validate` compiles every checked-in `.bicep` file without Azure credentials on pushes and pull requests.

`Deploy Portfolio Infrastructure` is intentionally `workflow_dispatch`-only until the first privileged bootstrap has completed and the three Azure identifiers have been installed as repository variables.
