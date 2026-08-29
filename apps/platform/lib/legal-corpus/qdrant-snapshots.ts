import { z } from "zod";

import {
  QdrantCorpusError,
  QdrantLegalCorpusClient,
  type QdrantCorpusEnv,
  type QdrantSnapshotInfo,
} from "./qdrant";
import { featureEnabled } from "./trust";

const COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const OBJECT_KEY_PATTERN = /^legal-corpus\/qdrant\/[A-Za-z0-9._\/-]{1,700}$/u;
const MANIFEST_LIMIT_BYTES = 64 * 1024;
const RECOVERY_LOCK_NAME = "legal-corpus-qdrant-recovery";
const RECOVERY_LOCK_MS = 3 * 60_000;

export type LegalCorpusQdrantSnapshotEnv = QdrantCorpusEnv & {
  DB: D1Database;
  BACKUP_BUCKET?: R2Bucket;
  LEGAL_CORPUS_DENSE_ENABLED?: string;
  LEGAL_CORPUS_AUTO_INGEST_ENABLED?: string;
  /** Explicit staging-only recovery after a Container code update can reset
   * its ephemeral collection before the first verified snapshot exists. */
  LEGAL_CORPUS_QDRANT_REBUILD_APPROVED?: string;
};

type DenseLedger = {
  denseTrackedPoints: number;
  denseTrackedCurrentPoints: number;
  missingCurrentPoints: number;
  pendingJobs: number;
  denseIndexedThrough: string | null;
};

export type LegalCorpusQdrantSnapshotManifest = {
  schemaVersion: 1;
  environment: QdrantCorpusEnv["APP_ENV"];
  collection: string;
  createdAt: string;
  denseIndexedThrough: string | null;
  qdrant: {
    snapshotName: string;
    creationTime: string;
    size: number;
    checksumSha256: string;
    totalPoints: number;
    currentPoints: number;
  };
  corpus: {
    denseTrackedPoints: number;
    denseTrackedCurrentPoints: number;
    pendingJobs: number;
  };
  r2: {
    snapshotObjectKey: string;
    snapshotVersion: string;
    snapshotEtag: string;
    snapshotSize: number;
    snapshotChecksumSha256: string;
  };
};

const manifestSchema: z.ZodType<LegalCorpusQdrantSnapshotManifest> = z.object({
  schemaVersion: z.literal(1),
  environment: z.enum(["development", "staging", "production"]),
  collection: z.string().regex(COLLECTION_PATTERN),
  createdAt: z.string().datetime({ offset: true }),
  denseIndexedThrough: z.string().datetime({ offset: true }).nullable(),
  qdrant: z.object({
    snapshotName: z.string().min(1).max(240),
    creationTime: z.string().datetime({ offset: true }),
    size: z.number().int().positive().safe(),
    checksumSha256: z.string().regex(SHA256_PATTERN),
    totalPoints: z.number().int().nonnegative(),
    currentPoints: z.number().int().nonnegative(),
  }).strict(),
  corpus: z.object({
    denseTrackedPoints: z.number().int().nonnegative(),
    denseTrackedCurrentPoints: z.number().int().nonnegative(),
    pendingJobs: z.literal(0),
  }).strict(),
  r2: z.object({
    snapshotObjectKey: z.string().regex(OBJECT_KEY_PATTERN),
    snapshotVersion: z.string().min(1).max(256),
    snapshotEtag: z.string().min(1).max(256),
    snapshotSize: z.number().int().positive().safe(),
    snapshotChecksumSha256: z.string().regex(SHA256_PATTERN),
  }).strict(),
}).strict();

type SnapshotClient = Pick<QdrantLegalCorpusClient,
  | "assertCompatible"
  | "collectionExists"
  | "countPoints"
  | "createSnapshot"
  | "deleteSnapshot"
  | "downloadSnapshot"
  | "ensureCompatible"
  | "restoreSnapshot">;

export class LegalCorpusQdrantSnapshotError extends Error {
  constructor(
    readonly code:
      | "LEGAL_CORPUS_QDRANT_SNAPSHOT_CONFIGURATION_REJECTED"
      | "LEGAL_CORPUS_QDRANT_SNAPSHOT_NOT_READY"
      | "LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID"
      | "LEGAL_CORPUS_QDRANT_SNAPSHOT_WRITE_FAILED"
      | "LEGAL_CORPUS_QDRANT_RESTORE_BUSY",
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "LegalCorpusQdrantSnapshotError";
  }
}

function bucket(env: LegalCorpusQdrantSnapshotEnv): R2Bucket {
  if (!env.BACKUP_BUCKET || !COLLECTION_PATTERN.test(env.QDRANT_COLLECTION?.trim() ?? "")) {
    throw new LegalCorpusQdrantSnapshotError(
      "LEGAL_CORPUS_QDRANT_SNAPSHOT_CONFIGURATION_REJECTED",
      false,
    );
  }
  return env.BACKUP_BUCKET;
}

function collection(env: LegalCorpusQdrantSnapshotEnv): string {
  const value = env.QDRANT_COLLECTION?.trim() ?? "";
  if (!COLLECTION_PATTERN.test(value)) {
    throw new LegalCorpusQdrantSnapshotError(
      "LEGAL_CORPUS_QDRANT_SNAPSHOT_CONFIGURATION_REJECTED",
      false,
    );
  }
  return value;
}

function bytesToHex(value: ArrayBuffer | undefined): string | null {
  if (!value) return null;
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(value);
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes.buffer))!;
}

function canonicalManifest(manifest: LegalCorpusQdrantSnapshotManifest): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(manifest)}\n`);
}

async function denseLedger(db: D1Database): Promise<DenseLedger> {
  const row = await db.prepare(`SELECT
    (SELECT count(*) FROM legal_corpus_chunks chunk
      JOIN legal_corpus_provisions provision ON provision.id=chunk.provision_id
      JOIN legal_corpus_documents document ON document.id=provision.document_id
      WHERE chunk.dense_vector_id IS NOT NULL
        AND document.provider IN ('lex_uz','juro_owner')
        AND document.scope='global' AND document.availability_status='ready') AS denseTrackedPoints,
    (SELECT count(*) FROM legal_corpus_chunks chunk
      JOIN legal_corpus_versions version ON version.id=chunk.version_id
      JOIN legal_corpus_variants variant ON variant.current_version_id=version.id
      JOIN legal_corpus_documents document ON document.id=variant.document_id
      WHERE chunk.dense_vector_id IS NOT NULL
        AND document.provider IN ('lex_uz','juro_owner')
        AND document.scope='global' AND document.availability_status='ready') AS denseTrackedCurrentPoints,
    (SELECT count(*) FROM legal_corpus_chunks chunk
      JOIN legal_corpus_versions version ON version.id=chunk.version_id
      JOIN legal_corpus_variants variant ON variant.current_version_id=version.id
      JOIN legal_corpus_documents document ON document.id=variant.document_id
      WHERE chunk.dense_vector_id IS NULL
        AND document.provider IN ('lex_uz','juro_owner')
        AND document.scope='global' AND document.availability_status='ready') AS missingCurrentPoints,
    (SELECT count(*) FROM legal_corpus_ingestion_jobs WHERE status<>'completed') AS pendingJobs,
    (SELECT max(indexed_at) FROM legal_corpus_chunks WHERE dense_vector_id IS NOT NULL) AS denseIndexedThrough
  `).first<{
    denseTrackedPoints: number;
    denseTrackedCurrentPoints: number;
    missingCurrentPoints: number;
    pendingJobs: number;
    denseIndexedThrough: string | null;
  }>();
  return {
    denseTrackedPoints: Math.max(0, Number(row?.denseTrackedPoints ?? 0)),
    denseTrackedCurrentPoints: Math.max(0, Number(row?.denseTrackedCurrentPoints ?? 0)),
    missingCurrentPoints: Math.max(0, Number(row?.missingCurrentPoints ?? 0)),
    pendingJobs: Math.max(0, Number(row?.pendingJobs ?? 0)),
    denseIndexedThrough: typeof row?.denseIndexedThrough === "string" ? row.denseIndexedThrough : null,
  };
}

async function verifiedObject(
  storage: R2Bucket,
  key: string,
  expectedSize: number,
  expectedSha256: string,
): Promise<R2Object> {
  const object = await storage.head(key);
  if (
    !object
    || object.size !== expectedSize
    || bytesToHex(object.checksums.sha256) !== expectedSha256
  ) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  return object;
}

async function latestManifest(
  env: LegalCorpusQdrantSnapshotEnv,
): Promise<{ snapshotId: string; manifest: LegalCorpusQdrantSnapshotManifest } | null> {
  const row = await env.DB.prepare(`SELECT id AS snapshotId,manifest_object_key AS manifestObjectKey,
      registry_sha256 AS registrySha256
    FROM legal_corpus_snapshots ORDER BY created_at DESC,id DESC LIMIT 1`).first<{
      snapshotId: string;
      manifestObjectKey: string;
      registrySha256: string;
    }>();
  if (!row) return null;
  if (!OBJECT_KEY_PATTERN.test(row.manifestObjectKey) || !SHA256_PATTERN.test(row.registrySha256)) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  const object = await bucket(env).get(row.manifestObjectKey);
  if (!object || object.size < 1 || object.size > MANIFEST_LIMIT_BYTES) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256Hex(bytes) !== row.registrySha256) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  let parsed: LegalCorpusQdrantSnapshotManifest;
  try {
    parsed = manifestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  if (parsed.environment !== env.APP_ENV || parsed.collection !== collection(env)) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  await verifiedObject(
    bucket(env),
    parsed.r2.snapshotObjectKey,
    parsed.r2.snapshotSize,
    parsed.r2.snapshotChecksumSha256,
  );
  return { snapshotId: row.snapshotId, manifest: parsed };
}

function snapshotPrefix(env: LegalCorpusQdrantSnapshotEnv, createdAt: string): string {
  const stamp = createdAt.replace(/[^0-9A-Za-z]/gu, "-");
  return `legal-corpus/qdrant/${env.APP_ENV}/${stamp}-${crypto.randomUUID()}`;
}

async function storeSnapshotObject(input: {
  env: LegalCorpusQdrantSnapshotEnv;
  info: QdrantSnapshotInfo;
  response: Response;
  objectKey: string;
}): Promise<R2Object> {
  const declaredSize = Number(input.response.headers.get("content-length") ?? input.info.size);
  if (!input.response.body || declaredSize !== input.info.size) {
    await input.response.body?.cancel().catch(() => undefined);
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_INVALID", false);
  }
  const stored = await bucket(input.env).put(input.objectKey, input.response.body, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: {
      environment: input.env.APP_ENV,
      collection: collection(input.env),
      qdrantSnapshotName: input.info.name,
      qdrantCreationTime: input.info.creationTime,
      qdrantChecksumSha256: input.info.checksumSha256,
    },
    sha256: input.info.checksumSha256,
  });
  if (!stored) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_WRITE_FAILED", true);
  }
  return verifiedObject(
    bucket(input.env),
    input.objectKey,
    input.info.size,
    input.info.checksumSha256,
  );
}

export type CreateLegalCorpusQdrantSnapshotResult =
  | { status: "disabled" | "not_frozen" | "not_ready"; snapshotId: null }
  | { status: "existing" | "created"; snapshotId: string; manifest: LegalCorpusQdrantSnapshotManifest };

export async function createLegalCorpusQdrantSnapshot(
  env: LegalCorpusQdrantSnapshotEnv,
  options: { client?: SnapshotClient; now?: Date } = {},
): Promise<CreateLegalCorpusQdrantSnapshotResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")) {
    return { status: "disabled", snapshotId: null };
  }
  if (featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { status: "not_frozen", snapshotId: null };
  }
  const ledger = await denseLedger(env.DB);
  if (
    ledger.denseTrackedPoints < 1
    || ledger.missingCurrentPoints > 0
    || ledger.pendingJobs > 0
    || !ledger.denseIndexedThrough
  ) {
    return { status: "not_ready", snapshotId: null };
  }
  bucket(env);
  const client = options.client ?? new QdrantLegalCorpusClient(env);
  if (!(await client.collectionExists())) {
    throw new QdrantCorpusError("QDRANT_SNAPSHOT_REQUIRED", false);
  }
  await client.assertCompatible();
  const [totalPoints, currentPoints] = await Promise.all([
    client.countPoints(false),
    client.countPoints(true),
  ]);
  if (
    totalPoints !== ledger.denseTrackedPoints
    || currentPoints !== ledger.denseTrackedCurrentPoints
  ) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_NOT_READY", false);
  }
  const previous = await latestManifest(env);
  if (
    previous
    && previous.manifest.denseIndexedThrough === ledger.denseIndexedThrough
    && previous.manifest.qdrant.totalPoints === totalPoints
    && previous.manifest.qdrant.currentPoints === currentPoints
  ) {
    return {
      status: "existing",
      snapshotId: previous.snapshotId,
      manifest: previous.manifest,
    };
  }

  const createdAt = (options.now ?? new Date()).toISOString();
  const prefix = snapshotPrefix(env, createdAt);
  const snapshotObjectKey = `${prefix}/${collection(env)}.snapshot`;
  const manifestObjectKey = `${prefix}/manifest.json`;
  let info: QdrantSnapshotInfo | null = null;
  try {
    info = await client.createSnapshot();
    const response = await client.downloadSnapshot(info.name);
    const object = await storeSnapshotObject({ env, info, response, objectKey: snapshotObjectKey });
    const manifest: LegalCorpusQdrantSnapshotManifest = {
      schemaVersion: 1,
      environment: env.APP_ENV,
      collection: collection(env),
      createdAt,
      denseIndexedThrough: ledger.denseIndexedThrough,
      qdrant: {
        snapshotName: info.name,
        creationTime: info.creationTime,
        size: info.size,
        checksumSha256: info.checksumSha256,
        totalPoints,
        currentPoints,
      },
      corpus: {
        denseTrackedPoints: ledger.denseTrackedPoints,
        denseTrackedCurrentPoints: ledger.denseTrackedCurrentPoints,
        pendingJobs: 0,
      },
      r2: {
        snapshotObjectKey,
        snapshotVersion: object.version,
        snapshotEtag: object.etag,
        snapshotSize: object.size,
        snapshotChecksumSha256: info.checksumSha256,
      },
    };
    const manifestBytes = canonicalManifest(manifest);
    const manifestSha256 = await sha256Hex(manifestBytes);
    const storedManifest = await bucket(env).put(manifestObjectKey, manifestBytes, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        environment: env.APP_ENV,
        collection: collection(env),
        snapshotObjectKey,
        snapshotChecksumSha256: info.checksumSha256,
      },
      sha256: manifestSha256,
    });
    if (!storedManifest) {
      throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_SNAPSHOT_WRITE_FAILED", true);
    }
    await verifiedObject(bucket(env), manifestObjectKey, manifestBytes.byteLength, manifestSha256);
    const snapshotId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO legal_corpus_snapshots
      (id,manifest_object_key,registry_sha256,created_at,created_by_run_id)
      VALUES (?,?,?,?,NULL)`).bind(snapshotId, manifestObjectKey, manifestSha256, createdAt).run();
    return { status: "created", snapshotId, manifest };
  } finally {
    if (info) await client.deleteSnapshot(info.name).catch(() => undefined);
  }
}

async function claimRecoveryLock(db: D1Database, now: Date): Promise<string> {
  const holderId = crypto.randomUUID();
  const acquiredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + RECOVERY_LOCK_MS).toISOString();
  const result = await db.prepare(`INSERT INTO scheduled_locks
      (name,holder_id,acquired_at,expires_at,updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET holder_id=excluded.holder_id,
      acquired_at=excluded.acquired_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at
    WHERE scheduled_locks.expires_at<=excluded.acquired_at`)
    .bind(RECOVERY_LOCK_NAME, holderId, acquiredAt, expiresAt, acquiredAt).run();
  if (Number(result.meta?.changes ?? 0) !== 1) {
    throw new LegalCorpusQdrantSnapshotError("LEGAL_CORPUS_QDRANT_RESTORE_BUSY", true);
  }
  return holderId;
}

async function releaseRecoveryLock(db: D1Database, holderId: string): Promise<void> {
  await db.prepare("DELETE FROM scheduled_locks WHERE name=? AND holder_id=?")
    .bind(RECOVERY_LOCK_NAME, holderId).run();
}

export type EnsureLegalCorpusQdrantResult = {
  status: "created" | "existing" | "restored";
  resetDensePointIds: number;
};

/** Ensures an ephemeral Cloudflare Container never silently replaces a tracked
 * collection with an empty one. If D1 already records dense point IDs, a
 * verified private-R2 snapshot is mandatory and post-snapshot IDs are reset
 * for deterministic re-backfill. */
export async function ensureLegalCorpusQdrantAvailable(
  env: LegalCorpusQdrantSnapshotEnv,
  options: { client?: SnapshotClient; now?: Date } = {},
): Promise<EnsureLegalCorpusQdrantResult> {
  const client = options.client ?? new QdrantLegalCorpusClient(env);
  const ledger = await denseLedger(env.DB);
  const snapshotRow = await env.DB.prepare(
    "SELECT 1 AS present FROM legal_corpus_snapshots LIMIT 1",
  ).first<{ present: number }>();
  const exists = await client.collectionExists();
  if (exists) {
    await client.assertCompatible();
    const totalPoints = await client.countPoints(false);
    if (totalPoints === ledger.denseTrackedPoints) {
      return { status: "existing", resetDensePointIds: 0 };
    }
    if (totalPoints > ledger.denseTrackedPoints) {
      throw new QdrantCorpusError("QDRANT_COLLECTION_INCOMPATIBLE", false);
    }
  } else if (ledger.denseTrackedPoints === 0) {
    await client.ensureCompatible();
    return { status: "created", resetDensePointIds: 0 };
  } else if (
    env.APP_ENV === "staging"
    && env.LEGAL_CORPUS_AUTO_INGEST_ENABLED !== "true"
    && env.LEGAL_CORPUS_QDRANT_REBUILD_APPROVED === "true"
    && !snapshotRow
  ) {
    // The approved staging recovery path is intentionally disjoint from the
    // normal restore path: when an ephemeral Container was reset before any
    // verified snapshot existed, clear only deterministic point metadata for
    // the global legal corpus and rebuild them from source text. No user
    // documents are in this scope, and the flag is never enabled in
    // production. Keep the operation explicit and safe to retry.
    await client.ensureCompatible();
    const reset = await env.DB.prepare(`UPDATE legal_corpus_chunks
      SET dense_vector_id=NULL,indexed_at=NULL
      WHERE dense_vector_id IS NOT NULL
        AND id IN (
          SELECT chunk.id
          FROM legal_corpus_chunks chunk
          INNER JOIN legal_corpus_provisions provision ON provision.id=chunk.provision_id
          INNER JOIN legal_corpus_documents document ON document.id=provision.document_id
          WHERE document.provider IN ('lex_uz','juro_owner')
            AND document.scope='global' AND document.availability_status='ready'
        )`).run();
    const resetDensePointIds = Math.max(0, Number(reset.meta?.changes ?? 0));
    console.warn(JSON.stringify({
      service: "legal-corpus-qdrant-recovery",
      event: "qdrant.disjoint_rebuild_reset",
      environment: env.APP_ENV,
      resetDensePointIds,
      reason: "approved_staging_rebuild_after_ephemeral_collection_reset",
    }));
    return { status: "created", resetDensePointIds };
  }

  bucket(env);
  const holderId = await claimRecoveryLock(env.DB, options.now ?? new Date());
  try {
    const stored = await latestManifest(env);
    if (!stored) throw new QdrantCorpusError("QDRANT_SNAPSHOT_REQUIRED", false);
    const latest = stored.manifest;
    const snapshot = await bucket(env).get(latest.r2.snapshotObjectKey);
    if (!snapshot || !snapshot.body) {
      throw new QdrantCorpusError("QDRANT_SNAPSHOT_INVALID", false);
    }
    await client.restoreSnapshot({
      name: latest.qdrant.snapshotName,
      size: latest.r2.snapshotSize,
      checksumSha256: latest.r2.snapshotChecksumSha256,
      body: snapshot.body,
    });
    await client.assertCompatible();
    if (await client.countPoints(false) !== latest.qdrant.totalPoints) {
      throw new QdrantCorpusError("QDRANT_SNAPSHOT_INVALID", false);
    }
    const reset = await env.DB.prepare(`UPDATE legal_corpus_chunks SET dense_vector_id=NULL
      WHERE dense_vector_id IS NOT NULL AND (indexed_at IS NULL OR indexed_at>?)`)
      .bind(latest.denseIndexedThrough ?? "").run();
    const after = await denseLedger(env.DB);
    if (after.denseTrackedPoints !== latest.corpus.denseTrackedPoints) {
      throw new QdrantCorpusError("QDRANT_SNAPSHOT_INVALID", false);
    }
    return {
      status: "restored",
      resetDensePointIds: Math.max(0, Number(reset.meta?.changes ?? 0)),
    };
  } finally {
    await releaseRecoveryLock(env.DB, holderId).catch(() => undefined);
  }
}
