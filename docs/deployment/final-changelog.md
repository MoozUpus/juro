# Changelog — ecosystem audit release through 2026-08-29

## Current operational verification

- After the owner reported another Anthropic account top-up, the fresh
  production status snapshot generated at `2026-08-29T11:14:32.854Z` remained
  operational with no active incident. Anthropic passed its content-free probe
  at `11:10:56.708Z` in 4,810 ms with no safe error; OpenAI passed at
  `11:10:51.650Z`, and document analysis remained operational at
  `10:56:05.105Z`. This was a read-only recovery verification, not a release.

## Prepared in Draft PR, not shipped

- Candidate `d7b77ec1` localizes consultation times in every calendar view
  instead of forcing a Russian formatter on UZ routes. The shared formatter
  retains `Asia/Tashkent`; focused 18/18, rendered Worker 36/36, type-check,
  lint and production artifact validation pass with unchanged budgets.

- Candidate `244b2e40` keeps auth language changes and protected destinations
  in the same RU/UZ locale. It covers `returnTo` and legacy `return_to`, removes
  external targets and leaves OTP/MFA/session/role rules unchanged. Focused
  auth/routing/accessibility tests pass 26/26; rendered Worker passes 36/36;
  type-check, lint and production artifact validation pass.

- Candidate `942ff677` defers six state-specific Document Builder panels and
  keeps a visible status fallback while their chunks load. The largest lazy
  route increment fell from 208.1 to 175.5 KiB emitted raw JS (32.6 KiB / 15.7%).
  Focused 60/60, core 1139/1139, Cloudflare/infrastructure 203/203, rendered
  Worker 35/35, type-check, lint and production artifact validation passed.
  Authenticated Chrome coverage remains unclaimed because the available real
  session redirects this private route to login.

- Added a fresh-MFA protected RU/UZ product KPI dashboard and no-store aggregate
  API for mature activation, TTFV, plan completion and lawyer-request acceptance.
- Candidate `8602e4101e2a61089ac7e5a66a13c6916abd1044` extends it with
  privacy-suppressed 7-day engaged return and first-directory-view to request
  conversion. Return requires an explicit action on a later UTC day; background
  session refresh and passive reads do not count.
- The computation stays inside D1 and returns no user identifiers or content.
  Legal-eval, investor-demo and active-staff cohorts are excluded; rates/TTFV
  suppress below five observations and comparable readiness begins at 30.
- Migration `0164_lawyer_directory_daily_visits.sql` stores one content-free
  internal observation per user/day with first/last timestamps. Repeated views
  cannot move the first-view cohort, and account purge deletes the actor's rows
  without touching another user.
- Candidate `c0f9c372` adds the exact first-question → validated answer →
  authorized source-open funnel. Migration `0165_ai_answer_source_opens.sql`
  stores one content-free row per actor/answer, rejects cross-owner evidence,
  deduplicates repeat opens, and is included in account purge.
- Candidate `3101525c12dd53171494515e0c9668859b92408c` adds a 30-day
  user-reported error aggregate from existing durable feedback. One retained
  type per answer counts once; comments, answers, source URLs and actor IDs are
  not read or returned, and `outdated` remains only a report signal.
- Candidate `e452b3ae40d53d55e4726cf05ee9280d7b6fb855` adds actor-level
  lawyer escalation after the first-ever qualifying grounded answer, completed
  analysis or case creation. The mature 37-to-7-day cohort has a complete
  request window; only a same-actor request within seven days converts, and
  repeat outcomes cannot move or multiply the cohort.
- Candidate `1a52d9cc` adds mature signup-to-case creation. A user contributes
  once when at least one case is created at or after completed onboarding and
  within seven days; cases outside the window and excluded cohorts do not count.
- Focused KPI tests pass 5/5 and the combined KPI/purge run passes 15/15; the
  full local gate passes core 1138/1138,
  Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint and
  artifact validation; Worker entry is 3724.1/6144.0 KiB. Local Chrome verifies
  the RU/UZ protected boundary at desktop and 390 px with noindex, exact re-auth return path, no
  overflow and no warning/error log; no staff identity was fabricated.
- A read-only production replay read 230 rows and wrote zero: 10 eligible, two
  activated (20.0%), with TTFV and workflow rates correctly suppressed because
  their samples are too small.
- A separate engaged-return replay read 417 rows and wrote zero: 9 eligible,
  2 activated and 0 returning. Its rate remains hidden below the five-activation
  disclosure floor. Browse conversion awaits migration, Worker and observation;
  the 13 old view occurrences are not treated as unique visitors.
- A new read-only replay at `2026-08-29T12:18:22.659Z` read 2,142 rows and
  wrote zero: 5 first-question actors and 0 validated source-backed completions.
  A 313-row diagnostic confirmed exact completed structured responses for all
  five, but zero passed the strict validated-source contract. Production has no
  0165 table, so no source-open actor rate is claimed.
- The feedback replay at `2026-08-29T12:49:08.640Z` read four rows and wrote
  zero. It found no retained feedback types in the 30-day window, so the rate
  remains `NO DATA`; this is not evidence of error-free use.
- The lawyer-escalation replay at `2026-08-29T13:13:11.194Z` read 272 rows
  and wrote zero. It found three eligible actors and zero escalating actors,
  with first outcomes split 1 grounded answer / 1 completed analysis / 1 case.
  The denominator is below five, so no 0.0% rate is disclosed.
- The case-creation replay at `2026-08-29T13:42:05.963Z` read 105 rows and
  wrote zero. It found 2 of 10 eligible signups creating a case within seven
  days (20.0%); the result is below the 30-signup comparison gate.
- Migrations 0164/0165 remain outside the production pattern. No production release,
  D1 row write, DNS, notification or customer-data mutation occurred; product-
  market-fit evidence remains unverified.

- Candidate `c7c6d35e` compacts authenticated legal-chat history without a new
  model call or migration: the latest three branch-local turns remain recent,
  up to five redacted older turns become deterministic summaries, and the
  remainder are explicitly omitted.
- Follow-up rewriting, planning, OpenAI and Anthropic share the compact context;
  current verified sources still govern legal grounding. Metrics retain only
  counts and serialized character totals, not prompts, summaries or answers.
- The legal-chat prompt identity is now `juro-legal-chat-v3-compact-context`,
  with an exact source-backed v1 → v2 → v3 chain.
- Focused 20/20, core 1129/1129, Cloudflare/infrastructure 203/203, rendered
  Worker 35/35, type-check, lint and production artifact validation passed.
  Worker entry is 3656.7/6144.0 KiB and all emitted budgets remain within limits.
- One synthetic 12-turn fixture reduced serialized characters from 15,931 to
  6,155 (61.36%). This is not provider token, billing, latency, answer-quality
  or production-cost evidence; the 30% target remains `UNVERIFIED`.
- No Worker/Sites publish, migration, DNS, notification or customer-data
  mutation occurred. Production remains Worker 170 and Sites v86.

- Candidate `d1da89a1` adds explicit five-minute Anthropic prompt caching for
  the static system-instruction block only. Questions, history, memory, sources
  and documents stay in an unmarked user message.
- Anthropic uncached, cache-read and cache-write input counters are normalized
  to total input while read/write evidence remains separate. Five-minute writes
  use the documented 1.25x input-rate multiplier with integer cost arithmetic.
- Migration `0163_anthropic_prompt_cache_accounting.sql` adds only default-zero
  token counters to immutable events/daily aggregates; Admin shows write-token
  volume and the user-content exclusion in RU/UZ.
- Focused cost 8/8 and Anthropic/document-provider 15/15, full core 1128/1128,
  Cloudflare/infrastructure 203/203, rendered Worker 35/35, development build,
  type-check, lint and production artifact validation passed; the Worker entry
  is 3652.5/6144.0 KiB and every emitted-asset budget is within its limit.
  Migration 0163 is excluded from production configuration; no remote
  migration, Worker/Sites publish, DNS, notification or customer-data mutation
  occurred. Real cache benefit and the 30% reduction target remain unverified.

- Candidate `f312a930` adds immutable per-user and per-feature daily/monthly AI
  budgets with operator-selected `alert_only`, `disable_deep`, or `block_calls`
  enforcement. No monetary threshold is seeded.
- Migration `0162_scoped_ai_cost_budgets.sql` adds versioned policy, immutable
  threshold-event and idempotent alert-delivery evidence. UTC periods and
  technical identifiers are used; prompt, answer, document, filename, email
  and phone fields are excluded.
- Authenticated/guest chat, document analysis, and private-document
  indexing/search check applicable policies before provider work. The internal
  legal-corpus ingestion path was deliberately not changed.
- Unpriced success creates a warning without fabricated cost and is not treated
  as a monetary-limit breach. The request-boundary control may still overshoot
  under concurrent in-flight calls and is not a provider billing hard cap.
- Focused 3/3, full core 1127/1127, Cloudflare 203/203, rendered Worker 35/35,
  type-check, lint, migration integrity and production artifact gates passed.
- Migration 0162 remains excluded from production deployment configuration.
  No policy, threshold, migration, Worker/Sites publish, DNS, email,
  notification or customer-data mutation was made, and the 30% reduction
  target remains `UNVERIFIED`.
- Candidate `a08698df` adds content-free Admin AI-cost breakdowns by technical
  user/workspace and current subscription plan, plus provider failure rate,
  average provider latency, cache-hit request rate, cached-input token share,
  Deep escalation and provider fallback.
- RU/UZ copy states that plan attribution is a current read-time workspace
  snapshot, not historical event-time truth. Deep/fallback denominators include
  only completed authenticated legal-chat runs and exclude guest AI/document
  analysis.
- Local gates passed focused 6/6, core 1124/1124,
  Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check,
  lint and production artifact validation. No new migration or content field
  was added; no real Admin/MFA browser session was available.
- The candidate does not change the last verified 4/30 production cost sample
  or prove the 30% reduction target. It is not deployed and made no Worker,
  Sites, D1, DNS, notification or customer-data mutation.
- Candidate `9eee8d54` centralizes the current authenticated-chat, guest-chat
  and document-analysis prompt identities. Persisted run hashes and protected
  Admin now share the registry; Admin exposes version IDs and real cost,
  quality, emergency-control and provider-health links without exposing prompt
  text or secrets.
- RU/UZ Admin copy states that no A/B prompt experiment is active and requires
  matched quality, cost and source evaluation before a variant.
- Follow-up `2a57cc88` adds four source-backed release records: the three
  current identities and superseded legal-chat v1, with introduction dates,
  exact GitHub commits and the v1-to-v2 replacement. This is code-owned git
  history, not a mutable D1 prompt-history ledger.
- Local gates passed focused 9/9, core 1123/1123,
  Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check,
  lint and production artifact validation. No real Admin/MFA browser session
  was available, so signed-in verification is not claimed.
- Candidate `6bb8d607` makes protected Admin AI settings expose the actual
  Fast/Balanced/Deep runtime mapping. Execution, run reservation, fallback and
  the localized operator summary use the same contract; the cards show the
  primary/fallback models, Balanced default, reasoning effort, bounded time and
  output controls, and shared 30-second deadline. History now records chat,
  Deep and Anthropic fallback models.
- Local gates passed focused 6/6, core 1114/1114,
  Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check,
  lint and artifact validation. The CSS budget passed at 596.6/600.0 KiB with
  only 3.4 KiB remaining. No real Admin/MFA browser session was available, so
  signed-in Admin UI verification is not claimed.
- Candidate `1ed17501` adds explicit Fast, Balanced and Deep legal-AI modes,
  with Balanced as the default for omitted or unknown client input. Balanced
  keeps the normal chat model and medium reasoning; Deep alone selects the
  configured deep model/high reasoning profile. Existing bounded Anthropic
  fallback eligibility is preserved rather than expanded into an unbounded
  primary path.
- The candidate adds migration `0161_balanced_ai_reasoning_mode.sql` so D1
  telemetry can record all three modes while preserving existing rows and
  restoring append-only guards. The migration has not been applied anywhere
  in production.
- Local gates passed focused 8/8, core 1114/1114,
  Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check,
  lint and production artifact validation. Exact-source CI `33230331239`
  passed `1ed17501`: Website 3m32s and Platform 8m45s.
- Isolated local Chrome verified the exact RU/UZ labels, Balanced default,
  mode switching, 1024/700/390/320 px layout, 44 px targets, zero horizontal
  overflow and no console warning/error. No real Lawyer/Admin identity was
  used and this is not production evidence.
- Security scan `aacf0487-aae5-4c8f-a527-8f3efc70cb76` reported 0 Critical,
  0 High and 6 validated Medium findings on immutable source `3a30042c`.
- Candidate `695693f3` closes workspace editor-role enforcement, hidden
  collaborator attachment access, stale lawyer grants, Builder upload
  quarantine, DOCX expansion limits and guest-AI cost controls/accounting.
- Evidence HEAD `1ee3047b` passed 774/774 selected non-legislation tests,
  rendered Worker HTML 35/35, local release gates and exact-source CI
  `33227714329` (Website 3m50s, Platform 8m14s).
- The candidate is not deployed. It changes no production Worker, Sites, DNS,
  D1, notifications or customer data.

## Shipped to production

- Platform Worker 170 (`8a51f26c-2011-4ea0-a8f9-2e5a80316ce6`), deployment
  `8dc989ba-014b-4a40-87e5-d017d8a4488e`, is at 100% traffic; Worker 169 is
  the immediate rollback.
- Worker 170 makes the Client global-search ARIA reference conditional on the
  dialog being present, raises explicit 10–11 px Client shell/search/dashboard
  labels to 12 px and leaves exactly one accessible mobile-menu close control.
- Final-source CI `33208687185` passed `31ca2160`: Website 1m57s and Platform
  8m57s, including core 1107/1107, Cloudflare/infrastructure 203/203 and all
  emitted-byte budgets. Authenticated Chrome passed the 390/320 px, search
  focus, mobile menu, skip-link and visible-focus replays without console
  warnings/errors or private-data mutation.
- A first post-release `SCANNER_UNAVAILABLE` status was retained as evidence;
  the next scheduled probe recovered without intervention. At
  `2026-08-28T20:51:55.490Z`, both status APIs agreed on 8/8 operational and
  zero incidents, with Anthropic operational. No D1/migration, DNS,
  notification or Sites change was made; Sites v86 remains live.
- Platform Worker 168 (`9cbfccd2-ec57-4839-9209-061d216ec1b3`), deployment
  `eae00573-f828-446d-8780-415603e4eced`, is at 100% traffic; Worker 167 is
  the immediate rollback.
- Worker 168 restores a visible shared-color focus outline to the labelled
  Client dashboard AI-composer textarea. The Worker 167 keyboard baseline had
  `:focus-visible` but no outline, border or shadow; the same production
  Tab/Enter/Tab path now visibly focuses the field after skip-link transfer to
  `main#main-content`, without horizontal overflow.
- Exact CI `33195687549` passed source `0791a088`: Website 2m12s and Platform
  8m44s. Public health was 8/8 operational with no incident, and the route
  matrix retained its public/login/protected boundaries. No migration,
  D1/notification mutation, DNS or Sites change was made; Sites v86 remains
  live.
- Platform Worker 167 (`b67a2ed8-74f8-4d62-968e-87bff9d3e4dc`), deployment
  `7f1431fd-3e89-491d-aacc-f1c630ca020e`, is at 100% traffic; Worker 166 is
  the immediate rollback.
- Worker 167 removes the obsolete 620 px Client auth pseudo-element and reserves
  the real 72 px Turnstile height on authenticated and guest login surfaces.
  The separate Lawyer decoration is unchanged.
- A cold live baseline failed at CLS 0.2779. The released production page,
  measured in a new isolated Chrome context without CSS overrides, recorded
  CLS 0.0462 over 15 seconds and LCP on the `H2` at 2,680 ms. The page had no
  horizontal overflow.
- Exact CI `33192562472` passed source `4eba97ce`: Website 2m14s and Platform
  6m54s. Post-release routing remained private and role-correct; public health
  was 8/8 operational with OpenAI and Anthropic operational and no incidents.
  No migration, D1/notification mutation, DNS or Sites change was made.
- Platform Worker 166 (`4bd03261-df05-4e5b-9f91-66bd6d8cfdcd`), deployment
  `3579b110-a09d-4f53-8563-34ec0d2d5c4e`, was the prior production release and
  is now the immediate rollback.
- Worker 166 gives Analytics Engine a stable privacy-safe first-six dimension
  contract and records only bounded support/feedback classifications. Feedback
  comments, legal questions, chat/document content and personal data are not
  added to analytics.
- A read-only production snapshot contained 24 represented events with no
  sampling. It is too sparse and lacks privacy-safe cohort linkage: activation,
  return, drop-off and conversion remain `UNVERIFIED`, and event occurrences
  are not promoted to unique people.
- Exact CI `33187593245` passed release source `14ecae9a`: Website 2m05s and
  Platform 9m21s. Local gates passed focused 83/83, core 1106/1106,
  Cloudflare/infrastructure 203/203, lint, type-check and production artifact
  validation.
- Post-release route/auth boundaries passed. Public health was 8/8 operational
  with zero incidents, including operational OpenAI, Anthropic and document
  analysis evidence. The cost sample remains 4/30 and the 30% reduction target
  remains `UNVERIFIED`. No migration, D1/notification mutation, DNS or Sites
  change was made; Sites v86 remains live.
- Platform Worker 165 (`a75c0337-da48-49fd-8adf-6a721fb24088`), deployment
  `ee0465b5-fb83-4ebb-87a5-3b40b0be7f83`, is at 100% traffic; Worker 164 is
  the immediate rollback.
- Worker 165 adds an Admin-only AI cost measurement gate: pricing coverage,
  priced-sample progress, estimated cost per successful call and fail-honest
  readiness states. Missing automatic cost-guard policies are now explicitly
  shown as not configured instead of appearing healthy.
- Production currently has 4/4 priced successes, two zero-token failures,
  `$0.104549` estimated cost and a 4/30 sample. The 30% reduction target remains
  `UNVERIFIED`; no arbitrary production budget threshold was created.
- Exact CI `33169181945` passed commit `6af3cff4`: Website 1m46s and Platform
  8m57s. Local gates passed focused 4/4, core 1106/1106,
  Cloudflare/infrastructure 203/203, lint, type-check and production artifact
  validation.
- Post-release assets and seven HTTP boundaries passed. Isolated Chrome reached
  the protected Admin re-auth surface with no warning/error logs. Public health
  was 8/8 operational with no incident; Anthropic retained fresh operational
  probe evidence. No migration, DNS or Sites change was made; Sites v86 remains
  live.
- Platform Worker 164 (`3ba45422-86e9-4502-8ad2-8468bec57a78`), deployment
  `46613e55-f973-4199-a825-e2c576ac63e1`, is at 100% traffic; Worker 163
  (`e7c8ec49-bba6-4abd-ac00-89bfd1cd4acd`) is the immediate rollback.
- Worker 164 adds a dedicated monitoring-email job/outbox path with
  identifiers-only queue messages, delivery-time identity/preference/source
  checks, safe cancellation and stable Resend idempotency. RU/UZ messages link
  only to official Lex.uz and do not claim to be legal conclusions.
- Production migration `0160_monitoring_email_delivery.sql` was applied after a
  verified 232,377,843-byte full backup was uploaded to private R2 and verified
  by download, SHA-256 match and a second isolated restore. The postflight found
  the table, four indexes, four triggers, zero FK violations and no pending
  migration.
- Two post-release scheduler runs completed without historical replay: all four
  cursors, the 222,329 legislation-monitor notification total/max and the 19
  dispatched legacy email outbox rows remained stable; monitoring-email jobs
  remained zero. No customer email was forced without a new qualifying Lex
  event.
- Exact CI `33164955029` passed Worker 164 source `52f579ca`: Website 2m09s and
  Platform 8m53s. Local gates passed focused 149/149, core 1105/1105,
  Cloudflare/infrastructure 203/203, lint, type-check and artifact validation.
- The six-host matrix and `/api/status` returned 200 with operational status.
  Authenticated Chrome confirmed RU/UZ monitoring copy and the original Lawyer
  dashboard URL redirecting to the rendered app dashboard, not `Not Found`.
  Sites v86 was not changed; staging migrations 0142-0160 were intentionally
  left untouched under the legal-corpus/database exclusion.
- Worker 163 previously made `immediate`, `daily` and `weekly` monitoring
  preferences operational through the existing scheduler. It initializes
  legacy cursors without replaying history, batches digest creation with cursor
  advance and uses deterministic retry-safe IDs. Monitoring email remains
  visibly and truthfully unavailable in that rollback version.
- The first production cadence run initialized all four existing preference
  cursors. A second completed run left the cursors and historical
  legislation-monitor total/max unchanged at 222,329 /
  `2026-08-28T06:40:50.995Z`. No notification was deleted or marked read.
- Exact CI `33152530994` passed Worker 163 source `810432ea`: Website 2m41s and
  Platform 6m58s. Full local gates passed rendered 35/35, core 1104/1104,
  Cloudflare/infrastructure 202/202, lint, type-check and artifact validation.
- The post-release six-host matrix plus `/api/status` returned 200.
  Authenticated Chrome confirmed RU/UZ monitoring cadence and the original
  Lawyer-host dashboard URL redirecting to the rendered app dashboard instead
  of plaintext `Not Found`.
- Platform Worker 162 (`d2146684-bd77-4a33-a2a2-8d47042e473e`), deployment
  `0c8ec9f3-cd7f-4a0c-9e99-e0b1d91fc998`, is at 100% traffic; Worker 161
  (`34c54357-0878-4637-b533-1fa1afa36336`) is the immediate rollback.
- Worker 162 stabilizes Lex monitoring fingerprints, batches metadata/event
  writes, emits one retry-safe digest per recipient and bounds the dashboard
  unread count at `99+`. Its first production retry processed 40/40 with zero
  changes/errors and no notification growth; authenticated Chrome confirmed the
  bounded UI. Historical notification rows and read state were preserved.
- Anthropic credit recovery was confirmed by a fresh production synthetic
  probe, and both public status APIs agreed on 8/8 operational at
  `2026-08-28T06:49:05.922Z`.
- Exact CI `33148425519` passed Worker 162 source `75064bee`: Website 2m15s and
  Platform 6m57s, including rendered 35/35, core 1101/1101,
  Cloudflare/infrastructure 202/202 and deployable artifact validation.
- Platform Worker 155 (`eb132328-68c2-48f3-95d4-90cac0962119`), deployment
  `24e52e75-c687-4d12-9b9c-3f9c7d3e0cd4`, was an earlier checkpoint; Worker
  154 (`3efdad51-d6c1-47f0-ad5b-fb24cd2adc99`) was its rollback.
- Worker 153 shipped the auth error-association contract. Worker 154 localized
  RU/UZ status document metadata. Worker 155 makes root icon metadata use the
  actual allow-listed JURO host, removing the status favicon CSP violation
  without adding a CSP exception.
- Exact CI `33129369444` passed Website in 2m30s and Platform in 6m48s. Final
  local gates passed rendered HTML 35/35, core 1095/1095 and
  Cloudflare/infrastructure 201/201.
- Chrome verified both production status locales, same-origin favicon/Apple
  icon delivery, private noindex, loaded fonts, no overflow and an empty status
  console. Health was 8/8 operational with no incident at
  `2026-08-28T00:30:50.972Z`. No migration or D1 write was part of this release.
- Sites version 86 remains live. Saved Sites version 94 remains unpublished and
  requires separate action-time approval.

- Public website Sites v86 is live from runtime commit `286c8cec`; deployment
  `appgdep_6a9027658100819189e6e6bc1a20bf1d`; Sites v85 is the immediate
  public rollback.
- Earlier Worker 147 (`ed0253e1-1c35-416e-9f2a-5bd8352c1936`), deployment
  `6f536ee9-9666-41bb-b0f3-6f174019692b`, shipped the font-path correction;
  the Worker 155 checkpoint above supersedes it as the active release.
- Generated vinext font URLs no longer expose absolute Windows build-machine
  paths. Production now emits `/assets/_vinext_fonts/...`, and the build gate
  rejects future `C:/Users/` or `.vinext/fonts` regressions.

- All JURO subdomains now redirect HTTP to the exact HTTPS URL with status 308
  before application or host routing.
- Standalone signed-PDF share verification now has a durable per-share
  five-attempt/15-minute lockout with `Retry-After` and atomic success cleanup.
- New standalone share tokens and access codes are AES-GCM protected with the
  existing identity keyring. Hashes remain lookup/comparison boundaries;
  plaintext columns remain empty for protected rows.
- D1 guards reject partial encryption metadata and mixed
  plaintext-plus-ciphertext states.
- Migration `0159_signed_share_verification_guard.sql` was applied after a
  verified pre-backup and followed by a verified post-backup.
- Platform production Worker advanced from rollback version
  `f91406c2-903b-438f-bafb-01a64f5af2b7` to
  `357d0438-1a5f-4b29-ba81-869cbc130c0a`.
- Public website dependency resolution now pins PostCSS `8.5.23` and Sharp
  `0.35.3`; production `npm audit` reports zero vulnerabilities.
- The earlier 2026-08-25 Sites version 82 checkpoint deployed exact 121-file
  source from `d0310b90`; version 81 was its rollback. At that checkpoint the
  Platform Worker remained version 146 because the follow-up did not change
  `apps/platform`.
- Zone origin encryption now uses explicit Cloudflare `Full (strict)` instead
  of automatic `Full`; the prior `Full` setting is the control-plane rollback.

## Verification

- Worker 147: focused font-normalizer tests 3/3, production build/dry-run,
  artifact validation, performance budgets, lint, type-check and GitHub CI
  `33063995387` passed. Production HTML has zero absolute path matches; sampled
  normalized fonts return `200 font/woff2`; Chrome Status and authenticated
  Client smoke completed with loaded fonts and empty warning/error logs.
- Post-deploy host smoke retained expected Client login redirects and private
  API `401`, Lawyer persona, Admin protected handoff, Status `200`, Status route
  fence `404`, 8/8 operational health and zero active incidents. Error-only
  Worker tail was empty during the smoke window.
- Sites v85: 78/78 sitemap URLs returned `200`; SEO and Accessibility were 100,
  LCP 777 ms and CLS 0 in the recorded unthrottled production trace. Website
  and Platform jobs passed in CI run `33063833408`.

- Local: rendered 34/34, core 1083/1083 and Cloudflare 201/201; lint,
  type-check, production build/artifact and migration safety passed.
- GitHub: CI run `32816221498` completed successfully for Website and Platform.
- Production: migration ledger empty, D1 foreign-key violations zero, four-host
  HTTPS enforcement passed, signed-share unknown-token fail-closed passed and
  public status was operational.
- Security: immutable whole-repository Standard scan
  `df6f1247-116c-42b8-b233-a693efb52263` closed 8/8 planned surfaces with zero
  reportable findings and explicit PARTIAL coverage. Exact hardening diff scan
  `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero findings.
- Public hardening release: GitHub CI `32829635485` passed Website and Platform;
  42/42 local website tests, types, lint, 716-package licence policy and
  deployable artifact passed; production crawl returned 78/78 exact canonical
  URLs and status remained operational 8/8.
- SEO closure release: GitHub CI `32836146215` passed Website and Platform on
  `ee0687af`; 43/43 website tests and exact diff scan
  `fa1b3e34-235b-48e6-8fb4-41e9f731f210` passed. The expanded production
  crawl returned 78/78 exact canonical URLs, complete RU/UZ/EN hreflang,
  explicit Open Graph titles and expected indexability.
- Social-preview closure: GitHub CI `32838994132` and exact diff scan
  `1985bd83-d685-4ae3-8978-60f4f469d1e7` passed. Version 82 added the existing
  neutral JURO image to the 61 routes that lacked one; the final crawl returned
  78/78 complete Open Graph and Twitter preview contracts.
- TLS hardening: Sites reported active apex SSL, the four application hosts are
  Worker Custom Domains, and post-change probes passed all six production and
  three protected-staging HTTPS boundaries without a `526`; status remained
  operational 8/8 with no active incident at `2026-08-25T11:25:16.533Z`.
- Managed WAF verification: Cloudflare Security Settings showed the Free
  Managed Ruleset checked and `Always active`; its viewer listed 31 blocking
  rules. The scoped public-analytics rate limit remains active. No arbitrary
  custom rule was added merely to change the 0/5 custom-rule count.

## Not represented as complete

Lighthouse/Core Web Vitals, full manual keyboard accessibility, physical-device
QA and every authenticated write path were not re-run for this commit. Earlier
investor-ready evidence remains relevant, but these narrower gaps retain their
explicit status in the audit and QA documents.
