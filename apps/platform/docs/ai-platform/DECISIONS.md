# JURO AI platform decision log

This log records material implementation decisions. Status values are `accepted`, `pending approval`, or `superseded`.

## D-075 — gate destructive staging probes behind runtime identity validation

Status: accepted
Date: 2026-07-30

Account-deletion purge evidence uses an exact staging-only synthetic subject,
an explicit disabled-by-default feature flag, and the real Cron/Queue consumer.
The probe must validate the deployed identity key ring before creating any D1 or
R2 fixture and must expose only a phase-specific safe error code. A malformed
or unrecoverable key ring blocks identity dual-write, MFA enrollment, and purge
rehearsal; it is never replaced automatically because rotation requires an
owner-managed protected recovery copy.

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
