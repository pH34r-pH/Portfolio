---
status: current
authority: Portfolio source and CI process map
last_reviewed: 2026-10-01
supersedes: none
---

# Portfolio architecture and handoff

This is the current source-side process map for `main`. It documents what Portfolio can prove and where the next authority begins. Future redesign proposals are not deployed state, and this page does not replace a protected Fleet release receipt.

## Canonical inputs

The canonical article and notebook inputs remain in the pinned `research-notes` checkout selected by the publication workflow. Public theorem references remain owned by `theorem-library`. Compiler experiment identity and declared scientific records are consumed from the exact public projection built from the commit and digest in [`publication/compiler-projection.lock.json`](../publication/compiler-projection.lock.json). The Portfolio repository owns the adapter and manifest, not those upstream records.

The dependency authorities are `package-lock.json`/`package.json` for Node 22 UX tooling and `uv.lock`/`pyproject.toml` for Python 3.12 publication tooling. `scripts/preflight_env.py` checks the selected workload. Updating an input means updating its exact revision and evidence together; “latest” is not a reproducible input.

## Immutable bundle boundary

`scripts/build_portfolio_bundle.py` assembles one candidate from exact public source revisions, preserving notebook bytes and recording their hashes in `publication.json`. The Compiler projection is verified before article references resolve. `scripts/finish_portfolio_lab.py` adds the lab handoff, and `scripts/digest_bundle.py` supplies the whole-tree digest. Generated notebooks, `publication.json`, JupyterLite output, and candidate artifacts are generated products, not hand-authored publication source.

The candidate is review/deployment input only. A successful PR run is not a production authorization. Fleet verifies the exact successful `main` checks, source pins, manifest, artifact identity, and digest, then records protected deployment and rollback evidence in its own repository.

## UI audit evidence

The UX workflow serves the assembled site and runs runtime, route, accessibility, responsive, interaction, appearance, and Lighthouse checks. Screenshots are short-lived review evidence. The audits do not execute experiments, establish scientific acceptance, or prove a production deployment. Dated browser observations in [`live-review-2026-09-22.md`](live-review-2026-09-22.md) remain historical evidence and must be reconciled only against current source or an owning issue/receipt.

## Change and status rules

Current source maps and this page describe `main`; future redesign proposals must be labeled as future architecture until merged and re-qualified. Existing numbered records, scientific IDs, generated products, immutable evidence, and release receipts retain their paths and provenance. Add descriptive living-document names and authority metadata for new process pages. Do not mass-rename stable histories or use a Draft header, age, or absence of a local file as proof that work is obsolete or unimplemented.

Focused documentation checks are `python3 scripts/docs_hygiene.py --paths ...` and `python3 scripts/test_docs_hygiene.py`. Publication and UI validation remain the commands recorded in the scoped `AGENTS.md` maps and their existing workflows.
