# Site map

## Purpose and ownership

`site/` is the hand-authored public shell and stable route surface. It owns navigation, appearance/runtime assets, committed experiment/evidence inputs, and route-level accessibility structure. It does not own generated MyST article pages, generated notebook readers, source notebooks, Compiler scientific records, or Fleet deployment.

## Directory map and data flow

- `index.html`, `about/`, `research/`, `reproduce/`, and `atlas/` are stable hand-authored routes using the shared shell.
- `assets/` contains shared JavaScript, CSS, fonts, and image assets. `site.js`, `appearance.js`, and `article-runtime.js` are loaded by the shell and generated readers as applicable.
- `data/` and `experiments/index.json` are committed public evidence/catalog inputs. Their records must retain source identity and must not imply execution or acceptance beyond their authority.
- `fonts/` contains the bundled long-measure font and its license/provenance documentation; do not replace it with an unreviewed external fetch.

At candidate build time, `scripts/build_portfolio_bundle.py` copies this surface, injects generated article/notebook routes, and applies the same navigation contract to readers. Browser audits serve the assembled site, so source pages and generated pages must keep compatible IDs, routes, landmarks, and controls.

## Invariants and change rules

Keep stable routes and compatibility links unless a reviewed migration explicitly changes them. Preserve high-contrast/forced-colors behavior, keyboard access, focus targets, measured figure appearance, and scientific/evidence boundaries. UI styling must not fabricate telemetry or qualification. Do not alter generated publication assets, article exports, package locks, or the active UX/publish workflow in this documentation pilot.

## Authoritative validation

```bash
node --check site/assets/site.js
node --check site/assets/appearance.js
node --check site/assets/article-runtime.js
node scripts/test-article-runtime.mjs
```

For route, accessibility, responsive, and interaction coverage, run the complete `ux` job in `.github/workflows/ux-quality.yml`; it is the authoritative UI audit and also verifies the built candidate path. `docs/live-review-2026-09-22.md` records observations only and does not override current source behavior or a Fleet receipt.
