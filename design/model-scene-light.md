# Model and glass scene contract

The model worker owns `site/assets/model-{machine,scene,topology,light}.js`,
`model-machine.css`, the locked Three.js assets and model audits. The global UI
worker owns glass depth, scroll parallax and consumption of the light contract.
Model host enhancements apply equally to the homepage and generated article
hosts; the publication assembler and export contracts remain authoritative.

## Source-bound topology and aggregation

Default: `TopologyTransformer`, `condition="unit_hypersphere_depth3"`. The
already-public Compiler source closure at `7bf2e42fe1882e3bed9828b43f4354523fd50bd5`
binds DSL source `82a96cbc5d3da5bd5dfe76e3b1b877be996e5df6`. Its source archive
SHA-256 is `eab904df49ef5f85ef11f12dac065dfa4cad52220d9d8257096513481d5c660f`.
`site/assets/model-architecture.json` records member hashes, architecture identity
and the display counting/aggregation map. No private source, tensors or result
payloads are copied into Portfolio.

The retained implementation and current source were read without numerical
imports, checkpoint loading or training. Both have a 128-wide state, four
32-wide heads, a 512-wide ReLU FFN, one parameter block reused three times,
phase-preserving Hermitian Q/K, causal/time masks, fixed sinusoidal position,
sphere log/exp updates and a 128→256 affine byte head. The current class
constructor and sharing method are AST-identical to the public retained closure;
its recurrent step is now factored into a helper. The display is bound to the
public retained architecture, not a claim that a fresh optimizer run completed.

- 1,664 shown coordinate nodes plus four head operator nodes, for one time slice.
  State 128 → Q/K/V 384 → four folded attention operators → projection/residual/
  norm 128 → ReLU FFN 512 → return/residual/norm 128 → sphere state 128 → byte
  logits 256. Q/K/V coordinates are grouped by their four actual heads.
- 3,601 display routes. The learned dense matrices have 229,376 coordinate
  connections: 384×128 + 128×128 + 512×128 + 128×512 + 256×128.
  Dense links use 8×8 bundles (64 relations/segment). Attention context plus
  output projection uses 32×8 bundles (256 relations/segment). Labels and the
  inspector say **bundled display routes**, not individual learned weights.
- Four attention contexts, their time-dependent causal matrices, arithmetic of
  residuals/LayerNorm and sphere geometry, and frozen spectral/log-polar frontend
  preparation are folded. The recurrence loop means one shared block applied
  three times; three parameter copies are not invented. The decorative hardware
  is excluded from all graph counts.
- Node radii are 0.0595 scene units, 30% smaller than the previous 0.085. Dense
  line thickness is unchanged. Low-poly instanced geometry and batched routes
  keep the complete displayed coordinate graph available on phones.
- Replay has a deterministic 361-frame table, hashed illustrative signals and a
  scripted echo of the first 12 UTF-8 bytes. It does not call the frozen frontend,
  Transformer, optimizer or a scientific inference service. It supplies no
  trained activation, prediction, measurement or current AdamW/Muon evidence.

## Input and accessible controls

The replay timeline, Play/Pause and Rewind remain exposed. Native details/summary
provides a Settings gear panel for frame steps, coordinate/operator inspection,
orbit, zoom, pan and reset. Escape closes Settings and returns its summary focus.
Graph keyboard controls remain available without opening the panel.

Pointer capture is confined to the viewer: one pointer orbits, two pinch and pan,
three horizontal pointers scrub. Every pointer-count change rebases centroid and
pinch distance without applying a delta. Cancel, lost capture, blur and scene
disposal clear/rebase state. Outside the canvas, document touch scrolling remains
native. No OS/global gesture handlers or browser Ctrl-wheel interception are
installed. OS accessibility gestures remain system-owned; pointer emulation does
not establish physical three-finger compatibility on a Samsung device.

## Shared light values

The UI consumes document-root CSS properties directly; no event bus or framework
is needed. `window.PortfolioModelLight` retains the latest immutable snapshot for
inspection and browser tests. Snapshot fields:

```js
{
  sourceId: "model-machine-title", // host aria-labelledby, varies by article
  frame: 145,                    // integer 0..360, deterministic 60fps table
  energy: 0.0,                   // scalar 0..1, visual teaching signal
  x: 0.5, y: 0.5, depth: 0.5,    // normalized viewport light-field coordinates 0..1
  active: true,                  // host visible and document foregrounded
  reducedMotion: false
}
```

`sampleModelLight(run, frame, vertical)` is a pure function. Energy is the
maximum mean signal across layers. Position is the signal-weighted graph
position normalized into a viewport light field; mobile swaps flow into the
vertical axis. These are an artistic field position, not a claim of measured
DOM optical transport. No DOM bounds are measured per replay frame. At frames with
no signal, position is centered and energy is zero. Seeking the same prompt,
frame and composition yields identical values, including when rewinding.

The publisher mirrors the visual fields on the document root. Energy defaults
to zero; X/Y are viewport percentage values for the UI light field:

| Property | Value |
| --- | --- |
| `--model-light-energy` | scalar `0..1` |
| `--model-light-x` | percentage `0%..100%` |
| `--model-light-y` | percentage `0%..100%` |
| `--model-light-depth` | scalar `0..1` |

Playback publications are limited to 30Hz. Explicit seeks and lifecycle changes
publish immediately, so an inspection does not wait for an animation clock.
Identical snapshots are deduplicated. When offscreen/backgrounded or the WebGL scene is disposed, `active` is
false and energy is zero; replay time freezes. Paused visible frames may retain
their sampled light, without a running animation. The publisher adds no timer,
scroll handler, device sensor or independent animation loop.

## Consumer rules

- Use values for restrained highlights/light fields behind accessible DOM.
  Keep text, focus rings and fixed controls stationary and crisp.
- Reduced motion preserves discrete replay inspection in the static graph and
  clears shared light energy; remove parallax and spatial transitions. Forced colors must preserve controls and text independently.
- Scroll depth/parallax belongs to the UI worker and needs no sensor permission.
  Avoid global blur/filter repaint loops or continuous idle GPU work.
- CSS-layer glass lighting is an approximation. It is not physically correct
  reflection/refraction of DOM through WebGL. The model's local point light uses
  the same frame sampler, but that does not prove browser-wide optical transport.
- Material/composition reference: [GMUNK's Windows 10 Desktop](https://gmunk.com/Windows-10-Desktop),
  especially acrylic rim highlights, directed beams and separate atmospheric
  passes. No Microsoft branding or reference-image asset is shipped.

## Verification

`test-model-replay.mjs` checks all 361 forward/rewind states in both compositions,
the graph counts/connectivity and unmodified locked Three.js bytes/license.
`model-machine-audit.mjs` covers browser replay, light determinism, controls,
inspection, mobile caps/targets, fallback, context loss and visibility signals.
The existing UX workflow runs both on the source surface and runs the model
browser audit again on the complete publication candidate. The structural
ratchet excludes only the byte-verified upstream Three.js directory; authored
model code retains all existing thresholds.
