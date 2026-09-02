# JURO Performance Audit

Status: **living evidence report; v101 deployed and production-verified; v114 and PR #132 candidates measured locally and not deployed**

Evidence cutoff: **2026-09-02 UZT**

Scope: Chrome-only lab measurements for the public RU landing page and the public platform login boundary, production artifact budgets, and the truthfulness of published dependency latency. Legislation database/corpus ingestion, Lex.uz/Advice.uz, vectors, and staging-capacity remediation are excluded by owner instruction.

## Executive result

- Production v101 is live from merge `840f1144f3ba8562a7866cd4bda99525be392758`: website Worker `d6ff54c8-0bbc-4921-a54e-581027689a41` and platform Worker `9c434c4e-52af-41cd-b680-eb0730b87e37`.
- Production v101 Chrome QA recorded warm LCP **519 ms**, CLS **0.01**, and cold LCP **2,717 ms** with TTFB **1,769 ms**. Desktop Lighthouse scored Accessibility, Best Practices, SEO, and Agentic Browsing at **100/100/100/100**. These are lab results, not field Core Web Vitals.
- PR #132 targets two measured public-landing bottlenecks without changing product behavior: an oversized JURO mark and delayed hydration entrance animations that repaint the above-the-fold hero. The production Slow 4G / 4x CPU baseline was LCP **3,090 ms**, TTFB **481 ms**, render delay **2,609 ms**, and CLS **0.00**. The candidate remains Draft and undeployed, so no production improvement is claimed.
- The undeployed mainline v114 build recorded local LCP **1,334 ms**, TTFB **472 ms**, render delay **862 ms**, and CLS **0.00**. Chrome no longer attributed forced reflow to a top-level JURO function after the site header moved from a synchronous `scrollY` read to an observer sentinel; **83 ms** of unattributed layout work remained and Chrome estimated no metric savings.
- Local v114 Chrome checks exposed all **21/21** reveal sections in RU, UZ, and EN at 1440 × 900 and in RU at 390 × 844, with zero document-level horizontal overflow and no console errors or warnings. Direct navigation to `/ru#start` also exposed 21/21.
- `https://juro.uz/ru` passed mobile Lighthouse Accessibility, Best Practices, SEO, and Agentic Browsing at **100/100/100/100**.
- The repeat public-page trace on Fast 4G with 4x CPU throttling recorded **LCP 2,021 ms**, **TTFB 144 ms**, and **CLS 0.00**. The first cold trace recorded LCP 3,358 ms and TTFB 1,974 ms, so the result is variable and not field Core Web Vitals.
- `https://app.juro.uz/ru/auth/login` recorded **LCP 1,387 ms**, **TTFB 128 ms**, and **CLS 0.0001** under the same mobile conditions; Accessibility scored **100**.
- The platform login Best Practices score was **92** because the strict application CSP blocks Cloudflare's injected Web Analytics beacon. SEO scored **66** because the private auth route is deliberately protected by both meta and response-header `noindex`; that SEO result is expected and must not be “fixed” by making private application pages indexable.
- Before v188, the public production status API published D1 `latencyMs: 51,446` with `evidenceKind: scheduled_job`. Source inspection proved that v187 timed the entire five-minute cron workload and mislabelled it as database latency. Worker v188 now uses a dedicated constant `SELECT 1` probe; the first accepted production record reported `35 ms`, `operational`, and `synthetic_probe`.
- Worker v189 makes status-page favicon metadata same-origin on every production status route while preserving the existing `img-src 'self' data: blob:` policy. Chrome reported no console errors or warnings on the five checked status routes.

This audit does not claim complete platform performance coverage. Authenticated role journeys, field data, INP, long-task interaction profiles, and every target viewport remain open.

## PR #132 candidate — responsive brand image and hydration-stable hero

Status: **Draft; validated locally and in CI; not merged or deployed**

Chrome identified the 1024 × 1024 public JURO mark as an avoidable image-delivery cost when it was displayed at roughly 73 × 73 CSS px. The image-delivery insight estimated about **62 KB** of avoidable transfer and a potential **400 ms** LCP opportunity. PR #132 routes the desktop header, mobile menu, and footer marks through the standard responsive image pipeline. The Worker accepts both the current `/_next/image` route and the legacy `/_vinext/image` route, then delegates the requested width to Cloudflare Images.

The same production trace identified hero lead text as the LCP element and attributed **2,609 ms** of the **3,090 ms** LCP to render delay. Source inspection found that hydration changed `data-motion-ready` and started delayed entrance animations on already-visible hero copy and the product stage. The candidate removes only those hydration-triggered above-the-fold entrance animations. Pointer tilt, scenario crossfades, atmospheric motion, below-fold reveals, and reduced-motion behavior remain intact.

| Evidence | Result |
| --- | --- |
| Production baseline, 390 × 844, DPR 2, Slow 4G, 4x CPU | LCP 3,090 ms; TTFB 481 ms; render delay 2,609 ms; CLS 0.00 |
| Production image-delivery insight | 1024 × 1024 source displayed at about 73 × 73; about 62 KB avoidable; estimated LCP opportunity 400 ms |
| Local comparative trace with hydration product-stage animation | LCP 5,901 ms; TTFB 399 ms |
| Local comparative trace without hydration product-stage animation | LCP 4,367 ms; TTFB 567 ms |
| Focused and website tests | 49/49 PASS |
| Type-check, lint, verified Sites artifact build | PASS |
| Functional code commit `adfad6bd186669a03e97c1400ff5f935df5b3719` | website CI PASS; platform CI PASS; merge state CLEAN before this documentation-only update |

The local comparisons used the same viewport and throttling profile but a local HTTP/1.1 server. They are evidence that removing the hydration product-stage repaint improves the controlled local path despite a worse TTFB; they are not a production before/after measurement. Merge, Sites publication, and an exact deployed-revision Chrome trace remain separate release gates.

## v114 mainline candidate — initial-paint and auth stability

Status: **validated locally; not deployed**

The public motion director waits through two animation frames before its first geometry measurement, then publishes `data-motion-ready` only after all layout reads are complete. Scroll-time updates keep using cached geometry. The public header now derives its scrolled state from an `IntersectionObserver` sentinel instead of reading `window.scrollY` during a scroll callback.

The shared auth layout uses content-sized mobile rows and reserves at least 72 CSS px throughout the nested Turnstile container. This contract prevents the page grid and challenge boundary from starting at zero height. The local auth route could not render a real Turnstile challenge because provider configuration is intentionally absent, so post-deploy Chrome verification remains mandatory.

| Candidate evidence | Result |
| --- | --- |
| Local public trace, 1440 × 900, no throttling | LCP 1,334 ms; TTFB 472 ms; render delay 862 ms; CLS 0.00 |
| Forced-reflow attribution | no top-level function identified; 83 ms unattributed; estimated savings none |
| Public reveal and overflow matrix | RU/UZ/EN desktop and RU mobile: 21/21 visible; zero overflow |
| Direct anchor navigation | `/ru#start`: 21/21 visible; header scrolled state active |
| Local auth layout | 1440 × 900 and 390 × 844: zero overflow; mobile interactive targets sampled at 44 CSS px or larger |
| Console | no errors or warnings on the checked public locales or local auth route |

The localhost TTFB and LCP are not a direct comparison with production. The useful before/after evidence is attribution: the preceding local trace named a 46 ms `SiteChrome` forced reflow; the observer version removed that JURO function from the insight. Exact deployed-revision traces are required before claiming a production improvement.

## v101 candidate — cached public motion geometry

Status: **deployed and production-verified on 2026-09-01**

The public homepage motion director no longer performs element-geometry or document-height reads inside the animation frame scheduled by scrolling. Page-relative chapter, story, document, continuity, handoff, hero, and page-range geometry is measured outside the hot path and refreshed only after root-size, viewport, or web-font layout changes. Reveal and footer visibility are delegated to `IntersectionObserver`.

Evidence collected on 2026-09-01:

- website type-check: PASS;
- website lint: PASS;
- production build and artifact validation: PASS;
- website suite: 45/45 PASS after updating two source-contract assertions to the equivalent cached formulas;
- regression assertion: `updateScrollStory` contains neither `getBoundingClientRect` nor `scrollHeight`;
- emitted client CSS: unchanged at 126,320 raw bytes across eight files;
- emitted client JavaScript: 629,593 raw bytes across 15 files versus 628,879 on v99, an increase of 714 bytes (0.11%);
- cinematic landing chunk: 94,502 raw bytes versus 93,782 on v99, an increase of 720 bytes (0.77%).

Production verification completed after merge: RU/UZ/EN and `/ru#start` exposed 21/21 reveal sections, 1440 × 900 and 390 × 844 had no horizontal overflow, the console remained clean, and the warm/cold/Lighthouse results are recorded in the executive summary. That evidence proves the checked lab scenarios only; it does not establish field Core Web Vitals or every authenticated route.

## Chrome test method

| Setting | Value |
| --- | --- |
| Browser | Chrome through Chrome DevTools MCP |
| Viewport | 390 × 844 CSS px, DPR 3, mobile + touch |
| Network | Fast 4G emulation |
| CPU | 4x slowdown |
| Color mode | Light |
| Field data | Not available in the trace; lab results only |

No Edge, Firefox, Safari/WebKit, or physical mobile device was used.

## Public landing page — `/ru`

| Run | LCP | TTFB | Render delay | CLS | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Cold trace | 3,358 ms | 1,974 ms | 1,384 ms | 0.00 | TTFB dominated; initial document response exceeded the DevTools 600 ms diagnostic threshold |
| Repeat trace | 2,021 ms | 144 ms | 1,876 ms | 0.00 | Within the requested 2.5 s lab LCP target; rendering became the dominant portion |

Additional repeatable observations:

- LCP element: hero lead text, not a network-fetched image.
- DOM: 608 elements, maximum depth 11, maximum 11 children on `main`.
- Cold trace: 361 ms total forced-reflow time, primarily in `CinematicLandingPage` runtime frames.
- Longest cold critical request chain: 2,336 ms; no preconnect origins were present.
- Lighthouse mobile navigation: 58 passed, 0 failed; Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100.

The cold/warm difference means one good repeat trace is not proof of stable field performance. The public page remains a follow-up target for render-delay and forced-reflow reduction.

## Platform login boundary — `/ru/auth/login`

| Metric | Result |
| --- | ---: |
| LCP | 1,387 ms |
| TTFB | 128 ms |
| Render delay | 1,259 ms |
| CLS | 0.0001 |
| Accessibility | 100 |
| Best Practices | 92 |
| SEO | 66 |
| Agentic Browsing | 100 |

The accessibility-tree snapshot confirmed one localized login form, labelled email input, remember-device checkbox, visible Cloudflare Turnstile boundary, disabled submit during verification, RU/UZ locale controls, and light/dark theme controls.

The three Lighthouse failures have bounded explanations:

1. Cloudflare injects `https://static.cloudflareinsights.com/beacon.min.js`, while JURO CSP allows self and the Turnstile challenge origin only; Chrome therefore logs one CSP error and one DevTools CSP issue.
2. The route is intentionally blocked from indexing with `meta robots=noindex, nofollow, nocache` and `X-Robots-Tag: noindex, nofollow, noarchive`.
3. No change to CSP or indexing policy is included in this release. The CSP/Web Analytics conflict requires a separate decision between disabling the injected analytics beacon and explicitly allowing only the required Cloudflare analytics endpoints.

## Production status-latency defect and deployed fix

Production `/api/status` at `2026-08-31T01:19:26.010Z` reported:

- overall `degraded`;
- D1 `operational`;
- D1 `latencyMs: 51,446`;
- D1 `evidenceKind: scheduled_job`;
- OpenAI, Anthropic, and document analysis still degraded with public `PROVIDER_UNAVAILABLE`.

The v187 production value did not measure a D1 query. The scheduler captured its start before reminders, legal-source health, outbox dispatch, queue/DLQ reconciliation, retention, R2 reconciliation, malware/document/provider probes, and then wrote the total duration as D1 health. Worker v188 now:

- runs `SELECT 1 AS ok` directly against the bound D1 instance;
- measures only that awaited query;
- records `synthetic_probe` evidence;
- publishes operational evidence at or below 2,000 ms;
- publishes degraded `PROBE_LATENCY_HIGH` above 2,000 ms;
- publishes degraded `DEPENDENCY_UNAVAILABLE` for an invalid result or exception;
- preserves content-free logging and the existing fail-safe rule that observability persistence cannot fail completed product work.

No migration, DNS change, Sites change, legal-corpus action, or authentication change is required.

## Release verification

| Gate | Result |
| --- | --- |
| Focused status-metadata tests | 4/4 PASS |
| Rendered routes | 33/33 PASS |
| Core tests | 1,142/1,142 PASS |
| Worker/runtime and migrations | 217/217 PASS |
| TypeScript | PASS |
| Lint | PASS, 0 warnings after cleanup |
| Generated Cloudflare types | PASS after regeneration check; no content diff remained |
| Cloudflare development/staging/production matrix | PASS |
| Production artifact and size budgets | PASS |
| Licence policy | PASS, 802 locked packages |
| Security diff scan | Scan `97f3ebca-264a-4d1d-aff6-2eec9448ec0c`, 0 reportable findings; its functional/CSP coverage gaps were corrected before merge |
| Pull request | PR #95, exact-head CI `33352197361` PASS |
| Merge and post-merge CI | Merge `d133a470a49166875d9112b938ae3f7d765ee170`; CI `33404886188` PASS |
| Production deployment | Workflow `33404885913` PASS; Worker v189 ID `102dcb2d-f79f-4172-9a3a-19d55d51f6ed` at 100% traffic |

Artifact sizes remain within the existing release budgets: client CSS 564.7 KiB, initial browser JavaScript 294.1 KiB, largest lazy-route increment 212.1 KiB, fonts 453.6 KiB, images 564.4 KiB, and Worker entry 3,576.8 KiB. These are raw build artifact sizes, not transfer sizes or Core Web Vitals.

## Production acceptance

The five-minute production schedule generated a fresh public status snapshot at `2026-08-31T01:36:34.129Z`. It proved that:

1. D1 has `evidenceKind: synthetic_probe`;
2. the dedicated-query latency is `35 ms`, rather than the former 50+ second cron duration;
3. D1 is correctly `operational` below the 2,000 ms threshold;
4. overall status remains truthfully `degraded` because OpenAI, Anthropic, and document analysis still report public `PROVIDER_UNAVAILABLE`;
5. Chrome renders the same component state and exposes the D1 evidence in the expanded technical checks.

Worker v189 separately closed the status favicon CSP defect. Chrome rendered `https://status.juro.uz/`, `/status`, `/ru/status`, `/uz/status`, and `https://app.juro.uz/ru/status` with no console errors or warnings. Raw production responses returned absolute same-origin `favicon.png` and `apple-touch-icon.png` links on both hosts; all four image assets returned `200` with `image/png`. Every checked page retained the existing CSP, including `img-src 'self' data: blob:`. The Chrome integration injects a local data-URL badge over ordinary favicon links, so raw HTML was used to verify the server-authored favicon URLs while Chrome verified rendering and console behavior.

The full execution goal remains active after this increment.
