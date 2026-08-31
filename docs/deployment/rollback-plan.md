# JURO Production Rollback Plan

Status: **active runbook, not a completion certificate**

Evidence cutoff: **2026-08-31 04:56 UZT (2026-08-30 23:56 UTC)**

This runbook covers the currently verified public Sites and platform Worker releases. It intentionally excludes legislation-database, legal-corpus, Lex.uz, Advice.uz, vector, and staging-capacity operations.

## Current rollback points

| Surface | Live release | Rollback release | Rollback trigger |
| --- | --- | --- | --- |
| Public website | Sites v95, source `855ba2161b716daabb96ac469456c101e5d3bb2c` | Saved Sites v94, source `6f5c70f947df14597cca2e289c3b38bbd36b589d` | Custom-domain outage, broken RU/UZ/EN entry route, sitemap regression, or incorrect indexing split |
| Platform Worker | v187, version ID `65ce3f7f-3469-4c43-854c-d073309befed` | v186, version ID `7b269272-4fc4-4911-97ab-8dfc28c260d0` | Verified platform regression, private-boundary failure, provider-probe amplification, or new critical error rate |

## Public Sites rollback

1. Confirm the regression on both `https://juro.uz` and the provider-owned Sites hostname.
2. Record the active Sites version and the failing HTTP, indexing, or browser evidence.
3. Redeploy the already saved v94. Do not create a new version merely to roll back.
4. Verify `/`, `/ru`, `/uz`, `/en`, `robots.txt`, and `sitemap.xml` on the custom domain.
5. Verify the provider hostname response headers and canonical metadata.
6. Re-run the 78-URL sitemap crawl and the discoverable JURO-zone link crawl.
7. Record the rollback deployment and the exact reason in `production-readiness.md`.

The v95 acceptance contract is:

- `juro.uz` remains indexable and uses self-canonical localized URLs;
- the provider hostname remains reachable but returns `X-Robots-Tag: noindex, nofollow, noarchive`;
- all 78 sitemap URLs return `200`;
- the public site renders in Chrome without console errors.

## Platform Worker rollback

1. Confirm the fault against the current v187 version and capture only bounded, non-sensitive diagnostics.
2. Prefer the Cloudflare version rollback to v186; do not rebuild an unrelated Git state.
3. Do not apply or alter a D1 migration during this rollback. v187 introduced no migration.
4. Verify public status, authentication redirects, private API `401` boundaries, lawyer-host routing, and the document-analysis route boundary.
5. Verify provider-probe evidence freshness and ensure failed probes are not writing every five minutes.
6. Run Chrome smoke on the public status page and the affected user route.
7. If the regression is not removed, stop additional production mutation and investigate from the captured evidence.

## Post-rollback minimum evidence

- active release/version confirmed from the hosting provider;
- HTTP and redirect evidence for the affected route;
- no critical Chrome console errors;
- public/private boundary unchanged;
- production `/api/status` reported honestly, even when still degraded for an external provider reason;
- rollback action and remaining limitation recorded in the readiness document.

## Data safety

Neither the Sites nor v187 Worker rollback requires a database mutation. Do not delete user data, alter secrets, change DNS, or touch the excluded legislation/corpus systems as part of these rollback paths.
