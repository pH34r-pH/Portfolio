# Portfolio

Portfolio is the publicly shareable portion of my ongoing research project. It contains selected results, research notes, and executable notebooks documenting both in-progress and completed work, and is hosted as part of my work-in-progress portfolio website. Where practical, notebooks can be run directly in the browser, allowing the underlying experiments and analysis to be inspected, reproduced, and modified.

## Publication model

Each published version of Portfolio is an immutable snapshot of the research selected for that release, including the exact source revisions used to build it. This keeps published results reproducible as the underlying research continues to change, while allowing new work to be added to the portfolio without modifying previous releases.


## Fleet publication handoff

Private [long-haul-fleet](https://github.com/pH34r-pH/long-haul-fleet) selects a full 40-character Portfolio commit SHA on the trusted `main` history. The `Portfolio UX quality` workflow runs on every main push and PR on free public GitHub-hosted runners with `contents: read`; its stable source gate is job `ux`. Fleet requires a completed successful **main push** `ux` run on the exact SHA it stages. Pending, failed, missing, canceled, PR-only, or different-SHA runs cannot authorize publication. UX screenshots are short-lived review evidence, not the deployable package or a passing gate by themselves.

After a passing `ux` job on main, the same workflow's `Public publication candidate` job pins `research-notes` and `theorem-library` main revisions, checks out all three public source commits, and builds the complete static site, notebook readers and JupyterLite on another free hosted runner. This job has no Azure identity, deployment credential, or private repository access. Its one artifact is a **candidate**, identified by the producer run/attempt and artifact ID. The run summary records all three input SHAs and a path/content SHA-256 of the finished bundle. Pull requests run UX review only; they cannot create publication candidates.

`publication.schema.json` version 2 records exactly those three full public source SHAs and the hashes of published notebooks. Version 1 remains accepted for existing bundles that also include a Fleet SHA. Fleet's own SHA belongs to its **protected release receipt** for a v2 candidate, because private Fleet code is not a public build input. Before promotion Fleet must verify the exact main `ux` and `bundle` results, each pinned dependency's applicable source checks, the v2 manifest, the requested input revisions, and the downloaded artifact's whole-tree digest. It then deploys those verified bytes and stores a durable rollback copy. A missing or changed source, pending/failed check, or digest mismatch blocks publication and exact-SHA manual retry. The public build does not dispatch private Fleet or publish production. For now a new candidate is built for each Portfolio main push; publishing a newer dependency alone needs a later exact-input trigger. See Fleet #176–#178 and Portfolio #24.

## Notebook execution

Published notebooks use JupyterLite to run Python directly in the browser, without requiring a local development environment or remote compute. Browser execution has some limitations compared with a conventional Python environment, so notebooks are tested for compatibility before publication; when a notebook can be published this way, the same code used to produce the result remains available to inspect, modify, and rerun.

## Local source layout

- `site/` contains the portfolio website.
- `jupyter-lite.json` configures browser-side notebook execution.
- `publication.schema.json` defines v1 legacy and v2 public candidate metadata.
- `scripts/build_portfolio_bundle.py`, `scripts/finish_portfolio_lab.py` and `scripts/digest_bundle.py` assemble and hash a candidate from three pinned public source checkouts.
- `publication/` contains the generated publication bundle, including notebooks selected for that release.
