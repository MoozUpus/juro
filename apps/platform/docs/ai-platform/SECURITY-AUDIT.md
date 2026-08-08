# JURO security audit

Audit date: 2026-07-28
Production Sites revision: `4031078`
Integration branch baseline: `1d3d23d` before this documentation update
Method: source review, production HTTP smoke checks, current test suite, targeted secret scan. No destructive testing was performed against production.

## Risk summary

| Scope | Current state | Release consequence |
|---|---|---|
| Deployed Sites v20 | four original critical findings remain unproven in production | production remains frozen |
| Integration branch / protected staging | SEC-001 and SEC-002 have local fixes; identity/workspace migrations through `0034`, reviewed Queue consumers, cron, and owner-only Access are active in isolated staging; bounded authenticated RU/UZ builder routing is verified; legal staff routes remain disabled by `LEGAL_SOURCE_STAFF_API_ENABLED=false`; SEC-004 remains open | no upload/AI staging enablement; identity controls still require live-provider, cookie/replay, concurrency, cross-account, and full-HTTP evidence; legal review/ingestion requires separate controlled activation; Advice remains disabled |
| High/medium findings | several local identity/security foundations exist, but broad file, deletion, CSP, alerting, and privileged-access controls remain open | affected features remain disabled or unavailable |

## Critical findings

### SEC-001 — document access before invitation acceptance

The collaboration create path inserts a collaborator with `status='invited'` and `can_view=1`. The permission helper rejects only `revoked`, so an authenticated invitee can view the document before using the one-time invitation token.

Impact: unauthorized disclosure and invalid consent/access audit.

Required fix:

- invited status grants no object access;
- acceptance must atomically consume the token and activate the collaborator;
- direct object access before acceptance must return a neutral response;
- update the existing smoke test, which currently expects the insecure behavior;
- add replay and concurrent-accept tests.

Integration-branch status: fixed and covered by pre-accept denial, replay-safe atomic acceptance/decline, one-winner concurrency, and audit rollback tests. The code and migration are present in owner-only protected staging, but the collaborator invitation flow has not been exercised through protected staging HTTP, so the production finding remains open.

### SEC-002 — cross-workspace builder listing

The document list is filtered by owner/collaborator but not by the active workspace. Documents from multiple tenant spaces can appear in one workspace view.

Impact: tenant isolation failure.

Required fix:

- scope owned documents to active workspace;
- model external shared documents as an explicit separate access scope;
- validate every object query with membership and object ownership;
- add a complete cross-user/cross-workspace matrix.

Local branch status: fixed for owned builder documents/files through an active-workspace boundary, with accepted external collaboration isolated into an explicit shared scope. Negative tests pass locally; the remote production schema is still at the older migration state.

### SEC-003 — OTP verification race

OTP read, comparison, attempt increment, consumption, and session creation are not a single conditional transaction. Parallel valid requests can create multiple sessions.

Impact: one-time semantics can be bypassed.

Required fix:

- conditional atomic consume;
- one resulting session per challenge/idempotency key;
- 15-minute verification lock after maximum failures;
- concurrency tests.

Local branch status: atomic guarded claims and concurrent valid/invalid verification tests pass locally. The fifth failed verification atomically exhausts the challenge and records a 15-minute `verification_locked_until`; a new challenge for that email is refused while the lock is active. Migration `0023`, live Resend/Turnstile behavior, and the full HTTP race against remote D1 remain unverified, so the production finding is not closed.

### SEC-004 — unsafe file reaches AI before scan

Document review accepts a normal multipart form, reads the file into memory, stores it, and can send content to the AI provider without quarantine, malware scan, or a `safe/ready` gate.

Impact: unsafe file processing and untrusted-content exposure.

Required fix:

- private direct/multipart upload;
- magic-byte and archive validation;
- quarantine and a real scanner adapter;
- fail-closed policy where scanning is mandatory;
- async state machine before provider access.

## High findings

### SEC-005 — deployed OTP controls do not meet policy

- email and IP requests are combined with `OR` under a single 8/hour cap;
- required independent 5/email and 20/IP limits are absent;
- Turnstile is absent;
- hash is `SHA-256(salt:code)` without `OTP_HASH_SECRET`;
- generic anti-enumeration responses are incomplete.

Local remediation status: migration 0018 and the application contain a
disabled expand layer for domain-separated, versioned HMAC evidence covering
OTP email/IP lookup and challenge-bound codes. The request path now enforces
separate `5/email/hour` and `20/IP/hour` predicates and counters, preserves
rate buckets across retained lookup-key versions, counts invalidated provider
failures toward the email limit, and omits the IP gate when Cloudflare supplies
no connecting IP rather than merging unrelated users. The server/client
Turnstile integration validates the official Siteverify response, exact
`auth_otp` action, and expected hostname and fails closed on invalid,
malformed, timeout, or transport results. Checked-in identity protection mode
is still `legacy`, legacy salted code SHA remains stored, and no live
Turnstile, live Resend, remote migration `0023`, or full-HTTP staging test has
run. SEC-005 is therefore not remotely closed.

### SEC-006 — deployed session and device security incomplete

- all sessions use a 30-day expiry;
- no 24-hour non-remember mode;
- no rotation, device record, location, activity update, single-session revoke, fixation/replay detection, or security-event revocation;
- no new-device or region security mail.

Local remediation status: migration 0013 and the application add device-aware
JURO sessions, a 24-hour standard absolute lifetime, a 30-day remember-me
absolute lifetime, cookie/persisted-expiry alignment, a seven-day idle cap,
current/single/other/all revocation, and an append-only security-event chain.
The same lifetime choice flows through both direct OTP and MFA completion.
Protected email change also revokes every other local session/device. Its local
implementation now retires the exact current token, preserves the verified
session ID with a replacement cookie, and does not extend absolute expiry. MFA
elevation and MFA disable are deployed to protected staging and use the same
one-claim replay revocation boundary; email-change deployment is pending. The
local email-change transaction now also creates one encrypted prior-address
security-email job and one identifiers-only outbox row. A staging-only Resend
consumer candidate fences parallel sends and provider replay, but migration
0030, the consumer, and real mailbox delivery are not remotely active. A local
12-hour periodic rotation route now requires the same-origin/CSRF contract,
atomically retires the current digest, preserves absolute expiry, and is called
by a delayed, jittered, visibility-aware shell scheduler. A 30-second grace
applies only to a periodic retired token already captured by an in-flight
request: it remains unauthenticated but does not revoke the replacement session;
later replay and every sensitive-trigger replay remain fail-closed. Exact
current-version protected HTTP/cookie/replay evidence and deployed
continuity-backed region/new-device mail remain absent; SEC-006 is therefore
not closed.

### SEC-007 — weak standalone share secret

The standalone signed share uses a four-digit code, stores both plaintext and hash, and has no attempt rate limit or lock.

### SEC-008 — hard delete destroys evidence

Document deletion cascades through collaboration/history. The database delete occurs before R2 deletion, so object-store failure can also leave an orphan.

### SEC-009 — sensitive data is plaintext

Email, phone, identity fields, user content, document text, and AI results lack the required protected lookup/envelope-encryption model.

Local remediation status: migrations 0016–0018 and the application now contain
disabled expand layers for canonical `user_profiles` email/phone and
workspace/document invitation evidence. Workspace invitation email has
record-bound ciphertext plus keyed lookup; document targets have
purpose-separated keyed lookup; OTP/deletion challenges have non-recoverable,
purpose-separated keyed evidence. All checked-in environments remain in
`legacy`, no remote row was backfilled, and workspace/profile/challenge
plaintext plus legacy SHA fields are intentionally retained. Contact identity
fields, document/AI content, staging key configuration, dependency-safe
retention drain, and contract migrations remain open; SEC-009 is therefore
not closed.

### SEC-010 — append-only audit is erasable

In deployed Sites v20, no tamper-evident chain or protected periodic export exists and cascades can remove audit and consent evidence. The integration branch adds hash-chained `security_events`, immutable policy evidence, and a separate immutable platform-staff role-event chain; their schema is present in isolated staging. They cover only part of the required evidence and no periodic protected audit export is active, so SEC-010 remains open.

### SEC-011 — CSRF validation is weak

The deployed baseline write guard checks `Origin` only when supplied and accepts a static `x-juro-csrf: 1`. The integration branch now requires a canonical single-value same-origin `Origin`, rejects foreign `Sec-Fetch-Site`, requires `x-juro-csrf: 1`, and applies the same guard through authentication, identity, platform, and legacy document-builder mutation helpers. Rendered negative tests cover missing, duplicated, and cross-origin proof. Protected-staging runtime evidence and a complete route inventory remain required before closing this finding.

### SEC-012 — trusted header mode needs a hard boundary

When `ALLOW_PLATFORM_AUTH_HEADERS=true`, `oai-authenticated-user-*` headers are accepted without an application signature. This is safe only if a trusted upstream always strips inbound copies and injects verified values. The production topology and header sanitization are not documented or tested.

### SEC-013 — account email change needs dual-address proof

Changing the canonical login identifier can transfer control of the account,
strand the owner, preserve stolen sessions, or permit a target-address race if
it relies only on the current session or a single mailbox code.

Local remediation status: migration 0019 and the application add a dedicated
session-bound challenge, separate current/new mailbox codes, idempotent Resend
batch acceptance, fresh-session and MFA-assurance checks, target uniqueness
fences, one-winner identity rotation, other-session/device revocation, related
challenge invalidation, exact current-token retirement and replacement without
expiry extension, replay revocation, and atomic workspace/security audit
evidence. The
built Worker also rejects missing/cross-origin CSRF and platform-header-only
management. The challenge schema is bootstrapped in staging. Encrypted prior-address alert
storage, transactional outbox creation, and a replay-safe consumer pass locally,
but migration 0030 is not remotely applied and no real two-mailbox or prior-
address delivery, remote D1 race, DLQ/redrive, consumer deployment, or rollback
rehearsal has run. SEC-013 remains a release gate rather than a remotely closed
finding.

## Medium findings

- deployed production team invitation acceptance is not a conditional atomic consume; migration `0022` is active in isolated staging and the acceptance service uses a unique immutable claim plus one D1 batch for the guarded claim, membership/default-workspace effects, and audit, with one-winner, stale-identity, owner-role preservation, replay, and rollback tests; no full-HTTP staging invitation evidence exists;
- several authorization errors reveal object/workspace existence instead of neutral not-found behavior;
- deployed Sites v20 has no `security_events` store; migration 0013 is present in isolated staging schema only, with no runtime evidence, and does not replace the broader access-audit model;
- document attachments rely on declared MIME/extension rather than complete magic-byte validation;
- attachment R2 metadata contains the original filename;
- public-share downloads have incomplete access auditing;
- the CSP still permits unsafe inline script/style behavior;
- support/admin routes and customer-resource access evidence do not exist.
  The local-only 0020–0021 foundation now separates expiring platform roles
  from workspace roles and provides an unexposed administrator grant/revoke
  service requiring fresh local MFA/TOTP. Each role change is atomic with an
  immutable per-actor hash-chain event, but no assignment, trusted operator
  bootstrap, usable staff surface, or view/download/edit grant exists;
- baseline account deletion did not require email OTP. The local Phase 2
  migration 0015 adds a dedicated verified request flow, but it is not
  deployed and purge/retention orchestration still does not exist.

## Positive controls verified

Deployed/runtime evidence:

- session tokens are stored as hashes;
- cookies use Secure, HttpOnly, and SameSite=Lax;
- OTP is six digits, expires after ten minutes, has a 60-second resend cooldown, invalidates the previous challenge, and stores a salted hash rather than the code;
- no OTP logging was found;
- R2 object keys do not include the original filename or direct PII;
- unauthenticated protected API smoke returns `401`;
- production sends CSP, HSTS, no-store, and noindex protections;
- offline production-dependency audit reported zero vulnerabilities in the available advisory cache; the online registry audit was blocked because it would disclose dependency metadata and is not claimed;
- strict high-confidence scan found zero provider/private-key token patterns in tracked source, built bundle, and git history.

Local integration-branch evidence only:

- migration/application 0018 binds keyed OTP/deletion code evidence to its purpose and record/session context while the checked-in mode remains disabled/legacy;
- migration/application 0019 binds two distinct codes to the exact challenge, session, and current/new destination roles and preserves only the verified current session after identity rotation;
- migration/application 0022 binds workspace membership and audit effects to one immutable invitation acceptance claim; an existing owner cannot be downgraded by an invitation;
- migration/application 0023 records an immutable 15-minute lock only after attempt exhaustion; local tests cover the fifth-failure lock and refusal of a replacement challenge during the lock;
- OTP atomic-claim concurrency, independent `5/email/hour` and `20/IP/hour` gates, missing-IP isolation, Turnstile response/action/hostname/failure handling, 24-hour/30-day session persistence, device/session revoke, invitation pre-accept denial/replay/one-winner, and active-workspace builder isolation tests pass locally;
- AI, comparison, monitoring, citation retrieval, and global search apply one
  server-owned exact-host allowlist for `lex.uz` and `advice.uz`. They now also
  require a matching source type, explicit verification state, UTC verification
  timestamp, and lowercase SHA-256 evidence; legacy `status='verified'` alone
  cannot promote a source. No source fetcher or verification UI exists yet.

## Control-plane security finding

The Sites read-only connector unexpectedly exposed a bypass bearer token in raw tool telemetry. The value was not repeated, stored, used, or committed. Treat it as exposed and rotate/revoke it through the Sites control plane before any production work. This is separate from the repository secret scan, which remained clean.

A bounded authenticated Chrome pass now confirms canonical RU/UZ builder rendering, no console warning/error, no broken images, and zero horizontal overflow at 320–1440 px; it also found nested `<main>` landmarks and untranslated UZ work-surface content. This is not browser security or accessibility proof: CSRF/XSS/CSP negative flows, keyboard/focus, 200% zoom, reduced motion, axe, Lighthouse, screen readers, and real-device behavior remain open.

## Required test additions

1. OTP:
   - repeat the locally passing independent email/IP limits and atomic verify race against remote staging D1 through the full HTTP boundary;
   - configure and test real Turnstile Siteverify plus the rendered client widget on the protected staging hostname;
   - apply migration `0023` and repeat the locally passing fifth-failure/15-minute-lock path remotely;
   - send and verify a real Resend OTP without logging the code or address;
   - enumeration parity.
2. Sessions:
   - fixation/rotation;
   - repeat the locally passing 24-hour/30-day persisted/cookie duration matrix through staging HTTP;
   - repeat current/one/all revoke through full staging HTTP/session/cookie boundaries;
   - replay and security-event revoke.
3. Tenant isolation:
   - cross-user and cross-workspace ID substitution for every object domain;
   - repeat the locally passing invited-but-not-accepted collaborator denial and active-workspace isolation matrix against staging D1 and HTTP routes;
   - neutral object responses.
4. File security:
   - MIME spoof/polyglot;
   - ZIP traversal/bomb/nesting;
   - quarantine and fail-closed scanner;
   - prompt injection and secret-exfiltration attempts.
5. Shares and invitations:
   - token/code brute force;
   - apply migration `0022` and repeat the locally passing document and workspace invitation replay/concurrent-accept/rollback tests through staging HTTP;
   - expiry/revoke/download constraints.
6. Audit and deletion:
   - hash-chain validation;
   - protected export;
   - soft delete, purge, and recovery.
7. Browser security:
   - CSRF without Origin;
   - XSS from AI/document content;
   - open redirect;
   - CSP regression.
8. Account email change:
   - real current/new mailbox delivery and provider-failure invalidation;
   - stale/revoked/primary-only session denial;
   - target-address ownership race and concurrent one-winner confirmation;
   - replacement-cookie issuance, retired-token replay revocation, and
     all-other-session/device revocation;
   - old/new OTP, deletion, MFA-login, and competing challenge invalidation;
   - audit rollback and safe alerting to the prior address.
9. Legal-source staff inbox:
   - locally proved neutral disabled page/API behavior and no session lookup;
   - locally proved capability-first filter/body parsing, keyset pagination,
     claim isolation, exact-host links, and D1/R2 evidence flow;
   - still requires Cloudflare Access, protected staging browser CSRF tests,
     reviewer bootstrap/revoke, 2FA-expiry behavior, and audit export review.

## Staging security gate

Staging infrastructure may be provisioned in isolation, but upload/AI/collaboration/staff features may be enabled only after the critical findings have fixes and negative tests. Public beta additionally requires:

- real scanner availability;
- tenant isolation suite with zero leaks;
- TOTP for privileged roles;
- verified secrets and no client/log leakage;
- restore rehearsal;
- documented residual-risk review.

## Session request evidence control — 2026-07-29 local checkpoint

A successful direct or MFA login can now append privacy-minimized request
signals to the existing tamper-evident security chain. Raw IP and raw
User-Agent exist only in request memory long enough to produce versioned,
user-bound, purpose-separated HMACs. Stored location is limited to sanitized
country and region codes supplied by the Cloudflare request object. No location
header from the browser is trusted, and city/postal/coordinate fields are not
accepted.

Positive tests cover oversized input rejection, code normalization, keyed digest
shape, raw-value absence in the stored event, both login branches, and chain
verification. Request evidence alone is not device continuity and does not emit
an alert; the later continuity and notification layers consume only the bounded
coarse fields under the conservative policy below. None of these layers has been
exercised over protected staging HTTP.
## Opaque device continuity review — 2026-07-29

- Browser continuity uses a random 256-bit HttpOnly/Secure/SameSite=Lax cookie.
- D1 stores only a user-bound, domain-separated HMAC and key version; the raw
  token, raw IP and raw User-Agent are absent.
- A continuity token grants no session, MFA bypass, workspace access or API
  authorization. All existing session/tenant checks remain mandatory.
- Cross-user reuse is separated by user-bound HMAC input and lookup scope.
- Retained HMAC-key versions permit controlled rotation; successful use rewrites
  the row under the active key.
- Revoked continuity invalidates linked active-session lookup. Replay,
  security-device revoke, logout-all and account deletion revoke linked state;
  email change revokes non-current state while preserving the current chain.
- Normal logout deliberately preserves recognition and is covered by a route
  contract and service test.

Residual risk: a stolen continuity cookie can affect future novelty
classification but cannot authenticate. The notification policy below is local
only; protected staging HTTP evidence and real security-email delivery remain
unverified.

## Login-security notification review — 2026-07-29

- `login_new_device` requires a newly issued user-scoped continuity record;
  IP/User-Agent changes alone cannot trigger it, and registration is excluded.
- `login_new_region` requires an already recognized continuity and comparable
  previous/current coarse Cloudflare location. Missing evidence emits nothing.
- Session, device, continuity, encrypted-recipient notification, identifiers-only
  outbox, and chained audit are one D1 transaction; forced notification failure
  rolls the full batch back.
- MFA does not prepare or persist the notification until the second factor is
  successfully consumed.
- Recipient, event, session, locale, device, region, and occurrence fields are
  immutable. Delivery state alone moves through pending/sending/retrying/sent/
  failed under provider idempotency and a stale-send lease.
- Email HTML escapes dynamic device/location data and supports RU/UZ copy. Raw
  IP, raw User-Agent, raw continuity token, and recipient address are absent
  from Queue envelopes.

Residual risk remains from travel, VPN/carrier routing, cookie clearing, and
continuity-cookie theft. Migration `0032`, consumer activation, controlled real
mailbox delivery, retry/DLQ/redrive, and full protected HTTP verification remain
mandatory staging gates. No remote or production claim is made.
