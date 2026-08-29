# JURO Production Readiness

Assessment: **NOT READY for the full execution brief**

Evidence cutoff: **2026-08-30 02:04 UZT (2026-08-29 21:04 UTC)**

Production is currently reachable, the lawyer cross-persona deep link is repaired, and the last captured public status surface reports operational. That is narrower than the requested Definition of Done: authenticated role journeys, staging reliability, provider-host indexing, legacy DNS ownership, and complete Chrome QA remain open.

## Current release state

| Surface | Current state | Evidence | Rollback point |
| --- | --- | --- | --- |
| GitHub main | Merge commit `0b2582fc0408cd737d409a9c7f22bfee2bb4b6f6` from PR #71; reviewed content head `fe79bebcd59a4a184f32dcc2917f79c26604aa13` | Exact-head CI run `33273684311` completed successfully for website and platform; security diff scan `abec8572-61bd-4749-82c8-b284850d4231` reviewed 23/23 source items with no reportable findings | Previous Git commit selected through normal Git release process |
| Public Sites | Live version **94**, source `6f5c70f947df14597cca2e289c3b38bbd36b589d` | Sites deployment succeeded; `juro.uz` is active and 78/78 sitemap URLs return `200` | Redeploy saved v94 if a later Sites release fails |
| Public Sites candidate | Saved version **95**, source `855ba2161b716daabb96ac469456c101e5d3bb2c` | Build, 48/48 route/SEO tests, type-check, lint, artifact validation, and 56 automated accessibility configurations passed | Not deployed; live production remains v94 |
| Platform Worker | Worker version **173**, version ID `3b662149-29db-4100-b7ef-74bd2eb2bd3d`; deployment `3e049065-5e32-4df8-8600-017468609ac9` | 100% traffic since `2026-08-29T20:59:55Z`; Chrome verified RU/UZ stale-dashboard recovery, fail-closed unrelated individual route, and edge overwrite of a spoofed request-path header | Prior stable version **171**, ID `addd006b-2620-4cf2-9b7d-49a4bac71b28`, deployment `c97c604b-9c2a-4eca-8b54-56bafd38249d` |
| Admin Worker | Version `67065fd8-fcc8-4c15-93c8-bc7b46ce4fcb`; deployment `2be71fe7-ee92-4e43-9bbd-d500f7deac5e` | 100% traffic since `2026-08-23T11:01:31Z`; production admin is reached through the platform host boundary | Use the immediately preceding Admin version only after reproducing the fault and validating the service binding |
| Platform staging Worker | Version `ca612aa6-3b01-4b6e-82e1-f337999a5f20`; deployment `6ef0e9fc-5f3a-4d0b-9ff0-2b95500f3e22` | Latest deployment `2026-08-28T23:54:16Z` | Previous staging version `6b700785-a72e-43b1-a2aa-e7f6839c4f0d` |

No database migration was performed. Platform Worker v173 was built from merge commit `0b2582fc0408cd737d409a9c7f22bfee2bb4b6f6` with the production-only deploy wrapper and `--containers-rollout none`.

## Live health

Production `/api/status` at `2026-08-29T19:08:52Z` (pre-v173 availability snapshot; not refreshed in the excluded legislation-database workstream):

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

This is a P1 release-gate failure even though the staging host returns HTTP `200`. Both configured Cloudflare schedules are active and were updated with the 28 August deployment, but a live `*/5` cron event at `2026-08-29T19:40:47Z` failed in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`. A read-only query reported `size_after=9,999,998,976` bytes and zero persisted scheduler runs after 21 August. Remediation belongs to the separately excluded legislation-database/corpus capacity scope; this increment only records the blocker.

## Evidence gates completed in this increment

- Cloudflare account and Worker deployment metadata read successfully with Wrangler 4.115.0.
- Cloudflare DNS inventory verified: 22 records and seven Worker hostnames.
- Public sitemap crawl: 78/78 URLs `200`, self-canonical, indexable.
- Discoverable link crawl: 136/136 final `200` after redirects.
- Protected production surfaces return both meta and header `noindex` directives.
- Sites v95 candidate restores `X-Robots-Tag: noindex, nofollow, noarchive` only on `*.chatgpt.site` while leaving `juro.uz` indexable.
- Sites v95 candidate validation: build pass, 48/48 tests, 56 accessibility configurations, type-check pass, lint pass, artifact validation pass.
- Release PR #71 passed website and platform CI at exact head `fe79bebcd59a4a184f32dcc2917f79c26604aa13`, passed the 23/23 source security diff review, and merged as `0b2582fc0408cd737d409a9c7f22bfee2bb4b6f6`.
- Platform Worker v173 deployed successfully with explicit production bindings and no database migration.
- Chrome production QA verified `lawyer.juro.uz/{ru,uz}/individual/dashboard` continues to the equivalent lawyer login destination, an unrelated individual route remains `404`, and a client-supplied `x-juro-request-path` cannot replace the edge-derived return path.

## Blocking gaps before a production-ready claim

| Priority | Gap | Evidence | Required action |
| --- | --- | --- | --- |
| P1 | Provider Sites hostname is indexable on live v94 | Live meta/header inspection | Publish saved v95 after explicit production approval, then recrawl both hosts |
| P1 | Staging health is degraded/stale after a newer deployment | Active cron delivery fails in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`; D1 reports 9,999,998,976 bytes | Resolve staging D1 capacity in the separately scoped legislation/corpus work, then verify fresh scheduler writes and 8/8 component health |
| P1 | Cloudflare reports partial origin IP exposure; FTP TLS is invalid | DNS dashboard and HTTPS probe | Establish ownership/need, back up configuration, then proxy, repair, or retire through a separate reversible DNS change |
| P1 | Authenticated role matrix incomplete | Only anonymous boundary checks are current | Chrome QA for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin with no fabricated session |
| P2 | Staging hostname drift | Code-only `app.staging` / `lawyer.staging` do not resolve | Normalize to `staging.app.juro.uz` or intentionally provision Access-protected aliases |
| P2 | Older Draft PRs still contain overlapping or conflicted work | Current GitHub PR list | Close the clean component PRs superseded by merged PR #71; reconcile the remaining independent branches separately |

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
