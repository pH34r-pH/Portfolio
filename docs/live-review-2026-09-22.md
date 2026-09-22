# Production UX review — 22 September 2026

Reviewed `https://tyharbin.com/` in the Work browser at 1363 × 936 CSS pixels.
Production's visible build provenance was `b6759cf8`, matching Portfolio `main`
and merged PR #15. Fleet publication run `35670033111` built that exact source
and completed both build and deployment successfully.

## Repair now

| Observed production behavior | Effect | Repair owner |
| --- | --- | --- |
| Atlas sphere is blank; evidence remains “Loading frozen evidence”; both sliders and all three button groups leave their explanations unchanged. Browser reports `SyntaxError: Unexpected token 'const'` in `atlas.js`. | The primary interactive explanation is unusable. | Portfolio: fix malformed script boundaries; test rendering, sliders, each button, and page errors. |
| Clicking Atlas Menu leaves `aria-expanded=false`; it omits `site.js`. | Navigation and theme controls are unavailable through this menu. | Portfolio: load the shared behavior and audit the menu on every route. |
| “Browse executable research” in Atlas points to `/#work`. | The visitor returns to Home instead of the Research index. | Portfolio: link to `/research/` with a destination-specific label. |
| “Research index” in notebooks 013, 011, 005, 009 and the Atlas source notebook points to `/#work`. Reader pages have no primary navigation or theme controls. | Reading breaks the shared navigation path. | Fleet: use Portfolio's navigation shell and correct return links. |
| Notebook 013's affine-map reference opens `/notebooks/reference/glossary.md#affine-map` and returns 404. The Atlas source notebook's milestone 001 link also returns 404. | Readers cannot follow definitions or related work. | Fleet: resolve notebook links to published readers; pin other repository references to the published research-notes revision. |
| Notebook readers show a filename-derived title followed by the original large title, with nested main landmarks. | Duplicated headings dominate the opening screen. | Fleet: use the authored title once and flatten the embedded main landmark; Portfolio: style actual nbconvert markup. |
| Pressing Escape after opening Home's menu leaves it open. | Keyboard dismissal is missing. | Portfolio: close the menu and restore focus. |

The repair also exercises the horizon diagram after script recovery (its original
CSS ignored the slider value), redraws the sphere when the palette changes, and
allows vertical scrolling across the sphere while retaining horizontal rotation.
The horizon gains are explicitly illustrative; empirical evidence remains in the
existing evidence contract and is unchanged.

The expanded local 360 px audit additionally reproduced 4 px of page overflow
from the topic bar's mismatched negative margins. Touch taps on the evidence
buttons timed out because the rotated, full-column arrow spans covered adjacent
buttons. Match the narrow page margins and constrain decorative arrow hit areas;
these are regression-test observations, not physical-device observations.
The assembled reader audit also found a non-focusable inner code scroller and
insufficient Nacre comment contrast. Use one focusable scroll region and darken
that palette's comment token slightly; keep the other syntax colors intact.
Visual inspection of the repaired desktop Atlas also showed the tangent vector
extending outside its diagram over the slider. Cap component lengths to fit the
frame and make the radial component shrink as tangent share increases.

Reproduce's disabled link still advertises a nonexistent fixture ZIP URL, while
its loaded status exposes “Fixture route · fixture.” Keep it unavailable in HTML,
before/after loading, and on failure; label that state as qualification pending.

## Focused polish, deferred

- Home's distinctive headline occupies most of the desktop opening screen; the
  primary actions fall below the 936 px viewport. A bounded type/spacing adjustment
  could bring the next action closer without replacing the visual system.
- The Current result gives the site a specific research claim, but “revision-branch
  signal” and “native next-byte consumer” still presume context. Preserve its
  boundary; consider a short plain-language lead in a later copy pass.
- Research cards show filename-derived titles and a common “Updated 9/21/2026”
  date, while notebook 013 identifies September 8–9 as its research period.
  The generator uses checkout file modification times, not research dates.
  The reader repair propagates authored titles; publication/research date metadata
  needs a separate, explicit contract decision.
- Lab loads JupyterLite and all 14 notebooks, but offers no Portfolio return link.
  A small branded return affordance belongs in the Lab publication integration.

## Backlog

- The Atlas source notebook describes plots that are absent from the read-only
  publication; its cells have code but no stored outputs. Do not fabricate outputs
  or silently claim execution. Publishing qualified illustrative outputs is
  separate work for the notebook/publication owner.
- No new architecture, homepage consolidation, scientific claims, or package
  qualification is proposed by this review.

## What works

The five destinations are understandable and worth retaining. Home explains the
work and offers Research/Atlas entry points. The Research reading-path cue provides
a useful depth gradient. The authored notebooks use specific, direct prose and
clearly separate results from open mechanisms. The theorem-ledger notebook makes
formal/empirical boundaries explicit; its public Theorem Library link opens the
correct repository. Theme selection works on Home/Research/Reproduce and persists
across navigation. Reproduce explains qualification status and keeps the package
disabled. Lab redirects to the actual executable environment and loads its catalog.

Contact review checked the visible LinkedIn destination and email href; no message
was sent and no mail application was launched.

## Coverage and limits

Directly navigated Home, Research, notebooks 013/011/005/009 and the Atlas source,
all seven Atlas topics, Reproduce, Lab, the Theorem Library, and broken reference
destinations. Exercised all four themes, menu opening and Escape, both sliders,
sphere dragging, every evidence/architecture/ledger button, and package disclosure.

The Work browser exposed no viewport resize/device-emulation API; attempted browser
shortcuts did not change its viewport. This is **not a direct mobile or physical
S23 Ultra/foldable sign-off**. Responsive regression tests exercise 360 × 780,
412 × 915, 768 × 1016, and 1366 × 768 layouts, including touch taps, alongside the
existing 11-viewport audit. These cover CSS layouts and browser interactions, not
physical hinges or Android gesture arbitration.

Local publication checks use the actual 14 source notebooks and confirm their
copied bytes/hashes remain unchanged. They do not execute or scientifically
requalify those notebooks. Neither this review nor a green PR deploys the site.
