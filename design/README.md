# Portfolio design

The canonical visual and interaction direction is now
[**Portfolio 2071**](2071-interface.md).

The earlier Orbit / Register / Overprint / Hinge studies remain useful as design
history, but they are no longer product-level appearance choices. The public site
has one art direction with light and dark environmental modes.

## Product rules

- The site is a research instrument, not a theme playground.
- Blue/white and blue/black are the canonical light/dark environments.
- Hard geometry, optical depth, and state-bearing light replace paper/print
  metaphors.
- Motion is fast, mechanical, causal, and optional under reduced-motion.
- The recurring model-machine and the research dependency graph are shared
  system primitives, not one-off hero effects.
- Every visualization must teach, compare, manipulate, or expose evidence.
- Accessibility and mobile composition have veto power over decorative choices.
- Experiment Compiler remains a separate first-party surface and should inherit
  the same identity and semantic state language without becoming the same app.

## Historical studies

The original Long Measure 07 typography study and the Orbit / Register /
Overprint / Hinge variants are retained in repository history and the title-review
artifacts. They should not be reintroduced as end-user theme controls.

## Validation

The redesign should progressively replace the old 16-combination appearance
matrix with validation of:

- light/dark/forced-colors environments;
- reduced-motion and full-motion behavior;
- mobile-first layouts at 320, 360, 412 and tablet/desktop widths;
- keyboard and coarse-pointer interaction;
- WebGL capability failure and deterministic fallback;
- animation pausing when offscreen/backgrounded;
- Lighthouse/Core Web Vitals budgets;
- article, topology, search and cross-site navigation integrity.

See [2071-interface.md](2071-interface.md) for the complete quality contract and
art-direction rationale.
