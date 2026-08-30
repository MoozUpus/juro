import {
  OpenAiLegalCorpusEmbeddingProvider,
  type LegalCorpusEmbeddingEnv,
  type LegalCorpusEmbeddingProvider,
} from "./embeddings";
import {
  encodeQdrantSparseTerms,
  encodeQdrantSparseQuery,
  qdrantPointId,
  QdrantLegalCorpusClient,
  type QdrantCorpusEnv,
  type QdrantCorpusPoint,
} from "./qdrant";
import {
  ensureLegalCorpusQdrantAvailable,
  type LegalCorpusQdrantSnapshotEnv,
} from "./qdrant-snapshots";
import { featureEnabled, type LegalCorpusFeatureFlag, type LegalCorpusLanguage } from "./trust";
import {
  loadSparseTermEntriesByChunk,
  type SparseTermEntry,
} from "./sparse-index";

const BATCH_SIZE = 64;
const BUILD_EMBEDDING_CONCURRENCY = 1;
const RECONCILE_EMBEDDING_CONCURRENCY = 1;
// Keep recovery below the staging embedding token-rate ceiling. A collection
// rebuild is operational work, so steady progress is preferable to a burst
// that trips the durable provider circuit and stalls every legal request.
const RECONCILE_EMBEDDING_PACE_MS = 1_000;
const MAX_VERSION_SYNC_CHUNKS = 16_000;
export const LEGAL_CORPUS_QDRANT_BACKFILL_CHUNKS_PER_BATCH = 64;

type IndexEnv = LegalCorpusEmbeddingEnv & QdrantCorpusEnv & LegalCorpusQdrantSnapshotEnv
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

type VersionRow = {
  versionId: string;
  previousVersionId: string | null;
  isCurrent: number;
};

type ChunkRow = {
  chunkId: string;
  provisionId: string;
  documentId: string;
  documentTitle: string;
  documentType: string | null;
  variantId: string;
  versionId: string;
  language: LegalCorpusLanguage;
  status: "active" | "repealed" | "historical" | "unknown";
  articleNumber: string | null;
  articleTitle: string | null;
  contentText: string;
};

function denseEmbeddingText(row: ChunkRow): string {
  return [
    `ACT: ${row.documentTitle}`,
    row.documentType ? `DOCUMENT TYPE: ${row.documentType}` : "",
    `ARTICLE: ${[row.articleNumber, row.articleTitle].filter(Boolean).join(" — ")}`,
    `LANGUAGE: ${row.language}`,
    `PROVISION TEXT:\n${row.contentText}`,
  ].filter(Boolean).join("\n");
}

async function buildQdrantPoints(
  db: D1Database,
  batch: readonly ChunkRow[],
  embeddings: LegalCorpusEmbeddingProvider,
): Promise<QdrantCorpusPoint[]> {
  const sparseEntries = await loadSparseTermEntriesByChunk(db, batch.map((row) => row.chunkId));
  const vectors = await embeddings.embed(
    batch.map(denseEmbeddingText),
    { feature: "legal_corpus_indexing" },
  );
  if (vectors.length !== batch.length) {
    throw new TypeError("LEGAL_CORPUS_DENSE_VECTOR_REJECTED");
  }
  return Promise.all(batch.map(async (row, index): Promise<QdrantCorpusPoint> => ({
    id: await qdrantPointId(row.chunkId),
    chunkId: row.chunkId,
    provisionId: row.provisionId,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    articleTitle: row.articleTitle,
    variantId: row.variantId,
    versionId: row.versionId,
    language: row.language,
    status: row.status,
    isCurrent: true,
    articleNumber: row.articleNumber,
    dense: vectors[index]!,
    sparse: await encodeQdrantSparseTerms(sparseWeights(sparseEntries.get(row.chunkId) ?? [])),
  })));
}

export type LegalCorpusQdrantSyncResult = {
  status: "disabled" | "indexed";
  versionId: string;
  chunkCount: number;
};

export type LegalCorpusQdrantBackfillResult = {
  status: "disabled" | "empty" | "indexed";
  versionId: string | null;
  chunkCount: number;
  remainingChunkCount: number;
};

export type LegalSearchIndexBuildBatchResult = {
  status: "indexed" | "complete";
  manifestId: string;
  chunkCount: number;
  indexedChunkCount: number;
  remainingChunkCount: number;
};

export type LegalSearchIndexReconcileBatchResult = {
  status: "scanned" | "complete";
  manifestId: string;
  scannedChunkCount: number;
  repairedChunkCount: number;
  lastChunkId: string | null;
};

type QdrantSyncDependencies = {
  client?: Pick<QdrantLegalCorpusClient, "ensureCompatible" | "setVersionCurrent" | "upsert">;
  embeddings?: LegalCorpusEmbeddingProvider;
  now?: Date;
};

type SearchIndexBuildDependencies = {
  client?: Pick<QdrantLegalCorpusClient,
  "ensureCompatible" | "ensureSearchPayloadIndexes" | "upsert">;
  embeddings?: LegalCorpusEmbeddingProvider;
  now?: Date;
  maxChunks?: number;
};

type SearchIndexReconcileDependencies = {
  client?: Pick<QdrantLegalCorpusClient, "ensureCompatible" | "existingPointIds" | "upsert">;
  embeddings?: LegalCorpusEmbeddingProvider;
  wait?: (delayMs: number) => Promise<void>;
};

type QdrantSyncOptions = QdrantSyncDependencies & {
  /** Resume a previously interrupted backfill without re-embedding chunks
   * whose deterministic Qdrant point IDs were already persisted in D1. */
  onlyMissing?: boolean;
  /** Keeps one scheduled invocation inside a bounded provider and memory
   * envelope. Full per-version sync remains the default for direct callers. */
  maxChunks?: number;
};

function sparseWeights(entries: readonly SparseTermEntry[]): Array<{ term: string; weight: number }> {
  if (entries.length === 0 || entries.length > 512) {
    throw new TypeError("LEGAL_CORPUS_SPARSE_VECTOR_REJECTED");
  }
  return entries.map((entry) => ({
    term: String(entry.term ?? ""),
    weight: Number(entry.termFrequency ?? 0)
      + Number(entry.titleFrequency ?? 0) * 4
      + Number(entry.articleFrequency ?? 0) * 8,
  }));
}

export async function syncLegalCorpusVersionToQdrant(
  env: IndexEnv,
  versionId: string,
  options: QdrantSyncOptions = {},
): Promise<LegalCorpusQdrantSyncResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")) {
    return { status: "disabled", versionId, chunkCount: 0 };
  }
  if (!/^[A-Za-z0-9:_-]{1,240}$/u.test(versionId)) {
    throw new TypeError("LEGAL_CORPUS_VERSION_ID_REJECTED");
  }
  const version = await env.DB.prepare(`
    SELECT version.id AS versionId,version.previous_version_id AS previousVersionId,
      CASE WHEN variant.current_version_id=version.id THEN 1 ELSE 0 END AS isCurrent
    FROM legal_corpus_versions AS version
    INNER JOIN legal_corpus_variants AS variant ON variant.id=version.variant_id
    WHERE version.id=? LIMIT 1
  `).bind(versionId).first<VersionRow>();
  if (!version) throw new TypeError("LEGAL_CORPUS_VERSION_NOT_FOUND");

  const client = options.client ?? new QdrantLegalCorpusClient(env);
  const embeddings = options.embeddings ?? new OpenAiLegalCorpusEmbeddingProvider(env);
  if (options.client) await client.ensureCompatible();
  else await ensureLegalCorpusQdrantAvailable(env, {
    client: client as QdrantLegalCorpusClient,
  });
  if (version.isCurrent === 1 && version.previousVersionId) {
    await client.setVersionCurrent(version.previousVersionId, false);
  }

  const maxChunks = Math.max(1, Math.min(
    options.maxChunks ?? MAX_VERSION_SYNC_CHUNKS,
    MAX_VERSION_SYNC_CHUNKS,
  ));
  const onlyMissingClause = options.onlyMissing ? "AND chunk.dense_vector_id IS NULL" : "";
  const rows = await env.DB.prepare(`
    SELECT chunk.id AS chunkId,provision.id AS provisionId,
      document.id AS documentId,coalesce(variant.title,document.title) AS documentTitle,
      document.document_type AS documentType,variant.id AS variantId,
      version.id AS versionId,provision.language AS language,provision.status,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      chunk.content_text AS contentText
    FROM legal_corpus_chunks AS chunk
    INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
    INNER JOIN legal_corpus_versions AS version ON version.id=chunk.version_id
    INNER JOIN legal_corpus_variants AS variant ON variant.id=version.variant_id
    INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
    WHERE chunk.version_id=? AND document.provider IN ('lex_uz','juro_owner')
      AND document.scope='global' AND document.availability_status='ready'
      ${onlyMissingClause}
    ORDER BY chunk.id ASC
    LIMIT ?
  `).bind(versionId, maxChunks).all<ChunkRow>();
  const indexedAt = (options.now ?? new Date()).toISOString();
  let chunkCount = 0;
  for (let start = 0; start < rows.results.length; start += BATCH_SIZE) {
    const batch = rows.results.slice(start, start + BATCH_SIZE);
    const sparseEntries = await loadSparseTermEntriesByChunk(
      env.DB,
      batch.map((row) => row.chunkId),
    );
    const vectors = await embeddings.embed(
      batch.map(denseEmbeddingText),
      { feature: "legal_corpus_indexing" },
    );
    if (vectors.length !== batch.length) throw new TypeError("LEGAL_CORPUS_DENSE_VECTOR_REJECTED");
    const points: QdrantCorpusPoint[] = await Promise.all(batch.map(async (row, index) => ({
      id: await qdrantPointId(row.chunkId),
      chunkId: row.chunkId,
      provisionId: row.provisionId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      articleTitle: row.articleTitle,
      variantId: row.variantId,
      versionId: row.versionId,
      language: row.language,
      status: row.status,
      isCurrent: version.isCurrent === 1,
      articleNumber: row.articleNumber,
      dense: vectors[index]!,
      sparse: await encodeQdrantSparseTerms(sparseWeights(sparseEntries.get(row.chunkId) ?? [])),
    })));
    await client.upsert(points);
    await env.DB.batch(await Promise.all(points.map(async (point) => env.DB.prepare(`
      UPDATE legal_corpus_chunks SET dense_vector_id=?,indexed_at=?
      WHERE id=? AND version_id=?
    `).bind(point.id, indexedAt, point.chunkId, versionId))));
    chunkCount += batch.length;
  }
  return { status: "indexed", versionId, chunkCount };
}

type SearchIndexBuildRow = {
  environment: "development" | "staging" | "production";
  qdrantCollection: string;
  embeddingModel: string;
  chunkCount: number | string;
  indexedChunkCount: number | string;
  lastChunkId: string | null;
  status: "building" | "complete" | "finalized" | "failed";
};

/**
 * Advances one frozen, off-to-the-side search release. Progress belongs to the
 * build, never to `legal_corpus_chunks.dense_vector_id`, so a new collection
 * cannot inherit or overwrite the active collection's resume ledger.
 */
export async function runNextLegalSearchIndexBuildBatch(
  env: IndexEnv,
  manifestId: string,
  options: SearchIndexBuildDependencies = {},
): Promise<LegalSearchIndexBuildBatchResult> {
  if (!/^[A-Za-z0-9:_-]{1,160}$/u.test(manifestId)) {
    throw new TypeError("LEGAL_SEARCH_MANIFEST_REJECTED");
  }
  if (!featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")) {
    throw new TypeError("LEGAL_SEARCH_BUILD_DENSE_DISABLED");
  }
  const build = await env.DB.prepare(`SELECT environment,
    qdrant_collection AS qdrantCollection,embedding_model AS embeddingModel,
    chunk_count AS chunkCount,indexed_chunk_count AS indexedChunkCount,
    last_chunk_id AS lastChunkId,status
    FROM legal_corpus_search_index_builds WHERE id=? LIMIT 1`)
    .bind(manifestId).first<SearchIndexBuildRow>();
  if (!build || build.environment !== env.APP_ENV) {
    throw new TypeError("LEGAL_SEARCH_BUILD_NOT_FOUND");
  }
  const total = Number(build.chunkCount);
  const indexed = Number(build.indexedChunkCount);
  if (build.status === "complete" || build.status === "finalized") {
    return {
      status: "complete",
      manifestId,
      chunkCount: 0,
      indexedChunkCount: indexed,
      remainingChunkCount: Math.max(0, total - indexed),
    };
  }
  if (build.status !== "building") throw new TypeError("LEGAL_SEARCH_BUILD_NOT_BUILDING");

  const maxChunks = Math.max(1, Math.min(options.maxChunks ?? 256, 256));
  const rows = await env.DB.prepare(`
    SELECT chunk.id AS chunkId,provision.id AS provisionId,
      document.id AS documentId,coalesce(variant.title,document.title) AS documentTitle,
      document.document_type AS documentType,variant.id AS variantId,
      version.id AS versionId,provision.language AS language,provision.status,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      chunk.content_text AS contentText
    FROM legal_corpus_search_index_build_versions build_version
    INNER JOIN legal_corpus_versions version ON version.id=build_version.version_id
    INNER JOIN legal_corpus_variants variant ON variant.id=build_version.variant_id
      AND variant.id=version.variant_id
    INNER JOIN legal_corpus_documents document ON document.id=variant.document_id
    INNER JOIN legal_corpus_chunks chunk ON chunk.version_id=version.id
    INNER JOIN legal_corpus_provisions provision ON provision.id=chunk.provision_id
    WHERE build_version.build_id=? AND chunk.id>?
    ORDER BY chunk.id ASC LIMIT ?
  `).bind(manifestId, build.lastChunkId ?? "", maxChunks).all<ChunkRow>();
  if (rows.results.length === 0) {
    if (indexed !== total) throw new TypeError("LEGAL_SEARCH_BUILD_CURSOR_MISMATCH");
    await env.DB.prepare(`UPDATE legal_corpus_search_index_builds
      SET status='complete',updated_at=? WHERE id=? AND status='building'
      AND indexed_chunk_count=chunk_count`).bind(
      (options.now ?? new Date()).toISOString(), manifestId,
    ).run();
    return {
      status: "complete", manifestId, chunkCount: 0,
      indexedChunkCount: indexed, remainingChunkCount: 0,
    };
  }

  const buildEnv: IndexEnv = {
    ...env,
    QDRANT_COLLECTION: build.qdrantCollection,
    EMBEDDING_MODEL: build.embeddingModel,
  };
  const client = options.client ?? new QdrantLegalCorpusClient(buildEnv);
  const embeddings = options.embeddings ?? new OpenAiLegalCorpusEmbeddingProvider(buildEnv);
  await client.ensureCompatible();
  if (indexed === 0) await client.ensureSearchPayloadIndexes();
  const batches = Array.from(
    { length: Math.ceil(rows.results.length / BATCH_SIZE) },
    (_, index) => rows.results.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );
  let written = 0;
  for (let start = 0; start < batches.length; start += BUILD_EMBEDDING_CONCURRENCY) {
    const batchGroup = batches.slice(start, start + BUILD_EMBEDDING_CONCURRENCY);
    // Build requests use one provider call at a time. A 64-input batch halves
    // audit-row growth without exceeding the bounded relay contract, and the
    // upsert remains idempotent if this cursor must be replayed.
    const pointGroups = await Promise.all(batchGroup.map((batch) =>
      buildQdrantPoints(env.DB, batch, embeddings)));
    await Promise.all(pointGroups.map((points) => client.upsert(points)));
    written += pointGroups.reduce((count, points) => count + points.length, 0);
  }

  const nextIndexed = indexed + written;
  if (nextIndexed > total) throw new TypeError("LEGAL_SEARCH_BUILD_COUNT_MISMATCH");
  const completed = nextIndexed === total;
  const updated = await env.DB.prepare(`UPDATE legal_corpus_search_index_builds
    SET indexed_chunk_count=?,last_chunk_id=?,status=?,updated_at=?,error_code=NULL
    WHERE id=? AND status='building' AND indexed_chunk_count=?
      AND COALESCE(last_chunk_id,'')=?`).bind(
    nextIndexed,
    rows.results.at(-1)!.chunkId,
    completed ? "complete" : "building",
    (options.now ?? new Date()).toISOString(),
    manifestId,
    indexed,
    build.lastChunkId ?? "",
  ).run();
  if (Number(updated.meta?.changes ?? 0) !== 1) {
    throw new TypeError("LEGAL_SEARCH_BUILD_CONCURRENT_ADVANCE");
  }
  return {
    status: completed ? "complete" : "indexed",
    manifestId,
    chunkCount: written,
    indexedChunkCount: nextIndexed,
    remainingChunkCount: total - nextIndexed,
  };
}

/**
 * Reconciles a completed build against Qdrant without trusting the mutable
 * cursor ledger. Container restarts can restore the last durable snapshot and
 * lose a contiguous tail of otherwise acknowledged upserts; deterministic
 * point IDs let this scan re-embed only genuinely missing frozen chunks.
 */
export async function reconcileLegalSearchIndexBuildBatch(
  env: IndexEnv,
  manifestId: string,
  afterChunkId = "",
  maxChunks = 256,
  options: SearchIndexReconcileDependencies = {},
): Promise<LegalSearchIndexReconcileBatchResult> {
  if (
    !/^[A-Za-z0-9:_-]{1,160}$/u.test(manifestId)
    || (afterChunkId && !/^[A-Za-z0-9:_-]{1,200}$/u.test(afterChunkId))
  ) throw new TypeError("LEGAL_SEARCH_MANIFEST_REJECTED");
  const build = await env.DB.prepare(`SELECT environment,
    qdrant_collection AS qdrantCollection,embedding_model AS embeddingModel,
    chunk_count AS chunkCount,indexed_chunk_count AS indexedChunkCount,
    last_chunk_id AS lastChunkId,status
    FROM legal_corpus_search_index_builds WHERE id=? LIMIT 1`)
    .bind(manifestId).first<SearchIndexBuildRow>();
  if (!build || build.environment !== env.APP_ENV) {
    throw new TypeError("LEGAL_SEARCH_BUILD_NOT_FOUND");
  }
  if (
    !["complete", "finalized"].includes(build.status)
    || Number(build.indexedChunkCount) !== Number(build.chunkCount)
  ) {
    throw new TypeError("LEGAL_SEARCH_BUILD_NOT_COMPLETE");
  }
  const limit = Math.max(1, Math.min(maxChunks, 256));
  const rows = await env.DB.prepare(`
    SELECT chunk.id AS chunkId,provision.id AS provisionId,
      document.id AS documentId,coalesce(variant.title,document.title) AS documentTitle,
      document.document_type AS documentType,variant.id AS variantId,
      version.id AS versionId,provision.language AS language,provision.status,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      chunk.content_text AS contentText
    FROM legal_corpus_search_index_build_versions build_version
    INNER JOIN legal_corpus_versions version ON version.id=build_version.version_id
    INNER JOIN legal_corpus_variants variant ON variant.id=build_version.variant_id
      AND variant.id=version.variant_id
    INNER JOIN legal_corpus_documents document ON document.id=variant.document_id
    INNER JOIN legal_corpus_chunks chunk ON chunk.version_id=version.id
    INNER JOIN legal_corpus_provisions provision ON provision.id=chunk.provision_id
    WHERE build_version.build_id=? AND chunk.id>?
    ORDER BY chunk.id ASC LIMIT ?
  `).bind(manifestId, afterChunkId, limit).all<ChunkRow>();
  if (rows.results.length === 0) {
    return {
      status: "complete",
      manifestId,
      scannedChunkCount: 0,
      repairedChunkCount: 0,
      lastChunkId: afterChunkId || null,
    };
  }

  const buildEnv: IndexEnv = {
    ...env,
    QDRANT_COLLECTION: build.qdrantCollection,
    EMBEDDING_MODEL: build.embeddingModel,
  };
  const client = options.client ?? new QdrantLegalCorpusClient(buildEnv);
  // A finalized manifest is immutable, but its ephemeral Qdrant collection is
  // not. Recreate the compatible empty collection after container loss, then
  // use deterministic point IDs to repair exactly the missing frozen chunks.
  await client.ensureCompatible();
  const pointIds = await Promise.all(rows.results.map((row) => qdrantPointId(row.chunkId)));
  const existing = await client.existingPointIds(pointIds);
  const missing = rows.results.filter((_row, index) => !existing.has(pointIds[index]!));
  const embeddings = options.embeddings ?? new OpenAiLegalCorpusEmbeddingProvider(buildEnv);
  const missingBatches = Array.from(
    { length: Math.ceil(missing.length / BATCH_SIZE) },
    (_, index) => missing.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );
  for (let start = 0; start < missingBatches.length; start += RECONCILE_EMBEDDING_CONCURRENCY) {
    const group = missingBatches.slice(start, start + RECONCILE_EMBEDDING_CONCURRENCY);
    const points = await Promise.all(group.map((batch) =>
      buildQdrantPoints(env.DB, batch, embeddings)));
    await Promise.all(points.map((batch) => client.upsert(batch)));
    if (start + RECONCILE_EMBEDDING_CONCURRENCY < missingBatches.length) {
      await (options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))))(
        RECONCILE_EMBEDDING_PACE_MS,
      );
    }
  }
  return {
    status: rows.results.length < limit ? "complete" : "scanned",
    manifestId,
    scannedChunkCount: rows.results.length,
    repairedChunkCount: missing.length,
    lastChunkId: rows.results.at(-1)!.chunkId,
  };
}

/**
 * Finds the oldest current global corpus version with missing dense points and
 * advances it by one bounded batch. D1's persisted deterministic point IDs are
 * the resume cursor: a Worker restart can safely retry the same upsert without
 * reprocessing completed chunks, while a Qdrant snapshot restore remains the
 * authoritative way to recover a lost collection.
 */
export async function runNextLegalCorpusQdrantBackfillBatch(
  env: IndexEnv,
  options: QdrantSyncDependencies & { maxChunks?: number } = {},
): Promise<LegalCorpusQdrantBackfillResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")) {
    return {
      status: "disabled",
      versionId: null,
      chunkCount: 0,
      remainingChunkCount: 0,
    };
  }
  const candidate = await env.DB.prepare(`
    SELECT version.id AS versionId
    FROM legal_corpus_versions AS version
    INNER JOIN legal_corpus_variants AS variant
      ON variant.id=version.variant_id AND variant.current_version_id=version.id
    INNER JOIN legal_corpus_documents AS document ON document.id=variant.document_id
    INNER JOIN legal_corpus_chunks AS chunk ON chunk.version_id=version.id
    WHERE chunk.dense_vector_id IS NULL
      AND document.provider IN ('lex_uz','juro_owner')
      AND document.scope='global' AND document.availability_status='ready'
    GROUP BY version.id
    ORDER BY min(chunk.created_at) ASC,version.id ASC
    LIMIT 1
  `).first<{ versionId: string }>();
  if (!candidate) {
    return {
      status: "empty",
      versionId: null,
      chunkCount: 0,
      remainingChunkCount: 0,
    };
  }
  const result = await syncLegalCorpusVersionToQdrant(env, candidate.versionId, {
    ...options,
    onlyMissing: true,
    maxChunks: options.maxChunks ?? LEGAL_CORPUS_QDRANT_BACKFILL_CHUNKS_PER_BATCH,
  });
  const remaining = await env.DB.prepare(`
    SELECT count(*) AS count
    FROM legal_corpus_chunks AS chunk
    INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
    INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
    WHERE chunk.version_id=? AND chunk.dense_vector_id IS NULL
      AND document.provider IN ('lex_uz','juro_owner')
      AND document.scope='global' AND document.availability_status='ready'
  `).bind(candidate.versionId).first<{ count: number }>();
  return {
    status: "indexed",
    versionId: candidate.versionId,
    chunkCount: result.chunkCount,
    remainingChunkCount: Math.max(0, Number(remaining?.count ?? 0)),
  };
}

export function createQdrantDenseSearch(
  env: IndexEnv,
  options: { expectedPointCount?: number } = {},
):
((query: string, limit: number) => Promise<Array<{ chunkId: string; score: number }>>) | undefined {
  if (
    !featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    || !featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")
  ) return undefined;
  const client = new QdrantLegalCorpusClient(env);
  const embeddings = new OpenAiLegalCorpusEmbeddingProvider(env);
  const readiness = Number.isSafeInteger(options.expectedPointCount)
    ? (async () => {
      // A versioned reader can only resolve a finalized manifest. Finalization
      // already compared the collection's exact point count with the frozen
      // D1 chunk count before committing that manifest. Repeating Qdrant's
      // exact O(n) count for every interactive query took ~16 seconds on the
      // staging corpus and consumed the entire chat deadline. Keep the cheap
      // schema probe here; release canaries and snapshot gates remain the
      // places that re-verify the exact count before activation.
      await client.assertCompatible();
    })()
    : ensureLegalCorpusQdrantAvailable(env, { client }).then(() => undefined);
  return async (query, limit) => {
    const startedAt = Date.now();
    // A versioned release was exact-count checked while finalizing its
    // immutable manifest. Legacy collections retain snapshot-ledger recovery.
    await readiness;
    const readyAt = Date.now();
    const [[vector], sparse] = await Promise.all([
      embeddings.embed([query], { feature: "legal_corpus_retrieval" }),
      encodeQdrantSparseQuery(query),
    ]);
    if (!vector) return [];
    const embeddedAt = Date.now();
    const results = await client.queryHybrid({ dense: vector, sparse, limit });
    if (env.APP_ENV !== "production") {
      console.log(JSON.stringify({
        event: "legal_corpus.dense_timing",
        environment: env.APP_ENV,
        readinessMs: readyAt - startedAt,
        embeddingMs: embeddedAt - readyAt,
        qdrantMs: Date.now() - embeddedAt,
        resultCount: results.length,
      }));
    }
    return results;
  };
}

/**
 * Embeds a bounded query plan in one provider call, then searches each branch
 * concurrently against the same verified collection. This is the interactive
 * path for Coverage Requirements; it avoids one network-bound embedding call
 * per branch while preserving independent Qdrant rankings.
 */
export function createQdrantDenseBatchSearch(
  env: IndexEnv,
  options: { expectedPointCount?: number } = {},
):
((queries: readonly string[], limit: number) => Promise<Array<Array<{ chunkId: string; score: number }>>>) | undefined {
  if (
    !featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    || !featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")
  ) return undefined;
  const client = new QdrantLegalCorpusClient(env);
  const embeddings = new OpenAiLegalCorpusEmbeddingProvider(env);
  const readiness = Number.isSafeInteger(options.expectedPointCount)
    ? client.assertCompatible()
    : ensureLegalCorpusQdrantAvailable(env, { client }).then(() => undefined);
  return async (queries, limit) => {
    if (queries.length < 1 || queries.length > 6) {
      throw new TypeError("LEGAL_CORPUS_QUERY_BATCH_REJECTED");
    }
    const startedAt = Date.now();
    await readiness;
    const readyAt = Date.now();
    const [vectors, sparseQueries] = await Promise.all([
      embeddings.embed(queries, { feature: "legal_corpus_retrieval" }),
      Promise.all(queries.map(encodeQdrantSparseQuery)),
    ]);
    if (vectors.length !== queries.length) {
      throw new TypeError("LEGAL_CORPUS_QUERY_VECTOR_COUNT_INVALID");
    }
    const embeddedAt = Date.now();
    const results = await client.queryHybridBatch(vectors.map((dense, index) => ({
      dense,
      sparse: sparseQueries[index]!,
      limit,
    })));
    if (env.APP_ENV !== "production") {
      console.log(JSON.stringify({
        event: "legal_corpus.dense_batch_timing",
        environment: env.APP_ENV,
        queryCount: queries.length,
        readinessMs: readyAt - startedAt,
        embeddingMs: embeddedAt - readyAt,
        qdrantMs: Date.now() - embeddedAt,
      }));
    }
    return results;
  };
}
