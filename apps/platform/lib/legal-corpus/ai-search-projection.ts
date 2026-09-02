import { z } from "zod";

import {
  legalEnvironmentSchema,
  legalIdentifierSchema,
  searchReleaseIdSchema,
  sha256Schema,
  utcInstantSchema,
} from "./target-domain-schemas";

const inputSchema = z.object({
  buildId: legalIdentifierSchema,
  releaseId: searchReleaseIdSchema,
  environment: legalEnvironmentSchema,
  projectionBucketName: z.string().min(3).max(200),
  lane: z.string().regex(/^[a-f0-9]{2}$/u).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  now: utcInstantSchema,
}).strict();

type ProjectionBucket = {
  get(key: string): Promise<{
    size: number;
    customMetadata?: Record<string, string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options: R2PutOptions,
  ): Promise<unknown>;
};

type ProjectionItem = {
  itemKey: string;
  canonicalChunkId: string;
  evidenceR2Key: string;
  byteCount: number;
  sha256: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  documentType: string;
  validFrom: string;
  validTo: string | null;
};

type ProjectionBuild = {
  id: string;
  environment: string;
  releaseId: string;
  projectionBucketName: string;
  sourceReleaseSha256: string;
  status: "building" | "complete" | "failed";
  cursor: string | null;
  expectedItemCount: number;
  copiedItemCount: number;
  projectionSha256: string | null;
};

const metadataSchema = z.object({
  language: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  document_type: z.string().min(1).max(300),
  valid_from: utcInstantSchema,
  valid_to: utcInstantSchema.optional(),
}).strict();

async function sha256(bytes: Uint8Array | string): Promise<string> {
  const value = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const owned = new Uint8Array(value.byteLength);
  owned.set(value);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

function stable(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))));
}

function itemMetadata(item: ProjectionItem): z.infer<typeof metadataSchema> {
  return metadataSchema.parse({
    language: item.language,
    document_type: item.documentType,
    valid_from: item.validFrom,
    ...(item.validTo ? { valid_to: item.validTo } : {}),
  });
}

async function verifiedBytes(
  bucket: ProjectionBucket,
  key: string,
  byteCount: number,
  expectedSha256: string,
): Promise<Uint8Array> {
  const object = await bucket.get(key);
  if (!object || object.size !== byteCount) throw new Error("AI_SEARCH_PROJECTION_SOURCE_UNAVAILABLE");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256(bytes) !== expectedSha256) throw new Error("AI_SEARCH_PROJECTION_SOURCE_INTEGRITY_FAILED");
  return bytes;
}

async function copyItem(
  evidenceBucket: ProjectionBucket,
  projectionBucket: ProjectionBucket,
  item: ProjectionItem,
): Promise<string> {
  const expectedMetadata = itemMetadata(item);
  const existing = await projectionBucket.get(item.itemKey);
  if (existing) {
    const bytes = new Uint8Array(await existing.arrayBuffer());
    if (existing.size !== item.byteCount || await sha256(bytes) !== item.sha256
      || stable(existing.customMetadata ?? {}) !== stable(expectedMetadata)) {
      throw new Error("AI_SEARCH_PROJECTION_EXISTING_OBJECT_MISMATCH");
    }
    return stable(expectedMetadata);
  }
  const bytes = await verifiedBytes(evidenceBucket, item.evidenceR2Key, item.byteCount, item.sha256);
  await projectionBucket.put(item.itemKey, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: expectedMetadata,
  });
  const readback = await projectionBucket.get(item.itemKey);
  if (!readback || readback.size !== item.byteCount
    || stable(readback.customMetadata ?? {}) !== stable(expectedMetadata)
    || await sha256(new Uint8Array(await readback.arrayBuffer())) !== item.sha256) {
    throw new Error("AI_SEARCH_PROJECTION_WRITE_VERIFICATION_FAILED");
  }
  return stable(expectedMetadata);
}

function loadBuild(db: D1Database, buildId: string) {
  return db.prepare(`SELECT id,environment,search_release_id AS releaseId,
      projection_bucket_name AS projectionBucketName,source_release_sha256 AS sourceReleaseSha256,
      status,cursor,expected_item_count AS expectedItemCount,copied_item_count AS copiedItemCount,
      projection_sha256 AS projectionSha256
    FROM legal_ai_search_projection_builds WHERE id=?`).bind(buildId).first<ProjectionBuild>();
}

export type AiSearchProjectionBatchResult = {
  status: "building" | "complete";
  copied: number;
  totalCopied: number;
  itemCount: number;
  projectionSha256?: string;
  lane?: string;
  laneComplete?: boolean;
  laneRequired?: boolean;
};

export const AI_SEARCH_PROJECTION_ROOT = "/internal/legal-corpus/ai-search-projection/";
const ADVANCE_PATH = `${AI_SEARCH_PROJECTION_ROOT}advance`;
const STAGING_BUILD_ID = "projection:staging:current:source-snapshot-v1";
const STAGING_RELEASE_ID = "release:staging:current:source-snapshot-v1";
const STAGING_BUCKET_NAME = "juro-legal-ai-search-staging-20260902";

/** Copies one bounded, restartable batch into the provider-only R2 data source. */
export async function runAiSearchProjectionBatch(
  dependencies: {
    db: D1Database;
    evidenceBucket: ProjectionBucket;
    projectionBucket: ProjectionBucket;
  },
  rawInput: z.input<typeof inputSchema>,
): Promise<AiSearchProjectionBatchResult> {
  const input = inputSchema.parse(rawInput);
  const release = await dependencies.db.prepare(`SELECT environment,status,item_count AS itemCount,
      configuration_identity AS configurationIdentity
    FROM legal_search_releases WHERE id=? AND capability='current'`).bind(input.releaseId)
    .first<{ environment: string; status: string; itemCount: number; configurationIdentity: string }>();
  const qualified = await dependencies.db.prepare(`SELECT build.release_sha256 AS releaseSha256
    FROM legal_source_snapshot_qualifications qualification
    JOIN legal_source_snapshot_builds build ON build.id=qualification.build_id
      AND build.release_id=qualification.release_id AND build.status='sealed' AND build.phase='complete'
    WHERE qualification.release_id=? ORDER BY qualification.qualified_at DESC LIMIT 1`)
    .bind(input.releaseId).first<{ releaseSha256: string }>();
  if (!release || release.environment !== input.environment
    || !["draft", "sealed"].includes(release.status)
    || !qualified || !sha256Schema.safeParse(qualified.releaseSha256).success) {
    throw new TypeError("AI_SEARCH_PROJECTION_RELEASE_NOT_QUALIFIED");
  }
  await dependencies.db.prepare(`INSERT OR IGNORE INTO legal_ai_search_projection_builds
    (id,environment,search_release_id,projection_bucket_name,source_release_sha256,status,cursor,
     expected_item_count,copied_item_count,projection_sha256,created_at,updated_at,completed_at)
    VALUES (?,?,?,?,?,'building',NULL,?,0,NULL,?,?,NULL)`).bind(
    input.buildId,
    input.environment,
    input.releaseId,
    input.projectionBucketName,
    qualified.releaseSha256,
    release.itemCount,
    input.now,
    input.now,
  ).run();
  const build = await loadBuild(dependencies.db, input.buildId);
  if (!build || build.environment !== input.environment || build.releaseId !== input.releaseId
    || build.projectionBucketName !== input.projectionBucketName
    || build.sourceReleaseSha256 !== qualified.releaseSha256
    || build.expectedItemCount !== release.itemCount) {
    throw new TypeError("AI_SEARCH_PROJECTION_BUILD_IDENTITY_MISMATCH");
  }
  if (build.status === "complete") {
    return {
      status: "complete",
      copied: 0,
      totalCopied: build.copiedItemCount,
      itemCount: build.expectedItemCount,
      projectionSha256: sha256Schema.parse(build.projectionSha256),
    };
  }
  if (build.status !== "building") throw new TypeError("AI_SEARCH_PROJECTION_BUILD_NOT_WRITABLE");
  const checkpoint = input.lane
    ? await dependencies.db.prepare(`SELECT status,cursor,copied_item_count AS copiedItemCount
      FROM legal_ai_search_projection_checkpoints WHERE build_id=? AND lane=?`)
      .bind(input.buildId, input.lane).first<{
        status: "building" | "complete"; cursor: string | null; copiedItemCount: number;
      }>()
    : null;
  if (input.lane && !checkpoint) {
    await dependencies.db.prepare(`INSERT INTO legal_ai_search_projection_checkpoints
      (build_id,lane,status,cursor,copied_item_count,updated_at,completed_at)
      VALUES (?,?,'building',NULL,0,?,NULL)`).bind(input.buildId, input.lane, input.now).run();
  }
  const activeCursor = input.lane ? checkpoint?.cursor ?? null : build.cursor;
  if (input.lane && checkpoint?.status === "complete") {
    return {
      status: "building", lane: input.lane, laneComplete: true, copied: 0,
      totalCopied: build.copiedItemCount, itemCount: build.expectedItemCount,
    };
  }
  const laneCheckpoints = !input.lane
    ? await dependencies.db.prepare(`SELECT count(*) AS laneCount,
        sum(CASE WHEN status='complete' THEN 1 ELSE 0 END) AS completeCount
      FROM legal_ai_search_projection_checkpoints WHERE build_id=?`).bind(input.buildId)
      .first<{ laneCount: number; completeCount: number }>()
    : null;
  const laneMode = Number(laneCheckpoints?.laneCount ?? 0) > 0;
  if (laneMode
    && (Number(laneCheckpoints?.laneCount) !== 256 || Number(laneCheckpoints?.completeCount) !== 256)) {
    return {
      status: "building", copied: 0, totalCopied: build.copiedItemCount,
      itemCount: build.expectedItemCount, laneRequired: true,
    };
  }
  const result = laneMode
    ? { results: [] as ProjectionItem[] }
    : input.lane && activeCursor
    ? await dependencies.db.prepare(`SELECT item_key AS itemKey,canonical_chunk_id AS canonicalChunkId,
        r2_key AS evidenceR2Key,byte_count AS byteCount,sha256,language,
        document_type AS documentType,valid_from AS validFrom,valid_to AS validTo
      FROM legal_search_release_items WHERE search_release_id=?
        AND substr(canonical_chunk_id,7,2)=? AND item_key>?
      ORDER BY item_key LIMIT ?`).bind(
        input.releaseId, input.lane, activeCursor, input.limit,
      ).all<ProjectionItem>()
    : input.lane
    ? await dependencies.db.prepare(`SELECT item_key AS itemKey,canonical_chunk_id AS canonicalChunkId,
        r2_key AS evidenceR2Key,byte_count AS byteCount,sha256,language,
        document_type AS documentType,valid_from AS validFrom,valid_to AS validTo
      FROM legal_search_release_items WHERE search_release_id=?
        AND substr(canonical_chunk_id,7,2)=?
      ORDER BY item_key LIMIT ?`).bind(input.releaseId, input.lane, input.limit).all<ProjectionItem>()
    : activeCursor
    ? await dependencies.db.prepare(`SELECT item_key AS itemKey,canonical_chunk_id AS canonicalChunkId,
        r2_key AS evidenceR2Key,byte_count AS byteCount,sha256,language,
        document_type AS documentType,valid_from AS validFrom,valid_to AS validTo
      FROM legal_search_release_items WHERE search_release_id=? AND item_key>?
      ORDER BY item_key LIMIT ?`).bind(input.releaseId, activeCursor, input.limit).all<ProjectionItem>()
    : await dependencies.db.prepare(`SELECT item_key AS itemKey,canonical_chunk_id AS canonicalChunkId,
        r2_key AS evidenceR2Key,byte_count AS byteCount,sha256,language,
        document_type AS documentType,valid_from AS validFrom,valid_to AS validTo
      FROM legal_search_release_items WHERE search_release_id=?
      ORDER BY item_key LIMIT ?`).bind(input.releaseId, input.limit).all<ProjectionItem>();
  if (result.results.length > 0) {
    const metadata = await Promise.all(result.results.map((item) =>
      copyItem(dependencies.evidenceBucket, dependencies.projectionBucket, item)));
    const copiedAt = input.now;
    await dependencies.db.batch([
      ...result.results.map((item, index) => dependencies.db.prepare(`INSERT OR IGNORE INTO
        legal_ai_search_projection_items
        (build_id,search_release_id,item_key,canonical_chunk_id,evidence_r2_key,byte_count,sha256,
         metadata_json,copied_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
        input.buildId, input.releaseId, item.itemKey, item.canonicalChunkId, item.evidenceR2Key,
        item.byteCount, item.sha256, metadata[index], copiedAt,
      )),
      dependencies.db.prepare(`UPDATE legal_ai_search_projection_builds SET cursor=?,
        copied_item_count=(SELECT count(*) FROM legal_ai_search_projection_items WHERE build_id=?),
        updated_at=? WHERE id=? AND status='building'`).bind(
        input.lane ? build.cursor : result.results.at(-1)!.itemKey,
        input.buildId, input.now, input.buildId,
      ),
      ...(input.lane ? [dependencies.db.prepare(`UPDATE legal_ai_search_projection_checkpoints
        SET cursor=?,copied_item_count=(SELECT count(*)
          FROM legal_ai_search_projection_items WHERE build_id=?
            AND substr(canonical_chunk_id,7,2)=?),updated_at=?
        WHERE build_id=? AND lane=? AND status='building'`).bind(
        result.results.at(-1)!.itemKey, input.buildId, input.lane, input.now,
        input.buildId, input.lane,
      )] : []),
    ]);
    const updated = await loadBuild(dependencies.db, input.buildId);
    return {
      status: "building",
      copied: result.results.length,
      totalCopied: updated?.copiedItemCount ?? build.copiedItemCount + result.results.length,
      itemCount: build.expectedItemCount,
      ...(input.lane ? { lane: input.lane, laneComplete: false } : {}),
    };
  }
  if (input.lane) {
    await dependencies.db.prepare(`UPDATE legal_ai_search_projection_checkpoints
      SET status='complete',completed_at=?,updated_at=?
      WHERE build_id=? AND lane=? AND status='building'`).bind(
      input.now, input.now, input.buildId, input.lane,
    ).run();
    const updated = await loadBuild(dependencies.db, input.buildId);
    return {
      status: "building", lane: input.lane, laneComplete: true, copied: 0,
      totalCopied: updated?.copiedItemCount ?? build.copiedItemCount,
      itemCount: build.expectedItemCount,
    };
  }
  const reconciliation = await dependencies.db.prepare(`SELECT
      (SELECT count(*) FROM legal_ai_search_projection_items WHERE build_id=?) AS copied,
      (SELECT count(*) FROM legal_search_release_items source
        LEFT JOIN legal_ai_search_projection_items target ON target.build_id=?
          AND target.item_key=source.item_key AND target.canonical_chunk_id=source.canonical_chunk_id
          AND target.byte_count=source.byte_count AND target.sha256=source.sha256
        WHERE source.search_release_id=? AND target.item_key IS NULL) AS missing`)
    .bind(input.buildId, input.buildId, input.releaseId)
    .first<{ copied: number; missing: number }>();
  if (!reconciliation || reconciliation.copied !== build.expectedItemCount
    || reconciliation.missing !== 0) {
    throw new Error("AI_SEARCH_PROJECTION_RECONCILIATION_FAILED");
  }
  const projectionSha256 = await sha256(JSON.stringify({
    schemaVersion: 1,
    releaseId: input.releaseId,
    sourceReleaseSha256: build.sourceReleaseSha256,
    projectionBucketName: input.projectionBucketName,
    itemCount: build.expectedItemCount,
    metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
  }));
  await dependencies.db.prepare(`UPDATE legal_ai_search_projection_builds SET status='complete',
    projection_sha256=?,copied_item_count=?,updated_at=?,completed_at=?
    WHERE id=? AND status='building'`).bind(
    projectionSha256, build.expectedItemCount, input.now, input.now, input.buildId,
  ).run();
  return {
    status: "complete",
    copied: 0,
    totalCopied: build.expectedItemCount,
    itemCount: build.expectedItemCount,
    projectionSha256,
  };
}

export type AiSearchProjectionEnv = {
  APP_ENV: "development" | "staging" | "production";
  LEGAL_DB?: D1Database;
  LEGAL_EVIDENCE_BUCKET?: ProjectionBucket;
  LEGAL_AI_SEARCH_SOURCE_BUCKET?: ProjectionBucket;
  LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME?: string;
};

export function isAiSearchProjectionPath(pathname: string): boolean {
  return pathname === ADVANCE_PATH;
}

/** Private service-binding endpoint used only by the bounded projection driver. */
export async function handleAiSearchProjectionRequest(
  request: Request,
  env: AiSearchProjectionEnv,
): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== ADVANCE_PATH) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (env.APP_ENV !== "staging" || !env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || !env.LEGAL_AI_SEARCH_SOURCE_BUCKET
    || env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME !== STAGING_BUCKET_NAME) {
    return Response.json({ code: "AI_SEARCH_PROJECTION_TARGET_REJECTED" }, { status: 503 });
  }
  try {
    const body = z.object({
      buildId: z.literal(STAGING_BUILD_ID).default(STAGING_BUILD_ID),
      limit: z.number().int().min(1).max(100).default(100),
      lane: z.string().regex(/^[a-f0-9]{2}$/u).optional(),
    }).strict().parse(await request.json());
    const result = await runAiSearchProjectionBatch({
      db: env.LEGAL_DB,
      evidenceBucket: env.LEGAL_EVIDENCE_BUCKET,
      projectionBucket: env.LEGAL_AI_SEARCH_SOURCE_BUCKET,
    }, {
      buildId: body.buildId,
      releaseId: STAGING_RELEASE_ID,
      environment: "staging",
      projectionBucketName: STAGING_BUCKET_NAME,
      lane: body.lane,
      limit: body.limit,
      now: new Date().toISOString(),
    });
    return Response.json({ result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const safeCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/u.test(error.message)
      ? error.message : "AI_SEARCH_PROJECTION_FAILED";
    console.error(JSON.stringify({
      event: "legal_ai_search.projection_failed",
      code: safeCode,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    }));
    return Response.json({ code: safeCode }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
