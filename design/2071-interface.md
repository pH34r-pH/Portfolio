# Portfolio 2071 interface constitution

Status: canonical art direction for the Portfolio redesign.

## Thesis

Portfolio should feel like a research instrument from 2071 that happens to be
accessible through a 2026 browser. It is not a costume UI and it is not a
generic cyberpunk page. The future is communicated through behavior: precision,
speed, physical causality, unusually good information design, and a system that
appears to understand what the reader is doing.

The emotional target is a high-speed camera watching industrial machinery inside
a clean-room lab: sharp, expensive, quiet, exact, and capable of sudden motion.

The public voice remains concrete. Visual luxury must never turn the prose into
luxury-brand fog. Claims use operational language, comparisons, counterexamples,
and explicit boundaries. The interface can be slightly alien; the argument cannot
be vague.

## Reference synthesis

The direction is grounded in source media rather than copying any one visual
surface.

- **Blade Runner / Blade Runner 2049**: believable technology first. Syd Mead's
  objects are convincing because their form implies how they work. Territory
  Studio's 2049 interfaces distinguish class and institutional role through
  technology: degraded LAPD systems versus Wallace Corp's pure, minimal,
  geometric black-and-white surfaces. Portfolio borrows the *causal credibility*
  and the wealthy-system restraint, not rain, grime, or orange fog.
- **The Fifth Element**: interfaces reveal the society and the operator's task.
  Dense controls are acceptable when they do real work. Portfolio borrows the
  energetic machine logic and hard-edged futurism, not comic clutter.
- **Ghost in the Shell / cyberpunk reference corpus**: interfaces are part of
  institutions, permissions, bodies, and failure modes. Technology has a cost
  and a location.
- **Apple 1981–2026**: the long arc moves from visible interface chrome and
  explicit controls toward direct manipulation, coherent layering, fluid
  transitions, adaptive materials, and spatial depth. The 2071 projection is
  therefore *less visible interface and more legible behavior*: surfaces appear
  when needed, light communicates state, depth communicates structure, and
  transitions preserve object identity.
- **Tufte / quantitative-information discipline**: visuals earn their space by
  enabling comparison, revealing mechanism, or exposing evidence. Decoration
  never impersonates data.

Primary public references:
- https://theasc.com/article/blade-runner-set-design/
- https://territorystudio.com/project/blade-runner-2049/
- https://scifiinterfaces.com/2013/06/14/report-card-the-fifth-element/
- https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/
- https://www.apple.com/newsroom/2013/06/10Apple-Unveils-iOS-7/
- https://developer.apple.com/videos/play/wwdc2025/219/
- https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/

## Visual language

### Geometry

Hard edges are the default. Use shallow chamfers, cut corners, rails, slots,
apertures, and precise intersections rather than rounded cards. A radius must
have a mechanical explanation: a round portrait crop, a dial, an optical element,
a physical aperture, or a focus halo.

Avoid stacks of bordered rectangles. Prefer one continuous field divided by
alignment, light, depth, and thin structural rails.

### Light theme

A cold white/blue laboratory:
- near-white with a slight blue cast for the field;
- ink approaching blue-black, never neutral charcoal;
- saturated electric blue as the active signal;
- pale spectral blue for secondary light;
- restrained cyan only where a state needs separation.

The light theme should resemble precision ceramic, glass, anodized metal, and
high-key optical equipment rather than paper.

### Dark theme

Blue light on blue-black:
- background is nearly black with a blue bias;
- text is cool white;
- active state is brighter blue, capable of emissive bloom;
- secondary geometry is visible as low-luminance blue structure;
- true black is reserved for depth and occlusion.

No purple cyberpunk gradient. No decorative pink. No permanent neon glow.
Glow is emitted by active state.

### Typography

Use the narrow display face as the machine voice and large editorial display.
Human reading text remains calm and highly legible. Monospace is metadata,
measurement, and instrument labeling—not a blanket "hacker" texture.

Large display typography may be extreme on wide screens, but mobile composition
must preserve reading velocity rather than create blank-scroll theatre.

## Motion language

Motion is mechanical, not floaty.

- Objects accelerate and settle as though constrained by rails, cams, belts,
  shutters, optical stages, or magnetic actuators.
- Preserve object identity across navigation and state changes.
- Use fast motion with extremely smooth interpolation; visual mass determines
  timing.
- Avoid generic fade-up-on-scroll as the dominant behavior.
- Ambient motion is nearly zero. Activity is triggered by state, computation,
  navigation, reading position, or user input.
- Under `prefers-reduced-motion`, preserve state changes without spatial travel.

### Transient emphasis

Authored emphasis can become temporally active near the reader's approximate
reading position. The text is always semantically bold/italic in the DOM. Visual
weight may rise as the phrase enters the reading band and relax after it passes.
The effect must never cause layout shift and must be absent in reduced-motion,
print, forced-colors, and assistive text alternatives.

## Signature model-machine

The recurring 3D system is a single toy language-model machine shared across the
site. It is a teaching object, not decorative hero media.

Canonical flow:

1. input text enters from the left;
2. token boundaries physically separate into token blocks;
3. token blocks enter the model input assembly;
4. each block becomes a pulse;
5. pulses travel through model structure with intensity encoding the toy
   activation;
6. output components emit token blocks;
7. output tokens travel to the right and assemble into generated text.

Articles do not invent unrelated visual metaphors. They modify this same machine:
highlighting the subsystem under study, replacing a representation, freezing a
stage, adding a probe/readout, changing a consumer, or morphing baseline into the
experimental architecture.

The machine must have:
- a deterministic lightweight fallback;
- keyboard and touch controls;
- a textual state representation;
- reduced-motion behavior;
- bounded GPU/CPU cost;
- explicit pause when offscreen or backgrounded;
- mobile compositions designed independently rather than a scaled desktop camera.

## Research topology

The Research index exposes the real dependency graph generated from publication
metadata. The graph is navigation, not decoration. Nodes represent durable
research objects; edges represent explicit dependency/revision relationships.
Unresolved frontier nodes are first-class.

Every node can expose:
- question;
- current disposition;
- result or strongest surviving claim;
- dependent work;
- canonical article;
- exact experiment package when one exists;
- formal dependencies when present.

A conventional accessible list remains available from the same data.

## Article composition

Each flagship article receives an article-specific transformation of the shared
model-machine or another visualization only when that visual teaches something
non-obvious.

A bespoke visual must do at least one:
1. reveal a mechanism the prose cannot make immediately perceptible;
2. support a meaningful comparison;
3. let the reader manipulate an assumption or intervention;
4. expose evidence topology or uncertainty.

"Information gets smaller" does not qualify.

Published evidence, browser exploration, hypotheses, and formal results use
consistent semantic markers, but explanatory copy should not repeat caveats the
reader can infer from context.

## Navigation and transitions

Navigation should feel cyberpunk-technologist, not print-shop:
- quick aperture/cut transitions;
- scan-line or optical-gate effects only when tied to object transfer;
- article → experiment preserves experiment identity;
- no theatrical preloader;
- no scroll hijacking.

Target transition duration is short enough to feel computational rather than
cinematic. The destination must remain usable if animation fails.

## Personal narrative

About is a causal career story rather than prose résumé:
- production systems carrying tens of billions of dollars monthly;
- current work to drive the end-to-end SLA toward one hour;
- Micro Suite's thousands of evaluations, with ~850 specifically for prompt
  stabilization/model-profile tuning;
- the decision after becoming a parent to spend limited time on work that
  matters rather than remain on the safest trajectory;
- independent research as the continuation of the same habit: attack assumptions,
  measure failure, and keep only what survives.

The portrait is circular and treated as an optical/halftone instrument image,
without obscuring recognition.

## Quality contract

Accessibility has veto power over aesthetics. No exceptions.

The CI target is to mechanize every objective judgement possible:
- WCAG/axe coverage and contrast;
- keyboard/focus behavior;
- forced colors;
- reduced motion;
- touch target size;
- 320px+ overflow;
- mobile interaction;
- Core Web Vitals and asset budgets;
- animation long-task/frame-budget smoke tests where practical;
- WebGL failure/fallback;
- page/background visibility pausing;
- link/canonical integrity;
- article/experiment identity handoff;
- screenshots at phone/tablet/desktop breakpoints;
- deterministic topology generation;
- semantic HTML and metadata.

Human review should be left primarily with taste: composition, pacing, motion
feel, visual hierarchy, and whether a visual genuinely improves understanding.

## Anti-patterns

Reject:
- generic neon cyberpunk;
- fake telemetry;
- ornamental terminal text;
- excessive glass cards;
- permanent glow;
- gratuitous particles;
- custom cursor tricks;
- magnetic buttons;
- slow smooth-scroll spectacle;
- WebGL used only as wallpaper;
- rounded SaaS component libraries;
- ambiguity presented as sophistication;
- three showcase pages surrounded by an ordinary site.

The entire public surface uses this system. Intensity varies by context; quality
does not.
