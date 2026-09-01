# JURO Production Rollback Plan

Status: **active runbook, not a completion certificate**

Evidence cutoff: **2026-09-02 03:15 UZT (2026-09-01 22:15 UTC)**

This runbook covers the currently verified public Sites and platform Worker releases. It intentionally excludes legislation-database, legal-corpus, Lex.uz, Advice.uz, vector, and staging-capacity operations.

## Current rollback points

| Surface | Live release | Rollback release | Rollback trigger |
| --- | --- | --- | --- |
| Public website | Sites v96, source `489c56d029f164c030127f7465d528f8f1bdf396` | Saved Sites v95, source `855ba2161b716daabb96ac469456c101e5d3bb2c` | Custom-domain outage, broken RU/UZ/EN entry route, sitemap regression, incorrect indexing split, or public mobile accessibility regression |
| Public website Worker | version ID `fad80c80-ee92-44bb-93a3-e250ee314891` | v114 version ID `5f04e052-c2ef-4af7-820a-b29819bcdef9` | Verified Worker-only public route, asset, or runtime regression |
| Platform Worker | version ID `ca427ea9-97cb-45fe-84dc-b468e8bd8995` | v114 version ID `cef2e39c-4f56-4743-9287-b036192f1771` | Verified platform regression, private-boundary failure, auth/Turnstile layout regression, CSP regression, or new critical error rate |

## Public Sites rollback

1. Confirm the regression on both `https://juro.uz` and the provider-owned Sites hostname.
2. Record the active Sites version and the failing HTTP, indexing, or browser evidence.
3. Redeploy the already saved v95. Do not create a new version merely to roll back. Saved v94 remains a secondary older recovery point.
4. Verify `/`, `/ru`, `/uz`, `/en`, `robots.txt`, and `sitemap.xml` on the custom domain.
5. Verify the provider hostname response headers and canonical metadata.
6. Re-run the 78-URL sitemap crawl and the discoverable JURO-zone link crawl.
7. Record the rollback deployment and the exact reason in `production-readiness.md`.

The v96 acceptance contract is:

- `juro.uz` remains indexable and uses self-canonical localized URLs;
- the provider hostname remains reachable but returns `X-Robots-Tag: noindex, nofollow, noarchive`;
- all 78 sitemap URLs return `200`;
- the public site renders in Chrome without console errors.

## Platform Worker rollback

1. Confirm the fault against the current v115 platform or website Worker version and capture only bounded, non-sensitive diagnostics.
2. Prefer the Cloudflare version rollback to the corresponding v114 version; do not rebuild an unrelated Git state.
3. Do not apply or alter a D1 migration during this rollback. v115 introduced no migration.
4. Verify public status, authentication redirects, private API `401` boundaries, lawyer-host routing, and the document-analysis route boundary.
5. Verify D1 evidence is a direct `synthetic_probe` with plausible latency, then verify provider-probe evidence freshness and ensure failed probes are not writing every five minutes.
6. Run Chrome smoke on the status root, unlocalized/localized status routes, and app-host status route; confirm same-origin icons, unchanged CSP, and a clean console.
7. If the regression is not removed, stop additional production mutation and investigate from the captured evidence.

## Post-rollback minimum evidence

- active release/version confirmed from the hosting provider;
- HTTP and redirect evidence for the affected route;
- no critical Chrome console errors;
- public/private boundary unchanged;
- production `/api/status` reported honestly, even when still degraded for an external provider reason;
- rollback action and remaining limitation recorded in the readiness document.

## Data safety

Neither the Sites nor v115 Worker rollback requires a database mutation. Do not delete user data, alter secrets, change DNS, or touch the excluded legislation/corpus systems as part of these rollback paths.
