# Staging 0054 — bounded Advice sitemap discovery

Date: 2026-08-01

## Deployment evidence

- Worker: `juro-platform-staging`
- Cloudflare version: `5300bd5d-db31-405f-829b-389528c8b543`
- Deployment command: `npx wrangler deploy --config dist/server/wrangler.json`
- D1 binding: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)
- Legal queue: `staging-legal-sources-sync`, one consumer with concurrency one.

Cloudflare reported `LEGAL_ADVICE_SITEMAP_DISCOVERY_ENABLED="false"` for this staging deployment. The capability is present but cannot initiate any sitemap request until separately enabled after policy/load approval. Production was not deployed or reconfigured.

## Implemented boundary

Discovery reads only a public `Sitemap:` declaration from `https://advice.uz/robots.txt`, accepts only HTTPS `advice.uz` sitemap files at explicitly allowed paths, does not follow redirects or arbitrary links, streams at most 512 KiB per response, and submits no more than 20 exact existing Allowlist-compatible document URLs. Submission then uses the ordinary robots-aware Advice acquisition and lands in `pending` legal review; it never publishes, indexes, or serves a source to AI.

## Verification

- `npm test` — exit 0, including sitemap discovery and aggregate lifecycle regressions.
- `npm run build:staging` — exit 0; generated Sites artifact validated for staging.
- `npx wrangler deploy --config dist/server/wrangler.json` — exit 0.

No live Advice sitemap execution, source verification, legal publication, or corpus-indexing claim is made by this evidence.
