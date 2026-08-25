# SEO and indexation audit — 2026-08-25

## Public website

A full Sites-version-81 fetch of all 78 sitemap URLs found:

- 78/78 HTTP 2xx;
- 78/78 non-empty titles;
- 78/78 non-empty meta descriptions;
- 78/78 canonical URLs exactly matching the sitemap URL;
- 78/78 with complete RU/UZ/EN hreflang alternatives;
- 78/78 with explicit Open Graph titles;
- zero unexpected `noindex` pages.

The expanded Sites-version-80 crawl had rejected the earlier SEO pass: only
40/78 routes had complete hreflang and 18/78 had explicit Open Graph titles.
The failure was isolated to legal routes and the three lawyer catalogues.
Version 81 deployed the tested fix and the complete 78-URL production re-crawl
closed both gaps without changing indexability or canonical destinations.

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
- Public Lawyer profiles are represented in the current sitemap only after the
  existing publication/consent policy admits them; this crawl did not infer
  professional verification from sitemap inclusion.
- Lighthouse SEO scoring is not claimed because `chrome-devtools` MCP was
  unavailable. The deterministic metadata/status crawl passed, but it is not a
  substitute for a Lighthouse run.
