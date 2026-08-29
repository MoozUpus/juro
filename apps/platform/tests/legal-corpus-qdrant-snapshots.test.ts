import assert from "node:assert/strict";
import test from "node:test";

import {
  createLegalCorpusQdrantSnapshot,
  ensureLegalCorpusQdrantAvailable,
} from "../lib/legal-corpus/qdrant-snapshots";
import type { QdrantSnapshotInfo } from "../lib/legal-corpus/qdrant";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

type Stored = {
  bytes: Uint8Array;
  version: string;
  etag: string;
  checksum: ArrayBuffer;
  customMetadata: Record<string, string>;
  contentType?: string;
};

function exactBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).buffer;
}

function hex(value: ArrayBuffer | ArrayBufferView): string {
  return Array.from(new Uint8Array(exactBuffer(value)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bodyBytes(value: unknown): Promise<Uint8Array> {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (value instanceof ReadableStream) {
    return new Uint8Array(await new Response(value).arrayBuffer());
  }
  throw new TypeError("Unsupported fake R2 body");
}

class MemoryR2 {
  readonly objects = new Map<string, Stored>();
  private version = 0;

  private object(key: string, stored: Stored) {
    return {
      key,
      version: stored.version,
      size: stored.bytes.byteLength,
      etag: stored.etag,
      httpEtag: `"${stored.etag}"`,
      uploaded: new Date("2026-08-15T16:00:00.000Z"),
      httpMetadata: { contentType: stored.contentType },
      customMetadata: stored.customMetadata,
      checksums: { sha256: stored.checksum },
      storageClass: "Standard" as const,
      writeHttpMetadata() {},
    };
  }

  async put(key: string, value: unknown, options: R2PutOptions = {}) {
    const bytes = await bodyBytes(value);
    const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
    const expected = typeof options.sha256 === "string"
      ? options.sha256
      : options.sha256 ? hex(options.sha256) : null;
    if (expected && expected !== hex(digest)) throw new Error("checksum mismatch");
    this.version += 1;
    const stored: Stored = {
      bytes,
      version: `version-${this.version}`,
      etag: `etag-${this.version}`,
      checksum: digest,
      customMetadata: options.customMetadata ?? {},
      contentType: options.httpMetadata && !(options.httpMetadata instanceof Headers)
        ? options.httpMetadata.contentType
        : undefined,
    };
    this.objects.set(key, stored);
    return this.object(key, stored) as unknown as R2Object;
  }

  async head(key: string) {
    const stored = this.objects.get(key);
    return stored ? this.object(key, stored) as unknown as R2Object : null;
  }

  async get(key: string) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      ...this.object(key, stored),
      body: new Blob([Uint8Array.from(stored.bytes).buffer]).stream(),
      bodyUsed: false,
      async arrayBuffer() { return stored.bytes.slice().buffer; },
      async text() { return new TextDecoder().decode(stored.bytes); },
      async json<T>() { return JSON.parse(new TextDecoder().decode(stored.bytes)) as T; },
      async blob() { return new Blob([Uint8Array.from(stored.bytes).buffer]); },
    } as unknown as R2ObjectBody;
  }
}

function seedDenseChunk(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: { suffix: string; indexedAt: string; current?: boolean },
): void {
  const documentId = `lexuz:${input.suffix}`;
  const variantId = `${documentId}:ru`;
  const versionId = `${variantId}:v1`;
  const provisionId = `${versionId}:p0`;
  const chunkId = `${provisionId}:c0`;
  const hash = input.suffix.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/gu, "a");
  sqlite.prepare(`INSERT INTO legal_corpus_documents (
    id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,document_type,
    availability_status,trusted,verification_status,approval_required,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    documentId, "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
    `https://lex.uz/ru/docs/${input.suffix}`, "Test act", "legal_act", "ready", 1,
    "official_source", 0, input.indexedAt, input.indexedAt,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_variants (
    id,document_id,language,is_official_language_version,source_url,last_verified_at,current_version_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    variantId, documentId, "ru", 1, `https://lex.uz/ru/docs/${input.suffix}`,
    input.indexedAt, input.current === false ? null : versionId, input.indexedAt, input.indexedAt,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_versions (
    id,variant_id,version_number,status,valid_from,version_date,content_sha256,raw_object_key,
    normalized_object_key,source_url,fetched_at,change_type,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    versionId, variantId, 1, "active", "2026-01-01", "2026-01-01", hash,
    `raw/${input.suffix}`, `normalized/${input.suffix}`, `https://lex.uz/ru/docs/${input.suffix}`,
    input.indexedAt, "new", input.indexedAt,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_provisions (
    id,document_id,variant_id,version_id,sequence,text,exact_quote_source,language,status,
    valid_from,source_url,content_sha256,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    provisionId, documentId, variantId, versionId, 0, "Official text", "Official text", "ru",
    "active", "2026-01-01", `https://lex.uz/ru/docs/${input.suffix}`, hash, input.indexedAt,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_chunks (
    id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,
    sparse_terms_json,dense_vector_id,indexed_at,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    chunkId, provisionId, versionId, 0, 1, "Official text", hash, "[]",
    crypto.randomUUID(), input.indexedAt, input.indexedAt,
  );
}

test("frozen dense corpus writes checksum-verified Qdrant snapshot and deduplicates the ledger", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const r2 = new MemoryR2();
  const snapshotBytes = new TextEncoder().encode("private-qdrant-snapshot");
  const checksum = hex(await crypto.subtle.digest("SHA-256", snapshotBytes));
  const info: QdrantSnapshotInfo = {
    name: "legal.snapshot",
    size: snapshotBytes.byteLength,
    creationTime: "2026-08-15T16:01:00.000Z",
    checksumSha256: checksum,
  };
  let creates = 0;
  let deletes = 0;
  const client = {
    async collectionExists() { return true; },
    async assertCompatible() {},
    async countPoints() { return 1; },
    async createSnapshot() { creates += 1; return info; },
    async downloadSnapshot() {
      return new Response(snapshotBytes, {
        headers: { "content-length": String(snapshotBytes.byteLength) },
      });
    },
    async deleteSnapshot() { deletes += 1; },
    async ensureCompatible() { return "existing" as const; },
    async restoreSnapshot() {},
  };
  try {
    seedDenseChunk(sqlite, { suffix: "42", indexedAt: "2026-08-15T16:00:00.000Z" });
    const env = {
      APP_ENV: "staging" as const,
      DB: d1,
      BACKUP_BUCKET: r2 as unknown as R2Bucket,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      LEGAL_CORPUS_QDRANT_REBUILD_APPROVED: "true",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    };
    const created = await createLegalCorpusQdrantSnapshot(env, {
      client,
      now: new Date("2026-08-15T16:02:00.000Z"),
    });
    assert.equal(created.status, "created");
    assert.equal(creates, 1);
    assert.equal(deletes, 1);
    assert.equal(r2.objects.size, 2);
    assert.equal(created.status === "created" && created.manifest.qdrant.checksumSha256, checksum);
    const row = sqlite.prepare(`SELECT id,manifest_object_key AS manifestObjectKey,
      registry_sha256 AS registrySha256 FROM legal_corpus_snapshots`).get() as {
        id: string;
        manifestObjectKey: string;
        registrySha256: string;
      };
    assert.match(row.manifestObjectKey, /\/manifest\.json$/u);
    assert.equal(row.registrySha256.length, 64);

    const replay = await createLegalCorpusQdrantSnapshot(env, {
      client,
      now: new Date("2026-08-15T16:03:00.000Z"),
    });
    assert.equal(replay.status, "existing");
    assert.equal(replay.status === "existing" && replay.snapshotId, row.id);
    assert.equal(creates, 1);
    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_snapshots",
    ).get() as { count: number }).count), 1);
  } finally {
    sqlite.close();
  }
});

test("approved staging disjoint snapshot records deferred queued acquisition work", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const r2 = new MemoryR2();
  const snapshotBytes = new TextEncoder().encode("disjoint-qdrant-snapshot");
  const checksum = hex(await crypto.subtle.digest("SHA-256", snapshotBytes));
  const client = {
    async collectionExists() { return true; },
    async assertCompatible() {},
    async countPoints() { return 1; },
    async createSnapshot() {
      return {
        name: "legal-disjoint.snapshot",
        size: snapshotBytes.byteLength,
        creationTime: "2026-08-15T16:01:00.000Z",
        checksumSha256: checksum,
      };
    },
    async downloadSnapshot() {
      return new Response(snapshotBytes, {
        headers: { "content-length": String(snapshotBytes.byteLength) },
      });
    },
    async deleteSnapshot() {},
    async ensureCompatible() { return "existing" as const; },
    async restoreSnapshot() {},
  };
  try {
    seedDenseChunk(sqlite, { suffix: "43", indexedAt: "2026-08-15T16:00:00.000Z" });
    sqlite.prepare(`INSERT INTO legal_corpus_ingestion_jobs
      (id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,
       idempotency_key,attempt_count,max_attempts,next_attempt_at,last_error_code,
       correlation_id,created_at,updated_at)
      VALUES ('deferred-fetch','fetch','queued','lex_uz','lexuz:deferred',NULL,
        'https://lex.uz/docs/deferred','ru','deferred-fetch-key',0,5,NULL,NULL,
        'disjoint-test','2026-08-15T16:00:00.000Z','2026-08-15T16:00:00.000Z')`).run();
    const env = {
      APP_ENV: "staging" as const,
      DB: d1,
      BACKUP_BUCKET: r2 as unknown as R2Bucket,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      LEGAL_CORPUS_QDRANT_DISJOINT_SNAPSHOT_APPROVED: "true",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    };
    const result = await createLegalCorpusQdrantSnapshot(env, { client });
    assert.equal(result.status, "created");
    assert.equal(result.status === "created" && result.manifest.corpus.pendingJobs, 0);
    assert.equal(result.status === "created" && result.manifest.corpus.deferredQueueJobs, 1);
  } finally {
    sqlite.close();
  }
});

test("ephemeral collection restore requires the verified R2 snapshot and resets only later D1 point ids", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const r2 = new MemoryR2();
  const snapshotBytes = new TextEncoder().encode("private-qdrant-snapshot");
  const checksum = hex(await crypto.subtle.digest("SHA-256", snapshotBytes));
  let restoredBytes = new Uint8Array();
  try {
    seedDenseChunk(sqlite, { suffix: "42", indexedAt: "2026-08-15T16:00:00.000Z" });
    const env = {
      APP_ENV: "staging" as const,
      DB: d1,
      BACKUP_BUCKET: r2 as unknown as R2Bucket,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    };
    await createLegalCorpusQdrantSnapshot(env, {
      now: new Date("2026-08-15T16:02:00.000Z"),
      client: {
        async collectionExists() { return true; },
        async assertCompatible() {},
        async countPoints() { return 1; },
        async createSnapshot() {
          return {
            name: "legal.snapshot",
            size: snapshotBytes.byteLength,
            creationTime: "2026-08-15T16:01:00.000Z",
            checksumSha256: checksum,
          };
        },
        async downloadSnapshot() {
          return new Response(snapshotBytes, {
            headers: { "content-length": String(snapshotBytes.byteLength) },
          });
        },
        async deleteSnapshot() {},
        async ensureCompatible() { return "existing" as const; },
        async restoreSnapshot() {},
      },
    });
    seedDenseChunk(sqlite, { suffix: "43", indexedAt: "2026-08-15T16:04:00.000Z" });
    const restored = await ensureLegalCorpusQdrantAvailable(env, {
      now: new Date("2026-08-15T16:05:00.000Z"),
      client: {
        async collectionExists() { return false; },
        async assertCompatible() {},
        async countPoints() { return 1; },
        async createSnapshot() { throw new Error("not used"); },
        async deleteSnapshot() {},
        async downloadSnapshot() { throw new Error("not used"); },
        async ensureCompatible() { throw new Error("empty collection must not be created"); },
        async restoreSnapshot(input) {
          restoredBytes = new Uint8Array(await new Response(input.body).arrayBuffer());
          assert.equal(input.checksumSha256, checksum);
        },
      },
    });
    assert.deepEqual(restored, { status: "restored", resetDensePointIds: 1 });
    assert.deepEqual(restoredBytes, snapshotBytes);
    const rows = sqlite.prepare(`SELECT id,dense_vector_id AS denseVectorId
      FROM legal_corpus_chunks ORDER BY id`).all() as Array<{ id: string; denseVectorId: string | null }>;
    assert.equal(rows[0]?.denseVectorId === null, false);
    assert.equal(rows[1]?.denseVectorId, null);
    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM scheduled_locks WHERE name='legal-corpus-qdrant-recovery'",
    ).get() as { count: number }).count), 0);
  } finally {
    sqlite.close();
  }
});

test("approved staging rebuild recreates an empty ephemeral collection before the first snapshot", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let ensured = 0;
  try {
    seedDenseChunk(sqlite, { suffix: "45", indexedAt: "2026-08-15T16:00:00.000Z" });
    const restored = await ensureLegalCorpusQdrantAvailable({
      APP_ENV: "staging",
      DB: d1,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      LEGAL_CORPUS_QDRANT_REBUILD_APPROVED: "true",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    }, {
      client: {
        async collectionExists() { return false; },
        async assertCompatible() {},
        async countPoints() { return 0; },
        async createSnapshot() { throw new Error("not used"); },
        async deleteSnapshot() {},
        async downloadSnapshot() { throw new Error("not used"); },
        async ensureCompatible() { ensured += 1; return "created" as const; },
        async restoreSnapshot() { throw new Error("not used"); },
      },
    });
    assert.deepEqual(restored, { status: "created", resetDensePointIds: 1 });
    assert.equal(ensured, 1);
    const row = sqlite.prepare(
      "SELECT dense_vector_id AS denseVectorId,indexed_at AS indexedAt FROM legal_corpus_chunks LIMIT 1",
    ).get() as { denseVectorId: string | null; indexedAt: string | null };
    assert.equal(row.denseVectorId, null);
    assert.equal(row.indexedAt, null);
  } finally {
    sqlite.close();
  }
});

test("approved staging rebuild clears a partially populated collection before resetting D1 ids", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let deleted = 0;
  try {
    seedDenseChunk(sqlite, { suffix: "46", indexedAt: "2026-08-15T16:00:00.000Z" });
    const restored = await ensureLegalCorpusQdrantAvailable({
      APP_ENV: "staging",
      DB: d1,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      LEGAL_CORPUS_QDRANT_REBUILD_APPROVED: "true",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    }, {
      client: {
        async collectionExists() { return true; },
        async assertCompatible() {},
        async countPoints() { return 0; },
        async deleteAllPoints() { deleted += 1; },
        async createSnapshot() { throw new Error("not used"); },
        async deleteSnapshot() {},
        async downloadSnapshot() { throw new Error("not used"); },
        async ensureCompatible() { return "existing" as const; },
        async restoreSnapshot() { throw new Error("not used"); },
      },
    });
    assert.deepEqual(restored, { status: "existing", resetDensePointIds: 1 });
    assert.equal(deleted, 1);
    const row = sqlite.prepare(
      "SELECT dense_vector_id AS denseVectorId,indexed_at AS indexedAt FROM legal_corpus_chunks LIMIT 1",
    ).get() as { denseVectorId: string | null; indexedAt: string | null };
    assert.equal(row.denseVectorId, null);
    assert.equal(row.indexedAt, null);
  } finally {
    sqlite.close();
  }
});

test("snapshot attempt recovers a disappeared staging collection before returning not_ready", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const r2 = new MemoryR2();
  let exists = false;
  let ensured = 0;
  try {
    seedDenseChunk(sqlite, { suffix: "47", indexedAt: "2026-08-15T16:00:00.000Z" });
    const client = {
      async collectionExists() { return exists; },
      async assertCompatible() {},
      async countPoints() { return 0; },
      async deleteAllPoints() {},
      async createSnapshot() { throw new Error("not used"); },
      async deleteSnapshot() {},
      async downloadSnapshot() { throw new Error("not used"); },
      async ensureCompatible() { exists = true; ensured += 1; return "created" as const; },
      async restoreSnapshot() { throw new Error("not used"); },
    };
    const result = await createLegalCorpusQdrantSnapshot({
      APP_ENV: "staging",
      DB: d1,
      BACKUP_BUCKET: r2 as unknown as R2Bucket,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      LEGAL_CORPUS_QDRANT_REBUILD_APPROVED: "true",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    }, { client });
    assert.deepEqual(result, { status: "not_ready", snapshotId: null });
    assert.equal(ensured, 1);
    const row = sqlite.prepare(
      "SELECT dense_vector_id AS denseVectorId,indexed_at AS indexedAt FROM legal_corpus_chunks LIMIT 1",
    ).get() as { denseVectorId: string | null; indexedAt: string | null };
    assert.equal(row.denseVectorId, null);
    assert.equal(row.indexedAt, null);
  } finally {
    sqlite.close();
  }
});

test("R2 checksum option rejects corrupted snapshot bytes before a ledger row exists", async () => {
  const good = new TextEncoder().encode("good");
  const bad = new TextEncoder().encode("bad");
  const checksum = hex(await crypto.subtle.digest("SHA-256", good));
  const { sqlite, d1 } = sqliteD1Fixture();
  const r2 = new MemoryR2();
  try {
    seedDenseChunk(sqlite, { suffix: "44", indexedAt: "2026-08-15T16:00:00.000Z" });
    await assert.rejects(() => createLegalCorpusQdrantSnapshot({
      APP_ENV: "staging",
      DB: d1,
      BACKUP_BUCKET: r2 as unknown as R2Bucket,
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
    }, {
      client: {
        async collectionExists() { return true; },
        async assertCompatible() {},
        async countPoints() { return 1; },
        async createSnapshot() {
          return {
            name: "legal.snapshot",
            size: bad.byteLength,
            creationTime: "2026-08-15T16:01:00.000Z",
            checksumSha256: checksum,
          };
        },
        async downloadSnapshot() {
          return new Response(bad, { headers: { "content-length": String(bad.byteLength) } });
        },
        async deleteSnapshot() {},
        async ensureCompatible() { return "existing" as const; },
        async restoreSnapshot() {},
      },
    }));
    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_snapshots",
    ).get() as { count: number }).count), 0);
  } finally {
    sqlite.close();
  }
});
