# JURO Production Readiness

Assessment: **NOT READY for the full execution brief**

Evidence cutoff: **2026-09-01 08:49 UZT (2026-09-01 03:49 UTC)**

Production is reachable, Worker v99 is serving the platform, and Sites v95 is live on the public website. v99 adds workspace invitation authorization/expiry enforcement and a streamed-byte limit for public structured API bodies while preserving controlled upload routes. Sites v95 preserves the noindex boundary on the provider-owned hostname without removing indexing from `juro.uz`. The latest public status reports all eight components operational, backed by repeated successful provider records. That is still narrower than the requested Definition of Done: authenticated role journeys, staging reliability, legacy DNS ownership, full performance/accessibility evidence, and complete Chrome QA remain open.

## Current release state

| Surface | Current state | Evidence | Rollback point |
| --- | --- | --- | --- |
| GitHub release source | Commit `7935d560b29705f1886fa34f7bb61eb1b3af2c11`; Draft PR #101 remains open | PR CI `33466544141` completed both website and platform validation successfully | Previous reviewed release commit selected through the normal release process |
| Public Sites | Live version **95**, source `855ba2161b716daabb96ac469456c101e5d3bb2c`; deployment `appgdep_6a94c1cfc364819190b65a5cb0a7e5ad` | Deployment succeeded; `juro.uz` remains indexable, the provider hostname returns `X-Robots-Tag: noindex, nofollow, noarchive`, 78/78 sitemap URLs and 149/149 discoverable JURO-zone links return `200` | Redeploy saved v94, source `6f5c70f947df14597cca2e289c3b38bbd36b589d`, if the public custom domain regresses |
| Platform Worker | Worker version **99**, version ID `0b35483c-9bf4-4a21-ba45-dadbde198f83` | Controlled production deployment `6c3c5410-c16a-46dd-ae78-6ee580baf641` serves 100% traffic; no migration, Admin, Sites, DNS, binding, or secret change | Immediate prior version **98**, ID `b1b242f0-9033-40e3-bdf2-d9aee9ef5b48` |
| Admin Worker | Version `67065fd8-fcc8-4c15-93c8-bc7b46ce4fcb`; deployment `2be71fe7-ee92-4e43-9bbd-d500f7deac5e` | 100% traffic since `2026-08-23T11:01:31Z`; production admin is reached through the platform host boundary | Use the immediately preceding Admin version only after reproducing the fault and validating the service binding |
| Platform staging Worker | Version `ca612aa6-3b01-4b6e-82e1-f337999a5f20`; deployment `6ef0e9fc-5f3a-4d0b-9ff0-2b95500f3e22` | Latest deployment `2026-08-28T23:54:16Z` | Previous staging version `6b700785-a72e-43b1-a2aa-e7f6839c4f0d` |

Platform Worker v99 was built from commit `7935d560b29705f1886fa34f7bb61eb1b3af2c11` after exact-head PR CI. It preserves dedicated lawyer routing, status metadata, provider/document-analysis behavior, direct D1 measurement, and the internal admin upload boundary. No database migration, DNS, binding, secret, CSP, Admin, staging, Sites, or legislation/corpus change was performed.

## Live health

Production `/api/status` generated at `2026-09-01T03:49:05.435Z` after the v99 cutover:

- overall: `operational`;
- components: **8/8 operational**;
- active incidents: **0**;
- D1 synthetic probe: `operational`, checked at `2026-09-01T03:46:45.749Z`, latency `35 ms`;
- OpenAI synthetic probe: `operational`, checked at `2026-09-01T03:42:08.991Z`, latency `3,273 ms`;
- Anthropic synthetic probe: `operational`, checked at `2026-09-01T03:42:16.942Z`, latency `7,875 ms`;
- routed document-analysis probe: `operational`, checked at `2026-09-01T03:21:49.369Z`, latency `4,390 ms`;
- read-only D1 inspection found five consecutive operational records for each provider and routed document analysis, so recovery is not inferred from one transient row;
- the public API exposes no provider response body, credential, request content, or user traffic;
- authenticated Chrome role and Legal Answer journeys were not run in this increment.

The operational label is correct for this checked production snapshot. Repeated D1 rows show that both provider contracts and routed document analysis recovered after funding, while existing cooldown/fallback behavior remains in place. This health evidence does not replace authenticated Legal Answer or deliberate primary-outage fallback QA.

Staging `/api/status` at `2026-08-29T19:08:53Z`:

- overall: `degraded`;
- components: **0/8 operational**;
- most evidence last checked between **2026-08-12 and 2026-08-21**;
- OpenAI: `degraded`, safe error `PROVIDER_UNAVAILABLE`;
- Anthropic, D1, queues, R2, malware scanner: `stale`;
- document builder and lawyer handoff: `unknown`.

This is a P1 release-gate failure even though the staging host returns HTTP `200`. Both configured Cloudflare schedules are active and were updated with the 28 August deployment, but a live `*/5` cron event at `2026-08-29T19:40:47Z` failed in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`. A read-only query reported `size_after=9,999,998,976` bytes and zero persisted scheduler runs after 21 August. Remediation belongs to the separately excluded legislation-database/corpus capacity scope; this increment only records the blocker.

## Evidence gates completed across the current release history

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
- Document-analysis runtime PR #73 passed exact-head CI run `33276513529`, local focused tests (82/82), core tests (1,119/1,119), worker/runtime tests (202/202), lint, type-check, production artifact validation, Cloudflare matrix dry-run, dependency audit, license policy, and a 7/7 source security diff review with no findings or candidates.
- Platform Worker v175 deployed successfully with no database migration. Chrome then observed fresh operational document-analysis evidence (`8,840 ms`) and confirmed the protected document-analysis route returns the localized login boundary without exposing private content.
- Lawyer lifecycle/profile PR #75 passed exact-head CI run `33279675792`, focused lifecycle tests (14/14), runtime tests (202/202), the full platform suite, lint, type-check, artifact budgets, Cloudflare matrix, dependency audit and license policy. Security scan `809696a4-d761-42ea-a7f3-3f9b8efecd3b` completed 40/40 review items with no candidates or findings.
- Platform Worker v176 deployed at 100% traffic. Production D1 migration ledger 0146 was reconciled only after exact live-schema validation; independently restorable pre/post SQL exports were hash-verified locally and after private R2 readback.
- Chrome observed HTTP `200`, operational 8/8 status, only `public_approved` profiles from the public lawyer API, the safe private-dashboard login redirect and a 360 px registration layout without horizontal overflow. No real signed-in sessions were present, so authenticated roles remain open.
- Security-remediation PR #77 merged as `98ca3c16b0f7e55beb85a00a03a4fdb5c6a64d3e`; CI run `33308098609` and production workflow `33308447146` completed successfully, publishing Worker v177 at 100% traffic without a migration or Sites change.
- Provider-probe PR #78 passed 11/11 focused tests plus the full platform suites (33/33 rendered, 1,130/1,130 core, 204/204 Worker/runtime), lint, type-check, production artifact budgets, Cloudflare environment matrix, dependency audit, and licence policy. PR CI `33311452240` and post-merge CI `33311790415` both completed successfully.
- Worker v178 deployed at 100% traffic through production workflow `33311790082`; Admin and public Sites jobs were skipped. Direct Cloudflare inspection confirmed version `85bdf326-4f4a-44d1-9540-06b5ad88fc46` in deployment `9b32983c-dc42-49ad-9888-3e9e777a48f2`.
- Historical v178 production log and status evidence proved that snapshot's AI degradation was OpenAI HTTP `429` / `credit_balance_exhausted` while Anthropic was operational. This statement is time-bounded and does not override the later v179 health snapshot below.
- Staging-host PR #80 passed 7/7 focused routing tests, 31/31 expanded auth/MFA/Worker tests, the full platform suites (33/33 rendered, 1,130/1,130 core, 204/204 Worker/runtime), lint, type-check, artifact budgets, Cloudflare environment matrix, dependency audit, and licence policy. PR CI `33313838079` and post-merge CI `33314211797` both completed successfully.
- Worker v179 deployed at 100% traffic through production workflow `33314211943`; Admin and public Sites jobs were skipped. Direct Cloudflare inspection confirmed version `7ffc07cd-4ebb-46ce-b659-ed4cf0ae9c79` in deployment `26f52ed8-bde8-4dc5-84c2-2ab74b912e40`.
- Anonymous staging verification confirmed `staging.app.juro.uz/ru/lawyer/auth` redirects to Cloudflare Access with `no-store`; both rejected aliases remain absent from DNS. The staging Worker was not redeployed, so authenticated post-Access runtime QA remains open.
- Chrome on v179 first reproduced the truthful degraded 7/8 production status, then the later 6/8 state after Anthropic changed to `PROVIDER_UNAVAILABLE`; both captures had zero active incidents and no console errors.
- Narrowly filtered v179 provider-probe logs isolated OpenAI HTTP `429` / `credit_balance_exhausted` and Anthropic HTTP `400` / `invalid_request_error` without reading user traffic or exposing provider payloads or credentials.
- Provider-cooldown PR #91 passed 25/25 focused tests, 1,138/1,138 core tests, 216/216 Worker/runtime tests, lint, type-check, Cloudflare matrix validation, production artifact validation, dependency audits, licence policy, and a complete security diff scan with zero findings.
- Worker v187 deployed through production workflow `33341511530`; direct version inspection confirmed ID `65ce3f7f-3469-4c43-854c-d073309befed` with v186 `7b269272-4fc4-4911-97ab-8dfc28c260d0` retained as rollback.
- Read-only production evidence confirmed provider cooldown gaps of 10.36–15.82 minutes and a document-analysis gap of 26.2 minutes, replacing the previous 3–6 minute failure cadence.
- Direct-D1 PR #93 passed 61/61 focused tests, 1,138/1,138 core tests, 217/217 Worker/runtime tests, lint, type-check, Cloudflare generated-types and environment-matrix checks, artifact budgets, dependency audits, licence policy, and a complete four-surface security diff scan with zero candidates or findings.
- Worker v188 deployed at 100% traffic through production workflow `33347775254`; direct inspection confirmed version `57387083-9f7f-4cd8-a9f2-84414f2604d6`, with v187 `65ce3f7f-3469-4c43-854c-d073309befed` retained as rollback.
- A fresh five-minute schedule wrote D1 `synthetic_probe` evidence at `35 ms`; Chrome showed the same operational database state while correctly preserving the overall provider-driven degraded status.
- Sites v95 deployed successfully from saved source `855ba2161b716daabb96ac469456c101e5d3bb2c`. Post-deploy checks proved 78/78 sitemap URLs and 149/149 discoverable JURO-zone links return `200`; `juro.uz` remains indexable and the provider hostname returns `X-Robots-Tag: noindex, nofollow, noarchive` across entry routes, `robots.txt`, and `sitemap.xml`.
- Status-favicon PR #95 passed 4/4 focused tests, 1,142/1,142 core tests, 217/217 Worker/runtime tests, 33/33 rendered-route tests, lint, type-check, Cloudflare environment matrix, artifact budgets, generated types, dependency audits, and licence policy. Exact-head CI `33352197361`, post-merge CI `33404886188`, and production workflow `33404885913` passed.
- Worker v189 deployed at 100% traffic with version ID `102dcb2d-f79f-4172-9a3a-19d55d51f6ed`; v188 `57387083-9f7f-4cd8-a9f2-84414f2604d6` is retained as rollback. Chrome and raw HTTP verification closed the status favicon CSP defect on five production routes without changing CSP.
- Chrome verified both the custom domain and provider hostname render the intended RU site without console errors; the final handoff tab was returned to `https://juro.uz/ru`.
- Superseded broad Draft PR #64 was closed without deleting its branch. Its 486-file candidate remains recoverable for separately audited extraction, but it is no longer presented as a mergeable release unit.

## Blocking gaps before a production-ready claim

| Priority | Gap | Evidence | Required action |
| --- | --- | --- | --- |
| P1 | Staging health is degraded/stale after a newer deployment | Active cron delivery fails in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`; D1 reports 9,999,998,976 bytes | Resolve staging D1 capacity in the separately scoped legislation/corpus work, then verify fresh scheduler writes and 8/8 component health |
| P1 | Cloudflare reports partial origin IP exposure; FTP TLS is invalid | DNS dashboard and HTTPS probe | Establish ownership/need, back up configuration, then proxy, repair, or retire through a separate reversible DNS change |
| P1 | Authenticated role matrix incomplete | Only anonymous boundary checks are current | Chrome QA for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin with no fabricated session |
| P2 | Production v99 behavior is not deployed or authenticated on staging | The canonical host is Access-protected; staging Worker remains on its prior version | Deploy staging only in a safe non-legislation increment, then complete post-Access Client/Lawyer route QA with real authorized sessions |

## Rollback protocol

### Sites

1. Keep saved v94 as the rollback while v95 is live.
2. Preserve the verified split: `juro.uz` remains indexable and the provider hostname carries the noindex response header.
3. If the custom domain, public routes, or indexing split regresses, redeploy saved v94 immediately and recrawl both hosts.

### Platform Worker

1. Record the active deployment/version before a release.
2. Run CI and artifact checks against the exact deploy commit.
3. Apply D1 migration only when a separately reviewed change requires it, and verify schema plus a restorable backup before any ledger reconciliation.
4. Deploy with the explicit production environment, then verify public/private boundaries, logs, status evidence freshness, error rate, and provider probes.
5. For v99, roll back to Worker v98 version `b1b242f0-9033-40e3-bdf2-d9aee9ef5b48` if a verified regression appears.

### DNS

No DNS record should be changed until the record owner, service purpose, current clients, TLS behavior, and recovery record set are documented. Export/record the exact old value before any mutation.

## Scope exclusion

Per owner instruction, this readiness increment does not inspect or change the legislation database, legal corpus, Lex.uz ingestion, Advice.uz ingestion, vector stores, source documents, or legal evaluation data. Those items remain unproven rather than implicitly complete.
