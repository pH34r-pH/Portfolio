# Audience review implementation

Tracks the November 10 review, issues [127–138](https://github.com/pH34r-pH/Portfolio/issues?q=is%3Aissue+created%3A2026-11-10).
An implementation entry is not a completion claim: each issue's acceptance criteria remain authoritative.

## Dependency order and ownership

| Order | Issue | Work and owner | State |
| --- | --- | --- | --- |
| 1 | #127 | Portfolio: recruiter summary, verified impact, résumé, About order | Implemented; final publication validation pending |
| 2 | #128 | Portfolio: Projects and source-grounded case studies | Implemented; final publication validation pending |
| 3 | #129 | Portfolio: research entry paths, resource hierarchy, mobile map | Implemented; final publication validation pending |
| 4 | #130 | Research Notes: conceptual dependencies; Portfolio: map navigation | Implemented; source revisions pinned; map and reading-navigation checks passed |
| 5 | #131 | Research Notes: introductions; Portfolio: contents and reading navigation | Implemented; source revisions pinned; map and reading-navigation checks passed |
| 6 | #132 | Research Notes: evidence, dates, citations, qualifications; Portfolio: presentation | Implemented; source revision pinned; 64 exports validated |
| 7 | #133 | Compiler: catalog and details; Portfolio: exact artifact handoff | Implemented; source revision and projection digest pinned |
| 8 | #134 | Portfolio: all search results, types, excerpts, shortcuts | Implemented; real-index pagination and search fixtures passed |
| 9 | #135 | Portfolio: About decoration and intermediate-width overflow | Implemented and responsive checks passed |
| 10 | #136 | Portfolio: model first use and compact mobile presentation | Implemented; generation, fallback, and accessibility checks passed |
| 11 | #137 | Portfolio: notebook guidance, provenance disclosure, Lab return context | Implemented; project-path Python execution, search, and return navigation passed |
| 12 | #138 | Portfolio: typography, spacing, themes, cross-page visual review | Implemented; assembled appearance and visual review passed |

## Verification boundaries

- Verify public biographical and project claims against existing public source; do not turn targets, designs, fixtures, or execution success into achieved scientific outcomes.
- Preserve notebook bytes and hashes, authored empirical figures, exact package identities, and reciprocal source-pinned article links.
- Carry canonical article changes in Research Notes and catalog changes in Compiler; coordinate public source pins after those commits exist.
- Use focused behavioral checks for changed interactions and the repository's existing publication, appearance, accessibility, and project-path checks. Inspect representative desktop and phone output.
- Source checks and a review PR do not publish production. Fleet promotion remains a separate protected operation.

## Evidence log

- Initial Portfolio revision: `523bedd08c7d4f18c44a6ab7ead1acb85a5528ec`.
- Verified recruiter claims against `site/about/index.html`: Microsoft full-time since 2019 after three internships; clearing workflow roughly 35 hours to just over 3; reporting around about $360 million/month reconciliation; scheduler handling tens of billions/month. One hour is a future SLA target.
- Project descriptions use Long Haul `4a561567dae03dc3fa0b6b163334b6d368742c23` (README, repository map, architecture, citation) and Compiler `01326a28d9694742de7555724bdad424def51d3e` (README, origins, POC scope). No private runtime or infrastructure facts are imported.
- Locked Portfolio dependencies installed. 25 publication tests pass, including source-byte preservation, article contents, chronological/prerequisite navigation, and static research catalog.
- Research Notes: 8 validator tests and the 16-article strict MyST HTML build pass. The MyST 1.11-compatible article theme is now pinned to v1.4.1 commit `4acce1eba558b301c2aadca99a7804aa6e294e1e`; the mutable upstream default moved to an incompatible v2 interface during this work.
- Compiler: all 168 unit tests pass. Existing catalog browser checks pass without JavaScript and with filtering, sorting, exact downloads, hostile source text, and 320/360/390px layouts. Historical package members are untouched.
- Search browser fixtures pass: all 19 matches reachable, accurate counts, distinguishable article/notebook routes including a project prefix, stale pagination rejection, empty/error states, safe excerpts, focus return, and Windows/Mac shortcut labels.
- Source appearance audit passes Auto/Light/Dark at 320/412/768/1366px across eight routes. About also passes 901/960/1018/1024/1280/1600px and forced colors. Source preview and assembled working-tree preview are local only, not qualified production artifacts.

- Research Notes PR: https://github.com/pH34r-pH/research-notes/pull/29, revision `1e2951d77a82ea1d4b968f1b30830767f4bfc824`. Publication validation and structural-quality CI pass.
- Compiler PR: https://github.com/pH34r-pH/experiment-compiler/pull/147, revision `5f10073af1ece8cda95836097387d55b40138189`. Projection SHA-256: `99d4c9043e53bf2312159f3abec4ff0e01c508de8c4fec8a92d600a95dff519c`. All 168 tests pass after adding the reciprocal source backlink; Muon ZIP remains `28d2d6c6dba2ff2370b9536c4428f40dd23de4ea42a26c98f3e8225b4dd9a8c4`.
- All 64 article exports exist and are nonempty (16 each of PDF, Word, LaTeX ZIP, and JATS XML). Representative latest-article PDF pages were visually checked for the introduction, split evidence table, equations, and figures.
- Full article-model browser audit passes real generation, numerical observations, prompt focus, phone first use, hide/show, unpin/follow, fallback, accessibility, and payload checks.
- Assembled 2071 audit passes search, topology relationships, phone navigation/Back restoration, article model presence, Pagefind boundaries, and model startup/reduced motion. Manual real-index search reaches all 17 consumer matches (8 → 16 → 17) with accurate counts and types.
- Manually inspected assembled homepage, résumé screen and print styles, and article phone layout. Browser emulation was reset after inspection. Native 1920×1920 homepage recording completed at 30 fps.

- Final project-path browser audit passes at `/Portfolio/`: live model startup, article/PDF access, exact JupyterLite source cells, Python execution, contextual notebook return, associated article link, real search result prefixes, mobile navigation, and reduced motion.
- Final assembled appearance audit passes 10 routes at 320/412/768/1366px in all theme modes, denied storage, About intermediate widths, and forced colors.
- CI compatibility repair: pin browser jobs to Ubuntu 24.04 because the locked Playwright release rejects Ubuntu 26.04, now selected by `ubuntu-latest`. Native poster assets are regenerated with the current source and pipeline provenance; capture quality and validation thresholds remain unchanged.
- The model loader now resolves bundled Three.js relative to its own module, fixing live model startup on project-path hosting. Research entry actions precede the detailed finding/open-question paragraphs on phones.

- All route checks pass at 360/412/768/1366px, including all 16 articles, readable notebook cells, both Lab return journeys, preserved-download hashes, exact Compiler navigation, and real MyST browser Python execution. A focused history regression test then reproduced and verified the fix for Forward restoring an anchor after the article contents disclosure collapsed; disclosure state now travels with browser history.
- Final native poster capture uses source `05f992a975bdb6f1ec55901ed45984f87ae4eb56`; all 12 theme/orientation/density variants and source/pipeline hash checks pass. Portfolio CI must finish against the final PR head before integration.
