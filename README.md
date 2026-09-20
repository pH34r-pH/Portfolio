# Portfolio

Portfolio is the publicly shareable portion of my ongoing research project. It contains selected results, research notes, and executable notebooks documenting both in-progress and completed work, and is hosted as part of my work-in-progress portfolio website. Where practical, notebooks can be run directly in the browser, allowing the underlying experiments and analysis to be inspected, reproduced, and modified.

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
