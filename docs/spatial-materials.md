# Energy, glass, and wood

The stone fieldnotes reference makes material convincing through consistent
grain, contour, bevels, light, and contact shadows. Portfolio uses that principle
with a different material system: blue light supports the structure, transmitting
glass carries the content, and wood marks the places people touch.

## Material responsibilities

| Material | Role | Implementation |
|---|---|---|
| Blue energy | Structural rails and screen supports | Native camera-space cylinders with a bright filament, blue core, and three additive glow shells |
| Cedar | Warm screen frames and reader edges | Original material atlas, masked rims, bevel highlights, and contact shadows |
| Hemlock | Energy-routing corner joints | Rounded extruded L brackets with physically lit satin wood, recessed sockets, and luminous connectors |
| Maple | Buttons and switches | Original material atlas, carved face, edge depth, press feedback, and sharp native text |
| Glass | Transparent monitor surfaces | Native document panes with transmitting tint, restrained background blur, reflected light, and illuminated edges |

`site/assets/material-system.css` owns the surface system. Retired square/chamfer
and forced opaque skin rules have been removed from `site.css`; avoid adding a
competing layer of `!important` material overrides. The palette variables remain
the existing accessible light/dark palette. Material variables are namespaced.

`energy-architecture.js` batches the homepage furniture into eight draw calls.
It shares the existing WebGPU/WebGL2 renderer, camera, native DPR, and lifecycle.
Screen supports follow the real document rectangles and update after scroll,
camera, or layout changes. Only two visible screen assemblies are retained.
The secondary outer support frame is omitted on phones. It does not create a
second renderer, change the graph fit, or duplicate article text into textures.

Pointer lighting moves a reflection, not the text or reading position. Wood
press feedback is physical but short. Quiet preferences disable pointer lighting
and preserve the existing static model lifecycle; forced colors use native system
surfaces. Keyboard focus remains distinct. Sticky article controls retain Hide,
Unpin, and Follow, with native input and accessible labels.

## Scientific identity

The language model, weights, inference kernels, captured tensors, inspector, and
article context synchronization are unchanged. Energy supports are decorative
page furniture, explicitly labeled that way in renderer diagnostics. Their glow
follows the existing model-light envelope; it is not another measured activation.
The graph continues to display actual recorded or generated intermediate tensors.

## Texture provenance

The atlas is an original built-in imagegen output, representing furniture-grade
cedar, hemlock, and maple. It is a generated material, not a botanical photograph.
The exact generation prompt, band order, dimensions, encoding settings, and
production SHA-256 are retained in `site/assets/materials/manifest.json`.
The 1254 x 1254 source was encoded to WebP at quality 96 / effort 6 without
resizing, cropping, or upscaling. The production atlas is 559,162 bytes and is
shared by the CSS surfaces and native routing geometry. Procedural contours,
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
The previous rendering timing table predates the material furniture. The new local
Edge 154 / GTX 1070 observations, using native WebGPU with 4x MSAA, were:

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
