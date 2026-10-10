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

Homepage ambient playback runs at 1/40 of the recording's source speed: the
6.6-second observation sequence takes 264 seconds (4 minutes 24 seconds).
Each observation receives about one second, with eased brightness and signed
color transitions, continuously sampled illumination, and a last-to-first
crossfade. Long rendering stalls hold progression instead of skipping ahead.
The native renderer still draws at the browser's refresh rate. The compatibility
video uses 1/16 playback speed (105.6 seconds per loop); this retains its existing
encoded pixels within the decoder's playback-rate range. Article generation and
interactive article replay retain their own pace. Pause and quiet mode remain
available.

Pause, document visibility, offscreen background and quiet preferences suspend
the animation. Quiet startup does not request an engine. The existing 30 fps
VP9 recording remains a compatibility fallback, not a high-refresh claim.
The user requested peak quality before byte optimization: 20 MB is observational
warning headroom, with no hard page or media byte ceiling. Accessibility, source
identity, layout stability and actual inference remain required.

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
