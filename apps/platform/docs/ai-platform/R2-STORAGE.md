# JURO R2 storage

Updated: 2026-07-28
Status: remote inventory verified. Phase 1 created and re-read six approved empty private EEUR Standard development/staging target buckets. No object was created, copied, deleted, exposed, or rebound; production storage was unchanged.

## Verified remote state

| Role | Bucket | State |
|---|---|---|
| Production primary | `juro-private-documents` | exists; private; preserve |
| Development primary legacy | `juro-private-documents-development` | exists; private |
| Development backup legacy | `juro-private-backups-development` | exists; private |
| Development quarantine legacy | `juro-quarantine-development` | exists; private |
| Development targets | `juro-development-files`, `juro-development-backups`, `juro-development-quarantine` | exist; empty; private; EEUR Standard; unbound |
| Staging targets | `juro-staging-files`, `juro-staging-backups`, `juro-staging-quarantine` | exist; empty; private; EEUR Standard; unbound |
| Production backup/quarantine | — | absent |

`site-creator-r2` is a Sites-managed/non-JURO-primary resource and is not repurposed for document, backup, or quarantine storage.

## Approved target names

| Environment | Primary files | Backups | Quarantine |
|---|---|---|---|
| Development | `juro-development-files` | `juro-development-backups` | `juro-development-quarantine` |
| Staging | `juro-staging-files` | `juro-staging-backups` | `juro-staging-quarantine` |
| Production | `juro-private-documents` | `juro-production-backups` | `juro-production-quarantine` |

Every bucket in the verified remote inventory is private and has no public development URL or custom domain. `juro-production-backups` and `juro-production-quarantine` are approved target names only and do not currently exist. Creation of an empty bucket is not proof of backup, restore, quarantine, or malware scanning. Application access uses an authorized backend proxy or narrowly scoped short-lived signed URL after session, tenant, object, method, disposition, and audit checks.

## Object model

New application object keys are immutable, server-generated, and contain no email, phone, PINFL, case title, source filename, or other direct PII. Logical records preserve:

- original object;
- safe normalized copy;
- SHA-256 and byte size;
- extraction/page/OCR derivatives;
- analysis/export artifacts;
- immutable version relationships;
- scan/quarantine status;
- deletion tombstone and purge evidence.

Original filenames may be stored only in protected/encrypted application metadata where needed for the user interface; they are not embedded in R2 keys or logs.

## Development cutover

The legacy development primary may contain objects. Before changing `BUCKET`:

1. inventory object count, bytes, keys, ETags/checksums, and safe metadata without exposing content;
2. create the approved target buckets without deleting/rebinding the legacy set;
3. copy only development primary objects through a bounded manifest-driven operation;
4. verify count, bytes, checksum/ETag where meaningful, and representative authorized read/write/delete behavior;
5. point development `BUCKET` to `juro-development-files`;
6. retain the legacy primary read-only for a documented rollback window;
7. remove it only in a separately reviewed destructive operation.

Legacy backup objects are retained under backup policy rather than blindly copied. Legacy quarantine objects are not copied or released without the malware/retention policy and real scanner workflow.

## Upload and quarantine gate

Production upload is not considered safe until the direct/multipart R2 flow, magic-byte validation, archive limits, real malware scanner adapter, quarantine state, fail-closed policy, async job evidence, and provider `safe/ready` boundary are implemented and staged. A bucket named “quarantine” is not a scanner and must never be used as evidence that a file is safe.

## Backup and deletion

Backups use protected manifests and checksums without object keys, filenames, signed URLs, content, or encryption material in logs/alerts. Deletion uses an idempotent tombstone/outbox workflow so database and object-store state cannot silently diverge. Cleanup is dry-run-first and records counts/errors; user content is never purged solely because a Cron trigger fired.

## Production boundary

`juro-private-documents` is not renamed or replaced. No production object copy, backup/quarantine bucket creation, binding change, signed-URL change, or deletion occurs before staging evidence and the later explicit functional production approval.
