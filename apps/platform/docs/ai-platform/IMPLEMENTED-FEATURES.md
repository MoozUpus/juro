# JURO implemented-features checkpoint

Updated: 2026-07-28
Scope: verified local source and tests on the integration worktree. This is not
staging or production evidence.

## Phase 2 identity and workspace slices

| Slice | Locally implemented and tested | Not yet proved |
|---|---|---|
| Workspace invitation acceptance | Strict bounded RU/UZ input; exact token/identity binding; staging migration `0022` unique immutable claim; one D1 batch for claim, membership, default-workspace, and audit; one winner under concurrency; existing owner role preserved; rollback on audit failure | Protected staging HTTP/concurrency flow; broader append-only workspace audit; business route containing `workspaceId` |
| OTP request limits | Separate `5/email/hour` and `20/IP/hour` gates; retained lookup-key versions share buckets; invalidated provider failures count toward email limits; missing connecting IP does not merge unrelated users; 60-second resend cooldown retained | Remote D1 behavior; live traffic/rate behavior; enumeration parity through protected staging |
| OTP verification lock | Staging migration `0023` adds immutable `verification_locked_until`; fifth wrong attempt applies a 15-minute lock; replacement challenge is denied while locked | Full-HTTP remote concurrency and lock timing |
| Turnstile | Server Siteverify integration with action `auth_otp`, exact hostname, optional remote IP, eight-second timeout, schema validation, and fail-closed invalid/unavailable handling; client widget integrated into auth flow | Real site/secret bindings, hostname configuration, provider response, browser widget, and Resend mailbox flow in staging |
| Session persistence | 24-hour default and 30-day explicit remember-me absolute lifetimes; aligned cookie `Max-Age` and D1 expiry; same choice after OTP or MFA; strict boolean inputs with false default; existing seven-day idle cap | Remote cookie/session behavior; rotation, fixation/replay detection, region signals, and security email |
| Structured onboarding | Canonical `/:locale/onboarding`; strict 4 KiB Zod input; required separate names, normalized phone with explicit unverified evidence, personal persona, primary goal, and exact current policy digests; deterministic personal workspace creation; staging migration `0024` applied | Protected staging browser flow; final policy approval; phone verification |
| Localized auth and persona routing | Canonical RU/UZ login/register routes; guest root defaults to Uzbek; registration personas are individual, entrepreneur, or lawyer; workspace switches preserve the stored persona; `dashboard` is canonical and localized `main` uses a tested 308 redirect; legacy builder redirects preserve supported personas | Staging HTTP/browser evidence; business `workspaceId` route |

## Evidence checkpoint

The latest recorded successful local full suite contains:

- 27 rendered-route/security tests;
- 241 core/auth/document tests;
- 68 Cloudflare/migration/job tests, including the remote-D1 trigger syntax regression;
- 336 tests total.

This evidence includes local migration/schema contracts and service-level
concurrency/rollback paths. It does not substitute for remote migrations,
live provider calls, a deployed staging Worker, or browser E2E on a protected
staging hostname.

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

- production was not changed;
- `juro-production` and `juro-development` remain through migration `0004`;
- `juro-staging` is through migration `0028` with portable checkpoint and local restore evidence;
- `juro-production` and `juro-development` were not changed;
- `LEGAL_SOURCE_STAFF_API_ENABLED=false` is pinned in development, staging,
  and production source/artifacts;
- inactive staging Worker version `14d89ac0-19f5-4c0d-89f5-7db97a50bb44`
  is verified with staging-only bindings, no routes/schedules/consumers/secrets,
  and all execution feature flags false;
- live Turnstile and Resend delivery are unverified.
