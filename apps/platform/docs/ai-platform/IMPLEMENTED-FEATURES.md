# JURO implemented-features checkpoint
> Current branch delta — 2026-07-31: legal chat and document analysis now reject duplicate, missing, citation-free, provider-invented, or referentially incomplete legal sources at provider and persistence boundaries. Provider-authored source metadata is replaced with the canonical server-retrieved record. Invalid output fails as `INVALID_AI_OUTPUT`. The slice has no migration/dependency and is locally verified; staging deployment is not yet claimed.

> Current staging delta — 2026-07-31: the AI and document-analysis paths share an exact publication-evidence retrieval boundary and a dual-corpus freshness gate. Missing full Lex/Advice corpus evidence fails closed; stale evidence is explicitly downgraded in RU/UZ. Tampered publication, lifecycle, section, effective-date, and expiry evidence is rejected. The slice is deployed only to owner-protected staging as version `37687899-f17a-4bdf-9f9c-41c6b509cfb9`; it adds no migration/dependency and does not change production.


> Current Phase 3 staging delta — 2026-07-31: exact Advice RU and Uzbek-Latin source submission, robots-aware serial acquisition, private content-addressed raw/normalized R2 evidence, deterministic Advice-primary parsing, low-confidence manual review, idempotent outbox/Queue execution, and RU/UZ staff submission UI are implemented and deployed only to protected staging. Nothing is automatically verified, published, indexed, or used by AI. Evidence: `STAGING-0038-ADVICE-EVIDENCE.md`.

Updated: 2026-07-30
Scope: verified local source/tests plus the protected staging deployment described below. Production remains separate and unchanged.

## Phase 2 identity and workspace slices

| Slice | Locally implemented and tested | Not yet proved |
|---|---|---|
| Business workspace creation | Strict 2 KiB RU/UZ payload; normalized full/short identity; UUID idempotency; authenticated same-origin/CSRF boundary; one D1 batch for workspace, owner membership, active selection, and audit; exact retry; cross-user/mismatch denial; staging migration `0034` legacy backfill and DB guards; responsive inline settings form; authenticated creation, D1 audit/FK, and canonical personal/business browser evidence | Cross-account remote HTTP proof and broader tenant-domain isolation |
| Workspace invitation acceptance | Strict bounded RU/UZ input; exact token/identity binding; staging migration `0022` unique immutable claim; one D1 batch for claim, membership, default-workspace, and audit; one winner under concurrency; existing owner role preserved; rollback on audit failure; business redirect contains the accepted `workspaceId` | Protected staging HTTP/concurrency flow and broader append-only workspace audit |
| OTP request limits | Separate `5/email/hour` and `20/IP/hour` gates; retained lookup-key versions share buckets; invalidated provider failures count toward email limits; missing connecting IP does not merge unrelated users; 60-second resend cooldown retained; aggregate staging D1 reports three provider-accepted challenges | Live traffic/rate behavior, provider failure, and enumeration parity through protected staging |
| OTP verification lock | Staging migration `0023` adds immutable `verification_locked_until`; fifth wrong attempt applies a 15-minute lock; replacement challenge is denied while locked | Full-HTTP remote concurrency and lock timing |
| Turnstile | Server Siteverify integration with action `auth_otp`, exact hostname, optional remote IP, eight-second timeout, schema validation, and fail-closed invalid/unavailable handling; client widget integrated into auth flow; exact staging site/secret binding names are present | Current-version browser widget trace, provider response correlation, and Resend mailbox/failure flow in staging |
| Session persistence and token rotation | 24-hour default and 30-day explicit remember-me absolute lifetimes; aligned cookie `Max-Age` and D1 expiry; same choice after OTP or MFA; strict boolean inputs with false default; existing seven-day idle cap; MFA elevation, MFA disable, confirmed email change, and the locally integrated 12-hour periodic route each atomically retire the current token digest, return a replacement cookie, and preserve absolute expiry; the shell uses a delayed, jittered, visibility-aware same-origin/CSRF scheduler; periodic rotation alone has a 30-second in-flight-request grace in which the retired token is rejected without revoking the replacement session, while later replay and every sensitive-trigger replay revoke the session/device and append critical audit evidence; guarded races leave one winner and no partial side effects; staging migration `0029`, restore drill, and the MFA elevation/disable Worker deployment pass | Push/deploy and exercise email-change notification plus periodic rotation; exact authenticated HTTP/cookie/replay behavior for every trigger; approximate region signals |
| Opaque browser continuity | Successful primary/MFA login issues a server-generated HttpOnly/Secure/SameSite=Lax token only when the identity keyring exists; D1 retains only user-bound versioned HMAC evidence and coarse region; concurrent first use, key rotation and tenant isolation are covered; normal logout preserves trust while security revoke, replay, logout-all, email change and account deletion revoke the applicable continuity; migration `0031` and Worker code are deployed to protected staging | Authenticated staging HTTP/cookie/revoke evidence remains open; the token is not an authentication factor and a stolen token can only affect future novelty classification |
| Login-security notification | Continuity-backed new-device/coarse-region classification, encrypted-recipient job, identifiers-only outbox, MFA sequencing, RU/UZ copy and idempotent retry behavior are tested; migration `0032`, Worker handler and the isolated staging email consumer are deployed | Protected primary/MFA HTTP, real controlled Resend delivery, DLQ/redrive and false-positive observation remain open |
| Prior-address security notification | Confirmed email change atomically creates encrypted-recipient evidence and an identifiers-only outbox job; migration `0030`, the staging-only email consumer and async runtime are deployed with provider idempotency and bounded retry semantics | Real prior-mailbox delivery, protected HTTP evidence and operator DLQ/redrive remain open |
| Account-deletion purge probe | A strict staging-only synthetic subject, disabled-by-default flag, real Cron/Queue path, phase-safe error codes, D1/R2 cleanup contract, production fail-closed guard, and controlled runtime dispatches are implemented | The post-reentry controlled rerun still rejected the malformed identity keyring before fixture creation; full D1/R2 purge proof requires owner correction, protected recovery-copy verification, and another controlled rerun |
| Structured onboarding | Canonical `/:locale/onboarding`; strict 4 KiB Zod input; required separate names, normalized phone with explicit unverified evidence, personal persona, primary goal, and exact current policy digests; deterministic personal workspace creation; staging migration `0024` applied | Protected staging browser flow; final policy approval; phone verification |
| Localized auth and persona routing | Canonical RU/UZ login/register routes; guest root defaults to Uzbek; registration personas are individual, entrepreneur, or lawyer; business routes use `/:locale/business/:workspaceId/*`; shell, builder, invitations, and switching preserve that base; legacy reserved business roots remain authenticated compatibility adapters; current personal/business builder routes pass authenticated RU/UZ responsive staging QA | Full auth/onboarding browser flow, 200% zoom, axe, reduced motion, and real-device matrix |

## Evidence checkpoint

The latest recorded successful local full suite contains:

- 27 rendered-route/security tests;
- 284 core/auth/document tests;
- 80 Cloudflare/migration/job tests, including migrations `0029`–`0034`, encrypted security-email evidence, account-deletion purge, continuity-backed login alerts, atomic rollback, cron, and queue concurrency/replay contracts;
- 391 tests total.

This evidence includes local migration/schema contracts and service-level
concurrency/rollback paths. The canonical document-builder flow now also has
protected staging browser evidence. It does not substitute for live provider
calls or the remaining full browser/accessibility/mobile matrix.

## Phase 3 legal-source foundation

| Slice | Locally implemented and tested | Not yet proved |
|---|---|---|
| Source lifecycle | Staging migration `0025`; source versions/sections/chunks, sync runs/errors, review queue; legacy rows default to `draft`; exact evidence required for verified records; verified evidence immutable; one active sync per lock key | Fetch/parse/snapshot activation; privileged legal-review flow; historical diff |
| Consumer trust gate | AI context, conversation sources, comparison analysis, global search, monitoring, and source counts require exact HTTPS Lex/Advice host, matching type, verified state/time, and lowercase SHA-256 | Retrieval quality, citation existence/version verification, Vectorize filters/reranking, source freshness policy |
| Single-source acquisition contract | Staging migration `0026`; exact Lex/Advice route classifier; manual same-source redirects; robots allow/disallow gate; bounded non-empty streaming UTF-8 HTML fetch; private content-addressed R2 raw object; identifiers-only D1 outbox/`legal.sync` handler; fetched/pending-review state only; safe failure ledger, actor/environment conflict fence, and idempotent replay | Successful live Lex robots/fetch/R2 evidence; Queue consumer/DLQ/Cron attachment; authenticated admin trigger |
| Untrusted snapshot normalization | Exact `parse5@8.0.1`; deterministic semantic blocks from explicit primary content only; raw/parsed size, SHA-256, UTF-8, schema, and source-identity replay checks; private content-addressed parsed JSON; identifiers-only `legal.parse` handler; structure failures routed to review; no verified sections/chunks or AI/index use | Real Lex/Advice markup compatibility, successful live source evidence, remote R2/Queue execution, privileged review/publication, historical parsing, section/chunk creation, indexing/retrieval/citations |
| Privileged legal-review evidence | Staging migration `0027`; dedicated legal-reviewer capability; active TOTP and fresh local MFA; single-assignee claim; exact raw/parsed hash confirmation; canonical evidence JSON plus SHA-256; coherent D1 guards; immutable/undeletable terminal decisions; approval does not publish; rejection atomically closes the untrusted version | Reviewed feature activation, staging reviewer bootstrap, legal-editor completion, and browser evidence |
| Verified source publication | Staging migration `0028`; separate publish capability with fresh TOTP-backed MFA; exact approved-review and private-R2 revalidation; deterministic bounded version-specific sections/chunks; one atomic verified-state transition; canonical publication evidence plus SHA-256; immutable publication and reading rows; one-winner concurrency and exact replay verification | Replacement-version activation model; lexical/Vectorize indexing; retrieval/citation validation; reviewed feature activation and staging browser evidence |
| Protected staff review inbox | Keyset-paginated metadata-only D1 list plus claim, decision, and publication routes; exact-host source-link validation; authorization precedes query/body parsing; same-origin/CSRF boundary; RU/UZ no-store responses; normalized R2 blocks are loaded only after a single-owner claim; dense responsive RU/UZ staff UI covers loading, empty, recoverable error, review, approve/reject, and separate publication; server page and API share the exact disabled flag | `LEGAL_SOURCE_STAFF_API_ENABLED=false` in every checked-in environment; no remote Worker/route, reviewer bootstrap, protected staging browser/accessibility/performance evidence, withdrawal, or replacement-version activation |
| Advice ingestion policy | Request path is implemented but `LEGAL_ADVICE_INGESTION_ENABLED=false` is asserted in every environment, generated types, config tests, and artifact validation; disabled requests perform no network/D1/R2 action | Recorded legal/owner authorization, current terms/robots review, staging activation evidence |

## Deployment truth

- Production was not changed. Legacy Worker `juro` remains deployment `54aee3c6-39eb-4a16-ae59-c74418ae599f` / version `91774ed4-72e9-47bb-b93a-a4208d490b24`; Sites remains v20.
- `juro-production` and `juro-development` remain through migration `0004`; `juro-staging` is through `0034` with 35 ledger rows, 113 application tables (114 including `d1_migrations`), 72 triggers, 199 indexes, empty foreign-key check, and migration-specific pre/post private-R2 checkpoints.
- Worker version `2ebc2ea8-6216-4f39-af96-d1b600973b74` serves 100% of protected staging from commit `cd24095`; `STAGING_SYNTHETIC_PROBES_ENABLED=false` remains in the deployment.
- Secret values were never read; the control plane exposes only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY` by name plus the public Turnstile site key.
- Owner-only Access denies anonymous root, canonical builder, and deletion API requests with 302 plus `no-store`.
- Exactly two staging consumers and one five-minute cron are active. Three synthetic deletion jobs have been dispatched once each, including the controlled post-reentry rerun; each rejected before fixture creation with `STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED`, and no synthetic D1/R2 data was created. Legal ingestion and staff APIs remain disabled.
- Authenticated current-version RU/UZ personal/business builder and responsive route evidence now passes behind Access. Cookie/replay, provider, axe, reduced-motion, zoom, and wider critical-route evidence remains open.

## Canonical builder integration checkpoint

The builder surface now uses one tested path helper for locale/account-aware
library, category, template, documents, contacts, and notifications links.
Nested page-level `main` landmarks were replaced with neutral containers so
the application shell remains the sole main landmark. The builder header and
library route update RU/UZ content after client navigation, and the shell keeps
`html[lang]` synchronized with the active locale.

## Builder workspace localization — branch checkpoint

Documents, contacts, and notifications now consume a single typed RU/UZ Latin
copy contract keyed by the canonical route locale. Persisted Russian document
status values remain unchanged for compatibility and are mapped only for UZ
display. Date formatting follows the route locale. The contacts dialog has
explicit dialog semantics, and notification read actions are keyboard-reachable
buttons instead of pointer-only article clicks. Local type-check, lint, full tests, staging build/artifact validation, staging
deployment, control-plane re-read, and anonymous Access denial pass.
Authenticated remote browser verification now also passes for RU/UZ
personal/business builder routes at desktop, tablet, 390 px, and 320 px without
overflow or console errors. The wider accessibility/performance matrix remains
open.

## Privacy-safe session request evidence — local checkpoint

- successful email-OTP and MFA session events can record a user-bound,
  domain-separated HMAC of the bounded connecting IP and User-Agent;
- metadata retains only key version plus sanitized Cloudflare country and region
  codes; it excludes city, postal code, coordinates, raw IP, and full UA;
- missing `IDENTITY_KEYRING` omits the optional evidence instead of creating an
  unkeyed stable fingerprint;
- tests prove the direct and MFA paths, no raw-value persistence, and security
  hash-chain validity;
- this is risk evidence, not durable device recognition and not a new-device
  notification claim.

Local evidence: 355/355 tests, type-check, lint, Cloudflare matrix, final staging
build/artifact, document-builder smoke, and comparison smoke pass. The slice is
not pushed or deployed; production remains unchanged.

## Account deletion lifecycle and purge — protected staging checkpoint

- RU/UZ profile settings expose immediate and 30-day recoverable deletion with accurate cancellation language.
- A recent local JURO email session, CSRF proof, six-digit deletion OTP, exact session/challenge binding, and purpose-separated keyed subject are required.
- Confirmation atomically revokes sessions/devices/continuity and creates the identifiers-only `cleanup.run` outbox job.
- The staging Worker has a durable locked `*/5` outbox dispatcher plus isolated email and data-retention Queue consumers/DLQs; all other consumers and legal ingestion remain absent/disabled.
- The purge validates workspace/staff blockers, persists an irreversible fence, deletes exact private R2 keys, performs the D1 cleanup transaction, tombstones the profile, and writes append-only lifecycle/purge evidence.
- Recoverable requests can cancel before the fence. Corrected blockers can be retried once under concurrency. R2 failure preserves D1 and retries; completed/cancelled states are idempotent and terminal.
- Current local evidence: 27 rendered route/security tests, 284 core tests, and 80 Cloudflare tests; type-check, lint, generated binding check, staging build/artifact, builder smoke, comparison smoke, and secret-pattern scan pass.

Migrations and the Worker runtime are deployed to owner-only protected staging. D1 integrity, exact schema, control-plane attachments, anonymous Access denial, one completed durable cron run, and the post-migration private-R2 backup are verified. A synthetic authenticated deletion through HTTP/UI, live email delivery, DLQ/redrive, and the broader browser/accessibility matrix remain open. Production is unchanged.
## Legal source acquisition and normalization

The following Phase 3 vertical slice is implemented and proven in owner-only staging:

- exact current/legacy Lex URL classification and D1 guard;
- bounded robots negotiation with Allow/Disallow and supported Crawl-delay enforcement;
- serial legal-source Queue consumer and idempotent outbox/job lifecycle;
- content-type/encoding/redirect/byte validation;
- exact-byte SHA-256 and private content-addressed raw R2 storage;
- parse5 semantic normalization plus current Lex lx_elem adapter;
- official ACT_TITLE selection, chrome exclusion, and wrapper de-duplication;
- private content-addressed normalized R2 storage;
- low-confidence pending human review and fail-closed publication boundary;
- replay suppression across an additional cron cycle.

The live probe produced one source/version/review and zero published sections/chunks. No source is marked verified and no Vectorize write occurs. STAGING-0036-EVIDENCE.md contains exact IDs, hashes, sizes, tests, restore, and limitations.

## Phase 4 legal chat boundary

The feature branch now contains a real authenticated `POST /api/platform/ai` boundary rather than a fake answer surface.

- strict RU/UZ Uzbekistan-only response schema and Zod validation;
- verified-source allowlist plus fail-closed no-source clarification;
- idempotency, monthly reservation, charge/release, provider usage, and audit persistence;
- OpenAI Responses API primary adapter;
- Anthropic Messages API structured-output fallback that cannot bypass a safety refusal;
- real UI rendering for findings, assumptions, risks, actions, documents, deadlines, sources, and usage.
- exact replay of current publication/lifecycle/reading evidence before prompt inclusion;
- freshness derived only from complete Lex and Advice corpus runs, with `unavailable` non-chargeable clarification and `stale` assumption/deadline downgrade;
- RU/UZ accessible source-freshness status in the answer surface and persisted freshness evidence in AI-run audit metadata.

Local verification passed 301 core/rendered checks and 82 Cloudflare checks. Staging migration `0037`, the OpenAI boundary, and the Anthropic fallback extension are deployed to owner-protected staging as version `fdbce9be-06d6-45ef-bd01-ac49bd7b44a7` at 100% traffic.

Live provider execution for product data is not claimed: both secret names now exist, but only fixed synthetic probes are verified. Production remains unchanged.


### Phase 4 validated streaming transport — 2026-07-31

The feature branch additionally implements:

- real upstream OpenAI Responses SSE parsing across split CRLF/LF frames;
- safe progress events without exposing incomplete structured legal text;
- final-answer gating behind schema, source, persistence, and ledger checks;
- visible RU/UZ progress and an accessible stop control;
- end-to-end AbortSignal propagation through OpenAI and Anthropic fallback;
- `AI_CANCELLED` persistence with reserved usage release and no charged cycle;
- privacy-preserving `safety_identifier` plus explicit reasoning/verbosity controls.
- question edits and answer regenerations create immutable, tenant-scoped branches instead of overwriting prior messages;
- exact branch URLs, branch navigation, server-authoritative regeneration, append-only version hashes, and idempotent replay are locally tested.

The transport is locally verified and deployed to protected staging as Worker version `1cbc9ea9-6ec8-4ab8-9495-b880b269f423` at 100% traffic. Live user/legal provider execution is not claimed beyond fixed synthetic provider probes. Production remains unchanged.

Immutable AI edit/regenerate branches are deployed to protected staging as Worker version `593e7fd4-1d60-4ba2-accc-c44b1e0a2ba0` with D1 through `0039`. Exact backup, migration, integrity, Access, rollback, and unchanged-production evidence is recorded in `STAGING-0039-AI-BRANCH-HISTORY-EVIDENCE.md`. Live provider-backed branch creation remains unclaimed: fixed synthetic provider probes are verified, but legal retrieval and authenticated product-flow evidence are not.

## Phase 5 secure upload foundation

The feature branch implements and locally verifies:

- authenticated, same-origin, tenant-scoped upload initialization;
- strict 50 MB PDF/DOCX/JPEG/PNG/ZIP intent validation;
- request-hash-bound idempotency and immutable consent/audit records;
- direct request-body streaming to private R2 with SHA-256 validation;
- post-write size/checksum and bounded magic-byte checks;
- opaque non-PII quarantine keys;
- a fail-closed `quarantined` state that never invokes AI while the scanner is unavailable;
- RU/UZ UI integration from both dashboard and document-review surfaces;
- explicit retirement of the unsafe synchronous multipart AI path.
- fail-closed ZIP/DOCX central-directory inspection for traversal, nesting, encryption, symlinks, active content, member type/count/depth, expanded size, and compression-ratio limits before malware scanning.

The archive gate is deployed to protected staging as Worker version `3bc029a3-8722-4edd-8c05-d615d5ce9a13`. It does not mark a file safe or bypass the absent malware scanner. Exact verification and rollback evidence is in `STAGING-PHASE5-ARCHIVE-SAFETY-EVIDENCE.md`.

## Phase 5 async analysis consumer

Protected staging now contains the real, fail-closed processing boundary after secure upload:

- one serial `staging-document-analysis` consumer plus a distinct DLQ;
- tenant/object-state validation before R2 or provider access;
- R2 size/SHA-256 integrity verification;
- bounded PDF/DOCX extraction and explicit OCR/capacity waiting states;
- verified allowlisted Lex/Advice retrieval;
- Anthropic-primary/OpenAI-fallback structured output with Zod, source, and excerpt enforcement;
- durable normalized result, risk, AI-run, usage-ledger, and audit persistence;
- replay/idempotency fencing and honest RU/UZ processing/error states.

Worker version `0ba11fcf-a095-436d-a30b-aeacc1aa9c3c` serves 100% of `juro-platform-staging`; queue inventory proves one producer and one consumer. D1 integrity passes and production is unchanged.

This is not a completed live analysis feature: the scanner and AI secrets are absent, so no staging document can yet reach a provider. See `STAGING-PHASE5-ASYNC-DOCUMENT-ANALYSIS-EVIDENCE.md`.

## Phase 6 case-plan-builder continuity

Protected staging now contains a functional bounded slice connecting cases, plans, deadlines, and the existing document builder:

- strict tenant-scoped plan-step mutation with optimistic revision fencing;
- real date-only validation and nearest-active-deadline recalculation;
- neutral inaccessible-object response;
- RU/UZ date and complete status controls;
- valid case/step context preserved across library, category, template, back, and locale navigation;
- existing builder-side tenant validation retained before draft creation;
- accessible expansion state, touch target, responsive layout, and reduced-motion behavior.

Worker version `39050d54-2ad8-4145-9779-1c06e5fe8e47` serves 100% of `juro-platform-staging`. No migration or new Cloudflare resource was added. D1 integrity and anonymous Access denial pass; production is unchanged. See `STAGING-PHASE6-CASE-PLAN-BUILDER-EVIDENCE.md`.

## Phase 7 entitlement and specialist-handoff boundary

Protected staging now contains a single server-side entitlement boundary shared by billing and specialist consultations:

- missing or invalid subscription evidence fails closed to Free;
- only current active/trialing paid evidence enables specialist handoff;
- Free requests receive typed `PLAN_LIMIT` before any write;
- case, plan-step, and comparison references receive tenant checks with neutral failures;
- eligible booking, consent, slot, and audit mutations retain one D1 batch;
- RU/UZ surfaces show the actual entitlement and do not simulate checkout or assignment;
- absent payment configuration/adapter returns an honest `503`/`501` response.

Worker version `5feeab28-f23e-4dd6-a95c-88963306bf2a` serves 100% of `juro-platform-staging`. Staging currently has no subscriptions, consultation slots, or bookings, so a live paid handoff is not claimed. Production is unchanged. See `STAGING-PHASE7-ENTITLEMENTS-HANDOFF-EVIDENCE.md`.

## Phase 8 cinematic staging prototype — 2026-07-30

Protected staging now contains an isolated Cinematic Legal Intelligence surface without replacing canonical routes:

- exact staging-only server guard and noindex metadata;
- personal and business-workspace prototype routes;
- real authenticated shell, workspace context, dashboard API, and canonical workflow links;
- RU/UZ product copy;
- scoped navy/gold cinematic orientation surfaces around existing light work surfaces;
- static official Jurobek fallback with honest voice/avatar status;
- mobile/tablet/desktop CSS plus reduced-motion, reduced-transparency, increased-contrast, and forced-colors states;
- no new dependency, schema migration, WebGL, fake provider result, or production UI change.

Local type-check, lint, 41 targeted core tests, 28 rendered Worker tests, full 416-test regression, staging/production-profile builds, artifact checks, document smokes, secret scan, and Impeccable detector pass. Worker version `cfef8153-3322-4ce5-b271-3478a0531b28` serves 100% of `juro-platform-staging`; D1 integrity and exact binding/Access/production read-backs pass.

Authenticated visual/browser, axe, zoom, real-device, WebGL/GPU/memory, and performance gates remain open; see `STAGING-PHASE8-CINEMATIC-PROTOTYPE-EVIDENCE.md`.

## Phase 5 completed-analysis JSON export — 2026-07-31

Protected staging contains a real, locally verified export lifecycle for a
tenant-owned completed document analysis:

- authenticated request/list/download APIs with neutral cross-tenant failures;
- D1 `analysis_exports` state, tenant/owner/source guards, and append-only audit;
- transactional `job_outbox` dispatch to a dedicated document-export Queue;
- schema-validated deterministic JSON written privately to R2 with size and
  SHA-256 verification;
- idempotent Queue replay, typed failure persistence, and explicit retry;
- RU/UZ request, processing, failure, retry, and download UI states;
- no new runtime dependency and no raw provider JSON exposed by the review API.

Type-check, lint, full tests, staging build/artifact validation, Cloudflare binding
checks, rendered auth tests, document smokes, and secret scans pass. Migration
`0040` is applied to `juro-staging`; Worker version
`6cf8434d-e94c-406a-9655-02bffdf0e2d2` serves 100% behind Access. No eligible
completed analysis exists, so a live staging export is not claimed.

### Analysis-export account-deletion continuity

Account closure now includes owned analysis-export keys in the pre-delete R2
inventory and includes export rows in immutable deletion evidence counts. R2
failure remains retryable without deleting D1; after successful object deletion,
the existing analysis cascade removes the export row atomically with the rest of
the user's content. The dedicated purge suite passes 9/9 and the full regression
remains 28 rendered, 323 core, and 84 Cloudflare tests. Worker version
`cfb20e07-d9a9-4b55-a402-e2326c437b4a` serves 100% in protected staging.

### Standalone analysis-export deletion

The completed-analysis export lifecycle now includes a real terminal deletion
path:

- authenticated, CSRF-protected `DELETE /api/platform/document-analysis/exports/:exportId`;
- neutral tenant/workspace/user authorization;
- rejection of pending and processing exports;
- private R2 deletion and absence verification before D1 deletion;
- atomic export-row removal plus immutable content-free audit evidence;
- retryable R2/D1 failure handling and idempotent replay;
- RU/UZ confirmation, busy, success, retry, and error UI states;
- cross-tenant, ordering, failure, replay, and rendered-route tests.

This does not claim retention scheduling, batch deletion, additional export
formats, or an authenticated live staging export from a provider result.

## Phase 5 completed-analysis PDF/DOCX reports — 2026-07-31

The completed-analysis surface now has one backward-compatible export API for
machine-readable JSON and human-readable PDF/DOCX reports:

- strict `json | pdf | docx` format selection; an omitted format remains JSON;
- real RU/UZ report composition from the validated normalized analysis result;
- the existing JURO PDF and DOCX generators, fonts, template, and footer asset;
- one additive report table and the existing identifiers-only outbox/Queue;
- immutable private R2 keys with conditional create, byte count, and SHA-256 proof;
- tenant/owner authorization, neutral cross-tenant failures, and download audit;
- terminal per-export R2-first deletion plus account-deletion purge continuity;
- real PDF signature and OOXML package/content tests;
- Queue routing, one-ack behavior, replay, failure, migration-guard, and mobile
  touch-target coverage;
- no new runtime dependency, provider call, public bucket, website change, or
  production deployment.

The feature is locally implemented and gated for protected staging. It does not
claim highlighted/redline or comparison-table reports, live provider-generated
staging artifacts, or production readiness.

Migration `0041` and exact commit `c8873d3` are now deployed only to protected
staging. Worker version `ffbfe9df-40f8-4442-8080-7eaf1e63fe40` serves 100%; D1,
Queue, binding, secret-name, Access, backup, and unchanged-production read-backs
pass. Staging contains zero completed analyses/report rows, so live provider-generated report completion is not claimed despite provider secret names being present.

See `STAGING-0041-ANALYSIS-REPORT-EXPORT-EVIDENCE.md` for exact commands/results
and rollback evidence.

## Phase 5 post-safe OCR/extraction — 2026-07-31

Locally implemented and verified:

- additive `file_extractions` lifecycle in migration `0042`;
- environment-isolated Workers AI `AI` binding;
- identifiers-only `ocr.process` outbox and attached OCR Queue consumer;
- tenant/safe-state checks before R2 or provider access;
- source size and SHA-256 verification;
- Cloudflare `toMarkdown` conversion for supported PDF/DOCX/image inputs;
- normalized `ExtractedDocument` persistence as an immutable private R2 object;
- image-review warning without false OCR accuracy or coordinate claims;
- verified derivative replay without a second provider call;
- durable chain back to the existing Anthropic-primary analysis consumer;
- retryable provider absence and fail-closed integrity/provider rejection;
- R2-first account-deletion coverage for the derived object.

Targeted Phase 5 tests pass 18/18, Cloudflare config/migration/Queue tests pass
85/85, account-purge tests pass 9/9, TypeScript/lint pass, and generated Wrangler
types are current. Migration `0042` and commits `9a6a9c9`/`48861a1` are deployed
only to protected staging as Worker version
`85151979-ba7d-4fc0-a2dc-fccf4f1e4da3`. The OCR Queue has one staging producer
and one staging consumer with a distinct DLQ; D1 integrity and private pre/post
backup round trips pass.

This is not a scanner: new uploads remain quarantined. The remote secret-name
inventory confirms the OpenAI and Anthropic secret names, but no safe file can
reach either provider while the malware gate is closed. Provider-generated staging
analysis is therefore not claimed. The release corpus remains pending. Exact evidence is in
`STAGING-0042-OCR-EXTRACTION-EVIDENCE.md`.

### Phase 6 — immutable action-plan history (staging)

Case-plan creation now persists a version-1 snapshot. Each successful optimistic step update creates the next immutable snapshot, while GET /api/platform/cases/:caseId/plan-versions returns history only after active-session and workspace checks. The case workspace exposes this history as a read-only timeline with version time and saved progress. action_plan_versions is protected in D1 against update/delete mutation. Staging evidence: STAGING-0056-ACTION-PLAN-VERSIONS-EVIDENCE.md.
## Phase 7 — owner-controlled lawyer case access

The protected handoff UI now completes the existing persisted server flow. After a lawyer records a clear conflict check, the requester sees a distinct consent control before `POST /api/platform/lawyer-requests/:requestId/access-grant` can execute. An active grant displays an explicit revocation action using the same authenticated, CSRF-protected endpoint. The API continues to enforce workspace ownership, entitlement, clear conflict status, one active grant, consent/audit evidence, and immediate revocation. The browser UI is a client for these real D1-backed routes, not a simulated state. Local type-check, lint, and 87/87 targeted platform tests pass; protected staging deployment and authenticated browser verification are still pending for this UI delta.

### Protected staging evidence — 2026-08-01

The owner-controlled lawyer-access UI is deployed to `juro-platform-staging` as Worker version `29b75251-511d-4a0f-ac7d-c1b61214eada`. The deployment lists only staging D1, R2, Queue, Vectorize, and analytics bindings. The `deploy:staging` guard performed a clean staging rebuild before deployment. Anonymous/Access-protected and authenticated browser traversal are not claimed by this evidence.

## Phase 7 — lawyer conflict-check workspace

For a `/:locale/lawyer/consultations` route, the platform now shows only real assigned request records from `GET /api/platform/lawyer-requests/assigned`. A lawyer can record `clear` or `conflict` through the pre-existing authenticated, CSRF-protected conflict-check route. The request owner alone retains the separate grant/revoke controls; the lawyer UI renders case details only when the server reports an active grant. No lawyer assignment, case data, or decision is manufactured by the client.

## Phase 7 — persisted lawyer offer terms

Protected staging now supports an end-to-end lawyer offer boundary: an assigned public-approved lawyer with an active grant can persist work scope, price description, and duration; the workspace owner can accept or decline the latest proposal. The API rechecks the active grant and public profile on the server, scopes owner reads and decisions to the requester workspace, hides the offer from a lawyer without an active grant, and writes proposal/decision audit events. An accepted proposal is not replaceable through this route. Payment is explicitly outside the platform at this stage.

Migration `0052_narrow_christian_walker.sql` added only the `lawyer_offers` table and its indexes after a private remote staging checkpoint. `quick_check` is `ok` and `foreign_key_check` is empty. Worker version `ad482923-41bc-4a59-a846-54b16e4dcbb1` serves 100% of `juro-platform-staging`; production is unchanged. See `STAGING-0057-LAWYER-OFFERS-EVIDENCE.md`.
## Phase 7 — lawyer review moderation (protected staging)

The branch now contains a real bilingual staff route at `/:locale/admin/lawyer-reviews`, protected by a local MFA session and the `lawyer.reviews.moderate` capability. The owner review stays private; a reviewer may approve or reject it only through a CSRF-protected endpoint. Migrations `0055` and `0056` add an immutable moderation journal, a one-decision fence, and a database trigger that applies the review terminal state only after the journal record exists. A conservative PII screen blocks approval when the proposed public text appears to contain an email, phone number, or PINFL-like number. Approval does not publish a rating or review.

Local evidence: staging build, lint, type-check, and the full 87-test suite pass. Migrations 0055/0056 and the Worker route are now deployed to protected staging; anonymous and authenticated Access/MFA browser traversal are not claimed.

### Approved lawyer-review directory projection (staging)

The authenticated lawyer picker now returns public-profile ratings and up to three review texts only when the profile is `public_approved`, the review status is `approved`, and the immutable moderation journal records an `approved` decision. The response never includes the requester, workspace, moderation reason, or moderator identity. Rating values are computed server-side from those approved rows; a lawyer with no approved review receives no synthetic rating. Staging Worker version `164db8bf-877e-45a3-b0f1-f54f4a45bf03` contains the projection.
