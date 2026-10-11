# Native rendering and inference selection

Rendering and inference select their backends independently:

| Work | Selection |
|---|---|
| Homepage recorded tensors and article scene | WebGPU with 4x MSAA at native DPR; WebGL2 with MSAA if device initialization fails |
| Homepage failure/quiet mode | Existing video fallback / static poster; video is not downloaded on native success |
| Article dense projections | Qualify WebNN and WebGPU against the CPU kernel, then choose an accelerated candidate only if at least 10% faster |
| Custom spectral frontend, Hermitian attention, spherical geometry | Verified CPU kernel, shared by every inference candidate |

[WebNN](https://www.w3.org/TR/webnn/) accelerates neural-network computation;
[WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) supports
compute and rendering. Rendering uses the pinned
[Three.js WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)
or the existing WebGLRenderer. Feature presence alone does not select a backend.
Actual device initialization and full captured-stage numerical checks are required.
WebNN checks the matrix operator surface and attempts the real graph; unsupported
types/shapes/operators, numerical failure, slower calibration or device loss
retain the CPU worker. No browser feature flags are changed by the site.

## Quality policy

The homepage records 264 actual observations into 215,616 tensor bytes with a
SHA-256 checksum and retained checkpoint identity. It draws vector geometry at
native DPR with 512 contour segments per ring. There is no 30/60 fps presentation
cap: requestAnimationFrame follows the browser's display scheduling. Playback
speed uses timestamps, so a faster monitor does not speed up the observation
timeline. Brightness/point-size transitions interpolate recorded magnitudes;
raw inspection, bytes, probabilities and captured stages stay discrete.

Homepage ambient playback runs at 1/20 of the recording's source speed: the
6.6-second observation sequence takes 132 seconds (2 minutes 12 seconds).
Each observation receives about half a second, with eased brightness and signed
color transitions, continuously sampled illumination, and a last-to-first
crossfade. Long rendering stalls hold progression instead of skipping ahead.
The native renderer still draws at the browser's refresh rate. The compatibility
video uses 1/8 playback speed (52.8 seconds per loop); this retains its existing
encoded pixels within the decoder's playback-rate range. Article generation and
interactive article replay retain their own pace. Pause and quiet mode remain
available.

Interactive replay also admits at most 100 ms of observation progression per
presented frame. Normal refresh scheduling keeps its original speed; a slow
renderer holds the signal rather than skipping to the end. Recorded tensors,
generation, and raw-coordinate inspection are unchanged.

Pause, document visibility, offscreen background and quiet preferences suspend
the animation. Quiet startup does not request an engine. The existing 30 fps
VP9 recording remains a compatibility fallback, not a high-refresh claim.
The user requested peak quality before byte optimization: 20 MB is observational
warning headroom, with no hard page or media byte ceiling. Accessibility, source
identity, layout stability and actual inference remain required.

## Encased renderer qualification

The encased article fixture keeps the same 1,668 octahedral nodes, 3,601 curved
routes (24 segments each), 101 optical guides (32 by 6 tube segments plus a
matching halo), eight pairs of layer contours, and 23 housing mesh batches in
both refraction and lightweight modes. Lightweight switches off transmission
for the enclosure, crystal nodes, and projected content panes; it retains their
geometry, native DPR, MSAA, and full-resolution rendering targets. The projected
panes reuse the housing's active 128-pixel-face PMREM (384 by 512 CubeUV atlas).
Diagnostics distinguish shared illumination from a privately owned environment.

The old flat-scene limits of 32/24 draw calls and 180,000/30,000 rendered
triangles do not describe this assembly. Draw calls and triangles are now
observations, with finite positive values required, rather than fixed aesthetic
ceilings. They include transmission and back-face passes, and vary with visible
panes, camera culling, and renderer capabilities. Existing audits assert the
actual retained geometry and material contract instead of reducing detail to
fit those limits. All interaction, accessibility, fallback, alignment, native
resolution, and multisampling checks remain qualification gates.

On October 10, the local Chromium WebGL2 / ANGLE SwiftShader software fixture
at 1440 by 1100, DPR 1, frame 0, with three projected panes reported 71 draw calls / 150,490
triangles with refraction and 45 / 121,100 in lightweight. These are rendered
pass counts, not unique geometry or a claim of display frame rate. The existing
glass audit writes `*-quality-costs.json` for both modes before its quality
assertions and `*-profile.json` before profile assertions; the machine audit
writes `*-render-diagnostics.json` before renderer assertions. Retain those
receipts when a later assertion fails so cost changes remain reviewable.

Headless machine, glass, startup, and Lighthouse qualification explicitly select
ANGLE SwiftShader. Lighthouse uses WebGL2 in this software observation instead
of an unqualified headless WebGPU driver. Native DPR, MSAA, transmission, and
complete geometry remain enabled; the published site's backend selection is
unchanged. Lighthouse's optional full-page report image is disabled because its
pinned gatherer enlarges the viewport to document height, reallocating the live
native-DPR canvas outside the measured device profile. All Lighthouse metrics
and assertions remain enabled; dedicated native visual and UX screenshot audits
retain screenshot evidence. The glass audit stretches its intermediate transition
to 30 seconds
so a slow full-quality draw can expose the same DOM/backing alignment predicates.
An observed CSS transition is held while its assertions cross the browser RPC,
then resumed for reversal; this prevents the reverse baseline moving meanwhile.
The native backing sync uses that same held pose. Setting the observed current
time synchronously completes a pending pause, as specified by
[Web Animations](https://www.w3.org/TR/web-animations-1/#setting-the-current-time-of-an-animation).
The final exit still uses four seconds. The ignition phase wait admits the same
30-second cold renderer budget while preserving the product's 15-second prepare
deadline and 1,800 ms ignition contract.

Linux qualification uses one bounded 30-second observation budget for native
renderer visibility, replay progression, glass sampling, and ignition readiness.
The delayed-clock audit arms its observer and releases the held clock in the same
browser task, after checking the held state. Intentional holds do not consume
the progression deadline. Visibility timeout evidence includes the real stage
bounds and clock state; glass observation timeouts identify the exit or reversal
phase. The existing state, geometry, opacity, alignment, and clock predicates
remain required. Production preparation and ignition durations are unchanged.
The one-pixel resize regression waits for renderer bounds to match the live
canvas dimensions before checking the complete fit; it does not invoke resize.

Lighthouse requires three mobile and three desktop reports for each Portfolio
page: Home, About, Atlas, and Research (24 reports). `/reproduce/` immediately
redirects to the separately deployed Experiments site; routing checks retain
that contract. An external site's outage is not Portfolio UI qualification.

## Local observations, October 9, 2026

Installed Edge 154.0.4258.62, NVIDIA GTX 1070 / Pascal, WebGPU, 4x MSAA.
The preview combined current assets with public article prose; this is local
implementation evidence, not a deployed immutable publication qualification.
Raw local payload sizes include complete response bodies, unique URL counting,
and lazy/worker resources. The local server did not negotiate textual compression.
The full fallback video size was counted instead of just its first buffered range.

| Homepage path | Complete observed payload |
|---|---:|
| Previous recording implementation | 7,510,718 bytes |
| Native WebGPU | Approximately 4.72 MB |
| Native WebGL2 | Approximately 3.10 MB |
| Failed native initialization, then full video fallback | Approximately 9.99 MB |
| Activated article with WebGPU renderer and actual LM | Approximately 5.17 MB |

| Viewport | Actual background buffer | CPU frame update p95 | GPU render p95 |
|---|---|---:|---:|
| 1920 x 1080 | 1920 x 1022 | 0.80 ms | 1.18 ms |
| 3840 x 2160 | 3840 x 2102 | 0.80 ms | 2.82 ms |
| 7680 x 4320 | 7680 x 4262 | 1.00 ms | 16.32 ms |

The 58-pixel header is outside the background buffer. GPU timing is an
asynchronous timestamp observation, distinct from CPU submission or physical
display FPS. At 8K this GPU exceeded the 8.33 ms GPU budget for 120 fps; the
observed frame interval p95 was 35.1 ms. These runs do not certify physical
120/144 Hz. The reported Windows display mode was 2560 x 1440 at 59 Hz.
Native pixel dimensions and hardware timing were checked, with no image upscale.
Renderer resource accounting reported about 394 MB at the 8K buffer; that is
not total process VRAM and is independent of the 4.72 MB download.

WebNN was unavailable in this browser. WebGPU hybrid inference agreed with
all captured stages within 9.54e-7 absolute error, including the attention
weights check. Across four warmed calibration contexts it took about 209 ms
versus 96 ms for the CPU worker, so CPU inference was retained. Selection can
differ on another device. CPU/original PyTorch parity remains 1.073e-6 maximum
absolute error across the original four reference prompts.

## Reproduction and diagnostics

Install locked dependencies with `npm ci`. Rebuild the real recording using
`node scripts/build-homepage-trace.mjs`; build fallback media separately with
`node scripts/build-homepage-loop.mjs` (Chromium and ffmpeg required).
Serve an assembled publication on localhost or HTTPS, preserving its article
source identity. Run the existing homepage, article, renderer and startup audits
using `PORTFOLIO_AUDIT_URL`; set `PORTFOLIO_BROWSER_CHANNEL=msedge` for the article
audit to inspect the installed Edge backend instead of bundled Chromium.

`PortfolioHomepageBackground.snapshot()` exposes actual backend, buffer size,
timers, playback/frame intervals and model identity. The article root's
`machine.diagnostics()` exposes rendering; `machineController.lmSession.backend`
retains inference candidates, measured calibration, numerical error and fallback
reason. Settings displays the selected inference backend. Repeat on the intended
4K/8K and 120/144 Hz hardware before making a physical-display guarantee.

## Home navigation and paused quality

The background pause preference controls playback, not renderer initialization.
A visible Home page still initializes its native-resolution scene when Pause is
remembered across About, Research or article navigation. Reduced motion and
forced colors retain their static path without importing the 3D engine.

Non-persisted page departures retire pending background creation. The renderer
ownership predicate is checked after asynchronous loading and compilation;
abandoned scenes are disposed and cannot publish a stale fallback callback.
BFCache departures suspend playback and preserve the scene for restoration.

Local preview assemblies must refresh the normal Home recording and poster as
well as the inspection viewer's responsive posters. They are separate assets.
Keep preview assembly provenance separate from an older publication bundle's
metadata; a preview overlay is not a qualified release artifact.

## Native poster capture provenance

Commit renderer and capture-pipeline edits before running
`PORTFOLIO_AUDIT_URL=http://127.0.0.1:4173 node scripts/capture-model-posters.mjs`.
The served site must use that checkout. Capture checks all 41 tracked inputs
against their exact HEAD Git blobs before launching Chromium, then verifies the
served renderer bytes. Git reads have a 10-second timeout and 8 MiB buffer per
input, including the vendored engine. A clean `git status` is insufficient on
Windows: line-ending conversion can hide a raw-byte mismatch. Use the repository's
LF policy and materialize the exact committed bytes before capture; do not
normalize hashes or hand-edit the manifest to conceal a mismatch.

Commit the generated posters and manifest together after capture. Source and
publication jobs run the existing `test-model-startup.mjs` raw-byte, decoded-image,
and geometry contract immediately after dependency installation, before costly
media generation. Source qualification repeats it after its fresh capture. Any
tracked renderer or pipeline change requires matching shipped poster provenance.
