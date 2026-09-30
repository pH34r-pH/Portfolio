# Research and experiment publication contract

The public research site at tyharbin.com and the Compiler site at experiments.tyharbin.com are two views of one publication system. Each site owns its own HTML, CSS, build, and browser runtime. They share a recognizable design and transition grammar, not a coupled frontend.

## Shared design language

Both surfaces use the **2071 Research Instrument** language:

- TJHG identity with a site-local label.
- 54px fixed navigation shell.
- Light / blue and Dark / blue optical modes.
- cold white or near-black background;
- deep navy or near-white text;
- saturated optical blue for active state, energy and execution;
- compact monospace metadata and identifiers;
- sharp panel geometry and low-alpha blue rules;
- motion only for state, causality, navigation or transformation;
- visible keyboard focus, reduced motion, forced colors, coarse-pointer targets and mobile-first composition.

Portfolio owns the reference art direction. Compiler may be denser and more instrument-like, but it should feel like the same research object has moved from explanation into a reproduction console.

The two sites do not need identical page templates or a shared runtime package.

## Transition grammar

Crossing between an article and an experiment should preserve the research object's identity:

- article -> experiment: the exact experiment identifier becomes the transition anchor;
- experiment -> article: the article identifier/title becomes the return anchor;
- transitions remain fast, interruptible and optional;
- reduced-motion mode performs ordinary navigation without the visual transition.

A transition must never imply that a merely related package reproduces an article result.

## Navigation and article context

- The research site labels the experiment surface **Experiments**.
- Compiler pages link back with **Research** or **Read article**, depending on context.
- A published research article links to a Compiled Experiment only when that exact package exists and the relationship is explicitly recorded.
- A Compiled Experiment may link back through relatedArticles, projected as catalog backlinks. Each backlink carries article title, canonical HTTPS URL and exact source commit.
- If no exact package is published, no substitute run is inferred from matching terms.

## Epistemic semantics

Shared UI must distinguish, structurally rather than through repetitive warning text:

- authored explanation;
- measured evidence;
- browser-side exploration;
- experiment/package identity;
- formal result;
- execution state;
- interpretation.

Color alone is never sufficient to communicate one of these states.

## Independence and verification

The sites do not synchronize appearance settings and do not require shared client code. Their navigation works if either site is served independently.

Compiler owns backlink projection and package validation. Portfolio owns article/source qualification. Cross-site smoke checks verify canonical routes after publication; static builds do not depend on mutable network state.
