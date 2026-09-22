# Portfolio appearance

**Long measure (07)** remains the common typographic foundation: upright
narrow letters, regular weight, a clear margin, and deliberate use of space.
Home and index titles use lowercase; published notebook titles retain their
authored text and casing.

Appearance has two independent axes. Style controls composition and framing;
palette controls color. All four styles work with Nacre, Oxide, Violet, and
High contrast. The default is **Orbit / Nacre**. Existing palette preferences
survive the introduction of styles.

| Style | Selected study | Page identity | Content treatment |
| --- | --- | --- | --- |
| Orbit | 07D | A spare ellipse behind the title and a colored emphasis line | Curved card corners, section-edge points, and quiet ruled reader headings |
| Register | 07E | Split ink, a precise cut line, and aligned navigation cells | Research becomes a row-based ledger on wide screens; compact records stack on phones |
| Overprint | 07B | A small offset impression on display type | Offset card borders and doubled seams; prose, code, figures, and measurements remain crisp |
| Hinge | 07A | A displaced emphasis line connected to the long margin rule | Open card framing, two-column Research on wide screens, and side-mounted section rules |

The visual direction favors paper, graphite, oxidized color, and precise seams.
Decoration belongs to the surrounding publication system. It must not imply
scientific evidence, animate for attention, obscure controls, or alter the
appearance of measured figures. There are no added ambient effects, simulated
telemetry, or decorative status claims. High contrast, forced colors, and print
suppress decorative text effects.

## Shared implementation

The two-column Style / Palette control is part of the shared navigation. The
publication builder already copies that navigation from Research into notebook
readers, so generated pages receive the same controls without a second template.
`site/assets/appearance.js` loads within that shell before the article is parsed,
restores independent preferences, and handles the controls and menu. It accepts
only known values, tolerates blocked storage, and follows preference changes in
other tabs. Changing appearance does not modify a source notebook or evidence.

The Lab return strip follows the chosen style and palette. JupyterLab retains
its own editor theme and controls. This keeps the executable workspace usable
without imposing decorative publication styles on its menus or code editor.

## Validation

`scripts/appearance-audit.mjs` exercises all 16 combinations at 320, 412, 768,
and 1366 CSS pixels, including independent selection, touch targets through real
interaction, overflow, keyboard dismissal, storage persistence, and denied
storage. It checks axe contrast/accessibility at phone and desktop widths.
Point `PORTFOLIO_AUDIT_URL` at a complete publication bundle to include a real
generated notebook. Set `PORTFOLIO_STYLE_SCREENSHOTS` to retain local Home,
Research, and settings screenshots. Existing responsive, Atlas-interaction, and
Lighthouse gates remain in place.

The font is bundled under `site/assets/fonts/long-measure/`; visitors do not
need the Linux font used for the original studies installed locally.

`title-review.html` and `scripts/render-title-review.mjs` preserve the original comparison
exercise. The stylesheet under `site/assets/` is the implemented design.
