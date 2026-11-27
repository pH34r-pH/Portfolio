# Browser evidence for a Portfolio candidate

Use the completed [Portfolio UX workflow](../.github/workflows/ux-quality.yml)
on an exact reviewed source revision. Retain its candidate artifact ID and
full bundle-tree SHA-256 from the producer run. Download that candidate into
a short local path and keep the files unchanged during review.

From the reviewed capture-tool checkout, use Node 22, Python 3 and the locked
Playwright dependencies. Install the checkout's bundled Chromium if needed.

```sh
npm ci
npx playwright install chromium
node scripts/capture-browser-evidence.mjs \
  --bundle "$CANDIDATE_DIRECTORY" \
  --expected-sha256 "$REVIEWED_TREE_SHA256" \
  --output "$NEW_EVIDENCE_DIRECTORY"
```

The command checks the original candidate's digest before and after capture.
It uses a local loopback server and fresh browser contexts and blocks page
requests to other origins. It exercises the published research index on
phone and desktop viewports in both color schemes, with a fixed locale and
reduced motion. On the phone, it uses the keyboard to open the menu and
checks that Escape closes it and restores focus.

Keep the JSON receipt with each screenshot, paired Playwright ARIA snapshot,
and bounded console and HTTP diagnostics. The receipt binds their digests to the
browser executable, publication manifest, and whole candidate tree. It records
layout, focus, theme, and axe-core checks alongside observational navigation
timing. Requests issued during the accessibility audit have their own log;
the page snapshot and interaction happen before that audit runs.

A failing assertion produces a failure receipt when capture finishes. An
interrupted capture can leave partial files. Keep them with the run log and
use a fresh output directory for a retry. A whole-tree mismatch or missing
receipt leaves the candidate evidence incomplete. Fleet promotion retains
its existing review gate.
