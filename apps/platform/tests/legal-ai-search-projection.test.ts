import assert from "node:assert/strict";
import test from "node:test";

import { runAiSearchProjectionBatch } from "../lib/legal-corpus/ai-search-projection";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const now = "2026-09-02T03:00:00.000Z";
const releaseId = "release:projection-test-v1";

class Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();

  async get(key: string) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = stored.bytes.slice();
    return {
      size: bytes.byteLength,
      customMetadata: { ...stored.customMetadata },
      async arrayBuffer() { return bytes.buffer; },
    };
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string, options?: R2PutOptions) {
    if (options?.onlyIf && this.objects.has(key)) return null;
    const bytes = typeof value === "string"
      ? new TextEncoder().encode(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
        : new Uint8Array(value).slice();
    this.objects.set(key, { bytes, customMetadata: { ...options?.customMetadata } });
    return {} as R2Object;
  }
}

async function hash(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return Buffer.from(await crypto.subtle.digest("SHA-256", owned.buffer)).toString("hex");
}

test("AI Search projection copies immutable evidence with exact governed R2 metadata and resumes", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const evidence = new Bucket();
  const projection = new Bucket();
  try {
    sqlite.exec("PRAGMA foreign_keys=OFF");
    const first = new TextEncoder().encode("Первая проверенная норма");
    const second = new TextEncoder().encode("Иккинчи текширилган норма");
    const firstKey = `search-releases/${releaseId}/current/00/chunk:00first:0.json`;
    const secondKey = `search-releases/${releaseId}/current/00/chunk:ffsecond:0.json`;
    evidence.objects.set(firstKey, { bytes: first, customMetadata: {} });
    evidence.objects.set(secondKey, { bytes: second, customMetadata: {} });
    sqlite.prepare(`INSERT INTO legal_corpus_snapshots
      (id,environment,corpus_hash,member_count,status,frozen_at,created_at)
      VALUES ('snapshot:projection','staging',?,2,'frozen',?,?)`).run("a".repeat(64), now, now);
    sqlite.prepare(`INSERT INTO legal_search_releases
      (id,environment,capability,corpus_snapshot_id,status,item_count,retrieval_policy_version,
       configuration_identity,sealed_at,created_at)
      VALUES (?,'staging','current','snapshot:projection','draft',2,'policy:test','config:test',NULL,?)`)
      .run(releaseId, now);
    sqlite.prepare(`INSERT INTO legal_source_snapshot_builds
      (id,environment,cutoff_at,release_id,configuration_identity,shard_count,status,phase,
       processed_count,eligible_count,excluded_count,release_sha256,created_at,updated_at)
      VALUES ('build:projection-test','staging',?,?,?,1,'sealed','complete',2,2,0,?,?,?)`)
      .run(now, releaseId, "config:test", "c".repeat(64), now, now);
    sqlite.prepare(`INSERT INTO legal_source_snapshot_qualifications
      (build_id,release_id,recovery_sql_sha256,recovery_sqlite_sha256,validation_sha256,
       standards_review_sha256,spec_review_sha256,qualification_sha256,qualified_at)
      VALUES ('build:projection-test',?,?,?,?,?,?,?,?)`)
      .run(releaseId, ...Array(6).fill("d".repeat(64)), now);
    const insertItem = sqlite.prepare(`INSERT INTO legal_search_release_items
      (search_release_id,provision_rendition_id,canonical_chunk_id,item_key,r2_key,byte_count,sha256,
       language,document_type,valid_from,valid_to)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insertItem.run(releaseId, "rendition:first", "chunk:00first:0", firstKey, firstKey,
      first.byteLength, await hash(first), "ru", "Закон", "2024-01-01T00:00:00.000Z", null);
    insertItem.run(releaseId, "rendition:second", "chunk:ffsecond:0", secondKey, secondKey,
      second.byteLength, await hash(second), "uz-Cyrl", "Қонун",
      "2025-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z");
    sqlite.exec("PRAGMA foreign_keys=ON");

    const firstBatch = await runAiSearchProjectionBatch({
      db: d1,
      evidenceBucket: evidence,
      projectionBucket: projection,
    }, {
      buildId: "projection:test:v1",
      releaseId,
      environment: "staging",
      projectionBucketName: "juro-legal-ai-search-staging-test",
      limit: 1,
      now,
    });
    assert.deepEqual(firstBatch, { status: "building", copied: 1, totalCopied: 1, itemCount: 2 });
    assert.deepEqual(projection.objects.get(firstKey)?.customMetadata, {
      language: "ru",
      document_type: "Закон",
      valid_from: "2024-01-01T00:00:00.000Z",
    });

    const secondBatch = await runAiSearchProjectionBatch({
      db: d1,
      evidenceBucket: evidence,
      projectionBucket: projection,
    }, {
      buildId: "projection:test:v1",
      releaseId,
      environment: "staging",
      projectionBucketName: "juro-legal-ai-search-staging-test",
      limit: 10,
      now,
    });
    assert.deepEqual(secondBatch, { status: "building", copied: 1, totalCopied: 2, itemCount: 2 });
    assert.deepEqual(projection.objects.get(secondKey)?.customMetadata, {
      language: "uz-Cyrl",
      document_type: "Қонун",
      valid_from: "2025-02-01T00:00:00.000Z",
      valid_to: "2026-02-01T00:00:00.000Z",
    });

    const completed = await runAiSearchProjectionBatch({
      db: d1,
      evidenceBucket: evidence,
      projectionBucket: projection,
    }, {
      buildId: "projection:test:v1",
      releaseId,
      environment: "staging",
      projectionBucketName: "juro-legal-ai-search-staging-test",
      limit: 10,
      now,
    });
    assert.equal(completed.status, "complete");
    assert.equal(completed.totalCopied, 2);

    const replay = await runAiSearchProjectionBatch({
      db: d1,
      evidenceBucket: evidence,
      projectionBucket: projection,
    }, {
      buildId: "projection:test:v1",
      releaseId,
      environment: "staging",
      projectionBucketName: "juro-legal-ai-search-staging-test",
      limit: 10,
      now,
    });
    assert.deepEqual(replay, completed);

    const laneProjection = new Bucket();
    const laneFirst = await runAiSearchProjectionBatch({
      db: d1,
      evidenceBucket: evidence,
      projectionBucket: laneProjection,
    }, {
      buildId: "projection:test:lanes-v1",
      releaseId,
      environment: "staging",
      projectionBucketName: "juro-legal-ai-search-staging-lanes-test",
      lane: "00",
      limit: 10,
      now,
    });
    assert.deepEqual(laneFirst, {
      status: "building", lane: "00", laneComplete: false,
      copied: 1, totalCopied: 1, itemCount: 2,
    });
    const laneComplete = await runAiSearchProjectionBatch({
      db: d1,
      evidenceBucket: evidence,
      projectionBucket: laneProjection,
    }, {
      buildId: "projection:test:lanes-v1",
      releaseId,
      environment: "staging",
      projectionBucketName: "juro-legal-ai-search-staging-lanes-test",
      lane: "00",
      limit: 10,
      now,
    });
    assert.equal(laneComplete.laneComplete, true);
  } finally {
    sqlite.close();
  }
});
