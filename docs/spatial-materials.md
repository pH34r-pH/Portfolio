# Energy, glass, and wood

The stone fieldnotes reference makes material convincing through consistent
grain, contour, bevels, light, and contact shadows. Portfolio uses that principle
with a different material system: blue light supports the structure, transmitting
glass carries the content, and wood marks the places people touch.

## Material responsibilities

| Material | Role | Implementation |
|---|---|---|
| Blue energy | Structural rails and screen supports | Native camera-space cylinders with a bright filament, blue core, and three additive glow shells |
| Cedar | Warm screen frames and reader edges | Four independently cut rails, 45-degree miter gaps, routed glass channels, shaped bevels, grain relief, and varied tool cuts |
| Hemlock | Energy-routing corner joints | Rounded extruded stock with twelve distinct board cuts, correlated grain bump and roughness, recessed sockets, and luminous connectors |
| Maple | Buttons and switches | Carved concave caps seated below glass socket lips; real depth travel, contact shading, grain relief, varied score marks, and sharp native labels |
| Glass | Transparent monitor surfaces | Native document panes with transmitting tint, restrained background blur, reflected light, and illuminated edges |

`site/assets/material-system.css` owns the surface system. Retired square/chamfer
and forced opaque skin rules have been removed from `site.css`; avoid adding a
competing layer of `!important` material overrides. The palette variables remain
the existing accessible light/dark palette. Material variables are namespaced.

`energy-architecture.js` batches the energy and socket geometry; the twelve
hemlock pieces use different UV cuts, for nineteen furniture draw calls.
It shares the existing WebGPU/WebGL2 renderer, camera, native DPR, and lifecycle.
Screen supports follow the real document rectangles and update after scroll,
camera, or layout changes. Only two visible screen assemblies are retained.
The secondary outer support frame is omitted on phones. It does not create a
second renderer, change the graph fit, or duplicate article text into textures.

Pointer lighting moves a reflection, not the reading position. Wood
caps compress into fixed glass sockets, with a damped spring and labels following
the cap's projected depth. Quiet preferences disable pointer lighting
and preserve the existing static model lifecycle; forced colors use native system
surfaces. Keyboard focus remains distinct. Sticky article controls retain Hide,
Unpin, and Follow, with native input and accessible labels.

## Scientific identity

The language model, weights, inference kernels, captured tensors, inspector, and
article context synchronization are unchanged. Energy supports are decorative
page furniture, explicitly labeled that way in renderer diagnostics. Their glow
follows the existing model-light envelope; it is not another measured activation.
The graph continues to display actual recorded or generated intermediate tensors.

## Carpentry solid renderer

`carpentry-shaders.js` defines three-dimensional solids in CSS-pixel units.
The cedar frame is cut into four rails with real miter gaps; its inner profile
contains a routed glass channel. Maple stock is rounded and its face carved into
a shallow dish. Glass socket walls sit above the cap. The socket bed, clearance,
cap thickness, bevels, end-grain faces, and press depth participate in ray
intersection and shading. Correlated fiber height changes the surface and its
normal; seeded, uneven score marks remove material rather than painting scratches.
Key/fill lighting, soft self shadows, contact shading, and a rough microfacet
response make those small cuts readable under changing control illumination.

Every rail and cap samples its own unwrapped region of the original atlas, with
grain following the stock's long axis. The sampler clamps, never repeats; board
identity stays stable when a button label or state changes. Different pieces have
different cuts, slight finish variation, and different tool-cut positions/counts.

`carpentry-renderer.js` uses one small WebGL2 context for this bounded solid
renderer. It copies native-pixel results into presentation canvases beside native
labels; it does not allocate a GPU context per button or rasterize text. WebGPU
continues to own the model scene independently. No Three.js engine or LM weights
are loaded by the carpentry renderer, preserving explicit article-model startup.
Hardware limits alone constrain pixel density. Idle pieces have no frame loop;
controls redraw during illumination/press changes, and visible frame crops redraw
after layout/scroll changes. Long readers render only their visible rail segment.
Forced colors uses system controls. Context/shader failure or a reported software
graphics adapter selects the CSS material fallback. Software browser audit hosts
continue to exercise the same native controls and the independently owned model.

`PortfolioCarpentry.snapshot()` records the actual adapter, render submission/copy
timings, piece identities, press travel, and fallback reason. These CPU observations
are not GPU timestamp or physical display FPS guarantees. On the local GTX 1070,
individual control render/copy observations were approximately 0.6–1.5 ms after
the first draws. A large frame's initial observation was about 22 ms; it is kept
out of the pointer-lighting loop. Native control names, keyboard behavior, hit
targets, focus outlines, and events stay owned by their original DOM elements.

## Texture provenance

The atlas is an original built-in imagegen output, representing furniture-grade
cedar, hemlock, and maple. It is a generated material, not a botanical photograph.
The exact generation prompt, band order, dimensions, encoding settings, and
production SHA-256 are retained in `site/assets/materials/manifest.json`.
The 1254 x 1254 source was encoded to WebP at quality 96 / effort 6 without
resizing, cropping, or upscaling. The production atlas is 559,162 bytes and is
shared by the solid renderer, CSS fallback, and native routing geometry. Procedural contours,
geometry, and native text continue to render at the device's real pixel density.

To encode a newly generated source with the locked Sharp dependency:

```js
import sharp from 'sharp';
await sharp(sourcePNG).webp({quality:96,effort:6}).toFile(outputWebP);
```

Keep the existing atlas for reproducible builds. Repeating the image-generation
prompt creates a new image; it does not promise the same pixels. Update the
manifest identity and review all three bands when deliberately replacing it.

## Review and release

The local publication preview combines current assets with public article prose.
Visual review is implementation evidence, not immutable publication qualification.
The following first-material-pass timing table predates the carved solid renderer.
Those Edge 154 / GTX 1070 observations used native WebGPU with 4x MSAA:

| Viewport | Background buffer | GPU render p95 | CPU frame update p95 |
|---|---|---:|---:|
| 1440 x 1000 | 1440 x 942 | 1.25 ms | 1.20 ms |
| 3840 x 2160 | 3840 x 2102 | 3.60 ms | 1.10 ms |
| 7680 x 4320 | 7680 x 4262 | 20.45 ms | 1.20 ms |

The homepage's complete uncompressed response bodies totaled approximately
5.29 MB, including the 559 kB atlas, lazy native engine, and recorded tensors.
The 412 x 915 phone preview used native DPR 3. Light, dark, phone, desktop,
and quiet previews reported no JavaScript page errors. GPU timing is distinct
from CPU submission and physical display FPS: this GPU cannot sustain 120 fps
at 8K. Repeat on the intended high-refresh display before making FPS guarantees.

Fleet must qualify and promote the exact new source revision before publication.
No browser feature flags, inference data, hosting arrangement, or deployment guards
are changed by the material system.
