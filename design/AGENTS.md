# Design map

## Purpose and ownership

`design/` records the implemented visual language and the public contract between Portfolio and the Compiler experiment surface. It owns design rationale, schema-level article-reference rules, and cross-site link/identity contracts. It does not own the runtime CSS/JS (those live under `site/assets/`), generated publication output, or a future redesign’s deployment state.

## Key files and relationships

- `README.md` describes the implemented styles, palettes, controls, typography, and audit coverage.
- `cross-site-contract.md` defines shared identity, canonical article URLs, source revisions, and cross-site handoff expectations.
- `article-reference-v1.schema.json` defines the exact article-to-Compiler reference shape consumed by `scripts/compiled_experiment_reference.py` and the bundle builder.
- `title-review.html` and `title-review.css` preserve the comparison exercise; `scripts/render-title-review.mjs` renders it for review. They are evidence of design exploration, not a second production shell.

The hand-authored site runtime implements this documented system. `scripts/appearance-audit.mjs` and the broader UX workflow test actual assembled pages. Open redesign PRs #82 and #78 are explicitly future architecture until merged, qualified, and separately handed off; do not describe their assets or interactions as deployed here.

## Invariants and change rules

Keep style/palette independent, accessible, and local to each site. Decoration must not imply evidence, telemetry, scientific status, or deployment. Preserve the article reference’s exact identity and backlink rules. Update the contract and its focused validation when changing a relationship; do not silently rewrite authorization or publication policy.

## Authoritative validation

```bash
node scripts/render-title-review.mjs
node scripts/appearance-audit.mjs
```

The appearance audit requires the UX environment and a served/assembled site when `PORTFOLIO_AUDIT_URL` is used. The full workflow remains authoritative for final UI qualification; the design documents alone are not a deployment receipt.
