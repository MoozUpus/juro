# JURO AI platform implementation plan

Updated: 2026-07-28
Status: source reconciliation, control-plane inventory, local Phase 1 foundation, bounded authenticated browser baseline, empty-staging Time Travel restore/undo, the one-time verified-empty staging D1 schema bootstrap through `0021`, and an inactive-first staging Worker exposure gate are verified. A local Phase 2 checkpoint includes migrations `0022`–`0024` and the identity/workspace controls below. Phase 3 now has migration `0025` trust evidence, migration `0026` with an exact official-page, robots-aware, bounded acquisition contract, deterministic untrusted normalization, migration `0027` with an MFA-bound immutable legal-review decision contract, and migration `0028` with a separate fresh-MFA publisher, atomic verified-state transition, and immutable reading/publication evidence. Advice and the global async runtime remain disabled. No bulk crawler, protected review/publisher route or UI, replacement-version activation, Vectorize retrieval, citation validator, Cron, editor, or remote legal-source activation is claimed. Portable backup/import, remote migrations `0022`–`0028`, live providers, full browser/a11y/performance, explicit owner approval for Wrangler authentication, Worker upload/DNS, runtime bindings, consumers, secrets, and protected-hostname gates remain open; production changes remain prohibited.

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
9. **Partially provisioned and re-read:** staging D1 `bb716a96-b2fb-4823-90d6-6c228fed181a` is schema-bootstrapped through the exact `0000`–`0021` ledger with quick check `ok`, zero FK violations, 98 tables including `d1_migrations`, and 275 schema objects; six empty private EEUR Standard dev/staging R2 targets, 28 unbound primary/DLQ queues, and eight empty 1,536/cosine Vectorize indexes exist; staging Worker/DNS/bindings/consumers and production Queue/Vectorize/backup/quarantine remain absent;
10. **Partial/source-only:** redacted structured logs and Analytics binding exist; the Time Travel restore/undo passed while staging was empty, and the narrow D-040 bootstrap exception is consumed; portable export retrieval, protected backup object, isolated import, RTO, remote observability, cost metadata, and provider/secrets configuration remain pending;
11. **Locally verified/remote blocked:** staging source and artifact disable `workers.dev`, preview URLs, and routes and reject schedules, consumers, async execution, cron execution, and platform-header auth bypass; the first inactive Worker upload is blocked on approved local Wrangler authentication, and no hostname may be attached until Cloudflare Access denial is proved.

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
  absolute expiry; the existing seven-day idle cap still applies;
- migration `0024` and the onboarding service require structured names,
  normalized but explicitly unverified phone evidence, personal persona,
  primary goal, and exact current policy digests while deterministically
  preserving or creating one personal workspace;
- canonical RU/UZ auth and onboarding routes exist locally, unauthenticated
  root defaults to Uzbek, registration offers individual/entrepreneur/lawyer,
  and selecting a workspace no longer rewrites the stored persona;
- the latest recorded successful local full suite is 326 tests: 25 rendered
  route, 234 core, and 67 Cloudflare tests.

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

- local auth/race tests pass; remote migrations `0022`–`0028`, live
  Turnstile/Resend, and protected staging full-HTTP E2E remain required;
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
- global async execution is still false, no Queue consumer is attached, and
  Advice has a separate false policy gate. Successful live fetching,
  real-markup compatibility, protected review/publisher entry points,
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
2. Production D1 cannot be migrated before a verified external backup and restore rehearsal. Remote production and development each report 61 non-internal tables and applied migrations only through `0004`; isolated staging is through `0021`; migrations `0022`–`0028` are local-only.
3. Provider and security secrets are absent by name except `RESEND_API_KEY`; `TURNSTILE_SECRET_KEY` and the environment-specific public `TURNSTILE_SITE_KEY` are not configured on the inspected surfaces. Required values must be entered directly in the Cloudflare/provider controls, never in chat. Real Turnstile and Resend delivery are unverified.
4. Operator legal identity placeholders require owner-supplied approved legal details.
5. Final RU/UZ policies and the legal-language priority rule require legal approval.
6. Malware scanner and audio/video providers require selection only after adapter and privacy/cost evaluation.
7. Live Queue consumers require quarantine/DLQ consumption, alerts, redrive, durable ledger reconciliation, and per-kind producer/handler flags.
8. Side-effecting jobs require provider idempotency or immutable subject-version IDs plus lease renewal/fencing. Consumers remain absent and the global runtime is disabled. Only `legal.sync` has a local handler; every other valid v2 job fails closed as `JOB_HANDLER_NOT_ENABLED`.
9. The Sites deployment pipeline must prove it selects the explicit production build; ordinary `npm run build` intentionally produces development.
10. The Browser bootstrap was recovered through a session-local CommonJS package scope without modifying JURO or the user-home package. Bounded builder viewport evidence exists; keyboard/focus, zoom, reduced-motion, axe, Lighthouse, real-device, and broader critical-route validation remain open.
11. No approved rigged 3D Jurobek asset is present; avatar/voice-with-avatar remains disabled and a static fallback is mandatory.
12. Rotate/revoke the Sites bypass token unexpectedly exposed in read-only connector telemetry before production work.
