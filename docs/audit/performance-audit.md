# Performance audit — 2026-08-27

## What is measured

The production artifact passed raw emitted-byte regression budgets:

| Surface | Current | Limit | Status |
| --- | ---: | ---: | --- |
| Client CSS | 591.9 KiB | 600 KiB | PASS, only 8.1 KiB headroom |
| Initial browser JS | 295.3 KiB | 320 KiB | PASS |
| Largest lazy route increment | 208.1 KiB | 240 KiB | PASS; Document Builder is the largest increment |
| Fonts | 453.6 KiB | 512 KiB | PASS |
| Images | 564.4 KiB | 640 KiB | PASS |
| Worker entry | 3771.3 KiB | 6144 KiB | PASS |

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
- PASS: production builds are minified and route chunks are emitted separately;
  the UI exposes skeleton/progress states in the exercised flows.
- PARTIAL: LCP, CLS, render-blocking savings, DOM and network dependencies are
  now measured for the RU home and the login surface. INP, field CrUX, complete
  TBT/Speed Index, unused-JS coverage, every public route class and every
  authenticated route remain open.

## Required completion gate

Deploy the already saved Sites v87 only after explicit approval for the public
Site, then verify the live immutable asset header, repeat the RU-home trace and
Lighthouse run, and sample the Trust, lawyer catalogue and legal-centre route
classes. The saved version is runtime commit `a60df03f`; production remains
Sites v86 until that deployment is approved and succeeds.
