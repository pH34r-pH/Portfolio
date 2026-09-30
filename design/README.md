# Portfolio appearance

Portfolio now has one canonical art direction: **2071 Research Instrument**.

The previous Orbit / Register / Overprint / Hinge studies were useful design exploration, but they no longer define visitor-selectable presentation modes. The public system has one composition with two optical modes:

- **Light / blue:** cold white, deep navy and saturated optical blue.
- **Dark / blue:** bright blue light on near-black.

The full design constitution, motion rules, model-machine contract, research-topology behavior, mobile-first requirements and accessibility rules are in [2071-research-instrument.md](2071-research-instrument.md).

The old title-comparison files remain only as design-history artifacts. They are not part of the live design contract.

## Shared implementation

site/assets/site.css continues to contain the stable publication/readability layer. site/assets/instrument-2071.css is the single art-direction layer. This separation keeps MyST/notebook rendering stable while allowing the visual system to evolve without duplicating reader CSS.

site/assets/appearance.js owns display mode and menu behavior. site/assets/instrument.js owns cross-page interaction, transient emphasis, search and the generated research topology. site/assets/model-machine.js owns the reusable WebGL research instrument and dynamically imports the pinned local Three.js module only when the machine enters the viewport.

Published static bundles add a Pagefind index after all article and Lab routes exist. No search server is required.

## Validation

The previous 4 × 4 style/palette matrix has been retired. CI now treats the actual product contract as the matrix:

- Light / blue and Dark / blue.
- 320, 360, 412/430, foldable, tablet, laptop, desktop and ultrawide widths.
- reduced motion.
- forced colors.
- keyboard and touch interaction.
- route overflow.
- axe WCAG checks.
- Core Web Vitals and initial-resource budgets.
- JavaScript syntax and article-runtime qualification.
- published-bundle search-index presence.

The WebGL module is intentionally lazy so it does not become part of the initial page-load cost when the model machine is below the fold.
