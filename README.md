# Portfolio

Portfolio is the publicly shareable portion of my ongoing research project. It contains selected results, research notes, and executable notebooks documenting both in-progress and completed work, and is hosted as part of my work-in-progress portfolio website. Where practical, notebooks can be run directly in the browser, allowing the underlying experiments and analysis to be inspected, reproduced, and modified.

## Publication model

Each published version of Portfolio is an immutable snapshot of the research selected for that release, including the exact source revisions used to build it. This keeps published results reproducible as the underlying research continues to change, while allowing new work to be added to the portfolio without modifying previous releases.


## Fleet publication handoff

Private [long-haul-fleet](https://github.com/pH34r-pH/long-haul-fleet) selects a full 40-character Portfolio commit SHA on the trusted `main` history. The `Portfolio UX quality` workflow runs on every main push and PR on public GitHub-hosted runners with `contents: read`; its stable release gate is job `ux`. Fleet requires a completed successful **main push** run on the exact SHA it stages. Pending, failed, missing, canceled, PR-only, or different-SHA runs cannot authorize publication. UX screenshots are short-lived review evidence, not the deployable package or a passing gate by themselves.

The pinned source contains `site/**`, `jupyter-lite.json`, `publication.schema.json`, the selected `publication/**` material and build scripts. Fleet pins `research-notes`, `theorem-library` and any other selected inputs **before** a credential-free build, verifies their applicable public checks, records all source SHAs and final artifact SHA-256 in its protected publication receipt, then deploys that same artifact. `publication.schema.json` version 1 requires exact 40-character source commits. A dependency that changes, a failed UX check, or a mismatched package digest blocks promotion and exact-SHA manual retry. See Fleet #176/#177 and Portfolio #24 for the private identity and intake work.

## Notebook execution

Published notebooks use JupyterLite to run Python directly in the browser, without requiring a local development environment or remote compute. Browser execution has some limitations compared with a conventional Python environment, so notebooks are tested for compatibility before publication; when a notebook can be published this way, the same code used to produce the result remains available to inspect, modify, and rerun.

## Local source layout

- `site/` contains the portfolio website.
- `jupyter-lite.json` configures browser-side notebook execution.
- `publication.schema.json` defines the metadata recorded for each published release.
- `publication/` contains the generated publication bundle, including notebooks selected for that release.
