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

The local clear-glass refinement preserves first-review commit `6659c93`.
It removes blue face tint/absorption, uses transmission 0.99, IOR 1.46 and
thickness 0.58, and keeps opaque native text backing. Front-side rendering avoids
extra per-panel backface draws. A single reused
128px PMREM environment, created only for refraction mode, supplies restrained
reflections. Two actual point lights follow
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

Rendering diagnostics count every pass, including transmission capture. Rings
and housings now share material batches; their positions remain unchanged.
Small beads use lower sphere subdivisions, with all 1,668 source nodes and
3,601 display routes preserved.

| View / mode | First review draws / triangles | Refined draws / triangles |
|---|---:|---:|
| Desktop / refraction | 79 / 361,464 | 26 / 167,220 |
| Phone / refraction | 73 / 214,312 | 22 / 167,036 |
| Desktop / lightweight | — | 17 / 23,700 |
| Phone / lightweight | — | 13 / 23,516 |

Refraction-mode DPR is capped at 1.25 desktop / 1.1 phone. The shared capture
uses scale 0.5 desktop / 0.4 phone, down from 0.75 / 0.5. Antialiasing is off.
The audit now bounds refraction at 32 draws / 180k triangles and lightweight at
24 draws / 30k triangles.

Automatic quality selects lightweight only when an available renderer string
identifies SwiftShader, llvmpipe, softpipe or software rendering. Hidden/unknown
identity is not presumed to be software. Settings offers explicit clear
refraction and lightweight choices. Lightweight retains the beveled 3D volumes,
source-coordinate beads and camera-coherent DOM, with refraction disabled,
8-triangle beads, inset cores omitted and DPR capped at 0.8. The visible label
states “Lightweight glass / refraction off.” It does not pretend to be physically
refractive glass. The PMREM is not created for an initially lightweight scene.

CPU submission/update times and optional disjoint GPU timer queries remain in
`machine.diagnostics()`. CPU submission is not GPU completion. Local software
WebGL lacks that timer. Refraction-mode delivered browser-frame intervals were
about 483ms desktop / 233ms phone, compared with first-review 1,150ms / 367ms.
These captures have different geometry/resolution and are diagnostic evidence
only. They do not predict S23 performance. Smooth physical-device playback and
thermal behavior remain unverified.

`scripts/model-glass-audit.mjs` verifies common-plane alignment, visible relative
motion, keyboard inspection, native page-scale and camera-zoom reflow, axe,
targets, overflow, automatic software selection, explicit quality switching,
new draw/triangle budgets and reduced-motion/WebGL/forced-colors fallbacks. The existing
361-frame replay tests remain unchanged. The small branded favicon correction
has separate static/native/generated-reader asset coverage.

The renderer's `applyFrame(run, state)` boundary and stable component IDs remain
the adapter seam for future recorded or live teaching frames. A smaller live
pedagogical model can prioritize mechanical explanation and smooth visuals;
this phase adds no browser trainer, optimizer animation or research protocol
machinery.
