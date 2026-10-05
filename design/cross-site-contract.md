# Research and experiment publication contract

The public research site at `tyharbin.com` and the Compiler site at
`experiments.tyharbin.com` are two views of one publication system. Each site
owns its own HTML, CSS, build, and browser runtime. They share a recognizable
design language and linked context, not a coupled appearance preference or
runtime dependency.

## Shared design language

- Use the `TJHG / …` wordmark and a fixed, 58px top navigation bar.
- Use the Nacre family values as the light default: background `#e8e3d8`, panel
  `#f2eee5`, ink `#17191a`, muted text `#62615c`, rule `#aaa497`, and accent
  `#765466`. Keep contrast and state legible without relying on accent color.
- Use compact monospace labels for navigation, metadata, and identifiers; keep
  reading text open and comfortably sized.
- Frame content with paper-like panels and fine rules. Article figures and
  reported measurements remain authored content, not decorative surfaces.
- Keep site navigation and buttons at least 44px tall, increasing to 48px for
  coarse pointers. Provide a visible keyboard focus ring, reduced-motion
  support, narrow-screen layouts, and forced-colors behavior.

The Compiler can simplify the research site's four composition styles to its
own catalog and detail-page layouts. It does not need to copy the research
site's menus, decoration, notebook controls, or appearance selector.

## Navigation and article context

- The research site links to the experiment catalog with the label
  **Experiments**.
- Compiler pages link back to the research index with the label **Research**.
- A published research article links to a Compiled Experiment only when that
  exact package exists and the relationship is explicitly recorded.
- A Compiled Experiment may link back to its contextual article through
  `relatedArticles`, projected as catalog `backlinks`. Each backlink carries
  the article title, canonical HTTPS URL, and exact 40-character source commit.
- A backlink provides context; it does not claim that the package reproduces
  the article's primary experiment. The article and package must state any
  distinction clearly.
- If no exact package is published, the article says so. Do not substitute a
  similar run or infer a relationship from matching words.

## Independence and verification

The sites do not synchronize appearance settings or require shared client
code. Their navigation works if either site is served independently. The
Compiler owns the backlink projection and its escaping/validation tests; the
Portfolio candidate audit checks generated article routes, canonical source
pins, and the presence or absence of the correct experiment links. Both source
and generated output are reviewed before protected publication.


## Archival release relation

The cross-site contract may carry one optional immutable archival relation for an exact experiment:

```text
exact Experiment Compiler identity
  -> exact pH34r-pH/compiled-experiments GitHub Release/tag
  -> exact Zenodo DOI/record (after archival publication)
```

This relation is derived from authoritative archive/source metadata and is never resolved through a mutable `latest` release. It is optional: an experiment can remain a valid live reproduction object without an archival DOI.

The relation does not change the existing ownership boundary:
- Portfolio owns explanation and article URLs;
- Experiment Compiler / `experiments.tyharbin.com` owns live reproduction identity/presentation;
- `compiled-experiments` owns the exact reviewed archival copy and GitHub Release lineage;
- Zenodo supplies the external DOI record after the human publication step.

A release or DOI must never be interpreted as scientific acceptance, successful independent reproduction, or Portfolio/Fleet deployment state.
