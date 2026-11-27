# Publication boundary map

## Purpose and ownership

`publication/` is the committed input boundary for the public candidate builder. It owns the exact Compiler projection pin, the static lab-return integration, and the explanation of how generated article/notebook readers are qualified. It does not own generated notebooks, `publication.json`, candidate bundles, Fleet receipts, or source research content.

## Key files and flow

- [`compiler-projection.lock.json`](compiler-projection.lock.json) is the immutable Compiler repository commit and projection SHA-256 consumed by the public workflow.
- [`lab-return.html`](lab-return.html) is a committed integration fragment used by `scripts/finish_portfolio_lab.py` when finishing the generated JupyterLite surface.
- [`README.md`](README.md) documents the MyST adapter, route rewriting, generated-reader boundaries, and candidate-only semantics.
- `publication/notebooks/`, `publication.json`, and `_jupyter-lite/` are generated/ignored outputs. Keep their bytes and provenance in the candidate artifact; do not turn them into hand-authored source.

The flow is: exact public source checkouts and the Compiler lock feed `scripts/build_portfolio_bundle.py`; the generated candidate receives navigation, lab integration, manifest validation, and a whole-tree digest; Fleet later verifies and promotes it under a protected receipt. No file in this directory grants deployment authority.

## Invariants and change rules

Keep the Compiler commit and projection digest paired. Never update one without regenerating and reviewing the other. Preserve source notebook bytes, failed-run evidence, and generated publication boundaries. Do not add secrets, live downloads, mutable catalog copies, or production behavior here. Existing v1/v2 schema compatibility is a contract; changes require the schema and focused publication tests.

## Authoritative validation

```bash
python3 scripts/compiler_projection_input.py --pin publication/compiler-projection.lock.json
uv run --no-sync python scripts/test_portfolio_publication.py
```

The second command is the focused reader/publication gate. The full candidate path is the `Public publication candidate` job in `.github/workflows/ux-quality.yml`; it is the authority for exact pinned checkouts, generated readers, manifest, and artifact qualification.
