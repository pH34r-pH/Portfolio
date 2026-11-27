# CI pipeline

`Portfolio UX quality` (`.github/workflows/ux-quality.yml`) is the only workflow that qualifies a
public build. Fleet publishes only an exact `main` SHA whose run succeeded and whose `ux` and
`Public publication candidate` jobs both succeeded, and that contract is unchanged.

## Shape

```
scope ─┬─ checks ─────────────────────────────────────────────┐
       ├─ record ─┬─ lighthouse ──────────────────────────────┤
       │          ├─ build ("Public publication candidate") ──┼─ ux (gate)
       │          │    ├─ audit × N (parallel, one per audit) ┤
       │          │    └─ pages-copy ─────────────────────────┤
       │          └─ evidence (manual review only)            │
```

| Job | What it proves | Notes |
| --- | --- | --- |
| `scope` | Which jobs and audits this change needs | Rules live in `scripts/select_ux_audits.py` and are unit tested. |
| `checks` | Syntax, unit tests, committed poster provenance | Needs no bundle and no recording. |
| `record` | The homepage recording renders and matches the trained tensors | PR runs reuse a cached recording keyed on its exact inputs. Main always renders fresh. |
| `lighthouse` | Performance, accessibility and transfer budgets on the source site | Runs beside the bundle, not after it. |
| `build` | The exact public bundle assembles and qualifies | On `main` its artifact is the candidate Fleet consumes. Elsewhere it is one-day staging. |
| `audit (name)` | One browser audit against the finished bundle | Every audit runs once, on the bytes that would be published. |
| `pages-copy` | The project-path GitHub Pages copy works | Pull requests and manual runs only. |
| `ux` | Every job this change needed succeeded | See `scripts/require_ux_jobs.py`; a needed job that was skipped fails the gate. |

## Why the audits run once, on the bundle

The previous pipeline ran the whole audit suite twice: against the bare `site/` directory in the
`ux` job, then again against the finished bundle. The bundle is a strict superset (the same pages
plus articles, notebooks and the Lab) and is what ships, so the bundle run is the one that counts.
The audits now run once there, in parallel, rather than serially on one runner.

## The recording cache

`scripts/homepage-media-inputs.mjs` lists exactly the files that determine the recording: the model
scene's import closure, its styles, the weights and the render scripts. UI-only edits (panes, copy,
search, the physical stage) leave the key unchanged and reuse the cached recording. The recording
script verifies on every real render that its page requested nothing outside that list, so the key
cannot silently go stale; bump `PROCEDURE_VERSION` if the CI recording procedure itself changes.

## Not part of the gate

These produce review artifacts rather than assertions and run only on a manual dispatch with
`retain_detailed_evidence` (the `evidence` job):

- native poster recapture (`capture-model-posters.mjs`),
- V2 visual evidence preparation,
- full-page screenshots (`capture-ux-screenshots.mjs`).

The committed posters stay protected by `checks`: `test-model-startup.mjs` fails when any renderer
source changes without a recapture, and verifies the committed assets, hashes and encodings.

## Adding an audit

Add its command to `AUDITS` in `scripts/select_ux_audits.py` and to the scope tuple that should run
it, then extend `test_select_ux_audits.py`. The matrix, the gate and the timing summary pick it up
automatically. Each audit job prints its wall time to the job summary; use that to rebalance.
