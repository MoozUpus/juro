import { z } from "zod";

export const LEGAL_SOURCE_INDEXING_ERROR_CODES = [
  "LEGAL_SOURCE_INDEX_NOT_FOUND",
  "LEGAL_SOURCE_INDEX_STATE_REJECTED",
  "LEGAL_SOURCE_INDEX_CONFIGURATION_UNAVAILABLE",
  "LEGAL_SOURCE_INDEX_EMBEDDING_FAILED",
  "LEGAL_SOURCE_INDEX_VECTORIZE_FAILED",
  "LEGAL_SOURCE_INDEX_PERSISTENCE_FAILED",
] as const;

export type LegalSourceIndexingErrorCode =
  (typeof LEGAL_SOURCE_INDEXING_ERROR_CODES)[number];

export class LegalSourceIndexingError extends Error {
  constructor(readonly code: LegalSourceIndexingErrorCode, readonly retryable: boolean) {
    super(code);
    this.name = "LegalSourceIndexingError";
  }
}

export type LegalSourceIndexingEnv = Pick<
  Env,
  "APP_ENV" | "DB" | "LEX_UZ_INDEX" | "ADVICE_UZ_INDEX"
> & {
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
};

type PublishedChunk = {
  id: string;
  content_text: string;
  source_id: string;
  version_id: string;
  source_type: "lex" | "advice";
  language: "ru" | "uz";
  canonical_id: string;
  publication_id: string;
};

const identifierSchema = z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/);
const embeddingResponseSchema = z.object({
  data: z.array(z.object({
    index: z.number().int().nonnegative(),
    embedding: z.array(z.number().finite()).length(1536),
  })).min(1),
}).strict();
const MAX_CHUNKS = 300;
const EMBEDDING_BATCH_SIZE = 64;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large";

function vectorId(chunkId: string): string {
  return `vec_${chunkId}`;
}

function indexFor(env: LegalSourceIndexingEnv, sourceType: PublishedChunk["source_type"]): VectorizeIndex {
  return sourceType === "lex" ? env.LEX_UZ_INDEX : env.ADVICE_UZ_INDEX;
}

async function loadPublishedChunks(db: D1Database, versionId: string): Promise<PublishedChunk[]> {
  const result = await db.prepare(`
    SELECT chunk.id,chunk.content_text,source.id AS source_id,version.id AS version_id,
      source.source_type,source.locale AS language,source.canonical_id,
      publication.id AS publication_id
    FROM legal_source_current_activations activation
    INNER JOIN legal_sources source ON source.id=activation.source_id
    INNER JOIN legal_source_versions version
      ON version.id=activation.version_id AND version.source_id=source.id
    INNER JOIN legal_source_publications publication
      ON publication.id=activation.publication_id
     AND publication.version_id=version.id AND publication.source_id=source.id
    INNER JOIN legal_source_chunks chunk ON chunk.version_id=version.id
    WHERE version.id=?
      AND source.status='verified' AND source.verification_state='verified'
      AND version.status='verified' AND source.source_type IN ('lex','advice')
      AND source.canonical_id IS NOT NULL
    ORDER BY chunk.chunk_index ASC
  `).bind(versionId).all<PublishedChunk>();
  return result.results;
}

async function createEmbeddings(env: LegalSourceIndexingEnv, values: readonly string[]): Promise<number[][]> {
  if (!env.OPENAI_API_KEY) {
    throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_CONFIGURATION_UNAVAILABLE", false);
  }
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
        input: values,
        dimensions: 1536,
        encoding_format: "float",
      }),
    });
  } catch {
    throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_EMBEDDING_FAILED", true);
  }
  if (!response.ok) {
    throw new LegalSourceIndexingError(
      "LEGAL_SOURCE_INDEX_EMBEDDING_FAILED",
      response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
    );
  }
  let payload: z.infer<typeof embeddingResponseSchema>;
  try { payload = embeddingResponseSchema.parse(await response.json()); } catch {
    throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_EMBEDDING_FAILED", false);
  }
  if (payload.data.length !== values.length || payload.data.some((item, index) => item.index !== index)) {
    throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_EMBEDDING_FAILED", false);
  }
  return payload.data.map((item) => item.embedding);
}

/** Index only a current staff-published official source; all other lifecycle states fail closed. */
export async function executeLegalSourceIndexing(
  env: LegalSourceIndexingEnv,
  inputVersionId: string,
  options: { now?: Date } = {},
): Promise<{ versionId: string; indexedChunks: number; changed: boolean }> {
  const versionId = identifierSchema.parse(inputVersionId);
  const chunks = await loadPublishedChunks(env.DB, versionId);
  if (chunks.length === 0) {
    const exists = await env.DB.prepare("SELECT 1 AS found FROM legal_source_versions WHERE id=? LIMIT 1")
      .bind(versionId).first<{ found: number }>();
    throw new LegalSourceIndexingError(exists ? "LEGAL_SOURCE_INDEX_STATE_REJECTED" : "LEGAL_SOURCE_INDEX_NOT_FOUND", false);
  }
  if (chunks.length > MAX_CHUNKS || new Set(chunks.map((chunk) => chunk.source_type)).size !== 1) {
    throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_STATE_REJECTED", false);
  }
  const now = (options.now ?? new Date()).toISOString();
  const index = indexFor(env, chunks[0]!.source_type);
  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const embeddings = await createEmbeddings(env, batch.map((chunk) => chunk.content_text));
    try {
      await index.upsert(batch.map((chunk, indexInBatch) => ({
        id: vectorId(chunk.id), values: embeddings[indexInBatch]!,
        metadata: {
          environment: env.APP_ENV, sourceType: chunk.source_type, sourceId: chunk.source_id,
          versionId: chunk.version_id, publicationId: chunk.publication_id, language: chunk.language,
        },
      })));
    } catch {
      throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_VECTORIZE_FAILED", true);
    }
  }
  const updates = chunks.map((chunk) => env.DB.prepare(`
    UPDATE legal_source_chunks SET vector_id=?,indexed_at=?
    WHERE id=? AND version_id=? AND (vector_id IS NULL OR vector_id=?)
      AND EXISTS (
        SELECT 1 FROM legal_source_current_activations activation
        INNER JOIN legal_sources source ON source.id=activation.source_id
        INNER JOIN legal_source_versions version ON version.id=activation.version_id AND version.source_id=source.id
        INNER JOIN legal_source_publications publication ON publication.id=activation.publication_id
          AND publication.version_id=version.id AND publication.source_id=source.id
        WHERE activation.version_id=legal_source_chunks.version_id
          AND source.status='verified' AND source.verification_state='verified' AND version.status='verified'
      )
  `).bind(vectorId(chunk.id), now, chunk.id, versionId, vectorId(chunk.id)));
  try {
    const results = await env.DB.batch(updates);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) {
      throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_PERSISTENCE_FAILED", true);
    }
  } catch (error) {
    if (error instanceof LegalSourceIndexingError) throw error;
    throw new LegalSourceIndexingError("LEGAL_SOURCE_INDEX_PERSISTENCE_FAILED", true);
  }
  return { versionId, indexedChunks: chunks.length, changed: true };
}
