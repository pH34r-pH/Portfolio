# Portfolio

Public research publication surface for Tyler J.H.G.

This repository owns presentation code, JupyterLite configuration, and the immutable publication-bundle contract. Production Azure infrastructure, DNS, deployment authority, qualification, and release operations live in the private `pH34r-pH/long-haul-fleet` control plane.

## Publication model

A deployed release is assembled from exact commit SHAs of:

- `pH34r-pH/Portfolio`
- `pH34r-pH/research-notes`
- `pH34r-pH/theorem-library`
- `pH34r-pH/long-haul-fleet`

Fleet copies the qualified notebook set into `publication/notebooks/`, builds JupyterLite, writes `publication.json`, and deploys the resulting static bundle. The deployed site does not fetch mutable notebook content from GitHub at runtime.

## Notebook execution

Published notebooks run in the visitor's browser through JupyterLite. There is no anonymous remote kernel and no path from notebook execution to Fleet credentials, Kestrel, Anchorage, or the Azure control plane.

Not every research notebook is automatically publishable. Fleet qualification is responsible for confirming that the selected notebook is compatible with the browser runtime and contains no private material.

## Local source layout

- `site/` — small public website shell.
- `jupyter-lite.json` — browser-side Jupyter configuration.
- `publication.schema.json` — provenance/publication contract.
- `publication/` — generated publication inputs; notebooks are injected by Fleet.

The source checkout is intentionally incomplete as a deployable release until Fleet supplies an immutable publication bundle.
