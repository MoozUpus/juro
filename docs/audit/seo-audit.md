# SEO and indexation audit — 2026-08-25

## Public website

A fresh fetch of all 33 sitemap URLs found:

- 33/33 HTTP 2xx;
- 33/33 non-empty titles;
- 33/33 non-empty meta descriptions;
- 33/33 canonical URLs exactly matching the sitemap URL;
- 33/33 with at least RU/UZ/EN hreflang alternatives;
- 33/33 with Open Graph titles;
- zero unexpected `noindex` pages.

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
- Dynamic public Lawyer profiles were not present in the current sitemap and
  therefore were not included in the 33-URL crawl; publication/consent policy
  must control any future inclusion.
- Lighthouse SEO scoring is not claimed because `chrome-devtools` MCP was
  unavailable. The deterministic metadata/status crawl passed, but it is not a
  substitute for a Lighthouse run.
