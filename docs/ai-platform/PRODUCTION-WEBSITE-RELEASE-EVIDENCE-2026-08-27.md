# Public website production release evidence — 2026-08-27

## Release decision

JURO Sites version 85 was published after explicit owner approval. It replaces
version 84 with the initial-document metadata correction; version 84 remains
the rollback point. The rejected version 83 candidate is not releasable because
it contained Next.js 16.2.12. The published artifact uses Next.js 16.3.3 and
the verified Cloudflare/Vite toolchain from Draft PR
[#66](https://github.com/MoozUpus/juro/pull/66).

The legal-corpus rollout is outside this release. No D1, R2, Queue, DNS,
access-policy, migration, or feature-flag change was made.

## Immutable release identity

| Item | Evidence |
| --- | --- |
| Public URL | `https://juro.uz` |
| Sites URL | `https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site` |
| Sites project | `appgprj_6a5e1b9547e88191bf759bbeae44d315` |
| Published version | `85` |
| Version ID | `appgprj_6a5e1b9547e88191bf759bbeae44d315~appgver_cc4111c466288191bd118b32dc9b7743` |
| Deployment ID | `appgdep_6a90125becc481918d66dcc53f333fe4` |
| Provider deployment | `muzaffarbekmurodoff--juro-legaltech` |
| Sites source commit | `9fa1c052a2af10909b053e493d54d29628134f5f` |
| GitHub source head | `7645f09627ba698681b0a3037ab41815247327dd` |
| Source tree | `555f12cbc011b838002fb9da8643534d11bfde75` |
| Archive digest | `sha256:0517b1bd848008a216a26042e1c7ca10a39cb9de6da57bbb050fab7a64efbaa5` |
| Archive inventory | 173 files; 6,707,200 bytes in Sites storage |
| Deployment result | `succeeded` |

## Build, dependency, and CI gates

- clean `npm ci`: passed;
- lint: passed;
- TypeScript: passed;
- verified Vinext 1.0.0-beta.8 / Vite 8.2.2 production build: passed;
- artifact contract: passed;
- website tests: 44/44 passed;
- dependency licence inventory: passed for 713 locked packages;
- production dependency audit: zero known vulnerabilities;
- full dependency audit: zero high or critical findings; four moderate findings
  remain only in the deprecated Drizzle CLI loader development chain;
- GitHub CI for website and platform: passed on the published source head.

The production graph resolves Next.js 16.3.3, PostCSS 8.5.23, Sharp 0.35.4,
React 19.2.8, and React DOM 19.2.8.

## Production HTTP smoke

The canonical domain was tested after deployment. The root document returned
HTTP 200. All 78 URLs in the production sitemap returned HTTP 200. The route
set covers 26 routes in each of RU, UZ and EN:

| Surface | Routes |
| --- | --- |
| Localized landing | `/:locale` |
| Trust, video, lawyers and legal centre | `/:locale/trust`, `/video`, `/lawyers`, `/legal` |
| Legal documents | 18 `/:locale/legal/:slug` routes |
| Knowledge | 3 `/:locale/knowledge/:slug` routes |

For the 78-route batch:

- every response returned HTTP 200;
- every canonical matched its exact `https://juro.uz` URL;
- every route had a title and at least three hreflang links;
- no route was accidentally `noindex`;
- the localized description, robots and canonical tags were present before the
  initial closing `</head>` for a normal Chrome user agent;
- CSP, `X-Frame-Options: DENY`, and
  `X-Content-Type-Options: nosniff` were present;
- no unresolved price, contact, or complaint placeholders were rendered.

The direct Sites hostname returned the same localized landing payloads and kept
the canonical domain on `juro.uz`. Sites Worker error logs contained no events
for the post-deploy verification window.

## Chrome QA

Chrome DevTools MCP was used against `https://juro.uz/ru` after deployment.

### Performance trace

| Metric | Observed lab value | Release threshold | Result |
| --- | ---: | ---: | --- |
| TTFB | 120 ms | < 800 ms | passed |
| LCP | 777 ms | < 2,500 ms | passed |
| CLS | 0.00 | < 0.10 | passed |

The trace used no CPU or network throttling and has no CrUX field-data sample,
so these values are release evidence, not a real-user percentile claim. The
render-blocking insight estimated 0 ms of FCP/LCP savings.

### Visual and accessibility smoke

- desktop viewport: no clipping, broken layout, or missing primary action;
- emulated 390 × 844 mobile viewport: no horizontal clipping in the landing
  hero or result model;
- mobile navigation opened as a named modal dialog, moved focus to its close
  control, exposed every primary destination, and provided an explicit close
  action;
- the accessibility tree contained one main region, a skip link, named
  navigation, named theme controls, semantic headings, and named CTAs;
- no console errors were recorded. One low-priority preload warning concerned
  a route-prefetched CSS file that was not used immediately.

### Lighthouse

The production mobile navigation audit returned:

| Category | Score |
| --- | ---: |
| Accessibility | 100 |
| Best Practices | 81 |
| SEO | 100 |
| Agentic Browsing | 100 |

The SEO gate is now closed: the former `meta-description` failure no longer
reproduces. The only current Lighthouse failure is `deprecations`, caused by
three deprecated browser APIs in Cloudflare's injected
`/cdn-cgi/challenge-platform/scripts/jsd/main.js`, not in a JURO source bundle.
This lowers Best Practices below the target and remains an open Cloudflare
configuration/vendor issue; the release evidence does not hide it or disable
bot protection to improve the score.

## Post-deploy correction verified in version 85

Commit `7645f09627ba698681b0a3037ab41815247327dd` sets
`htmlLimitedBots: /.*/`, disabling streaming metadata so localized description,
robots, and canonical tags are present in the initial document head. A
regression test sends a normal Chrome user agent and asserts those tags before
`</head>`.

Evidence for the correction before and after deployment:

- clean production build and 44/44 website tests: passed;
- lint and TypeScript: passed;
- production audit: zero vulnerabilities;
- GitHub website and platform CI: passed;
- local mobile Lighthouse SEO: 100;
- production mobile Lighthouse SEO: 100;
- raw production HTML places description, robots and canonical before
  `</head>` for the normal Chrome path;
- all 78 sitemap URLs returned HTTP 200 after publication;
- the post-deploy Worker error-log query returned zero events;
- clean source tree pushed to Sites source commit
  `9fa1c052a2af10909b053e493d54d29628134f5f`;
- Sites version 85 saved with archive digest
  `sha256:0517b1bd848008a216a26042e1c7ca10a39cb9de6da57bbb050fab7a64efbaa5`;
- Sites deployment `appgdep_6a90125becc481918d66dcc53f333fe4`
  reached `succeeded`.

## Rollback

Version 84 is the known-good rollback point for version 85. If version 85 fails
deployment or post-deploy verification:

1. stop the release and preserve the failed deployment ID and Worker errors;
2. redeploy the exact saved version 84 ID above;
3. wait for the rollback deployment to reach `succeeded`;
4. repeat the 78-route HTTP smoke, Worker error-log check, and Chrome landing
   verification;
5. do not change DNS, access policy, D1, R2, Queues, migrations, or feature
   flags as part of the rollback.

Version 83 is not an acceptable rollback target because it contains the
rejected Next.js 16.2.12 dependency.

## Remaining release gates

1. Investigate Cloudflare's injected JavaScript deprecation warnings without
   weakening challenge or bot protection.
2. Repeat the broader visual/mobile matrix for non-landing public routes; the
   78-route batch proves HTTP and metadata, not every layout state.

Version 85 is the verified public release. This closes the website SEO
metadata release gate only; it does not complete the full JURO ecosystem goal.
