# Portfolio 2071 UI architecture

The public shell is intentionally split into three small browser layers:

| Layer | Owns | Does not own |
| --- | --- | --- |
| `site/assets/site.css` | Palette, glass material, dimensional field, responsive composition, focus styling, and view-transition policy | Publication data or model/replay runtime state |
| `site/assets/appearance.js` | Light/dark/auto preference, theme-color metadata, menu disclosure, focus return, and keyboard trapping | Page-specific content or experiment claims |
| `site/assets/site.js` | Publication catalog rendering and scroll-driven field coordinates | Topology geometry or 3D scene lifecycle |
| `site/assets/research-topology.js` | Publication-derived dependency graph, node selection, accessible list, and edge geometry | A second copy of article metadata or scientific interpretation |

## Surface relationship

The body owns a quiet gradient field. Scroll updates two CSS custom properties on
the document root; CSS uses those values to move the field a small, deterministic
distance. Surfaces sample that field through a tinted fill, backdrop blur,
saturation, inset specular edge, low edge, and cast shadow. This makes the menu
and cards read as thick glass rather than flat opacity. Reduced motion freezes
the field and removes spatial transitions.

## Topology relationship

The topology remains generated from `publication.json`. Desktop and tablet use
dependency-depth columns with curved horizontal edges. At phone widths (≤640px)
the same nodes become one readable vertical sequence; the inline depth/row
placement is intentionally overridden, and the renderer changes each dependency
edge to a vertical curve ending at the dependent node. The accessible list stays
available as a semantic fallback. Arrow/Home/End keys move between node buttons,
while Enter/Space retains native selection behavior.

This layout change is presentation and interaction only: it does not alter
`dependsOn`, frontier fields, article routes, or publication contracts.

## Ownership boundary

The 2071 UI branch does not modify model scene, replay, WebGL, or machine-runtime
files. Those systems continue to consume the shared palette and reduced-motion
tokens exposed by the presentation layer.
