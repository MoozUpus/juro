# Performance audit — 2026-08-28

## What is measured

The production artifact passed raw emitted-byte regression budgets:

| Surface | Current | Limit | Status |
| --- | ---: | ---: | --- |
| Client CSS | 592.7 KiB | 600 KiB | PASS, only 7.3 KiB headroom |
| Initial browser JS | 295.3 KiB | 320 KiB | PASS |
| Largest lazy route increment | 208.1 KiB | 240 KiB | PASS; Document Builder is the largest increment |
| Fonts | 453.6 KiB | 512 KiB | PASS |
| Images | 564.4 KiB | 640 KiB | PASS |
| Worker entry | 3779.3 KiB | 6144 KiB | PASS |

Three direct production samples from the current workstation produced these
median HTTP timings. They include network/location effects and are not browser
paint metrics.

| URL | Median TTFB | Median total | Response bytes |
| --- | ---: | ---: | ---: |
| `https://juro.uz/ru` | 286.8 ms | 355.9 ms | 82,740 |
| Client login | 280.6 ms | 290.4 ms | 19,129 |
| Lawyer login | 236.1 ms | 237.3 ms | 19,178 |
| Status API | 302.1 ms | 302.7 ms | 7,564 |

## Production Chrome evidence

Chrome 151 traced `https://juro.uz/ru?qa=sites-v86-perf` at a `390×844`
mobile/touch viewport with 4× CPU slowdown and Fast 4G network emulation:

| Metric | Observed | Target | Status |
| --- | ---: | ---: | --- |
| LCP | 1,956 ms | <=2,500 ms | PASS |
| TTFB | 234 ms | <800 ms | PASS |
| CLS | 0.0001 | <=0.1 | PASS |
| Render-blocking estimated LCP/FCP saving | 0 ms | Prioritize only measurable savings | PASS / no action |

The text LCP spent 1,723 ms in render delay. The maximum critical request path
was 1,995 ms and ended in the Manrope Latin/Cyrillic fonts. The trace reported
619 DOM elements, depth 11 and 302 ms of forced reflow in the framework,
landing-page and site-chrome bundles, but estimated no direct metric saving.
This remains a measured P2 observation rather than an unsupported rewrite
recommendation.

A separate 16-second `PerformanceObserver` run recorded total unexpected
layout shift 0.0012, zero horizontal overflow and only the ambient decorative
hero element as the tiny moving source. The controlled Lighthouse 13.4.1
navigation, after clearing the external device override, scored 100
Accessibility, 100 Best Practices, 100 SEO and 100 Agentic Browsing; 59 audits
passed, 0 failed and Lighthouse reported CLS 0. An earlier run with an external
mobile override still stacked on the Lighthouse device preset returned CLS
0.171; it was treated as an instrumentation conflict, not discarded silently,
and was disproved by both the controlled rerun and the longer observer.

The exact controlled Lighthouse JSON and HTML reports are stored in
`docs/qa/artifacts/performance-sites-v86/`.

### Lawyer catalogue route class

Chrome 151 also traced `https://juro.uz/ru/lawyers?qa=sites-v86-perf` with the
same `390×844`, 4× CPU and Fast 4G profile. Three reloads produced LCP/TTFB of
`2,818/1,856 ms`, `1,154/240 ms` and `1,380/198 ms`; CLS was 0.00, 0.00 and
0.0004. The first run exceeded the LCP goal because of document response
latency; two immediate repeats passed. The variance is retained as evidence
and prevents a blanket claim that every load is already below 2.5 seconds.

The stable traces identified a concrete image-delivery defect: an approved
419×419 PNG was transferred as 82,109 bytes for an approximately 80×80 avatar,
with 81 kB estimated waste. Its route-level public cache policy was then
overwritten by the generic Worker privacy fallback, so the live response was
`private, no-store`. The website now requests fixed 128 px and 288 px WebP
variants; the Worker accepts only a bounded transformation allowlist, enables
the production cache, preserves an approved original as the fail-safe fallback,
and restores public caching only for the exact moderation-approved photo route.
Private profile/photo APIs remain under the existing no-store boundary.

Controlled Lighthouse scored 100 Accessibility, 100 Best Practices, 100 SEO
and 100 Agentic Browsing (58 passed, 0 failed). The accessibility snapshot had
one H1, labelled filters and named actions. It also exposed `4 лет`; the public
catalogue and profile source now apply locale-aware Russian year grammar. Raw
reports and hashes are in
`docs/qa/artifacts/performance-sites-v86-lawyers/`.

## Findings

- P2: CSS is within budget but at 98.7% of its limit. Any new global styling
  needs attribution and preferably route-level containment.
- P2: Document Builder owns the largest lazy increment. It is already lazy,
  but should be the first target for coverage-based unused-JS analysis.
- P2 fixed in saved Sites v87: production v86 served content-hashed
  `/_next/static/*` CSS, JavaScript and fonts with
  `Cache-Control: public, max-age=0, must-revalidate`, forcing a conditional
  request on every revisit. Commit `5d543218` applies
  `public, max-age=31536000, immutable` only to successful fingerprinted
  `/_next/static/*` and `/assets/*` responses. A local production Worker smoke
  proved HTML stayed `no-store, must-revalidate` while the emitted hashed CSS
  received the immutable policy.
- P2 fixed in the current release candidate: the lawyer catalogue now requests
  bounded WebP photo variants; the platform Worker enables its production cache
  and no longer applies a private no-store policy to the exact approved
  public-photo route. Worker 152 is live and verified: the 128 px WebP is 2,106
  bytes versus 82,109 bytes for the original, and the second identical request
  was a cache `HIT`. Sites v86 still requests the original PNG, so end-user byte
  reduction remains pending the superseding Sites release.
- PASS: production builds are minified and route chunks are emitted separately;
  the UI exposes skeleton/progress states in the exercised flows.
- PARTIAL: LCP, CLS, render-blocking savings, DOM and network dependencies are
  now measured for the RU home, Trust Center, Legal Center, video, lawyer
  catalogue and login surface. INP, field CrUX, complete TBT/Speed Index,
  unused-JS coverage, other public route classes and every
  authenticated route remain open.

## Required completion gate

The already saved Sites v87 predates the lawyer-photo source correction and is
no longer the complete current release candidate. After the current branch
passes CI, save a superseding Sites version, request explicit approval for the
public deployment, then verify both immutable static assets and responsive
WebP lawyer photos in production. Production remains Sites v86 until that
approval and deployment succeed. Trust and Legal Center now have bounded
production samples; repeat the same profiles after the authorized Sites release
to separate the saved caching/motion/contrast corrections from v86 variance.

## 2026-08-28 homepage motion release candidate

A fresh Chrome DevTools MCP baseline of live Sites v86 used a `390×844`
mobile/touch viewport, 4× CPU slowdown and Fast 4G. The RU homepage produced
LCP 2,041 ms (125 ms TTFB and 1,917 ms render delay), CLS 0.00 and 548 ms of
forced reflow. The LCP element was the hero lead paragraph. The same production
surface retained Lighthouse scores of 100 Accessibility, 100 Best Practices,
100 SEO and 100 Agentic Browsing, with 59 passed and 0 failed audits.

The release candidate removes the delayed opacity animation from that LCP
paragraph and changes `JuroMotionDirector` to collect all layout measurements
before applying DOM/style updates. Its first scroll-story measurement is
deferred until the motion-ready style change has painted, avoiding a same-frame
forced layout.

The built candidate was served locally by the generated Cloudflare Worker with
its emitted assets, then traced with the same Chrome device, CPU and network
profile:

| Metric | Live Sites v86 baseline | Local production candidate | Goal |
| --- | ---: | ---: | ---: |
| LCP | 2,041 ms | 1,335 ms | <=2,500 ms |
| TTFB | 125 ms | 191 ms | <800 ms |
| Render delay | 1,917 ms | 1,144 ms | Diagnose and reduce |
| CLS | 0.00 | 0.00 | <=0.1 |
| Total forced reflow | 548 ms | 99 ms | Diagnose and reduce |
| Landing-page forced reflow attribution | 244 ms | 2 ms | Diagnose and reduce |

This comparison is directional pre-release evidence, not a production
after-measurement: the candidate used the local Worker origin while v86 used
the public Cloudflare edge. Production improvement remains unverified until a
separately authorized Sites publish and identical post-deploy trace.

Candidate Lighthouse scored 100 Accessibility, 100 SEO and 100 Agentic
Browsing. Best Practices was 92 solely because the localhost CSP correctly
blocked canonical production favicon and manifest URLs as cross-origin; the
same audit on live v86 scored 100. The full website gate passed a deployable
production build, lint, type-check, 48/48 tests and the complete automated
desktop/mobile, light/dark RU/UZ/EN accessibility matrix.

### Trust, Legal Center and video production route classes

Three live Sites v86 Trust Center traces used the same `390×844`, 4× CPU and
Fast 4G profile. LCP/TTFB results were `3,726/1,891 ms`, `1,551/117 ms` and
`1,803/121 ms`; CLS was 0.00 in all three. The median LCP was 1,803 ms and two
warm repeats passed, but the retained cold sample exceeded the goal because of
document latency. Public HTML is intentionally `no-store, must-revalidate`, so
this variance is not hidden or represented as a universal pass.

The live RU video route produced LCP 940 ms, TTFB 110 ms and CLS 0.00. Its LCP
image needed 174 ms discovery delay and 2 ms load duration; the overall route
still remained comfortably inside the goal in this bounded trace.

Live Trust Center Lighthouse scored 96 Accessibility and 100 Best Practices,
SEO and Agentic Browsing. It found two light-theme contrast failures: the
`Trust Center` breadcrumb at 3.76:1 and the `УТОЧНЯЕТСЯ` state label at 4.18:1,
both below 4.5:1. The current built candidate already contains the higher-
contrast Trust palette from commit `4b104c1c`; its identical localhost audit
scored 100 Accessibility. Localhost Best Practices remained 92 only because
the local-origin CSP blocked canonical production favicon/manifest URLs.

The Trust contrast correction is therefore source- and candidate-verified but
not live in Sites v86. It remains a production release gate alongside the
homepage motion, immutable asset caching and responsive lawyer-photo delivery.

A later same-day replay retained the same Trust variance instead of silently
promoting the two warm passes into a blanket result. Three more LCP/TTFB pairs
were `4,519/1,981 ms`, `3,608/1,870 ms` and `2,120/121 ms`; CLS was 0.00 in
all three. The first two traces failed the 2.5-second LCP goal because of high
document latency, while the third passed. The H1 remained the text LCP and the
stable trace still spent about 2.0 seconds in render delay.

The first bounded Legal Center production sample used the same mobile, CPU and
network profile. Its three LCP/TTFB pairs were `3,920/1,871 ms`,
`2,623/125 ms` and `2,370/121 ms`; CLS was 0.00 in all three. The cold response
failed primarily on document latency. Even with fast document responses, text
render delay remained 2,249–2,498 ms, leaving one warm replay 123 ms over the
goal and one 130 ms inside it. Production v86's content-hashed CSS and Manrope
font responses were Cloudflare cache hits but still returned
`Cache-Control: public, max-age=0, must-revalidate`; both sampled font responses
used `application/octet-stream`. The already saved immutable-asset candidate
addresses revalidation, but its real effect and any font MIME/preload follow-up
must be measured on a separately authorized public Sites release.

## 2026-08-28 Client login CLS release

A cold production Chrome trace of `https://app.juro.uz/ru/auth/login` used a
`390×844` mobile/touch viewport at 3× DPR, 4× CPU slowdown and Fast 4G. It
recorded LCP 2,344 ms (705 ms TTFB and 1,639 ms render delay) and CLS 0.2779,
which fails the <=0.1 target. The trace identified the inherited
`.auth-brand::after` pseudo-element as LCP. Source inspection confirmed that
the legacy global auth treatment still rendered a decorative 620 px `J` on
the current Client surface. A separate late shift occurred when the 65 px
Turnstile reservation grew to approximately 70.1 px.

The candidate explicitly neutralizes that pseudo-element only for
`data-product="client"` and reserves 72 px for Turnstile on both authenticated
and guest auth surfaces. Lawyer's separate decorative ring remains unchanged.
The generated production Worker was served locally and confirmed
`display:none`, `content:none` and CLS 0.00; local auth intentionally had no
production secret or live Turnstile challenge.

For a closer pre-release comparison, the same candidate rules were installed
as a pre-document adopted stylesheet in a new isolated Chrome context while
the unchanged production page loaded its real Turnstile. The LCP moved to the
page `H2` at 1,692 ms. A 14-second `PerformanceObserver` run recorded one late
shift totaling 0.0462, below the <=0.1 target; the pseudo-element remained
disabled and the widget held exactly 72 px.

| Metric | Live Worker 166 | Live page with isolated candidate rules | Goal |
| --- | ---: | ---: | ---: |
| LCP | 2,344 ms | 1,692 ms | <=2,500 ms |
| TTFB | 705 ms | same production origin, not separately attributed | <800 ms |
| CLS | 0.2779 | 0.0462 | <=0.1 |
| Client pseudo-element | visible 620 px `J` | `display:none; content:none` | absent |
| Turnstile reservation | 65 px before ~70.1 px render | 72 px before/after | no avoidable growth |

The injected-rule result was controlled pre-release evidence. Source commit
`4eba97cead5c56d47c51dbc1965b5b440871dd5b` then passed exact CI
`33192562472` and shipped as Worker 167
`b67a2ed8-74f8-4d62-968e-87bff9d3e4dc` at 100% traffic.

A new isolated production run loaded the released CSS without an override and
observed the same 0.0462 CLS across 15 seconds, including the late real
Turnstile render. LCP moved from the obsolete pseudo-element to the page `H2`
at 2,680 ms. The Client pseudo-element computed to `display:none` and
`content:none`, the widget retained 72 px, and the document remained exactly
390 px wide with no horizontal overflow. This is the production
after-measurement for the scoped CLS defect; it does not establish field CrUX
or an INP result. Sites v86 was not changed.
