# 2071 interface direction

Portfolio is one research instrument, not a theme gallery. Its visual language extrapolates the broad movement of personal-computing interfaces from 1981 through 2026—flat control surfaces becoming graphical objects, then layered materials, adaptive context, spatial depth, and increasingly direct manipulation—forward to an imagined 2071. The result should feel slightly ahead of the visitor: unfamiliar at first glance, obvious after a few seconds of use.

This is not retro-futurist costume. The future is expressed through behavior, material hierarchy, information density, and machinery that visibly does work.

## Reference lens

These references are source material, not templates.

- **Blade Runner / Blade Runner 2049** — exhausted but credible high technology; immense systems already in motion; interfaces designed as parts of physical machines rather than decorative HUDs; optical depth, hard light, institutional scale, and machinery whose function is legible from its motion.
- **The Fifth Element** — clean-room spectacle: transparent chambers, modular machines, precise transfer mechanisms, and bright industrial processes. The spectacle is the system doing work.
- **Ghost in the Shell** — disciplined investigative interfaces, porous boundaries between cognition and infrastructure, and technical surfaces that expose dependencies, permissions, and state rather than merely implying complexity.
- **Gibson / Pondsmith / Deus Ex / Mr. Robot** — technology embedded in institutions and daily life. Systems have owners, constraints, failure modes, consequences, and histories.
- **Apple interface history, 1981–2026** — increasing physicality, layering, adaptive context, motion continuity, and spatial hierarchy. Borrow the trajectory, not the current rounded-glass vocabulary.
- **visionOS and contemporary spatial interfaces** — use depth only when it communicates hierarchy or relation. Text and controls remain optically stable.
- **contemporary luxury industrial/product UI** — reduction, restraint, excellent type, deliberate empty space, high material quality, and very few effects used very well.

The working synthesis is **private research laboratory above the city**, not street-market neon: field-built competence that has acquired executive restraint.

## Material system

The palette has three material roles.

1. **Optical ceramic** — cold white / blue-white surfaces in light appearance. Clean, nearly shadowless, extremely precise.
2. **Vacuum black** — blue-black instrument cavities and the dark appearance. Black should still contain depth; it is not a flat #000 void.
3. **Sapphire emission** — saturated blue belongs to energy, selection, live computation, focus, and transfer. Blue is emitted state, not decorative paint.

Muted titanium-blue is permitted for inactive structure and metadata. Other accent hues are not part of the product identity. Scientific figures retain source-authored encodings when changing them would alter meaning.

Edges are sharp. Hairline seams, apertures, rails, cages, slots, and machined joins are preferred to rounded cards. Circular geometry is reserved for concepts that are actually circular or continuous, plus the portrait optic.

## Light and dark

Light and dark are environmental appearances of one instrument, not themes.

Light appearance should feel like a daylight clean room: cold white, precise blue structure, minimal shadow.

Dark appearance should feel like the same machine with ambient light removed: blue-black structural material, blue-white text, and brighter sapphire emission. Dark mode may be visually more dramatic, but it must not reveal controls or meaning unavailable in light mode.

## Typography and voice

Display type can be severe, compressed, and architectural. Body text remains highly readable. Monospace belongs to compact machine labels, dates, experiment identities, commands, and exact values—not every piece of text.

The writing voice follows the human-authored tone corpus rather than genre dialogue:

- state the concrete claim first;
- define operational terms when ambiguity matters;
- grant premises and separate what follows from what does not;
- use comparisons, counterexamples, and explicit failure conditions;
- prefer long sentences when the logic actually requires them;
- do not use cyberpunk slang to signal that the site is cyberpunk;
- do not narrate routine UI actions as if they are fictional operations.

The interface should sound like a technologist using an unusually advanced tool, not a character role-playing one.

## Signature model workcell

The reusable model instrument is the site's main spatial object. It shows one stable process:

`text → tokenization → representation/state → model computation → consumer/readout → generated tokens`

The representation is intentionally a manipulable teaching system rather than a claim that a production language model literally has this geometry.

The enhanced path should read as a machine:

- text is segmented into solid token blocks;
- blocks transfer toward an intake aperture with visible mass and timing;
- crossing the intake converts each block into an emitted pulse;
- pulses travel through a three-dimensional volume whose structure changes with the article's model variant;
- pulse intensity expresses the toy activation magnitude;
- the active article region is illuminated while unrelated structure recedes;
- the output stage catches arriving pulses and releases token blocks onto a short conveyor;
- the assembled text updates in synchrony with the arriving blocks.

The same workcell appears across articles. Articles change focus and geometry; they do not invent unrelated decorative visualizations.

Use WebGL because depth, occlusion, morphing geometry, and smooth energy transfer materially improve this explanation. Keep the renderer narrowly scoped; a large 3D framework is not justified for primitive geometry if raw WebGL can preserve the same quality under the existing script budget.

## Visualization rule

A visualization earns space only when it communicates something that prose or a number cannot communicate as efficiently.

Good reasons:
- a mechanism changes under an intervention;
- competing explanations make different geometric or dynamical predictions;
- several linked quantities must be compared at once;
- a dependency or causal structure matters;
- interaction lets the visitor test a meaningful counterfactual.

Bad reasons:
- a value merely gets larger or smaller;
- a representation merely becomes more compact;
- a diagram repeats the labels already present in the paragraph;
- movement exists only to make a quiet page look expensive.

Prefer no figure over an uninformative figure.

## Research topology

The research map is generated from canonical publication metadata. Declared `depends_on` relationships are the only solid dependency edges. Publication chronology may appear as a visibly weaker fallback when older material lacks dependency metadata; chronology must never masquerade as causality.

The current frontier is also metadata-driven and distinguishes:
- observed;
- ruled out;
- open;
- next test.

As research advances, the map and frontier advance with the publication. There is no manually maintained second narrative.

## Motion grammar

Motion should feel like high-speed footage of industrial machinery: smooth, decisive, low-overshoot, and causally timed.

Motion is allowed for:
- transfer;
- transformation;
- state change;
- causal propagation;
- navigation continuity;
- execution.

Motion is not allowed merely to attract attention.

Timing bands:
- control response: roughly 80–160 ms;
- transfer / aperture / navigation: roughly 140–260 ms;
- content reveal: roughly 220–420 ms;
- model geometry morph: roughly 650–1100 ms.

Avoid bounce, elastic springs, idle floating, fake scanline jitter, random glitch, and continuous ambient particles.

Transient text emphasis is optical and must not reflow prose. A word can appear to gain ink, light, or slant as it reaches the reading band, then relax after it passes. Semantic `strong` / `em` remain intact; reduced-motion and print get stable typography.

## Spatial hierarchy

Depth is expensive. Spend it on the model workcell, search/command surface, and transitions where spatial continuity helps the visitor understand state.

Reading surfaces stay flat and calm.

A useful order is:
1. prose / controls — optically fixed;
2. evidence / live state — slightly elevated;
3. model volume / modal instrument — true depth;
4. transition layer — temporary, then gone.

Do not put every card behind glass.

## Page transitions

Cross-document motion is an optical transfer, not a printing effect. The current page should close through a fast aperture / energy gate and the next surface should resolve immediately into the same coordinate system. It should feel cybernetic and expensive while remaining under a few hundred milliseconds.

Native View Transitions are progressive enhancement. Normal navigation remains correct without them.

## Portrait

The portrait is a circular optical identification plate: monochrome source image, restrained sapphire treatment, one precise ring, no avatar-card styling. It is the one persistent human/circular exception inside the sharp-edged system.

## Mobile first

The phone is the canonical composition.

Mobile does not inherit a shrunken desktop visualization:
- research dependencies become vertical records;
- the model workcell becomes a compact vertical machine with a bounded viewport rather than an endless scroll;
- controls remain one-hand reachable;
- prose stays dominant;
- diagrams disclose detail progressively;
- keyboard/desktop layouts add simultaneous spatial context rather than changing the information model.

Avoid using whitespace so aggressively that a phone becomes a sequence of empty screens.

## Search

Use Pagefind over the generated immutable publication. Search is a command surface over articles, concepts, notebooks, experiments, and related metadata; it is not a custom search service.

The interaction must remain useful without keyboard shortcuts. `/` and Cmd/Ctrl+K are accelerators only.

## Provenance

Promote metadata when it helps a reader make a decision:
- publication date;
- research period when materially different;
- experiment identity and current evidence state;
- whether a dependency is declared or chronological.

Keep exact hashes and build receipts available for verification, but do not decorate the interface with meaningless hexadecimal texture.

## Accessibility

Accessibility is a design constraint, not a fallback.

Required:
- semantic HTML before WebGL enhancement;
- complete keyboard paths;
- meaningful text alternatives for spatial explanations;
- no color-only state;
- coarse-pointer targets;
- zoom/reflow;
- forced-colors support;
- reduced-motion behavior that preserves every relationship and action;
- screen-reader announcements only for state changes worth announcing;
- no transient emphasis that changes layout or makes text harder to track.

No aesthetic decision outranks these requirements.

## Quality gates

Automate everything that is objectively testable so review time is reserved for judgment:

- WCAG/axe;
- Lighthouse performance/accessibility/best-practices/SEO budgets;
- Core Web Vitals;
- script / stylesheet / total transfer budgets;
- overflow at phone through ultrawide widths;
- coarse pointer and keyboard behavior;
- light/dark;
- reduced motion and forced colors;
- broken/canonical/cross-site links;
- Pagefind generation and search;
- research topology integrity;
- article model focus and variant metadata;
- WebGL failure fallback;
- generated article/notebook behavior;
- visual regression screenshots for stable reference surfaces.

The remaining manual review is composition, motion feel, information usefulness, and whether the result still looks like one authored instrument.
