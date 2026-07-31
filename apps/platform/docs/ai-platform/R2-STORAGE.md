# JURO R2 storage

Updated: 2026-07-29
Status: remote inventory verified. Six approved private EEUR Standard development/staging target buckets exist. `juro-staging-backups` contains 26 verified staging D1 backup/restore artifacts, including the pre/post `0030`–`0034` checkpoints; all other target buckets remain without verified application content. Production storage was unchanged.

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

New analysis uploads use `quarantine/{workspaceId}/{analysisId}/{fileId}` in the environment primary private bucket. The key is server-generated and contains no filename. The Worker streams the binary body to R2, supplies the expected SHA-256, then verifies size, stored SHA-256, and format magic during finalize.

The separate quarantine bucket binding is deliberately not used yet because the current account-deletion purge inventories the primary bucket. Cross-bucket cutover requires additive purge inventory, retention, backup, and restore coverage. A safe prefix is not a malware scanner and no object is promoted to `safe` or `ready` until a real scanner produces verified evidence.

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
