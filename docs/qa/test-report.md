# Test report — current evidence through 2026-08-29

## Privacy-safe product KPI candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — activation baseline `0725887f`; engaged-return and lawyer-funnel extension `8602e4101e2a61089ac7e5a66a13c6916abd1044`; exact answer/source-open funnel `c0f9c372`; user-reported error aggregate `3101525c12dd53171494515e0c9668859b92408c` |
| Cohort contract | PASS — a mature 30-day signup cohort gets a complete seven-day value window; grounded answer, completed analysis and case-plus-plan paths are deduplicated at the actor's earliest result |
| Engaged-return contract | PASS — the 44-to-14-day signup cohort has complete activation and return windows; only an explicit action on a later UTC day within seven days of first value counts, while session refresh and passive reads do not |
| Marketplace contract | PASS candidate — one internal daily-deduplicated visit row fixes the first-view cohort; only a request by the same actor within seven days converts, and unrelated Analytics Engine occurrences are never divided into the rate |
| Answer-funnel contract | PASS candidate — each actor's first-ever user message is joined through the exact completed `request_message_id` to one validated source-backed response within 7 days, then to an authorized open of that exact response within the next 7 days |
| Feedback-quality contract | PASS candidate — one retained feedback type per answer contributes once; five fixed failure classes form the error numerator, while comments, answer content, source URLs and actor IDs are not read or returned |
| Exclusions | PASS — `legal_eval_user_*`, the three fixed investor-demo identities and active platform staff do not enter product cohorts |
| Privacy boundary | PASS — D1 uses identifiers only inside aggregate CTEs; the response contains no identifier, email, contact field, prompt, answer, case text or document content |
| Retention/deletion boundary | PASS — migrations 0164/0165 store only internal keys and timestamps; source-open owner triggers reject cross-actor evidence, and account purge deletes the actor's rows while preserving another user's evidence |
| Disclosure/readiness | PASS — rates and TTFV are suppressed below five observations; 30 denominator observations are required before the dashboard says the sample is comparable |
| Admin boundary | PASS source — page and no-store API require `staff.operations.manage` and MFA within 15 minutes; both locales are present and the route is noindex |
| Focused regression | PASS — product KPI aggregation/privacy/deduplication/Admin boundary 5/5; combined KPI plus real account-purge run 15/15 |
| Full local regression | PASS — core 1138/1138; Cloudflare/infrastructure 203/203; rendered Worker 35/35; type-check and lint |
| Production artifact | PASS — bounded build and emitted-byte budgets: CSS 596.7/600.0 KiB; initial JS 295.4/320.0 KiB; largest lazy increment 208.1/240.0 KiB; fonts 453.6/512.0 KiB; images 564.4/640.0 KiB; Worker entry 3712.8/6144.0 KiB |
| Local Chrome | PASS bounded — RU/UZ protected boundaries at 1440×900 and 390×844 retained one localized H1, private noindex metadata, exact re-auth return path, zero horizontal overflow and no warning/error log; no staff identity was fabricated |
| Production data replay | PASS read-only / INSUFFICIENT SAMPLE — 10 eligible, 2 activated, one grounded-answer user, zero analysis users and two case-plus-plan users; 230 rows read, zero written |
| Engaged-return replay | PASS read-only / PRIVACY-SUPPRESSED — 9 eligible, 2 activated and 0 returning; 417 rows read, zero written; the 0/2 rate is not disclosed as a comparable metric |
| Browse conversion replay | AWAITING OBSERVATION — migration 0164 and the matching Worker are not deployed; the 13 older `lawyer_viewed` occurrences are deliberately not treated as unique visitors |
| Answer-funnel replay | PASS read-only / INSUFFICIENT SAMPLE — main query read 2,142 rows and wrote zero: 5 first-question actors, 0 qualifying validated source-backed answers, 0.0% completion and 100.0% drop-off. Diagnostic query read 313 rows and wrote zero: all 5 had exact completed structured responses, but none passed the validated-source contract |
| Source-open replay | AWAITING OBSERVATION — production has no migration 0165 table; no actor rate is inferred from the old non-joinable `source_opened` occurrence |
| Feedback-quality replay | PASS read-only / NO DATA — at `2026-08-29T12:49:08.640Z` the aggregate read 4 rows and wrote zero; all five category counts were zero, so the error rate is not reported as 0.0% |
| Workflow replay | PRIVACY-SUPPRESSED — three plans with zero completed; two lawyer requests with one accepted-or-later and zero completed |
| Anthropic recovery | PASS current read-only — at `2026-08-29T11:10:56.708Z` the content-free production probe completed in 4,810 ms with no safe error; document analysis also remained operational |
| Release boundary | UNPUBLISHED — migrations 0164/0165 are outside the production pattern; no D1 row write/migration, Worker/Sites publish, DNS, notification or customer-data mutation |

The 2/10 result is a 20.0% small baseline, not a target or a readiness claim.
TTFV remains hidden because only two actors qualified. Path counts overlap and
must not be summed. Engaged return is now computable but privacy-suppressed at
0/2. Browse-to-request conversion is instrumented without inventing identity
linkage, but remains unmeasured until migration 0164, the matching Worker and a
complete observation window are explicitly released.

The exact question-to-answer funnel is now measurable without joining unrelated
event totals. Its current 0/5 result is disclosed because the denominator meets
the five-actor privacy floor, but remains below the 30-actor comparison gate.
Source-open conversion remains unmeasured until migration 0165 and the matching
Worker are explicitly released and the full observation window matures.
The user-reported error calculation is source- and test-verified, but the
current 30-day production denominator is empty. It therefore reports `NO DATA`
and does not imply error-free use.

## Compact conversation-context candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — `c7c6d35eb88baaec157f8709ee214b936c07b64a` |
| Branch/history contract | PASS — latest 3 turns remain recent, up to 5 older turns are redacted and summarized, and the remainder are explicitly counted as omitted |
| Legal-source boundary | PASS — compact history is labelled untrusted and current `verifiedSources` remain mandatory |
| Failure/privacy boundary | PASS — malformed stored results fall back to bounded redacted text; telemetry contains counts only, not prompts, summaries or answers |
| Focused regression | PASS — conversation context, query planner, branch history and prompt registry 20/20 |
| Full local regression | PASS — core 1129/1129; Cloudflare/infrastructure 203/203; rendered Worker 35/35; type-check and lint |
| Production artifact | PASS local — CSS 596.6/600.0 KiB; initial JS 295.4/320.0; largest lazy increment 208.1/240.0; fonts 453.6/512.0; images 564.4/640.0; Worker entry 3656.7/6144.0 |
| Synthetic volume proxy | PASS measurement — 15,931 legacy characters to 6,155 compact characters, a 61.36% reduction on one artificial 12-turn long-history fixture |
| Outcome target | UNVERIFIED — character count is not provider tokens, billing, latency, answer quality or a production 30% cost-reduction result |
| Release boundary | UNPUBLISHED — no Worker, Sites, migration, DNS, notification or customer-data mutation |

## Anthropic prompt-cache candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — `d1da89a1` |
| Privacy boundary | PASS — only the static system block has `cache_control`; the dynamic user message carrying question/history/sources/document input has no cache marker |
| Usage normalization | PASS — Anthropic uncached input + cache reads + cache writes becomes provider-neutral total input; reads and writes remain separate counters |
| Cost arithmetic | PASS — a synthetic 1,000 uncached + 1,000 cache-read + 1,000 five-minute cache-write request at the configured rates produces exact `$0.007050` estimated cost |
| Migration | PASS local — 0163 adds default-zero non-negative cache-write counters without content fields |
| Admin evidence | PASS source — RU/UZ console exposes write-token volume and describes the content exclusion |
| Focused regression | PASS — provider-cost 8/8 and Anthropic/document-provider 15/15 |
| Full Platform regression | PASS — core 1128/1128, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35 |
| Static/artifact gates | PASS — development build, type-check, lint and production artifact validation; Worker entry 3652.5/6144.0 KiB |
| Production/release boundary | NOT DEPLOYED — migration 0163 is excluded from the production migration pattern; no remote schema or Worker/Sites/DNS mutation occurred |
| Outcome target | UNVERIFIED — no real production cache-hit/latency/cost comparison exists yet |

## Scoped AI budget candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — `f312a930e9e93a690a71ad963ea0ff59ab1a4ab6` |
| Budget contract | PASS — immutable, effective-dated daily and monthly micro-USD limits exist independently for a technical user or an allowlisted AI feature |
| Operator actions | PASS — `alert_only`, `disable_deep`, and `block_calls`; no monetary threshold is seeded or inferred |
| Enforcement boundary | PASS — authenticated/guest chat, document analysis, and private-document indexing/search check the applicable budget immediately before real provider work; scoped budget errors do not trigger a paid provider fallback |
| Unknown-price boundary | PASS — successful unpriced usage creates durable warning evidence but is not assigned a fabricated cost and is not treated as proof that a monetary limit was reached |
| Alerts | PASS — daily/monthly threshold events, identifiers-only email jobs and opaque Queue outbox rows are idempotent; recipient identity is resolved from runtime configuration rather than persisted in cost tables |
| Admin boundary | PASS source — policy writes require `staff.operations.manage`, active TOTP, MFA within 15 minutes, and existing same-origin/CSRF protection |
| Migration | PASS local — `0162_scoped_ai_cost_budgets.sql` applies in the ordered migration matrix, retains immutable policy/event evidence, and passes foreign-key checks |
| Focused regression | PASS — 3/3 scoped-budget tests, including Deep-only/user hard limits, exact-once alert delivery, unpriced usage, immutability and route boundaries |
| Full Platform regression | PASS — core 1127/1127 including the scoped suite, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35 |
| Static/artifact gates | PASS — type-check, lint, production artifact validation and emitted-asset budgets; Worker entry 3652.5/6144.0 KiB |
| Production/release boundary | NOT DEPLOYED — migration 0162 remains excluded from the production migration pattern; no threshold, D1 migration, Worker/Sites publish, DNS, email, notification or customer-data mutation occurred |
| Outcome target | UNVERIFIED — controls are ready for operator thresholds, but the required 30% cost reduction with quality non-regression still lacks a comparable production sample |

The evaluator uses UTC calendar days/months and current D1 aggregates. It is a
request-boundary control, not a provider billing hard cap: already in-flight
concurrent requests can overshoot a threshold, and provider/D1 reconciliation
remains required. Internal legal-corpus ingestion was deliberately not changed
under the current goal boundary.

## Admin AI cost-observability candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — `a08698df` |
| User/plan breakdown | PASS source — 30-day provider totals are grouped by technical user/workspace and by the workspace's current subscription plan; guest/system and unassigned scopes remain explicit |
| Attribution honesty | PASS — RU/UZ Admin copy labels tariff attribution as a current read-time workspace snapshot, not the historical plan at event time |
| Cache contract | PASS — request hit rate uses successful calls with positive input tokens as the denominator; cached-token share is reported separately |
| Escalation/fallback contract | PASS — Deep and provider-fallback counts/rates use completed authenticated legal-chat runs only; guest AI and document analysis are excluded from that denominator |
| Provider operations | PASS source — provider failure count/rate and average recorded provider-call latency share the same bounded telemetry window |
| Data boundary | PASS — no new migration or content field; cost rows retain technical identifiers, provider/model/operation/tokens/status/cost only and expose no prompt, answer, document text, filename, email or phone |
| Focused regression | PASS — 6/6 provider-cost tests |
| Full Platform release gate | PASS — core 1124/1124, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check, lint and production artifact validation |
| Artifact budgets | PASS — CSS 596.6/600.0 KiB; initial JS 295.4/320.0 KiB; largest lazy increment 208.1/240.0 KiB; fonts 453.6/512.0 KiB; images 564.4/640.0 KiB; Worker entry 3647.0/6144.0 KiB |
| Protected browser replay | NOT RUN — no authorized real Admin/MFA session was available; no signed-in UI claim is made |
| Production sample | UNCHANGED — the last verified production cost checkpoint remains 4/30 priced successes and does not prove the 30% reduction target |
| Release boundary | NOT DEPLOYED — no Worker/Sites publish, migration, D1, DNS, notification or customer-data mutation |

## Admin AI prompt-registry candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — registry `9eee8d54`; source-backed history `2a57cc88`; compact-context v3 implementation `c7c6d35e` |
| Runtime/display drift control | PASS — authenticated chat, guest chat and document-analysis run hashes use the same code-owned registry rendered by protected Admin |
| Data boundary | PASS — Admin receives three current version IDs and the review/evaluation gate; system-prompt text and secrets are not exposed |
| Operations access | PASS source — localized links point to the existing cost, AI-quality, emergency feature-control and provider-health pages |
| Experiment truthfulness | PASS — RU/UZ copy states that no A/B prompt experiment is active and requires matched quality, cost and source evaluation before a variant |
| Prompt history | PASS source — five release records link exact introducing commits/dates; legal-chat v1 → v2 → v3 is explicit and all three current records match runtime identities |
| Focused regression | PASS — conversation context, query planner, branch history and prompt registry 20/20 |
| Full Platform release gate | PASS — core 1129/1129, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check, lint and production artifact validation |
| Artifact budgets | PASS — CSS 596.6/600.0 KiB; initial JS 295.4/320.0 KiB; largest lazy increment 208.1/240.0 KiB; fonts 453.6/512.0 KiB; images 564.4/640.0 KiB; Worker entry 3656.7/6144.0 KiB |
| Protected browser replay | NOT RUN — no authorized real Admin/MFA session was available; no signed-in browser claim is made |
| History boundary | PASS code-owned — source history is reviewable in git and Admin; no mutable D1 prompt-history ledger is claimed |
| Release boundary | NOT DEPLOYED — no Worker/Sites publish, migration, D1, DNS, notification or customer-data mutation |

## Admin Fast/Balanced/Deep routing transparency candidate

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — `6bb8d607dfaead59fa345468ccf0ec56afe16016` |
| Runtime/display drift control | PASS — provider execution, Anthropic fallback, run reservation and the protected Admin summary share `aiReasoningRuntimeRoute` |
| Admin contract | PASS source — localized Fast/Balanced/Deep cards expose the active primary/fallback model, Balanced default, reasoning effort, attempt/first-content limits, output limits and the shared 30-second deadline |
| History contract | PASS source — saved-version rows expose chat, Deep and Anthropic fallback models rather than only the generic chat/document pair |
| Focused regression | PASS — 6/6 routing/default/localization/source-contract tests |
| Full Platform release gate | PASS — core 1114/1114, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check, lint and production artifact validation |
| Artifact budgets | PASS — CSS 596.6/600.0 KiB; initial JS 295.4/320.0 KiB; largest lazy increment 208.1/240.0 KiB; fonts 453.6/512.0 KiB; images 564.4/640.0 KiB; Worker entry 3647.1/6144.0 KiB |
| Protected browser replay | NOT RUN — no authorized real Admin/MFA session was available; source, behavior tests and responsive CSS are evidence, but not a claim of signed-in browser verification |
| Fresh Anthropic recovery | PASS read-only — app/status APIs agreed at `2026-08-29T03:46:26.954Z` on 8/8 operational and zero incidents; Anthropic was operational at `03:45:28.572Z` (4,882 ms, no safe error) and document analysis at `03:30:39.338Z` (9,579 ms, no safe error) |
| Release boundary | NOT DEPLOYED — no Worker/Sites publish, migration, D1, DNS, notification or customer-data mutation |

The CSS budget passes with only 3.4 KiB of remaining headroom and should be
treated as a tight release constraint. The live provider recovery verifies the
funded Anthropic account, not the unpublished Admin candidate.

## Legal AI Fast/Balanced/Deep candidate and fresh provider recovery

| Gate | Result |
| --- | --- |
| Exact implementation source | PASS candidate — `1ed175014d4255217444c538d3e8d7ae87b8dd9f` |
| Mode contract | PASS — `fast`, `balanced`, `deep`; omitted and unknown input normalize to `balanced` |
| Cost/latency routing | PASS candidate — Fast and Balanced retain the configured chat model with low/medium reasoning; Deep alone selects the deep model/high reasoning; all profiles keep bounded provider/first-content/fallback/output controls |
| Provider boundary | PASS candidate — existing bounded Anthropic fallback eligibility is preserved; guest and synthetic probes remain explicitly Fast |
| D1 migration | PASS locally — migration 0161 preserves prior telemetry rows, accepts Balanced rows and restores append-only update/delete guards and indexes |
| Focused regression | PASS — 8/8 mode/parser/schema/routing/localization/migration tests |
| Full Platform release gate | PASS — core 1114/1114, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check, lint and production artifact validation |
| Artifact budgets | PASS — CSS 595.1/600.0 KiB; initial JS 295.3/320.0 KiB; largest lazy increment 208.1/240.0 KiB; fonts 453.6/512.0 KiB; images 564.4/640.0 KiB; Worker entry 3647.0/6144.0 KiB |
| Exact-source CI | PASS — run `33230331239` on `1ed17501`; Website 3m32s and Platform 8m45s |
| Local Chrome | PASS bounded — exact RU/UZ mode labels, Balanced default, switching, 1024/700/390/320 px layout, 44 px targets, no overflow and no console warning/error; no Lawyer/Admin identity used |
| Live provider recovery | PASS read-only — both public status APIs agreed at `2026-08-29T03:02:32.506Z` on 8/8 operational and zero incidents; Anthropic was operational at `03:00:33.053Z` (5,465 ms) and document analysis at `03:00:41.121Z` (8,018 ms), both with no safe error |
| Release boundary | NOT DEPLOYED — no Worker/Sites publish, migration, D1, DNS, notification or customer-data mutation |

The provider result verifies recovery after the reported account top-up. It
does not prove the unpublished reasoning-mode candidate in production. A
production release would still require explicit approval, migration safety
gates and role-correct signed-in replay.

## Security remediation candidate and Anthropic recovery

| Gate | Result |
| --- | --- |
| Security scan | ACTIONED — scan `aacf0487-aae5-4c8f-a527-8f3efc70cb76` on immutable `3a30042c096f5aca91c3852a6998b7ddcd452025` reported 0 Critical, 0 High and 6 validated Medium findings |
| Remediation source | PASS candidate — `695693f3ecbc04a800c8cc81e8486d22c03e5230` closes editor-role, hidden-attachment, stale-lawyer-grant, Builder quarantine, DOCX expansion and guest-AI cost-control boundaries |
| Selected non-legislation regression | PASS — 774/774 |
| Rendered Worker HTML | PASS — 35/35 after `1ee3047b643136c08fcadcacce61776d19cded18` reuses one built Worker instance for the suite |
| Local release gates | PASS — type-check, lint, production build, deployable-artifact validation and all emitted-asset budgets |
| Exact-source CI | PASS — run `33227714329` on `1ee3047b`; Website 3m50s and Platform 8m14s, including tests, Cloudflare matrix, dependency audit and licence policy |
| Live provider recovery | PASS read-only — both production status APIs generated the same `2026-08-29T02:11:04.267Z` snapshot with 8/8 operational and no incident; Anthropic was operational at `02:00:33.048Z`, 5,308 ms, no safe error |
| Release boundary | NOT DEPLOYED — the six security remediations remain a Draft PR candidate; production Worker and Sites state were not changed |

The durable finding-by-finding record is
[`security-scan-3a30042c.md`](../audit/security-scan-3a30042c.md). The live
Anthropic result confirms the account recovery; it does not deploy or validate
the security candidate in production.

## Full public responsive release gate

| Gate | Result |
| --- | --- |
| Required widths | PASS candidate — 320, 360, 375, 390, 393, 430, 768, 1024, 1280, 1440 and 1920 px are automated across the localized public route set |
| Full accessibility profiles | PASS — 56/56 axe/Chrome route/profile combinations at 390 and 1280 px, including RU/UZ/EN light coverage and representative dark coverage |
| Additional responsive matrix | PASS — 189/189 route-width combinations: 21 RU/UZ/EN routes across the nine required widths not duplicated by the full axe profiles |
| Compact-menu interaction | PASS — seven width scenarios retained one trigger/dialog/close control, exact `aria-controls`, 44 px targets, focus entry, Escape close/return, no broken ARIA and no clipped interactive target |
| Findings closed | PASS candidate — the 320 px RU handoff CTA no longer clips; locale selection strips Vinext's terminal `.rsc` suffix so UZ/EN hydration retains the correct `html[lang]` |
| Local release gate | PASS — build and deployable artifact, 49/49 functional/route tests, 26/26 focused source contracts, lint and type-check |
| Exact-source CI | PASS — run `33220671747` on `1e25c1aeaedad1daff964d1cc08714bece814bee`; Website 3m58s and Platform 8m17s |
| Production boundary | NOT DEPLOYED — Sites v86 remains live; no Sites publish, Worker release, DNS, D1 or notification mutation was made |

These results describe the exact unpublished branch candidate. They do not
convert the known Sites v86 findings into production passes and are not a WCAG
conformance claim.

## Read-only Cloudflare DNS inventory

| Gate | Result |
| --- | --- |
| Zone | PASS — `juro.uz` is active, full and unpaused |
| Complete record table | PASS via authenticated dashboard — 22/22 rows: 3 A, 2 CNAME, 4 MX, 6 TXT and 7 Worker; 10 proxied, 12 DNS-only; automatic TTL |
| Worker topology | PASS — seven dashboard Worker rows match the Worker Domains API; zone routes remain only `juro.uz/*` and `www.juro.uz/*` on `juro-legaltech` |
| OAuth boundary | EXPECTED LIMIT — the same Wrangler session reads zone/domains/routes but `GET /zones/{zone}/dns_records` returns 403/code 10000 because DNS Read is absent |
| Cloudflare recommendation | OPEN REVIEW — the dashboard reports one partially exposed origin-IP recommendation; FTP/mail ownership must be confirmed before any proxy change |
| Mutation boundary | PASS — no DNS record, proxy, TTL, mail, Worker-domain or route change was made |

## Read-only Cloudflare runtime resource inventory

| Gate | Result |
| --- | --- |
| Production queues | PASS — all 17 expected `production-*` queues from the production Wrangler configuration exist; zero expected queues are missing and zero extra production queues were found |
| Cron triggers | PASS — the live `juro` Worker has exactly `*/5 * * * *` and `0 19 * * *`; `juro-admin` and `juro-legaltech` have no schedules, matching their roles |
| Private R2 exposure | PASS — `juro-private-documents`, `juro-production-backups` and `juro-production-quarantine` exist, have no custom domain and have public `r2.dev` access disabled |
| Public media R2 | INVENTORIED — `juro-public-media` intentionally has public `r2.dev` access, no custom domain and is not a private application-data binding |
| Worker 170 bindings | PASS — the active version exposes the expected D1, three R2, 13 queue, two service, one Durable Object, Analytics Engine, Workers AI, Images and assets bindings; all nine secrets are secret bindings and no secret value was read |
| Turnstile | PASS — the managed production widget is restricted to `app.juro.uz` and `lawyer.juro.uz`, with `no_clearance`; the separate staging widget is restricted to `staging.app.juro.uz` |
| Rules-plane API boundary | EXPECTED LIMIT — the current OAuth token reads Worker, Queue, R2 and Turnstile control-plane state but receives authentication errors for zone/account rulesets and account lists; previously recorded dashboard evidence remains the current WAF/TLS proof |
| Mutation boundary | PASS — no queue, bucket, domain, schedule, binding, secret, Turnstile or ruleset was changed |

## Public Sites v86 replay and superseding source candidate

| Gate | Result |
| --- | --- |
| Live v86 localized replay | PASS for document/SEO structure — RU/UZ/EN at 390×844 and 1440×900 retained exact canonical, matching `lang`, four hreflangs, valid JSON-LD, `index, follow`, one H1/main, explicit image alternatives and no horizontal overflow |
| Live v86 accessibility replay | FAIL observed — visible text reached 8.96–11.84 px; header theme buttons were 32×32 px; the closed menu trigger had a dangling `aria-controls`; the open menu exposed two accessible close controls; skip activation did not focus main |
| Source correction | PASS candidate — commit `7e07b56280116bc2494223c7c9e650dc30535fff` raises theme and legal controls to 44 px, makes menu `aria-controls` conditional, hides/excludes the scrim, keeps main programmatically focusable and uses the compact header at 981–1100 px |
| Full local website gate | PASS — build and deployable artifact, 48/48 functional/route tests, 56/56 axe/Chrome combinations, lint and type-check |
| Exact-source CI | PASS — run `33217112257` on `7e07b56280116bc2494223c7c9e650dc30535fff`; Website 1m59s and Platform 8m54s |
| New runtime safeguards | PASS — the built-site runner now rejects broken ARIA ID references and visible button/input/select/textarea/summary/tab targets below 44 px |
| Manual candidate Chrome | PASS — 320/390/981/1101 px samples and the 320/620/621/768/981/1024/1101 breakpoint matrix had no overflow, undersized exposed controls or header overlap; menu focus/one-close/Escape-return and skip-link focus transfer passed |
| Production boundary | NOT DEPLOYED — Sites v86 remains live; no Sites publish, Worker release, DNS, D1 or notification mutation was made |

This is exact-source candidate evidence. It does not convert the observed live
v86 failures into production passes and is not a WCAG conformance claim.

## Worker 170 authenticated Client shell accessibility closure

| Gate | Result |
| --- | --- |
| Confirmed production findings | FAIL on the prior shell — the closed search trigger referenced an absent dialog; visible Client shell/search/dashboard labels reached 10–11 px; the open mobile menu exposed two `Закрыть меню` buttons to accessibility APIs |
| Source correction | PASS — search `aria-controls` exists only while the dialog exists; explicit shell text uses a 12 px floor; the clickable menu scrim is `aria-hidden` and `tabIndex=-1` while the real close button remains focusable |
| Focused regression | PASS — 13/13 shell accessibility contracts |
| Full local release gate | PASS — rendered HTML 35/35, core 1107/1107, Cloudflare/infrastructure 203/203, type-check, lint and production artifact validation |
| Final artifact budgets | PASS — CSS 594.8/600.0 KiB; initial JS 295.1/320.0 KiB; largest lazy increment 200.5/240.0 KiB; fonts 453.6/512.0 KiB; images 564.4/640.0 KiB; Worker entry 3799.5/6144.0 KiB. These are emitted bytes, not Core Web Vitals |
| Exact CI | PASS — run `33208687185` on final source `31ca216095cd5b09cde25b781c79d9d4a604751e`; Website 1m57s and Platform 8m57s |
| Production deployment | PASS — Worker 170 `8a51f26c-2011-4ea0-a8f9-2e5a80316ce6`, deployment `8dc989ba-014b-4a40-87e5-d017d8a4488e`, receives 100%; Worker 169 is rollback |
| Authenticated Chrome at 390 px | PASS — one H1/main, private noindex metadata, no horizontal overflow, no unnamed/sub-44 px controls, no visible text below 12 px, no broken ARIA references and no warning/error log |
| Search keyboard/dialog | PASS — closed trigger has no dangling `aria-controls`; open state has `role=dialog`, `aria-modal=true` and the exact target; autofocus, Shift+Tab/Tab wrap, Escape close and trigger focus return passed |
| Authenticated Chrome at 320 px | PASS — one H1/main, no overflow or sub-44 px control; menu moved focus to the real close button, exposed exactly one accessible closer, kept the scrim hidden/tab-excluded and returned focus on Escape |
| Skip-link keyboard path | PASS — first Tab visibly focused the 44 px skip link, Enter focused `main#main-content`, and the next Tab reached the associated `#dashboard-legal-task` textarea with a solid visible outline |
| Authenticated wall-clock sample | OBSERVED — 2,874 / 2,256 / 1,587 ms, median 2,256 ms. The signed-in Chrome controller does not expose DevTools performance observers, so no LCP/INP/CLS claim is made |
| Route/auth boundaries | PASS — Client/Lawyer private redirects, the Lawyer-host Client redirect, Admin protected handoff and public status route retained expected no-store/cache boundaries |
| Production health | PASS after one transient — the first post-release snapshot was degraded only by `SCANNER_UNAVAILABLE`; the next scheduled probe recovered without intervention and both status APIs agreed at `2026-08-28T20:51:55.490Z` on 8/8 operational with zero incidents. Anthropic remained operational |
| Deployment boundary | PASS — no D1 mutation or migration, DNS change, notification mutation or Sites release; Sites v86 remains live |

No private card text, screenshot, form submission or customer-data mutation was
used. This is bounded browser evidence, not a blanket WCAG or Core Web Vitals
claim.

## Anthropic account recovery recheck

| Gate | Result |
| --- | --- |
| Independent production reads | PASS — `app.juro.uz/api/status` and `status.juro.uz/api/status` returned the same latest snapshot generated at `2026-08-29T00:19:04.324Z` |
| Anthropic | PASS — fresh synthetic probe operational at `2026-08-29T00:15:32.841Z`, 6,141 ms, no safe error |
| Dependent document analysis | PASS — operational at `2026-08-29T00:00:46.020Z`, 7,564 ms, no safe error |
| Aggregate health | PASS — all eight published components operational and no active incident |
| Scope | READ-ONLY — no prompt, upload, customer data, D1 mutation, DNS change, notification or release |

## Worker 168 Client dashboard keyboard-focus closure

| Gate | Result |
| --- | --- |
| Production baseline | FAIL observed on Worker 167 — in an existing authenticated Client session, the first Tab focused the visible skip link and Enter transferred focus to `main#main-content`; the next Tab reached `#dashboard-legal-task`, where `:focus-visible` matched but outline, border and box shadow were all absent |
| Accessible name | PASS — the textarea is associated with the visually hidden label `Опишите ситуацию или задайте юридический вопрос` |
| Source correction | PASS — `.dashboard-command-form textarea:focus-visible` uses the shared focus color with a `3px` outline and `3px` offset; the exact production CSS asset contains this rule |
| Focused regression | PASS — 1/1 dashboard mobile/zoom/keyboard accessibility safeguard test |
| Static and artifact gates | PASS — type-check, lint and production build; artifact budgets remain within limits, including client CSS 594.8 KiB of 600.0 KiB |
| Exact CI | PASS — run `33195687549` on source `0791a0884a7b9491cc0b8313faf79227bd826a66`; Website 2m12s and Platform 8m44s |
| Production deployment | PASS — Worker 168 `9cbfccd2-ec57-4839-9209-061d216ec1b3`, deployment `eae00573-f828-446d-8780-415603e4eced`, receives 100%; Worker 167 is rollback |
| Production keyboard replay | PASS — the same Tab/Enter/Tab path focused the skip link, transferred focus to `main#main-content` and then reached the labelled textarea with a solid visible shared-color outline; document width equalled client width at 1521 px |
| Production route/health | PASS — public surfaces returned their expected 200/redirect boundaries; status generated at `2026-08-28T17:53:44.842Z` was 8/8 operational with no active or recent incidents |
| Deployment boundary | PASS — no D1 mutation, migration, DNS, notification or Sites change; Sites v86 remains live |

This is a bounded manual keyboard finding and release result, not a blanket
WCAG conformance claim. No form was submitted and no authenticated customer
data was changed during the sample.

## Worker 167 Client login mobile CLS closure

| Gate | Result |
| --- | --- |
| Live production baseline | FAIL observed — a cold Chrome trace of `https://app.juro.uz/ru/auth/login` at `390×844`, 3× DPR, 4× CPU and Fast 4G recorded LCP 2,344 ms, TTFB 705 ms and CLS 0.2779; the obsolete `.auth-brand::after` decorative `J` became the LCP element and the late Turnstile insertion contributed a second shift |
| Root cause | CONFIRMED — the current Client auth surface inherited the legacy global 620 px pseudo-element, while the Turnstile widget reserved 65 px before rendering at approximately 70.1 px |
| Source correction | PASS candidate — Client auth explicitly disables only its obsolete pseudo-element; Lawyer's separate ring is unchanged; authenticated and guest Turnstile widgets now reserve 72 px |
| Live-page candidate replay | PASS threshold — the candidate CSS was injected before document rendering in an isolated Chrome context while loading the real production page and real Turnstile; LCP moved to the `H2` at 1,692 ms and the 14-second layout observer recorded total CLS 0.0462, below the <=0.1 target |
| Local built Worker replay | PASS — the generated production Worker rendered the Client login with `display:none` / `content:none` on the pseudo-element and CLS 0.00 under the same mobile profile; local auth intentionally had no production secrets or Turnstile challenge |
| Focused regression | PASS — 10/10 auth accessibility and theme-resilience tests |
| Static and artifact gates | PASS — type-check, lint and production build; artifact budgets remain within limits, including client CSS 594.7 KiB of 600.0 KiB |
| Cloudflare/infrastructure suite | PASS — 203/203 |
| Broad core suite | PARTIAL by explicit scope — no failing assertion was observed, but the run reached its 300-second harness limit during the legal-corpus block; that block is excluded from this release step per the user's instruction to skip legislation-database work |
| Exact CI | PASS — run `33192562472` on source `4eba97cead5c56d47c51dbc1965b5b440871dd5b`; Website 2m14s and Platform 6m54s |
| Production deployment | PASS — Worker 167 `b67a2ed8-74f8-4d62-968e-87bff9d3e4dc`, deployment `7f1431fd-3e89-491d-aacc-f1c630ca020e`, receives 100%; Worker 166 is rollback |
| Production after-trace | PASS — a new isolated cold Chrome run without injected CSS recorded LCP on the `H2` at 2,680 ms and 15-second observer CLS 0.0462; the Client pseudo-element was absent, Turnstile held 72 px and document width remained exactly 390 px |
| Route/auth boundary | PASS — Client and Lawyer dashboards retain private/no-store `307` login boundaries, the original Lawyer-host Client URL redirects to the exact App route, and Admin retains its protected `303` handoff |
| Production health | PASS — public status generated at `2026-08-28T17:11:28.991Z` was 8/8 operational with no incidents; OpenAI and Anthropic were operational without safe errors |
| Deployment boundary | PASS — no D1 migration/mutation, DNS, notification or Sites change; Sites v86 remains live |

## Privacy-safe analytics schema and data-quality candidate

| Gate | Result |
| --- | --- |
| Exact source | PASS — runtime commit `aaba59828a967aded926c1fe79b3e5c80936460d`, release evidence commit `14ecae9a475c75d54c92e8c69d96a3c12290af8e`, Draft PR `#64` |
| Production dataset read | PASS read-only — the Analytics Engine SQL API returned 24 stored/represented events from `2026-08-25 08:10:02Z` through `2026-08-28 01:46:27Z`; every `_sample_interval` was 1 |
| Observation-window recheck | PASS read-only — the exact `2026-08-25 00:00:00Z` boundary still returned 24 represented events; the exact Worker 166 release boundary at `2026-08-28 16:07:52Z` returned zero, so no post-release growth or conversion baseline is claimed |
| Observed schema | PASS for the 24-row window — all rows used one of the 21 canonical product events and the expected first-six dimensions |
| Data-quality result | PARTIAL for Analytics Engine — only one consented `landing_view`, zero signup start/completion events and no actor linkage; activation, return, drop-off and conversion remain `UNVERIFIED` from this occurrence dataset alone |
| Fixed defect | PASS candidate — operational support telemetry now preserves the common event/surface/locale/outcome/provider/variant positions and moves only allowlisted category/severity to `blob7`/`blob8` |
| Feedback metric | PASS candidate — `feedback_submitted` now maps the allowlisted type to success/partial/failure and stores only that bounded type in `blob7`; comments never enter analytics |
| Focused regression | PASS — 83/83 product-analytics, feedback and platform-core tests |
| Full local release gate | PASS — core 1106/1106, Cloudflare/infrastructure 203/203, lint, type-check and production artifact validation; emitted CSS remains 594.6 KiB of the 600.0 KiB limit |
| GitHub Actions CI `33187593245` | PASS on exact `14ecae9a` — Website 2m05s and Platform 9m21s |
| Provider recovery | PASS post-release — public status generated at `2026-08-28T16:15:50.194Z` was 8/8 operational with zero incidents; Anthropic was operational at `16:15:50.040Z` and OpenAI at `16:10:23.388Z`, both without a safe error |
| Cost measurement | UNCHANGED — 4/30 real priced successes, `$0.104549` estimated cost and two zero-token failures; the 30% reduction target remains `UNVERIFIED` |
| Deployment | PASS — Worker 166 `4bd03261-df05-4e5b-9f91-66bd6d8cfdcd`, deployment `3579b110-a09d-4f53-8563-34ec0d2d5c4e`, receives 100%; Worker 165 is rollback |
| Route/auth boundary | PASS — the original Lawyer-host Client URL returns a private/no-store `307` to the exact App route; Client/Lawyer preserve separate login destinations, Admin preserves its protected `303`, and an unauthenticated same-origin feedback POST was rejected `403` with `no-store` |
| Deployment boundary | PASS — no D1 migration/mutation, DNS, notification or Sites change; Sites v86 remains live |

The dataset contains aggregate occurrences, not unique people. In particular,
the 13 `lawyer_viewed` rows cannot be promoted to 13 unique prospects, and the
three first-question rows cannot be joined to the downstream error, fallback,
source-open or feedback rows. The KPI framework now records an explicit
definition and readiness state for every requested metric instead of deriving
rates from mismatched denominators.

## Worker 163 monitoring cadence closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `810432eac9c1159c4cbd60fddaab7c1c1131b655` on Draft PR `#64` |
| Cadence regression coverage | PASS — 7/7 focused metadata/cadence tests; `daily`, `weekly` and `immediate` delivery windows, legacy cursor initialization, empty-window cursor advance and deterministic retry safety are covered |
| Full local release gate | PASS — lint, type-check, production build, artifact budgets, rendered Worker 35/35, core 1104/1104 and Cloudflare/infrastructure 202/202 |
| GitHub Actions CI `33152530994` | PASS on exact `810432ea` — Website 2m41s and Platform 6m58s |
| Platform deployment | PASS — Worker 163 `e7c8ec49-bba6-4abd-ac00-89bfd1cd4acd`, deployment `dc3efbec-6909-4f56-80ef-0d964cdea027`, 100%; Worker 162 `d2146684-bd77-4a33-a2a2-8d47042e473e` is rollback |
| First production cadence run | PASS — run `a2d24c2d-751a-4690-8569-c284880289a7` completed at `2026-08-28T07:55:58.100Z`; all four legacy `daily`/`weekly` preferences received the safe cutoff cursor `2026-08-28T07:54:51.699Z` without historical delivery |
| Idempotent repeat | PASS — run `5aba731e-7c60-4c7f-b7d4-de793476c505` completed at `2026-08-28T08:01:53.188Z`; the four cursors remained unchanged and legislation-monitor notification count/max remained exactly 222,329 / `2026-08-28T06:40:50.995Z` |
| Production route matrix | PASS — `juro`, `www`, `app`, `lawyer`, `admin`, `status` and `status/api/status` returned HTTP 200 after release |
| Authenticated Chrome | PASS — RU and UZ Monitoring show fresh 40/40/0 state, selected daily cadence and localized cadence guidance; monitoring email is visibly disabled and not claimed operational. The original Lawyer-host dashboard URL redirects to and renders the exact app dashboard instead of plaintext `Not Found` |
| Data boundary | PASS — no migration, notification deletion or read-state change; the only production preference writes were the four scheduled legacy cursor initializations |
| Deployment boundary | UNCHANGED — no DNS or Sites release; Sites v86 remains live and saved v94 remains unpublished |

Worker 163 closes the previously recorded monitoring-frequency gap. The
existing five-minute scheduler now dispatches only due preferences: immediate
after a successful daily source check, daily after one day and weekly after
seven days. Notification creation and cursor advance share one D1 batch, while
deterministic digest IDs make retries safe. Monitoring email remains
intentionally unavailable until a dedicated retry-safe email outbox exists;
the API rejects it and the RU/UZ interface states that boundary.

## Worker 162 Anthropic recovery and notification-fan-out closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `75064bee61909baa0e1a05dabdedc6268f86ed29` on Draft PR `#64` |
| Regression coverage | PASS — 81/81 focused monitoring/dashboard tests; full local `npm test`, lint, type-check and bounded production artifact validation passed |
| GitHub Actions CI `33148425519` | PASS on exact `75064bee` — Website 2m15s and Platform 6m57s; Platform included rendered 35/35, core 1101/1101, Cloudflare/infrastructure 202/202 and deployable artifact checks |
| Platform deployment | PASS — Worker 162 `d2146684-bd77-4a33-a2a2-8d47042e473e`, deployment `0c8ec9f3-cd7f-4a0c-9e99-e0b1d91fc998`, 100%; Worker 161 `34c54357-0878-4637-b533-1fa1afa36336` is rollback |
| Anthropic recovery | PASS — a fresh scheduled probe recorded Anthropic operational with no safe error at `2026-08-28T06:47:17.754Z`; document analysis remained operational |
| Production health | PASS — `status.juro.uz` and `app.juro.uz` agreed on 8/8 operational at `2026-08-28T06:49:05.922Z` |
| Fan-out diagnosis | CONFIRMED — before Worker 162, delivery-time RSS `pubDate` churn produced repeated metadata-change events and 222,329 `legislation_monitor` notifications; the last Worker 161 retry at `06:40:50.995Z` added 800 rows |
| First post-release retry | PASS — Worker 162 processed 40/40 Lex RSS metadata rows at `06:45:53.618Z`, recorded `changed=0` and `error=0`, and notification count remained exactly 222,329 with no later `created_at` |
| Authenticated Chrome | PASS — the real Individual dashboard displays `99+ новых событий` with accessible label `Более 99 новых событий`, replacing the prior 47,544 exact-count rendering |
| Data boundary | PASS — no migration, manual D1 mutation, notification deletion or read-state change; historical rows remain intact. Verification queries were read-only |
| Deployment boundary | UNCHANGED — no DNS or Sites release; Sites v86 remains live and saved v94 remains unpublished |

Worker 162 removes RSS delivery time from the stable fingerprint, treats only a
real title change as a customer event, writes metadata/events/one per-recipient
digest atomically and uses deterministic retry-safe IDs. The dashboard count is
bounded at 100 and represented as `99+`; this prevents an unbounded count scan
without rewriting user-owned notification history. Worker 163 subsequently
closed the monitoring-preference frequency gap; this section remains as the
Worker 162 release checkpoint.

## Worker 161 Anthropic health diagnostic

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `316ef335a0dfd0e1acd57be2e4cfd014d53be01f` on Draft PR `#64` |
| Focused regression | PASS — 10/10 safe Anthropic error-classification tests; raw provider messages are neither returned nor logged |
| Full local release gate | PASS — lint, type-check, core 1099/1099 and Cloudflare/infrastructure 202/202; the bounded production build also completed during deployment |
| GitHub Actions CI `33144330811` | PASS on exact `316ef335` — Website 2m10s and Platform 8m38s |
| Platform deployment | PASS — Worker 161 `34c54357-0878-4637-b533-1fa1afa36336`, deployment `72c5d2be-e417-4dcf-a4eb-8022a59a1b61`, 100%; Worker 160 `3d029e81-c477-4215-b182-356985b00e6a` is rollback |
| Provider diagnosis | BLOCKED EXTERNALLY — the 10:35 Tashkent scheduled probe classified Anthropic's HTTP 400 as `PROBE_PROVIDER_HTTP_400_INVALID_REQUEST_ERROR_CREDIT_BALANCE_LOW`; no secret, prompt or provider message was recorded |
| Production health | DEGRADED — `status.juro.uz` and `app.juro.uz` agreed on 6/8 operational at `2026-08-28T05:36:31.571Z`; only `ai` and `document_analysis` were degraded, while OpenAI and the Lawyer area remained operational |
| Exact screenshot route | PASS — the Lawyer-host URL returns private/no-store `307` to the exact app path; isolated Chrome reached the localized Client login with the requested path retained, one H1, one main landmark, no horizontal overflow and private `noindex` metadata rather than plaintext `Not Found` |
| Chrome diagnostics | OBSERVED — the Cloudflare Turnstile frame reported its known deprecation/CSP/Quirks issues, and two opaque `NaN` console entries had no attributable source; the JURO login document rendered successfully, so no clean-console claim is made for this replay |
| Deployment boundary | UNCHANGED — no production D1 write, migration, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

This section is retained as point-in-time incident evidence. API credit was
subsequently restored and Worker 162's fresh scheduled probes returned the
current 8/8 operational state recorded above. Rotating the key or changing the
model was not required.

## Worker 158 Admin interaction-floor closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `93bb6abf48478af8de5bb86bbc38df3e6dcdbe15` on Draft PR `#64` |
| Focused regression | PASS — 12/12 Platform accessibility contracts, including the non-corpus Admin 44 px source guard |
| Full local release gate | PASS — lint, type-check, production build, artifact budgets, rendered Worker 35/35, core 1098/1098 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33136790049` | PASS on exact `93bb6abf` — Website 2m15s and Platform 6m32s |
| Platform deployment | PASS — Worker 158 `6ebf3a20-ca4d-4751-8283-22bcc9b10988`, deployment `f7e89714-43be-4450-b232-6b988e8f7f86`, 100%; Worker 157 `2ec24c74-57b9-4c66-8afa-372cceb24767` is rollback |
| Delivered asset | PASS — production `/assets/index-C92iLqdd.css` returns `200` and contains the Admin retry, knowledge-base and cost-checkbox selector group with a 44 px floor |
| Protected-role boundary | PASS fail-closed — anonymous Admin console and costs requests return non-cacheable `303` handoffs to the app Admin surface without privileged content |
| Production Chrome | PASS for the anonymous boundary — isolated Chrome reached the protected re-authentication screen with one H1, one main landmark, no horizontal overflow, no console warnings/errors and no staff-data disclosure |
| Production health | PASS — both status endpoints agreed on 8/8 operational and zero active/recent incidents at `2026-08-28T02:53:33.522Z` |
| Deployment boundary | UNCHANGED — no production D1, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

Worker 158 raises confirmed non-corpus Admin controls: shared retry buttons,
Knowledge Base header/fieldset actions and the Cost console checkbox target.
Legal-source review controls were intentionally excluded from this iteration.
This proves source delivery and the fail-closed anonymous boundary; it is not a
signed-in Admin route-loop or a blanket WCAG conformance claim.

## Worker 157 Lawyer interaction-floor closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `67bd679e39e2ce2357d879cc7d806e53e4ce2651` on Draft PR `#64` |
| Focused regression | PASS — 11/11 Platform accessibility contracts, including the Lawyer professional-workflow 44 px source guard |
| Full local release gate | PASS — lint, type-check, production build, artifact budgets, rendered Worker 35/35, core 1097/1097 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33134728801` | PASS on exact `67bd679e` — Website 2m28s and Platform 8m47s |
| Platform deployment | PASS — Worker 157 `2ec24c74-57b9-4c66-8afa-372cceb24767`, deployment `62266f40-fe05-423b-9916-7c4220bf66d3`, 100%; Worker 156 `b361ae62-1220-4fa3-b480-488d4791bda4` is rollback |
| Delivered asset | PASS — production `/assets/index-CLgXbjP1.css` contains both Lawyer workspace and consultation target selectors with the 44 px floor |
| Protected-role boundary | PASS fail-closed — anonymous Lawyer workspace API is `401`; a Client session is sent to the dedicated Lawyer re-authentication surface without Client-data disclosure |
| Production Chrome | PASS for the re-authentication boundary — complete document, one H1, one main landmark and no horizontal overflow; signed-in Lawyer workflow rendering remains unverified because no production Lawyer session was fabricated |
| Production health | PASS — both status endpoints agreed on 8/8 operational and zero active/recent incidents at `2026-08-28T02:14:34.121Z` |
| Deployment boundary | UNCHANGED — no production D1, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

Worker 157 raises the confirmed professional workflow controls in Lawyer
offers, messages, AI assist, internal notes, consultations, scheduling,
knowledge, time tools and source links. This proves source delivery and the
fail-closed production boundary; it is not a signed-in Lawyer route-loop or a
blanket WCAG conformance claim.

## Worker 156 document-comparison interaction-floor closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `7123fb4b842c0d006f82a83b0e72263a0088020c` on Draft PR `#64` |
| Focused regression | PASS — 11/11 Platform product-UX contracts, including the document-comparison 44 px source guard |
| Full local release gate | PASS — type-check, lint, production build, artifact budgets, rendered Worker 35/35, core 1096/1096 and Cloudflare/infrastructure 201/201 |
| Document-comparison smoke | PASS — upload, three-change comparison, decision, PDF/DOCX export, download, tenant isolation, MIME/same-file rejection, monitoring, search and deletion; no production D1 write was used |
| GitHub Actions CI `33132278871` | PASS on exact `7123fb4b` — Website 2m29s and Platform 8m35s |
| Platform deployment | PASS — Worker 156 `b361ae62-1220-4fa3-b480-488d4791bda4`, deployment `caaa6ee7-ec98-4ef8-80ac-7643cb2f53ca`, 100%; Worker 155 `eb132328-68c2-48f3-95d4-90cac0962119` is rollback |
| Production Chrome at `320×800` | PASS — the comparison refresh control is exactly `44×44` CSS px; document width 305 px inside the viewport, no horizontal overflow |
| Production Chrome at `390×844` | PASS — the same control is exactly `44×44` CSS px; document width 375 px inside the viewport, no horizontal overflow |
| Browser diagnostics | PASS — no Chrome console errors after the production replay |
| Production health | PASS — 8/8 operational, zero active/recent incidents at `2026-08-28T01:26:35.918Z` |
| Deployment boundary | UNCHANGED — no production D1, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

Before the correction, the refresh control measured about `19.6×42` px at
320 px and `23.4×42` px at 390 px because its flex item could shrink. The
production replay proves the corrected named workflow, not blanket WCAG
conformance or assistive-technology behavior. Screenshots:
`docs/investor-ready/screenshots/before/client-document-comparison-touch-target-320.png`
and
`docs/investor-ready/screenshots/after/client-document-comparison-touch-target-320.png`.

## Public website automated accessibility candidate

| Gate | Result |
| --- | --- |
| Runner | PASS — pinned `@axe-core/playwright` 4.13.0 with `playwright-core` 1.62.1; only the installed Google Chrome channel is launched |
| Artifact boundary | PASS — the harness serves the exact verified `dist/client` assets and delegates documents to the built ESM Worker |
| Standards tags | WCAG 2.0 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA automated axe rules |
| Desktop light | PASS — home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video in RU, UZ and EN |
| Desktop dark | PASS — RU home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video |
| Mobile light `390×844` | PASS — home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video in RU, UZ and EN |
| Mobile dark `390×844` | PASS — RU home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video |
| Aggregate | PASS — 56/56 route/profile combinations, zero automated violations; non-video pages retained two manual-review candidates and video retained three |
| Readable visible text | PASS — the runner rejects any visible public text below 12 CSS px and the static source gate rejects explicit smaller `px`/`rem` declarations; all 56 profiles passed after 77 declarations in 12 stylesheets were raised |
| Corrected surfaces | Public-home action, decision-map, legal-basis/risk/next-step and handoff copy; document tabs; resource/FAQ metadata; Trust data-route/status copy; Lawyer metadata/filters/actions; Legal Center and knowledge actions/dark theme; footer and mobile-menu controls |
| Functional/build gate | PASS — verified build plus 47/47 functional tests, including the new explicit CSS-size source guard |
| Skip-focus regression | PASS — every one of the 56 exact-built route/profile samples activates the skip link and requires focus to land on `#main-content` |
| Manual Chrome sample | PASS locally on exact built assets — retained RU keyboard/theme samples plus the revised RU home at `1280×900` and EN home/UZ Trust at `390×844` kept the correct language, one H1, one main target, zero horizontal overflow and no visible text below 12 px; dense decision-map and handoff labels did not clip |
| GitHub Actions CI `33122475415` | PASS on exact readable-text source commit `5bdd905884834657cdb7223fc9419774c4085e61` — Website 2m15s and Platform 8m42s |
| Readable-text source | PASS locally — commit `5bdd905884834657cdb7223fc9419774c4085e61` |
| Saved Sites candidate | PASS — version 94 from exact Sites source commit `6f5c70f947df14597cca2e289c3b38bbd36b589d`; canonical archive hash `sha256:5896ac705db3ade8f7dcee18e7c8ed1520bbed5c19aa19dc301695ea2ff4d51b`, 83 files; saved version 93 is superseded |
| Public deployment boundary | UNCHANGED — version 94 is saved only; successful public deployment `appgdep_6a9027658100819189e6e6bc1a20bf1d` still owns version 86 |

This is saved-candidate evidence, not deployed-Sites evidence and not a blanket
WCAG conformance statement. The named Chrome keyboard/accessibility-tree sample
is retained, but the remaining authenticated workflows and assistive-technology
behavior remain manual release checks.

## Worker 155 status metadata and same-origin asset closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — status localization `e2af1460cf6d79ce2ffaba3921dcf26c5f4878b6`; host-aware asset metadata `fcdb9e6f77ab5ee95f97314c939b780c3fcfdf4b` |
| Focused/static gates | PASS — root layout 2/2, type-check and lint |
| Full local release gate | PASS — development build, rendered HTML 35/35, artifact budgets, core 1095/1095 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33129369444` | PASS on exact `fcdb9e6f` — Website 2m30s and Platform 6m48s |
| Platform deployment | PASS — Worker 155 `eb132328-68c2-48f3-95d4-90cac0962119`, deployment `24e52e75-c687-4d12-9b9c-3f9c7d3e0cd4`, 100%; Worker 154 `3efdad51-d6c1-47f0-ad5b-fb24cd2adc99` is rollback |
| UZ Chrome root | PASS — localized title, `html[lang=uz]`, `main[lang=uz]`, one H1/main, loaded fonts, private noindex, no overflow and an empty warning/error/issue log |
| RU Chrome route | PASS — localized title, `html[lang=ru]`, `main[lang=ru]`, one H1/main, loaded fonts, private noindex, no overflow and an empty warning/error/issue log |
| Icon/CSP boundary | PASS — favicon and Apple icon resolve on `status.juro.uz`, return `200 image/png`, and no CSP issue remains; no `unsafe-eval` or cross-origin image exception was added |
| Status route fence | PASS — sampled Client route on the status host remains `404` |
| Production health | PASS — 8/8 operational, zero active/recent incidents at `2026-08-28T00:30:50.972Z` |

The exact Lawyer-host screenshot URL was also replayed in a clean Chrome
session. It reached the localized Client login at `app.juro.uz` with one H1 and
main, loaded fonts, no overflow and private noindex metadata rather than a
plaintext `Not Found`. The main document is in Standards Mode. CSP/eval and
Quirks diagnostics attached to the third-party Cloudflare Turnstile challenge
document are retained as provider-frame observations; JURO CSP was not weakened
to suppress them.

## Authentication error-association release

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `742ee6f2f7583a61b242310c79d1ef61cd1ecc9a` on Draft PR `#64` |
| Error ownership | PASS — Email, OTP and MFA failures set `aria-invalid` and share the stable atomic alert through `aria-errormessage` plus `aria-describedby`; resend failures are associated with the resend action rather than mislabelling the OTP input |
| Terminal challenge recovery | PASS — terminal OTP/MFA failures return to the email step and move the error relationship to the newly focused email field |
| Focused regression | PASS — 2/2 auth accessibility source-contract tests |
| Local Platform gates | PASS — type-check, lint, development build, rendered smoke, deployable artifact and budgets, full core 1094/1094 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33125681307` | PASS — Website 2m22s and Platform 8m34s, including locked installs, lint, types, tests, artifacts, Cloudflare matrix, production-dependency audit and licence policy |
| Production boundary | PASS for source delivery — deployed in Worker 153 and retained in Worker 157; the exact production auth asset contains `aria-errormessage`, `aria-invalid`, `aria-atomic` and the stable `auth-error` target |

No email, OTP, MFA code or consent was submitted for this release. The source,
exact production asset and automated gates prove the delivered association
contract, not live screen-reader announcement after an asynchronous error.

## Lawyer catalogue performance and public-photo candidate

| Gate | Result |
| --- | --- |
| Live v86 mobile traces | OBSERVED — three `390×844`, 4× CPU, Fast 4G reloads: LCP 2,818 / 1,154 / 1,380 ms; TTFB 1,856 / 240 / 198 ms; CLS 0.00 / 0.00 / 0.0004 |
| Live image delivery | FAIL in v86 — 419×419 PNG, 82,109 bytes, displayed at about 80×80; 81 kB estimated waste; response incorrectly `private, no-store` |
| Source correction | PASS locally — only fixed 128/288 px WebP variants are requested; the production Worker cache is enabled; only the exact approved public-photo route receives public cache policy; private photo/API routes remain excluded |
| Focused regression | PASS — platform photo-policy 4/4; website production contracts 24/24 after adding locale-aware year grammar |
| Static gates | PASS — Platform type-check/lint, generated Cloudflare types, three-environment matrix, rendered 35/35, full core 1094/1094, infrastructure 201/201 and production artifact budgets; Website type-check/lint, verified build/artifact and full 46/46 suite |
| GitHub Actions CI `33104695509` | PASS — Website 50s and Platform 8m40s, including tests, deployable artifacts, Cloudflare matrix, production-dependency audit and licence policy |
| Platform deployment | PASS — Worker 152 `47671380-a8fe-4d8c-95e2-bd7778541b0c`, deployment `61882723-0234-4614-bd66-c0ad2b862ba3`, 100%; Worker 151 is rollback |
| Live public-photo verification | PASS on Worker 152 — original 82,109-byte PNG is publicly cacheable; the approved 128 px WebP is 2,106 bytes (97.4% smaller) and changed from `MISS` to `HIT` on repeat; invalid variants retain the original; an unknown UUID is `404`, `no-store`, `BYPASS` |
| Production health | PASS at capture — 8/8 operational, zero active/recent incidents at `2026-08-27T18:55:37.826Z`; error-only tail stayed empty after photo and routing probes |
| Controlled Lighthouse | PASS — Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 58 passed, 0 failed; reports in `docs/qa/artifacts/performance-sites-v86-lawyers/` |
| Accessibility snapshot | PASS for high-level semantics — one H1, labelled filters and named actions; it found the corrected RU grammar defect `4 лет` |
| Sites production status | PARTIAL — public Sites v86 still requests the original 82,109-byte PNG and still predates the RU grammar fix; a superseding Sites version remains required for end-user WebP delivery |

The first trace's server-latency outlier is retained. Two passing repeats do not
erase it or prove field performance. Worker 152 now provides the bounded WebP
and cache behavior, but the end-user catalogue remains on Sites v86 and will
request the smaller variant only after a superseding public Sites release.

## Worker 151 responsive Turnstile and Client target closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commits `6fa7835e`, `a6008f43` and final Turnstile commit `0bdfe7c04830752e06049ace7afc7575db267499` on Draft PR `#64` |
| Focused regression | PASS — 15/15 Turnstile and UI-resilience tests; the earlier Client target suite passed 10/10 |
| Local release gates | PASS — type-check, lint, full core 1090/1090, Cloudflare/infrastructure 201/201, production build/artifact and all emitted-asset budgets |
| GitHub Actions CI `33090467509` | PASS — Platform 8m29s and Website 41s |
| Production deployment | PASS — Worker 151 `8a9accf5-31e6-4947-ab34-e0317b26e61e`, deployment `a47ee184-655b-4ae5-af16-add701e1083a`, 100%; Worker 150 `ab61380a-4045-4283-80f0-d5bcc1144be8` is rollback |
| Production health | PASS at capture — `overallStatus=operational`, all eight components operational, zero active/recent incidents at `2026-08-27T16:06:24.644Z` |
| Client target replay | PASS for six affected authenticated routes — Cases, Action plan, History, Profile, Security and Notifications exposed no sub-44 px target after Worker 150/151. The remaining 21 px search input is nested in a 44 px label target |
| Desktop Chrome trace | PASS — login LCP 521 ms (TTFB 310 ms, render delay 211 ms), CLS 0.02, no horizontal overflow; render-blocking estimate was 0 ms for FCP/LCP |
| Mobile Chrome trace | PASS — emulated Chrome 320x800, LCP 248 ms (TTFB 92 ms, render delay 156 ms), CLS 0.00, document `320/320` with no horizontal overflow, 296 px card and 150 px compact Turnstile |
| Responsive breakpoint replay | PASS — changing the same live tab from 320 px to desktop caused `ResizeObserver` to replace compact with flexible Turnstile without page overflow |
| Lighthouse snapshot | PASS — Lighthouse 13.4.1: Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 33 passed, 0 failed. Reports: `docs/qa/artifacts/lighthouse-worker151-login/` |
| Exact screenshot route | PASS — `lawyer.juro.uz/ru/individual/dashboard?qa=worker151` returns non-cacheable `307` to the exact `app.juro.uz` path; unauthenticated Client and Lawyer routes retain their own login destinations and Admin retains the protected `303` handoff |
| Protected-role boundary | PARTIAL — the preserved Lawyer and Admin Chrome tabs still require the user to establish the corresponding authenticated sessions before their current route loops can be replayed |

The Lighthouse snapshot and two lab traces establish the named deployed login
state only. They do not supply field CrUX data, INP evidence, screen-reader
coverage or a blanket WCAG conformance result.

## Worker 148 Lawyer-host Client-link correction

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `b4c472332e49b9750ec696652281670efb89bb9b` |
| Focused host-routing tests | PASS — 6/6 |
| Rendered Worker tests | PASS — 35/35 |
| Local release gates | PASS — full test command, lint, type-check, three-environment Cloudflare matrix, production artifact budgets and 730-package licence policy |
| GitHub Actions CI `33071334033` | PASS — Website and Platform |
| Production dry-run | PASS — required secrets present, production resources isolated and Container rollout disabled |
| Production deployment | PASS — Worker 148 `28dd4ac8-1ae2-4582-9697-8aa28e109cb5`, deployment `76e6f966-d069-4565-a7f9-9b2103a8ea47`, 100%; Worker 147 is rollback |
| Exact screenshot route | PASS over HTTP — `lawyer.juro.uz/ru/individual/dashboard` returns non-cacheable `307` to the exact `app.juro.uz` path |
| Query and method fence | PASS — `HEAD` retains query; cross-host `POST` returns `404` without `Location` |
| Fail-closed Lawyer boundary | PASS — unknown path remains `404`; canonical Lawyer dashboard retains its Lawyer-host login destination |
| Production health | PASS at capture — 8/8 operational, no incident at `2026-08-27T12:35:10.086Z` |
| Error-only tail | OBSERVED — one deployment-time `MalwareScannerContainer` Durable Object reset caused by the code update; no route failure was observed and status remained operational |
| Exact Chrome replay | PASS — a fresh reload of the original failing URL followed the live redirect to the authenticated Client dashboard at `app.juro.uz`. At 1920×945 it rendered one localized H1 with loaded fonts, private noindex metadata, zero overflow, no role alert and an empty warning/error log |

## Authenticated Client route and responsive smoke

An existing production Individual session was used read-only in Chrome to visit
21 Client routes: dashboard, AI chat, document builder, document review, cases,
documents, document comparison, action plan, calendar, archive, history,
consultations, lawyers, monitoring, notifications, billing, profile, settings,
security settings, privacy settings and help.

| Gate | Result |
| --- | --- |
| Desktop route loop | PASS — 21/21 retained the authenticated application shell, rendered one H1 after asynchronous settling, loaded fonts, exposed no role alert and had no horizontal overflow |
| Mobile route loop | PASS — 21/21 at `390×844` retained one H1, loaded fonts, exposed no role alert or horizontal overflow, kept the closed navigation inert/hidden and showed the mobile menu control |
| Mobile keyboard menu | PASS — opening moved focus to the close control; Escape closed the menu and restored focus to the trigger |
| Private indexing boundary | PASS — all sampled application documents declared `noindex, nofollow, nocache` |
| Chrome warning/error log | PASS — zero warning/error entries across the desktop route loop |
| Misplaced Client link replay | PASS on 2026-08-28 — the original `lawyer.juro.uz/ru/individual/dashboard` URL again reached the exact authenticated `app.juro.uz` Client dashboard; the rendered page had one H1, one main landmark, loaded fonts, private noindex, zero overflow, no role alert and no warning/error log |
| Individual → Business URL boundary | PASS for RU and UZ — direct Business dashboard attempts returned to the matching localized Individual dashboard, exposed no sampled Business-only signal and retained one H1, one main landmark, loaded fonts, private noindex, zero overflow, no role alert and no warning/error log |
| Lawyer boundary | PARTIAL — `/ru/lawyer/dashboard` reached the dedicated Lawyer login with the expected Lawyer account type and return path; authenticated route replay requires a signed-in Lawyer session |
| Admin boundary | PARTIAL — `/ru/admin/console` reached the protected fresh-session handoff; authenticated Admin replay requires a fresh protected session |

No form was submitted, no file was uploaded and no production record was
created or changed. This browser pass did not provide complete request-level
network error coverage, so it is not represented as full workflow or API
verification. Authenticated Business functionality and authenticated
Lawyer/Admin routes remain outside this checkpoint; only the Individual-role
containment of direct Business URLs is proven here.

## Worker 147 font-path correction

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `6503667cbf18f249656b29749040cda8b200fd47` |
| Focused normalizer tests | PASS — 3/3 |
| Local static gates | PASS — lint, type-check, production build, artifact validation and performance budgets |
| GitHub Actions CI `33063995387` | PASS — Website and Platform |
| Production dry-run | PASS — production bindings isolated; required secrets present; Container rollout disabled |
| Artifact path regression | PASS — zero `C:/Users/` and zero `.vinext/fonts` matches |
| Production deployment | PASS — Worker 147 `ed0253e1-1c35-416e-9f2a-5bd8352c1936`, deployment `6f536ee9-9666-41bb-b0f3-6f174019692b`, 100% |
| Production HTML and fonts | PASS — zero absolute path matches, 12 normalized font URLs, three sampled WOFF2 files `200 font/woff2` |
| Host/access smoke | PASS — expected Client `307`, API `401`, Lawyer `200/307`, Admin `303`, Status `200`, fenced application path `404` |
| Production health | PASS at capture — 8/8 operational, zero active incidents at `2026-08-27T11:02:55Z` |
| Chrome Status | PASS — complete DOM, fonts loaded, no absolute path, no warning/error log |
| Chrome authenticated Client dashboard | PASS — primary UI rendered, fonts loaded, no absolute path, no warning/error log |
| Worker error tail | PASS for smoke window — no error event observed |

The immediate Worker rollback is version 146
`c3237f9e-a258-42eb-8b94-62f5045b7b03`. Rollback would restore service code
but also restore the disclosed font path, so it is an incident-only fallback.

## 2026-08-25 release baseline

## Automated gates

| Gate | Result |
| --- | --- |
| Development deployable build | PASS |
| Rendered Worker/HTML suite | 34 passed, 0 failed |
| Core platform suite | 1083 passed, 0 failed |
| Cloudflare/config/queue suite | 201 passed, 0 failed |
| TypeScript type-check | PASS |
| ESLint | PASS |
| Migration safety and isolated restore | PASS; all migrations through 0159 apply, FK clean |
| Production artifact | PASS |
| Git diff whitespace check | PASS |
| GitHub Actions CI `32816221498` | PASS; Website and Platform |
| Website dependency hardening | PASS; 42/42 tests, type-check, lint, licence policy, artifact validation and 0 production audit vulnerabilities |
| Standard repository security scan `df6f1247-116c-42b8-b233-a693efb52263` | PASS within stated boundary; immutable `e4f407a8`, 1,898 tracked files, 8/8 planned surfaces, 0 reportable findings, PARTIAL coverage |
| Hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` | PASS; complete changed-source coverage for `e4f407a8..81aaf408`, 0 reportable findings |
| GitHub Actions CI `32829635485` | PASS on exact website source commit `81aaf408`; Website and Platform successful |
| Website metadata closure | PASS; 43/43 tests, type-check, lint, licence policy, artifact validation and 0 production audit vulnerabilities |
| Metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` | PASS; complete changed-source coverage for `33d7f8e3..ee0687af`, 0 reportable findings |
| GitHub Actions CI `32836146215` | PASS on exact public source commit `ee0687af`; Website and Platform successful |
| Social-preview diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` | PASS; complete changed-source coverage for `3f2bf72e..d0310b90`, 0 reportable findings |
| GitHub Actions CI `32838994132` | PASS on exact public source commit `d0310b90`; Website and Platform successful |

The production artifact stayed inside the checked-in regression budgets:
591.9 KiB CSS (600 KiB limit), 295.3 KiB initial browser JavaScript (320 KiB),
208.1 KiB largest lazy-route increment (240 KiB), 453.6 KiB fonts (512 KiB),
564.4 KiB images (640 KiB) and 3771.3 KiB Worker entry (6144 KiB).
These are emitted raw-byte budgets, not transfer sizes or Core Web Vitals.

## Production checks

- Four POST HTTP probes returned exact 308 HTTPS redirects with no-store.
- Client and Lawyer HTTPS login returned 200 with HSTS/noindex/no-store.
- Admin returned the expected 303 protected-session handoff.
- Status returned 200 and `overallStatus=operational` with eight operational
  components and no incidents.
- Unknown signed-share verification returned 410 `LINK_EXPIRED`, no-store and
  no session cookie.
- In-app browser DOM snapshots verified RU Client, UZ Client and the dedicated
  RU Lawyer login persona with labelled controls.
- Public sitemap crawl: 78/78 canonical URLs ended in 2xx, with no unexpected
  redirect or broken URL; every route also had exact canonical, complete
  RU/UZ/EN hreflang, explicit Open Graph title and expected indexability.

## Coverage boundaries

The earlier Codex Security scan was sealed as partial by risk-surface coverage
and found two medium/high-confidence signed-share issues; both are remediated
in this release. The later whole-repository Standard scan targeted immutable
`e4f407a8`, closed 8/8 planned surfaces and retained zero reportable findings.
It is still classified PARTIAL because independent delegated review, TAC and
destructive production testing were unavailable. Neither scan is represented
as an exhaustive proof that no vulnerability exists.

No live share existed in production, so the fifth-failure 429 path was not
rehearsed against user data. Worker 151 now has a Lighthouse snapshot plus
desktop and 320 px Chrome traces for the login surface, but that bounded lab
evidence does not cover field CrUX, INP, every application route or
screen-reader behavior. Physical iOS/Android, Edge, Firefox, Safari/WebKit and
native page zoom remain intentionally not tested under the current QA boundary.

Post-deploy public QA for Sites version 82 verified affected RU/UZ/EN legal,
lawyer and video DOM states, canonical/hreflang/Open Graph/Twitter metadata, no
horizontal overflow, an empty in-app browser log, 78/78 sitemap URLs passing
every checked SEO/social field, canonical `robots.txt`, public security headers, private
app/lawyer/admin no-store/noindex boundaries and an operational 8/8 status
response. CDP screenshot capture timed out and is not claimed as evidence.

## 2026-08-27 public Sites performance expansion

Live Sites v86 RU-home Chrome evidence passed the goal thresholds under a
`390×844` mobile/touch, 4× CPU and Fast 4G profile: LCP 1,956 ms, TTFB 234 ms
and CLS 0.0001. A separate 16-second observer recorded CLS 0.0012. Controlled
Lighthouse 13.4.1 scored 100 Accessibility, 100 Best Practices, 100 SEO and
100 Agentic Browsing, with 59 passed and 0 failed. The raw JSON/HTML reports
and hashes are in `docs/qa/artifacts/performance-sites-v86/`.

Production v86 also revealed conditional revalidation on every fingerprinted
static asset. Commit `5d543218` fixes both current `/_next/static/*` and newer
`/assets/*` output while leaving HTML non-cacheable. Local website type-check,
lint, production build, artifact validation and 44/44 tests passed. GitHub CI
`33095467495` passed Website in 51 seconds and Platform in 7 minutes 34
seconds. Sites v87 was saved from exact runtime commit `a60df03f` but is not
represented as live until the required public-deployment approval and
post-deploy checks complete.

## 2026-08-27 local plaintext backup cleanup

The two price-configuration SQL exports and two manifests were downloaded again
from private R2 prefix
`d1/juro-production/20260825T074158Z-price-config-f42c48fc/`. Each file matched
its recorded byte size and SHA-256 value. The exact local source directory and
temporary verification directory were deleted after that proof; both
`Test-Path` checks returned false and exact parent-directory match counts were
zero. The private R2 objects remain the recovery source.

## 2026-08-28 public homepage motion checkpoint

| Gate | Result |
| --- | --- |
| LCP content contract | PASS — the hero lead remains server-rendered and is no longer included in the delayed support animation |
| Layout read/write contract | PASS — `JuroMotionDirector` measures geometry before any scroll-frame DOM/style mutation; the initial measurement waits until the motion-ready style change has painted |
| Focused regression suite | PASS — 25/25 |
| Full website suite | PASS — 48/48 |
| TypeScript | PASS |
| ESLint | PASS |
| Production build and artifact validation | PASS |
| Accessibility smoke | PASS — desktop/mobile, light/dark and RU/UZ/EN route matrix; manual-review candidates remain explicitly manual |
| Live Sites v86 mobile baseline | PASS threshold — LCP 2,041 ms, TTFB 125 ms, CLS 0.00; 548 ms forced reflow remains measured |
| Local built-candidate mobile trace | PASS threshold — LCP 1,335 ms, TTFB 191 ms, CLS 0.00; total forced reflow 99 ms and landing-page attribution 2 ms |
| Live Sites v86 Lighthouse | PASS — Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 59 passed, 0 failed |
| Local candidate Lighthouse | BOUNDED PASS — Accessibility/SEO/Agentic Browsing 100; Best Practices 92 only because localhost CSP blocks canonical production favicon/manifest URLs |
| Production publish | NOT RUN — Sites v86 remains live; production after-measurement is still required |

The live and local traces used the same Chrome `390×844`, mobile/touch, 4× CPU
and Fast 4G profile, but different origins. The observed improvement is valid
pre-release evidence and is not represented as a production result.

### Trust and video route expansion

| Gate | Result |
| --- | --- |
| Live Trust mobile trace series | PARTIAL — LCP 3,726/1,551/1,803 ms, TTFB 1,891/117/121 ms and CLS 0.00/0.00/0.00; median passes, retained cold sample fails |
| Live video mobile trace | PASS — LCP 940 ms, TTFB 110 ms, CLS 0.00 |
| Live Trust Lighthouse | FAIL — Accessibility 96 because two light-theme text colors are below 4.5:1; other categories 100 |
| Built-candidate Trust Lighthouse | PASS for Accessibility — 100; the higher-contrast palette is already present in branch source |
| Candidate Best Practices | BOUNDED 92 — localhost-only CSP blocks canonical production favicon/manifest URLs; live route is 100 |
| Production correction | NOT LIVE — Sites v86 remains unchanged |

The production Trust accessibility failure is not hidden by the broader green
automated accessibility matrix. That matrix verifies the branch candidate;
this live Lighthouse pass demonstrates that the older Sites v86 runtime still
needs the already-saved contrast correction published and re-tested.
