# Model and glass scene contract

The model worker owns `site/assets/model-{machine,scene,topology,light}.js`,
`model-machine.css`, the locked Three.js assets and model audits. The global UI
worker owns glass depth, scroll parallax and consumption of the light contract.
Model host enhancements apply equally to the homepage and generated article
hosts; the publication assembler and export contracts remain authoritative.

## Topology and the 1:1 boundary

`model-topology.js` authors an illustrative fully connected autoencoder:
`48 → 32 → 16 → 8 → 16 → 32 → 48`.

- 200 nodes: the sum of those seven widths. Each has a unique `L{layer}-{index}`
  identifier and a distinct 3D position. Layers are disks in the YZ plane,
  separated by 1.48 visual scene units on X. Radii are
  `[2.12, 1.64, 1.08, 0.49, 1.08, 1.64, 2.12]` visual units.
- 4,352 directed edges: every source/target pair between each adjacent layer,
  with no intra-layer edges or skip links.
  `2 × (48×32 + 32×16 + 16×8) = 4,352`.
- Each node is one rendered mesh instance; each graph edge is one line segment
  in a batched buffer. Frames/chassis/pulse carriers are separate hardware and
  replay illustrations, never counted as graph nodes or edges. The inspector
  adds a highlight overlay of the selected node's existing incident edges.
- There is no aggregation in this graph, including the static SVG fallback.
  The 1:1 claim covers this explicit teaching graph only. The supplied public
  metadata does not contain an exported trained autoencoder/activation graph.
  The topology, signals and scripted reconstruction do not establish trained
  behavior or research measurements.

## Shared light values

Listen on `document` for bubbling `portfolio:model-light`. Read
`window.PortfolioModelLight` for the latest immutable snapshot if the consumer
initializes later. Event detail:

```js
{
  sourceId: "model-machine-title", // host aria-labelledby, varies by article
  frame: 145,                    // integer 0..360, deterministic 60fps table
  energy: 0.0,                   // scalar 0..1, visual teaching signal
  x: 0.5, y: 0.5, depth: 0.5,    // normalized visual scene coordinates 0..1
  active: true,                  // host visible and document foregrounded
  reducedMotion: false
}
```

`sampleModelLight(run, frame, vertical)` is a pure function. Energy is the
maximum mean signal across layers. Position is the signal-weighted graph
position, normalized; mobile swaps flow into the vertical axis. At frames with
no signal, position is centered and energy is zero. Seeking the same prompt,
frame and composition yields identical values, including when rewinding.

The publisher mirrors the four visual fields on the document root:

| Property | Value |
| --- | --- |
| `--model-light-energy` | scalar `0..1` |
| `--model-light-x` | percentage `0%..100%` |
| `--model-light-y` | percentage `0%..100%` |
| `--model-light-depth` | scalar `0..1` |

Playback publications are limited to 30Hz. Explicit seeks and lifecycle changes
publish immediately, so an inspection does not wait for an animation clock.
Identical snapshots are deduplicated. When offscreen/backgrounded, `active` is
false and energy is zero; replay time freezes. Paused visible frames may retain
their sampled light, without a running animation. The publisher adds no timer,
scroll handler, device sensor or independent animation loop.

## Consumer rules

- Use values for restrained highlights/light fields behind accessible DOM.
  Keep text, focus rings and fixed controls stationary and crisp.
- Reduced motion uses discrete sampled state; remove parallax and spatial
  transitions. Forced colors must preserve controls and text independently.
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
