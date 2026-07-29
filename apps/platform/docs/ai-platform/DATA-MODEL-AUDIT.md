# JURO data-model audit

Audit date: 2026-07-30
Production Sites revision: `4031078`
Integration branch baseline: `1d3d23d` before this documentation update

## Verified baseline

- Current local Drizzle snapshot: 86 application tables.
- Migration files: `0000`–`0034`; `0034` is a local staging candidate and is not remotely applied.
- All migrations apply successfully to a new local SQLite database.
- Local migrated result: 112 non-internal table definitions, 158 foreign keys, 72 triggers, and 199 indexes; zero foreign-key violations.
- No destructive `DROP` statement was found.
- The Cloudflare control plane reports 61 tables in both `juro-production` (`4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`) and `juro-development` (`d07670cf-f7bf-460c-a668-101671d4c330`). Both ledgers contain `0000`–`0004`; `0005`–`0034` are not applied there. `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) has the exact 34-entry `0000`–`0033` ledger, 114 non-internal tables, 70 triggers, and 198 indexes. Its pre/post migration exports passed private-R2 round trips, and the earlier disposable remote EEUR D1 reproduced its captured export topology before deletion. Post-`0033` staging has zero foreign-key violations. No production/development data or schema was mutated.

## Existing migration outline

| Migration | Main content |
|---|---|
| `0000` | document-builder core |
| `0001` | public share tokens |
| `0002` | template codes and versions |
| `0003` | approvals, threads, invitations, permissions, revisions, suggestions |
| `0004` | in-D1 backup copies plus OTP, sessions, acceptances, cases, plans, consultations |
| `0005` | workspaces, memberships, invitations, audit, consents |
| `0006` | profile expansion |
| `0007` | conversations, legal sources, subscriptions, payments, deletion requests, workspace links |
| `0008` | document analyses and risks |
| `0009` | comparisons, changes, SHA-256 fields |
| `0010` | legislation updates and monitoring preferences |
| `0011` | idempotency, outbox/jobs, scheduled locks/runs, backup and cleanup evidence |
| `0012` | active-workspace links plus OTP and tenant lookup indexes |
| `0013` | devices, session assurance/idle state, hash-chained security events |
| `0014` | encrypted TOTP credentials, backup-code hashes, pre-auth and factor claims |
| `0015` | immutable policy evidence and verified account-deletion requests |
| `0016` | additive protected canonical email/phone identity fields and lookup indexes |
| `0017` | protected workspace/document invitation identity evidence |
| `0018` | keyed short-lived OTP/deletion challenge evidence |
| `0019` | dual-address email-change challenge and rotation evidence |
| `0020` | expiring, non-inheriting platform staff assignments |
| `0021` | immutable per-actor platform staff role-event chain |
| `0022` | atomic and immutable workspace-invitation acceptance claim |
| `0023` | immutable 15-minute OTP verification lock evidence |
| `0024` | structured profile names and explicit unverified phone evidence |
| `0025` | fail-closed legal-source lifecycle and review queue |
| `0026` | bounded legal-source fetch request/evidence contract |
| `0027` | immutable legal-review decision evidence |
| `0028` | immutable verified-source publication evidence and reading rows |
| `0029` | session-token rotation and replay evidence |
| `0030` | encrypted prior-address security-email job boundary |
| `0031` | opaque device continuity and session linkage |
| `0032` | encrypted login-security notification boundary |
| `0033` | fenced account-deletion lifecycle, purge evidence, and tombstone |
| `0034` | business full/short identity, creator/request evidence, idempotency index, and guards (local-only) |

## Domain coverage

| Domain | Present | Required additions / remediation |
|---|---|---|
| Identity | profiles, OTP challenges, sessions, acceptances, consents; local migrations also add devices, security events, TOTP/backup-code evidence, and the OTP verification-lock field | canonical users/email identities, notification preferences, session rotation/replay state, security-email evidence, and remote activation/verification |
| Workspaces | workspaces, members, invitations, audit; migration `0022` adds an immutable acceptance claim; local-only `0034` adds complete business names and idempotent owner creation evidence | remote `0034` activation, settings/encryption-key records, explicit lifecycle, and a broader tamper-evident audit chain |
| Billing and usage | subscriptions, payments | plans, entitlements, usage periods/counters, add-ons, promo codes, AI ledger, daily cost aggregates |
| Chats and AI | conversations, messages, facts, source links | message versions/branches, attachments, AI runs/tool calls, feedback, memories and memory sources |
| Cases and tasks | cases, events, action plans/steps | participants, linked documents/chats/sources, plan versions, tasks/reminders, access grants |
| Files and OCR | builder files and attachments | file versions/derivatives, scan results, extraction/OCR pages/blocks, jobs, signed-URL events |
| Analysis | analyses, risks, comparisons, changes | documents, parties, clauses, missing clauses, obligations, deadlines, source links, revisions, exports |
| Builder | broad draft/document/collaboration model | immutable content versions, confirmation/signature evidence, export records |
| Lawyers | requests, slots, bookings | profiles, specialties, approvals, availability, assignments, conflict checks, grants, offers, messages, calls, reviews |
| Legal knowledge | legal sources and legislation updates; local migration `0025` adds source versions, sections, chunks, sync runs/errors, and a review queue; `0026` adds an idempotent environment-scoped fetch request; local `legal.parse` stores an untrusted content-addressed normalized snapshot; `0027` adds canonical, immutable, MFA-bound decision evidence without publishing trusted data; `0028` adds canonical immutable publication evidence and bounded immutable version-specific reading rows | Advice scenario/version/link records, internal materials, bookmarks, bulk discovery, real-markup validation, protected reviewer/publisher UI, replacement-version activation, indexing/retrieval/citations, and remote activation |
| Operations | notifications, audit fragments, deletion requests | email jobs, support, incidents, feature flags, runtime settings, backup/cleanup runs |

Existing analogous tables will be extended or reused. New tables must not duplicate an existing domain solely to match a requested name.

## Critical model defects

### In-database “backups”

Migration `0004` creates 26 persistent `__backup_*` tables inside the same D1 and copies operational data, including PII. These copies:

- are not represented in Drizzle schema;
- have no retention lifecycle;
- increase the sensitive-data footprint;
- are not protected from the same database-level failure;
- have no verified restore rehearsal.

They must not be treated as the pre-migration backup required for production. Removal, if approved later, must use an explicit inventory, export, retention decision, and separate contract migration.

### Append-only evidence is only partially durable

The migrations now provide tamper-evident chains for user security events and platform staff role changes, immutable database guards for policy evidence, and an immutable one-winner workspace-invitation acceptance claim in staging migration `0022`. No runtime flow or periodic protected audit export is proven, and these controls do not cover all required domains. In particular, `workspace_audit_events` is not a general append-only/tamper-evident chain. The following evidence remains incomplete or not periodically exported to protected R2:

- consent and acceptance;
- privileged access;
- lawyer grant/revoke;
- OTP lifecycle events beyond the current security-event subset;
- AI cost;
- confirmations and signatures;
- permission changes;
- conflict checks;
- moderation;
- critical security events.

There is no general access/audit chain or periodic protected R2 export. Several older audit/consent relations still use cascading deletes, which can erase evidence with a user, workspace, or document.

### Soft deletion is incomplete

- document deletion is a hard delete with cascading collaboration/audit loss;
- comments only have a subset of deletion metadata;
- messages, cases, and documents do not implement the requested `deletedAt`, `deletedBy`, `deletionReason`, and `purgeAfter` lifecycle;
- scheduled hard purge and restore behavior do not exist.

### Encryption rollout is incomplete and disabled

Current production-sensitive fields and content remain generally plaintext in D1:

- email and phone;
- PINFL/passport/address fields;
- document and AI text;
- structured analysis output.

The integration branch adds versioned AES-GCM/HMAC primitives and additive identity/invitation/challenge fields, but all checked-in environments remain `IDENTITY_PROTECTION_MODE=legacy`; no key ring is configured remotely and no row has been backfilled under this work. No workspace data-key model or document/AI envelope encryption exists. A standalone signed-share code is still stored both as plaintext and as a hash.

Expand-schema status: migrations 0016–0019 now define disabled, versioned
AES/HMAC boundaries for canonical profile and invitation
identity plus equality-only HMAC evidence for OTP/deletion challenges and a
dedicated dual-address email-change record. All checked-in environments remain
`legacy`; plaintext and legacy SHA fields are retained. The schema is present in
staging, but no key ring, backfill, runtime activation, or remote behavior test
exists, and document/AI/contact/workspace-key encryption is still absent.

## Duplicate or overlapping concepts

The following require consolidation decisions before additive schema work:

- `consents` and `user_acceptances`;
- `document_suggestions` and active `document_change_proposals`;
- `document_permissions` and JSON permission sets;
- `consultation_requests` and `consultation_bookings`;
- operational tables and unmanaged `__backup_*` copies.

No table will be dropped during an expand step.

## Proposed additive migration sequence

Migrations `0005`–`0029` contain checked-in SQL, were verified locally, and are present in isolated staging. Migration `0030` is additive and locally verified but remains unapplied pending its own portable checkpoint and restore drill. Portable/private-R2/remote-restore checkpoints surround the `0022`–`0029` application. Exact SQL for the remaining future domains below will be generated only after the current staging schema is re-read and a new migration-specific backup/preflight gate is satisfied.

1. **Identity security**
   - devices, security events, TOTP credentials, backup-code hashes;
   - OTP verification-lock state is present locally in `0023`; lifecycle event records and remote activation remain;
   - session-bound dual-address email-change challenges and rotation evidence;
   - session device/rotation fields;
   - policy documents and immutable acceptances.
2. **Tenant and audit hardening**
   - workspace settings and encrypted data-key records;
   - append-only audit chain fields and export checkpoints;
   - neutral access/security-event records.
3. **Usage and entitlements**
   - plans, entitlements, periods, counters, idempotent AI ledger, pricing metadata.
4. **File pipeline**
   - file versions, state transitions, scan/extraction/OCR/jobs, signed-URL audit.
5. **AI and legal knowledge**
   - AI runs/messages/branches/memory;
   - source versions/chunks/sync records/review queue.
6. **Analysis**
   - normalized analysis entities, revisions, comparisons, exports.
7. **Cases and lawyers**
   - task/reminder/plan versions and case access;
   - lawyer profiles, conflict checks, grants, offers, messages, reviews.
8. **Operations**
   - notifications/email jobs, support, incidents, feature flags, backups and cleanup runs;
   - migrations 0020–0021 now supply an expiring platform staff assignment
     boundary plus an immutable, per-actor role-change ledger and an internal
     fresh-MFA administrator grant/revoke service; operator bootstrap,
     externally reachable staff routes, support tickets, per-resource grants,
     customer-resource access events, and staff UI remain absent.

Each sequence follows:

```text
add → dual read/write if needed → backfill → verify → switch → remove in a later release
```

## Backup and migration gate

Before any further remote migration or any migration of a populated database; D-040's one-time verified-empty staging exception is consumed and cannot be reused:

1. use the authenticated Cloudflare control plane only for read-only identity/preflight checks until backup authority is established;
2. inspect the actual applied migration ledger and remote preflight counts;
3. create a protected external D1 export/snapshot;
4. record schema version and application commit;
5. verify the export is readable;
6. rehearse restore against an isolated database;
7. apply locally;
8. apply to staging;
9. validate data invariants and the document-builder regression;
10. keep production unchanged until explicit approval.

Remote `juro-staging` exists as `bb716a96-b2fb-4823-90d6-6c228fed181a` in EEUR with the exact `0000`–`0033` ledger, 114 non-internal tables, 70 triggers, and 198 indexes. Eighteen protected artifacts round-trip through private R2. The migration-specific pre-`0029` adapter reproduced every exported table/row plus ledger/trigger/FK state in a disposable remote EEUR D1, which was deleted after verification; the post-`0029` set also passed checksum round trips and remote FK validation. Runtime behavior and operational RTO remain unverified; production/development remain unchanged.
