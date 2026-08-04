# JURO R2 storage

## Pending scanner promotion boundary

Migration candidate `0068` defines the missing scan-evidence boundary and the
local consumer uses immutable
`safe-v1/{workspaceId}/{analysisId}/{fileId}` keys. Promotion verifies the
quarantined object twice (scan and copy reads), uses conditional-create
semantics in the primary bucket, verifies the stored SHA, and changes the D1
key only in the terminal clean batch. A failed post-promotion quarantine delete
leaves an inaccessible duplicate for retention cleanup rather than undoing the
safe record. This code is not deployed and no object has been promoted by a
real scanner.

Updated: 2026-07-29
Status: remote inventory verified. Six approved private EEUR Standard development/staging target buckets exist. `juro-staging-backups` contains 26 verified staging D1 backup/restore artifacts, including the pre/post `0030`–`0034` checkpoints; all other target buckets remain without verified application content. Production storage was unchanged.

Current checkpoint — 2026-08-04: private prefix
`d1/juro-staging/20260804-080310-0068/` contains full/schema/data exports whose
three independent download hashes matched and whose schema/data restored with
`quick_check=ok` and zero FK violations. This backup proves recovery evidence
for migration `0068`; it does not prove malware clearance or user-file backup.

## Verified remote state

| Role | Bucket | State |
|---|---|---|
| Production primary | `juro-private-documents` | exists; private; preserve |
| Development primary legacy | `juro-private-documents-development` | exists; private |
| Development backup legacy | `juro-private-backups-development` | exists; private |
| Development quarantine legacy | `juro-quarantine-development` | exists; private |
| Development targets | `juro-development-files`, `juro-development-backups`, `juro-development-quarantine` | exist; no verified application objects; private; EEUR Standard |
| Staging targets | `juro-staging-files`, `juro-staging-backups`, `juro-staging-quarantine` | exist; private; EEUR Standard; backups contains 26 verified D1 SQL/restore artifacts, while files/quarantine have no verified application objects |
| Production backup/quarantine | — | absent |

`site-creator-r2` is a Sites-managed/non-JURO-primary resource and is not repurposed for document, backup, or quarantine storage.

## Approved target names

| Environment | Primary files | Backups | Quarantine |
|---|---|---|---|
| Development | `juro-development-files` | `juro-development-backups` | `juro-development-quarantine` |
| Staging | `juro-staging-files` | `juro-staging-backups` | `juro-staging-quarantine` |
| Production | `juro-private-documents` | `juro-production-backups` | `juro-production-quarantine` |

Every bucket in the verified remote inventory is private and has no public development URL or custom domain. `juro-production-backups` and `juro-production-quarantine` are approved target names only and do not currently exist. The 26 staging SQL/restore objects prove only the recorded D1 backup/restore checks; bucket existence alone is not proof of user-file backup, quarantine, or malware scanning. Application access uses an authorized backend proxy or narrowly scoped short-lived signed URL after session, tenant, object, method, disposition, and audit checks.

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

The local legal-source pipeline uses the same private environment `BUCKET`
binding with server-generated content-addressed prefixes:

- `legal-sources/raw/{kind}/{locale}/{sha-prefix}/{sha}.html` for exact fetched
  evidence;
- `legal-sources/parsed/{kind}/{locale}/{raw-sha-prefix}/{raw-sha}/parse5-v1-{parsed-sha}.json`
  for deterministic, still-untrusted normalized snapshots.

Both layers verify bounded size and SHA-256 before replay. Neither prefix is a
public source bucket or trusted legal index. R2 persistence may precede D1 and
leave an unreferenced immutable object after a D1 failure; such an orphan is
never a verified source and requires later manifest-based cleanup.

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

## Phase 5 upload prefix

New analysis uploads use `quarantine-v2/{workspaceId}/{analysisId}/{fileId}` in the dedicated environment private quarantine bucket. The key is server-generated and contains no filename. The Worker streams the binary body to R2, supplies the expected SHA-256, then verifies size, stored SHA-256, and format magic during finalize.

New document-analysis uploads use the separate quarantine bucket with the versioned `quarantine-v2/` prefix. Account-deletion purge inventories both buckets and routes legacy `quarantine/` keys to the primary bucket while routing `quarantine-v2/` keys to the quarantine bucket. A safe prefix and separate bucket are not a malware scanner: no object is promoted to `safe` or `ready` until a real scanner produces verified evidence.

## Completed-analysis export objects

Machine-readable completed-analysis exports use the private primary `BUCKET`
binding and server-generated keys:

`exports/{workspaceId}/{analysisId}/{exportId}.json`

The key contains no filename or user content. The Queue consumer uses conditional
create semantics, `application/json; charset=utf-8`, `Cache-Control: private,
no-store`, and SHA-256 metadata, then verifies size and checksum before D1 becomes
`completed`. An authorized download is proxied by the Worker only after tenant,
owner, state, size, and checksum verification; the bucket remains private.
Idempotent replay cannot overwrite a different object. Export retention and purge
integration remain an explicit open gate before production readiness.

### Staging 0040 checkpoint

The pre/post `juro-staging` portable exports are stored privately under
`d1/juro-staging/20260731-141719/pre-0040.sql` and
`d1/juro-staging/20260731-141949/post-0040.sql` in `juro-staging-backups`.
Both were downloaded independently and matched their local SHA-256 values. These
backup objects are recovery evidence, not application export artifacts.

## Completed-analysis PDF/DOCX report objects

Human-readable reports use the same private environment `BUCKET` with immutable,
server-generated keys:

`exports/{workspaceId}/{analysisId}/{reportExportId}.{pdf|docx}`

The key includes no email, filename, title, document text, or other direct PII.
The Queue consumer uses `If-None-Match: *`, writes exact MIME and `private,
no-store` metadata, and verifies byte count plus SHA-256 before D1 becomes
`completed`. A pre-existing key is accepted only when its size and checksum match
the freshly generated deterministic artifact.

Authorized downloads are proxied only after session, active workspace, owner,
terminal state, size, and SHA-256 verification. Terminal deletion removes and
verifies absence in R2 before deleting the D1 row; account deletion inventories
report keys before crossing its irreversible boundary. Another tenant's object is
never disclosed or deleted by identifier substitution.

There is no automatic report TTL. Reports follow user-content retention and are
removed only by explicit terminal-export deletion or the reviewed account-deletion
purge. Migration and staging pre/post backup evidence are recorded separately.

## Staging private-bucket lifecycle smoke — 2026-08-01

A single synthetic, non-personal text object was written to the private
`juro-staging-files` bucket under a random temporary `smoke/` key, downloaded,
and compared using SHA-256. The verified digest was
`acfd416c93db50da78b6bd6340ab9f95cbfc812b81dd03143ac5d680614f0141`.
The exact object was then deleted and a fresh remote read returned not-found. The
temporary key and local fixture were removed after the check.

This proves only staging R2 write/read/integrity/delete behavior for an isolated
synthetic object. It does not prove application authorization, file promotion,
malware scanning, or a completed document analysis.

## Immutable normalized analysis versions

Local migration 0069 and its Worker candidate use the private primary bucket:

`analysis-versions/{workspaceId}/{analysisId}/{writeIntentId}-{version}-{sha256}.md`

Keys are server-generated and contain no source filename or document text.
Writes use `If-None-Match: *`, exact SHA-256 and `private, no-store`; an existing
object is accepted only when size and checksum match. Authorized downloads are
proxied after owner/workspace/version lookup and object-integrity verification.
Account deletion inventories these keys with exports and OCR derivatives. No
staging object under this prefix is claimed until migration 0069 and its matching
Worker are separately authorized and deployed.

Local migration 0073 adds a durable D1 write-intent ledger. Writers create the
intent before R2, then attach the exact key/size/SHA/version in one D1 batch.
The five-minute scheduler claims stale unattached intents before exact-key R2
deletion, verifies deletion, and records metadata-only audit evidence. Unique
intent IDs prevent a losing writer from sharing the winner's object key. Pending
intent keys are also included in account deletion. No bucket listing is used as
authorization or ownership evidence.

## Corrected-version DOCX/PDF exports

Local migration 0070 reuses the existing private export prefix:

`exports/{workspaceId}/{analysisId}/{exportId}.{pdf|docx}`

The D1 row binds every clean or redline artifact to one immutable corrected
version. The consumer re-verifies that version's R2 size and SHA-256, checks the
exact applied-revision set, renders a deterministic normalized artifact, then
uses the existing conditional create and completion-evidence path. The object
key and metadata contain identifiers only. Explicit deletion and account purge
cover these rows automatically because they remain in `analysis_report_exports`.
No staging object of these variants is claimed before migrations 0069/0070 and
the matching Worker are separately authorized.

## Persisted document-comparison exports

Local migration 0071 introduces private artifacts at:

`comparison-exports/{workspaceId}/{comparisonId}/{exportId}.{pdf|docx}`

The consumer renders only after a same-tenant completed comparison lookup,
writes with `If-None-Match: *`, stores SHA-256/size evidence, and refuses an
existing object unless both match. Downloads are backend-proxied after an owner
lookup and a second object-integrity check. Terminal deletion removes R2 first,
then D1, and records an immutable audit event. Account closure inventories these
keys directly and through comparisons that reference the closing user's files.
No staging object under this prefix is claimed before migration 0071 deployment.
