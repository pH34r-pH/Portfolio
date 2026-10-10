# Energy and glass

Blue light supports the structure; floating glass carries content and native
controls. The October 10 design revision removes all wood textures, carved
controls, frames, routing blocks, and the separate carpentry GPU renderer.

## Material responsibilities

| Material | Role | Implementation |
|---|---|---|
| Blue energy | Structural rails and screen supports | Camera-space cylinders with a bright filament, blue core, and three additive glow shells; small luminous corner connectors |
| Glass | Transparent monitor surfaces | Document panes with transmitting tint, restrained blur, reflected light, and thin illuminated edges |
| Glass controls | Buttons and switches | Native labels and hit targets on inset glass faces, with focus, selected-state illumination, and restrained press feedback |

`site/assets/material-system.css` owns these surfaces. The palette variables
retain the accessible light/dark colors. Do not add competing opaque skin rules.
Pointer lighting changes the reflection without moving the reading position.
Reduced motion disables pointer lighting and animated press feedback; forced
colors uses native system surfaces. Header controls remain fixed in their slots.

`energy-architecture.js` uses six instanced draw batches in the existing
WebGPU/WebGL2 scene, camera, native DPR, and lifecycle. Screen supports follow
document rectangles after scroll, camera, or layout changes. Only two visible
screen assemblies are retained, and phones omit the outer support frame.
There is no texture download or additional GPU context for page furniture.

## Scientific identity and quality

The trained language model, weights, inference kernels, recorded tensors,
inspector, article following, and Hide/Unpin controls retain their existing
behavior. Energy supports are decorative page furniture, explicitly identified
in renderer diagnostics. Their glow follows the model-light envelope; measured
activations remain independently inspectable in the graph.

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
