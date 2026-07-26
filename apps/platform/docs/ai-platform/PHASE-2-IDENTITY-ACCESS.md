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

## Local evidence

Verified commands:

```bash
npm run type-check
npm run lint
node --import tsx --test \
  tests/auth-otp.test.ts \
  tests/document-access.test.ts \
  tests/migration-safety.test.ts \
  tests/platform-core.test.ts
npm test
```

The tests cover OTP replay and attempt exhaustion, parallel reservation,
rate-limit accounting, missing IP, strict input, session token format,
pre-accept denial, shared/workspace list scope, accept replay, decline,
migration backfill, and the full existing builder/comparison/rendered Worker
regression suite.

The final local `npm test` run passed 156 tests: 18 rendered Worker/security,
109 core/document/auth tests, and 29 Cloudflare configuration/migration/job
tests.

`scripts/smoke-document-builder.ts` now follows the required lifecycle:

```text
invite → pre-accept read denied → accept → collaborator read
```

It has not been executed against a remote environment in this slice.

## Required staging evidence

Before applying migration 0012 or enabling OTP in staging:

1. complete the approved Cloudflare inventory and independent D1 backup;
2. restore the backup into an isolated database;
3. inspect collaborator state distribution;
4. apply pending migrations;
5. require zero null document/file workspace rows;
6. run the isolated document-builder smoke flow;
7. send and verify real RU and UZ OTP emails through the configured Resend
   sender;
8. exercise same-email and same-IP concurrency against D1, not only SQLite;
9. confirm CSRF failures, session revocation, tenant isolation, and audit rows.

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
- migrations 0011/0012 are not applied to staging or production;
- TOTP, backup codes, device management, deletion OTP, and complete policy
  versioning are not implemented by this slice;
- raw email storage and unkeyed lookup hashes still require a versioned
  encryption/HMAC rollout;
- NAT-wide OTP limits preserve existing behavior and need staging product
  review;
- Miniflare/remote D1 race tests and full HTTP invitation/workspace E2E remain
  release gates;
- production remains frozen pending the later explicit owner confirmation.
