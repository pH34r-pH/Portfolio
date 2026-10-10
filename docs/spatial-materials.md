# Energy and glass

Blue light supports the structure; floating glass carries content and native
controls. The October 10 design revision removes all wood textures, carved
controls, frames, routing blocks, and the separate carpentry GPU renderer.

## Material responsibilities

| Material | Role | Implementation |
|---|---|---|
| Blue energy | Structural rails and screen supports | Fine cylindrical filaments with continuous Gaussian glow, joined by steel quarter-torus elbows and machined collars |
| Glass | Transparent monitor surfaces | Document panes with a layered edge bevel, thick slab silhouette, glossy reflections and illuminated native text |
| Glass controls | Buttons and switches | Native labels and hit targets on inset glass faces, with focus, selected-state illumination, and restrained press feedback |

`site/assets/material-system.css` owns these surfaces. The palette variables
retain the accessible light/dark colors. Do not add competing opaque skin rules.
Every pane shares one viewport-relative softbox reflection; scrolling updates its
position in the glass, with no pointer-following spotlight or idle animation loop.
Reduced motion disables animated press feedback; forced
colors uses native system surfaces. Header controls remain fixed in their slots.

`energy-architecture.js` and `energy-optics.js` use six instanced draw batches in the existing
WebGPU/WebGL2 scene, camera, native DPR, and lifecycle. Screen supports follow
document rectangles after scroll, camera, or layout changes. Only two visible
screen assemblies are retained, and phones omit the outer support frame.
The glow texture is generated in memory (256 RGBA samples). There is no texture
download or additional GPU context for page furniture. Rails follow the pane
perimeter at a one-pixel offset; corners use its actual computed border radius.
Other reading panes use resolution-independent SVG steel fittings. These
decorative elements are hidden from assistive technology and cannot intercept
pointer input. A faint 14-second light breath freezes with homepage Pause;
reduced motion keeps the document edges static.

## Scientific identity and quality

The trained language model, weights, inference kernels, recorded tensors,
inspector, article following, and Hide/Unpin controls retain their existing
behavior. Energy supports are decorative page furniture, explicitly identified
in renderer diagnostics. Their glow follows the model-light envelope with a
small, separately identified decorative breath; measured
activations remain independently inspectable in the graph.

Model backplates, rest colors and optical lighting stay dark in both document
themes. Navigation and prose continue to follow the chosen theme. The shared
glass setup preserves the case's reflection environment instead of clearing it
when article panes use native document layout. Etched edges and illuminated
text remain native selectable glyphs, never rasterized text textures.

See [native-rendering-quality.md](native-rendering-quality.md) for native pixel
rendering, refresh scheduling, backend qualification, and measured limitations.
Its pre-material measurements describe the native renderer, not a new timing
measurement of this revision. Download size and GPU working memory are separate.

## Review and release

Local visual review is implementation evidence. Fleet must qualify and promote
the exact source revision before production changes. Existing source UX,
finished publication, article inference, and source identity gates remain
required. Removing the wood assets also removes them from poster provenance,
published asset identity, and workflow syntax lists; recapture poster provenance
from the clean source commit before publishing the branch.

## Coherent glass refinement

The next pass lives separately from the approved encased release. Native text
remains unfiltered and selectable. Homepage and article instrument panes use
three shared, stationary SVG displacement maps in supporting Chromium browsers;
one broad low-frequency octave shifts backdrop samples by at most 1.2 CSS px.
The map itself is never painted, so it adds no noise or grain to the glass.
Other engines keep a subtle optical blur. No animated distortion is used.

The front arris, polished bevel and rear slab edge share one light direction.
Duplicate CSS rails and independent overlay reflections are removed from the
native homepage. Recessed controls brighten on hover without floating out of
their sockets. Text uses narrow directional cut-edge highlights and restrained
edge illumination, rather than blurring the glyphs.

Homepage panes translate parallel to the screen so their actual outlines remain
registered with the GPU fittings. Hardware follows all four computed corner
radii and the canvas origin. Scrolling while playback is paused re-seats the
hardware with one event-driven render; observation time and pulse remain frozen.

The local assembled preview on port 4189 is a design review artifact, combining
public article prose with refinement assets. It is not an immutable production
bundle. The approved release remains separately available on port 4188. These
CSS optical effects are a screen-space approximation, not path-traced glass.
Browser support reference: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter