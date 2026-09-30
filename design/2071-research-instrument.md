# 2071 Research Instrument

Portfolio uses one art direction. It is not a theme picker and it is not retro styling applied to a modern page. The interface is a projection: take the dominant trajectory of personal-computing and interface design from 1981 through 2026, then ask what a research workstation might plausibly feel like another forty-five years forward.

## Design trajectory

The reference arc is functional rather than nostalgic:

- **1981–1990:** visible machinery. Interfaces expose the computer as an object with constraints, modes, grids and hard edges.
- **1990–2001:** direct manipulation. Desktop metaphors become more legible and increasingly physical.
- **2001–2013:** rendered material. Aqua-era translucency, lighting and depth use graphics hardware to make controls feel tangible.
- **2013–2020:** content wins. Chrome collapses, typography and information hierarchy become the interface, and responsiveness becomes mandatory.
- **2020–2026:** spatial material. Depth returns as a functional layer; real-time graphics, blur, refraction and motion communicate hierarchy and context rather than decoration. Apple describes its 2025 Liquid Glass system in exactly these terms: optical material and motion are designed together, with content below and controls occupying a responsive layer above it.
- **2071 projection:** the UI stops imitating physical controls and instead behaves like precision optical machinery. State is communicated through light, transformation and geometry. Controls are sparse. The system is fast enough that motion can expose causality without ever feeling theatrical.

References:
- https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- https://developer.apple.com/videos/play/wwdc2025/219/

## Visual language

The default surface is near-white with deep blue ink and a saturated optical-blue signal color. Dark mode is not gray-on-black: it is bright laboratory blue light on nearly black space. Blue is state, energy and active structure.

Geometry stays sharp. Corners are square unless the object itself calls for another form. The portrait is deliberately circular because it is a person, not a panel.

The screen should feel slightly alien but completely usable: closer to watching a high-speed camera inside a clean-room machine than operating a fictional spaceship.

## Motion grammar

Movement must communicate one of four things:

1. **state**
2. **causality**
3. **navigation**
4. **transformation**

Everything else should remain still.

Motion should have very fast settling, low overshoot and physical continuity. The target is industrial machinery recorded at high frame rate: smooth enough that the visitor can inspect what happened.

Generic smooth scrolling, mouse followers, magnetic buttons, looping particles and decorative parallax are out.

prefers-reduced-motion is a first-class rendering mode, not a degraded afterthought.

## Signature object: the model machine

The site uses one persistent conceptual machine for the path from text to generated text:

input text -> token blocks -> representation/state -> consumer/readout -> output tokens

On the homepage it introduces the research program. Inside articles, the same object is focused or transformed as the argument moves through the model. Article headings may explicitly declare a machine stage; otherwise the runtime uses a conservative heading classifier. Future experiment metadata may declare structural transforms so the machine can animate from baseline into the experimental architecture.

The machine is intentionally a conceptual representation. It exists to make architecture and information flow inspectable. It must never invent empirical measurements.

Three.js r180 is vendored and pinned so the published site does not depend on a mutable CDN.

## Research topology

The Research page renders its graph from the publication manifest.

Canonical article metadata may declare a depends_on list of article slugs.

Declared dependencies render as solid links. When no dependency has been declared, chronological continuation may be shown as a dashed link and must not be presented as causal dependence. This means the map updates naturally as articles are added to the publication instead of becoming a second manually maintained research narrative.

## Search

Published bundles are indexed by Pagefind after the static site is assembled. The runtime uses Pagefind when the generated index exists and falls back to the publication manifest in source/preview builds.

This keeps search static, local to the publication and infrastructure-free.

## Articles

Articles have four perceptual modes:

1. **exhibition** — establish the question
2. **explanation** — readable long-form argument
3. **instrument** — manipulate the shared machine or an article-specific figure
4. **source record** — notebook, exact source, experiment package, proof or provenance

Every bespoke visualization must answer a non-obvious question. “This value gets smaller” is not enough reason to build an animation.

Published evidence, browser exploration, hypotheses and formal results may receive distinct visual semantics, but repetitive caveats should not overwhelm the prose. The distinction should be apparent from structure and interaction.

## Transient emphasis

Strong and emphasized prose can become visually active only as it enters the approximate reading band. Semantic HTML remains intact; reduced-motion and print modes render normal emphasis continuously.

The purpose is rhetorical timing: the reader encounters emphasis rather than seeing it telegraphed from several lines away.

## Provenance

Publication date and research status are reader-facing information.

Commit hashes, digests and exact build provenance remain available on demand and in experiment/source surfaces, but they are not decorative UI.

## Mobile first

Phone is the primary composition.

Desktop may expand the research machine and topology, but mobile cannot be the desktop page collapsed into a narrow column. Long empty exhibition gaps are avoided; interactive objects become stepwise vertical compositions; touch targets remain at least 44 CSS pixels; horizontal technical canvases must provide intentional pan/scroll behavior.

## Accessibility

Accessibility has veto power over visual treatment.

Required:
- WCAG AA axe-clean route matrix
- visible keyboard focus
- keyboard-operable interactions
- forced-colors support
- reduced-motion support
- static/textual fallback for WebGL
- no color-only state
- touch target qualification
- no hidden focusable controls
- print-safe research prose and figures
- responsive checks from 320 px through ultrawide displays

## Quality philosophy

The visual system should express the same epistemic stance as the research: attack the idea hard enough that weak explanations fail early.

That means:
- do not decorate weak figures into importance;
- do not animate a claim that does not become clearer through motion;
- do not imply scientific status from appearance;
- do not hide uncertainty behind visual confidence;
- prefer controls, counterexamples and exact comparisons over persuasive flourish.

The goal is not to make the argument look inevitable. The goal is to make it unusually easy to inspect why the surviving argument deserves confidence.
