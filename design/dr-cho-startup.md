# Dr Cho automatic startup

Authorized startup revision, based on reviewed `2cc85c4f46cb693accabc3e1926bac63d1a77192`.
The first paint shows a faithful powered-down render and a terminal-style
“booting…” status. Interactive 3D loads automatically in parallel; there is no
click gate, artificial readiness delay or Lighthouse exception.

## Implementation plan

- Generate light/dark desktop and phone backplates from the maintained renderer,
  actual topology and the same powered-down material state used at handoff.
- Share camera/fit configuration. Keep perspective distance fixed within each
  responsive orientation, fit through field of view, and contain the matching
  canonical poster. Resize, DPR and native scroll therefore preserve graph pose.
- Prepare real shader programs before first presentation. Render one matched
  off-state frame beneath the poster, remove the poster, then run a bounded,
  deterministic end-to-end ignition independent of the illustrative replay.
- Preserve native content, scrolling, zoom, keyboard replay and inspection.
  Startup changes status at phase boundaries only; it never claims training,
  inference, scientific activation evidence or synthetic loading measurements.
- Bound loading failure and handle context loss, hidden pages, navigation,
  preference changes and exactly-once completion. Reduced motion and forced
  colors retain static topology and zero Three.js requests.
- Test both responsive poses, delayed/failed loading, resize/scroll during
  readiness, first-frame matching, finite ignition, replay invariants, axe and
  unchanged Lighthouse budgets. Preserve article/export byte contracts.

## Ownership

Model startup, power and view helpers; model scene/controller integration;
homepage host/status styling; renderer-derived static assets and capture manifest;
startup audit and existing gate integration. Global `site.css` stays unchanged.

## Qualification

Implemented on the successor branch, with 900ms active-time ignition. Off-state
camera landmarks match the generated render across responsive sizes. Loading,
module failure and context loss have static fallbacks; loading is bounded at
15 seconds. Camera controls are enabled at handoff, preserving the original pose
during loading. Hidden/offscreen ignition pauses without accumulating hidden time.
AVIF assets use the installed Sharp encoder, with WebP compatibility assets and
source/asset hashes in their capture manifest. No generated image model is used.

The startup audit checks desktop, 360px and S23-sized DPR 3 compositions, both
orientation changes during load, eight camera landmarks within 0.01 CSS pixels,
hidden-state pause, one completed ignition, zero-engine quiet modes, accessible
failure content, NoJS and context loss during ignition. A late engine response
after the loading deadline cannot create or revive the interactive scene.

Automatic loading still includes the locked engine's
420,551 compressed bytes. The existing 50,000-byte initial script ceiling and
150,000-byte page ceiling cannot be met by this engine loading policy without a
separate contract decision. Real preparation/ignition timing will be measured;
thresholds remain enforced. No production merge or deployment.
