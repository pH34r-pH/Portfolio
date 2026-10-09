# Page transfer budget policy

Page transfer size is observational while the owner establishes peak visual
quality. A 20 MB warning prompts review; it does not reduce quality or block a
candidate. The earlier 10 MB hard page cap and 8 MB recording cap are removed.

| Observed bytes | Result |
|---:|---|
| 0–20,000,000 | Pass |
| 20,000,001 and above | Warning |

Exactly 20,000,000 bytes passes. The same policy applies to every audited route.
Invalid reports still fail. Lighthouse resource-summary measures encoded bytes
for a particular initial navigation; activated article and homepage observations
also count complete lazy/worker payloads. A video fallback's complete file size
must be reported separately from its first buffered range.

## Rationale and limits

On October 9, 2026 the owner asked to push crystal-clear native 4K/8K rendering
at high refresh rates, measure the resulting size, and optimize only after
accepting quality. The prior 500 KB and then 10 MB caps are historical targets.
The replacement homepage replays actual tensors with WebGPU/WebGL2 and draws
at native device DPR; the 30 fps recording is a failure fallback. Article model
inference selects supported, numerically qualified computation independently.

Downloaded bytes are not runtime memory. A single RGBA8 8K buffer alone uses
132,710,400 bytes before depth/MSAA/other resources. CPU submission time is not
GPU completion time or proof of physical 120/144 Hz. Evidence must name the
actual browser/adapter/backend, buffer size, timer availability, and whether
refresh was physically measured or only a configured rendering target.

The comparison point is Dennis Snellenberg's portfolio homepage, with three Lighthouse
cold runs per profile: mobile median 493,673 bytes (487,840–493,673), desktop
670,488 bytes in each run. This is one peer and therefore limited evidence.
The exact PR91 homepage bundle measured 196,215 bytes on mobile and 271,111
bytes on desktop in the Lighthouse profiles. Other audited routes retain their
own observations in the study, with no substitution of homepage measurements.
In a separate bounded mobile 8 Mbit/s profile, three runs each measured
196,215 bytes; performance scores were 0.98–0.99, accessibility 1.00, LCP
2,107–2,151 ms, TBT 61–93 ms, and CLS 0.00155. The study records setup, raw
reports, and caveats in
[`performance-budget-study.md`](performance-budget-study.md).

Those comparison measurements describe the earlier implementation and do not
qualify the repaired site. They remain historical evidence in the study.

## Independent quality gates

Performance scores, LCP and TBT now produce observations/warnings while the
quality bar is established. Accessibility, best-practices, SEO, and
CLS remain blocking gates. Automated
accessibility must remain 1.00, alongside keyboard, focus, touch, and semantic
interaction checks. SEO must remain at least 0.95. The expanded CI matrix
exposed a missing meta description on `/research/`; the page now describes its
research articles, reproducible experiments, and evidence-led explanations.
Lighthouse timing or functional-invalid results such as `NO_LCP`, a failed
navigation, or a crashed browser do not count as passing performance
observations.

## Configuration behavior

The postprocessor requires both mobile and desktop LHCI manifests and validates
exactly three reports for each of `/`, `/about/`, `/atlas/`, `/reproduce/`, and
`/research/` in each profile. It matches each report's original requested URL
to its manifest route, while still counting redirects and their resources in
the initial-navigation transfer. For example, `/reproduce/` currently lands on
the external Experiments host. CI emits compact summaries and retains full
Lighthouse reports only for explicitly requested detailed review. The checker emits
at most one policy annotation per report.
Script and stylesheet sizes remain available as resource-summary diagnostics
in raw reports and are not hard byte gates. Boundary behavior is covered by
`scripts/test-lighthouse-transfer-budget.mjs`.

The owned CI server negotiates Brotli (quality 5) or gzip for textual resources,
sets `Content-Encoding` and `Vary: Accept-Encoding`, and uses the observed
`public, must-revalidate, max-age=30` cache policy. This makes Lighthouse's
`transferSize` reflect encoded payload delivery instead of raw file bytes.
It remains a local approximation: it does not reproduce Azure/CDN edge
negotiation, generated validators, or every deployment-specific header. The
separate production-like bundle study describes its matching compression and
the remaining deployment differences.
