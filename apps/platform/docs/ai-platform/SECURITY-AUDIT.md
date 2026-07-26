# JURO security audit

Audit date: 2026-07-26  
Baseline revision: `86843ca`  
Method: source review, production HTTP smoke checks, current test suite, targeted secret scan. No destructive testing was performed against production.

## Risk summary

| Severity | Count | Release consequence |
|---|---:|---|
| Critical | 4 | Blocks staging feature gate until fixed and regression-tested |
| High | 8 | Blocks public enablement of the affected flow |
| Medium | 7 | Requires remediation or explicit feature flag before beta |

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

### SEC-002 — cross-workspace builder listing

The document list is filtered by owner/collaborator but not by the active workspace. Documents from multiple tenant spaces can appear in one workspace view.

Impact: tenant isolation failure.

Required fix:

- scope owned documents to active workspace;
- model external shared documents as an explicit separate access scope;
- validate every object query with membership and object ownership;
- add a complete cross-user/cross-workspace matrix.

### SEC-003 — OTP verification race

OTP read, comparison, attempt increment, consumption, and session creation are not a single conditional transaction. Parallel valid requests can create multiple sessions.

Impact: one-time semantics can be bypassed.

Required fix:

- conditional atomic consume;
- one resulting session per challenge/idempotency key;
- 15-minute verification lock after maximum failures;
- concurrency tests.

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

### SEC-005 — OTP controls do not meet policy

- email and IP requests are combined with `OR` under a single 8/hour cap;
- required independent 5/email and 20/IP limits are absent;
- Turnstile is absent;
- hash is `SHA-256(salt:code)` without `OTP_HASH_SECRET`;
- generic anti-enumeration responses are incomplete.

Local remediation status: migration 0018 and the application contain a
disabled expand layer for domain-separated, versioned HMAC evidence covering
OTP email/IP lookup and challenge-bound codes. It preserves cross-key-version
rate-limit buckets and fails closed on keyed/SHA divergence. Checked-in mode
is still `legacy`, the combined eight/hour policy is unchanged, Turnstile and
independent limits remain absent, legacy salted code SHA remains stored, and
no remote D1/Resend test has run. SEC-005 is therefore not closed.

### SEC-006 — session and device security incomplete

- all sessions use a 30-day expiry;
- no 24-hour non-remember mode;
- no rotation, device record, location, activity update, single-session revoke, fixation/replay detection, or security-event revocation;
- no new-device or region security mail.

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

No tamper-evident chain or protected periodic export exists; cascades can remove audit and consent evidence.

### SEC-011 — CSRF validation is weak

The write guard checks `Origin` only when supplied and accepts a static `x-juro-csrf: 1`. A cookie-authenticated request without `Origin` is not rejected.

### SEC-012 — trusted header mode needs a hard boundary

When `ALLOW_PLATFORM_AUTH_HEADERS=true`, `oai-authenticated-user-*` headers are accepted without an application signature. This is safe only if a trusted upstream always strips inbound copies and injects verified values. The production topology and header sanitization are not documented or tested.

## Medium findings

- team invitation acceptance is not a conditional atomic consume;
- several authorization errors reveal object/workspace existence instead of neutral not-found behavior;
- no `security_events` store exists;
- document attachments rely on declared MIME/extension rather than complete magic-byte validation;
- attachment R2 metadata contains the original filename;
- public-share downloads have incomplete access auditing;
- the CSP still permits unsafe inline script/style behavior;
- support/admin 2FA and role boundaries do not exist;
- baseline account deletion did not require email OTP. The local Phase 2
  migration 0015 adds a dedicated verified request flow, but it is not
  deployed and purge/retention orchestration still does not exist.

## Positive controls verified

- session tokens are stored as hashes;
- cookies use Secure, HttpOnly, and SameSite=Lax;
- OTP is six digits, expires after ten minutes, has a 60-second resend cooldown, invalidates the previous challenge, and stores a salted hash rather than the code;
- the disabled local 0018 expand path additionally binds keyed OTP/deletion
  code evidence to its purpose and record/session context;
- no OTP logging was found;
- R2 object keys do not include the original filename or direct PII;
- unauthenticated protected API smoke returns `401`;
- production sends CSP, HSTS, no-store, and noindex protections;
- production dependency audit reported zero vulnerabilities;
- targeted source/client scan found no provider API-key values or private keys.

## Required test additions

1. OTP:
   - independent email/IP limits;
   - Turnstile;
   - atomic verify race;
   - five failures and 15-minute lock;
   - enumeration parity.
2. Sessions:
   - fixation/rotation;
   - 24h/30d duration;
   - current/one/all revoke;
   - replay and security-event revoke.
3. Tenant isolation:
   - cross-user and cross-workspace ID substitution for every object domain;
   - invited-but-not-accepted collaborator denial;
   - neutral object responses.
4. File security:
   - MIME spoof/polyglot;
   - ZIP traversal/bomb/nesting;
   - quarantine and fail-closed scanner;
   - prompt injection and secret-exfiltration attempts.
5. Shares and invitations:
   - token/code brute force;
   - replay and concurrent accept;
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

## Staging security gate

Staging may be deployed only after the four critical findings have fixes and negative tests. Public beta for uploads, AI, collaboration, or staff access additionally requires:

- real scanner availability;
- tenant isolation suite with zero leaks;
- TOTP for privileged roles;
- verified secrets and no client/log leakage;
- restore rehearsal;
- documented residual-risk review.
