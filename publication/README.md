# Publication input

The candidate job generates this directory from exact public source revisions. Its `publication.json` v2 records Portfolio, research-notes and theorem-library source SHAs and each notebook hash. The whole built site, including the generated JupyterLite application, is uploaded as one content-addressed artifact. Private Fleet validates and promotes that same artifact under its own release receipt; the public job cannot deploy it.
