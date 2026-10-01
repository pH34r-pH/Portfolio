# Portfolio repository map

## Purpose and ownership

Portfolio is the public, source-owned presentation and candidate-builder repository for the research project. It owns the public site shell, article/notebook reader integration, design contracts, publication assembly code, and the evidence needed to hand a candidate to `long-haul-fleet`. It does not own private deployment promotion, experiment execution, scientific acceptance, or the source notebooks and articles in `research-notes`.

This map is current for `main` as of 2026-10-01. The open redesign PRs (#82 and #78) are future architecture and are not deployed state; changes here must remain compatible with the existing publication and handoff path.

## Directory map and change boundaries

- [`publication/`](publication/AGENTS.md) contains the small committed publication-input boundary: the Compiler projection pin, the lab-return integration page, and its contract README. Generated notebooks and `publication.json` are ignored build outputs and must not be added here.
- [`scripts/`](scripts/AGENTS.md) contains source-owned bundle assembly, validation, browser audit, and local preflight tools. Put publication semantics and focused checks here; do not put UI assets or deployment credentials here.
- [`site/`](site/AGENTS.md) contains the hand-authored public shell, stable routes, assets, and committed catalog/evidence inputs. Generated article and notebook readers are assembled into a candidate and are not hand-edited here.
- [`design/`](design/AGENTS.md) contains the implemented visual contract and cross-site interface/schema documents. It is not a second application stylesheet or a proposal to replace the current publication path.
- [`docs/`](docs/portfolio-architecture.md) contains dated review evidence and current process/architecture documentation. A review record is evidence, not deployment authority.
- `.github/workflows/` contains CI orchestration. Existing UX, bundle, and structural gates remain authoritative for their scopes; the documentation workflow is an additive hygiene gate.

## Dependency and data flow

`research-notes` canonical articles and notebooks plus `theorem-library` public inputs are pinned at build time. The locked Compiler projection is read from [`publication/compiler-projection.lock.json`](publication/compiler-projection.lock.json). `scripts/build_portfolio_bundle.py` renders and assembles a candidate, `scripts/digest_bundle.py` provides its content digest, and the publication workflow validates the manifest and generated reader before uploading one candidate artifact. Fleet independently verifies the exact main SHA, checks, source pins, manifest, and digest before protected promotion.

The public browser site consumes committed `site/` inputs and generated candidate readers. UX audits exercise the built site; they do not prove scientific execution or deployment. Compiler records, source-owned research claims, and Fleet release receipts remain authoritative in their owning repositories.

## Invariants and trust boundaries

- Full source revisions, Compiler projection bytes, manifests, and candidate digests are immutable evidence for a particular build; do not replace them with latest/live lookups.
- Preserved notebooks, failed attempts, corpus inputs, release receipts, and generated products must remain available unless their owning lifecycle explicitly authorizes removal.
- A browser audit proves presentation/interaction behavior only. It does not establish experiment execution, acceptance, reproducibility, or production deployment.
- Portfolio CI has public read-only permissions and no Azure, vessel, private Fleet, deployment credential, or secret access. Do not broaden permissions.
- A PR result is review evidence. Only a successful `ux` job on the exact trusted `main` SHA can enter the Fleet handoff; Portfolio itself does not publish production.

## Authoritative contracts and validation

- Public candidate metadata: [`publication.schema.json`](publication.schema.json).
- Article reference shape: [`design/article-reference-v1.schema.json`](design/article-reference-v1.schema.json).
- Cross-site links and ownership: [`design/cross-site-contract.md`](design/cross-site-contract.md).
- Build/runtime dependencies: `package-lock.json`, `uv.lock`, `pyproject.toml`, and `scripts/preflight_env.py`.
- Current process and status: [`docs/portfolio-architecture.md`](docs/portfolio-architecture.md); dated observations remain in [`docs/live-review-2026-09-22.md`](docs/live-review-2026-09-22.md).

Focused checks:

```bash
python3 scripts/docs_hygiene.py --paths README.md AGENTS.md docs/portfolio-architecture.md publication/README.md design/README.md
python3 scripts/test_docs_hygiene.py
```

Publication and reader checks:

```bash
uv sync --locked --no-dev
uv run --no-sync python scripts/preflight_env.py publication
uv run --no-sync python scripts/test_portfolio_publication.py
```

UX qualification (requires Node 22, Python 3.12, and Chromium prerequisites):

```bash
npm ci
npx playwright install --with-deps chromium
python3 scripts/preflight_env.py ux
```

The exact CI workflow commands are the final authority when local prerequisites differ. Before changing a boundary, verify every path and command in the owning scoped map and update the relevant navigation/status documentation in the same change.
