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

## GitHub Pages review and deployment

The GitHub Pages build starts from the same qualified public bundle as Fleet. A Pages-only copy rewrites root-relative site URLs for the repository project path (`/Portfolio/`); the immutable Fleet candidate is not rewritten. Published notebook source files keep their recorded bytes and digests. Canonical URLs continue to use `tyharbin.com`, external experiment links continue to use `experiments.tyharbin.com`, and the Pages copy contains no `CNAME` file.

Every pull request builds and browser-checks that project-path copy, then uploads it as a short-lived `portfolio-pages-Portfolio-*` review artifact. The check covers deep article links, a PDF export, internal asset loading, the interactive model, mobile navigation, reduced motion, JupyterLite notebook file access, and in-browser Python execution without cross-origin isolation headers. The existing accessibility, interaction, and Lighthouse transfer budgets remain in force.

After reviewing the artifact and merging the change, run **Portfolio UX quality** manually on `main`. Leave the `deploy_pages` input unchecked to build another review artifact. Check it only when ready to publish. The deployment job uses the same run's tested artifact and refuses to deploy unless GitHub reports the default `github.io/Portfolio` URL and `/Portfolio` path. If Pages is not already configured for GitHub Actions, set that publishing source in repository Pages settings first. No custom domain or DNS change is part of this workflow.

GitHub documents a 1 GB maximum for a published Pages site and a 10 GB maximum for the uploaded Pages tar artifact. The preparation step enforces the documented published-site ceiling. The page transfer budget is 10 MB: up to 9,000,000 bytes passes, 9,000,001–10,000,000 bytes warns, and more than 10,000,000 bytes blocks. Performance scores and timing are observations while the visual quality bar is established; accessibility and layout stability remain required.

## Article and notebook execution

### Trained article language model

The article viewer performs local inference in a Web Worker. It loads only after
reader intent, verifies the SHA-256 of `site/assets/lm/unit-hypersphere.f32`, and
never sends prompts to a server. The manifest records the trained state,
frontend, original checkpoint, and frozen implementation identities. This is
the historical AdamW unit-hypersphere baseline (seed 17, 128 training steps),
with a 128-byte rolling context. It is a small research byte LM; continuations
can be repetitive or incoherent. It does not reproduce an article's specific
intervention, probe, optimizer comparison, or scientific result.

`model-inference.js` implements the frozen frontend and shared three-pass
forward computation. `model-lm-worker.js` generates bytes from real logits;
`article-lm-session.js` retains 22 intermediate observations per generated byte.
The scene, timeline, coordinate readout, and probability pane consume those
observations. Brightness normalizes magnitude per layer; raw signed values
remain inspectable. Dark means uncomputed at that observation. Attention
operators display actual head-context RMS; dense links remain structural
bundles. The baseline is common across articles and is labeled accordingly.

Hide cancels generation and pauses rendering. Unpin restores document flow.
Follow article uses generated heading hints and a shared `model-context.js`
mapping for component emphasis, camera framing, and recommended glass pane.
The focused native pane stays alongside the graph on desktop and below it on
phones, inside the same sticky reader. Secondary generation controls and byte
inspection live in Settings. Input, Coordinate and Output remain selectable.
Manual inspection pauses following. These presentation preferences last for the
browser session. Reduced-motion/forced-color readers can explicitly load the
LM while keeping a static, inspectable view. Generation also works when WebGL
is unavailable.

To reproduce the exported tensors, install PyTorch and NumPy in an isolated
environment and run the exporter against the retained owner checkpoint and
the frozen public experiment package:

```sh
python scripts/export_article_lm.py --help
python scripts/export_article_lm.py \
  --checkpoint /retained/unit_hypersphere_depth3-seed-17.pt \
  --frontend /public-package/experiment/input/data/spectral.pt \
  --historical-result /public-package/experiment/input/data/issue_164_results.json \
  --source /frozen/domain-scaling-lab
node scripts/test-model-inference.mjs
```

The exporter rejects mismatched source hashes and trained-state identities. It
exports only inference tensors and original-source reference observations, not
training data, optimizer state, credentials, or private experiment directories.
The original owner research checkpoint is retained outside this repository;
its public historical-result fingerprint is the provenance check. Existing
repository licensing applies to owner code; no third-party weight license is
reassigned.

The homepage uses `scripts/build-homepage-loop.mjs` to render the same production
Three.js scene from this verified kernel into a 1920 × 1920, 30 fps VP9 recording
and high-quality poster. Install locked npm tooling, Chromium, and ffmpeg first.
The homepage performs no inference and loads no Three.js runtime. Recording
metadata distinguishes real tensors from retimed presentation. Background
playback can be paused; quiet preferences retain the poster. The bounded grid
keeps its background above contact/footer. The page budget is 10 MB; media has
an 8 MB cap to reserve room for other page assets.

`test-model-inference.mjs` compares logits and every observed stage with the
frozen original PyTorch implementation. `article-model-sticky-audit.mjs` tests
actual assembled article inference, section following, presentation controls,
accessibility and transfer size. Historical model-machine/glass component
audits use explicitly marked illustrative fixtures for deterministic renderer
and gesture regression only; they cannot qualify production inference.

Articles are the primary reading experience. Their explanatory cells are illustrative and carry explicit activation before code runs. Published notebooks use JupyterLite to run Python directly in the browser, without requiring a local development environment or remote compute. Browser execution has some limitations compared with a conventional Python environment, so notebooks are tested for compatibility before publication; the preserved notebooks remain available to inspect, modify, and rerun.

Notebook readers label an example illustrative only when its source publication metadata says so. They expose the exact source revision, preserved download and notebook digest, without inferring execution or scientific acceptance from recorded outputs. Opening or running a notebook alone does not establish independent reproduction. The linked Compiler catalog owns authoritative experiment records and their scientific checks; a catalog link does not assert that an exact package exists for this notebook. The read-only reader remains available when browser execution cannot run.

## Build and qualification environments

The UX audit toolchain is defined by `package.json` and `package-lock.json` (Node 22); its workflow installs Chromium and the required system packages through Playwright. The public bundle toolchain is defined by `pyproject.toml` and `uv.lock` (Python 3.12), including JupyterLite and the publication checks. CI uses `npm ci` and `uv sync --locked`; `scripts/preflight_env.py` checks that installed tools and browser prerequisites are present before each workload. These project files are the dependency authority. Fleet selects exact passing source revisions and artifacts for deployment and does not maintain a second build-tool catalog.

For a local publication environment, run `uv sync --locked --no-dev` and `uv run --no-sync python scripts/preflight_env.py publication`. For UX qualification, run `npm ci`, `npx playwright install --with-deps chromium`, and `python scripts/preflight_env.py ux` with Python 3.12 and Node 22 available.

## Local source layout

- `site/` contains the portfolio website and stable article/archive routes.
- `jupyter-lite.json` configures browser-side notebook execution.
- `publication.schema.json` defines v1 legacy and v2 public candidate metadata.
- `scripts/build_portfolio_bundle.py`, `scripts/finish_portfolio_lab.py` and `scripts/digest_bundle.py` assemble and hash a candidate from three pinned public source checkouts.
- `publication/` contains the generated publication bundle, including notebooks selected for that release.

### Exact article experiment references

An article may declare `compiled_experiment: {ref: exact-package-id}` in its
canonical MyST YAML frontmatter. The optional `expected` object asserts `sha256`,
`profile`, or the complete `source: {repository, commit}`; it does not supply
replacement scientific metadata. Reference v1 uses Compiler's public projection
v2, documented by `design/article-reference-v1.schema.json`.

Build referenced articles with `--compiler-projection /path/to/experiments.json`
and `--compiler-projection-pin publication/compiler-projection.lock.json`.
These inputs must be provided together. The pin identifies an immutable public
Compiler source commit and the SHA-256 of its generated projection bytes.
Before resolving an article, the assembler checks the exact bytes, projection
schema version and Compiler authority, then holds the verified data in memory.
The build performs no network lookup, internal Compiler import, CI lookup or
credential access. It rejects unavailable, duplicate, latest or wildcard IDs,
invalid package identity and unsafe or mismatched detail links. Compiler must
also declare a backlink to the exact `https://tyharbin.com/articles/{slug}/`
article URL and the pinned Research Notes source commit. Missing relationships
or failed expected assertions block publication. Articles without a reference
need no projection and retain their existing publication behavior.

The existing article reader links to Compiler's exact detail route; the
publication manifest retains the reference, without creating a local catalog or
copying results. The handoff distinguishes a reference from execution,
scientific acceptance, package integrity and independent reproduction. Missing
qualification remains unknown. Tests use a synthetic article relationship and
the shared public contract fixture; no real article relationship or Muon claim
is introduced. Real bindings require separately reviewed source-owned backlinks
and a pinned public projection supplied to the publication build.

The existing `Public publication candidate` job checks out the Compiler commit
from `publication/compiler-projection.lock.json`, confirms the checkout SHA,
and invokes Compiler's own static-site builder. That builder assembles public
packages and metadata; it does not execute experiment members or reproduce
science. The assembler consumes only the resulting public `data/experiments.json`
and verifies its committed digest. A missing or changed projection blocks the
candidate even when the articles have no experiment references. No mutable
live-site download, private credential or successful Compiler CI run is a build
input. Updating the Compiler input requires reviewing a new source commit and
regenerating its exact projection digest together.

`publication.json` records this input in optional `compilerProjection` metadata
(repository, exact commit, projection SHA-256 and projection schema version).
The existing three `sources` entries and candidate naming remain unchanged;
the Portfolio source commit pins the Compiler lock file. The projection is not
republished as a second catalog. Legacy/local builds without either Compiler
input remain supported for articles without references. Existing unreferenced
article bytes stay unchanged. The receipt records input identity, not scientific
qualification, independent reproduction or deployment authorization.


The article handoff also presents a compact evidence block from that same
verified public record: exact package and scientific-source identity, declared
question/method, execution attempts and retained result member references,
source-owned interpretation, and the complete protocol text when available.
Long protocols and result inventories expand on request. Missing declarations
remain unavailable; active, failed and completed attempts retain their own
labels. A source-reported acceptance check stays separate from execution,
package integrity and independent reproduction. Source text is escaped, malformed
records fail publication, and numeric metrics are not synthesized or defaulted.
