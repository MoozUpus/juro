# JURO implemented-features checkpoint

## Legal corpus failure/freshness alerts (staging checkpoint)

- Migration `0089` records only environment, source kind, opaque run/epoch ID,
  bounded reason, severity, freshness hours and delivery state. It has no legal
  content, source URL, tenant, user or recipient column.
- The existing five-minute fenced scheduler recovers up to 20 unalerted failed
  Lex/Advice corpus runs per source and creates one stale warning when no full
  success exists or the latest success is at least seven days old.
- One D1 transaction creates the unique alert and identifiers-only
  `email.send` outbox row. The existing server-side Resend worker delivers it
  idempotently and preserves the established AI cost-alert behavior.
- D1 constraints bind failed alerts to an actual matching failed corpus run,
  make alert identity immutable and forbid deletion. Focused lifecycle,
  downtime recovery, migration replay and email-idempotency tests pass. The
  matching schema and Worker are deployed to protected staging at `1aadfc6`.
  No controlled remote alert/Queue receipt, real email or production change is
  claimed.

## Verified corpus freshness guard (staging checkpoint)

- Migration `0091` requires every successful full corpus run to cover at least
  one discovered item and to fetch and verify all discovered items without a
  changed pending-review version or error.
- D1 insert/update guards enforce the same counter predicate as the Worker;
  terminal run evidence is immutable and cannot be deleted.
- Private backup round-trip, isolated pre/post restore, exact migration,
  GitHub CI and exact commit `81de7bb` staging deployment passed. Controlled
  corpus execution, Queue/email evidence and named legal review remain open;
  production is unchanged.

## Bounded Lex RU/UZ RSS discovery (local candidate)

- The daily corpus run is claimed atomically before network discovery, so an
  overlapping invocation cannot repeat RSS requests or bypass the source rate
  policy.
- Discovery uses only official `lex.uz` `robots.txt` and the exact RU/UZ RSS
  endpoints, honors the declared 20-second delay, accepts strict RSS/XML within
  512 KiB and keeps at most 40 balanced canonical `/ru|uz/docs/{id}` URLs.
- Candidates reuse the existing acquisition queue, private raw/normalized R2
  objects, immutable `pending_review` version and human publication boundary.
  They do not become verified sources or AI context automatically.
- Adversarial parser, duplicate-run fencing and full review-lifecycle tests pass
  locally. A live read-only probe confirmed both official feeds and delay
  handling. Remote staging remains at `cff38f0`; activation and protected
  operational evidence require a separately authorized deployment.

## Public system status and incident management (local candidate)

- Migration `0083` adds bilingual incidents, fixed public component impacts and
  immutable chronological updates. Incidents cannot be deleted or reopened;
  only forward transitions from investigating to resolved are accepted.
- `/status`, `/:locale/status` and `/api/status` project only public reference,
  RU/UZ copy, component state and timestamps. Staff identity, tenant/resource
  identifiers and infrastructure topology are never serialized.
- `/:locale/admin/system-status` and its API use the existing operations
  capability, active TOTP, fresh MFA and same-origin/CSRF boundary.
- The configured status hostname is allowlisted to status routes and static
  assets; application/dashboard routes return a neutral 404 and writes return
  405. A missing/unavailable D1 produces a bounded public 503.
- D1 lifecycle, immutability, translation, projection and host-boundary tests
  pass locally. Migration/deploy, custom-domain/DNS attachment, protected admin
  browser QA and an incident rehearsal remain pending; production is unchanged.

## Provider cost circuit breaker and operational alerts (local candidate)

- Migration `0082` adds immutable cost-guard policy versions, provider circuit
  state, transition events and alert-delivery evidence without storing user or
  legal content.
- Chat and document-analysis provider calls check the circuit server-side just
  before transport. Existing OpenAI/Anthropic fallback remains available, and a
  fully blocked path returns a typed error without decrementing usage.
- Actual success/failure metadata is attached to the immutable provider-usage
  ledger. Automatic daily-cost/failure-spike openings atomically create one
  identifiers-only alert job and outbox message; duplicate evaluation is safe.
- The protected operations console supports immutable effective-dated policies
  and audited manual stop/resume. Alert email uses a server-side recipient and
  an idempotent Resend operation.
- D1 lifecycle, immutability, failure-spike, alert-delivery and static transport
  integration tests pass locally. Migration/deploy, real staging alert delivery,
  billing reconciliation and circuit rehearsal remain pending; production is
  unchanged.

## Moderated lawyer replies to reviews (local candidate)

- A lawyer can answer only an approved review attached to that lawyer's own
  public-approved profile. The server derives the actor; client-supplied actor,
  profile or workspace identifiers are not accepted.
- Submission is CSRF-protected and idempotent. Rejected text remains immutable
  evidence and a corrected answer becomes the next version; pending or approved
  answers cannot be overwritten.
- `/:locale/admin/lawyer-review-replies` and its API require the existing
  `lawyer.reviews.moderate` capability, active TOTP and MFA verified within 15
  minutes. Approval is blocked by the conservative contact/phone/PINFL screen.
- The authenticated lawyer directory/detail projection returns only a separately
  approved reply. Pending and rejected replies, moderator identity/reason and
  requester/workspace identity are never serialized publicly.
- RU/UZ lawyer/staff interfaces, generic in-app notifications, metadata-only
  workspace audit and executable D1 lifecycle tests are included. Migration
  `0079`, browser QA and staging deployment remain pending; production is unchanged.

## Versioned RU/UZ knowledge base (local candidate)

- Public `/:locale/help` and `/:locale/help/:articleSlug` routes expose only the
  latest published immutable version; authenticated personal and explicit
  business routes preserve the platform shell and tenant context.
- Search is bounded, locale-aware and D1-backed. Article pages show version,
  update date, structured text and ordered related articles without raw HTML.
- Authenticated helpful/not-helpful feedback derives user/workspace scope from
  the server session, requires CSRF and idempotency evidence, keeps a revisioned
  projection and appends metadata-only audit events.
- Loading, empty, recoverable error, retry, keyboard focus, 44 px controls and
  RU/UZ states are implemented without a new UI or motion dependency.
- `/:locale/admin/knowledge-base` provides a dense RU/UZ staff editor for new
  articles, draft updates, explicit publish confirmation, archive/restore and
  helpful/not-helpful counts. The route and API require the dedicated
  `knowledge.base.manage` capability, active TOTP and MFA verified within 15
  minutes.
- Migration `0078` records new articles/versions, draft edits, publications and
  lifecycle changes as append-only actor evidence. Published versions cannot be
  updated and articles, versions and evidence cannot be deleted.
- Focused tests pass locally. Migrations `0077`–`0078`, protected staging browser QA and
  deployment remain pending; production is unchanged.

## PDF structural/page-count preflight (local candidate)

- Single PDFs are parsed before Workers AI; corrupt, password-protected and
  over-500-page files stop with typed fail-closed states and no provider call.
- ZIP packages preflight every PDF and cap known PDF plus image pages at 500
  before a conversion batch. The verified count is stored in normalized
  extraction/package metadata instead of the previous `null` placeholder.
- DOCX pagination is not inferred because no faithful renderer is present.
  Focused PDF/OCR/package tests pass locally; staging provider evidence remains
  open and production is unchanged.

## SSRF-safe public document URL import (local candidate)

- An authenticated RU/UZ entry form imports one public PDF, DOCX, JPG, PNG or
  ZIP through a real server route; it does not simulate analysis completion.
- The route enforces same-origin writes, active tenant/case ownership and
  idempotency, credential-free HTTPS on port 443, public DNS/IP checks before
  each request, manual redirects, DNS recheck, timeout, declared 50 MB limit,
  identity encoding, MIME, R2 size/SHA-256, magic bytes and archive structure.
- Bytes stream into private R2 and join the existing quarantine/scan pipeline.
  Only source origin and a canonical-URL hash enter audit metadata. The full URL
  is neither persisted nor promoted to an official legal source.
- Focused route/security tests, typecheck and lint pass locally. Staging deploy,
  protected browser QA and a real malware verdict remain open; production is
  unchanged.

## Verified text ZIP-package extraction (protected staging)

- Document analysis now repeats deep ZIP verification before extraction, then
  processes every PDF/DOCX member in deterministic order while preserving the
  source-file boundary in untrusted provider context.
- Known PDF pages are capped at 500 across the package. Inline expansion is
  additionally bounded to 20 MB per member and 50 MB for the decoded package;
  over-budget packages wait for external extraction instead of risking Worker
  memory. Existing archive limits still cap members, aggregate expanded bytes,
  ratios, nesting, methods, paths and time.
- A package containing an image receives the truthful
  `DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED` state. The opaque ZIP is never sent to
  Workers AI, OpenAI or Anthropic; RU/UZ UI explains the recovery path.
- This slice adds no dependency or new provider runtime. It is deployed only to
  protected staging in Worker version
  `030e3db0-6de5-455f-a90b-0350d346f5cf`; no eligible user file can reach it
  while the real malware gate remains closed. Production is unchanged.

## Disabled malware-scanner integration contract (schema staged, scanner absent)

- `0068_file_scan_evidence.sql` adds tenant-bound, terminal scan evidence with
  clean/infected invariants and immutable updates.
- `lib/document-analysis/malware-scanner.ts` implements the internal scanner
  protocol, strict 64 KiB response bound, SHA/R2 verification, idempotent
  `quarantine-v2` to `safe-v1` promotion, infected isolation, audit evidence,
  and downstream `document.analyze` enqueue after clean verdict only.
- Upload finalize can enqueue `malware.scan` only when all three controls are
  present: `MALWARE_SCAN_ENABLED=true`, an internal `MALWARE_SCANNER` service
  binding, and `MALWARE_SCAN_QUEUE`.
- Migration `0068` is applied only to `juro-staging` after a verified private-R2
  backup and restore. No checked-in environment provides the three runtime
  controls, the evidence table contains zero rows, and the existing
  unavailable/quarantine response remains the actual behavior. See
  `STAGING-0068-FILE-SCAN-EVIDENCE.md`.

> Current local evaluation delta — 2026-08-04: legal release evaluation now
> contains 314 unique RU/UZ scenarios with individual/entrepreneur/lawyer
> coverage, expected-behavior scoring and live citation existence checks. The
> document validator requires 100 unique artifact evidence records and enforces
> format, document type, critical risk, side confirmation, dates/sums, clean OCR,
> 30 comparison-pair, injection-resistance and human-review gates. Focused tests
> and typecheck pass. No legal/document quality percentage is claimed and no
> staging or production runtime was changed by this local delta.

> Current local persisted-evidence delta — 2026-08-05: legal evaluation now
> requires a second content-free artifact exported through a fresh-MFA protected
> legal-reviewer endpoint. It binds each result to the actual completed D1 AI run,
> byte-identical corpus prompt, stored structured output, matching source IDs/URLs
> and immutable `correct` review event. Tampered metadata or post-review content
> fails closed. This code is local only; no 314-run evaluation, staging deploy or
> legal-quality percentage is claimed.

> Current staging delta — 2026-08-04: action-plan steps now have an authenticated,
> tenant-scoped deadline preview and an explicit confirmation boundary. Server
> write routes recalculate the result, reject tampering, version the plan and
> preserve the same bounded evidence in generated tasks. Manual due-date edits
> clear calculation evidence. RU/UZ UI exposes calendar/business-day method,
> inclusion/roll rules, supplied holiday dates, safe earlier date and explicit
> unverified-calendar/legal-basis warnings. Migration `0067`, focused tests,
> typecheck, lint, full tests, Cloudflare tests/types, staging build/artifact,
> environment matrix, builder/comparison smokes and the extended case-to-task
> smoke pass locally. A verified private-R2 backup/round-trip/restore preceded
> application of only `0067` to `juro-staging`; Worker version
> `5e85ee33-f7ec-4e5d-a726-431c67ea46f0` now serves 100% of protected staging
> traffic. Anonymous Access boundary smokes pass. Authenticated RU/UZ browser,
> holiday-authority and legal-review gates remain open; production is unchanged.

> Current authoritative staging checkpoint — 2026-08-04: Worker
> `5e85ee33-f7ec-4e5d-a726-431c67ea46f0` receives 100% of protected staging
> traffic and D1 is through additive migration `0067`. Guest AI persistence,
> voice-message storage/retention, task-reminder outbox dispatch and all seven
> reviewed Queue consumers are deployed. The notification consumer passed a
> remote identifiers-only delivery probe and its synthetic rows were removed.
> Local lint, typecheck, complete tests, Cloudflare tests, staging build/artifact,
> Cloudflare types, secret-pattern scan and 34-scenario document-builder smoke
> pass. Functional commit `33ff471` additionally deploys tenant-backed,
> URL-addressable RU/UZ case sections for personal and explicit business
> workspaces. Focused route/security tests, the complete local suite,
> Cloudflare tests/types, staging build/artifact, 34-scenario builder smoke and
> comparison smoke pass. GitHub checks for this latest commit may still be in
> progress; the earlier notification checkpoint passed both validation jobs.
> This does not close authenticated browser, malware-scanner, complete legal
> corpus/human review, policy approval, approved 3D asset, production deployment
> or production UI-replacement gates. Later evidence overrides stale historical
> “local candidate” and older Worker-version statements below.

## Phase 4 — Guest AI entry (local candidate)

`/:locale/guest/ai-lawyer` provides one real RU/UZ legal answer without a
permanent account. It uses the provider adapter, legal retrieval, citation and
freshness verification, and structured-output validation; there is no mock
success path. Turnstile, same-origin writes, IP rate limiting, signed short-lived
sessions, atomic entitlement reservation and idempotent retry protect the API.
Clarifications do not consume the answer. Input and output are encrypted at rest
and purged after 24 hours. The page is `noindex` and offers registration after
the answer. Focused local service, route, migration, config and scheduler tests
pass. Migration `0065`, private backup/restore and staging deploy are now proven
by the current checkpoint; protected RU/UZ provider/browser evidence remains
required before this is called release-ready.
> Current local delta — 2026-08-03: AI retry no longer leaves a failed,
> released idempotency record in an endless `processing` response. Unknown
> transport outcomes retain the same request/key; a server-confirmed terminal
> failure returns a bounded state and an explicit retry receives a fresh key.
> An authenticated tenant-scoped status read now performs bounded automatic
> recovery of a completed persisted answer after an uncertain stream error.
> Provider refusal and user cancellation do not auto-restart. Focused state
> machine/client tests, type-check, and lint pass. This delta is not deployed;
> durable partial-token resume remains open.

> Current staging delta — 2026-08-03: `juro-platform-staging` Worker version
> `6ec3e8ab-434b-4ab5-98db-c26908d6c8a3` serves the protected AI-answer feedback
> route and UI. Feedback is linked server-side to the caller's completed,
> persisted assistant message and actual AI run; client input cannot choose a
> workspace, conversation, run, or answer. It is D1-backed by staging-only
> migration `0060_lethal_slapstick.sql`, which passed a checksum-verified
> private pre/post checkpoint and D1 integrity checks. The previous safe
> suggested-document handoff remains included. OpenAI fallback remains
> unproven for an authenticated legal-chat response; production is unchanged.
> Current authoritative checkpoint — 2026-08-02: only the evidence in this
> paragraph is current when it conflicts with older chronological entries.
> Staging Worker `c9c54208-55be-4d6c-9413-950e0cc78d5f` contains the tested
> document-analysis trust boundary and atomic AI-response finalization. The
> deployed staging changes additionally make global search safe while additive
> `tasks` and `lawyer_profiles` tables are not yet present in a D1 environment,
> rather than returning a server error for every search request. It runs only
> against isolated staging bindings. The latest local gate passes
> lint, the full test suite, staging build, and staging artifact validation;
> the protected hostname returns the expected Cloudflare Access redirect.
> Staging secret *names* include OpenAI and Anthropic, but
> `STAGING_SYNTHETIC_PROBES_ENABLED` is false; no current live provider
> response, safe-file analysis, authenticated browser journey, or production
> behavior is claimed. The same version also removes the document-builder
> `Math.random()` fallback: unavailable Web Crypto fails closed instead.
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

### Version-pinned user bookmarks — local candidate

- A user can save a verified source from the RU/UZ AI source panel into personal
  bookmarks or an active case, with an optional bounded comment.
- D1 retains the exact publication version, shows whether it is still current,
  and never silently rewrites the bookmark after source replacement.
- Create/update/archive operations are CSRF-protected, tenant scoped,
  idempotent, revision fenced and metadata-only audited.
- The case Sources tab separates explicit bookmarks from sources seen in linked
  AI conversations and allows the user to archive a bookmark.
- Focused service/security/rendered-contract tests and local migration `0076`
  pass. No staging/browser claim is made.

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

The current local branch strengthens this preflight without adding a dependency:
every central entry must map to one exact contiguous local header; paths, flags,
compression method, sizes and optional data descriptor must agree; leading
polyglot bytes and unreferenced inter-entry bytes are rejected. Stored and raw
deflate payloads are expanded through the Workers-standard streaming
`DecompressionStream`, bounded by declared size, the existing 200 MB aggregate
cap and a 15-second deadline, then checked against the central CRC32. These
controls are covered by valid stored/deflated/data-descriptor fixtures plus
local-header, polyglot and CRC corruption tests. This checkpoint is not yet
deployed and does not replace the disabled malware scanner.

The archive gate is deployed to protected staging as Worker version `3bc029a3-8722-4edd-8c05-d615d5ce9a13`. It does not mark a file safe or bypass the absent malware scanner. Exact verification and rollback evidence is in `STAGING-PHASE5-ARCHIVE-SAFETY-EVIDENCE.md`.

The current local candidate extends the post-safe boundary for bounded ZIP
packages. A package containing scans is queued for per-member conversion rather
than passed opaquely to OCR. The consumer repeats deep verification, validates
inner magic bytes and DOCX structure, uses opaque deterministic provider names,
requires exact response identity/MIME/token/text evidence, and writes one
deterministic tenant-scoped derivative. Reordered results are supported;
duplicate or missing identities fail without derivative or downstream analysis.
Limits are 20 files, 20 MB compressed input, 20 MB per expanded member, and
50 MB total expanded working set. Targeted tests pass 14/14. This candidate is
not deployed and does not bypass the absent malware scanner.

The next local package slice adds a bounded, deterministic relationship context
without treating filenames as legal evidence. Each verified member receives an
opaque stable ID and a tentative role (`primary`, `annex`, `amendment`,
`acceptance_act`, `correspondence`, `evidence`, or `unknown`). JURO records
role-based links, explicit filename references and exact normalized-text
duplicates, caps the graph at 120 prioritized edges, and validates every member
and edge when an OCR derivative is reloaded. The context is persisted with the
analysis, included only inside the provider's `untrustedDocument` envelope, and
shown in the RU/UZ review surface with confidence and a mandatory verification
notice. Targeted extraction/OCR/processor/provider tests pass 24/24. This slice
is local only; it does not mark any file safe or claim staging provider output.

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
- an explicit AI-chat confirmation can convert only a persisted, tenant-owned structured response into one new UUID-compatible case, immutable version-1 plan, steps, tasks, case event, and workspace audit event; client-supplied plan text is never accepted and retries return the existing case;
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

Confirmed action-plan changes now stage status/date edits in the client, show a bilingual diff, and require an explicit apply action. The protected batch route verifies every step and workspace, checks the plan revision, updates linked tasks/reminders when they exist, records one immutable snapshot and one audit event. This does not infer statutory dates. Staging evidence: STAGING-0079-CONFIRMED-ACTION-PLAN-EVIDENCE.md.
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

### Authenticated lawyer detail route (staging)

The directory now links to a bilingual authenticated detail route at
`/:locale/:accountType/lawyers/:lawyerId`. The API requires a UUID and an active
session, returns only a public-approved profile, and independently recomputes
the approved rating/review projection on the server. It limits the review text
to three safe approved excerpts and never serializes requester, workspace,
moderator, or moderation-reason fields. Protected staging version
`0ecee8c7-af31-46a7-8c1b-1aa903986e8c` receives 100% traffic. Evidence:
`STAGING-0062-AUTHENTICATED-LAWYER-DETAIL-EVIDENCE.md`.

## Payment foundation — local Stage 1

Locally implemented behind environment gates:

- approved/versioned plan, pricing-policy and tax-profile lookup;
- integer-minor-unit pricing with deterministic rounding;
- idempotent tenant-owned order creation and immutable pricing snapshots;
- RU/UZ checkout with explicit one-time versus auto-renew consent;
- draft/issued/paid invoice lifecycle;
- signed, timestamp-bounded sandbox webhook verification;
- amount/state/replay validation before any financial side effect;
- atomic subscription activation, compatibility payment record, entitlements,
  audit event, and balanced posted ledger transaction;
- authenticated RU/UZ order/payment screens for personal and canonical business
  workspace routes;
- retry after decline without repricing or duplicate consent;
- production and real-provider paths fail closed.

Migration `0061`, the staging-only signing-secret name, and the synthetic
staging price fixture are now deployed only to protected staging after explicit
owner permission, private D1 pre/post checkpoints, checksum round trips and an
isolated restore rehearsal. Worker version
`9051c167-8e1a-46c8-86f8-c7f6c9e75b82` serves commit `1a6074b`; production is
unchanged. The final authenticated checkout-to-signed-sandbox-event E2E remains
an open Stage-1 gate. See `STAGING-0061-PAYMENT-FOUNDATION-EVIDENCE.md`.

## Phase 4 — encrypted user memory (local candidate)

The privacy settings route now exposes RU/UZ controls backed by a real
authenticated API: list, create, edit, delete, clear accessible memory, and
enable or disable narrow automatic extraction. Entries are encrypted at rest
with record-bound server-side key material and tenant-filtered before
decryption. Passwords, OTP/TOTP codes and payment-card-like values are rejected;
manual high-sensitivity entries require an explicit checkbox on both creation
and edit.

The legal-chat route loads at most 20 user-owned global/current-workspace
entries, binds them into the idempotency request hash, and passes only their
category, scope and statement to OpenAI or Anthropic as untrusted user context.
Successful persisted user messages may produce bounded safe memory candidates.
Memory failure does not create a false AI failure; privacy export instead fails
closed if it cannot decrypt a complete visible memory set.

The existing locked five-minute scheduled runtime now also hard-purges at most
100 memory tombstones after seven days. It is inert before `0062`, preserves
active/future rows, cascades source metadata and records only aggregate counts.
Local evidence: the combined AI-memory and Worker scheduled-runtime suite passes
34/34, with type-check and lint also passing. Migration `0062`, keyring
validation, remote scheduled-run evidence, staging deployment, authenticated
RU/UZ browser QA and production remain open.

## Phase 6 — AI plan destination (local candidate)

The AI answer surface now lets the user choose either a new case or one of the
real non-archived cases returned by the tenant-scoped AI bootstrap response.
The selected case ID is only a locator: the server re-reads the persisted
assistant message and derives every step, source reference and task from its
validated structured result.

For an existing case, JURO appends steps after the current plan, increments the
optimistic plan/case revision, writes an immutable `ai_plan_appended` snapshot,
creates real tasks, case activity and workspace audit evidence, and makes an
exact retry idempotent. A foreign/archived case is neutral not-found. New
AI-created steps use UUID identities; a strict compatibility pattern keeps
already-deployed legacy AI steps editable. Focused tests pass 7/7 and
type-check passes. This is local evidence only until the reviewed staging
artifact is deployed and traversed through an authenticated RU/UZ session.

## Phase 6 — canonical manual case creation (protected staging)

The cases list opens a dedicated RU/UZ `cases/new` route for personal and explicit business workspaces. The form uses a shared allowlisted scenario catalog and persists through the authenticated, CSRF-protected cases API. The server resolves the tenant, rejects cross-audience scenarios and writes the case, plan, four initial steps, immutable version and case event atomically. A successful local HTTP/D1 smoke created and re-read the same case. Worker version `06028d89-322c-42d4-95f2-41d89da8461e` contains the route; authenticated Access traversal remains an open staging gate. See `STAGING-0087-CANONICAL-CASE-CREATE-EVIDENCE.md`.

## Phase 4/8 — canonical plain voice mode (local candidate)

The existing encrypted voice-message backend is now exposed through canonical
personal and explicit business-workspace `ai-lawyer/voice` routes. Those routes
open the same tenant-owned AI conversation with `mode=voice`, so text, voice,
case context, history, usage and retry semantics do not diverge. Dashboard has
a direct voice entry.

The RU/UZ client exposes actual microphone, transcription, provider-processing
and playback states; recording never starts automatically. It supports five-
minute recording, pause/stop/cancel, editable transcript review, explicit send,
selectable TTS voice, captions, mute, stop and replay. The verified Jurobek WebP
is a static poster only; voice-with-avatar remains disabled without an approved
rig. Focused route, D1/R2/provider-contract and UI-state tests pass 11/11.
Protected staging deployment and authenticated browser/provider evidence remain
open. Production is unchanged.

## Phase 5 — reviewable analysis corrections (local candidate)

Completed analyses now have a real server-backed suggestion lifecycle: exact
old/new text review, accept/reject, selected/all application, immutable normalized
versions, authenticated checksum-verified downloads, audit, idempotency and
account-deletion R2 cleanup. The existing RU/UZ analysis screen exposes loading,
empty, partial, stale, ambiguous, error and success states. No mock correction is
shown and no original PDF/DOCX is mutated. Local typecheck, lint, full tests,
development/staging builds and artifact validation pass. Staging application and
provider-generated end-to-end evidence remain pending migration 0069 approval.

The same local surface now requests four real queued artifacts for each immutable
corrected version: clean DOCX/PDF and DOCX/PDF with explicit change marks. The
redline representation labels deleted and added text in words and supplements it
with strike/underline plus accessible status color; the corrected normalized text
is included after the change schedule. Downloads and deletion reuse the existing
tenant-scoped private export boundary. These exports do not claim to preserve the
source PDF/DOCX page geometry or native Word tracked changes. Migration 0070,
staging deployment and authenticated provider-generated verification remain open.

## Phase 5 — persisted comparison exports (local candidate)

Completed and partially completed comparisons now request real PDF/DOCX jobs
instead of generating transient bytes in the request handler. D1 records,
outbox/Queue dispatch, private R2, conditional writes, checksum verification,
audited download/delete, idempotency, RU/UZ processing/failure/retry states and
account-deletion cleanup are connected end to end. DOCX redline output includes
explicit removed/added wording plus strike/underline marks, so meaning is not
color-only. Synthetic tests generate and inspect both formats and deny a second
tenant. This is local only until migration 0071 and its Worker are authorized.

## Phase 5 — review decisions for comparison changes (local candidate)

Every detected change now supports an explicit owner decision: accept, reject,
or clear back to pending. The RU/UZ reading-first change card persists through a
strict Zod/CSRF route and shows a textual state with accessible pressed buttons.
The backend rechecks comparison, workspace and owner, uses optimistic transition
versions plus unique event IDs for concurrent/idempotent writes, and appends a
metadata-only audit event. A decision marks the row reviewed but never creates a
merged document or mutates either source version. Migration `0072`, protected
staging browser evidence and deployment remain separately gated.

## Phase 5 — reproducible document evaluation artifacts (local candidate)

The 100-row/30-pair evaluation manifest now materializes into actual deterministic
DOCX, text PDF, raster-only scanned PDF, JPEG, PNG and multi-document ZIP files.
Each run emits hashed synthetic ground truth and an artifact manifest, then
re-reads all binaries to verify safe paths, byte counts, unique SHA-256 values
and format magic. The verified local full run produced 100 distinct artifacts
totaling 5,502,884 bytes with zero integrity failures.

The release validator requires exact artifact-manifest binding plus real staging
file/analysis/scan/provider evidence and timestamped named human review; it cannot
pass rows that omit those fields. It validates consistency rather than remote ID
or reviewer authority, so protected staging D1 evidence and an approved reviewer
roster remain mandatory. The artifacts have not yet traversed the unavailable
real malware scanner or staging provider pipeline.

## Phase 5 — reconciled immutable analysis objects (local candidate)

Every initial or corrected normalized analysis version now creates a durable,
tenant-bound write intent before its private R2 write. The D1 version insert is
fenced by exact key, size, SHA-256, source kind and target version; a trigger
attaches the intent atomically. A scheduled reconciler claims stale losing
writers, deletes only their unique exact key, verifies absence and appends a
metadata-only audit event. Account deletion includes unfinished intents.
Synchronized local concurrency proves one corrected-version winner and one
reclaimed orphan while preserving both attached objects. Migration 0073 and the
matching Worker remain local until a separately authorized staging cycle.

## Phase 5/6 — document analysis inside a case (local candidate)

A secure analysis upload can now begin inside a server-validated active case,
and an existing owner analysis can be moved or detached through a dedicated
authenticated/CSRF-protected endpoint. The RU/UZ review surface preserves case
context in the URL, offers real workspace cases, and shows linked analyses in the
canonical case `analyses` tab alongside comparisons.

Migration `0074` makes the relation durable and race-safe: the current projection
is trigger-owned, each change has one immutable tenant-bound event, stale writers
cannot overwrite a winner, scoped retries are idempotent, and link/unlink activity
plus metadata-only audit are automatic. Focused tests pass upload-time linking,
move, unlink, cross-tenant denial, stale writer, direct mutation, route boundary
and account deletion. The migration is applied only to local development;
staging and production are unchanged.

## Phase 6 - existing builder document to case lifecycle (local candidate)

The localized document list now exposes a native owner-only case selector backed
by a real authenticated and CSRF-protected endpoint. It lists only active cases
from the server-resolved workspace, never exposes an owner's case ID through a
collaborator projection, and reports saving, success and recoverable error states
to assistive technology. Archived documents cannot be reassigned.

Migration `0075` makes move/unlink operations append-only, idempotent and
race-safe. D1 rejects cross-tenant targets, direct projection mutation, actor
substitution, stale writers and retained-event mutation. Moving a document also
clears a plan step from the former case. Case activity and metadata-only workspace
audit are created automatically. Focused service/UI/route tests pass 5/5 and the
complete migration safety suite passes 57/57 locally. Staging and production are
unchanged. Wrangler applied `0075` only to local `juro-development`.

## Tenant-safe user-document Vectorize retrieval (local candidate)

Migration `0080` adds a D1 source-of-truth ledger for immutable analysis
document versions and their vector chunks; no document text is stored in the
ledger or queue envelope. Completed analysis and corrected-version transactions
create an identifiers-only `document.index` outbox intent. The existing
document-analysis consumer verifies the exact private-R2 object size and
SHA-256, creates bounded 1,536-dimensional OpenAI embeddings, and upserts each
chunk into the environment-specific `USER_DOCUMENTS_INDEX` under the workspace
namespace with the required user/workspace/case/document/version/scope/language/
page/source-hash metadata.

Global search first proves active workspace membership, then queries only that
namespace. Every match is independently joined to D1, restricted to the owner
and latest immutable version, compared field-by-field with returned metadata,
and re-read from checksum-verified private R2 before a snippet is returned.
Vector metadata is never an authorization decision. A newer corrected version
submits deletion of older vectors, and account purge submits bounded deletion
before D1/R2 removal, failing closed when indexed rows exist without Vectorize.

Focused tests prove deterministic overlap chunking, exact metadata, owner-only
search, cross-workspace denial, denial to a non-owner workspace member, metadata
tampering rejection, D1 trigger fencing, purge deletion, and foreign-key
integrity. Remote indexes are still empty and migration `0080` is unapplied;
therefore this section is a local candidate, not staging or production evidence.

## Provider usage and embedding cost observability (local candidate)

Migration `0081` records every document-indexing and document-search embedding
attempt as an immutable metadata-only event and updates its daily aggregate in
the same D1 batch. Successful calls use OpenAI's returned model, request ID and
actual token usage. HTTP/network/schema failures record a bounded error code and
do not report a fabricated charge.

Prices are immutable, effective-dated administrator records rather than
hard-coded runtime constants. The source URL must be official HTTPS on the
matching provider domain. An absent effective price produces an explicit
unpriced count. The dense RU/UZ `/:locale/admin/costs` surface and API require
the administrator-only operations capability plus fresh MFA; mutations are
CSRF-protected.

Focused tests cover exact integer cost calculation, unpriced calls, failed calls,
duplicate event rollback, immutable events/prices, provider-bound source URLs,
account-deletion retention without content, staff-role separation and the admin
route boundary. Migration `0081`, official price configuration and remote
reconciliation remain unapplied/unverified in staging; production is unchanged.

## Operational feature stops (local candidate)

Migration `0084` and the matching server service implement per-environment, append-only controls for authenticated and guest AI chat, document-analysis ingestion, new lawyer handoff and voice processing. Server-side checks happen after authentication/tenant resolution where applicable and before provider transport, usage reservation, R2 write, queue creation or lawyer-request persistence. Disabling a feature does not block reading or deleting existing user data.

Every operator transition records a real server-derived actor, bounded non-sensitive reason, monotonic version and SHA-256 predecessor chain. D1 rejects gaps, substitution, update and delete; the service re-verifies integrity before execution and before another transition. The protected RU/UZ `/:locale/admin/feature-flags` surface requires `staff.operations.manage`, fresh MFA and CSRF. It provides visible focus, a skip link, 44 px actions, direct language switching and a minimal reduced-motion-safe press response. Five focused lifecycle/security tests and type-check pass. Migration, authenticated browser rehearsal and staging deployment remain separately gated; production is unchanged.

## Operational job monitor and guarded redrive (local candidate)

Migration `0085` adds immutable, tamper-evident operator evidence for a bounded
manual redrive. The protected RU/UZ `/:locale/admin/jobs` surface reads only
identifiers and safe status/error metadata from `job_runs`, `job_outbox` and
`scheduled_runs`; it never returns a queue body, document text, prompt,
provider body, message ID, idempotency key or envelope hash.

Redrive reopens the same identifiers-only durable job and outbox projection with
the same idempotency key. It does not create a second logical operation. D1
independently verifies the environment, job/outbox relationship, previous
projection, expired lease and recoverable typed error before applying the state
change. Permanent validation/security failures remain blocked. The API requires
`staff.operations.manage`, active TOTP, MFA verified within 15 minutes and CSRF
for POST. Focused tests cover safe projection, immutable evidence, active-lease,
permanent-error, cross-environment and broken-chain denial. Migration `0085`,
authenticated staging rehearsal and any live Queue/DLQ operation remain
separately gated; production is unchanged.

## Protected platform audit log (local candidate)

Migration `0086` adds immutable, actor/session/assignment-bound access evidence
for the RU/UZ `/:locale/admin/audit-log` console. Its POST-only API projects a
bounded union of existing security, staff-role, workspace and operational event
tables. The projection contains only identifiers, event type, severity and time;
metadata JSON, IP hashes, user content, provider payloads, queue envelopes,
message IDs and hash-chain internals are never selected or returned.

Both queries and CSV exports require `staff.security.audit`, active TOTP, MFA
verified within 15 minutes and CSRF. D1 independently checks the live session
and administrator assignment before it appends access evidence. Focused tests
cover safe projection, query/export chaining, immutable triggers, forged support
denial, corruption fail-closed behavior, strict filters and CSV formula
neutralization. Migration `0086`, authenticated browser QA and staging deploy
remain separately gated; production is unchanged.

## AI legal quality-review queue (local candidate)

Migration `0087` adds deletion-coupled review content and retained, immutable
access/decision evidence. The RU/UZ `/:locale/admin/ai-quality` surface lists
only feedback/run metadata, records a separate audited view before revealing
question/answer/comment content, and appends versioned classifications,
reviewer notes, optional corrected answers and optional golden answers.

The POST-only API requires `ai.quality.review`, active TOTP, MFA within 15
minutes and CSRF. D1 independently proves the live `legal_reviewer` assignment,
session and chain head. Focused tests pass metadata minimization, explicit view,
multi-version resolution, stale feedback detection, deletion retention, forged
role rejection, immutable triggers, tamper detection and route boundaries.
Migration `0087`, authenticated browser QA and staging deploy remain separately
gated; staging is through `0078` and production is unchanged.
## Protected AI runtime settings (local candidate)

- `/:locale/admin/ai-settings` and `POST /api/platform/admin/ai-settings`
  provide RU/UZ, noindex, fresh-MFA administrator-only model selection.
- The UI contains selects only. Values must already exist in Cloudflare
  server variables; arbitrary model names and protected system rules cannot be
  submitted through the strict API schema.
- Every accepted change creates an immutable, sequential, hash-chained D1
  version with actor/session/assignment/MFA evidence and an operator reason.
- Registered chat, guest chat, document analysis and builder provider adapters
  resolve the active version. Chat and analysis `ai_runs.instruction_hash`
  binds the exact runtime config hash used for the provider call.
- Focused security and migration verification passes 64/64. Migration `0088`
  is not applied to staging; staging remains through `0078`.
## Historical legal applicability (local checkpoint after migration 0089)

Authenticated and guest AI request contracts now accept an explicit Uzbekistan
calendar date. Retrieval uses the current verified publication by default and a
lexical-only, evidence-revalidated archived version for a historical date. The
AI provider receives the exact applicability instant, and returned citations
are labelled `historical` rather than `current`. Historical retrieval never
uses the Vectorize index that contains current publications only.

This is code and local-test evidence, not staging activation. It produces a
confirmed historical source only when a human-reviewed version already has an
`effective_at` interval; broad historical Lex backfill and reviewer date-entry
UI remain open.
