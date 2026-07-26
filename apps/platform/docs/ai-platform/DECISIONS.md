# JURO AI platform decision log

This log records material implementation decisions. Status values are `accepted`, `pending approval`, or `superseded`.

## D-001 — implementation baseline

Status: accepted
Date: 2026-07-26

Use the Sites source revision `86843ca` as the implementation baseline because it is materially ahead of GitHub `main`. Synchronize it into `feature/juro-ai-platform` before relying on GitHub CI or deployment.

Consequence: GitHub `main` must not be deployed over the current application.

## D-002 — production freeze

Status: accepted
Date: 2026-07-26

Do not modify production schema, resources, secrets, or deployment during phases 0–9. Production requires a separate explicit approval after staging gates.

## D-003 — migration strategy

Status: accepted  
Date: 2026-07-26

Use additive expand-contract migrations:

```text
add → dual read/write if necessary → backfill → verify → switch → remove later
```

An in-D1 table copy is not accepted as a backup. Every remote migration requires an external verified export and isolated restore rehearsal.

## D-004 — external collaboration scope

Status: accepted  
Date: 2026-07-26

An invitation in `invited` state grants no document access. Accepted external collaboration is modeled separately from active-workspace membership, displayed in an explicit shared scope, and always constrained by the more restrictive rule.

## D-005 — asynchronous infrastructure order

Status: accepted  
Date: 2026-07-26

Implement and test queue consumers, idempotency, DLQ behavior, scheduled locks, and run records before binding live queues or Cron triggers. Do not attach resources to placeholder handlers.

## D-006 — Vectorize metadata strategy

Status: accepted  
Date: 2026-07-26

Store all required user-document metadata but create at most ten indexed metadata properties per index. Each environment declares a distinct index name intended for a physically separate index; control-plane inventory must prove that separation before `environment` is omitted as a filter. Authorization remains a D1/server check before and after vector search.

## D-007 — legal source authority

Status: accepted  
Date: 2026-07-26

LexUZ is the normative source of truth; AdviceUZ supplies practical scenarios; internal JURO materials are always labeled non-official. A citation is not confirmed solely by vector similarity. Exact server-side source/version verification is mandatory.

The rule governing RU/UZ text divergence remains `pending approval` and must live in protected configuration rather than an editable prompt.

## D-008 — AI provider configuration

Status: accepted  
Date: 2026-07-26

Provider calls are server-only. Model names are versioned server configuration, not secrets. Structured output is validated with Zod, with bounded repair/retry. Actual provider/model, instruction hash, source index version, and legal database version are recorded for each run.

## D-009 — personal AI Gateway logging

Status: accepted  
Date: 2026-07-26

If Cloudflare AI Gateway is used, personal requests disable payload collection while retaining safe cost/latency/error metadata. Semantic cache is disabled for user content. Public non-personal legal-source operations may be cached only after an explicit privacy review.

## D-010 — deferred provider features

Status: accepted  
Date: 2026-07-26

Realtime audio/video calls and payments use adapter interfaces and disabled feature flags until providers are selected and tested. UI must say “Скоро” and must not simulate calls, charges, or completion.

## D-011 — Sites binding normalization

Status: accepted  
Date: 2026-07-26

Use `wrangler.jsonc` as the environment-aware source configuration. During Vite build, mutate the resolved Cloudflare config in place. Replace the canonical Sites `DB` and `BUCKET` only for an explicit production build; development and staging retain isolated source bindings. Returning an additional configuration object is prohibited because `defu` concatenates arrays and can produce duplicate binding names.

Deployable validation targets the flattened `dist/server/wrangler.json`, selected at build time with `CLOUDFLARE_ENV`. Do not add `--env` to deployment of that artifact.

## D-012 — queue content and execution fencing

Status: accepted  
Date: 2026-07-26

Queue envelopes contain opaque identifiers only and reject unknown fields. Tenant-scoped jobs require `workspaceId`; consumers reload and reauthorize state server-side. Job execution and outbox dispatch use separate short leases, owner-token fencing, canonical envelope hashes, and bounded retries.

Raw user/provider content and raw errors are prohibited in queue bodies, job records, metrics, and logs.

Until a tenant-scoped composite idempotency model is introduced, all job and
request idempotency keys must be generated server-side in a globally
namespaced format. No client-supplied key may reach these tables.

## D-013 — Cron and consumer activation

Status: accepted  
Date: 2026-07-26

Omit `triggers` entirely until the Cloudflare control-plane inventory and reviewed scheduled job exist. `CRON_ENABLED=false` is defense in depth, not a replacement for trigger inventory.

Queue consumer declarations are also not proof that resources exist or are safe to activate. A disabled runtime still receives and retries messages when live consumers are attached. Staging activation therefore requires exact resource inventory, handler readiness, DLQ behavior, and alert verification.

Malformed envelopes and disabled handlers are intentionally terminal in the
current inert implementation. A live producer must not be wired until
quarantine/DLQ consumers, alerts, redrive policy, ledger reconciliation, and
per-kind producer/handler flags are implemented. Side-effecting handlers also
require provider idempotency or immutable subject-version identifiers plus
lease renewal/fencing; the current short lease is sufficient only for the
read-only D1 probe.

## D-014 — OTP claim and request atomicity

Status: accepted  
Date: 2026-07-26

A valid OTP is spent by a guarded `UPDATE ... RETURNING` before account or
session side effects. Incorrect attempts use a separately guarded increment.
OTP creation uses a conditional `INSERT ... SELECT` in one D1 batch with
previous-challenge invalidation and a result snapshot. Resend is called only
after the reservation succeeds.

The fail-closed consequence is deliberate: a downstream account/session
failure can consume a valid code, but it cannot create two sessions. The user
must request a new code.

Missing `CF-Connecting-IP` is represented as null; it is never hashed into a
shared `"unknown"` bucket.

## D-015 — active workspace and external document grants

Status: accepted  
Date: 2026-07-26

Owner authorization requires the document or standalone file to belong to the
owner's verified active workspace. A null workspace fails closed. Accepted
external collaborator grants remain usable across workspaces and appear only
in the explicit shared scope.

Invitation rows grant no access before acceptance. Accept and decline update
the invitation, collaborator grant, and deterministic audit event in one D1
batch. Legacy accepted collaborators do not require `joined_at`, and an
already accepted active collaborator cannot be demoted by a new invitation.

## D-016 — authentication principal and local session scope

Status: accepted  
Date: 2026-07-26

Authentication state carries its source, local session ID, and assurance
level. A trusted edge header is `platform_header/upstream`; it is not silently
treated as a JURO local session or as JURO MFA. The session/device UI manages
only JURO email-code sessions and states this boundary explicitly.

New local sessions use both a 30-day absolute lifetime and a seven-day idle
lifetime. Last-seen writes are throttled to five minutes. Login and revocation
state changes are committed with an append-only, per-user hash-chained
security event.

## D-017 — identity key rotation and MFA activation

Status: accepted  
Date: 2026-07-26

Identity encryption uses a versioned server-only key ring: AES-256-GCM with
record-bound AAD for recoverable secrets and domain-separated HMAC-SHA-256 for
lookups and high-entropy recovery codes. Writes use the active version; reads
may use retained prior versions during rotation.

TOTP enrollment must not become user-visible until one complete vertical is
ready: encrypted enrollment, confirmation, one-time backup-code display,
email-OTP pre-auth challenge, mandatory TOTP/backup verification before
session issuance, replay fencing, recent re-authentication, and rollback-safe
audit. Merely adding an enrollment toggle would create an authentication
bypass and is prohibited.

## D-018 — MFA pre-authentication and exact factor claims

Status: accepted
Date: 2026-07-26

When an account has an active TOTP credential, a successful email OTP consumes
that OTP but creates only a short-lived, hashed pre-auth challenge. A primary
session is created only after a valid TOTP step or one-time backup code.
Pre-auth state is stored in a separate HttpOnly, Secure, SameSite=Strict cookie
scoped to `/api/auth/verify-mfa`; it is never accepted as an application
session.

Every confirmation, login, backup-code regeneration, and disable operation
uses a unique factor claim bound to the exact operation ID and credential ID.
All downstream credential, session, backup-code, and audit mutations check
that exact claim in the same D1 batch. A losing concurrent operation therefore
cannot reuse the winner's factor proof or revoke/downgrade the winner's
session.

MFA management requires a current, active, absolute-unexpired and
idle-unexpired JURO local session. Trusted platform headers cannot enroll,
manage, or satisfy JURO MFA, and an account with active MFA cannot fall back to
a platform-header principal.

## D-019 — security-event chain tail follows topology

Status: accepted
Date: 2026-07-26

The current per-user security-event head is the event whose hash is not
referenced as another event's `previous_hash`. It is not the event with the
latest client-provided timestamp. Choosing by `created_at` can select a
non-tail after concurrent or out-of-order writes and permanently reject later
events through the chain uniqueness fence.

Tail selection therefore follows the stored hash graph using a `NOT EXISTS`
child query. The database uniqueness constraint remains the concurrency fence;
callers retry from the newly observed tail instead of weakening append-only or
fork protection.

## D-020 — policy versions are immutable content evidence

Status: accepted
Date: 2026-07-26

Policy acceptance is bound to a server-owned document key, machine version,
locale, and SHA-256 digest over canonical semantic content. The client never
submits a version or digest. Runtime verification fails closed when displayed
content changes without an intentional version update.

Policy rows and acceptance evidence are append-only. Legacy version-only rows
are marked `legacy_unverified`; migration must not invent a hash. Optional
marketing belongs in the revocable `consents` model, not in legal document
acceptances.

The current application policies remain `draft`: operator identity placeholders
and legal approval are unresolved. A visible draft label is mandatory.
Publishing an approved text requires a new immutable version and approved
effective date, not mutation of the draft row.

## D-021 — deletion request requires exact email challenge proof

Status: accepted
Date: 2026-07-26

An account-deletion request is accepted only from a JURO local email session
authenticated within ten minutes and after a dedicated, salted-and-hashed email
OTP bound to the exact user and session. Trusted platform headers, login OTP
state, and a typed `DELETE` value alone are insufficient.

Challenge consumption, deletion-request insertion, workspace audit,
append-only security event, and all-local-session revocation are guarded by one
operation ID in one D1 batch. Database constraints reject concurrent active
requests and mismatched challenge evidence. Resend is called only after atomic
reservation and uses the challenge ID as its idempotency key.

This operation records a verified request; it does not purge data. Retention,
legal hold, export, provider/R2 deletion, cancellation, delayed purge, and
proof-of-erasure require a separate reviewed workflow. Append-only legal
evidence must be retained or pseudonymized under an approved policy before any
user-row deletion. Remote migration 0015 also requires a preflight check for
legacy duplicate active requests before its partial unique index is applied.

## D-022 — canonical identity encryption uses an expand/backfill/contract gate

Status: accepted
Date: 2026-07-26

Canonical `user_profiles` email and phone protection is not a one-step SQL
migration. D1 cannot derive AES-GCM ciphertext or a keyed lookup digest without
the server-only identity key ring, while those fields participate in login,
sessions, workspace bootstrap, team display, and document collaboration.

Migration 0016 therefore adds only nullable, versioned ciphertext/IV and
lookup-HMAC columns plus completeness triggers and lookup indexes. The checked
in environment remains `IDENTITY_PROTECTION_MODE=legacy`. In the later
`dual_write` mode, reads prefer protected values, compare them with retained
plaintext, and fail closed on partial state or divergence; writes use the
active key version while lookups try every retained version and the legacy
column during expansion.

Backfill is explicit, bounded, optimistic, idempotent, and independently
verified. Rotation rewrites protected fields only. Plaintext columns and their
existing uniqueness constraint remain the compatibility and concurrency fence
until staging has proven complete backfill, old-key read/current-key write,
zero divergence, and rollback. Clearing plaintext, retiring a key version, and
migrating invitation/auth-challenge identifiers are separate contract slices;
they must not be inferred from the expand migration.

## D-023 — invitation identity evidence follows purpose and retention

Status: accepted
Date: 2026-07-26

Invitation identifiers are authorization evidence and must not share lookup
domains with canonical profiles or with each other. A workspace invitation
needs to display its email to authorized team managers, so its expand form is
record-bound AES-256-GCM plus a versioned, workspace-scoped lookup HMAC. A
document invitation needs only equality authorization, so it stores an
explicit `email`/`phone` kind and a domain-separated versioned lookup HMAC.

Migration 0017 is additive. It retains workspace plaintext email and both
legacy SHA-256 columns for rollback and for invitations created before
activation. In `dual_write`, keyed evidence is authoritative whenever present:
a mismatch, partial field group, unknown key version, wrong AAD, or plaintext
divergence fails closed and never falls back to a matching legacy hash.
Explicit `legacy` mode preserves the historical SHA comparison as the
application rollback path.

Active legacy invitations are allowed to drain through their seven-day TTL or
be revoked and reissued before a later contract migration. Short-lived login
and deletion challenges have separate user/session/challenge binding,
rate-limit, consumption, and cleanup semantics; their digest migration is a
separate slice and is not implied by 0017.

## D-024 — short-lived challenges use keyed, non-recoverable evidence

Status: accepted
Date: 2026-07-26

Login/registration OTP and account-deletion challenges need equality,
rate-limit, and one-time-code verification; the server never needs to recover
their stored email or code after delivery. Their expand layer therefore uses
domain-separated HMAC-SHA-256 rather than adding new recoverable ciphertext.
Email, request IP, login code, deletion email, and deletion code use distinct
purposes. Login codes are bound to challenge ID and purpose; deletion codes
are bound to challenge ID, user ID, and local session ID.

Migration 0018 is additive. It adds nullable digest/key-version pairs, lookup
indexes for OTP email/IP rate limiting, and insert/update completeness
triggers. It retains raw OTP email, legacy SHA-256 email/IP/code fields, salt,
TTL, attempts, and lifecycle timestamps so the prior application remains a
valid rollback after the schema expands. It computes no digest in SQL and
contains no key material.

In `dual_write`, new challenges write both forms. Keyed evidence is
authoritative whenever present, retained SHA evidence must agree, and
rate-limit lookup tries the active and every retained HMAC key version.
Pre-0018 rows with no keyed group continue through the exact legacy SHA path.
Explicit `legacy` mode writes null keyed fields and preserves the historical
verification contract.

Ten-minute expiry is not deletion evidence. Historical OTP rows may be
referenced by MFA or policy evidence, and deletion challenges are referenced
by deletion requests. Cleanup remains disabled until a reviewed,
dry-run-first retention/pseudonymization plan classifies those references.
Clearing raw email and legacy digests, deleting expired rows, and retiring a
key version are later contract actions requiring staging counts, backup and
restore proof, dependency-safe predicates, and explicit authorization.

## D-025 — email change requires dual-address proof and a one-winner identity rotation

Status: accepted
Date: 2026-07-26

A canonical account email can change only from a JURO local session
authenticated within ten minutes. When TOTP is active, that session must have
MFA assurance; a trusted platform-header principal or a primary-only session
cannot manage the operation.

The server creates two different six-digit codes, binds each code to the exact
challenge, user, local session, and destination role, and sends both messages
in one idempotent Resend batch request to the current and proposed addresses.
The challenge is not confirmable until Resend has accepted that batch request.
Provider acceptance is queueing evidence, not proof that either mailbox
delivered or opened the message.

Successful confirmation is one D1 batch with an operation fence. It consumes
the exact challenge, rechecks the current protected identity and target
uniqueness, rotates the canonical email, invalidates old/new login OTP,
deletion, MFA-login, and competing email-change challenges, revokes every
other local session/device, and appends both workspace audit and security-chain
evidence. The current verified session remains usable and resolves the new
canonical address. Parallel confirmations have one winner; audit failure rolls
back identity rotation, consumption, and revocation.

Migration 0019 is additive and keeps rollback-safe raw/SHA fields while adding
versioned encrypted/HMAC evidence. Checked-in identity mode remains `legacy`,
the UI is unavailable without Resend configuration, and no remote migration,
real-email delivery, or D1 concurrency test is implied by local evidence.

## D-026 — database status alone cannot make a legal source trusted

Status: accepted
Date: 2026-07-27

A `legal_sources.status='verified'` row is necessary but insufficient for
legal-source trust. Before a source can enter an AI context, comparison result,
monitoring feed, citation response, or global-search result, the server also
requires an exact HTTPS origin in the protected allowlist: `lex.uz`,
`www.lex.uz`, `advice.uz`, or `www.advice.uz`. Credentials, lookalike
subdomains, alternate schemes, and arbitrary HTTPS hosts fail closed.

The allowlist lives in server code, not in editable database content or an
admin prompt. Future official sources require an intentional code/config review
and tests. This origin check does not prove that an act, article, revision, or
quoted fragment is correct; exact citation/version verification remains a
separate Phase 3 gate.

## D-027 — platform staff authorization is separate, expiring, and MFA-only

Status: accepted
Date: 2026-07-27

Workspace membership and onboarding attributes are tenant/product data, not
platform staff authority. A workspace `owner`, `admin`, or `lawyer`,
`account_type`, organization role, trusted platform header, and upstream
assurance therefore grant no `/admin`, support, or legal-review capability.

Migration 0020 adds only expiring `administrator`, `support`, and
`legal_reviewer` assignments. Grant evidence is immutable, administrator
self-grant is rejected, revocation is one-way, and rows cannot be deleted.
Capabilities do not inherit across roles: an administrator is not implicitly
support or a legal reviewer. Combining duties requires separate active
assignments.

The shared request boundary accepts only a live JURO local session with MFA
assurance and an active TOTP credential, then rechecks the session, device,
MFA time, assignment start/expiry/revocation, and requested capability in D1.
Sensitive future routes can require a narrower fresh-MFA window. The helper
does not grant case, document, workspace, or customer-content access.

This is a disabled authorization foundation, not a staff feature. No role is
inserted by migration, no management mutation or admin/support UI exists, and
lawyer client access still requires the separate user-confirmed case-grant and
immutable access-event design from Phase 7.
