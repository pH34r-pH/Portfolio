# Portfolio

Portfolio is the publicly shareable portion of my ongoing research project. Its public site is article-centered: reviewed MyST articles explain the work, figures and equations make the reasoning inspectable, and clearly marked teaching cells can run in the browser. The chronological notebooks remain available as source and historical records, with the original code and evidence preserved.

## Publication model

Each published version of Portfolio is an immutable snapshot of the selected articles, notebooks, and assets, including the exact source revisions used to build it. This keeps published results reproducible as the underlying research continues to change, while allowing new work to be added without modifying previous releases. The public research site at `tyharbin.com` and static experiment catalog at `experiments.tyharbin.com` follow the cross-site publication contract in [`design/cross-site-contract.md`](design/cross-site-contract.md).


## Fleet publication handoff

Private [long-haul-fleet](https://github.com/pH34r-pH/long-haul-fleet) selects a full 40-character Portfolio commit SHA on the trusted `main` history. The `Portfolio UX quality` workflow runs on every main push and PR on free public GitHub-hosted runners with `contents: read`; its stable source gate is job `ux`. Fleet requires a completed successful **main push** `ux` run on the exact SHA it stages. Pending, failed, missing, canceled, PR-only, or different-SHA runs cannot authorize publication. UX screenshots are short-lived review evidence, not the deployable package or a passing gate by themselves.

After a passing `ux` job on main, the same workflow's `Public publication candidate` job pins `research-notes` and `theorem-library` main revisions, checks out all three public source commits, and builds the complete static site, MyST article readers and JupyterLite on another free hosted runner. This job has no Azure identity, deployment credential, or private repository access. Its one artifact is a **candidate**, named with the three source SHAs and producer run/attempt and identified by its artifact ID. A later run attempt cannot reuse the earlier candidate's name. The run summary records all three input SHAs and a path/content SHA-256 of the finished bundle. Pull requests run UX review only; they cannot create publication candidates.

`publication.schema.json` version 2 records exactly those three full public source SHAs, article routes, and the hashes of published notebooks. Version 1 remains accepted for existing bundles that also include a Fleet SHA. Fleet's own SHA belongs to its **protected release receipt** for a v2 candidate, because private Fleet code is not a public build input. Before promotion Fleet verifies the exact main `ux` and `bundle` results, each pinned dependency's applicable source checks, the v2 manifest, the requested input revisions, and the downloaded artifact's whole-tree digest. It then deploys those verified bytes and stores a durable rollback copy. A missing or changed source, pending/failed check, or digest mismatch blocks publication and exact-SHA manual retry. The public build does not dispatch private Fleet or publish production. A new candidate is built for each Portfolio main push; publishing a newer dependency alone needs a later exact-input trigger.

## Fleet publication path

The [Fleet workflow and deployed-surface map](https://github.com/pH34r-pH/long-haul-fleet/blob/main/docs/workflow-and-surface-map.md) records the protected path. Portfolio produces a public candidate; Fleet verifies the exact source checks, pinned dependency revisions, candidate manifest, and whole-tree digest before a separate protected production promotion. The latest protected receipt is the source of truth for deployed revisions, artifact ID, digest, and domain probes, so this README does not duplicate those changing values. A public source pass alone never publishes production.

## Article and notebook execution

Articles are the primary reading experience. Their explanatory cells are illustrative and carry explicit activation before code runs. Published notebooks use JupyterLite to run Python directly in the browser, without requiring a local development environment or remote compute. Browser execution has some limitations compared with a conventional Python environment, so notebooks are tested for compatibility before publication; the preserved notebooks remain available to inspect, modify, and rerun.

## Build and qualification environments

The UX audit toolchain is defined by `package.json` and `package-lock.json` (Node 22); its workflow installs Chromium and the required system packages through Playwright. The public bundle toolchain is defined by `pyproject.toml` and `uv.lock` (Python 3.12), including JupyterLite and the publication checks. CI uses `npm ci` and `uv sync --locked`; `scripts/preflight_env.py` checks that installed tools and browser prerequisites are present before each workload. These project files are the dependency authority. Fleet selects exact passing source revisions and artifacts for deployment and does not maintain a second build-tool catalog.

For a local publication environment, run `uv sync --locked --no-dev` and `uv run --no-sync python scripts/preflight_env.py publication`. For UX qualification, run `npm ci`, `npx playwright install --with-deps chromium`, and `python scripts/preflight_env.py ux` with Python 3.12 and Node 22 available.

## Local source layout

- `site/` contains the portfolio website and stable article/archive routes.
- `jupyter-lite.json` configures browser-side notebook execution.
- `publication.schema.json` defines v1 legacy and v2 public candidate metadata.
- `scripts/build_portfolio_bundle.py`, `scripts/finish_portfolio_lab.py` and `scripts/digest_bundle.py` assemble and hash a candidate from three pinned public source checkouts.
- `publication/` contains the generated publication bundle, including notebooks selected for that release.
