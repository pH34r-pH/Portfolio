# Publication input

The candidate job generates this directory from exact public source revisions. Its `publication.json` v2 records Portfolio, research-notes and theorem-library source SHAs and each notebook hash. The whole built site, including the generated JupyterLite application, is uploaded as one content-addressed artifact. Private Fleet validates and promotes that same artifact under its own release receipt; the public job cannot deploy it.

## MyST article rendering

Portfolio extracts the server-rendered article from the pinned MyST build and supplies its own navigation, source links, and browser runtime. The adapter removes MyST application controls that depend on its hydrated theme, retains heading IDs and legacy section aliases, and routes source attachments to the corresponding reader or source page. Shared article CSS sizes inline icons separately from figures. The finished-candidate audit checks every article at desktop and mobile widths, including icon dimensions, landmarks, source links, and accessibility.

Articles containing equations ship KaTeX CSS and fonts from the locked MyST dependency tree. This presents one visual equation while retaining the MathML layer for assistive technology. Display equations are keyboard-scrollable on narrow screens, and the candidate audit verifies that the accessibility layer stays visually clipped.

Code blocks and saved outputs also receive keyboard focus and region labels so wide examples remain scrollable on narrow screens.

Pull requests build and audit the complete article bundle before merge. Candidate artifacts for Fleet are uploaded only by successful main-branch pushes.

MyST's native article URLs are rewritten to the canonical `/articles/…/` routes, preserving queries and section fragments. The bundle audit follows local article links and verifies that linked articles resolve to article pages.


## Archival experiment boundary

The Portfolio publication candidate does not package or mint the scholarly archive for a Compiled Experiment. Its article references resolve through the exact Experiment Compiler projection and `experiments.tyharbin.com`.

When that experiment has separately passed source-owner disclosure/finalization review and has an immutable release in `pH34r-pH/compiled-experiments`, the verified projection may carry the exact release/Zenodo DOI relation for rendering. Portfolio must not discover archival identity from mutable live state or manufacture a DOI record itself.

The archive receives exact finalized package bytes without a Portfolio rebuild. Fleet remains the protected site-deployment authority; the archive/Zenodo step is a separate human-reviewed scientific-publication boundary.
