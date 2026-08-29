# JURO Production Readiness

Assessment: **NOT READY for the full execution brief**

Evidence cutoff: **2026-08-30 00:18 UZT (2026-08-29 19:18 UTC)**

Production is currently reachable and the public status surface reports operational. That is narrower than the requested Definition of Done: authenticated role journeys, staging reliability, provider-host indexing, legacy DNS ownership, and complete Chrome QA remain open.

## Current release state

| Surface | Current state | Evidence | Rollback point |
| --- | --- | --- | --- |
| GitHub main | `da54857d40acb8440e90d1f039ffe6afc0466caf` | CI run `33256948254` completed successfully for website and platform | Previous Git commit selected through normal Git release process |
| Public Sites | Live version **94**, source `6f5c70f947df14597cca2e289c3b38bbd36b589d` | Sites deployment succeeded; `juro.uz` is active and 78/78 sitemap URLs return `200` | Redeploy saved v94 if a later Sites release fails |
| Public Sites candidate | Saved version **95**, source `855ba2161b716daabb96ac469456c101e5d3bb2c` | Build, 48/48 route/SEO tests, type-check, lint, artifact validation, and 56 automated accessibility configurations passed | Not deployed; live production remains v94 |
| Platform Worker | Worker version **171**, version ID `addd006b-2620-4cf2-9b7d-49a4bac71b28`; deployment `c97c604b-9c2a-4eca-8b54-56bafd38249d` | 100% traffic since `2026-08-29T14:14:28Z` | Prior known version `8a51f26c-2011-4ea0-a8f9-2e5a80316ce6` from deployment `8dc989ba-014b-4a40-87e5-d017d8a4488e` |
| Admin Worker | Version `67065fd8-fcc8-4c15-93c8-bc7b46ce4fcb`; deployment `2be71fe7-ee92-4e43-9bbd-d500f7deac5e` | 100% traffic since `2026-08-23T11:01:31Z`; production admin is reached through the platform host boundary | Use the immediately preceding Admin version only after reproducing the fault and validating the service binding |
| Platform staging Worker | Version `ca612aa6-3b01-4b6e-82e1-f337999a5f20`; deployment `6ef0e9fc-5f3a-4d0b-9ff0-2b95500f3e22` | Latest deployment `2026-08-28T23:54:16Z` | Previous staging version `6b700785-a72e-43b1-a2aa-e7f6839c4f0d` |

No database migration or production Worker deployment was performed by this audit increment.

## Live health

Production `/api/status` at `2026-08-29T19:08:52Z`:

- overall: `operational`;
- components: **8/8 operational**;
- active incidents: **0**;
- OpenAI synthetic probe: operational, **4,309 ms**;
- Anthropic synthetic probe: operational, **6,007 ms**;
- private R2 probe: operational, **2,140 ms**;
- queue probe: operational, **2,059 ms**;
- malware scanner probe: operational, **27,916 ms**;
- D1 scheduled probe: operational, **48,797 ms**.

The operational label is current evidence of availability, not proof that every product flow meets the brief's latency targets. In particular, the observed D1 and malware-scanner probe latencies require trend/p95 review before a broad performance claim.

Staging `/api/status` at `2026-08-29T19:08:53Z`:

- overall: `degraded`;
- components: **0/8 operational**;
- most evidence last checked between **2026-08-12 and 2026-08-21**;
- OpenAI: `degraded`, safe error `PROVIDER_UNAVAILABLE`;
- Anthropic, D1, queues, R2, malware scanner: `stale`;
- document builder and lawyer handoff: `unknown`.

This is a P1 release-gate failure even though the staging host returns HTTP `200`.

## Evidence gates completed in this increment

- Cloudflare account and Worker deployment metadata read successfully with Wrangler 4.115.0.
- Cloudflare DNS inventory verified: 22 records and seven Worker hostnames.
- Public sitemap crawl: 78/78 URLs `200`, self-canonical, indexable.
- Discoverable link crawl: 136/136 final `200` after redirects.
- Protected production surfaces return both meta and header `noindex` directives.
- Sites v95 candidate restores `X-Robots-Tag: noindex, nofollow, noarchive` only on `*.chatgpt.site` while leaving `juro.uz` indexable.
- Sites v95 candidate validation: build pass, 48/48 tests, 56 accessibility configurations, type-check pass, lint pass, artifact validation pass.
- Draft PR #68 remains clean and has two successful CI jobs at exact head `7d817c995450d9961b1d64c3d5b323a52e34cf3e`.

## Blocking gaps before a production-ready claim

| Priority | Gap | Evidence | Required action |
| --- | --- | --- | --- |
| P1 | Provider Sites hostname is indexable on live v94 | Live meta/header inspection | Publish saved v95 after explicit production approval, then recrawl both hosts |
| P1 | Staging health is degraded/stale after a newer deployment | Public staging status JSON | Restore scheduled/synthetic probe writes, verify fresh timestamps and 8/8 component health |
| P1 | Lawyer cross-persona deep link returns `404` | Live `lawyer.juro.uz/ru/individual/dashboard` | Add a host-aware redirect or remove every producer of the invalid URL; test login continuation |
| P1 | Cloudflare reports partial origin IP exposure; FTP TLS is invalid | DNS dashboard and HTTPS probe | Establish ownership/need, back up configuration, then proxy, repair, or retire through a separate reversible DNS change |
| P1 | Authenticated role matrix incomplete | Only anonymous boundary checks are current | Chrome QA for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin with no fabricated session |
| P2 | Staging hostname drift | Code-only `app.staging` / `lawyer.staging` do not resolve | Normalize to `staging.app.juro.uz` or intentionally provision Access-protected aliases |
| P2 | GitHub work is fragmented across eight open Draft PRs | Current GitHub PR list | Reconcile dependencies and conflicts without merging directly until exact-head CI and production evidence are current |

## Rollback protocol

### Sites

1. Keep live v94 until v95 publication is explicitly authorized.
2. After publishing v95, verify `juro.uz`, RU/UZ/EN entry routes, `robots.txt`, sitemap, and the provider hostname header.
3. If the custom domain or public routes regress, redeploy saved v94 immediately.

### Platform Worker

1. Record the active deployment/version before a release.
2. Run CI and artifact checks against the exact deploy commit.
3. Avoid D1 migration unless a separately reviewed change requires one; this increment has none.
4. Deploy with the explicit production environment, then verify public/private boundaries, logs, status evidence freshness, error rate, and provider probes.
5. Roll back to the recorded prior Worker version if a verified regression appears.

### DNS

No DNS record should be changed until the record owner, service purpose, current clients, TLS behavior, and recovery record set are documented. Export/record the exact old value before any mutation.

## Scope exclusion

Per owner instruction, this readiness increment does not inspect or change the legislation database, legal corpus, Lex.uz ingestion, Advice.uz ingestion, vector stores, source documents, or legal evaluation data. Those items remain unproven rather than implicitly complete.
