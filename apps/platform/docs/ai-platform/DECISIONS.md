# JURO AI platform decision log

This log records material implementation decisions. Status values are `accepted`, `pending approval`, or `superseded`.

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
