# Portfolio appearance

Portfolio uses one art direction: a blue, sharp-edged, mobile-first research instrument that projects long-running technology-interface trends forward toward 2071.

The implementation is intentionally not a theme gallery. Light and dark are environmental appearances of the same system.

## Visual language

- blue / blue-white / near-black blue
- hard edges and exact alignment
- narrow display typography plus compact monospace metadata
- fine structural rules instead of decorative card chrome
- circular geometry only where it carries meaning
- motion that behaves like precise machinery under a high-speed camera
- no faux CRT noise, generic glitch effects, cyberpunk grime, or decorative telemetry

The long-measure face remains the display foundation. Scientific figures keep their authored visual semantics rather than being recolored to match the site.

The fuller design constitution is in [2071-direction.md](2071-direction.md).

## Signature model instrument

`site/assets/model-instrument.js` provides the reusable language-model schematic used by Home and generated articles.

The stable pipeline is:

`input → tokens → representation/state → architecture → consumer/readout → output`

Articles can set `modelFocus` metadata; the generated publication manifest carries the focus and the article shell initializes the same instrument in that state. As the reader moves through article headings, the client can retarget the instrument toward the relevant stage without replacing the underlying model.

The WebGL view is progressive enhancement. A semantic pipeline remains visible when WebGL is unavailable, forced-colors mode suppresses the canvas, and reduced-motion mode disables the continuous animation loop.

## Research topology

The Research page renders its map from `publication.json`.

Canonical article frontmatter may include:

```yaml
model_focus: consumer
model_variant: consumer-probe
depends_on: [012-natural-source-distinctions]
frontier_observed_json: ["The tested distinction is recoverable from the frozen state."]
frontier_open_json: ["Does changing the consumer improve prediction?"]
frontier_next_json: ["Intervene on the consumer under a matched evaluation."]
```

The publication manifest normalizes those fields to `modelFocus`, `modelVariant`, `dependsOn`, and `frontier`. The shared WebGL model morphs from baseline into the declared geometry, while the Research page renders dependency and current-frontier views directly from the same immutable publication metadata.

Declared dependencies are rendered as research edges. When older material has no dependency metadata, the UI may show chronology as a visibly different fallback; chronology is never promoted to a scientific dependency.

## Search

Pagefind builds a static index after publication assembly. Portfolio owns the command/search UI and loads Pagefind only when a visitor searches. There is no search service and no persistent client framework.

The keyboard entry points are `/` and `Cmd/Ctrl+K`.

## Motion and reading

Motion must communicate state, causality, navigation, transformation, or execution.

Strong and emphasized text may receive transient visual emphasis near the approximate reading position. The semantic `strong` and `em` elements remain unchanged, and reduced-motion users receive the stable typographic form.

Cross-document transitions use the native View Transitions mechanism where supported and fall back to ordinary navigation.

## Mobile first

Phone is the canonical composition. Desktop expands information spatially rather than defining the primary layout.

The quality gates cover 320px through ultrawide layouts, coarse pointers, keyboard navigation, reduced motion, forced colors, light/dark appearances, horizontal overflow, and WCAG/axe checks.

## Validation

- `scripts/ux-audit.mjs`: responsive/accessibility matrix
- `scripts/interaction-audit.mjs`: navigation, search, model instrument, generated article/notebook behavior
- `scripts/appearance-audit.mjs`: light/dark persistence and reduced-motion contract
- `lighthouserc.cjs`: performance, accessibility, best-practice, SEO and resource budgets
- Pagefind generation is qualified in `.github/workflows/ux-quality.yml`

`title-review.html` and its renderer are retained only as design-history artifacts from the previous exploration.
