# Portfolio

Hosted research portfolio for the public [`research-notes`](https://github.com/pH34r-pH/research-notes) and [`theorem-library`](https://github.com/pH34r-pH/theorem-library) projects.

The application is intentionally separate from its research content. The deployed site will discover notebook metadata and notebook files from `research-notes` at runtime, so publishing a new research notebook does not require rebuilding or redeploying this repository.

## Target architecture

```text
research-notes ── runtime content ──► portfolio Static Web App
                                         │
theorem-library ───── links ─────────────┤
                                         │
                                  browser-side notebook
                                  execution (JupyterLite)

Azure subscription
├── rg-personal-shared
│   └── Azure DNS zone
└── rg-portfolio-prod
    ├── Azure Static Web App
    └── GitHub deployment managed identity
```

## Infrastructure ownership

This repository owns all Azure configuration required by the portfolio.

- `rg-portfolio-prod` contains portfolio-specific resources.
- `rg-personal-shared` contains resources intended to outlive or be shared by individual personal applications, beginning with the personal Azure DNS zone.
- GitHub Actions authentication uses Azure workload identity federation; no long-lived Azure client secret is required.
- The DNS zone is shared infrastructure, but its declaration and bootstrap currently live here because this is its first consumer. If another personal service later consumes the zone, the shared layer can be extracted without changing the portfolio resource group.

## Deployment phases

### 1. One-time bootstrap

The first deployment must be performed from an already-authenticated Azure CLI session because the GitHub-federated identity does not exist yet.

```bash
az login
az account set --subscription <subscription-id>
az deployment sub create \
  --location westus2 \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json \
  --parameters dnsZoneName=<your-domain>
```

The deployment creates both resource groups, the Static Web App, the GitHub deployment identity, its federated credentials, and least-scope RBAC assignments.

Record these deployment outputs as GitHub repository variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

These are identifiers, not secrets.

### 2. Normal infrastructure changes

After bootstrap, `.github/workflows/infra-whatif.yml` validates pull requests and `.github/workflows/deploy-infra.yml` deploys `main` using GitHub OIDC.

### 3. Custom domain

Domain binding is deliberately a second-stage deployment. Azure Static Web Apps emits a DNS validation token for the apex domain; `infra/custom-domain.bicep` coordinates that token with records in `rg-personal-shared` and then binds `www`.

```bash
az deployment sub create \
  --location westus2 \
  --template-file infra/custom-domain.bicep \
  --parameters portfolioResourceGroupName=rg-portfolio-prod \
               sharedResourceGroupName=rg-personal-shared \
               staticWebAppName=research-portfolio \
               dnsZoneName=<your-domain>
```

## Content boundary

`portfolio` owns presentation, notebook rendering/execution, deployment, and DNS integration. It does not own the research chronology or theorem status.

`research-notes` remains the public educational content source; `theorem-library` remains the public machine-checkable formal source; the private research repository remains authoritative for active experiments and theorem-ledger lifecycle state.
