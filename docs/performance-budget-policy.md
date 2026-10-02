# Initial-page transfer budget policy (draft)

This policy defines an initial-navigation transfer warning and blocking
threshold for every Lighthouse-audited route and profile. Transfer size is
Lighthouse's `resource-summary` total `transferSize` in decimal bytes for that
page load.

| Observed bytes | Result |
|---:|---|
| 0–500,000 | Pass |
| 500,001–750,000 | Warning |
| 750,001 and above | Blocking error |

Boundaries are strict: exactly 500,000 bytes passes, and exactly 750,000 bytes
warns without blocking. It applies equally to homepage, research, about, atlas,
reproduce, article, and other routes whenever included in an audit manifest.
No page class receives a separate total cap.

## Rationale and limits

The 500,000-byte warning boundary is a design target based on an 8 Mbit/s
connection profile: 500,000 bytes take 0.5 seconds to serialize at 1,000,000
bytes/second. That calculation covers payload serialization only. It excludes
round-trip time, server response time, dependency scheduling, and device work;
8 Mbit/s is not asserted to be an average or minimum connection speed.

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

The 750,000-byte blocking boundary leaves 250,000 bytes of warning headroom
above the design target. It is a policy choice, not a peer-derived performance
claim.

## Independent quality gates

The transfer warning and error do not replace Lighthouse performance,
accessibility, best-practices, SEO, LCP, CLS, or TBT gates. Automated
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
the external Experiments host. CI retains the manifests and full JSON reports
as a 30-day workflow artifact, including on failed audits. The checker emits
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
