# Shared-scene glass prototype

This bounded prototype starts from accepted Portfolio head
`152b43e27d70c9f93c382d854e5197f23ce2dc5a` on
`work/2071-shared-scene-glass-prototype`. The accepted preview candidate remains
unchanged. An initial scaffold commit was pushed before the parent requested a
publication hold; subsequent checkpoints stay local and no prototype PR exists.

Three beveled glass volumes share the model's Three.js r186 scene and camera.
Their layout anchors have distinct depths (2.4, 4.6 and 7 scene units). A common
world-plane projection positions native DOM controls on each front face. These
controls are never copied into a texture. A cached camera-pose key avoids DOM
projection work during replay frames that only change lighting or activation.

The material uses transmission 0.90, IOR 1.46 and thickness 0.58. A single reused
128px PMREM environment supplies reflections. Two actual point lights follow
the existing deterministic pulse sampler; there is no bloom, smoke or atmosphere
extension. [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
provides transmission and volume thickness; its optical shader adds pixel cost.
The r186 renderer captures opaque scene objects into one shared transmission
target for the common camera. Ordinary transparent objects are not part of that
capture. This prototype does not attempt smoke-through-glass compositing.

Phone composition shows one native instrument at a time. Reading reflows into
ordinary document sections when projected text becomes too small, a panel would
cross the safe viewport margin, or native browser page scale exceeds 1.15. All
instruments remain available under reduced motion, forced colors and engine or
WebGL fallback. Input text is 16px and control targets are at least 44px after
projection in the tested views. Coordinate inspection focuses the existing
native selector; replay, camera and touch controls retain their baseline paths.

Measured desktop camera shifts move the three instruments approximately 7px,
27px and 66px; the graph origin stays fixed. Phone shifts are about 9px relative
to that origin. Browser bounding rectangles match the corresponding GPU front
planes within 0.6px in desktop, 360px and 320px checks.

Rendering diagnostics count every pass, including transmission capture. The
prototype uses 79 draw calls / 361,464 triangles on desktop and 73 / 214,312 on
phone, while preserving all 1,668 graph nodes and 3,601 display routes. Small
beads use a bounded sphere geometry LOD. Phone DPR is capped at 1.25, with a
0.5-scale transmission capture; desktop capture uses 0.75. The authored audit
allows at most 84 desktop / 78 phone calls when glass is visible; the original
44-call limit remains for views without transmissive panels.

CPU submission/update times and optional disjoint GPU timer queries are exposed
through `machine.diagnostics()`. CPU submission is not GPU completion. Local
software WebGL lacks that timer and is slow: delivered frame intervals were
about 1,150ms desktop and 367ms phone, versus roughly 367ms and 133ms for the
accepted baseline. These diagnostic captures differ in scene composition and
are not physical-device benchmarks. Smooth playback and thermal performance on
a Samsung S23 Ultra remain unverified. The current prototype is a visual review
checkpoint, not a performance-qualified publication candidate.

`scripts/model-glass-audit.mjs` verifies common-plane alignment, visible relative
motion, keyboard inspection, native page-scale and camera-zoom reflow, axe,
targets, overflow and reduced-motion/WebGL/forced-colors fallbacks. The existing
361-frame replay tests remain unchanged. The small branded favicon correction
has separate static/native/generated-reader asset coverage.

The renderer's `applyFrame(run, state)` boundary and stable component IDs remain
the adapter seam for future recorded or live teaching frames. A smaller live
pedagogical model can prioritize mechanical explanation and smooth visuals;
this phase adds no browser trainer, optimizer animation or research protocol
machinery.
