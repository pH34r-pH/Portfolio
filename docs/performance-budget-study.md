# Performance budget study (draft)

This is the measurement record for the initial-page transfer policy in
[`performance-budget-policy.md`](performance-budget-policy.md). The existing
50 kB script and stylesheet hard assertions have been removed; their resource
breakdowns remain diagnostics in raw reports. The former 150 kB total assertion
was not supported by the relevant peer data and has been replaced by the
policy's warning/block thresholds.

## Frozen reference set

The companion harness at [`scripts/benchmark-performance-references.mjs`](../scripts/benchmark-performance-references.mjs)
measures these preselected routes in the listed order. Award recognition is a
cohort-selection fact, not evidence that a site is fast, accessible, or a good
budget target. Editorial, educational, interactive, portfolio, archived, and
successor pages remain separate classes in analysis.

| Page | Class / provenance caveat | Recognition evidence |
|---|---|---|
| [Quanta Magazine feature](https://www.quantamagazine.org/sea-monkeys-show-scientists-how-to-rewrite-a-rule-of-turbulence-20261002/) | Editorial | [2025 Webby People's Voice, Science](https://winners.webbyawards.com/2025/websites-and-mobile-sites/general-desktop-mobile-sites/science/324307/quanta-magazine) |
| [NASA Crew 13 release](https://www.nasa.gov/news-release/nasas-spacex-crew-13-launches-to-international-space-station/) | Editorial / institutional | [2025 Webby / People's Voice, Government & Associations](https://winners.webbyawards.com/2025/websites-and-mobile-sites/general-desktop-mobile-sites/government-associations/323048/nasagov) |
| [MIT Climate Primer chapter](https://climateprimer.mit.edu/climate-science/) | Educational editorial; organizer-archive verification remains unresolved | MIT creator/institution and 2020 Webby educational-feature provenance supplied by researcher; final bibliography pending |
| [Seeing Theory probability chapter](https://seeing-theory.brown.edu/basic-probability/index.html) | Interactive educational site; archived 2017 site | [2017 Information is Beautiful Awards, Silver, Science/Technology/Health](https://www.informationisbeautifulawards.com/showcase/2296-seeing-theory) |
| [Dennis Snellenberg portfolio](https://dennissnellenberg.com/) | Interactive portfolio | [Awwwards Site of the Day / Developer Award](https://www.awwwards.com/sites/dennis-snellenberg) |
| [Bruno Simon portfolio](https://bruno-simon.com/) | Current WebGPU/TSL successor; not the same implementation as the award-recognized 2019 build | [Awwwards award page](https://www.awwwards.com/sites/bruno-simon-portfolio) |
| [Breakthrough Energy 2023 foreword](https://2023.breakthroughenergy.org/bill-foreword/) | Archived 2023 educational/editorial feature; distinguish intro shell from entered content | [2024 Webby and People's Voice, Science](https://winners.webbyawards.com/winners/websites-and-mobile-sites/general-desktop-mobile-sites/science) |

Quanta, NASA, Dennis Snellenberg, Bruno Simon, and Breakthrough Energy were
verified award references. MIT is retained with its stated verification caveat.
Seeing Theory is a verified prior-year honoree, and is explicitly treated as an
archived educational reference. HHMI Beautiful Biology is excluded because the
site returned a browser-blocked 403 in the independent check; it will not be
replaced with a lighter page. No results-based substitutions are allowed.

## Measurement method

- Toolchain: project-lock Lighthouse 12.6.1 (`@lhci/cli` 0.15.1), Playwright
  1.55.0, Node 22, and Playwright Chromium 140.0.7339.16. Record host, exact
  browser binary, and run time with every result. This container also has system
  Chromium 151, but it is not the selected browser for this cohort.
- The environment routes HTTPS through an inspection proxy. Chromium initially
  rejected that proxy's certificate while `curl` trusted it. The study imports
  `/usr/local/share/ca-certificates/environment-proxy-ca.crt` into a disposable
  NSS database under `/tmp/portfolio-perf-study/browser-home`, then runs with
  that directory as `HOME` for Lighthouse and Playwright. Normal certificate checks stay enabled; do not use
  `--ignore-certificate-errors`. The CA fingerprint is
  `C7:1B:4D:1E:9D:77:75:C5:38:C6:88:AB:10:CE:A9:CE:41:7D:73:12:E8:98:38:F9:D1:5F:F7:32:56:CD:7F:C3`.
- For each run, use a fresh Lighthouse Chrome process/profile with storage and
  browser cache reset enabled by Lighthouse defaults. This is a cold browser
  profile, not a cold CDN/origin; shared WAN caches and server state are outside
  the lab's control. Run serially, in three rounds,
  keeping the predeclared URL order. Each round measures all reference pages in
  mobile mode and then desktop mode. Lighthouse's default simulated throttling
  applies to mobile; desktop uses the Lighthouse desktop preset.
- Keep complete raw Lighthouse JSON (including request/resource audits), stderr,
  final screenshot, per-sample final URL, scores, timings, and resource totals.
  The harness takes a separate Playwright header/content survey once per
  reference and mode and keeps response headers, final URL, title, body text,
  screenshot, and errors. A failed navigation, unexpected redirect,
  blocked/blank page, unentered interactive shell, or non-200 page is an invalid
  observation and remains visible in the report; never count it as a lightweight
  result. Do not hide consent UI, ads, analytics, or third-party requests.
- Summarize every valid sample using median and range. Report reference classes
  separately and show full-cohort results alongside quality-qualified subsets;
  do not treat these heterogeneous seven sites as interchangeable peers.
- Measure Portfolio's source fixture and the fully assembled, production-like
  publication bundle on localhost, separate from WAN references. The source
  harness owns a server bound to port 0 and waits for a successful readiness
  request. It uses Brotli and the cache policy observed on the live site
  (`public, must-revalidate, max-age=30`), records response headers, and captures
  a cold Lighthouse sample plus cold/repeat same-profile warm navigation using
  the Playwright CDP network events. The bundle
  requires the workflow's pinned Portfolio, Research Notes, Theorem Library,
  and Compiler inputs, MyST render, locked Python build, and JupyterLite finish.
  Record compressed transfer and decoded resource sizes separately, with
  response headers, cache policy, and compression behavior. Include a cold
  profile and a warm-cache navigation where feasible.
- Score and screenshot review qualify whether a peer run represents meaningful
  content. An award does not imply speed or accessibility. Accessibility needs
  its own findings and manual review; a byte budget cannot stand in for it.

The runner preserves one report per observation under
`/tmp/portfolio-perf-study/reports` by default and writes a rolling summary.
Peer-cohort invocation (from this repository root; use Node 22 on `PATH`):

```sh
export BROWSER_HOME=/tmp/portfolio-perf-study/browser-home
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.onboarding/cache/playwright
export CHROME_PATH=/workspace/.onboarding/cache/playwright/chromium-1187/chrome-linux/chrome
BROWSER_VERSION='140.0.7339.16' \
node scripts/benchmark-performance-references.mjs --runs 3
node scripts/benchmark-local-source.mjs --root site --runs 3
```

For this environment, create the isolated certificate store once with
`certutil -N --empty-password -d sql:/tmp/portfolio-perf-study/browser-home/.pki/nssdb`
and import the certificate using `certutil -A -d
sql:/tmp/portfolio-perf-study/browser-home/.pki/nssdb -n 'Environment HTTPS
inspection root' -t 'C,,' -i
/usr/local/share/ca-certificates/environment-proxy-ca.crt`. Set the Node 22
binary directory at the front of `PATH`; the host's default Node is 24 and is
outside the repository's declared engine range.

The proposal below separates measured local page classes, compressed transfer
from decoded bytes, and resource ceilings from quality gates. The external
award-reference cohort remains too small and heterogeneous to support a robust
page-class percentile, so the proposal is not presented as a peer percentile.

## Local evidence and limits

This draft records source/input revisions, commands, environment, invalid
samples, summary data, and the review decision supporting the policy. Do not
run peer-cohort collection in GitHub Actions or publish cohort reports
publicly. Normal exact-head CI validates the policy on Portfolio's own pages.
Do not attribute the present Bruno Simon successor to the implementation
shown in the award entry.

## Setup evidence (2026-10-02)

- Portfolio main: `a92e93cf91efabf4357c67bedb5a9e19486a1c71`. PR91 measured
  source head: `f7a0bfa3e5bb02d72e8a150b4c8e25f5ac93c0cf`. No PR91 runtime,
  tests, or workflow files were modified by this study.
- Exact current public dependency heads fetched to isolated `/tmp` checkouts:
  Research Notes `965fb9186a0c1bb99cc3bd60b2e86668b0f12a91`, Theorem Library
  `cbc5eebbea115decdc27e2e32bb0dc79738a5947`, and pinned Experiment Compiler
  `529340af3d2ad37a1da3093b198d40bc3af6ce60` (projection SHA-256
  `fcc06ca34cfbbacbf29ffc40807ceec528e0ed5f67b98b253406f8c0c03d1`). Node
  22.23.3, Python 3.12.14, Lighthouse 12.6.1, Playwright 1.55.0, and Chromium
  140.0.7339.16 are available for the study.
- The exact pinned MyST render, 13 × 4 article exports, bundle assembly,
  JupyterLite build, return-navigation finish, Pagefind 1.5.2 indexing, and
  bundle digest completed for PR91. The Compiler projection was built from
  `7bf2e42fe1882e3bed9828b43f4354523fd50bd5`; exact validation was not
  bypassed. Bundle tree digest:
  `e26fd1aa01e2a4ae1b4126bdf170469bb1f349dcb01f621394ea2a29f976c0fd`
  (1,428 files). The build and measurement directories are local under
  `/tmp/portfolio-perf-study/pr91/` and are not committed into the site.
- `scripts/benchmark-performance-references.mjs` completed 42 serial Lighthouse
  attempts: three rounds per frozen URL, mobile then desktop. Raw reports,
  stderr, screenshots where available, review header surveys, and the rolling
  summary are in `/tmp/portfolio-perf-study/reports`. Twenty-one runs have a
  Lighthouse performance score on visible, meaningful content. Three MIT
  desktop runs show the infographic graph and successful document/resources,
  but have no LCP and therefore no performance score; keep their resource
  totals separate from scored timing results. The other 18 attempts did not
  produce qualifying content/performance observations:

  | Reference | Outcome |
  |---|---|
  | NASA Crew 13 | Six raw attempts; Chromium tab crashed each time. No result was scored. |
  | Bruno Simon current successor | Six raw attempts; Lighthouse failed on a stopped page, `NO_LCP`, protocol/body timeouts, or an unhandled page promise. No result was scored. This is not the 2019 award implementation. |
  | Breakthrough Energy foreword | Five screenshots show only the dark intro/entry screen, with no meaningful feature content or LCP. The sixth attempt returned HTTP 503. These are invalid for page-budget comparison. |

- For pages with meaningful content and a performance score, all three samples
  per mode are available for Quanta, MIT mobile, Seeing Theory, and Dennis
  Snellenberg. The score table summarizes the three cold-browser-profile runs.

  | Page and mode | Perf median (range) | A11y median | LCP seconds (range) |
  |---|---:|---:|---:|
  | Quanta mobile | 0.56 (0.37–0.58) | 0.79 | 6.88 (5.97–21.89) |
  | Quanta desktop | 0.92 (0.91–0.94) | 0.86 | 1.70 (1.58–1.90) |
  | MIT mobile | 0.60 (0.51–0.69) | 1.00 | 5.26 (3.10–14.69) |
  | MIT desktop | no LCP score | 1.00 | unavailable |
  | Seeing Theory mobile | 0.53 (0.48–0.56) | 0.67 | 8.77 (6.58–9.03) |
  | Seeing Theory desktop | 0.87 (0.86–0.89) | 0.63 | 1.83 (1.77–1.84) |
  | Dennis Snellenberg mobile | 0.56 (0.46–0.67) | 0.74 | 3.47 (3.42–4.46) |
  | Dennis Snellenberg desktop | 0.72 (0.68–0.87) | 0.55 | 0.96 (0.96–1.20) |

  The byte table reports median (range) across three runs. For each resource
  type, transfer is Lighthouse's compressed `transferSize`; decoded is the
  request audit's uncompressed `resourceSize`. Values are decimal units.

  | Page and mode | Total T / D, kB | Script T / D, kB | Stylesheet T / D, kB |
  |---|---:|---:|---:|
  | Quanta mobile | T 7240.888 [6353.710–7240.915] / D 10289.817 [10191.518–10770.457] | T 1385.880 [1385.704–1386.155] / D 4340.695 [4340.695–4340.700] | T 81.119 [81.087–81.220] / D 469.155 [469.155–469.155] |
  | Quanta desktop | T 8033.342 [8033.171–8110.598] / D 11562.176 [10983.252–11584.744] | T 1385.744 [1385.390–1385.964] / D 4340.695 [4340.675–4340.695] | T 81.137 [81.090–81.475] / D 469.155 [469.155–469.155] |
  | MIT mobile | T 3465.853 [2160.811–4350.439] / D 6904.043 [6676.064–7629.184] | T 390.399 [390.147–390.782] / D 1379.291 [1379.291–1379.919] | T 0 [0–0] / D 0 [0–0]; no external CSS bytes |
  | MIT desktop | T 3538.441 [1534.155–7276.206] / D 5817.057 [5696.176–11694.178] | T 454.317 [454.233–454.790] / D 1605.880 [1605.880–1605.900] | T 0 [0–0] / D 0 [0–0]; no external CSS bytes |
  | Seeing Theory mobile | T 1315.494 [1315.464–1315.527] / D 2444.362 [2443.734–2444.382] | T 697.837 [697.812–697.881] / D 1804.023 [1803.395–1804.043] | T 42.043 [42.034–42.048] / D 69.914 [69.914–69.914] |
  | Seeing Theory desktop | T 1305.543 [1305.465–1305.625] / D 2434.110 [2434.110–2434.130] | T 697.826 [697.768–697.859] / D 1803.395 [1803.395–1803.415] | T 42.042 [42.034–42.051] / D 69.914 [69.914–69.914] |
  | Dennis Snellenberg mobile | T 493.673 [493.660–493.861] / D 1261.529 [1261.509–1262.137] | T 268.866 [268.837–269.029] / D 799.302 [799.282–799.910] | T 20.161 [20.148–20.170] / D 116.291 [116.291–116.291] |
  | Dennis Snellenberg desktop | T 670.488 [670.433–670.674] / D 1437.936 [1437.916–1437.936] | T 268.874 [268.773–269.051] / D 799.302 [799.282–799.302] | T 20.144 [20.143–20.165] / D 116.291 [116.291–116.291] |

  This is evidence of heterogeneous page costs and browser variance, not a
  proposed threshold. Automated accessibility scores are not a complete
  quality review. The content-qualified resource set is limited to observable
  meaningful pages; low a11y scores are retained in the table, and no site is
  declared accessible based on its award. No post-hoc a11y cutoff was used.

- The header/content re-survey ran after the Lighthouse cohort. The environment
  proxy returned HTTP 503 (`Server: envoy`) on every mobile/desktop survey
  except Seeing Theory mobile and Dennis mobile. Those two main documents
  returned 200 and visible content, though several dependencies returned 503.
  These later 503s were not substituted into earlier Lighthouse results. The
  review artifacts preserve the statuses and screenshots. An earlier `curl`
  check returned HTTP 200 for all seven routes; no 503 was bypassed with retries
  or another client. A separate bounded userflow check then received HTTP 200,
  found the accessible `Enter Website` button, and activated it once. Seven
  seconds later the viewport was blank below the site header; body text remained
  empty and 11 requests had failed/aborted, including video/telemetry requests.
  Thus this attempt did not capture meaningful entered article content and is
  not a scored page result. Before/after screenshots and the complete check
  output are `breakthrough-entry-before.png`, `breakthrough-entry-after.png`,
  and `breakthrough-entry-userflow.json` under the peer raw evidence directory.
- The separate source-fixture run measured `/` and `/research/` three times in
  each mode (12 cold Lighthouse reports), using the observed production-like
  Brotli and 30-second cache policy. It remains source-only, not the generated
  publication bundle. All 12 reports scored 1.00 performance and 1.00
  accessibility in this lab. Homepage median LCP was 1.660 s (1.511–1.662) on
  mobile and 0.369 s (0.368–0.372) on desktop. Its total transfer/decoded sizes
  were 106,282/153,561 bytes; scripts were 2,804/7,481 and stylesheet
  10,583/50,133 bytes. Research-index median LCP was 1.504 s (1.503–1.507)
  mobile and 0.364 s (0.363–0.364) desktop, with 67,147 transfer and 113,490
  decoded bytes; it used the same script and stylesheet bytes. Same-profile repeat navigation
  reduced homepage transferred bytes from 106,282 to 209; the only server
  re-request was the missing generated `publication.json` (404), while static
  files were cache-served. This cache result belongs to the source fixture, not
  a finished-candidate measurement.
- The source-fixture runner owns a port-0 loopback server, waits for readiness,
  and runs Lighthouse asynchronously so it does not block its own server. The
  first attempt exposed and fixed a synchronous-child-process/event-loop
  deadlock; that invalid attempt produced no report and is excluded above.
- The live `tyharbin.com` site separately returned Brotli for HTML/CSS/JS,
  `Vary: Accept-Encoding`, and `Cache-Control: public, must-revalidate,
  max-age=30`. The local source runner reproduces those delivery behaviors, but
  does not reproduce deployment-generated entity-tag/last-modified metadata
  and is not represented as the Azure host implementation.
- The initial 150,000-byte total assertion was replaced by the warning/error
  policy; former script and stylesheet hard byte assertions were removed while
  their breakdowns remain in the raw reports. The external cohort's failed/blank runs
  remain excluded, and the local model article has no valid Lighthouse
  performance score; these limits prevent a peer-derived interactive-page
  percentile.

## Finished PR91 bundle observations (2026-10-02)

The run used the same Node 22.23.3, Lighthouse 12.6.1, Playwright 1.55.0,
Chromium 140.0.7339.16, mobile viewport 390×844 and desktop viewport 1350×900,
serial 3-round protocol as the source fixture. Every Lighthouse run used a
fresh browser process and an ephemeral owned loopback server port. The server
returned readiness GET 200 before capture. Responses included
`Content-Encoding: br`, `Vary: Accept-Encoding`, and
`Cache-Control: public, must-revalidate, max-age=30`; Brotli quality 5 was
negotiated by Lighthouse. This reproduces the observed production compression
and cache policy but is not the Azure origin implementation. Raw server logs
preserve request and response headers for readiness, Lighthouse, and Playwright
requests.

The exact Portfolio SHA measured was
`f7a0bfa3e5bb02d72e8a150b4c8e25f5ac93c0cf`; dependency pins were Research Notes
`965fb9186a0c1bb99cc3bd60b2e86668b0f12a91`, Theorem Library
`cbc5eebbea115decdc27e2e32bb0dc79738a5947`, Compiler
`7bf2e42fe1882e3bed9828b43f4354523fd50bd5`. Routes were `/`, `/research/`,
and the model-rich article `/articles/005-unit-hypersphere-anomaly/`. The
18 completed runs had successful Lighthouse processes and retained JSON. Home
and research produced all 12 scored runs. The model article rendered its model
in the screenshots, but all 6 runs returned `NO_LCP`: retain its bytes,
accessibility, and CLS observations, and do not report a performance score or
LCP for it. One bounded follow-up on a text-led article route had browser-tab
crashes in all six runs; it is an invalid capture and no retry was made.

Scores are median (range); LCP and TBT are milliseconds; CLS is unitless.
Resource figures are decimal kB, median (range), for transfer / decoded bytes.
The resource rows include all requests Lighthouse reports for that local route.

| PR91 bundle route / mode | Perf | Accessibility | LCP | TBT | CLS | Total T / D | Script T / D | CSS T / D |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Home mobile | .99 (.98–.99) | 1.00 (1–1) | 2,111 (2,110–2,114) | 74 (0–105) | .00155 (.00155–.00155) | 196.2 (196.2–196.2) / 303.2 (303.2–303.2) | 11.4 (11.4–11.4) / 33.4 (33.4–33.4) | 16.2 (16.2–16.2) / 74.9 (74.9–74.9) |
| Home desktop | 1.00 (1–1) | 1.00 (1–1) | 569 (567–575) | 0 (0–0) | .00028 (.00028–.00028) | 271.1 (271.1–271.1) / 378.1 (378.1–378.1) | 11.4 (11.4–11.4) / 33.4 (33.4–33.4) | 16.2 (16.2–16.2) / 74.9 (74.9–74.9) |
| Research mobile | .99 (.99–1.00) | 1.00 (1–1) | 1,508 (1,507–1,511) | 57 (36–62) | .06985 (0–.06985) | 82.1 (82.1–82.1) / 171.4 (171.4–171.4) | 9.5 (9.5–9.5) / 28.4 (28.4–28.4) | 13.0 (13.0–13.0) / 61.2 (61.2–61.2) |
| Research desktop | 1.00 (1–1) | 1.00 (1–1) | 381 (375–383) | 67 (49–79) | 0 (0–0) | 82.1 (82.1–82.1) / 171.4 (171.4–171.4) | 9.5 (9.5–9.5) / 28.4 (28.4–28.4) | 13.0 (13.0–13.0) / 61.2 (61.2–61.2) |
| Model article mobile | no score (`NO_LCP`) | 1.00 (1–1) | unavailable (`NO_LCP`) | unavailable (`NO_LCP`) | .388 (.124–.388) | 442.5 (442.5–494.5) / 2,372.5 (2,372.5–2,424.3) | 412.1 (412.1–412.1) / 2,249.1 (2,249.1–2,249.1) | 16.4 (16.4–16.4) / 74.3 (74.3–74.3) |
| Model article desktop | no score (`NO_LCP`) | 1.00 (1–1) | unavailable (`NO_LCP`) | unavailable (`NO_LCP`) | .260 (.260–.260) | 494.5 (442.5–494.5) / 2,424.3 (2,372.5–2,424.3) | 412.1 (412.1–412.1) / 2,249.1 (2,249.1–2,249.1) | 16.4 (16.4–16.4) / 74.3 (74.3–74.3) |

Same-profile browser cold/repeat cycles are separate from Lighthouse cold
profiles. Across three rounds, homepage transferred 147,291 encoded bytes on
mobile cold and 270,725 on desktop cold, then 5,369 on repeat with 11/12
requests served from cache. Research transferred 81,737 cold and 5,369 repeat
with 7/8 requests cached. The model article transferred 442,148–494,116 cold
and 5,369 repeat, with 26–27 of 27–28 requests served from cache. All captured
browser navigations succeeded. These cache results are lab-local, under the
declared 30-second cache policy.

The peer metric table below records medians and full three-run ranges for each
eligible site/profile. Units: performance and accessibility are 0–1 scores;
LCP/TBT are milliseconds; CLS is unitless. `—` means no valid score/metric, not
zero. Accessibility is measured on the meaningful capture even for the three
MIT desktop reports without an LCP/performance score.

| Reference / profile | Perf | A11y | LCP | TBT | CLS |
|---|---:|---:|---:|---:|---:|
| Quanta mobile | .56 (.37–.58) | .79 (.79–.79) | 6,880 (5,966–21,892) | 463 (370–803) | .00002 (0–.00002) |
| Quanta desktop | .92 (.91–.94) | .86 (.86–.86) | 1,703 (1,580–1,896) | 8 (3–11) | .000002 (.000002–.00009) |
| MIT Climate Primer mobile | .60 (.51–.69) | 1.00 (1–1) | 5,256 (3,103–14,691) | 847 (697–1,261) | 0 (0–0) |
| MIT Climate Primer desktop | — (no LCP) | 1.00 (1–1) | — | — | 0 (0–0) |
| Seeing Theory mobile | .53 (.48–.56) | .67 (.67–.67) | 8,769 (6,578–9,028) | 373 (329–503) | 0 (0–0) |
| Seeing Theory desktop | .87 (.86–.89) | .63 (.63–.63) | 1,826 (1,773–1,840) | 60 (40–65) | .00185 (.00185–.00185) |
| Dennis Snellenberg mobile | .56 (.46–.67) | .74 (.74–.74) | 3,473 (3,424–4,457) | 297 (256–305) | .490 (.236–.549) |
| Dennis Snellenberg desktop | .72 (.68–.87) | .55 (.55–.55) | 961 (959–1,197) | 0 (0–3) | .419 (.201–.420) |

The accompanying byte table above has the corresponding median/range for total,
script, and stylesheet transfer and decoded bytes for these same page/profile
groups. NASA and Bruno have no valid observations; Breakthrough's captured
intro shell has no page score and remains excluded despite some completed LHR
processes. These exclusions avoid treating blank/failed states as cheap wins.

## PR91 route and model diagnostics

All Portfolio routes were evaluated from the finished PR91 publication bundle
on localhost. The host uses an ephemeral `127.0.0.1` port per sample; paths are
stable: `/`, `/research/`, `/articles/005-unit-hypersphere-anomaly/`, and
`/articles/accessible-does-not-imply-used/`. The final route is the text-led
article follow-up that crashed. Do not treat localhost response-time values as
WAN or Azure measurements.

The model-rich article's 412,138-byte script transfer / 2,249,135-byte decoded
script total comes from these top contributing requests (Lighthouse request
audit; byte counts are median-identical across the three runs per profile):

| Request | Transfer bytes | Decoded bytes |
|---|---:|---:|
| `/assets/vendor/three@0.186.1/three.core.js` | 244,947 | 1,458,113 |
| `/assets/vendor/three@0.186.1/three.module.js` | 121,617 | 662,772 |
| `/assets/model-scene.js` | 9,142 | 30,581 |
| `/assets/model-machine.js` | 7,848 | 25,523 |
| `/assets/model-glass.js` | 4,808 | 15,340 |
| `/assets/model-instruments.js` | 2,846 | 9,303 |
| `/assets/model-topology.js` | 2,771 | 6,006 |
| `/assets/article-runtime.js` | 2,483 | 7,408 |

The first two requests account for 366,564 transfer bytes and 2,120,885
decoded bytes. This is the model engine, specifically Three.js, not a different
article library. The built article HTML includes `<script type="module"
src="/assets/model-machine.js">`; its DOM has a `[data-model-machine]` root,
no `data-model-start` button, and no `modelStartup` instance. In PR91's
`model-machine.js`, the visible-root `IntersectionObserver` calls `boot()` when
there is no startup controller; `boot()` dynamically imports the pinned Three.js
module and scene. CDP recorded both Three.js module requests with the initiator
stack in `model-machine.js`'s `boot()` (line 206 in the measured source). The
diagnostic observed `data-render="webgl"`, `diagnostics.quality.effective` as
`refraction`, and no start button. Thus Three.js loads and the model starts
before any explicit user start action on this article route. This is specific
to this generated article markup and does not infer startup behavior on the
homepage.

Lighthouse's `cumulative-layout-shift` audit supplies the numeric CLS values;
the separate `cls-culprits-insight` audit identifies these nodes. Mobile's
largest reported source is the inspect glass panel,
`section.model-machine > div.machine-spatial-host > div.machine-instruments >
section.machine-glass-panel` (`data-glass-panel="inspect"`), with per-shift
scores .14134 and .12356 (the third run reports .12356). Desktop's largest
source is `div#skip-to-frontmatter > section.model-machine >
div.machine-spatial-host > div.machine-instruments`, score .259996; the audit
also reports the article figure
`figure#id-005-unit-hypersphere-anomaly-intuition`, score .06514. These are
Lighthouse-attributed shift sources; they show which elements moved, not a
proved underlying code cause.

The model article has First Contentful Paint (1,514 ms in the saved-trace
diagnostic) but Lighthouse returns `NO_LCP`. Its saved Chrome trace contains
first-contentful-paint events and LCP invalidation events, but no LCP candidate
event; Lighthouse's trace engine therefore throws `LanternError: NO_LCP`, which
also prevents TBT synthesis. The instrumented Playwright run captured a
rendered WebGL canvas, no `pageerror`, and no failed requests. Console output
contained Chromium's software-WebGL fallback warning and two GPU `ReadPixels`
stall warnings only. A canvas itself is not an LCP candidate, but these data do
not establish that as the cause: there are text and image elements elsewhere
in the document. Treat the absent LCP event as unresolved measurement behavior,
not a zero and not evidence of speed.

The text-led article diagnostic used one verbose Lighthouse capture with Chrome
stderr logging enabled. Lighthouse records `TARGET_CRASHED`, then
`Browser tab has unexpectedly crashed`; the runtime error is not an HTTP/proxy
status. Its devtools log shows the document, styles, article SVGs, scripts, and
font requests completed before the crash. No Chrome `FATAL`/renderer exit
message was surfaced in captured stderr, and cgroup OOM counters remained zero.
The underlying Chromium renderer termination reason is therefore unknown; do
not attribute it to the proxy or memory pressure without evidence. No further
retries were made. The full verbose stderr and 23-byte trace artifact are kept
with the debug LHR files.

## Initial-page transfer policy evidence

The selected policy warns above 500,000 bytes and blocks above 750,000 bytes
for every initial navigation in the mobile and desktop audit profiles. The
500,000-byte warning boundary is a design target corresponding
to about 0.5 seconds of payload serialization at 8 Mbit/s; it excludes RTT,
TTFB, dependencies, and device work, and is not a verified population
statistic. Dennis Snellenberg, the single measured portfolio peer, had a
three-run mobile median of 493,673 bytes (range 487,840–493,673) and desktop
median 670,488 bytes (same value all three runs). The PR91 homepage measured
196,215 bytes mobile and 271,111 bytes desktop under the slow mobile and
desktop Lighthouse presets.

A separate mobile profile explicitly set to 7,812.5 Lighthouse Kbps (8,000,000
bits/s) measured the candidate homepage three times: transfer 196,215 bytes in
every run; performance 0.98–0.99, accessibility 1.00, LCP 2,107–2,151 ms,
TBT 61–93 ms, and CLS 0.00155. This bounded design-profile measurement does
not replace the slow mobile preset. The policy applies to every audited route,
without a separate article or research cap. It does not alter the score,
timing, accessibility, or interaction requirements.

The phase-two cohort is locked but unmeasured; these exact URLs were selected
by the user based on the supplied award references:

| URL | Recognition source | Scope caveat |
|---|---|---|
| [niccolomiranda.com](https://www.niccolomiranda.com/) | [Awwwards SOTD 2021-11-18 and Developer Award](https://www.awwwards.com/sites/miranda-paper-portfolio) | Current URL as supplied. |
| [usestate.org](https://www.usestate.org/) | [CSSWinner SOTD 2024-09-24, Tomoya Okada Portfolio v5](https://www.csswinner.com/details/tomoyaokada-portfolio-v5/18286) | Record served title/URL and note if current site differs from the award entry. |
| [junji-yamazaki.design](https://junji-yamazaki.design/) | [CSSWinner SOTD 2024-10-29](https://www.csswinner.com/details/junji-yamazaki-portfolio/18346) | Current URL as supplied. |

No phase-two sample has been run. The policy remains provisional, supported by
one measured portfolio peer plus the explicit 8 Mbit/s design rationale.

The first 30-report GitHub audit passed its report-count and budget checks
before `serve-lhci.mjs` negotiated compression. Those reports used raw static
file responses and are not treated as validation of the compressed CI delivery
path. The owned server and checker now test encoded delivery and require the
full five-route × three-run × two-profile matrix; the next exact-head CI run is
the verification for this corrected method. Earlier source-fixture and bundle
measurements remain separately documented with their compression headers.

## Raw artifact index

- Peer raw LHR JSON, stderr, screenshots and summaries:
  `/tmp/portfolio-perf-study/reports` (42 attempts, plus the separately labeled
  one-click Breakthrough entered-state check).
- Main-source fixture reports and header/CDP logs:
  `/tmp/portfolio-perf-study/source-fixture` (12 LHR samples).
- Finished PR91 bundle and digest: `/tmp/portfolio-perf-study/pr91/bundle`,
  digest `e26fd1aa01e2a4ae1b4126bdf170469bb1f349dcb01f621394ea2a29f976c0fd`.
- PR91 bundle LHR JSON, stderr, screenshots, exact response logs and cold/warm
  traces: `/tmp/portfolio-perf-study/pr91/bundle-measurements` (18 runs).
- PR91 homepage 8 Mbit/s profile reports, stderr, screenshots, and response
  logs: `/tmp/portfolio-perf-study/pr91/homepage-8mbps-mobile` (three mobile
  and three desktop runs; 8 Mbit/s override is mobile only).
- Text-article follow-up failures and retained logs:
  `/tmp/portfolio-perf-study/pr91/article-measurements` (6 browser crashes).
- Saved Lighthouse trace and text-article Chrome diagnostic:
  `/tmp/portfolio-perf-study/pr91/lcp-trace`; standalone CDP/model state and
  console evidence are in `/tmp/portfolio-perf-study/pr91/model-article-diagnostic.json`.
