# JURO Performance Audit

Status: **living evidence report; one Worker fix is release-candidate only**

Evidence cutoff: **2026-08-31 06:19 UZT (2026-08-31 01:19 UTC)**

Scope: Chrome-only lab measurements for the public RU landing page and the public platform login boundary, production artifact budgets, and the truthfulness of published dependency latency. Legislation database/corpus ingestion, Lex.uz/Advice.uz, vectors, and staging-capacity remediation are excluded by owner instruction.

## Executive result

- `https://juro.uz/ru` passed mobile Lighthouse Accessibility, Best Practices, SEO, and Agentic Browsing at **100/100/100/100**.
- The repeat public-page trace on Fast 4G with 4x CPU throttling recorded **LCP 2,021 ms**, **TTFB 144 ms**, and **CLS 0.00**. The first cold trace recorded LCP 3,358 ms and TTFB 1,974 ms, so the result is variable and not field Core Web Vitals.
- `https://app.juro.uz/ru/auth/login` recorded **LCP 1,387 ms**, **TTFB 128 ms**, and **CLS 0.0001** under the same mobile conditions; Accessibility scored **100**.
- The platform login Best Practices score was **92** because the strict application CSP blocks Cloudflare's injected Web Analytics beacon. SEO scored **66** because the private auth route is deliberately protected by both meta and response-header `noindex`; that SEO result is expected and must not be “fixed” by making private application pages indexable.
- The public production status API currently publishes D1 `latencyMs: 51,446` with `evidenceKind: scheduled_job`. Source inspection proved that v187 times the entire five-minute cron workload and mislabels it as database latency. The release candidate replaces that value with a dedicated constant `SELECT 1` probe and marks a successful probe over 2,000 ms as degraded.

This audit does not claim complete platform performance coverage. Authenticated role journeys, field data, INP, long-task interaction profiles, and every target viewport remain open.

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

## Production status-latency defect

Production `/api/status` at `2026-08-31T01:19:26.010Z` reported:

- overall `degraded`;
- D1 `operational`;
- D1 `latencyMs: 51,446`;
- D1 `evidenceKind: scheduled_job`;
- OpenAI, Anthropic, and document analysis still degraded with public `PROVIDER_UNAVAILABLE`.

The current production value does not measure a D1 query. The scheduler captured its start before reminders, legal-source health, outbox dispatch, queue/DLQ reconciliation, retention, R2 reconciliation, malware/document/provider probes, and then wrote the total duration as D1 health. The release candidate now:

- runs `SELECT 1 AS ok` directly against the bound D1 instance;
- measures only that awaited query;
- records `synthetic_probe` evidence;
- publishes operational evidence at or below 2,000 ms;
- publishes degraded `PROBE_LATENCY_HIGH` above 2,000 ms;
- publishes degraded `DEPENDENCY_UNAVAILABLE` for an invalid result or exception;
- preserves content-free logging and the existing fail-safe rule that observability persistence cannot fail completed product work.

No migration, DNS change, Sites change, legal-corpus action, or authentication change is required.

## Release-candidate verification

| Gate | Result |
| --- | --- |
| Focused dependency/scheduler tests | 61/61 PASS; subsequent changed-file rerun 50/50 PASS |
| Rendered routes | 33/33 PASS |
| Core tests | 1,138/1,138 PASS |
| Worker/runtime and migrations | 217/217 PASS |
| TypeScript | PASS |
| Lint | PASS, 0 warnings after cleanup |
| Generated Cloudflare types | PASS after regeneration check; no content diff remained |
| Cloudflare development/staging/production matrix | PASS |
| Production artifact and size budgets | PASS |
| Licence policy | PASS, 802 locked packages |
| Security diff scan | Complete, 4/4 production files, 0 candidates, 0 findings |

Artifact sizes remain within the existing release budgets: client CSS 564.7 KiB, initial browser JavaScript 294.1 KiB, largest lazy-route increment 212.1 KiB, fonts 453.6 KiB, images 564.4 KiB, and Worker entry 3,575.4 KiB. These are raw build artifact sizes, not transfer sizes or Core Web Vitals.

## Acceptance after deployment

The fix is accepted only when a later five-minute production schedule writes fresh D1 evidence that:

1. has `evidenceKind: synthetic_probe`;
2. reports a plausible dedicated-query latency rather than the 50+ second cron duration;
3. is operational at or below 2,000 ms, or truthfully degraded with `PROBE_LATENCY_HIGH` above that threshold;
4. leaves the overall status degraded if provider failures remain;
5. renders consistently on the Chrome status page without new console errors.

The full execution goal remains active after this increment.
