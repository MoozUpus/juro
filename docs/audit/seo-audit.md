# SEO and indexation audit — 2026-08-25

## Public website

A full Sites-version-82 fetch of all 78 sitemap URLs found:

- 78/78 HTTP 2xx;
- 78/78 non-empty titles;
- 78/78 non-empty meta descriptions;
- 78/78 canonical URLs exactly matching the sitemap URL;
- 78/78 with complete RU/UZ/EN hreflang alternatives;
- 78/78 with complete Open Graph title, description, canonical URL, type, site
  name and image metadata;
- 78/78 with Twitter large-card, title, description and image metadata;
- 78/78 with exactly one H1;
- every JSON-LD block present on the crawled pages parsed successfully;
- zero unexpected `noindex` pages.

The expanded Sites-version-80 crawl had rejected the earlier SEO pass: only
40/78 routes had complete hreflang and 18/78 had explicit Open Graph titles.
The failure was isolated to legal routes and the three lawyer catalogues.
Version 81 deployed the tested fix and closed both gaps without changing
indexability or canonical destinations. A stricter social-preview audit then
found only 17/78 routes with an Open Graph/Twitter image. Version 82 reused the
visually inspected, neutral, repository-owned "/juro-og.png" asset and the next
78-URL crawl closed that gap. The asset itself returned 200 `image/png` and
1,650,752 bytes.

`robots.txt` returns 200, allows the public site, disallows `/api/` and the two
retired landing-test paths, and points to the canonical sitemap.

## Private surfaces

`app.juro.uz/robots.txt` returns 200 and ends with `Disallow: /`. Platform HTML
and API responses also emit `X-Robots-Tag: noindex, nofollow, noarchive`.
Signed-share pages are noindex/no-cache. Admin, Lawyer-after-login, cases,
documents, chats, previews and status UI are not represented as public SEO
content.

## Open checks

- Structured-data validity was not re-run with an external schema validator.
- External social-network cache refresh and vendor-specific preview rendering
  were not triggered; this audit verifies the production HTML contract and the
  referenced image response.
- Public Lawyer profiles are represented in the current sitemap only after the
  existing publication/consent policy admits them; this crawl did not infer
  professional verification from sitemap inclusion.
- A controlled Lighthouse 13.4.1 run on the deployed Worker 151 login surface
  scored SEO 100, and Chrome DevTools is now available for targeted checks.
  That bounded result is not a substitute for fresh external structured-data,
  social-preview and rendered-content validation across all 78 canonical URLs;
  saved Sites version 93 is not deployed.
