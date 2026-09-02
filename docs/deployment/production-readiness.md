# JURO Production Readiness

Assessment: **NOT READY for the full execution brief**

Evidence cutoff: **2026-09-02 UZT**

Production is reachable and v118 is deployed from merge `617ec64ffcb21633f7b8bb734d28639de8b099e1`. Website Worker v13 `3ee7a1ae-888a-4c98-8f49-de73783e6b7e`, platform Worker v206 `1ec688d4-e085-4aa9-a34d-df02b0c1ae1c`, and public Sites v97 were active at the latest verification checkpoint. The public status snapshot generated at `2026-09-02T01:32:20.313Z` was operational with 8/8 components and 0 active incidents; this is point-in-time evidence, not a claim of sustained provider health. The full execution brief remains incomplete because authenticated Business, Lawyer, Pending Lawyer, Staff/Admin, state-changing, and other Definition-of-Done gates are still open.

## Current v118 release state

| Surface | Current state | Evidence | Rollback point |
| --- | --- | --- | --- |
| GitHub main | merge `617ec64ffcb21633f7b8bb734d28639de8b099e1` from PR #124 | exact-head CI `33578000481`, complete 0-finding security diff scan `cad38f72-f2c0-40ed-a3ed-7cd0b525d76e`, post-merge CI `33578605701`, platform deploy, and focused Chrome QA passed | Revert or redeploy the immediately preceding validated main revision if a regression is proven |
| Public Sites | v97, source `77691d0c2f4d7eaeff759ff3f08eded893d2f835`, deployment `appgdep_6a975c1651d0819194779c579abd961b` | RU/UZ/EN 200; sitemap 78/78; discoverable apex links 120/120; indexing split preserved | Saved v96, source `489c56d029f164c030127f7465d528f8f1bdf396`; v95 remains available |
| Website Worker | v13 `3ee7a1ae-888a-4c98-8f49-de73783e6b7e`, 100% traffic | visible RU/UZ/EN targets are 44 × 44 CSS px wherever rendered; routes and indexing passed | v11 `fad80c80-ee92-44bb-93a3-e250ee314891` |
| Platform Worker | v206 `1ec688d4-e085-4aa9-a34d-df02b0c1ae1c`, deployment `63cb71bb-5482-4bcf-9bd0-e652c81c9ef0`, 100% traffic | At 390 × 844 the dashboard composer and quick cards have explicit focus rings; all four cards scroll fully into view; one main/H1, zero overflow, and a clean console | v204 `12ae95e6-5eac-4f14-8257-a30dff56128d`, the last independently receipt-verified rollback |
| Production health | operational, 8/8 components, no active incidents at the retained snapshot | `/api/status` generated `2026-09-02T01:32:20.313Z` | Health evidence is observational; it has no deployment rollback |

The older v117/v116/v115/v101/v189/v95 tables and health narrative below are retained as historical evidence and do not supersede the current v118 checkpoint.

## Retained historical release state

| Surface | Current state | Evidence | Rollback point |
| --- | --- | --- | --- |
| v114 candidate | branch `codex/performance-v114-mainline`, based directly on current `origin/main`; not deployed | Local tests/builds/artifact budgets and Chrome checks pass; exact-head CI/security and deployed Chrome QA pending | No runtime rollback needed because it is not deployed |
| GitHub main | merge `840f1144f3ba8562a7866cd4bda99525be392758` from PR #103 | Exact reviewed head `e14532c12a9200bc335f8a506fa452a788069efd`; CI, release workflow, security scan, and Chrome QA passed | Revert or redeploy the immediately preceding validated main revision if a regression is proven |
| Public website Worker | version ID `d6ff54c8-0bbc-4921-a54e-581027689a41` at the retained checkpoint | RU/UZ/EN and `/ru#start` 21/21, responsive overflow checks, Lighthouse, trace, and console QA passed | Previous validated website Worker version captured by the release workflow |
| Platform Worker | version ID `9c434c4e-52af-41cd-b680-eb0730b87e37` at the retained checkpoint | Release workflow passed; public status operational 8/8 at the retained checkpoint | Previous validated platform Worker version captured by the release workflow |
| Admin Worker | version ID `53f0aef3-951c-40eb-8dc6-e4a5e3513dc9` at the retained checkpoint | No v114 admin change | Previous validated admin Worker version captured by its release workflow |
| GitHub main | Merge commit `d133a470a49166875d9112b938ae3f7d765ee170`; live Worker v189 source from PR #95 | PR CI `33352197361`, post-merge CI `33404886188`, and production workflow `33404885913` completed successfully | Previous Git commit selected through the normal release process |
| Public Sites | Live version **95**, source `855ba2161b716daabb96ac469456c101e5d3bb2c`; deployment `appgdep_6a94c1cfc364819190b65a5cb0a7e5ad` | Deployment succeeded; `juro.uz` remains indexable, the provider hostname returns `X-Robots-Tag: noindex, nofollow, noarchive`, 78/78 sitemap URLs and 149/149 discoverable JURO-zone links return `200` | Redeploy saved v94, source `6f5c70f947df14597cca2e289c3b38bbd36b589d`, if the public custom domain regresses |
| Platform Worker | Worker version **189**, version ID `102dcb2d-f79f-4172-9a3a-19d55d51f6ed` | Production workflow `33404885913` deployed 100% traffic to the merged revision; no database migration, Admin Worker change, Sites change, DNS change, binding change, or secret change was part of that workflow | Prior version **188**, ID `57387083-9f7f-4cd8-a9f2-84414f2604d6` |
| Admin Worker | Version `67065fd8-fcc8-4c15-93c8-bc7b46ce4fcb`; deployment `2be71fe7-ee92-4e43-9bbd-d500f7deac5e` | 100% traffic since `2026-08-23T11:01:31Z`; production admin is reached through the platform host boundary | Use the immediately preceding Admin version only after reproducing the fault and validating the service binding |
| Platform staging Worker | Version `ca612aa6-3b01-4b6e-82e1-f337999a5f20`; deployment `6ef0e9fc-5f3a-4d0b-9ff0-2b95500f3e22` | Latest deployment `2026-08-28T23:54:16Z` | Previous staging version `6b700785-a72e-43b1-a2aa-e7f6839c4f0d` |

Platform Worker v189 was built from merge commit `d133a470a49166875d9112b938ae3f7d765ee170` by production workflow `33404885913`. It preserves the dedicated lawyer-host routing, bounded provider/document-analysis behavior, and direct D1 measurement, while selecting same-origin status metadata through a Worker-owned validated header. No database migration, DNS change, binding change, secret change, CSP relaxation, Admin Worker deployment, staging Worker deployment, or legislation-corpus operation was performed. Sites v95 was published separately from its already validated saved version.

## Live health

Production `/api/status` generated at `2026-08-31T15:07:12.161Z` after the v189 cutover:

- overall: `degraded`;
- components: **6/8 operational**;
- active incidents: **0**;
- D1 synthetic probe: `operational`, checked at `2026-08-31T15:05:19.870Z`, latency `192 ms`, evidence kind `synthetic_probe`;
- OpenAI synthetic probe: `degraded`, checked at `2026-08-31T14:56:01.550Z`, latency `5,080 ms`, public safe error `PROVIDER_UNAVAILABLE`;
- Anthropic synthetic probe: `degraded`, checked at `2026-08-31T14:56:02.962Z`, latency `1,049 ms`, public safe error `PROVIDER_UNAVAILABLE`;
- document-analysis synthetic probe: `degraded`, checked at `2026-08-31T14:56:05.216Z`, latency `1,884 ms`, public safe error `PROVIDER_UNAVAILABLE`;
- the public API redacts both provider-specific balance codes to `PROVIDER_UNAVAILABLE` and exposes no provider response body, credential, request content, or user traffic;
- AI and document analysis are degraded; the other six components remain operational;
- Chrome showed the same degraded overall state on all checked status routes and logged no console errors or warnings. Raw response HTML confirmed same-origin status/app icon URLs, all four icon assets returned `200 image/png`, and every checked response preserved `img-src 'self' data: blob:`.

The degraded label is the correct current release evidence. v189 retains v188's direct D1 latency measurement and the existing cooldown/fallback behavior. The owner reported an Anthropic account top-up, but the first checked post-release probe still reports `PROVIDER_UNAVAILABLE`; fresh successful evidence is required before either AI component can be marked operational.

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
| P2 | Sustained AI-provider health is not yet proven | The current snapshot reports successful OpenAI and Anthropic probes, but one point-in-time result is not a service-level history | Continue normal monitoring and keep public health claims bounded to observed evidence |
| Excluded | Staging health/capacity | The retained historical staging evidence is stale/degraded and the owner explicitly excluded legislation database/corpus/capacity remediation | No action in this goal; do not use this row to block the permitted non-corpus work |
| P1 | Cloudflare reports partial origin IP exposure; FTP TLS is invalid | DNS dashboard and HTTPS probe | Establish ownership/need, back up configuration, then proxy, repair, or retire through a separate reversible DNS change |
| P1 | Authenticated role matrix incomplete | Authenticated individual read-only coverage exists; Business, Lawyer, Pending Lawyer, Staff/Admin, and state-changing flows remain open | Chrome QA with real authorized sessions and no fabricated identity |
| P2 | Production v118 behavior is not authenticated on staging | Main is normalized and the canonical staging host is Access-protected; staging release remains separate | Complete post-Access Client/Lawyer route QA only in a safe, non-corpus staging increment |

## Rollback protocol

### Sites

1. Keep saved v96 as the immediate rollback while v97 is live; retain v95 as a secondary older recovery point.
2. Preserve the verified split: `juro.uz` remains indexable and the provider hostname carries the noindex response header.
3. If the custom domain, public routes, accessibility fixes, or indexing split regresses, redeploy saved v96 immediately and recrawl both hosts.

### Platform Worker

1. Record the active deployment/version before a release.
2. Run CI and artifact checks against the exact deploy commit.
3. Apply D1 migration only when a separately reviewed change requires it, and verify schema plus a restorable backup before any ledger reconciliation.
4. Deploy with the explicit production environment, then verify public/private boundaries, logs, status evidence freshness, error rate, and provider probes.
5. For v116, roll the website Worker back to v11 `fad80c80-ee92-44bb-93a3-e250ee314891` or the platform Worker back to v200 `ca427ea9-97cb-45fe-84dc-b468e8bd8995` if the corresponding verified regression appears.

### DNS

No DNS record should be changed until the record owner, service purpose, current clients, TLS behavior, and recovery record set are documented. Export/record the exact old value before any mutation.

## Scope exclusion

Per owner instruction, this readiness increment does not inspect or change the legislation database, legal corpus, Lex.uz ingestion, Advice.uz ingestion, vector stores, source documents, or legal evaluation data. Those items remain unproven rather than implicitly complete.
