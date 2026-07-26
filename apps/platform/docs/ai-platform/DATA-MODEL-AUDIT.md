# JURO data-model audit

Audit date: 2026-07-26  
Baseline revision: `86843ca`

## Verified baseline

- Drizzle schema: 53 application tables.
- Migration files: `0000`–`0010`.
- All migrations apply successfully to a new local SQLite database.
- Local migrated result: 79 tables; zero foreign-key violations.
- No destructive `DROP` statement was found.
- The actual production D1 schema and migration ledger were not available through an authenticated Cloudflare control plane and therefore were not inferred from local files.

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

## Domain coverage

| Domain | Present | Required additions / remediation |
|---|---|---|
| Identity | profiles, OTP challenges, sessions, acceptances, consents | canonical users/email identities, devices, security events, TOTP, backup codes, policy documents, notification preferences |
| Workspaces | workspaces, members, invitations, audit | settings, encryption-key records, complete business names, explicit lifecycle |
| Billing and usage | subscriptions, payments | plans, entitlements, usage periods/counters, add-ons, promo codes, AI ledger, daily cost aggregates |
| Chats and AI | conversations, messages, facts, source links | message versions/branches, attachments, AI runs/tool calls, feedback, memories and memory sources |
| Cases and tasks | cases, events, action plans/steps | participants, linked documents/chats/sources, plan versions, tasks/reminders, access grants |
| Files and OCR | builder files and attachments | file versions/derivatives, scan results, extraction/OCR pages/blocks, jobs, signed-URL events |
| Analysis | analyses, risks, comparisons, changes | documents, parties, clauses, missing clauses, obligations, deadlines, source links, revisions, exports |
| Builder | broad draft/document/collaboration model | immutable content versions, confirmation/signature evidence, export records |
| Lawyers | requests, slots, bookings | profiles, specialties, approvals, availability, assignments, conflict checks, grants, offers, messages, calls, reviews |
| Legal knowledge | legal sources and legislation updates | source documents/versions/sections/chunks, Advice scenarios, links, sync runs/errors, review queue, internal materials, bookmarks |
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

### Append-only evidence is not durable

Required evidence domains are not tamper-evident:

- consent and acceptance;
- privileged access;
- lawyer grant/revoke;
- OTP events;
- AI cost;
- confirmations and signatures;
- permission changes;
- conflict checks;
- moderation;
- critical security events.

There is no hash chain, equivalent tamper evidence, or periodic protected R2 export. Several audit/consent relations use cascading deletes, which can erase evidence with a user, workspace, or document.

### Soft deletion is incomplete

- document deletion is a hard delete with cascading collaboration/audit loss;
- comments only have a subset of deletion metadata;
- messages, cases, and documents do not implement the requested `deletedAt`, `deletedBy`, `deletionReason`, and `purgeAfter` lifecycle;
- scheduled hard purge and restore behavior do not exist.

### Encryption is absent

Current sensitive fields and content are generally plaintext in D1:

- email and phone;
- PINFL/passport/address fields;
- document and AI text;
- structured analysis output.

No workspace data-key model, AES-GCM envelope encryption, protected lookup hashes, or key-rotation metadata exists. OTP has a per-record salt but no server-side pepper. A standalone signed-share code is stored both as plaintext and as a hash.

## Duplicate or overlapping concepts

The following require consolidation decisions before additive schema work:

- `consents` and `user_acceptances`;
- `document_suggestions` and active `document_change_proposals`;
- `document_permissions` and JSON permission sets;
- `consultation_requests` and `consultation_bookings`;
- operational tables and unmanaged `__backup_*` copies.

No table will be dropped during an expand step.

## Proposed additive migration sequence

The exact SQL will be generated only after staging D1 inventory and backup verification.

1. **Identity security**
   - devices, security events, TOTP credentials, backup-code hashes;
   - OTP lock/rate fields and event records;
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
   - notifications/email jobs, support, incidents, feature flags, backups and cleanup runs.

Each sequence follows:

```text
add → dual read/write if needed → backfill → verify → switch → remove in a later release
```

## Backup and migration gate

Before any remote migration:

1. authenticate Wrangler outside chat;
2. inspect the actual database and applied migration ledger;
3. create a protected external D1 export/snapshot;
4. record schema version and application commit;
5. verify the export is readable;
6. rehearse restore against an isolated database;
7. apply locally;
8. apply to staging;
9. validate data invariants and the document-builder regression;
10. keep production unchanged until explicit approval.

