# Phase 2 identity and access slice

Updated: 2026-07-29
Status: identity/access foundations are implemented and partially verified in isolated, Access-protected staging. D1 contains all 30 migrations through `0029`; the current Worker version `b4a497ce-9a47-4ea9-be75-b0f48e46c7cd` has its staging-only D1/R2/Queue/Vectorize/Analytics bindings, public Turnstile site key, and three server-only secret bindings. Aggregate D1 evidence shows three provider-accepted OTP challenges that were consumed successfully, but the current localized auth UI, mailbox delivery, session-rotation cookie/replay flow, full remote concurrency matrix, and lifecycle gates still require correlated browser/HTTP evidence. Production was not changed.

## Implemented

### OTP

- atomic correct-code claim with `UPDATE ... RETURNING`;
- guarded incorrect-attempt increments capped by `max_attempts`;
- atomic 60-second cooldown plus independent `5/email/hour` and
  `20/IP/hour` reservation gates in one D1 batch;
- nullable IP bucket when Cloudflare does not provide a connecting IP;
- retained lookup-key versions preserve one logical email/IP rate bucket;
- invalidated provider failures still count toward the email limit;
- the fifth wrong verification atomically exhausts the challenge and records
  an immutable 15-minute verification lock under migration `0023`;
- a replacement challenge for the same email is refused while that lock is
  active;
- Cloudflare Turnstile is integrated in the request route and auth UI; server
  verification requires action `auth_otp`, the exact expected hostname, and
  fails closed on invalid or unavailable Siteverify responses;
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

### Workspace invitation acceptance

- migration `0022` adds a unique nullable `acceptance_claim_id` that must be
  paired with `accepted_at` and is immutable after acceptance;
- a guarded `UPDATE ... RETURNING` binds acceptance to the exact token,
  invitation identity evidence, unrevoked state, and expiry;
- claim, membership activation, default-workspace selection, and the
  deterministic acceptance audit event execute in one D1 batch;
- an existing workspace owner is not downgraded by a lower-role invitation;
- local tests cover one-winner concurrency, replay, stale identity evidence,
  owner-role preservation, and full rollback when audit insertion fails.

Invitation acceptance now redirects business memberships to
`/:locale/business/:workspaceId/dashboard`. The canonical layout independently
re-authorizes membership and switches the active tenant idempotently; the
immutable acceptance claim still does not make `workspace_audit_events` a
general append-only hash chain.

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
  absolute expiry, and capped idle expiry;
- the absolute lifetime is 24 hours by default and 30 days only when the user
  explicitly selects remember-me; cookie `Max-Age` and persisted expiry use
  the same choice after direct OTP or MFA completion;
- idle expiry remains capped at seven days, or the shorter absolute lifetime;
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

### Structured onboarding and persona routing

- migration `0024` additively adds separate name fields and explicit phone
  verification evidence without inventing values for existing users;
- the onboarding endpoint accepts only strict JSON up to 4 KiB and requires
  surname, given name, optional middle name, normalized phone, language,
  personal persona, one approved primary goal, and exact current policy
  version/digest evidence;
- phone remains explicitly unverified (`phoneVerified=false`,
  `phoneVerifiedAt=null`); no UI or backend claim implies SMS verification;
- completion deterministically preserves or creates one personal workspace,
  does not replace an existing business workspace, and is concurrency-safe;
- canonical `/:locale/auth/login`, `/:locale/auth/register`, and
  `/:locale/onboarding` routes exist locally; guest root defaults to Uzbek;
- registration offers individual, entrepreneur, and lawyer personas;
  selecting a business workspace changes the active workspace route but no
  longer rewrites the user's persistent personal persona.

The canonical platform module is `/dashboard`; localized legacy `/main`
routes receive a tested method-preserving 308 redirect. Business workspace
routes now include `workspaceId`, and reserved legacy business roots resolve
the authenticated active tenant before redirecting to the canonical URL.

### Identity cryptography foundation

- `lib/auth/keyring.ts` parses a versioned server-only key ring;
- AES-256-GCM values use record-bound additional authenticated data;
- lookup HMACs are SHA-256, versioned, and domain separated;
- missing, malformed, unknown-version, and wrong-AAD keys fail closed;
- old-key read/current-key write rotation is covered by tests.

The key ring is not committed or configured in source.

### Canonical profile identity expand layer

- migration 0016 adds nullable, independently versioned AES-GCM and lookup-HMAC
  fields for `user_profiles.email` and `user_profiles.phone`;
- insert/update triggers reject every partial protected group, while the
  existing plaintext columns and email uniqueness constraint remain intact;
- registration, trusted-header bootstrap, session reads, workspace bootstrap,
  profile/export, team, and document collaboration use the central identity
  lookup/projection boundary;
- `dual_write` reads prefer ciphertext, verify retained plaintext equality,
  try every retained lookup-key version, and fail closed on corruption,
  divergence, ambiguity, or a missing key;
- new/changed profile writes use the active key, and a bounded optimistic
  backfill can idempotently protect or rotate existing rows without changing
  their user-facing `updated_at`;
- API/session projections construct explicit public objects and never spread
  ciphertext, IV, digest, or key-version fields into responses.

Every checked-in environment remains
`IDENTITY_PROTECTION_MODE=legacy`. Migration 0016 is schema-applied only to
isolated staging; the backfill has no live invocation, and plaintext has not
been cleared.
Saved contacts and document/AI content remain separate protection slices.

### Invitation identity evidence expand layer

- migration 0017 adds nullable, versioned protection fields without changing
  or deleting any legacy invitation field;
- workspace invitation email uses record-bound AES-256-GCM plus a
  domain-separated lookup HMAC scoped by workspace and invitation ID;
- document invitation targets use an explicit email/phone kind and separate
  versioned lookup-HMAC purposes without adding recoverable plaintext;
- team responses decrypt through the central boundary and construct an
  explicit public projection that excludes ciphertext, IV, digest, and key
  version;
- acceptance prefers keyed evidence in `dual_write`; a keyed mismatch cannot
  fall back to legacy SHA-256, while pre-0017 rows retain bounded compatibility;
- insert/update triggers reject partial protected groups, invalid document
  identifier kinds, malformed digest lengths, and malformed base64url values;
- explicit `legacy` mode retains the pre-existing SHA comparison for
  application rollback.

Migration 0017 is schema-applied only to isolated staging and checked-in mode
remains `legacy`, so no live invitation is encrypted or keyed by this source
change. Workspace plaintext email and both legacy SHA columns remain during
expansion. Active
legacy invitations must expire within their seven-day TTL or be revoked and
reissued before a later contract step.

### Short-lived challenge evidence expand layer

- migration 0018 adds nullable HMAC/key-version pairs for OTP email, request
  IP, and code plus account-deletion email and code;
- equality-only values are not newly encrypted: the server does not need to
  recover a stored code, IP, or challenge email after delivery;
- email, IP, login code, deletion email, and deletion code have separate HMAC
  purposes; login codes bind challenge ID and login/register purpose, while
  deletion codes also bind user and local session;
- new `dual_write` rows use the active key, and OTP rate-limit queries try
  every retained key version so rotation does not reset a bucket;
- keyed evidence is authoritative; a keyed mismatch never falls back, and a
  matching keyed value with divergent retained SHA evidence fails closed
  before attempts, sessions, deletion requests, audit, or revocation effects;
- pre-0018 rows with no keyed group and explicit `legacy` mode retain the exact
  historical SHA verification path;
- insert/update triggers reject partial or malformed keyed groups, while all
  raw/SHA/salt/TTL/lifecycle fields remain for rollback.

Migration 0018 is schema-applied only to isolated staging and checked-in mode
remains `legacy`, so no live challenge uses these HMAC fields. Expiry remains
ten minutes, but historical rows are not assumed deletable: MFA, policy, and
deletion-request
references require a reviewed dry-run retention/pseudonymization plan before
raw email or legacy SHA fields can be cleared.

### Protected account email change

- `GET,POST /api/platform/security/email-change` accepts only a JURO local
  session; request and confirmation require authentication within ten minutes,
  and an account with active TOTP requires MFA assurance;
- request and confirmation use strict, size-bounded discriminated JSON plus
  the application CSRF/origin contract;
- two different six-digit codes are bound to the exact challenge, user,
  session, and current/new destination roles;
- Resend receives one idempotent batch request containing both messages, and
  confirmation stays closed until the provider accepts that batch;
- cooldown, five-per-hour accounting, a single active challenge, five shared
  wrong attempts, expiry, session binding, and target uniqueness are enforced
  with database predicates and indexes;
- one guarded D1 batch consumes the challenge, rotates the canonical protected
  email, invalidates old/new auth OTP, deletion, MFA-login, and competing
  email-change challenges, revokes every other local session/device, and
  appends workspace and security-chain evidence;
- the verified current session is preserved and subsequently resolves the new
  canonical email; parallel confirmations have exactly one winner;
- a revoked/stale or insufficient-assurance session cannot consume a challenge
  or spend its wrong-code attempt budget;
- the profile/settings UI shows the two-code flow in RU/UZ only when the
  current principal is a local session and Resend is configured.

Migration 0019 creates the dedicated additive challenge table and state
triggers. Its schema is present only in isolated staging; no remote application
runtime uses it. The provider call has not been exercised with real staging
mailboxes, and Resend acceptance must not be described as mailbox delivery.

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

### Platform staff authorization foundation

- platform `administrator`, `support`, and `legal_reviewer` assignments are
  stored separately from workspace membership, onboarding role, and
  `account_type`;
- assignments are expiring, allow only one unrevoked row per user/role, reject
  administrator self-grant, and preserve explicit grant source, actor, reason,
  and timestamps;
- grant evidence is immutable; the only update is a complete one-time
  revocation, after which reactivation, further mutation, and deletion fail at
  the database layer;
- the request boundary accepts only a live JURO local session and rechecks
  `assurance_level='mfa'`, the MFA timestamp, session/device revocation,
  absolute/idle expiry, and an active non-disabled TOTP credential;
- capabilities are explicit and non-inheriting: administrator, support, and
  legal-review duties require their own assignments;
- no platform capability names or authorizes customer, workspace, case,
  document, or file access; lawyer client access remains a separate future
  user-confirmed grant boundary;
- no assignment, admin/support route, operator bootstrap, or staff UI is
  created by this slice.

Migration 0020 creates the additive assignment table, restrictive foreign
keys, partial uniqueness fence, lifecycle checks, and one-way revocation
triggers. Its schema is present only in isolated staging and must remain empty
until a separately reviewed bootstrap procedure exists.

Migration 0021 adds an append-only, per-actor role-change chain and an internal
administrator grant/revoke service. The actor must have exactly one active
administrator authority for `staff.roles.manage`, a live local session and
device, active TOTP, and MFA no more than five minutes old. A subject must
already have active TOTP; grants cannot target the actor, expire within 30
days, and execute in the same D1 batch as the exact grant event. Revocation is
limited to a currently active assignment, remains atomic with its event, and
allows explicit administrator self-deprovisioning.

The database rejects orphan/forked chain predecessors, mismatched
session/MFA/assignment evidence, duplicate assignment event types, and any
event update or deletion. Concurrent grants have one assignment winner, and
an event failure rolls back the role mutation. This service has no route,
Worker/job import, UI, seeded administrator, or operator-bootstrap path, so it
is deliberately unreachable.

### Versioned policy evidence

- all five RU/UZ application policy pages have a server-owned machine version
  and an exact SHA-256 digest over canonical semantic content;
- the displayed version is `2026-07-26.draft.1` and is visibly marked as a
  draft because operator identity placeholders and legal approval remain
  unresolved;
- runtime verification fails closed if content changes without an intentional
  version/digest update;
- registration records the exact policy row, locale, digest, method,
  authentication source, OTP challenge evidence, and acceptance time;
- policy documents and user acceptance evidence are append-only at the
  database layer; an insert trigger rejects mismatched key/version/locale/hash
  evidence;
- legacy version-only acceptances remain visible as `legacy_unverified`; the
  migration does not invent a content digest;
- optional marketing choice is stored in `consents` as
  `marketing_email`, not misrepresented as an accepted legal document;
- profile history and portable export expose policy evidence separately from
  revocable operational consents.

Append-only acceptance evidence deliberately blocks a future cascading user
delete. An approved retention/pseudonymization design is required before the
purge phase; the current deletion-request flow does not erase rows.

### Verified account-deletion request

- the endpoint accepts only strict, size-bounded two-step JSON:
  `request_code` followed by `confirm`;
- both steps require CSRF/origin proof and a JURO local email session
  authenticated within the last ten minutes; platform headers cannot satisfy
  the requirement;
- deletion uses a dedicated challenge table and email template, never a login
  or registration OTP;
- challenge creation has atomic cooldown, five-per-hour accounting, a
  single-active-challenge fence, provider idempotency, and invalidation when
  Resend fails;
- codes are salted and hashed at rest, expire after ten minutes, allow five
  guarded attempts, and are bound to the exact user and local session;
- exact challenge consumption, request insertion, workspace audit, append-only
  security event, and revocation of all local sessions share one D1 batch;
- an operation fence and partial unique active-request index produce one
  winner under concurrent confirmation;
- the database rejects a deletion request whose user/session/verification time
  does not match the consumed challenge;
- the UI explains that this creates a verified operator-review request, not an
  immediate purge, and signs out after the server revokes sessions.

Migration 0015 adds the immutable policy registry/evidence columns and deletion
challenge/evidence fields. It remains local only.

## Local evidence

Verified commands:

```bash
npm run type-check
npm run lint
node --import tsx --test \
  tests/auth-otp.test.ts \
  tests/auth-keyring.test.ts \
  tests/identity-protection.test.ts \
  tests/identity-evidence.test.ts \
  tests/challenge-evidence.test.ts \
  tests/auth-sessions.test.ts \
  tests/auth-mfa-crypto.test.ts \
  tests/auth-mfa.test.ts \
  tests/account-deletion.test.ts \
  tests/email-change.test.ts \
  tests/staff-access.test.ts \
  tests/staff-role-management.test.ts \
  tests/policy-acceptance.test.ts \
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
timestamps, protected profile read/write/backfill/rotation, response
projection, invitation AAD/domain separation/keyed-authoritative matching,
challenge purpose/record/session binding, retained-key rate-limit lookup,
legacy-row preservation, SHA-divergence failure, email-change dual-address
proof, provider acceptance gating, target races, revoked-session attempt
fencing, identity rotation, session/challenge invalidation, DB completeness
guards, platform/workspace role separation, staff capability non-inheritance,
live MFA/TOTP/session/device checks, role expiry/revocation/immutability,
fresh-MFA administrator grant/revoke, subject-MFA and TTL bounds, chained
append-only role events, workspace-invitation one-winner/owner-preservation/
rollback behavior, independent email/IP rate controls, missing-IP isolation,
fifth-failure verification locking, Turnstile response/action/hostname/failure
handling, 24-hour/30-day session persistence, structured onboarding,
persona-preserving workspace selection, canonical localized auth routes, and the full existing builder/
comparison/rendered Worker regression suite.

The latest recorded local full suite passes 343/343 checks: 27 rendered
Worker/security checks, 246 core/document/auth checks, and 70 Cloudflare
configuration/migration/job checks. Remote staging now contains 110 total
SQLite tables (109 non-internal), 58 triggers, the exact 30-entry ledger through
`0029`, and zero pending migrations or foreign-key violations. Local service
tests and remote schema evidence are not full staging HTTP or production
runtime evidence.

`scripts/smoke-document-builder.ts` now follows the required lifecycle:

```text
invite → pre-accept read denied → accept → collaborator read
```

The local suite is complemented by the read-only staging evidence recorded below; destructive or concurrency tests have not been executed against remote staging.

### Read-only protected-staging evidence — 2026-07-29

- `wrangler d1 migrations list juro-staging --env staging --remote` reports no pending migrations;
- D1 reports 110 total SQLite tables (109 non-internal) and 30 migration-ledger rows;
- aggregate-only queries, without reading email addresses, codes, names, or content, report three OTP challenges accepted by the provider path and three consumed challenges;
- the same aggregate check reports one profile, zero keyed OTP challenges, and zero profiles with protected identity fields;
- the Worker settings API returns the public `TURNSTILE_SITE_KEY` binding and server-only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY` binding names; secret values were not read;
- the external Access boundary still returns a `302` with `no-store` before application content for an unauthenticated request.

The OTP aggregates prove persisted staging state and successful challenge consumption. They do not, by themselves, prove current-version browser widget behavior, recipient mailbox delivery, response timing parity, or the full resend/lock/concurrency matrix. `IDENTITY_PROTECTION_MODE=legacy` remains deliberate during expand/backfill; encryption must not be claimed until the guarded dual-write activation and verified backfill gate pass.

## Required staging evidence

Before enabling OTP/MFA in staging:

1. retain and re-read the completed Cloudflare inventory and ten verified private-R2 backup/restore artifacts;
2. repeat the disposable remote-D1 import drill for any new checkpoint; the
   verified 2026-07-29 logical import does not establish operational RTO;
3. inspect collaborator state distribution;
4. prove there are no duplicate active legacy deletion requests and confirm
   the exact `0000`–`0029` ledger while keeping identity mode `legacy`;
5. require zero null document/file workspace rows;
6. run the isolated document-builder smoke flow;
7. send and verify real RU and UZ OTP emails through the configured Resend
   sender;
8. configure the environment-specific Turnstile site/secret bindings and
   prove the client widget plus real Siteverify action/hostname behavior;
9. exercise same-email and same-IP concurrency, independent `5/email/hour`
   and `20/IP/hour` limits, missing-IP behavior, retained-key lookup, keyed/SHA
   divergence failure, the 15-minute verification lock, and one-winner consume
   against D1, not only SQLite;
10. confirm CSRF failures, 24-hour/30-day persistence,
    current/single/other/all session revocation, idle expiry, tenant isolation,
    and the append-only audit chain;
11. configure the versioned identity key ring in protected staging secret
    storage, prove old-key read/current-key write rotation, and retain a
    separately protected recovery copy;
12. invoke the bounded canonical-profile backfill only through a reviewed
    isolated harness, then require zero legacy, divergent, corrupt, or
    rotation-required rows before proposing `dual_write`;
13. run the full MFA lifecycle through the built Worker: enroll, confirm,
    save and consume one backup code, login with TOTP, login with a backup
    code, regenerate, disable, and verify all session/audit effects;
14. test missing/wrong key versions, stale/revoked sessions, cross-origin
    writes, user-agent mismatch, attempt exhaustion, and parallel D1 login
    and disable operations;
15. verify that `ALLOW_PLATFORM_AUTH_HEADERS` remains absent unless the edge
    demonstrably strips client input and injects authenticated headers;
16. send and confirm real RU and UZ deletion OTP messages, then verify
    one-winner D1 concurrency, exact challenge evidence, audit-chain entry,
    all-local-session revocation, and provider-failure invalidation;
17. compare every new policy registry digest with the rendered RU/UZ page and
    obtain owner/legal approval before changing any status from draft through
    a new immutable version;
18. send both RU and UZ email-change batches to controlled current/new
    staging mailboxes, verify provider-failure invalidation, stale/MFA/session
    denial, target-ownership races, one-winner D1 confirmation, canonical
    identity rotation, current-session preservation, other-session/device
    revocation, and invalidation of old/new login/deletion/MFA challenges;
19. repeat workspace-invitation one-winner, identity-binding,
    owner-role preservation, expiry/revocation, and audit rollback through the
    full staging HTTP boundary;
20. prove `platform_staff_assignments` and `platform_staff_role_events` are
    empty; keep the internal grant/revoke service unreachable and do not
    bootstrap a role or expose a staff route until operator identity,
    emergency revocation, and immutable customer-resource access evidence
    have their own reviewed vertical.

Required read-only queries:

```sql
SELECT invitation_status, status, can_view, joined_at IS NULL, count(*)
FROM document_collaborators
GROUP BY invitation_status, status, can_view, joined_at IS NULL;

SELECT count(*) FROM documents WHERE workspace_id IS NULL;
SELECT count(*) FROM document_files WHERE workspace_id IS NULL;

SELECT user_id, count(*)
FROM account_deletion_requests
WHERE status IN ('requested','reviewing')
GROUP BY user_id
HAVING count(*) > 1;

SELECT acceptance_method, count(*)
FROM user_acceptances
GROUP BY acceptance_method;

SELECT
  count(*) AS total,
  sum(email_ciphertext IS NULL) AS legacy_email,
  sum(phone IS NOT NULL AND phone_ciphertext IS NULL) AS legacy_phone
FROM user_profiles;

SELECT email_key_version,email_lookup_key_version,count(*)
FROM user_profiles
WHERE email_ciphertext IS NOT NULL
GROUP BY email_key_version,email_lookup_key_version;

SELECT count(*) AS platform_staff_assignments
FROM platform_staff_assignments;

SELECT count(*) AS platform_staff_role_events
FROM platform_staff_role_events;
```

### Read-only staging preflight — 2026-07-29

All nine query groups above were executed against exact D1 `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) in EEUR before any identity runtime
activation. Wrangler reported `changes: 0` and `rows_written: 0` throughout.
The collaborator distribution, duplicate active deletion requests, acceptance
methods, encrypted-profile key groups, and both staff tables returned empty
sets; null-workspace documents and files were both `0`; `user_profiles` was
empty, with `legacy_email = NULL` and `legacy_phone = NULL` aggregate results.
No row contents, identifiers, addresses, or secret-derived values were logged.
This is an empty-state compatibility preflight, not authenticated HTTP,
provider, concurrency, or future-data evidence.

## Not complete

- no live Turnstile or Resend delivery has been verified;
- migrations 0011–0029 are schema-applied to isolated staging but not
  production; no identity backfill, provider, or full-HTTP lifecycle is proven
  by schema application and Worker deployment alone;
- TOTP and backup codes are implemented and verified locally, but no staging
  key ring, runtime activation, real-device authenticator flow, or remote D1
  concurrency test has been completed;
- trusted-device bypass and administrator-assisted recovery are not
  implemented by this slice;
- operator identity placeholders, final RU/UZ policy text, policy effective
  dates, and the language-priority rule still require legal approval;
- account deletion now creates a verified request only; cancellation,
  retention classification, export hold, provider/R2 erasure, delayed purge,
  and proof-of-erasure orchestration are not implemented;
- device-aware management covers JURO local email sessions only; an external
  identity provider's other sessions cannot be listed or revoked here;
- canonical profile dual-read/write and local backfill/verify primitives now
  exist, but mode remains `legacy`; staging key configuration, reviewed
  invocation, verification, plaintext contract removal, and key retirement
  are not implemented or authorized;
- invitation evidence now has a disabled local expand layer, but workspace
  plaintext email and legacy SHA digests remain; no remote TTL drain,
  revocation/reissue rehearsal, contract migration, or key activation has
  occurred;
- OTP/deletion evidence now has a disabled local HMAC expand layer, but raw
  OTP email and all legacy SHA digests remain; no remote activation,
  dependency-safe retention drain, pseudonymization, contract migration, or
  key retirement has occurred;
- protected email change is implemented and verified locally, and its schema
  is in isolated staging, but real Resend batch delivery, remote D1 race tests,
  alert mail, and staging session/device revocation evidence are still absent;
- the platform staff policy and migrations 0020–0021 are schema-only in
  isolated staging; an
  internal fresh-MFA grant/revoke service and immutable role-change events now
  exist, but there is no bootstrap, route/API, `/admin` or support UI,
  privileged content grant, customer-resource access event, or staging MFA
  evidence;
- saved-contact identity fields and document/AI content remain outside the
  protected expand layers;
- independent `5/email/hour` and `20/IP/hour` OTP limits are locally tested,
  but live staging behavior and product impact behind shared NATs remain
  unverified;
- session persistence now has locally verified 24-hour standard and 30-day
  remember-me paths. MFA elevation and MFA disable each rotate the exact current
  token without extending absolute expiry; stale-token replay revokes the
  affected session/device, and concurrent disable has one guarded winner.
  Migration `0029`, migration-specific backup/restore, and the elevation Worker
  deployment pass in staging. The new MFA-disable code still requires exact-SHA
  CI/deployment and protected HTTP/cookie proof; periodic/email-change rotation,
  regional signals, and security email remain open;
- workspace invitation migration 0022 and OTP-lock migration 0023 are applied
  to staging; their local one-winner/rollback/15-minute-lock tests are not
  full-HTTP remote behavior evidence;
- cleanup scheduling for expired pending credentials and consumed/invalidated
  MFA/deletion challenges remains inactive until the reviewed cleanup
  queue/Cron lifecycle is enabled;
- the protected staging Worker, custom domain, resource bindings, Turnstile
  site/secret bindings, and anonymous Access denial are verified; the current
  authenticated auth/provider trace and wider browser matrix remain open;
- remote D1 race tests and authenticated full HTTP MFA/invitation/workspace
  E2E remain release gates;
- production remains frozen pending the later explicit owner confirmation.
