# Homepage transfer budget policy (draft)

This policy defines a homepage-only initial-navigation transfer warning and
blocking threshold. Transfer size is Lighthouse's `resource-summary` total
`transferSize` in decimal bytes for the initial navigation.

| Observed bytes | Result |
|---:|---|
| 0–500,000 | Pass |
| 500,001–750,000 | Warning |
| 750,001 and above | Blocking error |

Boundaries are strict: exactly 500,000 bytes passes, and exactly 750,000 bytes
warns without blocking. The policy is limited to `/`. It does not set an article
or research-page total cap.

## Rationale and limits

The 500,000-byte warning boundary is a design target based on an 8 Mbit/s
connection profile: 500,000 bytes take 0.5 seconds to serialize at 1,000,000
bytes/second. That calculation covers payload serialization only. It excludes
round-trip time, server response time, dependency scheduling, and device work;
8 Mbit/s is not asserted to be an average or minimum connection speed.

The comparison point is Dennis Snellenberg's portfolio, with three Lighthouse
cold runs per profile: mobile median 493,673 bytes (487,840–493,673), desktop
670,488 bytes in each run. This is one peer and therefore limited evidence.
The exact PR91 homepage bundle measured 196,215 bytes on mobile and 271,111
bytes on desktop in the existing Lighthouse profiles. In a separate bounded
mobile 8 Mbit/s profile, three runs each measured 196,215 bytes; performance
scores were 0.98–0.99, accessibility 1.00, LCP 2,107–2,151 ms, TBT 61–93 ms,
and CLS 0.00155. The study records the setup, raw reports, and caveats in
[`performance-budget-study.md`](performance-budget-study.md).

The 750,000-byte blocking boundary leaves 250,000 bytes of warning headroom
above the design target. It is a policy choice for review, not a peer-derived
performance claim. The separate 50,000-byte script and stylesheet limits stay
in force.

## Independent quality gates

The transfer warning and error do not replace Lighthouse performance,
accessibility, best-practices, SEO, LCP, CLS, or TBT assertions. Automated
accessibility must remain 1.00, alongside keyboard, focus, touch, and semantic
interaction checks. Lighthouse timing or functional-invalid results such as
`NO_LCP`, a failed navigation, or a crashed browser do not count as passing
performance observations.

## Configuration behavior

`lighthouserc.cjs` has one `resource-summary:total:size` assertion with a
750,000-byte maximum. A separate postprocessor emits at most one warning or
blocking annotation per Lighthouse report, avoiding duplicate Lighthouse
assertion keys. Boundary behavior is covered by
`scripts/test-lighthouse-transfer-budget.mjs`.
