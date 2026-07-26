# JURO AI platform implementation plan

Updated: 2026-07-26  
Status: Phase 0 in progress; production changes prohibited without later explicit approval.

## Execution principles

- Extend the current working system; do not rewrite the document builder.
- Treat `app.juro.uz` production source revision `86843ca` as the implementation baseline until GitHub synchronization is complete.
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
- Cloudflare resource identities verified;
- real backup is verified before any remote schema mutation.

## Phase 1 — Cloudflare foundation

Order:

1. commit environment-aware `wrangler.jsonc`, including `migrations_dir`;
2. generate Worker environment types;
3. implement environment-safe bindings and validation;
4. add D1 job/idempotency/operation tables;
5. implement queue consumers and dead-letter behavior;
6. implement scheduled handler, locks, run records, manual retry, and alerts;
7. select embedding model and dimension from current provider documentation;
8. create only missing development/staging resources after authenticated inventory;
9. add safe observability, redaction, cost metadata, and backups;
10. deploy staging and verify every binding.

Cron for 00:00 Asia/Tashkent is `0 19 * * *` UTC. It will not be configured until the scheduled handler and locking are tested.

Vectorize permits at most ten indexed metadata properties. All required metadata may be stored, but only a reviewed subset will be indexed; `environment` does not need a filter index when each environment has a physically separate index.

Gate:

- staging D1/R2/Queues/Vectorize bindings verified by IDs/names and smoke;
- queue retry/DLQ/idempotency tests pass;
- backup and isolated restore pass;
- production unchanged.

## Phase 2 — identity, workspaces, and policies

Vertical slices:

1. atomic OTP + Turnstile + independent rate limits + generic responses;
2. 24h/30d sessions, rotation, device list, one/all revoke, security events;
3. TOTP and one-time recovery codes for privileged roles;
4. old/new email OTP change;
5. localized root/auth/onboarding routes and Uzbek default;
6. individual/entrepreneur/lawyer profiles and business workspace URLs;
7. invitation atomicity and tenant isolation;
8. immutable policy documents and acceptance evidence;
9. deletion/recovery/purge orchestration.

The two existing document-builder isolation defects are fixed in this phase before staging collaboration use.

Gate:

- auth E2E and race tests pass;
- cross-account/workspace leaks: zero;
- privileged access requires 2FA;
- builder regression remains green.

## Phase 3 — legal knowledge

Build:

- respectful public Advice/Lex fetch adapters with allowlist, rate limits, robots/rules compliance, and manual-review fallback;
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

Then stop and request explicit production approval. No production deploy or migration is included in prior phase authorization.

## Current blockers that do not stop local implementation

1. Wrangler requires safe local Cloudflare authentication before resource inventory or staging creation.
2. Production D1 cannot be migrated before a verified external backup and restore rehearsal.
3. Provider secrets are not verified; they must be entered directly in the provider/Cloudflare secret store, never in chat.
4. Operator legal identity placeholders require owner-supplied approved legal details.
5. Final RU/UZ policies and the legal-language priority rule require legal approval.
6. Malware scanner and audio/video providers require selection only after adapter and privacy/cost evaluation.

