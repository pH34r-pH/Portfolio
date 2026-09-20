# Portfolio

Portfolio is the publicly shareable portion of my ongoing research project. It contains selected results, research notes, and executable notebooks documenting both in-progress and completed work, and is hosted as part of my work-in-progress portfolio website. Where practical, notebooks can be run directly in the browser, allowing the underlying experiments and analysis to be inspected, reproduced, and modified.

## Publication model

Each published version of Portfolio is an immutable snapshot of the research selected for that release, including the exact source revisions used to build it. This keeps published results reproducible as the underlying research continues to change, while allowing new work to be added to the portfolio without modifying previous releases.

## Notebook execution

Published notebooks run in the visitor's browser through JupyterLite. There is no anonymous remote kernel and no path from notebook execution to Fleet credentials, Kestrel, Anchorage, or the Azure control plane.

Not every research notebook is automatically publishable. Fleet qualification is responsible for confirming that the selected notebook is compatible with the browser runtime and contains no private material.

## Local source layout

- `site/` — small public website shell.
- `jupyter-lite.json` — browser-side Jupyter configuration.
- `publication.schema.json` — provenance/publication contract.
- `publication/` — generated publication inputs; notebooks are injected by Fleet.

The source checkout is intentionally incomplete as a deployable release until Fleet supplies an immutable publication bundle.
