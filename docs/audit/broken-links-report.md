# JURO Broken Links Report

Evidence cutoff: **2026-08-30 18:30 UZT**

Live site: `https://juro.uz` Sites v94

## Result

- Sitemap URLs fetched: **78**
- Unique internal links extracted and normalized: **136**
- `juro.uz` links: **121**
- `app.juro.uz` links: **15**
- Final responses after up to five redirects: **136 × HTTP 200**
- Unresolved or final non-2xx links in that discoverable-link set: **0**

The crawl used rendered HTML from every sitemap URL, resolved relative links, removed fragments, retained JURO-zone web links, and performed HTTPS GETs using a Chrome user agent. The check validates reachability, not authenticated product outcomes.

## Important outcomes outside the sitemap link set

| URL / host | Evidence | Impact | Status / action |
| --- | --- | --- | --- |
| `https://lawyer.juro.uz/ru/individual/dashboard` | Worker v179 preserves the compatibility redirect to `https://lawyer.juro.uz/ru/auth/login?returnTo=%2Fru%2Flawyer%2Fdashboard`, final `200`; the canonical `/ru/lawyer/dashboard` was also verified in an isolated Chrome context | The reported cross-persona “Not Found” remains removed without exposing unrelated individual routes | `VERIFIED` for the anonymous boundary; authenticated Lawyer journey remains a separate evidence gate |
| `https://app.juro.uz/ru/individual/document-analysis` | Worker v179 preserves the protected boundary established on v175; the current status surface reports document analysis operational | Canonical protected route remains deployed without a public-data claim | `VERIFIED` for the previously captured anonymous boundary; authenticated upload and completed-result flow remain separate evidence gates |
| `https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site/` | `200`, canonical to `juro.uz/ru`, but indexable | Duplicate provider-host copy can be indexed | `SECURITY RISK`; validated noindex fix is saved as v95 |
| `https://api.juro.uz/` | DNS does not resolve | Stale docs/links would fail | `DEPRECATED`; remove current-state references unless provisioned |
| `https://staging.app.juro.uz/ru/lawyer/auth` | `302` to Cloudflare Access with `Cache-Control: no-store` | Canonical staging lawyer path remains protected before application execution | `VERIFIED` for the anonymous Access boundary; authenticated runtime QA remains open |
| `https://app.staging.juro.uz/` | DNS does not resolve; PR #80 makes the platform routing helper return no lawyer origin | The wrong spelling can no longer be selected as a platform lawyer destination | `RESOLVED IN CODE`; keep rejected and use `staging.app.juro.uz` |
| `https://lawyer.staging.juro.uz/` | DNS does not resolve; PR #80 removed it from Worker and OTP/MFA dedicated-host routing | The formerly accepted hostname is no longer treated as a reachable lawyer host | `RESOLVED IN CODE`; shared staging uses `staging.app.juro.uz/{locale}/lawyer/**` |
| `https://ftp.juro.uz/` | TLS certificate hostname validation fails | Legacy service is not safely reachable over HTTPS | `SECURITY RISK`; confirm owner and intended protocol before change |

## Caveats

- A final `200` on `app.juro.uz` may be the localized login page after a correct authentication redirect; it does not prove the protected feature completed.
- The crawler did not submit forms, create accounts, send OTPs, upload documents, make payments, or modify data.
- The legislation database and legal-source ingestion routes were excluded by owner instruction.
- Browser visual, keyboard, and responsive review is tracked separately; this report is about link resolution.
