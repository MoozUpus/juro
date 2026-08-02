# JURO AI platform decision log

This log records material implementation decisions. Status values are `accepted`, `pending approval`, or `superseded`.
## D-085 — provider citations are closed referential records, not model-authored metadata

Status: accepted and locally verified; staging deployment pending
Date: 2026-07-31

An allowed source ID alone is insufficient citation evidence. Legal chat now rejects duplicate source records, citations missing from the response source panel, confirmed findings without source IDs, and confirmed deadlines without source IDs. Document analysis applies the same duplicate/referential checks, requires citations for legal-compliance risks and missing-clause claims, and cannot mark compliance verified without a declared verified source.

OpenAI, Anthropic fallback, the AI HTTP route, and the asynchronous document processor all enforce the boundary. The route and processor then overwrite every provider-authored title, article, excerpt, URL, effective date, and verification time with the server-retrieved canonical record before persistence. Invalid output becomes `INVALID_AI_OUTPUT`; it is not saved, charged, or shown as a successful analysis.

This is defense in depth around the existing publication/lifecycle/hash replay. It does not establish semantic entailment between a cited fragment and an AI claim, and it does not make the absent staging corpus or provider secrets available. No migration or dependency is required.



## D-084 — legal conclusions require complete corpus freshness and replayable publication evidence

Status: accepted, tested, and deployed to owner-protected staging
Date: 2026-07-31

A successful single-document fetch or parse is not evidence that the JURO legal database is current. Freshness is established only when both `lex` and `advice` have a successful `initial_corpus`, `scheduled_corpus`, or `manual_corpus` run. The database `asOf` value is the older of the two latest successful run timestamps. A missing, invalid, or future timestamp is `unavailable`; more than seven days is `stale`.

Before any legal text enters an AI prompt, retrieval revalidates the exact current source/version/publication/lifecycle chain, canonical evidence JSON and SHA-256 values, actor and activation linkage, source/version/raw hashes, effective/expiry dates, and the complete immutable section/chunk reading set. Database status flags alone never establish trust.

`unavailable` removes confirmed legal findings and citations and returns a non-chargeable clarification boundary in chat; document analysis retains only structural findings and marks legal compliance unverified. `stale` moves confirmed findings to assumptions, makes deadlines preliminary, lowers legal-compliance confidence, exposes an RU/UZ warning, and recommends lawyer review. No migration or dependency is required. Until complete Lex and Advice corpus runs exist in staging, the expected runtime state is fail-closed `unavailable`.

The exact code commit `af1b0bf` is deployed only as `juro-platform-staging` version `37687899-f17a-4bdf-9f9c-41c6b509cfb9`. D1 has zero qualifying corpus runs, so runtime freshness truth remains `unavailable`. Rollback is the prior staging version `ffbfe9df-40f8-4442-8080-7eaf1e63fe40`; production remains `91774ed4-72e9-47bb-b93a-a4208d490b24`. Evidence is in `STAGING-PHASE3-TRUST-FRESHNESS-EVIDENCE.md`.


## D-083 — enable Advice only as a reviewed single-document staging boundary

Status: accepted, tested, and deployed to owner-protected staging
Date: 2026-07-31

Advice acquisition is enabled only for exact current public document URLs: Russian `/ru/documents/{positiveId}` and Uzbek Latin `/oz/documents/{positiveId}`. The old `/questions` shape and Cyrillic `/uz/documents` are rejected. `www` canonicalizes away, the database trigger independently matches host/path/locale/ID, robots is re-read for every acquisition, and a minimum one-second Advice delay applies even without a declared Crawl-delay. There is no discovery crawler.

The Advice parser is fail-closed to `.page-document-content`; it cannot fall back to page chrome or the whole body. Acquisition and parsing create only private content-addressed R2 evidence, a fetched/pending-review version, and a low-confidence manual review. They never create publications, reading rows, embeddings, citations, or AI context.

Owner-only staging enables both Advice ingestion and staff source submission. Development and production remain disabled. Live RU and Uzbek-Latin probes completed once each; exact replays wrote zero rows; D1 integrity passed; publications/sections/chunks and `staging-advice-uz` vectors remained zero. Production Worker, Sites, and `apps/website` were unchanged. Exact evidence and rollback are in `STAGING-0038-ADVICE-EVIDENCE.md`.

## D-076 — create business workspaces as idempotent tenant transactions

Status: accepted and verified in owner-only staging
Date: 2026-07-30

A company remains a business workspace, not a login persona. The settings flow accepts a normalized full name, separate short name, locale, and client-generated UUID request ID. The server authenticates and CSRF-checks first, then atomically inserts the business workspace, owner membership, default-workspace selection, and workspace audit. Deterministic opaque IDs plus a partial unique request index make exact retry idempotent; payload mismatch or cross-user request collision fails closed without membership disclosure.

Migration `0034` additively backfills bounded identity for legacy business rows and guards future insert/update identity while leaving personal workspaces nullable. No new runtime dependency was added: the form uses existing primitives and CSS-only press feedback with reduced-motion support. The standard backup/restore gate, remote migration, 391-test suite, type-check, lint, staging build/artifact, authenticated RU/UZ browser QA, D1 audit/integrity proof, and 100% staging deployment are complete. Production remains unchanged; exact evidence is in `STAGING-0034-EVIDENCE.md`.
## D-075 — gate destructive staging probes behind runtime identity validation

Status: accepted; post-reentry runtime validation failed closed and the flag was restored
Date: 2026-07-30

Account-deletion purge evidence uses an exact staging-only synthetic subject,
an explicit disabled-by-default feature flag, and the real Cron/Queue consumer.
The probe validates the deployed identity key ring before creating any D1 or R2
fixture and exposes only a phase-specific safe error code. Secret values are
never read back, copied into a command, or inferred from control-plane presence.

The controlled post-reentry run was bounded by owner-only Access,
`APP_ENV=staging`, a unique identifiers-only outbox subject, pre-run Time Travel
bookmark, and aggregate D1/R2 postflight. Temporary version
`8e12a990-5ea0-4d60-9a5f-6000903a668c` enabled the probe. The consumer returned
`STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED` before creating a deletion request,
profile, file, lifecycle/purge evidence, or R2 object. Final version
`2ebc2ea8-6216-4f39-af96-d1b600973b74` restores the flag to `false` at 100%.

The result proves the opaque staging value remains malformed; it does not expose
which field is wrong and is not permission to guess or auto-rotate it. Owner
correction through protected Cloudflare controls and a protected recovery copy
are required before another controlled rerun. Production remains unchanged and
unauthorized.
## D-001 — implementation baseline

Status: superseded by D-029
Date: 2026-07-26

Use the Sites source revision `86843ca` as the implementation baseline because it is materially ahead of GitHub `main`. Synchronize it into `feature/juro-ai-platform` before relying on GitHub CI or deployment.

Consequence: GitHub `main` must not be deployed over the current application.

## D-002 — production freeze

Status: accepted
Date: 2026-07-26

Do not modify production schema, data, traffic, domains, secrets, or deployment during phases 0–9. Production requires two separate explicit approvals after staging gates: one for the functional platform deployment and another for replacing the current UI with Cinematic Legal Intelligence.

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
lease renewal/fencing. No current v2 handler executes work: source declares
producers only, consumers are absent, and every valid v2 kind is terminally
disabled.

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
Session-lifetime clause: superseded by D-045
Date: 2026-07-26

Authentication state carries its source, local session ID, and assurance
level. A trusted edge header is `platform_header/upstream`; it is not silently
treated as a JURO local session or as JURO MFA. The session/device UI manages
only JURO email-code sessions and states this boundary explicitly.

The principal/source boundary, device scope, seven-day idle cap, throttled
last-seen writes, and security-event behavior remain accepted. D-045 replaces
only the original universal 30-day absolute lifetime with the required
24-hour standard and 30-day remember-me choice.

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
inserted by migration, and no externally reachable management mutation or
admin/support UI exists. The internal service added by D-028 remains
unreferenced by every route and runtime entrypoint. Lawyer client access still
requires the separate user-confirmed case-grant and immutable access-event
design from Phase 7.

## D-028 — administrator role changes are atomic, chained, and unreachable by default

Status: accepted
Date: 2026-07-27

Migration 0021 and the internal role-management service add the next
deny-by-default layer without creating an operator or exposing an HTTP route.
Only one active `administrator` assignment, backed by a live local session,
active TOTP, and MFA verified within five minutes, can grant or revoke a
platform role. A grant also requires active TOTP on the subject, expires
within 30 days, and cannot target the actor. Revocation applies only to a
currently active assignment; administrator self-deprovisioning is allowed.

Each administrator mutation and its `staff.role.granted` or
`staff.role.revoked` event execute in one D1 batch. Events form a per-actor
SHA-256 chain with a database-enforced single current predecessor, preserve
the exact session, assignment, subject, role, reason, MFA time, and operation
time, and reject update or deletion. The actor-session identifier deliberately
has no foreign key so normal session retention cannot erase or block
privileged evidence; actor, subject, and assignment references remain
restrictive.

This does not solve trusted operator bootstrap. Until a verified operator
identity, out-of-band approval, emergency revoke procedure, and staging
evidence exist, `platform_staff_assignments` must remain empty and the
management service must remain unreferenced by routes, UI, jobs, and Workers.
Role-change evidence is also not a substitute for future immutable
view/download/edit audit on explicitly granted customer resources.

## D-029 — preserve Sites v20 and reconcile source history without rebasing

Status: accepted
Date: 2026-07-28

The deployed `app.juro.uz` runtime baseline is Sites v20 source commit
`40310786188eb545f224e906c2c9506c146a907c`, not the older `86843ca` snapshot
and not GitHub `main`. The local `feature/juro-ai-platform` branch preserves
that source lineage and includes current GitHub `main` through `a1c572e` via
merge commit `702960e`. Existing feature history is not rebased or rewritten.

Remote draft PR #3 remains at `926ca1a` until the local verified commits are
intentionally pushed. Production stays pinned to Sites v20 until the separate
production gates are approved.

## D-030 — staging uses an isolated Worker and hostname, not the Sites project

Status: accepted
Date: 2026-07-28

The current Sites project has no preview URL and every Sites deployment is a
production deployment. It therefore cannot serve as staging. JURO staging
will use a distinct Worker, D1/R2/Queue/Vectorize set, secrets, feature flags,
test identities, analytics dimensions, email mode, and custom staging
hostname. No Sites checkpoint or prototype deploy is treated as staging.

Workers Domains currently reports `app.juro.uz` on legacy Worker `juro` while
Sites reports and serves the same hostname through its provider Worker. Route
ownership must be reconciled read-only before any production routing change.

## D-031 — rotate the connector-exposed Sites bypass token

Status: accepted
Date: 2026-07-28

A read-only Sites connector response unexpectedly exposed a bypass bearer
token in raw tool telemetry. The value was not copied, used, persisted, or
committed. It is nevertheless treated as exposed and must be rotated/revoked
before production work. The raw connector operation must not be repeated, and
the token must never be placed in chat, a ticket, documentation, screenshot,
log, environment example, or Git history.

## D-032 — 3D Jurobek remains disabled until the approved rigged source exists

Status: accepted
Date: 2026-07-28

No GLB, FBX, USDZ, Blender, glTF, VRM, or other rigged Jurobek source exists in
the reconciled checkouts or inspected delivery archives. Available assets are
static raster renders only. The platform uses the existing static WebP poster
as a fallback; text and voice remain usable without WebGL; avatar and
voice-with-avatar flags stay off. JURO will not invent a new character,
reconstruct a rig from raster art, fake microphone/speech state, or claim
armature, skinning, lip-sync, animation, material, mesh, or shirt-lettering
work without the owner-approved source package.

## D-033 — reconcile approved Cloudflare names before provisioning

Status: accepted
Date: 2026-07-28

The latest owner-approved R2, Queue, and Vectorize names/taxonomy supersede the
older generic source naming for new resources. Existing production
`juro-production` and `juro-private-documents` are preserved. Existing older
development buckets and eight empty, unbound queues are inventory evidence,
not permission to abandon data or create overlapping consumers. Phase 1 first
records an exact old-to-target mapping and additive copy/cutover plan, then
creates only missing isolated development/staging resources. Cleanup of an
old empty resource is a separate reviewed operation.

Stable R2 bindings point to `juro-development-files`, `juro-staging-files`,
and preserved production `juro-private-documents`, with environment-specific
`juro-{environment}-backups` and `juro-{environment}-quarantine` stores. Queue
bindings become task-specific document-analysis, OCR, document-export, email,
legal-source-sync, retention-cleanup, notifications, and conditional
malware-scan queues using `{environment}-{purpose}` names. A distinct DLQ is a
future activation requirement for each real consumer, not a current source
declaration.
`ai.request`, `backup.run`, and `platform.probe` receive no live Queue mapping.
Vectorize bindings become `LEX_UZ_INDEX`, `ADVICE_UZ_INDEX`,
`INTERNAL_LEGAL_MATERIALS_INDEX`, and `USER_DOCUMENTS_INDEX`; language-index
or user-memory resources cannot be relabeled as those data classes.

Implementation note (2026-07-28): contract v2 is applied and verified locally.
Wrangler declares seven producers, `consumers: []`, no DLQ or trigger, and no
malware producer. `MALWARE_SCAN_QUEUE` remains a code-only contract until a
real fail-closed scanner exists. Legacy `ai.request`, `backup.run`,
`platform.probe`, and `file.process` are blocked by schema, routing, and outbox
tests. The later D-037 and D-038 record the only subsequent remote mutations:
isolated non-production D1/R2 creation and inert Queue/DLQ/Vectorize
provisioning, all without application data, Worker bindings, messages,
vectors, or deployment.

## D-034 — prove both portable D1 restore and Time Travel undo

Status: accepted
Date: 2026-07-28

JURO does not use the legacy alpha `wrangler d1 backup` flow. Before a remote
migration, staging must prove a portable SQL export/import into a separate
disposable drill D1 and a bookmark-based Time Travel restore plus
`previous_bookmark` undo on `juro-staging`. Maintenance/read-only mode, stopped
queue traffic, exact database UUID checks, integrity/foreign-key/schema/row
invariants, sanitized audit evidence, and measured recovery time are mandatory.
Production names, IDs, bookmarks, and credentials cannot participate in the
staging rehearsal.

Implementation note (2026-07-28): the empty staging Time Travel half passed
end-to-end. A synthetic marker disappeared after restoring the original
bookmark, returned through the restore response's `previous_bookmark`, and was
removed again by the final restore; the final EEUR query re-read a clean state.
The portable half remains blocked: D1 export reached `complete`, but connector
egress explicitly forbids the signed `r2.cloudflarestorage.com` download and
the non-interactive Wrangler shell has no API token. No SQL bytes, protected R2
object, isolated import, or RTO is claimed.

## D-035 — use a reduced OpenAI embedding dimension that fits Vectorize

Status: accepted as the staging candidate; legal retrieval quality gate open
Date: 2026-07-28

`text-embedding-3-large` is the current OpenAI candidate because OpenAI
documents it as its most capable embedding model for English and non-English
tasks. Its default output is 3,072 dimensions. OpenAI's current embeddings API
supports a `dimensions` request parameter for the `text-embedding-3` family,
while Cloudflare Vectorize supports at most 1,536 dimensions. JURO will
therefore use the explicit server-side candidate contract
`text-embedding-3-large`, `dimensions=1536`, `metric=cosine` for staging.

This is a compatibility decision, not proof of Uzbek legal retrieval quality.
Before ingestion or production use, a reproducible RU, UZ Latin, UZ Cyrillic,
English, and cross-language evaluation must compare retrieval quality and
cost, record the model/dimension/preprocessing version, and retain hybrid
lexical retrieval, freshness/status filters, reranking, tenant authorization,
and server-side citation verification. A dimension or model change requires a
new physical index and complete re-embedding; an existing index is never
silently reused with a different vector contract.

Official references:

- https://developers.openai.com/api/docs/models/text-embedding-3-large
- https://developers.openai.com/api/docs/guides/embeddings
- https://developers.openai.com/api/reference/resources/embeddings/methods/create
- https://developers.cloudflare.com/vectorize/platform/limits/

## D-036 — replace unscoped visual overrides with semantic platform tokens

Status: accepted; implementation limited to the isolated staging prototype
Date: 2026-07-28

The current `globals.css` contains two unscoped `:root` token sets. The later
JURO 2.0 landing block globally changes navy, gold, paper, shadow, and both font
families and also changes `body`, so marketing choices leak into authentication
and legal work surfaces. The migration will introduce stable semantic CSS
variables with explicit shell/work-surface scopes as documented in
`DESIGN-SYSTEM.md`. The existing production routes remain unchanged until the
prototype is approved. No new font family or motion dependency is added merely
to perform the token normalization.

## D-037 — place new non-production durable resources in EEUR

Status: accepted and provisioned for the empty Phase 1 foundation
Date: 2026-07-28

The isolated staging D1 was created in EEUR as `juro-staging`, database ID
`bb716a96-b2fb-4823-90d6-6c228fed181a`. The approved development and staging
primary, backup, and quarantine R2 targets were also created as empty private
EEUR Standard buckets. They were re-read after creation. No object was copied,
no binding or Worker was attached, and no production resource was changed.

This placement reduces avoidable regional spread for the new empty resources,
but it is not a claim of Uzbekistan data residency, legal compliance, backup,
recoverability, quarantine, or malware scanning. Those claims remain gated by
the documented data map and legal review, real storage/access flows, verified
backup/restore drills, a fail-closed scanner, and staging evidence. Existing
legacy development resources remain untouched pending an additive inventory
and cutover decision.

## D-038 — provision empty non-production Queues/DLQs and Vectorize indexes without activation

Status: accepted and provisioned as an inert Phase 1 foundation
Date: 2026-07-28

Development and staging each receive seven task-specific primary Queues and
seven distinct `{primary}-dlq` resources. All 28 resources were re-read with
86,400-second retention and zero producers/consumers. The source still declares
`consumers: []`; no Worker binding, handler, message, redrive, or malware queue
is attached. Retry/backoff and DLQ delivery are deliberately deferred until a
real side-effect-safe consumer is implemented, tested, alerted, and reconciled.

The first provisioning request created `development-document-analysis`, then a
Queue settings update returned Cloudflare error `10013`. Inventory identified
that exact partial state; the remaining create operations resumed idempotently
and no duplicate was created. The API default retention is recorded as fact,
not treated as an approved delivery policy.

Development and staging also each receive four empty Vectorize v2 indexes:
`lex-uz`, `advice-uz`, `internal-legal-materials`, and `user-documents`, using
1,536 dimensions and cosine distance. No vector or metadata index was inserted.
Provisioning establishes only physical isolation; D-035's multilingual legal
retrieval evaluation, hybrid search, tenant pre/post-authorization, freshness,
reranking, and citation-verification gates remain unchanged. No production
Queue, DLQ, Vectorize, binding, Worker, or deployment was created or changed.

## D-039 — use a shell-neutral fail-closed launcher on Windows and POSIX

Status: accepted and locally verified
Date: 2026-07-28

All package lifecycle commands route through the Node launcher. Offline tasks
inherit an explicit environment allowlist; install-only network/auth variables
are separately allowlisted. Dependency installation uses a project-keyed OS
mutex, identity-checked stale-lock quarantine, bounded `npm pack` preflight
with lockfile SRI verification, and process-tree cleanup on Windows/POSIX.
`--validate-only` does not prove a clean network `npm ci`, which remains
explicitly unverified.

## D-040 — permit one reproducible bootstrap of the verified-empty staging D1

Status: executed successfully; one-time verified-empty staging exception consumed
Date: 2026-07-28

D-034's portable SQL export/import gate remains mandatory for production and
for every migration of a database that contains durable application or user
data. It is not waived by this decision.

The first bootstrap of `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) was permitted without the unavailable
portable SQL artifact only after an immediate preflight proved that the
database still contained no application schema or migration ledger, captured
the current Time Travel bookmark, and confirmed that production remained
untouched. This narrow exception was justified because the staging database
was newly created and empty, the Time Travel restore plus undo drill had
already passed, and its entire target schema was reproducible from immutable
Git migrations.

The bootstrap must reproduce Wrangler 4.92.0 exactly: create the standard
`d1_migrations` table, then submit one atomic D1 `/query` request per migration
in sorted order `0000` through `0021`, with the corresponding ledger insert in
the same request. It must inspect every returned sub-result, stop on the first
failure, and verify migration order, schema invariants, foreign keys, and a
post-migration bookmark. Combining migrations, writing the ledger separately,
skipping `0000`, or treating this exception as a production precedent is
prohibited.

Execution evidence (2026-07-28): pre-bootstrap bookmark
`00000016-00000000-000050b6-d17b2ef8af450f78e2ba993d4272fe26`
advanced to post-bootstrap bookmark
`00000016-00000036-000050b6-48eec1201b71eda52af14c1ba998f030`.
The re-read ledger contains exactly 22 ordered entries `0000`–`0021`;
`PRAGMA quick_check` returned `ok`, foreign-key violations were zero, and the
manifest contained 98 tables including `d1_migrations`, 275 schema objects,
and all seven migration-0011 control tables. This exception is closed and
cannot authorize a future staging or production migration.

## D-041 — preserve trigger statements with transactional D1 batch requests

Status: executed successfully in staging; reproducible production-tooling gate open
Date: 2026-07-28

Three clean-room staging attempts proved that the Windows checkout reaches
`0013_new_jubilee.sql` and is then rejected by remote D1 as
`SQLITE_ERROR: incomplete input`. A restore-safe probe isolated the cause:
D1 accepted the same compound `CREATE TRIGGER ... BEGIN ... END` statement
with LF and rejected it with CRLF. The Git blob already contains LF, while the
Windows working copy had converted it to CRLF. Each failed attempt restored
the preflight Time Travel bookmark and a post-restore query proved that neither
the migration ledger nor application schema remained.

The staging bootstrap adapter must normalize only line endings to LF, may split
each immutable migration only at Drizzle's explicit
`--> statement-breakpoint` delimiters, and submit those complete statements
plus the ledger insert in one D1 `batch` request. The repository also pins
`apps/platform/drizzle/*.sql` to `eol=lf` through `.gitattributes` so a fresh
Windows checkout cannot silently recreate the failure.
Cloudflare documents D1 batch as a single SQL transaction: a failed statement
aborts or rolls back the entire sequence. Compound trigger bodies are never
split on their internal semicolons. The adapter still uses exactly one remote
write request per migration, keeps the ledger insert in the same transaction,
verifies the ledger prefix after every commit, and stops on any mismatch.

No checked-in migration is rewritten by this workaround. Before production,
the same adapter must exist as reviewed, reproducible source tooling with tests
or the upstream Wrangler/raw-query path must be proven fixed; a one-off
connector execution is not an acceptable production migration mechanism.

Final staging evidence: the diagnostic established that remote D1 rejects the
compound `CREATE TRIGGER` input with CRLF and accepts the same statement with
LF. The successful bootstrap normalized only line endings, preserved complete
trigger bodies, used one transactional batch per migration with its ledger
insert, and produced the D-040 integrity/manifest result. Repository-root
`.gitattributes` now pins `apps/platform/drizzle/*.sql text eol=lf`; this
prevents recurrence in a fresh Windows checkout but does not replace the
production migration-tooling gate.

## D-042 — create the first staging Worker without any public exposure

Status: accepted and locally verified; remote upload blocked on approved Wrangler authentication
Date: 2026-07-28

The staging environment explicitly sets `workers_dev: false`,
`preview_urls: false`, and `routes: []`. Source tests and flattened-artifact
validation require those values together with no schedules, no Queue
consumers, `ASYNC_RUNTIME_ENABLED=false`, `CRON_ENABLED=false`, and no
`ALLOW_PLATFORM_AUTH_HEADERS`. This closes the default Cloudflare exposure
path before a first upload.

The first Worker upload must use the pinned Wrangler `deploy` flow because a
version upload cannot create a new Worker. It may occur only after local owner
authentication through official Wrangler OAuth or an approved narrow token;
credentials never enter chat, Git, documentation, screenshots, or logs. The
upload creates an inactive Worker with no public traffic. Control-plane
verification must then prove subdomain and previews disabled, no route/domain/
schedule/consumer attachment, exact staging-only bindings, and unchanged
production Worker/domain state.

No staging hostname may be attached until Cloudflare Access is configured and
an unauthenticated request is proven denied. The current connector cannot
faithfully upload the multi-module Vinext bundle and static-assets JWT flow,
and Sites cannot serve as staging because its deploy is production-facing.
For the first version, rollback is the exposure kill switch: keep subdomain and
previews disabled and detach only a staging hostname if one was later added;
retain the Worker and data resources for evidence. D1 rollback remains a
separate Time Travel/export and expand-contract process.

## D-043 — workspace invitation acceptance uses an immutable one-winner claim

Status: accepted and locally verified; remote migration/staging HTTP gate open
Date: 2026-07-28

Migration `0022` adds a unique nullable acceptance claim that must be recorded
with `accepted_at` and becomes immutable after acceptance. The application
claims the exact token and identity evidence through a guarded
`UPDATE ... RETURNING`, then conditions membership, default-workspace, and
audit effects on that claim within one D1 batch. A pre-existing owner role is
never downgraded. Concurrent acceptance has one durable winner, and an audit
failure rolls the batch back.

This does not make `workspace_audit_events` a global append-only or
tamper-evident ledger. The current redirect remains
`/:locale/:accountType/main` and does not yet introduce the target
`workspaceId` business route. Migration `0022` and the full HTTP flow remain
unverified in remote staging.

## D-044 — OTP abuse controls are independent and Turnstile is fail-closed

Status: accepted and locally verified; live-provider and remote-migration gate open
Date: 2026-07-28

OTP request limits are separate: five challenges per email per hour and 20 per
Cloudflare connecting IP per hour. Key rotation must preserve the same logical
rate bucket across retained lookup versions. A missing connecting IP omits the
IP predicate rather than grouping unrelated users. Provider failures that
invalidate a reserved challenge still count against the email limit.

The fifth incorrect verification atomically exhausts the challenge and sets
an immutable 15-minute lock under migration `0023`; a replacement challenge
for the same email is rejected while that lock is active. Turnstile uses the
official Siteverify endpoint, exact action `auth_otp`, exact expected hostname,
an optional remote IP, and fail-closed invalid/unavailable outcomes.
`TURNSTILE_SECRET_KEY` is server-only; `TURNSTILE_SITE_KEY` is environment-
specific public widget configuration. No live Turnstile, live Resend, remote
`0023`, or protected staging HTTP verification is claimed.

## D-045 — session persistence is 24 hours by default and 30 days by choice

Status: accepted and locally verified; staging HTTP gate open
Date: 2026-07-28

A local session has a 24-hour absolute lifetime unless the user explicitly
selects remember-me, in which case it has a 30-day absolute lifetime. The
cookie `Max-Age` and persisted `expires_at` use the same choice for both direct
email-OTP completion and MFA completion. The existing idle expiry remains
capped at seven days, so inactivity may end a remembered session earlier.

This decision supersedes only D-016's universal 30-day lifetime. It does not
claim session-token rotation, fixation/replay detection, regional alerts,
security email, or remote staging behavior; those gates remain open.

## D-046 — profile persona and active workspace type are independent

Status: accepted and locally verified; staging HTTP gate open
Date: 2026-07-28

`user_profiles.account_type` records the user's personal persona:
`individual`, `entrepreneur`, or `lawyer`. A business workspace is a tenant
context, not a replacement login persona. Selecting a workspace therefore
updates only `default_workspace_id`; routing derives `business` from the
active workspace type and otherwise retains the stored personal persona.

This removes the previous coupling that rewrote `account_type` to `business`
or `individual` during a workspace switch. It does not yet introduce the
required `/:locale/business/:workspaceId/*` route shape; that remains a
separate expand/redirect migration with regression coverage.

## D-047 — localized auth/onboarding is canonical and guest default is Uzbek

Status: accepted and locally verified; staging/browser gate open
Date: 2026-07-28

Canonical entry surfaces are `/:locale/auth/login`,
`/:locale/auth/register`, and `/:locale/onboarding`. Unauthenticated root and
incomplete-profile root default to Uzbek when there is no saved preference;
completed users retain the saved profile locale and personal persona. Legacy
unlocalized and `/:locale/login|register` entries remain compatibility
surfaces so inbound links are not broken.

Registration no longer presents business as a login persona; it presents
individual, entrepreneur, or lawyer. A business workspace is created or
joined after identity onboarding. The current product module still uses
`/main`; changing it to `/dashboard` is explicitly deferred to the route
migration instead of silently breaking existing links.

## D-048 — legal-source trust requires immutable verification evidence

Status: accepted and locally verified; ingestion and remote activation gates open
Date: 2026-07-28

Migration `0025` is an additive, fail-closed expansion. Existing and newly
inserted source rows default to `verification_state='draft'`; the pre-existing
generic `status='verified'` value is insufficient. A source becomes eligible
for current application consumers only when its exact official HTTPS host and
declared source type agree and it has an explicit verified state, UTC
verification time, reviewer identifier, and lowercase SHA-256 evidence.
Verified evidence cannot be silently rewritten while the record remains
verified. Source versions use the same evidence principle, and a partial
unique index permits only one running sync for a lock key.

This decision does not approve or claim a crawler, a legal-reviewer privilege
workflow, source accuracy, historical applicability, Vectorize indexing,
hybrid retrieval, citation existence/version validation, Cron execution, or
remote migration. Those are separate Phase 3 gates. Until they pass, the
absence of trusted sources must remain an honest empty/unavailable state and
must never be replaced with fabricated legal citations.

## D-049 — legal-source acquisition is explicit, robots-gated, and untrusted

Status: accepted and locally verified; remote migration/network activation and legal-review gates open
Date: 2026-07-28

Migration `0026` and the acquisition service create one explicit official-page
request, an identifiers-only outbox message, a bounded `legal.sync` execution,
a content-addressed private R2 raw object, and a D1 version awaiting review.
Only exact HTTPS Lex document and Advice question routes are accepted. Every
redirect is manual and must remain HTTPS, within the same official source
family, locale, and document identifier. A fresh bounded `robots.txt` request
must allow the path. Missing/invalid robots policy, positive crawl-delay,
wrong media/encoding, excessive bytes, body stall, downgrade, or off-source
redirect fails closed; an empty HTML body is also rejected. Request/outbox
idempotency is bound to the actor and environment so a conflicting replay
cannot enqueue an orphan job. Raw HTML is untrusted and is not parsed,
indexed, or sent to an AI model by the acquisition slice itself.

Lex single-act acquisition is code-enabled based on the narrow official-act
reuse boundary described at <https://lex.uz/uz/axborot>, still subject to live
robots policy and later legal approval. Advice acquisition remains disabled by
`LEGAL_ADVICE_INGESTION_ENABLED=false` because the inspected public usage page
at <https://advice.uz/uz/page/how-it-works> did not establish sufficiently
explicit broad ingestion authorization for this decision. Enabling Advice is
a separate reviewed owner/legal/config/staging action.

All environments still set `ASYNC_RUNTIME_ENABLED=false`, have no Queue
consumer, and have no Cron trigger. No successful live official-page fetch,
remote R2 object, remote `0026`, reviewer approval, trusted source publication,
Vectorize write, or production change is claimed. R2 precedes idempotent D1
persistence because the services cannot share a transaction; a failure may leave a harmless
unreferenced content-addressed object, never a verified source.

## D-050 — source normalization is deterministic and remains pre-verification

Status: accepted and locally verified; live-markup, review/publication, and
remote activation gates open
Date: 2026-07-28

Pending-review source versions receive an identifiers-only `legal.parse` job
on the existing legal-source Queue contract. Normalization uses exact
`parse5@8.0.1` and its transitive `entities@8.0.0` dependency. Both are
server-side parser dependencies (MIT and BSD-2-Clause respectively), declare no
install lifecycle hook, and are not client UI dependencies. The choice provides the
same deterministic WHATWG HTML tree in Node tests and the Worker bundle;
Worker-native `HTMLRewriter` was not used because it would make the core
normalization path unavailable to the existing deterministic Node/SQLite
contract tests.

The verified three-environment dry-run reports a production Worker upload of
`8154.86 KiB` (`2041.22 KiB` gzip), versus the preceding checkpoint's
`7896.29 KiB` (`1980.75 KiB` gzip): `+258.57 KiB` raw / `+60.47 KiB` gzip.
The client build still transforms 1,921 client modules and the final client
artifact contains zero parser/profile markers, so this is a server/Worker cost
rather than a new browser dependency. It is accepted for this isolated
normalization boundary and remains subject to the Worker bundle budget during
later integration.

The parser accepts only explicit `main`, `article`, or `[role=main]` content,
never the whole body, excludes page chrome/scripts/hidden content, and emits a
bounded strict semantic-block schema. Raw bytes must match the acquisition
SHA before parsing. Parsed JSON is private and content-addressed; replay
revalidates object size, SHA, schema, canonical source identity, and raw-source
hash. Structural failure creates an idempotent low-confidence review item.

This stage is deliberately not legal verification. It cannot write verified
sections/chunks, embeddings, citations, or AI context and cannot promote a
source/version. R2 still precedes fenced D1 persistence, so a D1 failure may
leave an unreferenced immutable parsed object but never a trusted record. A
read-only live Lex probe failed closed at `robots.txt` before fetching the act
body, so compatibility with current live Lex/Advice markup remains unproved.

## D-051 — legal review is an MFA-bound evidence decision, not publication

Status: accepted and locally verified; staff route exists behind a false flag;
admin UI, publisher, and remote activation gates open
Date: 2026-07-28

Migration `0027` and the internal legal-review service add a dedicated
`legal_reviewer` decision boundary on top of the untrusted normalized source.
Claim and decision require the existing `legal.sources.review` capability, an
active local MFA session, active TOTP, and MFA verification no more than 15
minutes old. Administrator and support roles do not inherit the capability.
A review has one assignee; same-reviewer claim/decision replays are
idempotent, while another reviewer or different evidence fails closed.

The terminal row stores decision notes, the exact parsed SHA-256, reviewer,
canonical JSON evidence, its SHA-256, and decision time. D1 guards require the
JSON review/source/version/decision/hashes to match the relational row and
make terminal identity/evidence immutable and undeletable. Legacy decisions
are preserved without fabricated backfill and therefore do not acquire the
new evidence contract retroactively.

Approval deliberately returns `publicationRequired=true` while leaving the
source version `pending_review` and the source merely `fetched`. It creates no
sections, chunks, vectors, citations, or AI context. Rejection atomically
marks the review and pending version rejected and rejects the source only when
there is no verified version. A separate privileged publisher must reload the
R2 snapshot, validate this decision evidence, create versioned reading data,
and perform the verified-state transition. No remote migration, active route, UI,
source publication, or production change is claimed.

## D-052 — publication is a separate fresh-MFA evidence boundary

Status: accepted and locally verified; staff route exists behind a false flag;
admin UI, retrieval, and remote activation gates open
Date: 2026-07-28

Migration `0028` and the internal publisher service add a distinct
`legal.sources.publish` capability. Only an active dedicated legal reviewer
with TOTP and MFA verified no more than 15 minutes ago may publish; the generic
administrator and support roles do not inherit this capability. Publication
requires the exact approved `0027` decision-evidence SHA-256 and independently
reloads and validates the private normalized R2 snapshot, source identity, raw
hash, parsed hash, and approved-review evidence.

The service deterministically materializes bounded version-specific reading
sections and chunks and records a canonical identifiers-only publication
evidence document plus its SHA-256 in the same D1 batch that marks the source
and version verified. D1 guards require the approved review, hashes, source
identity, bounded reading-row shape/counts, and canonical session/assignment/
MFA references to agree; the server service proves those access references
against live staff, session, and TOTP state before input parsing or any write.
Publication evidence and all published section/chunk rows are
immutable and undeletable. Same-evidence replay verifies every stored reading
row and is idempotent; concurrent or conflicting publication fails closed.

The database cannot calculate SHA-256 itself, so the application verifies the
canonical publication-evidence hash on replay while D1 enforces the relational
and JSON identity constraints. The slice intentionally publishes only the
first verified version for a source: activation of a replacement historical or
current version needs a later explicit version-switch model. It creates no
Vectorize entry, lexical index, citation, AI context, remotely active HTTP
route, admin UI, or remote resource, and makes no production change.

## D-053 — privileged legal-source routes are capability-first and disabled by default

Status: accepted and locally verified; remote activation and UI gates open
Date: 2026-07-28

The integration branch adds three narrow POST routes for review claim, review
decision, and approved-source publication. They share a runtime-neutral HTTP
boundary so service tests do not load Worker-only bindings. The boundary checks
the exact `LEGAL_SOURCE_STAFF_API_ENABLED=true` flag before session resolution
or D1/R2 access. All checked-in development, staging, and production values are
`false`; generated Cloudflare types, configuration tests, and flattened-
artifact validation enforce this state. Disabled responses are neutral RU/UZ
`404` responses and cannot reveal whether a review exists.

If separately enabled in a reviewed environment, each mutation must pass the
canonical same-origin/CSRF contract, local-session resolution, active
assignment, exact capability, active TOTP, and MFA freshness before bounded
JSON parsing. Claim returns structured normalized blocks and evidence hashes
but omits the duplicated full plain-text payload. Error responses are RU/UZ,
no-store, and do not expose internals.

Local D1/R2 tests prove disabled no-session behavior, authorization before a
malformed body is parsed, and the exact claim/approve/publish/idempotent replay
flow. The verified production dry-run shape is `8203.01 KiB` raw and
`2049.67 KiB` gzip, a `+48.15 KiB` raw / `+8.45 KiB` gzip server-Worker change
from the preceding publisher checkpoint; the client build remains at 1,921
modules. This decision does not authorize a remote migration, reviewer bootstrap,
Worker upload, route/DNS attachment, feature activation, staff UI, or production
change.

## D-054 — the legal-source inbox is a separate dense staff surface

Status: accepted and locally implemented; staging activation gate open
Date: 2026-07-28

The legal-source review workflow is exposed locally at
`/:locale/admin/legal-sources/reviews` instead of being placed inside a
customer account/workspace shell. Review assignments are platform duties, not
tenant objects. The route therefore uses a small staff-specific shell and
never infers authorization from an individual, entrepreneur, business, or
lawyer URL segment.

Both the server-rendered page and the API require the exact
`LEGAL_SOURCE_STAFF_API_ENABLED=true` value. When false, the page and list,
claim, decision, and publication operations return neutral not-found behavior
before resolving a session or touching D1/R2. When enabled, the page
independently proves a local session, active legal-reviewer assignment, active
TOTP, and MFA freshness no older than 15 minutes. API authorization precedes
filter, cursor, path, and body parsing.

The list is metadata-only, exact-host validates official links, uses bounded
keyset pagination, and never returns R2 keys or source text. Source blocks and
evidence hashes become available only after the atomic single-owner claim.
Approve/reject and publication remain separate explicit actions. The UI uses
an Operate/admin design profile: dense sans-serif controls, a reading-first
legal canvas, semantic status colors, no decorative motion, responsive table-
to-record layout, and no new runtime dependency. This does not activate the
flag, bootstrap a reviewer, deploy staging, or change production.

The first three-environment dry-run after this slice measured the production
Worker at `8245.45 KiB` raw / `2059.19 KiB` gzip. Relative to D-053 this is
`+42.44 KiB` raw / `+9.52 KiB` gzip. The staff client code is an isolated
dynamic chunk of `15,833` bytes raw / `5,113` bytes gzip; the client graph
increased from 1,921 to 1,922 modules. Final numbers must be re-recorded after
any later code or CSS change.

## D-055 — stage legal migrations with portable checkpoints and D1-native trigger guards

Status: accepted and verified in isolated staging; production remains blocked
Date: 2026-07-29

Owner-approved Wrangler OAuth is scoped operationally to staging. Before
mutation, `juro-staging` was exported, hashed, round-tripped through private
`juro-staging-backups`, and restored into isolated local SQLite with integrity,
foreign-key, schema, and migration-ledger verification.

The standard migration run applied `0022`–`0024`, then remote D1 rejected
`0025` with `incomplete input`. The failed migration was atomic and `0026`–
`0028` remained pending. The incompatibility was limited to trigger-body
`SELECT CASE ... THEN RAISE(...) END`: local SQLite accepted it, while the
remote D1 migration parser did not. The guards now use the equivalent
`SELECT RAISE(...) WHERE condition` form, retaining the exact predicate and
error message. Tests apply every migration with foreign keys enabled and
forbid reintroducing the incompatible form in migration `0025` or later.

A second protected checkpoint captured the exact `0000`–`0024` state. The
retry applied `0025`–`0028`; Wrangler then reported no pending migration.
Remote inventory verified 29 ledger rows, 107 non-internal tables, and 58
triggers. A third private export round trip restored with integrity `ok` and
zero foreign-key errors. Exact bytes, hashes, and object references are kept in
`BACKUP-RESTORE.md`.

The successful additive prefix was not rolled back merely because the later
migration initially failed. No production/development D1, production Worker,
Sites version, route, domain, or secret was changed. This decision authorizes
neither a production migration nor public staging routing.

## D-056 — deploy the first staging Worker as an unreachable foundation

Status: accepted and control-plane verified; public staging gate remains open
Date: 2026-07-29

After commit `29a3d9a` passed local type-check, lint, the 330-test suite,
three-environment Cloudflare matrix, generated binding type check, explicit
staging artifact validation, Drizzle schema check, refined secret scans, and
both GitHub PR checks, pinned Wrangler `4.92.0` deployed
`juro-platform-staging`.

The deployment is intentionally unreachable: Worker subdomain and preview
URLs are disabled; routes, DNS, schedules, Queue consumers, and secrets are
empty. All async/Cron/legal-ingestion/staff-route flags are false, identity
mode remains `legacy`, and no platform-header bypass exists. The Worker binds
only isolated staging D1/R2/Vectorize/Analytics/Images/Assets resources and
seven Queue producers. With runtime execution false and no consumer or public
route, this is infrastructure attachment evidence, not functional staging HTTP
or provider evidence.

The control plane independently returned version
`14d89ac0-19f5-4c0d-89f5-7db97a50bb44` and deployment
`e09462ba-b8e6-40fe-abd6-83893652abb9`. Sites remained public version 20 with
no preview URL; legacy Worker `juro` remained on version
`91774ed4-72e9-47bb-b93a-a4208d490b24` and deployment
`54aee3c6-39eb-4a16-ae59-c74418ae599f`. No production deployment, migration,
route, domain, or resource mutation was authorized or performed.

## D-057 — use `dashboard` as the canonical local module and preserve `main` as a redirect

Status: accepted and locally verified; production unchanged
Date: 2026-07-29

The target architecture names the primary workspace route
`/:locale/:accountType/dashboard`. The integration branch now uses
`dashboard` in the module classifier, desktop/mobile navigation, root and
workspace entry, OTP/MFA completion, onboarding completion, workspace
selection, and invitation completion. `main` is no longer an accepted
platform module.

Existing inbound `/:locale/:accountType/main` URLs are preserved through a
method-preserving 308 handler. The unlocalized `/main` compatibility page
continues to resolve the authenticated user's saved locale/persona and then
enters `dashboard`. Rendered-Worker tests cover RU individual and UZ business
legacy redirects; the complete type-check, lint, test, staging build,
staging-artifact, generated binding, and three-environment configuration
checks pass. The required document-builder route remains present in the route
manifest.

This is an additive source migration. It does not claim the final business
`/:locale/business/:workspaceId/...` contract, change production routes, or
authorize a staging/production deployment.

## D-058 — do not attach staging traffic until secrets and Access exist on the exact boundary

Status: blocked by verified external configuration
Date: 2026-07-29

After the owner reported entering staging secrets, the authenticated Wrangler
session was rechecked against the exact `juro-platform-staging` service.
`wrangler secret list --name juro-platform-staging`,
`wrangler secret list --env staging`, and the Worker settings API all
returned zero secret bindings. The Worker version and modification timestamp
also remained unchanged. No local secret file/process value or account
Secrets Store was present. Secret values were neither read nor requested.

The proposed hostname `staging.app.juro.uz` remains absent from DNS. A
read-only Access application query failed with
`access.api.error.not_enabled`, proving that the account has no enabled
Cloudflare Access control plane for an owner-only policy.

The staging Worker therefore remains intentionally unreachable: no custom
domain, route, Workers.dev/preview URL, schedule, consumer, or feature
activation may be added. The next external actions are to attach the required
bindings to the exact staging Worker and enable Access; only then may an
owner-only policy be created and unauthenticated denial proven before DNS or a
Worker domain is attached. Production and Sites remain unchanged.

## D-059 — accept the post-0028 staging backup as remotely importable, not as an operational RTO

Status: accepted and verified for isolated staging only
Date: 2026-07-29

The exact private-R2 `post-0028.sql` object was downloaded, rehashed to
`20e9d14e5eb279160eeebb59cd839882f3ff70afb758924a15bcd735965b981c`,
and imported into disposable EEUR D1 `juro-staging-restore-drill-20260729`
(`0c3f0d3c-b752-4aff-83b9-17621a5ef92e`). Wrangler processed 396 queries and
reported 667 rows written. Identical source/restore queries returned 29
migrations, 107 non-internal tables, 58 triggers, matching final migration
rows, and zero foreign-key violations.

After exact name/UUID revalidation, only the disposable database was deleted;
the local temporary copy was also removed. `juro-staging`, development,
production, Sites, DNS, Workers, routes, and secrets were not mutated by the
drill. The measured 33.63 ms D1 SQL duration is import telemetry, not an
incident RTO. Every future migration needs a new checkpoint and restore drill,
and production recovery remains separately blocked.

The Phase 2 read-only preflight was then run against exact `juro-staging` with
zero writes. Null-workspace document/file counts were zero; duplicate active
deletion, collaborator, acceptance, encrypted-profile-key, and staff-role
queries returned empty sets. This permits continued empty-state compatibility
work but does not activate identity runtime or prove HTTP/provider behavior.

## D-060 — protect staging with an owner-only Access application before exposing it

Status: accepted and HTTP/control-plane verified; staging only
Date: 2026-07-29

Cloudflare Zero Trust is enabled for organization `curly-rice-90a4`. Its Cloudflare identity provider (`42ab9b55-7e07-45f5-962f-c3d464bd42fe`) is restricted to account members. A self-hosted Access application, `JURO platform staging — owner only` (`d88c147e-bbd0-43bd-b783-3fc49a7edd11`), targets only `staging.app.juro.uz` and has the sole inline allow policy `90306b71-4731-47fa-969e-34fc22722f17`, matching one exact owner email.

The application is hidden from the App Launcher, auto-redirects to the sole Cloudflare IdP, uses an eight-hour session and enables binding, HttpOnly and Strict-SameSite cookies. It contains no wildcard domain, group, bypass, or service-token rule. The application was re-read from the Access API after creation.

Only after that verification, the new custom domain `staging.app.juro.uz` was attached to the staging Worker `juro-platform-staging` using custom-domain ID `83fa11970645f783cf0b7cfa6c8b914f2753325e`. An anonymous HTTPS request was redirected to the Cloudflare Access login endpoint rather than receiving application content, proving deny-before-auth.

No production Worker, Sites deployment, production policy, route, or resource was changed. The next gate is an owner login through Access, followed by staging application smoke tests. The previous UI and production traffic remain recoverable and untouched.

## D-061 — make the localized builder path contract single-source before wider UI work

Status: accepted, implemented, and protected-staging verified
Date: 2026-07-29

Builder navigation now derives from one `builder-paths` contract keyed by
locale and account type. Internal client links no longer return users to the
unlocalized compatibility surface, while existing legacy redirects remain for
saved inbound URLs. The application shell owns the sole `main` landmark and
synchronizes `html[lang]` after client route transitions.

The change passed type-check, lint, 337 tests, staging build/artifact checks,
Cloudflare matrix validation, Wrangler dry-run, bounded tracked-file secret
signature scan, a 100% staging deployment, control-plane re-read, anonymous
Access denial, and authenticated RU/UZ browser traversal without console
entries or horizontal overflow. The UZ document-management screen remains a
separate known localization defect. Production was not changed.

## D-062 — localize builder workspace chrome without mutating persisted workflow values

Status: accepted, deployed to protected staging; browser verification pending
Date: 2026-07-29

Document, contact, and notification workspace copy is selected from one typed
RU/UZ Latin contract using the canonical route locale. Existing Russian status
values remain the API and storage contract; the client maps them for display so
localization cannot break filtering, archive rules, or draft continuation.
Notification read actions are explicit buttons rather than pointer-only article
clicks, and the contact form exposes dialog semantics.

This state passes type-check, lint, 338 tests, staging build/dry-run, both CI
jobs, and deployment to `juro-platform-staging`. Deployment
`d9f56c5f-2c3e-4f5e-9e3f-117e51e5d79a` serves version
`7423ffc2-f307-43df-87e0-60d609e47fa1` at 100%; Access and secret-name
re-reads returned 200 and anonymous application access remains denied.
Authenticated browser verification must still be performed against this exact
version before the localized screens are marked fully verified.

## D-063 — treat aggregate OTP state as provider-path evidence, not mailbox proof

Status: accepted and verified for protected staging only
Date: 2026-07-29

After the owner saved staging bindings, the Worker settings API returned the
public `TURNSTILE_SITE_KEY` binding and server-only `IDENTITY_KEYRING`,
`RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY` names. Values were neither read
nor exported. Remote D1 reported 29 applied migrations, three non-invalidated
OTP challenges, and three consumed challenges. Only aggregate counts were read;
no identity, code, salt, token, or message content was inspected.

This evidence proves that persisted staging challenges reached provider-
accepted state and were consumed. It does not substitute for a correlated
current-version browser capture, recipient mailbox evidence, negative provider
tests, or timing-parity tests. Staging remains in expand-safe
`IDENTITY_PROTECTION_MODE=legacy`: zero retained challenges have keyed
evidence and zero profiles have protected identity fields. Dual-write
activation requires its own backfill, verification, rollback, and deployment
checkpoint. Production remains unchanged.

## D-064 — make the business workspace identifier canonical without breaking legacy URLs

Status: accepted; locally and protected-staging control-plane verified; authenticated browser evidence pending
Date: 2026-07-29

Business workspaces use `/:locale/business/:workspaceId/*`. The route layout
does not trust the identifier: it joins active membership, returns neutral
not-found behavior when inaccessible, and idempotently synchronizes the active

## D-079 — preserve case-plan authority through document-builder navigation

Status: accepted, locally verified, and deployed to protected staging
Date: 2026-07-30

Case and plan-step identifiers are navigation context, never authorization. The action plan now carries syntactically valid UUID context through the library, category, template, back, and language-switch paths. The configured-draft backend remains the authority that verifies the authenticated workspace, case, and plan-step relationship before persistence.

Plan-step mutation now uses a strict 2 KiB JSON boundary, allowlisted statuses, positive optimistic revision, and a real date-only calendar value. Cross-tenant and nonexistent case/step combinations return the same neutral `404`. An accepted write recalculates both plan progress and the case's nearest active deadline and records a content-free case event.

The UI exposes every persisted status and a labelled date input in RU/UZ, serializes writes per step, and preserves keyboard focus, responsive layout, and reduced motion. No schema migration or new Cloudflare resource was needed.

Worker version `39050d54-2ad8-4145-9779-1c06e5fe8e47` serves 100% of `juro-platform-staging`; D1 integrity and anonymous Access denial pass. Authenticated browser traversal remains open because the browser-control runtime failed before connection. Production Worker `juro` remains unchanged. Evidence: `STAGING-PHASE6-CASE-PLAN-BUILDER-EVIDENCE.md`.
workspace with an audit event. Shell navigation, builder paths, global search
results, profile links, invitation acceptance, and workspace switching use one
workspace-aware base.

Because the static `business` segment outranks the older dynamic
`:accountType` segment, reserved legacy roots receive explicit authenticated
adapters. They resolve the active tenant and redirect to the canonical workspace
URL; localized `main` retains its existing 308 redirect to the legacy
dashboard entry. This preserves bookmarks without accepting URL shape as
authorization.

Commit `9d4f934` passed GitHub Actions run `30439184724`, was deployed only to protected staging as deployment `8a44aae3-e5c1-4ca5-90c1-547fb9af7bfa` / version `f320057f-740d-465c-9aa2-777538ba5e44`, and was re-read at 100% traffic. Exact staging bindings, disabled execution flags, disabled workers.dev/previews, zero schedules, the custom domain, and anonymous Access denial were verified. Authenticated route traversal remains an explicit open gate. Production remains unchanged.

## D-065 — rotate the local session token inside MFA elevation and fail closed on replay

Status: accepted, locally verified, schema-applied, and Worker-deployed to protected staging; HTTP evidence pending
Date: 2026-07-29

MFA enrollment confirmation now binds its first durable claim to the exact
current session-token digest, retires that digest, rotates to a newly generated
token, elevates assurance, creates backup codes, revokes other sessions, and
writes the security event in one guarded D1 batch. An intervening token change
leaves the credential pending and creates no claim, backup code, history row,
audit event, or neighboring-session revocation.

A request using the unexpired retired token creates at most one replay claim,
revokes the affected current session and its linked device, and appends a
critical `session.token_replayed` event. Only SHA-256 token digests are stored;
the replacement cookie preserves the original absolute expiry. Periodic, email-
change, and MFA-disable rotation triggers are intentionally not claimed by this
slice. A migration-specific portable checkpoint, remote restore drill, additive
staging migration `0029`, post-migration R2 checksum round trip, staging build,
and Worker deployment all passed. Deployment
d033f009-426f-4283-9308-f6c7bdf7f29e serves version
b4a497ce-9a47-4ea9-be75-b0f48e46c7cd at 100%. The exact current-version
HTTP/cookie/replay flow remains unverified because the available browser
control runtime failed before an authenticated Access session could be used;
Access was not bypassed. Production is unchanged.

## D-066 — rotate the local session token when MFA is disabled

Status: accepted, locally verified, and deployed to protected staging; authenticated HTTP evidence pending
Date: 2026-07-29

Disabling MFA is an assurance downgrade and must not leave the bearer token
that authenticated the higher-assurance session reusable. The disable service
now verifies the management factor, binds its claim to the exact active MFA
session-token digest, disables the credential, revokes other sessions, retires
the digest with reason `mfa_disabled`, rotates the current session to a newly
generated token, downgrades it to primary assurance, and appends the security
event in one guarded D1 batch. The HTTP route returns a replacement HttpOnly,
Secure, SameSite cookie whose lifetime is capped by the original absolute
expiry.

Service tests prove the new token works, the retired token triggers the shared
one-claim replay boundary and revokes the downgraded session/device, and two
concurrent disable attempts leave exactly one primary session without partial
MFA state. The full local suite passes 343 checks; type-check, lint, staging
build/artifact validation, canonical builder smoke, and comparison smoke pass.
No migration or dependency is added. Exact-source GitHub Actions run
`30453980092` passed; deployment `888a4800-daf8-4211-b41d-a653d067ecd8`
serves version `448e5bf1-4bf8-4000-af2b-2c034e3eca10` at 100%. Control-plane
bindings, owner-only Access, anonymous 302/no-store denial, and zero pending D1
migrations were re-verified. Authenticated HTTP/cookie/replay evidence remains
open; production is unchanged.

## D-067 — rotate the current session token after confirmed email change

Status: accepted and locally verified; protected staging deployment pending
Date: 2026-07-29

Completing the dual-mailbox email-change ceremony transfers the canonical login
identity and therefore must also retire the bearer token used to authorize that
transfer. Wrong-code spending and the final claim are now guarded by the exact
active session-token digest. The guarded D1 batch first changes the identity,
then uses that identity-change predicate as the prerequisite for token-history
insertion and rotation. It keeps the session ID, replaces the HttpOnly, Secure,
SameSite cookie, and preserves the original absolute expiry.

Service tests prove that the replacement token resolves the new identity, a
replay of the old token creates one durable replay claim and revokes the
replacement session/device, concurrent confirmations have one winner and one
history row, and an audit failure leaves the original identity and token valid
without partial rotation. The full local suite passes 344 checks; type-check,
lint, staging build/artifact validation, canonical builder smoke, and comparison
smoke pass. No migration or dependency is added. Exact-source CI, protected
staging deployment, and authenticated HTTP/cookie/replay evidence remain
pending. Production is unchanged.

## D-068 — notify the previous address through an encrypted durable outbox

Status: accepted and locally verified; migration and staging deployment pending
Date: 2026-07-29

A confirmed canonical email change must notify the previous address without
putting that address into Queue payloads, logs, provider diagnostics, or
plaintext job metadata. The identity-change transaction now creates exactly one
`security_email_jobs` row whose recipient is protected with the versioned
identity keyring and record-bound AES-GCM AAD, plus one identifiers-only
`email.send` outbox row. The recipient ciphertext and key evidence are
immutable. Migration `0030` is additive: one table, three indexes, and one
trigger; the local sequence has 108 application tables, 154 foreign keys, and
zero foreign-key violations.

Only the staging source candidate enables async execution, and only for
`staging-email-notifications`. Development and production remain disabled and
consumer-free. The consumer calls Resend server-side with a stable provider
idempotency key, stores only the provider message ID and safe status/error
codes, suppresses sequential duplicates, fences concurrent sends, and permits a
stale `sending` lease to retry after two minutes. Missing secrets fail closed.
Local tests cover encrypted storage, identifiers-only dispatch, successful send,
retryable provider failure, absent configuration, immutable recipient evidence,
sequential replay, and concurrent delivery. The full suite passes 351 tests;
type-check, lint, Cloudflare matrix, staging build/artifact, builder smoke, and
comparison smoke pass.

Migration `0030` has not been applied remotely. No consumer is attached to the
deployed Worker, no real prior-address message has been sent, and no DLQ/redrive
evidence is claimed. A new portable D1 checkpoint and disposable restore drill
must precede any staging migration/deploy. Production is unchanged.

## D-069 — rotate active local-session tokens on a bounded periodic schedule

Status: accepted and locally verified; protected staging deployment pending
Date: 2026-07-29

An active JURO local session now becomes due for bearer-token rotation 12 hours
after creation or its most recent token rotation. The authenticated application
shell calls one dedicated no-store POST route after a delayed, per-tab jittered
start and reschedules from the server-provided deadline. The route requires the
existing exact same-origin, Fetch Metadata, and `x-juro-csrf` contract. It
accepts only the HttpOnly local-session cookie, never exposes the token to
client JavaScript, and returns a replacement HttpOnly, Secure, SameSite cookie
only after the token-history insert, digest replacement, and hash-chained
`session.token_rotated` event commit in one D1 batch. The session ID,
assurance, idle policy, and original absolute expiry are preserved.

Automatic rotation can overlap a request that captured the prior cookie before
the browser processed `Set-Cookie`. For `periodic` history rows only, the
first 30 seconds therefore form an in-flight compatibility window: the old
token is still rejected and grants no access, but it does not revoke the new
session/device. At 30 seconds the existing one-claim replay revocation resumes.
MFA elevation, MFA disable, and email-change rotations receive no grace. The
shell retries one authentication failure once to recover a concurrent-tab
cookie update and then stops; it does not loop against upstream-header or
expired sessions. Multi-request and strict-after-grace behavior are covered by
service tests, and source contracts cover the CSRF route, cookie issuance, and
shell scheduler. No migration or dependency is added. Type-check, lint, 353
tests, the three-environment Cloudflare matrix, final staging build/artifact,
canonical builder smoke, and document-comparison smoke pass.

This slice has not been pushed, deployed, or exercised over protected staging
HTTP. Production is unchanged.
## D-070 — retain only keyed request evidence and coarse login region

Status: accepted and locally verified; protected staging deployment pending
Date: 2026-07-29

Successful primary and MFA session creation now derives security evidence from
the Cloudflare request boundary without persisting raw network or browser
identifiers. A versioned identity-keyring HMAC domain-separates the connecting
IP and bounded User-Agent by user. The append-only `session.created` event keeps
only those keyed digests, the key version, and sanitized country/region codes
from `request.cf`. City, postal code, coordinates, raw IP, and full User-Agent
are not stored in event metadata. Missing key material omits the optional
evidence rather than falling back to an unkeyed fingerprint.

The signal is deliberately not described as a new device: User-Agent and
approximate region do not establish durable browser identity. Tests cover
bounds, normalization, key separation, direct OTP and MFA success paths, raw
value absence, and hash-chain integrity. The full local suite passes 355 tests;
type-check, lint, the three-environment Cloudflare dry-run matrix, final staging
build/artifact validation, canonical builder smoke, and comparison smoke pass.
No migration or dependency is added. Production is unchanged.
## D-071 — recognize a browser with an opaque, non-authenticating continuity token

Status: accepted and locally verified; migration and protected staging deployment pending
Date: 2026-07-29

A successful email-OTP or MFA login may now issue a year-bounded `juro_device`
cookie. It is HttpOnly, Secure, SameSite=Lax, scoped to `/`, and is never an
authentication factor. The raw 256-bit token exists only in the browser response.
D1 stores a user-bound, purpose-separated HMAC under the versioned identity
keyring, an opaque deterministic record ID, first/last coarse country and region,
and timestamps. Missing key material omits continuity rather than storing a raw
or unkeyed identifier.

Migration `0031` is additive: it creates `auth_device_continuities`, two lookup
indexes, and a nullable `auth_devices.continuity_id` foreign key/index. Existing
devices and sessions remain valid with a null link. Concurrent first use of the
same browser token converges through a deterministic ID plus `INSERT OR IGNORE`;
key rotation recognizes retained key versions and rewrites evidence under the
active version. The same token cannot link different users.

Normal logout revokes only the current session/device row and intentionally
preserves browser continuity. Security-device revocation, logout-all, replay of
a retired session token, account deletion, and non-current sessions affected by
an email change revoke the applicable continuity and linked sessions. Active
session lookup rejects a revoked continuity. Tests cover raw-token absence,
tenant isolation, concurrent first use, key rotation, MFA issuance only after
the second factor, normal logout, remote revoke, replay propagation, email
change, account deletion, cookie boundaries, and additive migration integrity.
The full local suite passes 361 tests; type-check and lint pass. No dependency
was added. Migration `0031` is not applied remotely, the branch is not pushed,
and no new-device/new-region notification is claimed. Production is unchanged.
## D-072 — alert only from durable device continuity and comparable coarse region

Status: accepted and locally verified; migration and protected staging delivery pending
Date: 2026-07-29

A login is classified as `login_new_device` only when a successful login issues
a new opaque continuity record for that user. User-Agent or IP changes alone do
not establish a new device. `login_new_region` is emitted only for an already
recognized, non-revoked continuity when both the previous and current coarse
Cloudflare locations are comparable and either country changes or region changes
inside the same known country. Missing or incomplete location evidence produces
no region alert. Registration does not emit a new-device login alert.

A new additive `security_notification_jobs` table preserves `0030` unchanged and
reuses the encrypted-recipient, identifiers-only outbox and staging email Queue
boundary. The login session, continuity update, notification job, outbox row,
and chained `session.created` event commit in one D1 batch; a forced notification
insert failure rolls all of them back. MFA prepares the notification only after
the second factor succeeds. Recipient/event/context evidence is immutable,
delivery state is leased, and Resend idempotency suppresses sequential and
concurrent replay.

The email copy is available in RU and UZ and describes coarse region as an
approximation, not proof of physical location or account compromise. A stolen
continuity cookie can influence novelty classification but cannot authenticate.
Local evidence is 378 tests (27 rendered, 272 core, 79 Cloudflare), plus passing type-check and lint. Migrations `0030`–`0032` and the isolated staging email consumer are deployed; protected HTTP behavior, DLQ/redrive, and real provider mailbox delivery remain unverified. Production is unchanged.

## D-073 — make account deletion a fenced, retryable D1/R2 lifecycle

A verified deletion request now selects either immediate or 30-day recoverable mode. Confirmation requires a recent local email session, CSRF, one-time email OTP, and a versioned purpose-separated keyed subject. Confirmation, outbox creation, workspace audit, session/device/continuity revocation, and the first lifecycle edge are one D1 batch.

D1 cannot roll back an R2 object deletion. The purge therefore inventories exact owned keys first, rejects sole-owner and active-staff blockers, and then atomically persists `purge_irreversible_at` before touching R2. Cancellation is legal only for recoverable requests before that marker. R2 failure leaves D1 content intact; D1 failure after R2 remains retryable but never cancelable. This avoids both false cancellation and orphaned private objects.

Lifecycle edges and terminal purge evidence are append-only hash chains. The profile is tombstoned rather than deleted so retained consent/security/audit/signature/financial evidence remains referentially stable. Foreign-user contributions are redacted. Completed/cancelled requests and deleted profiles are immutable by trigger.

A blocker may be corrected and retried from a fresh authenticated RU/UZ settings flow. A transient transaction marker fences concurrent retry requests, producing one new outbox job and one lifecycle edge. Local concurrency, failure, blocker, R2, D1, Queue, Cron, migration, route, and UI contracts pass. Migrations `0030`–`0033`, the reviewed email/cleanup consumers, and the single `*/5` outbox cron are deployed only to owner-protected staging. Schema, Access, control-plane, first-cron, and private-backup evidence pass; authenticated synthetic purge and live provider/DLQ paths remain open. Production purge/cron/async stay disabled and production remains unchanged.

## D-074 — treat remote migration parser failures as atomic, inspected gates

Status: accepted and applied to protected staging

Wrangler applied `0030`–`0032` and D1 atomically rejected `0033` because a Drizzle `statement-breakpoint` marker was concatenated with the next `CREATE TRIGGER`. The retry did not proceed blindly. Read-only checks first proved `quick_check=ok`, `0033` still pending, zero `0033` tables/columns, and no conflicting deletion rows. The separator-only fix was committed as `a1261c3`, then the migration/account-deletion subset passed 64/64 before the remote retry.

The retry applied only `0033`; postflight proved the exact 34-entry ledger, empty foreign-key check, expected lifecycle schema/guards, and no pending migration. This establishes the operational rule: any remote parser divergence stops the sequence, requires atomicity evidence, a minimal committed fix, targeted regression coverage, and a second preflight before retry. Production is not an implicit retry target.
## D-075 — honor bounded robots delay and adapt only to observed official Lex structure

Status: accepted, tested, and deployed to protected staging

The first live source probes exposed two facts that local generic fixtures did not: Lex robots negotiation requires a text/plain-compatible Accept header and its public policy declares Crawl-delay: 20; current document content is expressed primarily through lx_elem div blocks rather than paragraph tags. JURO must honor both facts rather than bypass robots or persist an incomplete page.

The acquisition layer now waits supported crawl delays up to 60 seconds and rejects larger/unusable policies. The legal-source consumer remains serial with maximum concurrency one, so a batch cannot parallelize around the source policy. The parser activates the Lex adapter only when official lx_elem blocks actually exist, uses ACT_TITLE as the authoritative title, excludes surrounding chrome, and keeps the generic semantic parser as fallback.

The live staging proof produced 231 normalized blocks and 59536 plain-text characters, while the pre-fix diagnostic produced only three blocks. The source remains pending human review; no auto-publication or Vectorize indexing was introduced. See STAGING-0036-EVIDENCE.md.

## D-076 — fail over legal chat without bypassing safety or source verification

Status: accepted and locally verified; provider secrets and live staging proof pending
Date: 2026-07-30

OpenAI remains the primary legal-chat provider. Anthropic is eligible only for retryable availability/timeout failures or invalid structured output. An OpenAI safety refusal is terminal and is never routed to another provider as a bypass.

Both providers use the same strict `LegalChatResponse` schema, Zod validator, server-owned verified-source allowlist, no-source clarification rule, idempotency reservation, and usage ledger. Completion overwrites the reserved provider/model with the actual provider/model and records `fallback_from_provider`; this makes cost and reliability evidence reflect execution rather than configuration.

Staging model names are explicit non-secret variables. Keys remain environment-isolated server secrets. Because neither provider secret is present in the inspected staging Worker, the deployed route remains fail-closed and no live AI answer is claimed. Production remains unchanged.

## D-077 — stream untrusted documents into quarantine and fail closed before AI

Status: accepted and locally verified; authenticated staging upload and real scanner pending
Date: 2026-07-30

Document analysis intake is split into initialization, binary upload, and finalization. Initialization is strict JSON and tenant-scoped idempotency. Binary bytes are streamed directly from the request body to private R2 with an expected byte count and SHA-256, so a 50 MB document is not routed through JSON or buffered by the Worker. Finalization independently checks R2 metadata and bounded magic bytes.

The object key is opaque and contains no source filename. Until a real privacy-approved malware scanner succeeds, the file remains `quarantined`, the normal download route cannot serve it, and no extraction, OCR, OpenAI, or Anthropic call is permitted. The former synchronous multipart analysis endpoint is disabled instead of retaining a second unsafe path.

The quarantine object remains under a safe prefix in the environment primary private bucket for this slice. Existing account-deletion purge inventories that bucket; moving to the separate quarantine bucket before extending purge would create orphan risk. A later expand-contract step may cut over only after cross-bucket purge and restore evidence exists.

ZIP/DOCX magic confirms only a ZIP container, not archive safety. Traversal, bomb ratio, nesting, count, timeout, DOCX structure, malware, OCR, and prompt-injection gates remain explicitly incomplete. Production is unchanged.

## D-078 — consume only safe document-analysis objects and persist verified output

Status: accepted, locally verified, and deployed to protected staging; scanner/provider/browser gates remain open
Date: 2026-07-30

The staging document-analysis queue now has one reviewed serial consumer and a distinct DLQ. The handler accepts identifiers only, rechecks tenant ownership and `analysis_safe` state, verifies R2 size and SHA-256, and refuses quarantine before any extraction or provider call. Existing job-ledger idempotency is supplemented by a durable `persisting` state so a persistence retry cannot silently create a second provider run.

PDF/DOCX extraction is bounded. Scans, images, oversized binaries, and oversized extracted text move to explicit waiting states instead of being guessed or truncated. Retrieved legal context is limited to activated verified Lex/Advice rows; every provider result passes the same Zod/source boundary and every quoted document excerpt must occur in extracted text.

Anthropic is primary for document analysis and OpenAI is fallback only for retryable availability/timeout/invalid-output failures. Safety refusal is terminal. The current official configuration uses `claude-fable-5` for document analysis and `gpt-5.6-sol` for OpenAI. Actual provider/model, usage, normalized results, and content-free audit metadata are persisted.

The deployed staging Worker has no Anthropic/OpenAI secret binding and the malware scanner is absent. Therefore the end-to-end live provider path remains intentionally unreachable and no completed analysis is claimed. Production remains unchanged. Evidence: `STAGING-PHASE5-ASYNC-DOCUMENT-ANALYSIS-EVIDENCE.md`.

## D-079 — preserve authoritative case and plan context through the existing builder

Status: accepted, tested, and deployed to protected staging
Date: 2026-07-30

The existing document builder remains the only builder surface. A valid case and plan-step context is carried through its library, category, template, locale, and back-navigation links, but the query string is never treated as authorization. Draft creation still revalidates the case and step against the authenticated tenant on the server.

Plan-step mutation uses strict bounded JSON, real date-only validation, neutral inaccessible-object responses, and optimistic revision fencing. A successful mutation recalculates plan progress and the nearest active case deadline in the same D1 batch. This avoids parallel lifecycle implementations and preserves the working canonical builder route. Production is unchanged.

## D-080 — derive specialist handoff from one fail-closed entitlement boundary

Status: accepted, tested, and deployed to protected staging
Date: 2026-07-30

Workspace capability is derived server-side from current D1 subscription evidence. Missing, malformed, unknown, inactive, past-due, or expired evidence resolves to Free. Only current `active` or `trialing` paid evidence enables specialist handoff. The billing and consultation APIs expose the same derived result, and consultation creation checks it before any booking or consent write.

The consultation flow keeps the existing atomic booking/consent/audit batch, adds strict RU/UZ contracts and authoritative case, plan-step, and comparison tenant checks, and returns neutral object errors. Payment remains fail closed until a real configured provider and adapter exist. No subscription, slot, booking, lawyer assignment, or payment was synthesized for evidence. Production is unchanged.

## D-081 — isolate Cinematic Legal Intelligence behind an exact staging boundary

Status: accepted, deployed to protected staging, and control-plane verified; authenticated visual gate open
Date: 2026-07-30

The first cinematic platform slice is an additive authenticated route, not a replacement of canonical UI. It requires exact `APP_ENV=staging`, carries `noindex/nofollow/nocache`, reuses the real shell, tenant, dashboard API, and canonical workflow routes, and has separate personal and business-workspace paths. The unscoped entry returns 404 in a production artifact. No schema, provider, secret, or dependency change is introduced.

The owner-approved Jurobek 3D source is absent. The prototype uses only the existing 60,670-byte WebP, labels it as a static no-WebGL fallback, links to real text chat, and does not simulate microphone, STT, TTS, lip sync, or a live lawyer. Motion is limited to short state feedback and respects reduced motion/transparency/contrast. The Impeccable detector returned no findings; the remaining shared grid/width shell transition is recorded as production migration debt rather than changed before approval.

The exact source is deployed as Worker version `cfef8153-3322-4ce5-b271-3478a0531b28` at 100% traffic. D1 integrity, exact binding inventory, secret names, Access denial, and unchanged production version were re-read. Chrome automation still fails before navigation, so screenshots and interactive accessibility/performance evidence are not inferred from source or control-plane checks.

Production functional deployment and production UI replacement remain two separate owner approvals.

## D-082 — never apply a duplicate environment selector to a flattened staging Worker config

Status: accepted after corrective staging deployment
Date: 2026-07-30

The generated `dist/server/wrangler.json` already resolves the staging Worker identity. Deployment uses explicit `--name juro-platform-staging`, `--keep-vars`, and `--strict` without a process-level `CLOUDFLARE_ENV=staging`. Adding that environment selector made Wrangler append a second suffix and target `juro-platform-staging-staging`.

The incorrect Worker never received custom-domain traffic and failed while reconciling already-owned Queue consumers. It was deleted by exact name and absence was confirmed by error `10007`. The correct Worker was then deployed and read back at 100% traffic. This correction did not mutate production or shared data resources.

Build/artifact validation may still set `CLOUDFLARE_ENV=staging` in a separate process. The variable must not leak into the flattened-artifact deploy process.

## D-083 — stream provider progress without exposing unvalidated legal content

Status: accepted, locally verified, and deployed to protected staging; live-provider proof pending
Date: 2026-07-31

The OpenAI Responses API is consumed as SSE so the user can see bounded progress and interrupt a long request. Provider deltas contain an incomplete structured legal object, not trustworthy prose. JURO therefore never renders those deltas as an answer. It reports only the stage and bounded character count, then releases the final response after JSON Schema/Zod validation, verified-source enforcement, persistence, and ledger completion.

A browser stop or connection cancellation propagates through the Worker to the provider `AbortSignal`. The failed run records `AI_CANCELLED`, its reserved usage ledger changes to `released`, and the idempotency record is not marked successful. Anthropic fallback receives the same signal and user cancellation is terminal rather than retryable or fallback-eligible.

The OpenAI request also supplies a domain-separated SHA-256 pseudonymous `safety_identifier`, explicit reasoning effort, and explicit text verbosity. No new dependency or database migration is required. Provider secrets remain server-only and absent from the inspected staging binding names, so live provider streaming is not claimed.

Official contract references verified on 2026-07-31:

- https://developers.openai.com/api/docs/guides/streaming-responses
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/models/gpt-5.6-sol

## D-084 — keep AI edits and regenerations as immutable tenant-scoped branches

Status: accepted, locally verified, and deployed to protected staging; live-provider proof pending
Date: 2026-07-31

Editing a question and regenerating an answer never overwrite an existing chat
message. Each action creates a new branch plus append-only message-version
evidence. The server resolves the original question for regeneration and checks
the source message, conversation, workspace, owner, and parent branch before one
atomic D1 batch persists the request, response, branch, versions, AI-run result,
and usage outcome. Client-supplied text cannot replace the authoritative source
for regeneration.

Branch reads require the same authenticated tenant and select an exact response
message. The UI exposes the original and alternate answers as direct-linkable
history without hiding the prior version. A new edit or regeneration consumes a
new answer cycle; idempotent replay does not create or charge a duplicate.

Migration `0039_lame_killer_shrike.sql` is additive. Its insert guards reject
cross-tenant source messages, incoherent parent/fork relationships, invalid
version chains, and invalid SHA-256 evidence; update triggers make accepted
branch/version evidence immutable. No provider secret, dependency, production
route, or website code is changed.

## D-085 — reject structurally unsafe ZIP/DOCX before malware scanning

Status: accepted, locally verified, and deployed to protected staging; scanner/extractor proof pending
Date: 2026-07-31

A ZIP signature is not sufficient evidence that an archive is safe to retain for
processing. After R2 size/SHA-256 and magic-byte verification, the finalize route
now reads the quarantined archive once and validates its central directory without
extracting or executing a member. It rejects split archives, ZIP64 ambiguity,
encryption, unsupported compression, symbolic links, unsafe/duplicate paths,
excessive depth, nested archives, unsupported package members, more than 20 package
files, expansion ratios above 100:1, and more than 200 MB expanded size. DOCX must
contain the required OOXML parts and cannot include VBA or executable content.

A rejected object is deleted from private R2, its D1 lifecycle becomes failed, and
the content-free audit event records the exact reason. A structurally accepted file
still remains quarantined with `MALWARE_SCANNER_UNAVAILABLE`; archive inspection is
not represented as malware clearance and cannot dispatch analysis.

This bounded preflight does not decompress members or validate local-header/central-
directory identity and CRC. The future isolated extractor/scanner must repeat path,
size, ratio, type, local-header, and checksum controls before producing derivatives.

## D-086 — completed analysis JSON export uses D1 outbox and immutable private R2 evidence

Status: accepted, locally verified, and deployed to protected staging; eligible-row runtime proof pending
Date: 2026-07-31

A completed document analysis may be exported only through an authenticated,
tenant-owned server flow. The request creates one `analysis_exports` record and
one `document.export` outbox event in the same D1 batch. A dedicated Queue
consumer validates the normalized analysis schema, writes a deterministic JSON
object with an immutable `If-None-Match: *` condition, verifies stored size and
SHA-256, and only then marks the export completed. Downloads repeat tenant and
owner authorization, verify the object, and append a content-free audit event.

Migration `0040_luxuriant_winter_soldier.sql` is additive and guards source
ownership, immutable identity, state transitions, and completed artifact evidence.
Idempotency is scoped to owner and workspace and cannot reveal another tenant's
request. Failed jobs store only a typed safe error and remain explicitly retryable.
Only machine-readable JSON is in this slice; PDF, DOCX, marked-up, clean, and
comparison-table exports remain outside the claim. Production remains unchanged.

## D-087 — account deletion inventories analysis export objects before D1 cascade

Status: accepted, fully regression-tested, and deployed to protected staging
Date: 2026-07-31

`analysis_exports` is deleted from D1 when its owned source analysis is removed,
but that cascade cannot remove its private R2 object. The account-deletion purge
therefore inventories every non-null export key owned by the closing user before
crossing the irreversible boundary, deletes those keys together with the existing
file/comparison objects, and includes export rows in deletion evidence counts.

R2 deletion remains first and idempotent. An R2 failure leaves D1 content intact,
releases the purge lease, and records a retryable failure; only a successful object
phase permits the existing atomic D1 purge to cascade the export row. The change
adds no migration, queue, dependency, production write, or broader bucket access.
The fixture proves another user's object remains untouched.

## D-088 — terminal analysis exports are deleted R2-first with tenant-scoped replay evidence

Status: accepted, fully regression-tested, and deployed to protected staging
Date: 2026-07-31

A user may delete only an owned terminal (`completed` or `failed`) analysis
export. The authenticated DELETE route checks the current workspace, user, and
source analysis without disclosing cross-tenant existence. Pending or processing
exports remain immutable so a Queue consumer cannot race a user deletion.

For a completed export, private R2 deletion and absence verification happen before
the D1 mutation. The export row and deterministic, content-free audit event are
then committed in one D1 batch. If R2 fails, D1 remains intact and the API returns
a typed retryable error. If D1 fails after R2 succeeds, a retry safely completes
the remaining database phase. A scoped audit lookup makes successful replay
idempotent without accepting an export identifier from another tenant.

The RU/UZ review UI exposes the action only for terminal exports, confirms the
destructive action, preserves keyboard and busy-state feedback, and refreshes the
real export list after success. No migration, dependency, binding, provider call,
production route, or website code changes in this slice.

## D-089 — analysis exports follow user-content retention, not a hidden TTL

Status: accepted and locally verified
Date: 2026-07-31

An analysis export is derived user content. The approved retention rule is therefore
the same as the source analysis: retain it until the user deletes the individual
terminal export or the owning account is purged, subject to later approved legal
retention policy. No automatic age-based export TTL is introduced. A Cron must not
silently remove a user's report merely because it is old.

This preserves explicit user control and keeps the object and D1 record lifecycle
coherent. Account deletion inventories the private object before the D1 cascade;
individual deletion is R2-first, tenant-scoped, audited, retryable, and idempotent.
A future retention schedule requires an explicit policy decision, dry-run inventory,
user-visible behavior, backup implications, and staging evidence.

## D-090 — PDF and DOCX analysis reports reuse the reviewed document generators

Status: accepted and locally verified; protected-staging migration/deploy pending
Date: 2026-07-31

PDF and DOCX are separate report artifacts rather than overloading the immutable
JSON export contract. Additive migration `0041_analysis_report_exports.sql` creates
`analysis_report_exports` with tenant/owner/source guards, legal state transitions,
format-specific MIME/key evidence, and immutable identity. It does not rebuild or
alter `analysis_exports` or any document-builder table.

The existing `document.export` outbox and Queue are reused. The consumer resolves
the subject identifier against the report table, validates the normalized analysis,
and invokes the already reviewed JURO PDF/DOCX generators and bundled licensed
assets. It writes an immutable private R2 object, verifies bytes and SHA-256, and
only then commits the terminal state and content-free audit evidence. Downloads
repeat authorization and object verification; per-export and account-deletion paths
cover the new objects.

The collection API remains backward-compatible: an empty request still means JSON;
an explicit strict format may request `json`, `pdf`, or `docx`. Highlighted PDF,
clean/redline document mutation, comparison-table export, and provider-generated
staging evidence are outside this decision. Production remains unchanged.

## D-091 — OCR/extraction uses an idempotent Workers AI derivative pipeline

Status: accepted and locally verified; protected-staging migration/deploy pending
Date: 2026-07-31

Files that are already server-verified as `analysis_safe`, but cannot be read by
the bounded local PDF/DOCX extractor, are handed off through the existing
`OCR_PROCESSING_QUEUE`. The queue envelope contains opaque identifiers only. The
consumer reloads the tenant, file lifecycle, object size, and source SHA-256 from
D1/R2 before invoking the Cloudflare Workers AI `toMarkdown` binding.

The conversion result is normalized into the existing `ExtractedDocument`
contract and stored as an immutable private R2 JSON derivative. Additive migration
`0042_sleepy_callisto.sql` records provider, method, source hash, derivative hash,
quality, warnings, and lifecycle in `file_extractions`. Only after the derivative
is written and verified does D1 return the analysis to `ready` and enqueue the
existing Anthropic-primary analysis consumer. Replay verifies the same derivative
and never calls the provider or charges analysis twice.

Image conversion is marked `AI_OCR_REVIEW_REQUIRED`; the implementation does not
claim exact bounding boxes, page geometry, or the 95% OCR release threshold. The
account-deletion purge inventories the derivative key before cascading D1 rows.
No scanner is simulated: new uploads remain quarantined while the malware binding
is absent. Production stays unchanged, and the complete 100-package/30-comparison

## D-092 — align server-only Anthropic fallback with the staged model configuration

Status: accepted, regression-tested, and deployed to protected staging
Date: 2026-07-31

The checked-in staging configuration explicitly selects
`claude-sonnet-4-20250514` for document analysis and legal-chat fallback. The
previous code still embedded a different fallback string in three server-only
paths. This did not alter the configured staging request, but it made a missing
optional model variable route to an inconsistent provider model.

`DEFAULT_ANTHROPIC_MODEL` is now the single conservative fallback for the
Anthropic transport, legal-chat fallback, and document-analysis adapter. Explicit
runtime variables still take precedence. The change does not choose a model at the
client, expose a key, send a provider request, or change a production binding.

A read-only staging secret inventory now confirms the `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY` names. Their values were not read. Secret presence is not
provider evidence: an authenticated synthetic RU/UZ provider and ledger flow is
still required before the platform can claim live AI execution.
## D-093 — real provider probes are one-time staging evidence, not a retry loop

Status: accepted, deployed to protected staging, and partially verified
Date: 2026-07-31

A provider key listed by Cloudflare is not evidence that a provider request can
execute. The Phase 9 probe therefore uses a fixed, non-legal, non-user
structured-output request behind an explicit staging-only flag. It has no HTTP
route and records technical metadata only. The unique provider/probe key makes
success and failure terminal: provider outages or configuration errors cannot
create an unbounded retry/cost loop.

The first controlled execution verified the OpenAI transport and structured
output path with the configured `gpt-5.6-sol` model. Anthropic returned the safe
terminal code `PROVIDER_UNAVAILABLE`; no Claude/document-analysis success is
claimed. The flag was immediately redeployed as false. Further Anthropic
verification requires a diagnosed provider-account, key, or model correction,
then a new explicitly versioned probe key; it must never overwrite this evidence.

## D-094 — retire the staging Anthropic model before accepting provider-key evidence

Status: accepted and protected-staging provider verified
Date: 2026-08-01

The secret-name inventory showed the owner had replaced `ANTHROPIC_API_KEY`, but
an isolated Anthropic-only connectivity probe still returned the safe terminal
code `PROVIDER_UNAVAILABLE`. The configured model
`claude-sonnet-4-20250514` was officially retired on 2026-06-15. This is a
configuration defect distinct from secret presence or credential validity.

Staging now selects `claude-sonnet-4-6` for both document analysis and fallback.
Anthropic identifies it as the replacement and lists it among models supporting
JSON Schema structured outputs, which JURO requires. D-092 is superseded only
for the model identifier; its server-only and fail-closed boundaries remain in
force. Production has not been deployed or changed.

Official sources verified on 2026-08-01:

- https://platform.claude.com/docs/en/docs/about-claude/model-deprecations
- https://platform.claude.com/docs/en/about-claude/models/migration-guide
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs

### Staging verification

The one-time `staging-anthropic-connectivity-v3` probe completed at
`2026-07-31T20:00:05.995Z` with `claude-sonnet-4-6`, validated JSON output,
194 input tokens, 8 output tokens, and 2,262 ms latency. The next safe Worker
version is `91edb0b9-3758-4959-97d6-27fc52d643ae` with the probe flag restored
to false. This proves only synthetic Anthropic connectivity and structured-output
compatibility; it does not prove legal quality, file analysis, or production
readiness.

## D-095 — production-profile artifacts must preserve JURO primary bindings

Status: accepted, regression-tested; not deployed
Date: 2026-08-01

The production-profile artifact was found to replace the canonical `DB` and
`BUCKET` bindings from `wrangler.jsonc` with Sites placeholder resources. This
contradicted the preserved-resource invariant: production uses
`juro-production` and `juro-private-documents`.

The Vite configuration now keeps Sites support for assets while passing no
primary D1/R2 replacement into the binding normalizer. The generated
production artifact is required to retain the exact canonical primary bindings.
This is a build-contract correction only: no Worker version, route, D1
migration, R2 object, secret, or production configuration was deployed.

## D-096 — scheduled corpus runs are aggregate-only lifecycle records

Status: accepted and regression-tested locally; staging deployment pending
Date: 2026-08-01

A `scheduled_corpus` run represents a bounded batch, not an individual source
request. Every queued request remains connected to that batch by
`job_outbox.correlation_id`; the individual fetch path must therefore not create
a competing `single_source_fetch` run or complete/fail the batch after its first
item. The periodic reconciler remains the sole component that closes the batch
when all linked requests reach terminal states.

The regression test uses the real local D1 migrations and verifies two Lex
requests: both become completed, no `single_source_fetch` runs are created, and
the scheduled batch remains running until reconciliation records `success` with
two fetched items. The test also exposed and corrected two existing D1-invariant
violations in the scheduled start path: an extra bind parameter, and an empty
corpus initially written as `failed` without completion evidence. Empty corpus
runs now transition `running -> failed` atomically with
`LEGAL_SOURCE_CORPUS_EMPTY`.

This change does not discover a broader corpus, declare any source verified, or
change production. Legal publication and AI retrieval remain fail-closed.
## D-097 — Advice sitemap discovery is bounded, review-only, and default-off

The existing exact-document acquisition path remains the authority for every Advice fetch. A separate scheduler capability may discover at most 20 candidate URLs from `Sitemap:` declarations in the current public `https://advice.uz/robots.txt`. It accepts only HTTPS `advice.uz` sitemap index/document files, follows no redirects, makes no arbitrary link traversal, and discards everything outside the existing canonical Advice document allowlist. Every accepted candidate is sent back through the same robots gate, one-second Advice pacing, private R2 evidence, pending-review state, and publication boundary.

`LEGAL_ADVICE_SITEMAP_DISCOVERY_ENABLED` is false in development, staging, and production. Turning it on requires an explicit policy/load review and separate staging evidence; this commit does not claim a live sitemap run or legal verification.
## D-098 — new analysis uploads use the dedicated quarantine bucket

New document-analysis uploads use `QUARANTINE_BUCKET` with a `quarantine-v2/` key. The regular `BUCKET` is no longer used for those bytes. Existing pre-change `quarantine/` object keys remain in the primary bucket and account deletion preserves that legacy routing; it deletes `quarantine-v2/` keys from the dedicated bucket. If a deletion encounters a new quarantine key without the binding, it fails recoverably rather than silently orphaning data.

This separation does not imply a malware verdict. Finalization still records `MALWARE_SCANNER_UNAVAILABLE`, and no file reaches OCR or an AI provider without a real scanner marking it safe.
## D-099 — Immutable action-plan snapshots
Status: accepted (staging)

An action-plan step edit changes the live plan only through the existing optimistic revision path. The server now records version 1 at plan creation and one append-only full snapshot for every successful step edit. D1 enforces that snapshot records cannot be updated or independently deleted; tenant-scoped history is exposed only through the owning case workspace. Migration 0051_noisy_nuke.sql is additive, was preceded by a private checksum-verified staging export, and was applied only to juro-staging. Evidence: STAGING-0056-ACTION-PLAN-VERSIONS-EVIDENCE.md.
## D-100 — Lawyer case access requires a second, request-specific owner action

Status: accepted and locally regression-tested; protected-staging deployment pending
Date: 2026-08-01

The consent used to create an anonymized handoff request never grants the selected lawyer access to the underlying case. The UI now keeps this distinction visible: only an `awaiting_user_consent` request with a cleared conflict check shows a second, request-specific checkbox and grant action. The client sends `consent: true` only after that action; the server independently rechecks workspace ownership, entitlement, public-approved lawyer, clear conflict state, and the absence of an active grant before one D1 batch writes the grant, consent, status, and append-only audit evidence. The owner can later revoke the same access through the protected DELETE endpoint. No new migration, provider call, production change, or client-side authorization was introduced.

## D-101 — Staging deployment may only use a freshly validated staging artifact

Status: accepted and dry-run verified
Date: 2026-08-01

`validate:cloudflare:matrix` intentionally builds every environment, but its prior behavior left the last generated production artifact in `dist`. A subsequent direct `wrangler deploy --config dist/server/wrangler.json` therefore attempted a production deployment. Cloudflare stopped that deployment because `production-document-analysis` does not exist; no production Worker version, D1 migration, or queue attachment was applied. Wrangler did provision two empty, requested-by-config R2 buckets: `juro-production-backups` at 01:46:41Z and `juro-production-quarantine` at 01:46:43Z. They are retained pending owner direction rather than being deleted automatically.

The matrix task now restores a development artifact on completion. `npm run deploy:staging` always rebuilds staging, validates the generated name, target environment, and `APP_ENV`, then invokes Wrangler. Its staging dry-run and the following protected staging deployment succeeded. Production deployment remains forbidden without separate owner approval.

## D-102 — Lawyer terms are persisted only after active, revocable case access

Status: accepted (staging)
Date: 2026-08-01

A lawyer may create a scope, price description, and duration only after the existing server-side checks confirm a public-approved profile and active, non-revoked case grant. The case owner sees and responds to the latest offer only from the owning workspace. Declining permits a replacement; accepting makes the current workflow terminal so an accepted proposal cannot be silently overwritten. Proposal and response events are appended to workspace audit evidence. The route deliberately does not create payment obligations, invoices, or collect payment data. Migration `0052_narrow_christian_walker.sql` is additive, was backed up to private staging R2 with checksum round-trip, and was applied only to `juro-staging`. Evidence: `STAGING-0057-LAWYER-OFFERS-EVIDENCE.md`.

## D-103 — Lawyer-review moderation is staged before any public presentation

Status: accepted (staging)
Date: 2026-08-02

Migrations `0055_lowly_shadow_king.sql` and `0056_zippy_winter_soldier.sql` were applied only to `juro-staging` after a fresh private R2 export and checksum-verified remote round trip. The additive schema provides an immutable moderation journal, a one-decision fence, and a trigger that applies the parent review’s terminal state only after journal insertion. Worker version `eeddad25-04ab-4cae-a205-71b87f03904f` serves the protected staff route and endpoints on `juro-platform-staging`. Approval remains private: it does not publish a review or update public rating aggregates. Cloudflare Access prevented anonymous or authenticated browser traversal in this run, so neither is claimed. Production remains unchanged. Evidence: `STAGING-0059-LAWYER-REVIEW-MODERATION-EVIDENCE.md`.

## D-104 — Public review output is a read projection, never a client aggregate

Status: accepted (staging)
Date: 2026-08-02

The authenticated lawyer picker receives rating aggregates and no more than three texts only from public-approved lawyer profiles with reviews whose parent status and immutable moderation decision are both `approved`. The server calculates all averages and never returns requester, workspace, moderator, or moderation-reason fields. A new migration is not required because it reads the staged 0055/0056 boundary. Worker version `164db8bf-877e-45a3-b0f1-f54f4a45bf03` is deployed only to `juro-platform-staging`; staging has no approved review records, so a live public projection is not claimed. Production is unchanged.

## D-105 — Lawyer directory facts are self-declared until separately verified

Status: accepted and deployed to staging
Date: 2026-08-02

Migration `0058_innocent_ben_grimm.sql` expands the existing `lawyer_profiles`
table rather than creating a competing profile domain. It adds only optional
professional facts: experience, price description, availability, next
availability, advocate declaration, firm, and biography. It also adds a bounded
index and D1 triggers which reject invalid experience, availability, or advocate
states.

Only an account whose server-side `account_type` is `lawyer` may create or edit
its own profile. Creation starts at `pending`; neither the self-service API nor
the UI can set `verified` advocate status or public approval. The directory
continues to return data only after the separate public-approval boundary. Its
filters operate only on already-authorized directory rows and do not disclose
unapproved profiles. On 2026-08-02 the owner authorized the migrations; a full
private D1 export was uploaded and checksum-verified before application.
Production remains unchanged.

## D-106 — Lawyer-profile publication is revision-bound and staff-moderated

Status: accepted and deployed to staging
Date: 2026-08-02

Migration `0059_pretty_punisher.sql` adds a monotonic `profile_revision` to the
existing `lawyer_profiles` record and an append-only
`lawyer_profile_moderation` journal. A profile cannot be published by directly
setting a status: a D1 trigger requires a matching immutable approved moderation
record for the exact revision. Creating a moderation record is the only path
which may move a pending profile to `public_approved`; rejection is equally
durable. Any self-service profile edit clears public approval, increments the
revision, and returns the profile to pending review.

The protected staff inbox and API require an active `legal_reviewer` platform
role plus fresh MFA. They expose only pending profiles and append a workspace
audit event alongside the D1 moderation evidence. A declaration is never
relabelled as `verified`, and no public directory write occurs from the client.
Both the self-service edit and the staff decision use D1 batch guards: the
state change and its audit event must each affect exactly one row, otherwise the
request fails closed. An empty self-service PATCH is a no-op, so it cannot
accidentally invalidate an already-approved profile. The migration chain and
API/UI contract are test-covered. Migrations 0058 and 0059 were applied only to
`juro-staging` after one checksum-verified private backup, then the exact
artifact was deployed as Worker version `436fdea3-a5d9-41cd-9beb-24b43630bf57`.
Production remains unchanged.

The preview is controlled independently by
`LAWYER_PROFILE_DIRECTORY_ENABLED`: it is `true` only for staging and false in
development and production. A disabled route returns a non-descriptive 404
before session processing, preserving a feature-flag rollback path without
coupling lawyer publication to legal-source operations.

## D-107 — Confirming plan steps creates one audit record per immutable plan revision

Status: accepted and deployed to staging
Date: 2026-08-02

The action-plan confirmation endpoint already used the plan-step identifier as
the task ID and `INSERT OR IGNORE`, so retries could not duplicate tasks or
reminders. It did, however, append a new `tasks_created` case event on every
retry. The endpoint now reads the owning plan ID and its monotonic revision and
uses the deterministic event identity
`action-plan-tasks:<case>:<plan>:<revision>` with `INSERT OR IGNORE`.

The client can therefore safely retry a failed confirmation: exactly one task
per step, one default reminder per due task, and one audit event are retained for
that plan revision. A later user-confirmed plan revision receives its own event,
preserving the append-only case history. No D1 migration, provider call, or
production change is required.

## D-108 — Confirmed action-plan tasks remain synchronized with their plan step

Status: accepted and deployed to staging
Date: 2026-08-02

The action plan and the persisted task share an explicit mapping rather than an
implicit display convention: `not_started` becomes `planned`, `waiting_user`
becomes `waiting_information`, and `waiting_response` becomes
`waiting_counterparty`; all other terminal and active statuses retain their
meaning. Initial task creation uses that mapping and does not schedule a
reminder for a completed or cancelled step.

Every successful optimistic plan-step update now updates an already-confirmed
tenant-owned task in the same D1 batch. The deterministic default reminder is
rescheduled when it remains pending, cancelled for terminal/no-date states, and
recreated only when an active dated task needs one. Sent reminders are never
reopened. No migration or client-side authorization is introduced.

## D-109 — Due task reminders are delivered once to the existing in-app inbox

Status: accepted and deployed to staging
Date: 2026-08-02

The existing action-plan task flow persisted default `in_app` reminders but did
not have a scheduler delivery path. The five-minute scheduled Worker now scans
only due, pending in-app reminders whose task is still active and whose case is
not archived. It creates a localized RU/UZ inbox record with a deterministic
`task-reminder:<reminder-id>` identifier and transitions the reminder to `sent`
in one D1 batch. A retry therefore either creates the record and sends it, or
finishes a pending transition after an earlier insert; it cannot duplicate the
notification.

The same predicates are rechecked in both batch statements, so a task completed,
cancelled, or archived after selection does not receive a stale notification.
The scheduler log contains counts only, never the task title or notification
content. This scope implements the already-configured in-app channel only:
email delivery is not represented as complete until its separate provider-backed
outbox contract is connected to task reminders. No migration, provider call, or
production change is required.

## D-110 — Notification visibility and acknowledgement are workspace-scoped

Status: accepted and deployed to staging
Date: 2026-08-02

The legacy notification surface is reused by canonical personal and business
routes. It previously scoped records only by `user_id`, which allowed a user
with more than one workspace to see and acknowledge notifications outside the
active workspace. The existing `workspaceForUser` server-side context is now
required by notification list and acknowledgement routes, and every query binds
both user and workspace. Dashboard notification count and preview use the same
two-key scope.

The workspace is selected only after active membership verification by the
existing authenticated shell. A notification from another workspace is therefore
neither returned nor marked read. No migration is needed because
`notifications.workspace_id` already exists and the scheduler writes it. The
route remains private/no-store and preserves the existing CSRF guard for writes.

## D-111 — Calendar is a tenant-scoped projection of plans and confirmed tasks

Status: accepted and deployed to staging
Date: 2026-08-02

The calendar deliberately does not introduce a second deadline store. It reads
active dated `action_plan_steps` from non-archived cases in the active
workspace, then left-joins a confirmed task only when its case and workspace
also match. The display therefore stays correct both before task confirmation
and after a plan step becomes an executable task.

The API accepts only an inclusive/exclusive valid ISO-date window of at most
367 days, derives the current date in Asia/Tashkent server-side, and returns
private/no-store data. Terminal plan steps and terminal tasks are excluded. The
new UI is available on canonical personal and business routes and preserves the
legacy business redirect; no D1 schema change, migration, or provider call is
necessary.

## D-112 — Case detail is a workspace projection, not an alias for a global plan

Status: accepted and deployed to staging
Date: 2026-08-02

Canonical case-detail routes now render a dedicated workspace surface. It reads
the single selected case and its confirmed task records through the existing
tenant-scoped APIs, treats an absent case as a neutral unavailable result, and
links only to the existing case-specific plan and current-workspace calendar.
It intentionally does not invent document, chat, source, or lawyer tabs whose
backends are not part of this slice. No migration or new resource is needed.

## D-113 — Staff support content views are MFA-gated and audit-recorded

Status: accepted and deployed to staging
Date: 2026-08-02

The staff support inbox reuses the existing `support.tickets.manage` capability
and requires a fresh MFA assertion no older than 15 minutes. Its ticket-detail
handler now writes an append-only `support_ticket_viewed` workspace audit event
only after it has found the ticket, and before it returns message content. The
event identifies the staff actor and ticket but stores neither the user message
text nor a copy of the support content.

An audit write failure also prevents the detail response, avoiding an
unaudited content disclosure. User-facing detail routes remain requester and
workspace scoped; this staff-only route follows the explicit owner policy that
technical support may access support content, with every view and reply
traceable. No schema migration or production change is required.
## D-114 — AI stream recovery reuses the original idempotency record

Status: accepted and deployed to staging (Worker version `74c35dac-6c14-452f-8a75-faf70e876f86`)
Date: 2026-08-02

An SSE disconnection does not prove whether a run completed server-side. The
client therefore retains an immutable request payload and the original
idempotency key, and retries only transport/stream uncertainty or a `202`
processing result. Reusing the key lets the server return the completed answer
or the existing run without opening a second usage ledger entry. Terminal
provider, validation, authorization and plan errors are not offered as retries:
the current idempotency contract marks failed runs final, so presenting that
button would be misleading.
## D-115 — AI response persistence and usage finalization are atomic

Status: accepted and deployed to staging (Worker version `4da61758-ee58-46c2-9a0a-d03d01bcc91f`)
Date: 2026-08-02

The AI route previously committed conversation records and then finalized the
AI run in a second D1 batch. The completion statements are now composed into
the same batch as the conversation, source, fact, branch, version and audit
records. A D1 failure rolls back the entire batch; the error path can safely
release the original reservation without an answer being persisted separately.
## D-116 — Expire only unclaimed stale AI reservations

Status: accepted and deployed to staging (Worker version `aaef9157-ce92-4c49-a6d7-621d94b4edfb`)
Date: 2026-08-02

An idempotency record that has remained in `started` state for at least fifteen
minutes may represent a Worker interruption rather than an active provider
request. The server can release it only while its run is still `reserved`.
Before persisting a provider result, the original request atomically claims the
run as `finalizing`; stale cleanup never changes that state. The old key is
never reused: the client must create a fresh request after `AI_RUN_EXPIRED`.
This prevents a delayed execution from persisting a second answer or consuming
the same usage reservation twice.

## D-117 — Global search tolerates additive-schema rollout states

Status: accepted and deployed to staging (Worker version `f6effb4a-e04f-4c83-822e-1f30c3f09424`)
Date: 2026-08-02

Global search is available during and after expand-contract migrations. It
checks the D1 schema for the additive `tasks` and `lawyer_profiles` tables
before including their result queries in the read batch. When a table is not
yet present, the route supplies an empty typed result instead of failing the
entire search request. The lawyer result deliberately uses the stable
`display_name` field only, so rollout does not depend on a later optional firm
column. This is a read-only compatibility boundary: it does not mask a failed
migration in release checks and introduces neither a migration nor a new
resource.

## D-118 — Queue evidence distinguishes implemented consumers from live operations

Status: accepted; deployed to staging
Date: 2026-08-02

The queue runtime already has durable lease/idempotency handling and concrete
handlers for document analysis, OCR, export, security email, legal-source
acquisition/normalization/indexing, and deletion cleanup. Staging deliberately
enables only those reviewed consumers. `notification.dispatch` is not a hidden
stub: scheduled task reminders insert the deterministic in-app notification in
the same bounded operation. `malware.scan` stays unbound and fail-closed until
a privacy-approved scanner is actually attached. Documentation must not call
these implemented handlers absent, nor treat their local tests/configuration as
proof of provider delivery, scanner release, DLQ/redrive, or alert operations.

## D-119 — Document-builder client identifiers require Web Crypto

Status: accepted
Date: 2026-08-02

Questionnaire-row identifiers are not authorization tokens, but they may become
part of a persisted draft. The fallback to `Math.random()` was removed: JURO
uses `crypto.randomUUID()` or `crypto.getRandomValues()` and fails explicitly
when neither secure API exists. Supported HTTPS browsers and Workers provide
Web Crypto, so this never silently weakens identifier entropy on an unsupported
runtime.

Staging evidence: Worker `juro-platform-staging`, version
`c9c54208-55be-4d6c-9413-950e0cc78d5f`, deployed after the full local test,
staging build, artifact-validation, and Cloudflare-type gates. Production was
not changed.
