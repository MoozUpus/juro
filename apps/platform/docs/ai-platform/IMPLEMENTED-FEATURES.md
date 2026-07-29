# JURO implemented-features checkpoint

Updated: 2026-07-30
Scope: verified local source/tests plus the protected staging deployment described below. Production remains separate and unchanged.

## Phase 2 identity and workspace slices

| Slice | Locally implemented and tested | Not yet proved |
|---|---|---|
| Business workspace creation | Strict 2 KiB RU/UZ payload; normalized full/short identity; UUID idempotency; authenticated same-origin/CSRF boundary; one D1 batch for workspace, owner membership, active selection, and audit; exact retry; cross-user/mismatch denial; migration `0034` legacy backfill and DB guards; responsive inline settings form | Fresh staging backup/restore, remote `0034`, deployment, authenticated browser and cross-account HTTP evidence |
| Workspace invitation acceptance | Strict bounded RU/UZ input; exact token/identity binding; staging migration `0022` unique immutable claim; one D1 batch for claim, membership, default-workspace, and audit; one winner under concurrency; existing owner role preserved; rollback on audit failure; business redirect contains the accepted `workspaceId` | Protected staging HTTP/concurrency flow and broader append-only workspace audit |
| OTP request limits | Separate `5/email/hour` and `20/IP/hour` gates; retained lookup-key versions share buckets; invalidated provider failures count toward email limits; missing connecting IP does not merge unrelated users; 60-second resend cooldown retained; aggregate staging D1 reports three provider-accepted challenges | Live traffic/rate behavior, provider failure, and enumeration parity through protected staging |
| OTP verification lock | Staging migration `0023` adds immutable `verification_locked_until`; fifth wrong attempt applies a 15-minute lock; replacement challenge is denied while locked | Full-HTTP remote concurrency and lock timing |
| Turnstile | Server Siteverify integration with action `auth_otp`, exact hostname, optional remote IP, eight-second timeout, schema validation, and fail-closed invalid/unavailable handling; client widget integrated into auth flow; exact staging site/secret binding names are present | Current-version browser widget trace, provider response correlation, and Resend mailbox/failure flow in staging |
| Session persistence and token rotation | 24-hour default and 30-day explicit remember-me absolute lifetimes; aligned cookie `Max-Age` and D1 expiry; same choice after OTP or MFA; strict boolean inputs with false default; existing seven-day idle cap; MFA elevation, MFA disable, confirmed email change, and the locally integrated 12-hour periodic route each atomically retire the current token digest, return a replacement cookie, and preserve absolute expiry; the shell uses a delayed, jittered, visibility-aware same-origin/CSRF scheduler; periodic rotation alone has a 30-second in-flight-request grace in which the retired token is rejected without revoking the replacement session, while later replay and every sensitive-trigger replay revoke the session/device and append critical audit evidence; guarded races leave one winner and no partial side effects; staging migration `0029`, restore drill, and the MFA elevation/disable Worker deployment pass | Push/deploy and exercise email-change notification plus periodic rotation; exact authenticated HTTP/cookie/replay behavior for every trigger; approximate region signals |
| Opaque browser continuity | Successful primary/MFA login issues a server-generated HttpOnly/Secure/SameSite=Lax token only when the identity keyring exists; D1 retains only user-bound versioned HMAC evidence and coarse region; concurrent first use, key rotation and tenant isolation are covered; normal logout preserves trust while security revoke, replay, logout-all, email change and account deletion revoke the applicable continuity; migration `0031` and Worker code are deployed to protected staging | Authenticated staging HTTP/cookie/revoke evidence remains open; the token is not an authentication factor and a stolen token can only affect future novelty classification |
| Login-security notification | Continuity-backed new-device/coarse-region classification, encrypted-recipient job, identifiers-only outbox, MFA sequencing, RU/UZ copy and idempotent retry behavior are tested; migration `0032`, Worker handler and the isolated staging email consumer are deployed | Protected primary/MFA HTTP, real controlled Resend delivery, DLQ/redrive and false-positive observation remain open |
| Prior-address security notification | Confirmed email change atomically creates encrypted-recipient evidence and an identifiers-only outbox job; migration `0030`, the staging-only email consumer and async runtime are deployed with provider idempotency and bounded retry semantics | Real prior-mailbox delivery, protected HTTP evidence and operator DLQ/redrive remain open |
| Account-deletion purge probe | A strict staging-only synthetic subject, disabled-by-default flag, real Cron/Queue path, phase-safe error codes, D1/R2 cleanup contract, production fail-closed guard, and two real dispatches are implemented | The deployed `IDENTITY_KEYRING` is malformed, so both runs stopped before fixture creation; full D1/R2 purge proof requires owner-managed key replacement and rerun |
| Structured onboarding | Canonical `/:locale/onboarding`; strict 4 KiB Zod input; required separate names, normalized phone with explicit unverified evidence, personal persona, primary goal, and exact current policy digests; deterministic personal workspace creation; staging migration `0024` applied | Protected staging browser flow; final policy approval; phone verification |
| Localized auth and persona routing | Canonical RU/UZ login/register routes; guest root defaults to Uzbek; registration personas are individual, entrepreneur, or lawyer; business routes use `/:locale/business/:workspaceId/*`; shell, builder, invitations, and switching preserve that base; legacy reserved business roots remain authenticated compatibility adapters | Current-version protected staging browser evidence |

## Evidence checkpoint

The latest recorded successful local full suite contains:

- 27 rendered-route/security tests;
- 283 core/auth/document tests;
- 80 Cloudflare/migration/job tests, including migrations `0029`–`0034`, encrypted security-email evidence, account-deletion purge, continuity-backed login alerts, atomic rollback, cron, and queue concurrency/replay contracts;
- 390 tests total.

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
- `juro-production` and `juro-development` remain through migration `0004`; `juro-staging` is through `0033` with 34 ledger rows, `quick_check=ok`, empty foreign-key check, and pre/post private-R2 checkpoints.
- Protected staging deployment `bafea8e2-d061-4180-827b-1c047858fb36` serves Worker version `afde477b-db83-498f-aaf8-1a2e5aa9ab44` at 100% from commit `401c8b3`; `STAGING_SYNTHETIC_PROBES_ENABLED=false` in the final deployment.
- Secret values were never read; the control plane exposes only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY` by name plus the public Turnstile site key.
- Owner-only Access denies anonymous root, canonical builder, and deletion API requests with 302 plus `no-store`.
- Exactly two staging consumers and one five-minute cron are active. Two synthetic deletion jobs were dispatched once each and rejected before fixture creation with `STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED`; no synthetic D1/R2 data was created. Legal ingestion and staff APIs remain disabled.
- Authenticated current-version browser/cookie/provider evidence remains open because the browser runtime exited before tab connection; Access was not bypassed.

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
buttons instead of pointer-only article clicks. Local type-check, lint, full
tests, staging build, dry-run, CI, staging deployment, control-plane re-read,
and anonymous Access denial pass. Authenticated remote browser verification is
still required before the localized workspace UI is marked fully verified.

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
- Local evidence: 27 rendered route/security tests, 283 core tests, and 80 Cloudflare tests; type-check, lint, generated binding check, staging build/artifact, three-environment dry-run matrix, builder smoke, comparison smoke, and secret-pattern scan pass.

Migrations and the Worker runtime are deployed to owner-only protected staging. D1 integrity, exact schema, control-plane attachments, anonymous Access denial, one completed durable cron run, and the post-migration private-R2 backup are verified. A synthetic authenticated deletion through HTTP/UI, live email delivery, DLQ/redrive, and the broader browser/accessibility matrix remain open. Production is unchanged.
