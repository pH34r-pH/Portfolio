# Publication input

The candidate job generates this directory from exact public source revisions. Its `publication.json` v2 records Portfolio, research-notes and theorem-library source SHAs and each notebook hash. The whole built site, including the generated JupyterLite application, is uploaded as one content-addressed artifact. Private Fleet validates and promotes that same artifact under its own release receipt; the public job cannot deploy it.

## MyST article rendering

Portfolio extracts the server-rendered article from the pinned MyST build and supplies its own navigation, source links, and browser runtime. The adapter removes MyST application controls that depend on its hydrated theme, retains heading IDs and legacy section aliases, and routes source attachments to the corresponding reader or source page. Shared article CSS sizes inline icons separately from figures. The finished-candidate audit checks every article at desktop and mobile widths, including icon dimensions, landmarks, source links, and accessibility.

Articles containing equations ship KaTeX CSS and fonts from the locked MyST dependency tree. This presents one visual equation while retaining the MathML layer for assistive technology. Display equations are keyboard-scrollable on narrow screens, and the candidate audit verifies that the accessibility layer stays visually clipped.

Code blocks and saved outputs also receive keyboard focus and region labels so wide examples remain scrollable on narrow screens.
