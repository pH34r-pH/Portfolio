# Scripts map

## Purpose and ownership

`scripts/` contains small source-owned tools that assemble, inspect, and qualify Portfolio inputs and outputs. Python scripts own publication semantics and deterministic bundle checks; Node scripts own browser/runtime and visual interaction audits. Keep reusable rules close to the boundary they validate and avoid embedding deployment policy or scientific claims.

## Key files and relationships

- [`build_portfolio_bundle.py`](build_portfolio_bundle.py) copies canonical Research Notes inputs, adapts MyST HTML, creates readers, and writes `publication.json`.
- [`compiler_projection_input.py`](compiler_projection_input.py), [`compiled_experiment_reference.py`](compiled_experiment_reference.py), and [`compiled_experiment_worklog.py`](compiled_experiment_worklog.py) validate the pinned public Compiler projection and expose declared evidence without synthesizing results.
- [`finish_portfolio_lab.py`](finish_portfolio_lab.py) attaches the committed `publication/lab-return.html` integration to generated JupyterLite output; [`digest_bundle.py`](digest_bundle.py) hashes the finished tree.
- [`test_portfolio_publication.py`](test_portfolio_publication.py) is focused regression coverage for generated readers, links, landmarks, source hashes, and Compiler handoff boundaries.
- [`preflight_env.py`](preflight_env.py) checks Python/Node/browser prerequisites for `publication` and `ux` workloads.
- `ux-audit.mjs`, `interaction-audit.mjs`, `appearance-audit.mjs`, `capture-ux-screenshots.mjs`, and `test-article-runtime.mjs` audit the built public surface. They are presentation evidence, not scientific or deployment authority.
- `docs_hygiene.py` and `test_docs_hygiene.py` implement the bounded changed-file documentation/artifact ratchet used by the separate docs workflow.

The publication flow is source checkouts → pinned projection verification → bundle assembly → generated reader/lab finishing → manifest/schema and digest checks. The UX flow is built site → local server → browser/runtime/accessibility checks → Lighthouse. Neither flow mutates source notebooks or deploys production.

## Invariants and change rules

Use exact source revisions and offline projection bytes. Reject missing, duplicate, wildcard, or mismatched experiment identities. Preserve original notebook/evidence bytes and distinguish declared source records from execution, acceptance, reproduction, and deployment. New checks must be deterministic and narrow; do not make historical warnings block unrelated work. Keep external permissions read-only.

## Authoritative validation

Focused publication validation:

```bash
uv run --no-sync python -m py_compile scripts/build_portfolio_bundle.py scripts/finish_portfolio_lab.py scripts/digest_bundle.py scripts/compiler_projection_input.py
uv run --no-sync python scripts/test_portfolio_publication.py
```

Focused browser syntax/runtime validation:

```bash
node --check site/assets/site.js
node --check site/assets/appearance.js
node --check site/assets/article-runtime.js
node scripts/test-article-runtime.mjs
```

The complete UX and publication commands, including server lifecycle and Lighthouse, live in `.github/workflows/ux-quality.yml` and must remain the full gate for final-head qualification.
