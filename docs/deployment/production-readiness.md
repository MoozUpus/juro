# JURO Production Readiness

Assessment: **NOT READY for the full execution brief**

Evidence cutoff: **2026-08-30 18:30 UZT (2026-08-30 13:30 UTC)**

Production is currently reachable and Worker v179 is serving 100% of traffic. v178 isolated OpenAI and Anthropic health probes; v179 removes non-resolving staging lawyer aliases and keeps production on the dedicated `lawyer.juro.uz` persona while canonical staging uses `staging.app.juro.uz/{locale}/lawyer/**`. The latest captured public status surface truthfully reports 7/8 components operational and AI degraded: OpenAI remains `PROVIDER_UNAVAILABLE`, while Anthropic remains operational. That is narrower than the requested Definition of Done: authenticated role journeys, staging reliability, provider-host indexing, legacy DNS ownership, and complete Chrome QA remain open.

## Current release state

| Surface | Current state | Evidence | Rollback point |
| --- | --- | --- | --- |
| GitHub main | Merge commit `8b650f566ec2f5a9511565a6fdb62eca8a86a7b6` from PR #80; reviewed content head `d42ff9db537313f83851559d9bd7a5b282c333b1` | PR CI run `33313838079` and post-merge CI run `33314211797` completed successfully for website and platform | Previous Git commit selected through normal Git release process |
| Public Sites | Live version **94**, source `6f5c70f947df14597cca2e289c3b38bbd36b589d` | Sites deployment succeeded; `juro.uz` is active and 78/78 sitemap URLs return `200` | Redeploy saved v94 if a later Sites release fails |
| Public Sites candidate | Saved version **95**, source `855ba2161b716daabb96ac469456c101e5d3bb2c` | Build, 48/48 route/SEO tests, type-check, lint, artifact validation, and 56 automated accessibility configurations passed | Not deployed; live production remains v94 |
| Platform Worker | Worker version **179**, version ID `7ffc07cd-4ebb-46ce-b659-ed4cf0ae9c79`; deployment `26f52ed8-bde8-4dc5-84c2-2ab74b912e40` | 100% traffic since `2026-08-30T13:27:58Z`; production workflow `33314211943` deployed only `app.juro.uz` and skipped the Admin Worker and public Sites | Prior version **178**, ID `85bdf326-4f4a-44d1-9540-06b5ad88fc46`, deployment `9b32983c-dc42-49ad-9888-3e9e777a48f2` |
| Admin Worker | Version `67065fd8-fcc8-4c15-93c8-bc7b46ce4fcb`; deployment `2be71fe7-ee92-4e43-9bbd-d500f7deac5e` | 100% traffic since `2026-08-23T11:01:31Z`; production admin is reached through the platform host boundary | Use the immediately preceding Admin version only after reproducing the fault and validating the service binding |
| Platform staging Worker | Version `ca612aa6-3b01-4b6e-82e1-f337999a5f20`; deployment `6ef0e9fc-5f3a-4d0b-9ff0-2b95500f3e22` | Latest deployment `2026-08-28T23:54:16Z` | Previous staging version `6b700785-a72e-43b1-a2aa-e7f6839c4f0d` |

Platform Worker v179 was built from merge commit `8b650f566ec2f5a9511565a6fdb62eca8a86a7b6` by production workflow `33314211943`. This release canonicalizes lawyer destinations on the real protected staging host, rejects the non-resolving `app.staging.juro.uz` and `lawyer.staging.juro.uz` aliases in platform routing, and preserves `lawyer.juro.uz` as the only dedicated lawyer host. No database migration, DNS change, public Sites deployment, Admin Worker deployment, staging Worker deployment, or legislation-corpus operation was performed.

## Live health

Production `/api/status` fetched at `2026-08-30T13:30:09Z` after the v179 cutover:

- overall: `degraded`;
- components: **7/8 operational**;
- active incidents: **0**;
- OpenAI synthetic probe: `degraded`, checked at `2026-08-30T13:27:16.441Z`, latency `3,765 ms`, safe error `PROVIDER_UNAVAILABLE`;
- Anthropic synthetic probe: `operational`, checked at `2026-08-30T13:27:22.567Z`, latency `5,677 ms`;
- the earlier matching v178 structured production log isolated the same OpenAI failure class as HTTP `429` with allowlisted provider error type `credit_balance_exhausted`, without raw provider content or credentials;
- Chrome showed the same degraded overall state, 7/8 operational components, no active incidents, and no browser-console errors.

The degraded label is the correct current release evidence. The v178 isolation fix improved diagnostic correctness, and v179 preserves that behavior while correcting staging routing. Anthropic balance and availability do not clear an exhausted OpenAI credit balance.

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
- Document-analysis runtime PR #73 passed exact-head CI run `33276513529`, local focused tests (82/82), core tests (1,119/1,119), worker/runtime tests (202/202), lint, type-check, production artifact validation, Cloudflare matrix dry-run, dependency audit, license policy, and a 7/7 source security diff review with no findings or candidates.
- Platform Worker v175 deployed successfully with no database migration. Chrome then observed fresh operational document-analysis evidence (`8,840 ms`) and confirmed the protected document-analysis route returns the localized login boundary without exposing private content.
- Lawyer lifecycle/profile PR #75 passed exact-head CI run `33279675792`, focused lifecycle tests (14/14), runtime tests (202/202), the full platform suite, lint, type-check, artifact budgets, Cloudflare matrix, dependency audit and license policy. Security scan `809696a4-d761-42ea-a7f3-3f9b8efecd3b` completed 40/40 review items with no candidates or findings.
- Platform Worker v176 deployed at 100% traffic. Production D1 migration ledger 0146 was reconciled only after exact live-schema validation; independently restorable pre/post SQL exports were hash-verified locally and after private R2 readback.
- Chrome observed HTTP `200`, operational 8/8 status, only `public_approved` profiles from the public lawyer API, the safe private-dashboard login redirect and a 360 px registration layout without horizontal overflow. No real signed-in sessions were present, so authenticated roles remain open.
- Security-remediation PR #77 merged as `98ca3c16b0f7e55beb85a00a03a4fdb5c6a64d3e`; CI run `33308098609` and production workflow `33308447146` completed successfully, publishing Worker v177 at 100% traffic without a migration or Sites change.
- Provider-probe PR #78 passed 11/11 focused tests plus the full platform suites (33/33 rendered, 1,130/1,130 core, 204/204 Worker/runtime), lint, type-check, production artifact budgets, Cloudflare environment matrix, dependency audit, and licence policy. PR CI `33311452240` and post-merge CI `33311790415` both completed successfully.
- Worker v178 deployed at 100% traffic through production workflow `33311790082`; Admin and public Sites jobs were skipped. Direct Cloudflare inspection confirmed version `85bdf326-4f4a-44d1-9540-06b5ad88fc46` in deployment `9b32983c-dc42-49ad-9888-3e9e777a48f2`.
- Production log and status evidence prove the remaining AI degradation is OpenAI HTTP `429` / `credit_balance_exhausted`; Anthropic is operational. Chrome reproduced the truthful 7/8 status with no console errors.
- Staging-host PR #80 passed 7/7 focused routing tests, 31/31 expanded auth/MFA/Worker tests, the full platform suites (33/33 rendered, 1,130/1,130 core, 204/204 Worker/runtime), lint, type-check, artifact budgets, Cloudflare environment matrix, dependency audit, and licence policy. PR CI `33313838079` and post-merge CI `33314211797` both completed successfully.
- Worker v179 deployed at 100% traffic through production workflow `33314211943`; Admin and public Sites jobs were skipped. Direct Cloudflare inspection confirmed version `7ffc07cd-4ebb-46ce-b659-ed4cf0ae9c79` in deployment `26f52ed8-bde8-4dc5-84c2-2ab74b912e40`.
- Anonymous staging verification confirmed `staging.app.juro.uz/ru/lawyer/auth` redirects to Cloudflare Access with `no-store`; both rejected aliases remain absent from DNS. The staging Worker was not redeployed, so authenticated post-Access runtime QA remains open.
- Chrome on v179 reproduced the truthful degraded 7/8 production status with zero active incidents and no console errors.
- Superseded broad Draft PR #64 was closed without deleting its branch. Its 486-file candidate remains recoverable for separately audited extraction, but it is no longer presented as a mergeable release unit.

## Blocking gaps before a production-ready claim

| Priority | Gap | Evidence | Required action |
| --- | --- | --- | --- |
| P1 | Provider Sites hostname is indexable on live v94 | Live meta/header inspection | Publish saved v95 after explicit production approval, then recrawl both hosts |
| P1 | OpenAI synthetic probe is degraded | v179 status: `PROVIDER_UNAVAILABLE`; v178 safe structured log isolated HTTP `429`, `credit_balance_exhausted`; production status is 7/8 operational | Refill or correct billing for the OpenAI project used by the production API key, then observe a fresh successful isolated OpenAI probe before claiming 8/8 health |
| P1 | Staging health is degraded/stale after a newer deployment | Active cron delivery fails in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`; D1 reports 9,999,998,976 bytes | Resolve staging D1 capacity in the separately scoped legislation/corpus work, then verify fresh scheduler writes and 8/8 component health |
| P1 | Cloudflare reports partial origin IP exposure; FTP TLS is invalid | DNS dashboard and HTTPS probe | Establish ownership/need, back up configuration, then proxy, repair, or retire through a separate reversible DNS change |
| P1 | Authenticated role matrix incomplete | Only anonymous boundary checks are current | Chrome QA for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin with no fabricated session |
| P2 | Staging v179 behavior is not deployed or authenticated | Main is normalized and the canonical host is Access-protected; staging Worker remains on its prior version | Deploy staging only in a safe non-legislation increment, then complete post-Access Client/Lawyer route QA with real authorized sessions |

## Rollback protocol

### Sites

1. Keep live v94 until v95 publication is explicitly authorized.
2. After publishing v95, verify `juro.uz`, RU/UZ/EN entry routes, `robots.txt`, sitemap, and the provider hostname header.
3. If the custom domain or public routes regress, redeploy saved v94 immediately.

### Platform Worker

1. Record the active deployment/version before a release.
2. Run CI and artifact checks against the exact deploy commit.
3. Apply D1 migration only when a separately reviewed change requires it, and verify schema plus a restorable backup before any ledger reconciliation.
4. Deploy with the explicit production environment, then verify public/private boundaries, logs, status evidence freshness, error rate, and provider probes.
5. For v179, roll back to Worker v178 version `85bdf326-4f4a-44d1-9540-06b5ad88fc46` / deployment `9b32983c-dc42-49ad-9888-3e9e777a48f2` if a verified regression appears.

### DNS

No DNS record should be changed until the record owner, service purpose, current clients, TLS behavior, and recovery record set are documented. Export/record the exact old value before any mutation.

## Scope exclusion

Per owner instruction, this readiness increment does not inspect or change the legislation database, legal corpus, Lex.uz ingestion, Advice.uz ingestion, vector stores, source documents, or legal evaluation data. Those items remain unproven rather than implicitly complete.
