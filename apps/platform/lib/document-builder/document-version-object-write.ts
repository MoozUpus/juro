const DEFAULT_GRACE_MS = 10 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 25;

export type BuilderProjectedVersionSource = "suggestion" | "analysis_correction";

export type BuilderVersionObjectWrite = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  documentId: string;
  targetVersion: number;
  sourceRevision: number;
  targetRevision: number;
  source: BuilderProjectedVersionSource;
  sourceEntityId: string;
  r2Key: string;
  sizeBytes: number;
  sha256: string;
  idempotencyKeySha256: string;
  status: "pending" | "attaching" | "attached" | "deleting" | "deleted";
  versionId: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  reconciledAt: string | null;
};

export type BuilderVersionObjectReconciliation = {
  eligible: number;
  claimed: number;
  attached: number;
  deleted: number;
  retrying: number;
};

export async function createBuilderVersionObjectWrite(
  db: D1Database,
  input: {
    workspaceId: string;
    ownerUserId: string;
    documentId: string;
    targetVersion: number;
    sourceRevision: number;
    source: BuilderProjectedVersionSource;
    sourceEntityId: string;
    sizeBytes: number;
    sha256: string;
    idempotencyKeySha256: string;
  },
): Promise<BuilderVersionObjectWrite> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const targetRevision = input.sourceRevision + 1;
  const r2Key = [
    "builder-document-versions",
    input.workspaceId,
    input.documentId,
    `${id}-${targetRevision}-${input.sha256}.json`,
  ].join("/");
  await db.prepare(
    `INSERT INTO builder_document_version_object_writes
     (id,workspace_id,owner_user_id,document_id,target_version,source_revision,
      target_revision,source,source_entity_id,r2_key,size_bytes,sha256,
      idempotency_key_sha256,status,version_id,attempt_count,last_error_code,
      created_at,updated_at,reconciled_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',NULL,0,NULL,?,?,NULL)`,
  ).bind(
    id, input.workspaceId, input.ownerUserId, input.documentId,
    input.targetVersion, input.sourceRevision, targetRevision, input.source,
    input.sourceEntityId, r2Key, input.sizeBytes, input.sha256,
    input.idempotencyKeySha256, now, now,
  ).run();
  return {
    id,
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    documentId: input.documentId,
    targetVersion: input.targetVersion,
    sourceRevision: input.sourceRevision,
    targetRevision,
    source: input.source,
    sourceEntityId: input.sourceEntityId,
    r2Key,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    idempotencyKeySha256: input.idempotencyKeySha256,
    status: "pending",
    versionId: null,
    attemptCount: 0,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    reconciledAt: null,
  };
}

export async function builderVersionObjectWriteByRequest(
  db: D1Database,
  workspaceId: string,
  ownerUserId: string,
  idempotencyKeySha256: string,
): Promise<BuilderVersionObjectWrite | null> {
  return db.prepare(selectWrite("workspace_id=? AND owner_user_id=? AND idempotency_key_sha256=?"))
    .bind(workspaceId, ownerUserId, idempotencyKeySha256)
    .first<BuilderVersionObjectWrite>();
}

export function beginBuilderVersionObjectAttachment(
  db: D1Database,
  write: BuilderVersionObjectWrite,
  now: string,
): D1PreparedStatement {
  return db.prepare(
    `UPDATE builder_document_version_object_writes
     SET status='attaching',last_error_code=NULL,updated_at=?
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND document_id=?
       AND status='pending' AND r2_key=? AND size_bytes=? AND sha256=?`,
  ).bind(
    now, write.id, write.workspaceId, write.ownerUserId, write.documentId,
    write.r2Key, write.sizeBytes, write.sha256,
  );
}

export async function recordBuilderVersionObjectWriteFailure(
  db: D1Database,
  write: BuilderVersionObjectWrite,
  errorCode: "R2_PUT_FAILED" | "D1_ATTACH_CONFLICT",
): Promise<void> {
  await db.prepare(
    `UPDATE builder_document_version_object_writes
     SET attempt_count=attempt_count+1,last_error_code=?,updated_at=?
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND document_id=? AND status='pending'`,
  ).bind(
    errorCode, new Date().toISOString(), write.id, write.workspaceId,
    write.ownerUserId, write.documentId,
  ).run();
}

export async function requireAttachedBuilderVersionObjectWrite(
  db: D1Database,
  writeId: string,
  versionId: string,
): Promise<void> {
  const row = await db.prepare(
    `SELECT 1 AS found FROM builder_document_version_object_writes
     WHERE id=? AND version_id=? AND status='attached' LIMIT 1`,
  ).bind(writeId, versionId).first<{ found: number }>();
  if (!row?.found) throw new Error("BUILDER_VERSION_OBJECT_WRITE_NOT_ATTACHED");
}

export async function reconcileBuilderVersionObjectWrites(input: {
  db: D1Database;
  bucket: R2Bucket;
  now?: string;
  graceMs?: number;
  limit?: number;
}): Promise<BuilderVersionObjectReconciliation> {
  const now = input.now ?? new Date().toISOString();
  const graceMs = Math.max(60_000, input.graceMs ?? DEFAULT_GRACE_MS);
  const limit = Math.max(1, Math.min(100, input.limit ?? DEFAULT_BATCH_SIZE));
  const staleBefore = new Date(Date.parse(now) - graceMs).toISOString();
  const rows = await input.db.prepare(
    `${selectWrite("status IN ('pending','attaching') AND updated_at<=?", false)}
     ORDER BY updated_at,id LIMIT ?`,
  ).bind(staleBefore, limit).all<BuilderVersionObjectWrite>();
  const summary: BuilderVersionObjectReconciliation = {
    eligible: rows.results.length,
    claimed: 0,
    attached: 0,
    deleted: 0,
    retrying: 0,
  };
  for (const row of rows.results) {
    const claimed = await input.db.prepare(
      `UPDATE builder_document_version_object_writes
       SET status='deleting',attempt_count=attempt_count+1,last_error_code=NULL,updated_at=?
       WHERE id=? AND status=? AND updated_at=?`,
    ).bind(now, row.id, row.status, row.updatedAt).run();
    if (Number(claimed.meta.changes ?? 0) !== 1) continue;
    summary.claimed += 1;
    try {
      const version = await input.db.prepare(
        `SELECT id FROM builder_document_versions
         WHERE object_write_id=? AND workspace_id=? AND owner_user_id=? AND document_id=?
           AND version=? AND document_revision=? AND source=? AND r2_key=?
           AND size_bytes=? AND sha256=? AND status='ready' LIMIT 1`,
      ).bind(
        row.id, row.workspaceId, row.ownerUserId, row.documentId,
        row.targetVersion, row.targetRevision, row.source, row.r2Key,
        row.sizeBytes, row.sha256,
      ).first<{ id: string }>();
      if (version?.id) {
        const attached = await markAttached(input.db, row.id, version.id, now);
        summary.attached += attached;
        if (!attached) summary.retrying += 1;
        continue;
      }
      const object = await input.bucket.head(row.r2Key);
      if (object && (
        object.size !== Number(row.sizeBytes)
        || checksumHex(object.checksums.sha256) !== row.sha256
      )) {
        await releaseForRetry(input.db, row.id, "OBJECT_IDENTITY_MISMATCH", now);
        summary.retrying += 1;
        continue;
      }
      if (object) {
        await input.bucket.delete(row.r2Key);
        if (await input.bucket.head(row.r2Key)) {
          await releaseForRetry(input.db, row.id, "OBJECT_DELETE_UNCONFIRMED", now);
          summary.retrying += 1;
          continue;
        }
      }
      const deleted = await markDeleted(input.db, row, now);
      summary.deleted += deleted;
      if (!deleted) summary.retrying += 1;
    } catch {
      await releaseForRetry(input.db, row.id, "OBJECT_DELETE_FAILED", now).catch(() => undefined);
      summary.retrying += 1;
    }
  }
  return summary;
}

async function markAttached(db: D1Database, writeId: string, versionId: string, now: string): Promise<number> {
  const result = await db.prepare(
    `UPDATE builder_document_version_object_writes
     SET status='attached',version_id=?,last_error_code=NULL,updated_at=?,reconciled_at=?
     WHERE id=? AND status='deleting'`,
  ).bind(versionId, now, now, writeId).run();
  return Number(result.meta.changes ?? 0);
}

async function markDeleted(
  db: D1Database,
  row: BuilderVersionObjectWrite,
  now: string,
): Promise<number> {
  const [deleted] = await db.batch([
    db.prepare(
      `UPDATE builder_document_version_object_writes
       SET status='deleted',version_id=NULL,last_error_code=NULL,updated_at=?,reconciled_at=?
       WHERE id=? AND status='deleting'`,
    ).bind(now, now, row.id),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,NULL,'builder_version_object_write',?,'orphan_object_deleted',?,?
       WHERE EXISTS (
         SELECT 1 FROM builder_document_version_object_writes
         WHERE id=? AND status='deleted' AND reconciled_at=?
       )`,
    ).bind(
      crypto.randomUUID(), row.workspaceId, row.id,
      JSON.stringify({ documentId: row.documentId, targetRevision: Number(row.targetRevision) }),
      now, row.id, now,
    ),
  ]);
  return Number(deleted?.meta.changes ?? 0);
}

async function releaseForRetry(
  db: D1Database,
  writeId: string,
  errorCode: "OBJECT_IDENTITY_MISMATCH" | "OBJECT_DELETE_UNCONFIRMED" | "OBJECT_DELETE_FAILED",
  now: string,
): Promise<void> {
  await db.prepare(
    `UPDATE builder_document_version_object_writes
     SET status='pending',last_error_code=?,updated_at=?
     WHERE id=? AND status='deleting'`,
  ).bind(errorCode, now, writeId).run();
}

function selectWrite(where: string, limit = true): string {
  return `SELECT id,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
    document_id AS documentId,target_version AS targetVersion,
    source_revision AS sourceRevision,target_revision AS targetRevision,source,
    source_entity_id AS sourceEntityId,r2_key AS r2Key,size_bytes AS sizeBytes,
    sha256,idempotency_key_sha256 AS idempotencyKeySha256,status,
    version_id AS versionId,attempt_count AS attemptCount,last_error_code AS lastErrorCode,
    created_at AS createdAt,updated_at AS updatedAt,reconciled_at AS reconciledAt
    FROM builder_document_version_object_writes WHERE ${where}${limit ? " LIMIT 1" : ""}`;
}

function checksumHex(value: ArrayBuffer | null | undefined): string {
  if (!value) return "";
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
