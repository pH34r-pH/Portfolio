# Portfolio

Portfolio is the publicly shareable portion of my ongoing research project. It contains selected results, research notes, and executable notebooks documenting both in-progress and completed work, and is hosted as part of my work-in-progress portfolio website. Where practical, notebooks can be run directly in the browser, allowing the underlying experiments and analysis to be inspected, reproduced, and modified.

## Publication model

Each published version of Portfolio is an immutable snapshot of the research selected for that release, including the exact source revisions used to build it. This keeps published results reproducible as the underlying research continues to change, while allowing new work to be added to the portfolio without modifying previous releases.

## Notebook execution

Published notebooks use JupyterLite to run Python directly in the browser, without requiring a local development environment or remote compute. Browser execution has some limitations compared with a conventional Python environment, so notebooks are tested for compatibility before publication; when a notebook can be published this way, the same code used to produce the result remains available to inspect, modify, and rerun.

## Local source layout

- `site/` — small public website shell.
- `jupyter-lite.json` — browser-side Jupyter configuration.
- `publication.schema.json` — provenance/publication contract.
- `publication/` — generated publication inputs; notebooks are injected by Fleet.

The source checkout is intentionally incomplete as a deployable release until Fleet supplies an immutable publication bundle.
