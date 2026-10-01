# Managed Chromium font qualification

The managed Chromium 140 browser had zero DOM/canvas metrics for default system
font mappings. Identical 360×800 inputs on draft82 `ade82d862bf0e4491ed792852b78d1d5700ef550`
and integration `a2cc9deb7bddad48c26d4963aed9e3b7d4611720` reproduce the fault:
body copy and CTA text have zero width/height, while display-font headings paint.
Computed visibility is visible and opacity is 1 on both revisions. The minimal
redirect fixture has zero stylesheets and a 0px heading on both, ruling out
Portfolio CSS as its cause.

The QA process uses `FONTCONFIG_FILE=/tmp/portfolio-fontconfig.conf`, with font
discovery confined to `/usr/share/fonts/truetype/dejavu`, writable cache
`/tmp/portfolio-font-cache`, and ordinary DejaVu sans/mono aliases. This is an
execution-environment override; production CSS/runtime font detection is not
changed. The sibling runtime-detector commit `4498bc8` is excluded.

Under the corrected configuration, the same body paragraph is 340×215px on both
revisions, CTA text has 75×10px metrics, and the unchanged fixture heading is
344×76px and passes the original visibility assertion. `document.fonts.check`
is not accepted as painting evidence. Browser audits additionally assert
nonzero text ranges for body copy, CTAs, descriptions, menu and topology labels.
The phone Search button intentionally uses a font-size-zero text label with a
visible pseudo-element icon, so its DOM text range is not a body-text test.

Read-only comparison evidence is retained at
`/workspace/scratch/font-comparison/comparison.json` with baseline/integrated
screenshots under both configurations. Final screenshots must come from the
corrected environment and the exact finished publication bundle.
