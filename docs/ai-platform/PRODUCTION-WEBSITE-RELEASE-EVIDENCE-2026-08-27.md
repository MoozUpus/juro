# Public website production release evidence — 2026-08-27

## Release decision

JURO Sites version 84 was published after explicit owner approval. It replaces
the rejected version 83 candidate, which contained Next.js 16.2.12. The
published artifact uses Next.js 16.3.3 and the verified Cloudflare/Vite toolchain
from Draft PR [#66](https://github.com/MoozUpus/juro/pull/66).

The legal-corpus rollout is outside this release. No D1, R2, Queue, DNS,
access-policy, migration, or feature-flag change was made.

## Immutable release identity

| Item | Evidence |
| --- | --- |
| Public URL | `https://juro.uz` |
| Sites URL | `https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site` |
| Sites project | `appgprj_6a5e1b9547e88191bf759bbeae44d315` |
| Published version | `84` |
| Version ID | `appgprj_6a5e1b9547e88191bf759bbeae44d315~appgver_d0555454d57081919ae7e441be55c845` |
| Deployment ID | `appgdep_6a9004bb5d1c819197bf222b813e3a01` |
| Sites source commit | `ef093ba5ab43a42ec5f6a02b8a1c9b733f9b588d` |
| GitHub source head | `3c5cfecf8192ee439fea44f837426ea6c83bcde2` |
| Source tree | `2287c96dd899ccfef8b898584e1971ca43c88a1f` |
| Archive digest | `sha256:7ec4745fd219cc110cd0422ecdd6f00a9bf3178b697631208993d22a50e88c29` |
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
HTTP 200. The following 22 selected routes and assets also returned their
expected successful status and content type:

| Surface | Routes |
| --- | --- |
| Localized landing | `/ru`, `/uz`, `/en` |
| Trust Center | `/ru/trust`, `/uz/trust`, `/en/trust` |
| Investor video | `/ru/video`, `/uz/video`, `/en/video` |
| Lawyer directory | `/ru/lawyers`, `/uz/lawyers`, `/en/lawyers` |
| Legal centre | `/ru/legal`, `/uz/legal`, `/en/legal` |
| Legal document sample | `/ru/legal/privacy-policy`, `/uz/legal/privacy-policy`, `/en/legal/privacy-policy` |
| Discovery and identity assets | `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`, `/favicon.png` |

For every tested HTML route:

- the response was HTML with HTTP 200;
- the canonical URL pointed to `https://juro.uz`;
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
| TTFB | 125 ms | < 800 ms | passed |
| LCP | 590 ms | < 2,500 ms | passed |
| CLS | 0.00 | < 0.10 | passed |

The trace used no CPU or network throttling and has no CrUX field-data sample,
so these values are release evidence, not a real-user percentile claim. The
render-blocking insight estimated 0 ms of FCP/LCP savings. One framework-led
forced-reflow cluster totalled 37 ms and had no estimated metric saving. The DOM
contained 652 elements with a maximum depth of 11.

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
| Best Practices | 100 |
| SEO | 92 |
| Agentic Browsing | 100 |

The only failed audit was `meta-description`. The description existed in both
the server response and hydrated DOM, but Next/Vinext streamed generated
metadata after the initial closing `</head>` for ordinary browser user agents.
That timing makes the tag invisible to Lighthouse's initial SEO inspection.

## Post-deploy correction prepared as version 85

Commit `7645f09627ba698681b0a3037ab41815247327dd` sets
`htmlLimitedBots: /.*/`, disabling streaming metadata so localized description,
robots, and canonical tags are present in the initial document head. A
regression test sends a normal Chrome user agent and asserts those tags before
`</head>`.

Evidence for the correction:

- clean production build and 44/44 website tests: passed;
- lint and TypeScript: passed;
- production audit: zero vulnerabilities;
- GitHub website and platform CI: passed;
- local mobile Lighthouse SEO: 100;
- clean source tree pushed to Sites source commit
  `9fa1c052a2af10909b053e493d54d29628134f5f`;
- Sites version 85 saved with archive digest
  `sha256:0517b1bd848008a216a26042e1c7ca10a39cb9de6da57bbb050fab7a64efbaa5`.

Version 85 is saved but not published. The site is public, so publishing it
requires a new explicit owner approval and a fresh production smoke/Lighthouse
pass.

## Rollback

Version 84 is the known-good rollback point for version 85. If version 85 fails
deployment or post-deploy verification:

1. stop the release and preserve the failed deployment ID and Worker errors;
2. redeploy the exact saved version 84 ID above;
3. wait for the rollback deployment to reach `succeeded`;
4. repeat the 22-route HTTP smoke, Worker error-log check, and Chrome landing
   verification;
5. do not change DNS, access policy, D1, R2, Queues, migrations, or feature
   flags as part of the rollback.

Version 83 is not an acceptable rollback target because it contains the
rejected Next.js 16.2.12 dependency.

## Remaining release gates

1. Obtain explicit approval to publish version 85.
2. Confirm the deployed version-85 source identity.
3. Repeat production HTTP and Worker-log smoke.
4. Repeat mobile Lighthouse and require SEO at least 95.
5. Record the version-85 deployment ID and final production metrics here.

Until those gates pass, version 84 remains the verified public release and the
SEO correction remains prepared rather than production-proven at `juro.uz`.
