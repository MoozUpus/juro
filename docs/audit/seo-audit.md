# JURO SEO Audit

Status: **production evidence, not full-site completion**

Evidence cutoff: **2026-08-31 04:56 UZT (2026-08-30 23:56 UTC)**

Scope: public Sites v95 plus public/private indexing boundaries discoverable without fabricating authenticated sessions. Legislation content quality and legal-source ingestion are excluded.

## Current result

| Surface | Indexing contract | Evidence | Status |
| --- | --- | --- | --- |
| `https://juro.uz` | Public localized pages are indexable and self-canonical | `/`, RU, UZ, EN, `robots.txt`, and `sitemap.xml` return `200`; custom-domain responses do not carry a noindex header | VERIFIED |
| Provider-owned Sites hostname | Reachable duplicate must not be indexed | v95 returns `X-Robots-Tag: noindex, nofollow, noarchive` on entry routes, `robots.txt`, and `sitemap.xml`; canonical points to `juro.uz` | VERIFIED |
| `app.juro.uz` private product routes | Must not be indexed | Public route inventory records both response-header and HTML noindex boundaries; authenticated content was not exposed | VERIFIED for anonymous boundary; authenticated crawl not attempted |
| `lawyer.juro.uz` private workspace | Must not be indexed | Anonymous routes preserve the lawyer login boundary and private host noindex policy | PARTIAL pending authenticated QA |
| `admin.juro.uz` | Must not be indexed | Anonymous access redirects to the protected admin boundary | PARTIAL pending staff-session QA |
| Staging hosts | Must not be indexed or publicly expose application content | Cloudflare Access protects canonical staging entry; public-safe status remains separate | PARTIAL because staging runtime health is stale |

## Crawl evidence

- Sitemap status: HTTP `200`.
- Sitemap URLs: 78.
- Sitemap URL results: 78/78 HTTP `200`.
- Unique discoverable JURO-zone links: 149.
- Link results after redirects: 149/149 HTTP `200`.
- Link distribution: 121 `juro.uz`, 28 `app.juro.uz`.
- RU, UZ, and EN entry routes render in production.
- Chrome loaded both the custom domain and provider hostname without console errors.

## Duplicate-host fix

Before v95, the provider hostname returned the same public HTML with `meta robots=index, follow` and no response-header override. Canonical metadata reduced but did not remove duplicate-indexing risk.

Sites v95 adds the authoritative response header only on the provider-owned hostname:

`X-Robots-Tag: noindex, nofollow, noarchive`

The custom domain intentionally does not receive that header and keeps `meta robots=index, follow`. Saved Sites v94 is the rollback if v95 causes a custom-domain or route regression.

## Remaining SEO gates

- validate structured-data output and social-preview metadata across representative RU/UZ/EN detail pages;
- re-check hreflang completeness and reciprocity with a dedicated parser;
- verify final status codes and canonical behavior for error pages and uncommon language fallbacks;
- confirm that every future public lawyer profile has real, approved, non-duplicated content before indexing;
- keep private, admin, preview, staging, signed-file, document, case, plan, and chat URLs out of public sitemaps;
- run Lighthouse SEO and accessibility checks on the final set of representative public routes after the remaining design changes.

No mass SEO pages, invented testimonials, unverified credentials, or generated legal claims were added.
