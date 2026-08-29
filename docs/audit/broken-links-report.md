# JURO Broken Links Report

Evidence cutoff: **2026-08-30 00:18 UZT**

Live site: `https://juro.uz` Sites v94

## Result

- Sitemap URLs fetched: **78**
- Unique internal links extracted and normalized: **136**
- `juro.uz` links: **121**
- `app.juro.uz` links: **15**
- Final responses after up to five redirects: **136 × HTTP 200**
- Unresolved or final non-2xx links in that discoverable-link set: **0**

The crawl used rendered HTML from every sitemap URL, resolved relative links, removed fragments, retained JURO-zone web links, and performed HTTPS GETs using a Chrome user agent. The check validates reachability, not authenticated product outcomes.

## Important failures outside the sitemap link set

| URL / host | Evidence | Impact | Status / action |
| --- | --- | --- | --- |
| `https://lawyer.juro.uz/ru/individual/dashboard` | Final `404`, no redirect | User-visible “Not Found” on a cross-persona deep link | `BROKEN`; route to the lawyer destination or explicitly deprecate the URL |
| `https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site/` | `200`, canonical to `juro.uz/ru`, but indexable | Duplicate provider-host copy can be indexed | `SECURITY RISK`; validated noindex fix is saved as v95 |
| `https://api.juro.uz/` | DNS does not resolve | Stale docs/links would fail | `DEPRECATED`; remove current-state references unless provisioned |
| `https://app.staging.juro.uz/` | DNS does not resolve | Wrong staging spelling in the Sites v94 analytics bridge | `BROKEN`; use `staging.app.juro.uz` |
| `https://lawyer.staging.juro.uz/` | DNS does not resolve | Code accepts a hostname users cannot reach | `MISSING`; provision behind Access or remove the alias |
| `https://ftp.juro.uz/` | TLS certificate hostname validation fails | Legacy service is not safely reachable over HTTPS | `SECURITY RISK`; confirm owner and intended protocol before change |

## Caveats

- A final `200` on `app.juro.uz` may be the localized login page after a correct authentication redirect; it does not prove the protected feature completed.
- The crawler did not submit forms, create accounts, send OTPs, upload documents, make payments, or modify data.
- The legislation database and legal-source ingestion routes were excluded by owner instruction.
- Browser visual, keyboard, and responsive review is tracked separately; this report is about link resolution.
