export type LegalSearchEnvironment = "development" | "staging" | "production";

export type ActiveLegalSearchIndex = {
  manifestId: string;
  environment: LegalSearchEnvironment;
  qdrantCollection: string;
  sparseSchemaVersion: string;
  embeddingModel: string;
  embeddingSchemaVersion: string;
  rerankerModel: string;
  rerankerVersion: string;
  variantCount: number;
  chunkCount: number;
  densePointCount: number;
  corpusCutoffAt: string;
  manifestSha256: string;
  activatedAt: string;
};

export type LegalSearchIndexBuild = {
  manifestId: string;
  environment: LegalSearchEnvironment;
  qdrantCollection: string;
  sparseSchemaVersion: string;
  embeddingModel: string;
  embeddingSchemaVersion: string;
  rerankerModel: string;
  rerankerVersion: string;
  variantCount: number;
  chunkCount: number;
  indexedChunkCount: number;
  lastChunkId: string | null;
  status: "building" | "complete" | "finalized" | "failed";
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

type ActiveRow = Omit<ActiveLegalSearchIndex,
"variantCount" | "chunkCount" | "densePointCount"> & {
  variantCount: number | string;
  chunkCount: number | string;
  densePointCount: number | string;
};

type BuildRow = Omit<LegalSearchIndexBuild,
"variantCount" | "chunkCount" | "indexedChunkCount"> & {
  variantCount: number | string;
  chunkCount: number | string;
  indexedChunkCount: number | string;
};

const identifierPattern = /^[A-Za-z0-9:_-]{1,160}$/u;
const collectionPattern = /^[A-Za-z0-9_-]{1,80}$/u;
const modelPattern = /^[A-Za-z0-9._:-]{1,120}$/u;

function stableManifest(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right))));
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function normalizeActive(row: ActiveRow): ActiveLegalSearchIndex {
  return {
    ...row,
    variantCount: Number(row.variantCount),
    chunkCount: Number(row.chunkCount),
    densePointCount: Number(row.densePointCount),
  };
}

function normalizeBuild(row: BuildRow): LegalSearchIndexBuild {
  return {
    ...row,
    variantCount: Number(row.variantCount),
    chunkCount: Number(row.chunkCount),
    indexedChunkCount: Number(row.indexedChunkCount),
  };
}

const activeSelect = `
  SELECT manifest.id AS manifestId,manifest.environment,
    manifest.qdrant_collection AS qdrantCollection,
    manifest.sparse_schema_version AS sparseSchemaVersion,
    manifest.embedding_model AS embeddingModel,
    manifest.embedding_schema_version AS embeddingSchemaVersion,
    manifest.reranker_model AS rerankerModel,
    manifest.reranker_version AS rerankerVersion,
    manifest.variant_count AS variantCount,manifest.chunk_count AS chunkCount,
    manifest.dense_point_count AS densePointCount,
    manifest.corpus_cutoff_at AS corpusCutoffAt,
    manifest.manifest_sha256 AS manifestSha256,activation.created_at AS activatedAt
  FROM legal_corpus_search_index_activations activation
  INNER JOIN legal_corpus_search_index_manifests manifest ON manifest.id=activation.manifest_id
`;

export async function resolveActiveLegalSearchIndex(
  db: D1Database,
  environment: LegalSearchEnvironment,
): Promise<ActiveLegalSearchIndex | null> {
  try {
    const row = await db.prepare(`${activeSelect}
      WHERE activation.environment=?
      ORDER BY activation.created_at DESC,activation.id DESC LIMIT 1
    `).bind(environment).first<ActiveRow>();
    return row ? normalizeActive(row) : null;
  } catch (error) {
    if (error instanceof Error && /no such table:\s*legal_corpus_search_index_/iu.test(error.message)) return null;
    throw error;
  }
}

export async function resolveLegalSearchIndex(
  db: D1Database,
  environment: LegalSearchEnvironment,
  manifestId: string,
): Promise<ActiveLegalSearchIndex | null> {
  if (!identifierPattern.test(manifestId)) throw new TypeError("LEGAL_SEARCH_MANIFEST_REJECTED");
  const row = await db.prepare(`${activeSelect}
    WHERE activation.environment=? AND manifest.id=?
    ORDER BY activation.created_at DESC,activation.id DESC LIMIT 1`)
    .bind(environment, manifestId).first<ActiveRow>();
  return row ? normalizeActive(row) : null;
}

/** Resolves a finalized release for pre-activation canaries. */
export async function resolveLegalSearchIndexManifest(
  db: D1Database,
  environment: LegalSearchEnvironment,
  manifestId: string,
): Promise<ActiveLegalSearchIndex | null> {
  if (!identifierPattern.test(manifestId)) throw new TypeError("LEGAL_SEARCH_MANIFEST_REJECTED");
  const row = await db.prepare(`SELECT id AS manifestId,environment,
    qdrant_collection AS qdrantCollection,sparse_schema_version AS sparseSchemaVersion,
    embedding_model AS embeddingModel,embedding_schema_version AS embeddingSchemaVersion,
    reranker_model AS rerankerModel,reranker_version AS rerankerVersion,
    variant_count AS variantCount,chunk_count AS chunkCount,dense_point_count AS densePointCount,
    corpus_cutoff_at AS corpusCutoffAt,
    manifest_sha256 AS manifestSha256,created_at AS activatedAt
    FROM legal_corpus_search_index_manifests WHERE environment=? AND id=? LIMIT 1`)
    .bind(environment, manifestId).first<ActiveRow>();
  return row ? normalizeActive(row) : null;
}

export async function loadLegalSearchIndexBuild(
  db: D1Database,
  manifestId: string,
): Promise<LegalSearchIndexBuild | null> {
  if (!identifierPattern.test(manifestId)) throw new TypeError("LEGAL_SEARCH_MANIFEST_REJECTED");
  const row = await db.prepare(`SELECT id AS manifestId,environment,
    qdrant_collection AS qdrantCollection,sparse_schema_version AS sparseSchemaVersion,
    embedding_model AS embeddingModel,embedding_schema_version AS embeddingSchemaVersion,
    reranker_model AS rerankerModel,reranker_version AS rerankerVersion,
    variant_count AS variantCount,chunk_count AS chunkCount,
    indexed_chunk_count AS indexedChunkCount,last_chunk_id AS lastChunkId,status,
    error_code AS errorCode,created_at AS createdAt,updated_at AS updatedAt
    FROM legal_corpus_search_index_builds WHERE id=? LIMIT 1`)
    .bind(manifestId).first<BuildRow>();
  return row ? normalizeBuild(row) : null;
}

export async function startLegalSearchIndexBuild(input: {
  db: D1Database;
  environment: LegalSearchEnvironment;
  manifestId: string;
  qdrantCollection: string;
  sparseSchemaVersion: string;
  embeddingModel: string;
  embeddingSchemaVersion: string;
  rerankerModel: string;
  rerankerVersion: string;
  now?: Date;
}): Promise<LegalSearchIndexBuild> {
  if (
    !identifierPattern.test(input.manifestId)
    || !collectionPattern.test(input.qdrantCollection)
    || !identifierPattern.test(input.sparseSchemaVersion)
    || !identifierPattern.test(input.embeddingSchemaVersion)
    || !identifierPattern.test(input.rerankerVersion)
    || !modelPattern.test(input.embeddingModel)
    || !modelPattern.test(input.rerankerModel)
  ) throw new TypeError("LEGAL_SEARCH_MANIFEST_REJECTED");

  const cutoff = (input.now ?? new Date()).toISOString();
  await input.db.batch([
    input.db.prepare(`INSERT INTO legal_corpus_search_index_builds
      (id,environment,qdrant_collection,sparse_schema_version,embedding_model,
       embedding_schema_version,reranker_model,reranker_version,variant_count,
       chunk_count,indexed_chunk_count,last_chunk_id,status,error_code,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,count(DISTINCT variant.id),count(chunk.id),0,NULL,
        'building',NULL,?,?
    FROM legal_corpus_variants variant
    INNER JOIN legal_corpus_versions version ON version.id=variant.current_version_id
    INNER JOIN legal_corpus_chunks chunk ON chunk.version_id=version.id
    INNER JOIN legal_corpus_documents document ON document.id=variant.document_id
    WHERE document.availability_status='ready' AND document.scope='global'
      AND document.provider IN ('lex_uz','juro_owner')
    HAVING count(DISTINCT variant.id)>0 AND count(chunk.id)>0`).bind(
      input.manifestId, input.environment, input.qdrantCollection,
      input.sparseSchemaVersion, input.embeddingModel, input.embeddingSchemaVersion,
      input.rerankerModel, input.rerankerVersion, cutoff, cutoff,
    ),
    input.db.prepare(`INSERT INTO legal_corpus_search_index_build_versions
      (build_id,variant_id,version_id)
      SELECT ?,variant.id,variant.current_version_id
      FROM legal_corpus_variants variant
      INNER JOIN legal_corpus_chunks chunk ON chunk.version_id=variant.current_version_id
      INNER JOIN legal_corpus_documents document ON document.id=variant.document_id
      WHERE variant.current_version_id IS NOT NULL AND document.availability_status='ready'
        AND document.scope='global' AND document.provider IN ('lex_uz','juro_owner')
      GROUP BY variant.id,variant.current_version_id
      ORDER BY variant.id`).bind(input.manifestId),
  ]);
  const build = await loadLegalSearchIndexBuild(input.db, input.manifestId);
  if (!build) throw new TypeError("LEGAL_SEARCH_MANIFEST_COUNTS_REJECTED");
  return build;
}

export async function finalizeLegalSearchIndexBuild(input: {
  db: D1Database;
  environment: LegalSearchEnvironment;
  manifestId: string;
  densePointCount: number;
}): Promise<Omit<ActiveLegalSearchIndex, "activatedAt">> {
  const build = await loadLegalSearchIndexBuild(input.db, input.manifestId);
  if (build?.environment === input.environment && build.status === "finalized") {
    const existing = await resolveLegalSearchIndexManifest(
      input.db,
      input.environment,
      input.manifestId,
    );
    if (!existing || existing.densePointCount !== input.densePointCount) {
      throw new TypeError("LEGAL_SEARCH_BUILD_COUNT_MISMATCH");
    }
    const { activatedAt: _createdAt, ...manifest } = existing;
    void _createdAt;
    return manifest;
  }
  if (
    !build
    || build.environment !== input.environment
    || build.status !== "complete"
    || build.indexedChunkCount !== build.chunkCount
    || !Number.isSafeInteger(input.densePointCount)
    || input.densePointCount !== build.chunkCount
  ) throw new TypeError("LEGAL_SEARCH_BUILD_COUNT_MISMATCH");
  const manifestBody = {
    environment: build.environment,
    manifestId: build.manifestId,
    qdrantCollection: build.qdrantCollection,
    sparseSchemaVersion: build.sparseSchemaVersion,
    embeddingModel: build.embeddingModel,
    embeddingSchemaVersion: build.embeddingSchemaVersion,
    rerankerModel: build.rerankerModel,
    rerankerVersion: build.rerankerVersion,
    variantCount: build.variantCount,
    chunkCount: build.chunkCount,
    densePointCount: input.densePointCount,
    corpusCutoffAt: build.createdAt,
  };
  const manifestSha256 = await sha256(stableManifest(manifestBody));
  await input.db.batch([
    input.db.prepare(`INSERT INTO legal_corpus_search_index_manifests
      (id,environment,qdrant_collection,sparse_schema_version,embedding_model,
       embedding_schema_version,reranker_model,reranker_version,variant_count,
       chunk_count,dense_point_count,corpus_cutoff_at,manifest_sha256,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      build.manifestId, build.environment, build.qdrantCollection, build.sparseSchemaVersion,
      build.embeddingModel, build.embeddingSchemaVersion, build.rerankerModel,
      build.rerankerVersion, build.variantCount, build.chunkCount, input.densePointCount,
      build.createdAt, manifestSha256, build.createdAt,
    ),
    input.db.prepare(`INSERT INTO legal_corpus_search_index_versions
      (manifest_id,variant_id,version_id)
      SELECT ?,variant_id,version_id FROM legal_corpus_search_index_build_versions
      WHERE build_id=? ORDER BY variant_id`).bind(build.manifestId, build.manifestId),
    input.db.prepare(`UPDATE legal_corpus_search_index_builds
      SET status='finalized',updated_at=? WHERE id=? AND status='complete'`)
      .bind(new Date().toISOString(), build.manifestId),
  ]);
  return { ...manifestBody, manifestSha256 };
}

export async function activateLegalSearchIndex(input: {
  db: D1Database;
  environment: LegalSearchEnvironment;
  manifestId: string;
  actor: string;
  reason: string;
  canaryPassed: boolean;
  now?: Date;
}): Promise<ActiveLegalSearchIndex> {
  if (!input.canaryPassed) throw new TypeError("LEGAL_SEARCH_CANARY_REQUIRED");
  const previous = await resolveActiveLegalSearchIndex(input.db, input.environment);
  const now = (input.now ?? new Date()).toISOString();
  await input.db.prepare(`INSERT INTO legal_corpus_search_index_activations
    (id,environment,manifest_id,previous_manifest_id,action,reason,actor,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), input.environment, input.manifestId, previous?.manifestId ?? null,
    "activate", input.reason, input.actor, now,
  ).run();
  const active = await resolveActiveLegalSearchIndex(input.db, input.environment);
  if (!active || active.manifestId !== input.manifestId) throw new Error("LEGAL_SEARCH_ACTIVATION_FAILED");
  return active;
}

export async function rollbackLegalSearchIndex(input: {
  db: D1Database;
  environment: LegalSearchEnvironment;
  actor: string;
  reason: string;
  now?: Date;
}): Promise<ActiveLegalSearchIndex> {
  const latest = await input.db.prepare(`SELECT manifest_id AS manifestId,
    previous_manifest_id AS previousManifestId
    FROM legal_corpus_search_index_activations WHERE environment=?
    ORDER BY created_at DESC,id DESC LIMIT 1`).bind(input.environment)
    .first<{ manifestId: string; previousManifestId: string | null }>();
  if (!latest?.previousManifestId) throw new TypeError("LEGAL_SEARCH_ROLLBACK_UNAVAILABLE");
  const now = (input.now ?? new Date()).toISOString();
  await input.db.prepare(`INSERT INTO legal_corpus_search_index_activations
    (id,environment,manifest_id,previous_manifest_id,action,reason,actor,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), input.environment, latest.previousManifestId, latest.manifestId,
    "rollback", input.reason, input.actor, now,
  ).run();
  const active = await resolveActiveLegalSearchIndex(input.db, input.environment);
  if (!active || active.manifestId !== latest.previousManifestId) throw new Error("LEGAL_SEARCH_ROLLBACK_FAILED");
  return active;
}
