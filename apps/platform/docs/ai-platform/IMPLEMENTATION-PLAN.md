# JURO AI platform implementation plan

Updated: 2026-07-29
Status: source reconciliation, control-plane inventory, local Phase 1 foundation, bounded browser baseline, Time Travel and portable-restore drills, protected staging, and the canonical builder checkpoint are verified. Owner-approved Wrangler OAuth applied isolated staging migrations through `0029`; owner-only Cloudflare Access protects `staging.app.juro.uz`; the current Worker deployment `888a4800-daf8-4211-b41d-a653d067ecd8` / version `448e5bf1-4bf8-4000-af2b-2c034e3eca10` at 100% from commit `288af4693d2679b48f016215caaabdcac9aa0fde` has exact staging bindings, a public Turnstile site key, and three server-only secret binding names. Phase 2 identity/workspace and Phase 3 legal-source schema are present, while consumers, schedules, async execution, Advice ingestion, and staff APIs remain disabled. Aggregate D1 shows three provider-accepted and consumed OTP challenges but does not replace a correlated current-version browser/mailbox/session-rotation trace. Identity protection remains expand-safe `legacy` with no protected profile/challenge evidence. Operational RTO, full browser/a11y/performance, live negative-provider tests, and production gates remain open; production changes remain prohibited.

## Execution principles

- Extend the current working system; do not rewrite the document builder.
- Treat `app.juro.uz` Sites v20 revision `4031078` as the preserved runtime baseline and the local `feature/juro-ai-platform` branch as the reconciled integration branch. It includes GitHub `main` through `a1c572e` via merge commit `702960e`. Draft PR #3 tracks that feature branch; `8ab1693` is the base of this Phase 2 checkpoint, while current commit/push state must be read from Git.
- Use additive, expand-contract migrations.
- Prove each vertical slice through type-check, lint, unit/integration/security tests, build, artifact validation, secret scan, and staging smoke.
- Never expose a feature as working when its provider, storage, queue, or authorization path is absent.
- Use feature flags with an honest “Скоро” state for deferred provider-dependent functions.
- Stop before production deployment and migration.

## Phase 0 — audit and safety

Deliverables:

- current-state, route, data-model, security, and design audits;
- decisions log and threat model;
- reproducible baseline;
- GitHub/Sites source reconciliation;
- Cloudflare inventory and independent backup/restore plan.

Gate:

- audits committed;
- production source synchronized to the feature branch;
- no unexplained baseline failures;
- production Cloudflare/Sites identities verified read-only; isolated staging D1/R2/Queue/DLQ/Vectorize resources re-read after scoped creation; absence of a staging Worker, DNS, runtime bindings, secrets, and deployment verified;
- a portable backup/import rehearsal is verified before any further remote schema mutation or any production migration; the consumed D-040 verified-empty staging exception cannot be reused.
- production domain/control-plane ownership ambiguity resolved;
- bounded authenticated browser baseline completed; remaining accessibility, performance, security, and real-device matrix explicitly open until full staging/browser validation.

## Phase 1 — Cloudflare foundation

Order and current state:

1. **Locally verified:** environment-aware `wrangler.jsonc`, including `migrations_dir`;
2. **Locally verified:** generated Worker environment types and freshness check;
3. **Locally verified:** environment-safe binding normalization, artifact validation, and three-environment dry-run matrix;
4. **Locally verified:** additive D1 job/idempotency/operation tables in migration `0011`;
5. **Source-only/disabled:** identifiers-only v2 queue envelope/handler boundary, outbox, idempotency, short leases, and fencing tests; seven producers are declared but consumers/DLQs are absent; only `legal.sync` has a local implementation, and the global runtime kill switch remains false;
6. **Partial/source-only:** scheduled handler is inert with no trigger; locks/run ledgers exist, but reviewed schedules, manual retry, and alerts are pending;
7. **Candidate selected, quality gate open:** official OpenAI and Cloudflare documentation support `text-embedding-3-large` with an explicit reduced `dimensions=1536` and Vectorize `cosine`; no legal ingestion starts until RU/UZ/cross-language retrieval evaluation and citation checks pass;
8. **Locally verified/source-only contract v2:** exact approved R2/Queue/Vectorize bindings replace the older generic source contract without relabeling data classes; legacy remote dev resources remain untouched and no data/binding cutover has occurred;
9. **Provisioned and re-read:** staging D1 `bb716a96-b2fb-4823-90d6-6c228fed181a` has the exact `0000`–`0029` ledger, 109 non-internal tables, and 58 triggers; its migration-specific exports pass private-R2 checksum round trips and a disposable remote restore drill; private dev/staging R2 targets, 28 primary/DLQ queues, and eight empty 1,536/cosine Vectorize indexes exist; protected staging Worker binds staging resources/seven producers while consumers and production Queue/Vectorize/backup/quarantine remain absent;
10. **Partially verified:** redacted structured logs and Analytics binding exist; Time Travel restore/undo passed while staging was empty; ten portable D1 export/restore artifacts are checksum-verified in private staging R2 and the pre-`0029` adapter passed a disposable remote-D1 drill; operational RTO, observability, cost metadata, and live provider execution remain pending;
11. **Validated protected staging:** staging source and artifact disable `workers.dev`, preview URLs, schedules, consumers, async execution, cron execution, and platform-header auth bypass; owner-only Access protects the sole custom domain and anonymous denial is proved. Exact current-version authenticated browser/session-rotation evidence remains open.

Cron for 00:00 Asia/Tashkent is `0 19 * * *` UTC. It will not be configured until the scheduled handler and locking are tested.

Vectorize permits at most 1,536 dimensions and ten indexed metadata properties. The staging candidate uses 1,536 dimensions. All required metadata may be stored, but only a reviewed subset will be indexed; `environment` does not need a filter index when each environment has a physically separate index. Model/dimension/preprocessing/chunking changes require a new index and complete re-embedding.

Gate:

- staging D1 schema bootstrap verified; R2/Queue/Vectorize runtime bindings and smoke remain pending;
- queue retry/DLQ/idempotency tests pass;
- backup and isolated restore pass;
- production unchanged.

The existing Sites project cannot be used as staging: it has no preview URL and every Sites deployment is production. Staging requires a distinct inactive-first Cloudflare Worker followed by a Cloudflare Access-protected custom hostname. `staging.app.juro.uz` currently has no DNS record. The first Worker must be created with Wrangler `deploy` while `workers_dev`, previews, routes, schedules, consumers, async runtime, and cron remain disabled; only a later reviewed step may attach the protected hostname.

## Phase 2 — identity, workspaces, and policies

Local checkpoint only; none of these statements is a staging or production claim:

- workspace invitation acceptance is guarded by migration `0022` and one D1
  batch; concurrent attempts have one winner, an existing owner is not
  downgraded, and audit failure rolls the claim and membership effects back;
- OTP request controls are independent at `5/email/hour` and `20/IP/hour`,
  preserve keyed lookup-version buckets, and avoid treating a missing
  `cf-connecting-ip` value as one shared identity;
- migration `0023` records an immutable 15-minute verification lock when the
  fifth wrong attempt exhausts a challenge and blocks replacement challenges
  for the same email while the lock is active;
- the request route and auth UI integrate Cloudflare Turnstile with the
  `auth_otp` action and exact-host validation; live provider configuration and
  delivery have not been exercised;
- direct OTP and MFA completion use a 24-hour standard session or 30-day
  remember-me session, with the cookie maximum age aligned to the persisted
  absolute expiry; the existing seven-day idle cap still applies. A local
  same-origin/CSRF refresh route and the application shell rotate a due token
  every 12 hours without extending that expiry; the periodic-only 30-second
  in-flight grace rejects the retired token without collateral session/device
  revocation, while strict replay revocation resumes after the grace;
- migration `0024` and the onboarding service require structured names,
  normalized but explicitly unverified phone evidence, personal persona,
  primary goal, and exact current policy digests while deterministically
  preserving or creating one personal workspace;
- canonical RU/UZ auth and onboarding routes exist locally, unauthenticated
  root defaults to Uzbek, registration offers individual/entrepreneur/lawyer,
  and selecting a workspace no longer rewrites the stored persona;
- personal personas keep `/:locale/:accountType/*`; business workspaces use
  `/:locale/business/:workspaceId/*`; shell, builder, workspace switching, and
  invitation acceptance share the workspace-aware route base, while reserved
  legacy business roots remain authenticated compatibility adapters;
- the latest recorded successful local full suite is 353 tests: 27 rendered
  route, 254 core/auth/document, and 72 Cloudflare/migration/job tests.

Vertical slices:

1. atomic OTP + Turnstile + independent rate limits + generic responses;
2. 24h/30d sessions, rotation, device list, one/all revoke, security events;
3. TOTP and one-time recovery codes for privileged roles;
4. old/new email OTP change;
5. localized root/auth/onboarding routes and Uzbek default;
6. individual/entrepreneur/lawyer profiles and business workspace URLs;
7. invitation atomicity and tenant isolation;
8. immutable policy documents and acceptance evidence;
9. deletion/recovery/purge orchestration;
10. disabled platform-staff authorization plus atomic, immutable role
    lifecycle evidence, without operator bootstrap or staff routes.

The two existing document-builder isolation defects are fixed in this phase before staging collaboration use.

Gate:

- local auth/race tests pass and staging schema is through `0029`; live
  Turnstile/Resend and protected staging full-HTTP/session-rotation E2E remain
  required;
- cross-account/workspace leaks: zero;
- privileged access requires 2FA;
- staff assignment/event tables remain empty and the internal role-management
  service remains unreachable until a separately reviewed operator release;
- builder regression remains green.

## Phase 3 — legal knowledge

Local checkpoint:

- migration `0025` additively introduces source versions, sections, chunks,
  sync runs/errors, and a review queue;
- existing source rows receive `verification_state='draft'`, so a legacy
  `status='verified'` value is not trusted automatically;
- verified source/version rows require explicit reviewer/time/SHA-256
  evidence and keep that evidence immutable while verified;
- only one `running` sync may hold a given lock key;
- current AI, comparison, search, and monitoring reads require exact official
  HTTPS host, matching Lex/Advice type, verified state/time, and SHA-256;
- migration `0026` and the service add an idempotent single-page request,
  identifiers-only outbox/`legal.sync` execution, exact URL/redirect/robots/
  timeout/byte/type/encoding gates, a private content-addressed R2 raw object,
  safe failure evidence, and only `fetched`/`pending_review` D1 state;
- each pending version receives an identifiers-only `legal.parse` job; the
  local deterministic parser verifies raw evidence, extracts bounded semantic
  blocks only from explicit primary content, stores a private content-addressed
  normalized JSON snapshot, verifies it again on replay, and cannot promote or
  populate trusted sections/chunks;
- migration `0027` and the review service require a dedicated reviewer,
  active TOTP, fresh MFA, exact R2/hash evidence, one assignee, and immutable
  canonical decision evidence; approval remains non-publishing;
- migration `0028` and the separate publisher require the exact approved
  evidence and another fresh-MFA capability check, revalidate the R2 snapshot,
  and atomically create bounded immutable reading rows plus canonical
  publication evidence while verifying the first source version;
- three protected POST routes connect claim, decision, and publication to the
  services with same-origin/CSRF, local-session, fresh-MFA, capability-first,
  bounded-input, and RU/UZ no-store error handling; their environment flag is
  deliberately false everywhere and no remote route or UI is active;
- global async execution is still false, no Queue consumer is attached, and
  Advice has a separate false policy gate. Successful live fetching,
  real-markup compatibility, reviewed route activation and staff UI,
  replacement-version activation, indexing, hybrid retrieval, citation validation,
  scheduling, and editor UI remain unimplemented or disabled.

Build:

- protected staging execution of the implemented single-page Lex adapter,
  plus a durable host-rate scheduler before positive crawl-delay can be
  supported; Advice activation remains a separate legal/owner gate;
- source/version/section/chunk schema;
- RU/UZ snapshots, hashes, dates, status, historical applicability, and diffs;
- hybrid lexical/semantic retrieval and reranking;
- server-side citation existence/version validator;
- source-sync queue/cron, health, freshness, editor, and review queue;
- protected rule for language priority, pending final legal approval;
- internal JURO materials with explicit non-official labeling.

Gate:

- reproducible source fixtures and sync tests;
- every cited URL exists in the test set;
- source-type classification 100%;
- no fabricated citations.

## Phase 4 — AI lawyer

Build:

- provider-neutral server adapter;
- OpenAI Responses streaming, abort, reconnect, and persisted final messages;
- strict Zod-validated `LegalChatResponse`, bounded repair/retry, typed errors;
- fast/deep and short/detailed modes without silent quality downgrade;
- legal retrieval/citation verification;
- chats, branches, message versions, feedback, plan conversion, case linking;
- entitlement/idempotent usage ledger and cost records;
- constrained memory with sensitive-category exclusions;
- Anthropic fallback with actual provider/model audit;
- guest and free-plan retention/limits;
- transcript-first voice message flow; realtime stays off.

Gate:

- RU/UZ legal evaluation;
- no unverified source in confirmed findings;
- streaming/network recovery and no double charge;
- prompt-injection tests pass.

## Phase 5 — document intelligence

Build:

- server-authorized private R2 multipart upload;
- state machine from initiated to purged;
- MIME/magic/archive controls;
- real malware scanner adapter and quarantine;
- extraction/OCR with per-page confidence and coordinates;
- async queue pipeline;
- Anthropic structured analysis with OpenAI fallback;
- quick/full/expert analysis, comparison, revisions, redline, and exports;
- immutable file/document versions and idempotent jobs.

Gate:

- 100 synthetic/anonymized packages and 30 comparisons;
- scanner and ZIP/SSRF/prompt-injection tests;
- target quality thresholds;
- no provider receives a file before `safe/ready`.

## Phase 6 — cases, plans, deadlines, and builder

Build complete case tabs, task/reminder models, plan versions/diffs, Uzbekistan deadline calculation with auditable source dates, calendar views, chat-to-builder prefill review, temporary unverified templates, builder-to-analysis linkage, immutable versions, and signature evidence packages.

Gate: full case lifecycle E2E, including collaboration, correction, export, close, archive, and restore.

## Phase 7 — lawyers, tariffs, admin, support, and status

Build:

- lawyer profiles/directory/moderation;
- request, anonymized conflict check, user-confirmed grant, revoke, offer, work, and review;
- entitlement service for Free/Individual/Family/Business/Lawyer;
- protected dense admin suite;
- audited support access with mandatory 2FA;
- support tickets/knowledge base;
- privacy-safe analytics;
- status service with truthful component state.

Audio/video and payments remain adapter interfaces behind disabled feature flags until providers are selected.

Gate: handoff, audit, entitlement, support, and privileged-access E2E.

## Phase 8 — design, accessibility, performance, and security

Apply separate passes:

1. audit;
2. normalize;
3. purposeful motion opportunities;
4. animation review;
5. WCAG 2.2 AA and keyboard/focus review;
6. responsive review at 320/360/390/768/1024/1280/1440+;
7. performance measurement and bundle splitting;
8. security/threat remediation;
9. final polish and anti-pattern review.

Gate: no critical accessibility/security findings and measured representative performance within target or a documented blocker.

## Phase 9 — staging beta

- deploy only to isolated staging;
- seed synthetic/anonymized data;
- apply migrations after verified backup;
- execute full automated matrix and manual critical flows;
- run legal/document evaluation;
- inspect queues, D1/R2/Vectorize, logs, costs, and alerts;
- collect closed-beta feedback and repeat.

## Phase 10 — production readiness

Produce:

- final verified feature report;
- exact production resource/migration change set;
- backup and restore evidence;
- rollback rehearsal;
- policy approval checklist;
- residual risks and deferred flags;
- test accounts communicated through a secure channel.

Then stop and request two separate explicit approvals: first for production deployment of the functional AI platform, and separately for replacement of the current production UI with Cinematic Legal Intelligence. Neither approval is implied by staging or by the other approval.

## Current blockers that do not stop local implementation

1. Production is split between Sites (`app.juro.uz`) and the legacy Worker (`admin.juro.uz`), while the Workers Domains API reports overlapping ownership; staging/prod routing changes wait for reconciliation.
2. Production D1 cannot be migrated before production-specific backup and restore rehearsal. Remote production and development each report 61 non-internal tables and applied migrations only through `0004`; isolated staging is through `0029` with portable/private-R2 checksum and disposable remote-D1 restore evidence, but operational RTO/RPO under representative load remains unverified.
3. The exact staging Worker now exposes the public `TURNSTILE_SITE_KEY` binding and server-only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY` binding names; values remain unread and out of source. Aggregate D1 proves three provider-accepted and consumed OTP challenges, but the current-version Turnstile/browser/mailbox trace, provider-failure matrix, and sender/domain evidence remain open. Identity dual-write/backfill also remains a separate gated transition.
4. Owner-only Cloudflare Access and anonymous deny-before-auth are verified for staging; authenticated QA of the latest localized workspace screens plus mobile, zoom, reduced-motion, keyboard, and assistive-technology matrices remains open.
5. Operator legal identity placeholders require owner-supplied approved legal details.
6. Final RU/UZ policies and the legal-language priority rule require legal approval.
7. Malware scanner and audio/video providers require selection only after adapter and privacy/cost evaluation.
8. Live Queue consumers require quarantine/DLQ consumption, alerts, redrive, durable ledger reconciliation, and per-kind producer/handler flags.
9. Side-effecting jobs require provider idempotency or immutable subject-version IDs plus lease renewal/fencing. Consumers remain absent and the global runtime is disabled. Only `legal.sync` has a local handler; every other valid v2 job fails closed as `JOB_HANDLER_NOT_ENABLED`.
10. The Sites deployment pipeline must prove it selects the explicit production build; ordinary `npm run build` intentionally produces development.
11. The Browser bootstrap was recovered through a session-local CommonJS package scope without modifying JURO or the user-home package. Bounded builder viewport evidence exists; keyboard/focus, zoom, reduced-motion, axe, Lighthouse, real-device, and broader critical-route validation remain open.
12. No approved rigged 3D Jurobek asset is present; avatar/voice-with-avatar remains disabled and a static fallback is mandatory.
13. Rotate/revoke the Sites bypass token unexpectedly exposed in read-only connector telemetry before production work.

## Phase 2 checkpoint — privacy-safe login evidence

The local branch now records only keyed IP/UA evidence and coarse Cloudflare
country/region on successful primary and MFA session creation. The 355-test
suite and all local build/artifact/smoke gates pass. This closes the storage
primitive needed for later login-risk policy, but not new-device detection.

Next identity slices remain ordered as follows:

1. add an opaque, server-issued device-continuity cookie and versioned D1 lookup
   evidence without making the cookie an authentication factor;
2. define revoke/re-enrol and concurrent-login semantics with additive migration
   and rollback tests;
3. calculate new-device/new-region novelty only from durable evidence;
4. create a generic encrypted security-notification outbox with one-winner
   idempotency and RU/UZ copy;
5. prove protected staging HTTP and real provider delivery before enabling
   alerts.
## Phase 2 checkpoint — opaque device continuity

The local branch now completes the non-authenticating continuity primitive from
the previous checkpoint. Migration `0031` is additive, the raw token is not
persisted, successful MFA issues it only after factor completion, and revocation
propagates through replay, security-device removal, logout-all, email change and
account deletion. Normal logout intentionally preserves continuity. Local
evidence is 361/361 tests plus passing type-check and lint.

Next ordered work:

1. prepare a new staging D1/R2 checkpoint and disposable restore drill for
   pending migrations `0030` and `0031`;
2. after explicit remote-write approval, push the exact commit, apply only the
   reviewed pending migrations and deploy protected staging;
3. prove primary/MFA cookie issuance, normal logout, remote revoke, logout-all,
   replay and key-rotation behavior through owner-authenticated staging HTTP;
4. implement a conservative new-device/new-region policy over continuity plus
   coarse evidence without treating the cookie as authentication;
5. reuse the encrypted generic security-email boundary with one-winner
   deduplication and prove real Resend delivery before enabling alerts.
## Phase 2 checkpoint — conservative login alerts

The local branch now converts opaque continuity into two deliberately narrow
signals. A missing/unrecognized continuity yields `login_new_device` only after
a successful login; a previously recognized continuity yields
`login_new_region` only when previous/current coarse Cloudflare locations are
both comparable and differ. Registration, User-Agent changes, missing location,
and incomplete location do not create region alerts.

Migration `0032` adds an encrypted, immutable-context notification job while
preserving the email-change table from `0030`. Direct OTP and MFA login enqueue
the job in the same D1 batch as session/device/continuity/audit state, and MFA
does so only after the second factor. The existing identifiers-only Queue
consumer handles legacy and generic jobs with one-winner provider idempotency,
RU/UZ copy, durable retry state, and stale-send recovery. The local suite passes
368 tests; type-check and lint pass.

Next ordered work:

1. obtain explicit remote-write authorization for the exact branch commit;
2. create/checksum a fresh staging D1/R2 checkpoint and repeat the disposable
   restore drill for pending migrations `0030`–`0032`;
3. push the reviewed commits, apply only those pending migrations in order, and
   deploy the protected staging Worker with the single reviewed email consumer;
4. prove primary/MFA login, continuity-cookie, session rollback, outbox,
   retry/DLQ/redrive, safe logs, and real controlled RU/UZ Resend delivery;
5. keep alerts and consumer disabled outside staging until those gates pass.

No remote staging write or production change is claimed by this checkpoint.

## Phase 2 account-deletion staging gate — 2026-07-30

The next authorized staging-only action is the exact migration/deploy/smoke sequence in `DEPLOYMENT.md`. Success does not complete the overall program: AI providers, legal-source sync, document intelligence, file security/OCR, cases/plans, lawyers, tariffs, admin/support/status, cinematic prototype, Jurobek/voice, accessibility/performance matrices, and production readiness remain subsequent gates. Production still requires separate functional and UI confirmations.
