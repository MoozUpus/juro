# Phase 2 identity and access slice

Updated: 2026-07-26  
Status: implemented and verified locally; not applied or deployed remotely.

## Implemented

### OTP

- atomic correct-code claim with `UPDATE ... RETURNING`;
- guarded incorrect-attempt increments capped by `max_attempts`;
- atomic cooldown and eight-per-hour reservation in one D1 batch;
- nullable IP bucket when Cloudflare does not provide a connecting IP;
- challenge-bound purpose, email hash, and account type;
- strict Zod input, JSON content type, and 4 KiB body limit;
- CSRF/origin contract on request, verify, and logout;
- exact 43-character base64url session token parsing;
- Resend idempotency key derived from the challenge ID.

The code is consumed before user/session side effects. This prevents duplicate
sessions; a later failure requires a fresh code.

### Document collaboration

- pending invitations create a disabled collaborator row;
- central access requires `accepted` plus an active/opened/confirmed grant;
- accept and decline are conditional, transactional, and replay-safe;
- invitation transition and deterministic activity event share the D1 batch;
- an existing accepted collaborator is not demoted by reinvitation;
- ordinary lists are scoped to the active workspace;
- accepted external grants use the explicit shared folder;
- direct owner access and duplicate operations require the active workspace.

### Files

- every builder-generated file, signed PDF, and attachment now stores
  `workspace_id`;
- standalone file read, mutation, deletion, and share operations require both
  owner and active workspace;
- migration 0012 backfills only provable active-workspace links and adds the
  required document and OTP indexes.

### Session and device foundation

- every new email-OTP login creates a dedicated device record and a local
  session with explicit `auth_method`, assurance level, authentication time,
  absolute expiry, and seven-day idle expiry;
- session validation rejects revoked, absolute-expired, idle-expired, and
  device-revoked rows and throttles `last_seen_at` writes to five minutes;
- the identity principal preserves `local_session` versus
  `platform_header`, assurance, and the current local session ID;
- the security page identifies the current JURO email session, revokes one,
  all other, or all local sessions, and explicitly excludes external-provider
  sessions from its claim;
- login, logout, and revocation state changes share a D1 transaction with a
  user-scoped security event;
- `security_events` is append-only at the database layer and uses a
  per-user SHA-256 chain with a uniqueness fence against forks;
- migration 0013 adds the device/session fields and append-only event store
  without enabling TOTP or changing a live environment.

### Identity cryptography foundation

- `lib/auth/keyring.ts` parses a versioned server-only key ring;
- AES-256-GCM values use record-bound additional authenticated data;
- lookup HMACs are SHA-256, versioned, and domain separated;
- missing, malformed, unknown-version, and wrong-AAD keys fail closed;
- old-key read/current-key write rotation is covered by tests.

The key ring is not committed or configured in source. Existing raw identity
columns and unkeyed legacy lookup hashes have not yet been migrated.

### Two-factor authentication

- RFC 6238 TOTP uses SHA-1, six digits, a 30-second period, and a bounded
  `±1` step window;
- TOTP secrets are encrypted with the versioned identity key ring and
  record-bound AES-256-GCM AAD;
- ten 80-bit backup codes are shown only after successful enrollment and are
  stored only as versioned, domain-separated HMACs;
- email OTP creates a five-minute pre-auth challenge when an active TOTP
  credential exists; no primary session is issued before TOTP or backup-code
  verification;
- the pre-auth token is random, hashed at rest, HttpOnly, Secure,
  SameSite=Strict, and scoped only to `/api/auth/verify-mfa`;
- TOTP steps, backup codes, and MFA operations have database uniqueness and
  guarded D1-batch fences against replay and concurrent session issuance;
- enabling 2FA upgrades the confirming session and revokes the others;
  disabling it or regenerating backup codes requires a fresh TOTP or backup
  code;
- trusted platform headers cannot satisfy JURO MFA, and accounts with active
  MFA cannot fall back to a platform-header principal;
- audit-chain tail selection follows `previous_hash` links rather than
  timestamps, so out-of-order concurrent events cannot permanently block
  later authentication writes;
- migration 0014 adds encrypted credentials, one-time backup records,
  pre-auth challenges, factor claims, and `auth_sessions.mfa_verified_at`.

The security page exposes setup, confirmation, one-time backup-code display,
regeneration, and disable flows in RU/UZ. If `IDENTITY_KEYRING` is absent or
invalid, the feature fails closed and setup is not offered.

## Local evidence

Verified commands:

```bash
npm run type-check
npm run lint
node --import tsx --test \
  tests/auth-otp.test.ts \
  tests/auth-keyring.test.ts \
  tests/auth-sessions.test.ts \
  tests/auth-mfa-crypto.test.ts \
  tests/auth-mfa.test.ts \
  tests/document-access.test.ts \
  tests/migration-safety.test.ts \
  tests/platform-core.test.ts
npm test
```

The tests cover OTP replay and attempt exhaustion, parallel reservation,
rate-limit accounting, missing IP, strict input, session token format,
pre-accept denial, shared/workspace list scope, accept replay, decline,
migration backfill, TOTP vectors and drift, encrypted enrollment, one-time
backup codes, pre-auth session gating, attempt exhaustion, concurrent login,
concurrent disable, failed-enrollment side effects, out-of-order audit
timestamps, and the full existing builder/comparison/rendered Worker
regression suite.

The final local full suite passes 191/191 checks: 21 rendered
Worker/security checks, 137 core/document/auth checks, and 33 Cloudflare
configuration/migration/job checks. The generated migration schema contains
92 tables with zero foreign-key integrity errors. Local evidence is not
staging or production evidence.

`scripts/smoke-document-builder.ts` now follows the required lifecycle:

```text
invite → pre-accept read denied → accept → collaborator read
```

It has not been executed against a remote environment in this slice.

## Required staging evidence

Before applying the pending identity/access migrations or enabling OTP/MFA in
staging:

1. complete the approved Cloudflare inventory and independent D1 backup;
2. restore the backup into an isolated database;
3. inspect collaborator state distribution;
4. apply pending migrations through 0014;
5. require zero null document/file workspace rows;
6. run the isolated document-builder smoke flow;
7. send and verify real RU and UZ OTP emails through the configured Resend
   sender;
8. exercise same-email and same-IP concurrency against D1, not only SQLite;
9. confirm CSRF failures, current/single/other/all session revocation, idle
   expiry, tenant isolation, and the append-only audit chain;
10. configure the versioned identity key ring in protected staging secret
    storage, prove old-key read/current-key write rotation, and retain a
    separately protected recovery copy;
11. run the full MFA lifecycle through the built Worker: enroll, confirm,
    save and consume one backup code, login with TOTP, login with a backup
    code, regenerate, disable, and verify all session/audit effects;
12. test missing/wrong key versions, stale/revoked sessions, cross-origin
    writes, user-agent mismatch, attempt exhaustion, and parallel D1 login
    and disable operations;
13. verify that `ALLOW_PLATFORM_AUTH_HEADERS` remains absent unless the edge
    demonstrably strips client input and injects authenticated headers.

Required read-only queries:

```sql
SELECT invitation_status, status, can_view, joined_at IS NULL, count(*)
FROM document_collaborators
GROUP BY invitation_status, status, can_view, joined_at IS NULL;

SELECT count(*) FROM documents WHERE workspace_id IS NULL;
SELECT count(*) FROM document_files WHERE workspace_id IS NULL;
```

## Not complete

- no live Resend delivery has been verified;
- migrations 0011–0014 are not applied to staging or production;
- TOTP and backup codes are implemented and verified locally, but no staging
  key ring, D1 migration, real-device authenticator flow, or remote D1
  concurrency test has been completed;
- trusted-device bypass, administrator-assisted recovery, deletion OTP, and
  complete policy versioning are not implemented by this slice;
- device-aware management covers JURO local email sessions only; an external
  identity provider's other sessions cannot be listed or revoked here;
- raw email storage and unkeyed legacy lookup hashes still require a
  dual-read/write, backfill, verify, and contract migration onto the new
  versioned encryption/HMAC primitives;
- NAT-wide OTP limits preserve existing behavior and need staging product
  review;
- cleanup scheduling for expired pending credentials and consumed/invalidated
  MFA challenges remains inactive until the reviewed cleanup queue/Cron
  lifecycle is enabled;
- remote D1 race tests and authenticated full HTTP MFA/invitation/workspace
  E2E remain release gates;
- production remains frozen pending the later explicit owner confirmation.
