export type SparseTermEntry = {
  term: string;
  termFrequency: number;
  titleFrequency: number;
  articleFrequency: number;
};

const MAX_SPARSE_TERMS_PER_CHUNK = 512;
const DEFAULT_JSON_COMPACTION_BATCH = 256;

function countSparseTerms(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  const normalized = value.toLocaleLowerCase("und").normalize("NFKC");
  for (const token of normalized.match(/[\p{L}\p{N}][\p{L}\p{N}._-]{0,80}/gu) ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function buildSparseTermEntries(input: {
  text: string;
  articleNumber: string | null;
  title: string | null;
}): SparseTermEntry[] {
  const body = countSparseTerms(input.text);
  const title = countSparseTerms(input.title ?? "");
  const article = countSparseTerms(input.articleNumber ?? "");
  return [...new Set([...body.keys(), ...title.keys(), ...article.keys()])]
    .map((term) => ({
      term,
      termFrequency: body.get(term) ?? 0,
      titleFrequency: title.get(term) ?? 0,
      articleFrequency: article.get(term) ?? 0,
    }))
    .sort((left, right) => {
      const leftWeight = left.termFrequency + left.titleFrequency * 4 + left.articleFrequency * 8;
      const rightWeight = right.termFrequency + right.titleFrequency * 4 + right.articleFrequency * 8;
      return rightWeight - leftWeight || left.term.localeCompare(right.term);
    })
    .slice(0, MAX_SPARSE_TERMS_PER_CHUNK);
}

export function sparseTermsJson(entries: readonly SparseTermEntry[]): string {
  return JSON.stringify(entries);
}

type StoredSparseTermRow = {
  chunkId: string;
  term: string;
  termFrequency: number;
  titleFrequency: number;
  articleFrequency: number;
};

function storedEntry(row: StoredSparseTermRow): SparseTermEntry {
  const entry = {
    term: String(row.term),
    termFrequency: Number(row.termFrequency),
    titleFrequency: Number(row.titleFrequency),
    articleFrequency: Number(row.articleFrequency),
  };
  if (
    entry.term.length < 1
    || entry.term.length > 81
    || !Number.isInteger(entry.termFrequency)
    || !Number.isInteger(entry.titleFrequency)
    || !Number.isInteger(entry.articleFrequency)
    || entry.termFrequency < 0
    || entry.titleFrequency < 0
    || entry.articleFrequency < 0
    || entry.termFrequency + entry.titleFrequency + entry.articleFrequency <= 0
  ) {
    throw new TypeError("LEGAL_CORPUS_SPARSE_VECTOR_REJECTED");
  }
  return entry;
}

/**
 * Loads the exportable normalized sparse index for a bounded Qdrant batch.
 * The chunk JSON column is deliberately not authoritative: keeping the same
 * weights in both places roughly doubles sparse storage and can exhaust D1
 * before the complete Lex catalogue is processed.
 */
export async function loadSparseTermEntriesByChunk(
  db: D1Database,
  chunkIds: readonly string[],
): Promise<Map<string, SparseTermEntry[]>> {
  if (chunkIds.length === 0) return new Map();
  if (chunkIds.length > 64 || new Set(chunkIds).size !== chunkIds.length) {
    throw new TypeError("LEGAL_CORPUS_SPARSE_CHUNK_BATCH_REJECTED");
  }
  const placeholders = chunkIds.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT chunk_id AS chunkId,term,
      term_frequency AS termFrequency,title_frequency AS titleFrequency,
      article_frequency AS articleFrequency
    FROM legal_corpus_sparse_terms
    WHERE chunk_id IN (${placeholders})
    ORDER BY chunk_id,term`).bind(...chunkIds).all<StoredSparseTermRow>();
  const byChunk = new Map<string, SparseTermEntry[]>();
  for (const row of rows.results) {
    const entries = byChunk.get(row.chunkId) ?? [];
    if (entries.length >= MAX_SPARSE_TERMS_PER_CHUNK) {
      throw new TypeError("LEGAL_CORPUS_SPARSE_VECTOR_REJECTED");
    }
    entries.push(storedEntry(row));
    byChunk.set(row.chunkId, entries);
  }
  for (const chunkId of chunkIds) {
    if ((byChunk.get(chunkId)?.length ?? 0) === 0) {
      throw new TypeError("LEGAL_CORPUS_SPARSE_VECTOR_REJECTED");
    }
  }
  return byChunk;
}

/**
 * Frees legacy duplicate sparse JSON only when the normalized inverted index
 * for the chunk is present. SQLite may retain freed pages in its freelist, but
 * subsequent corpus writes can reuse them instead of growing the D1 file.
 */
export async function compactLegacySparseJsonBatch(
  db: D1Database,
  maxChunks = DEFAULT_JSON_COMPACTION_BATCH,
): Promise<number> {
  const bounded = Math.max(1, Math.min(Math.trunc(maxChunks), 512));
  const result = await db.prepare(`UPDATE legal_corpus_chunks
    SET sparse_terms_json='[]'
    WHERE id IN (
      SELECT chunk.id
      FROM legal_corpus_chunks AS chunk
      WHERE chunk.sparse_terms_json<>'[]'
        AND json_valid(chunk.sparse_terms_json)
        AND (SELECT count(*) FROM legal_corpus_sparse_terms AS sparse
          WHERE sparse.chunk_id=chunk.id)=json_array_length(
            CASE WHEN json_valid(chunk.sparse_terms_json)
              THEN chunk.sparse_terms_json ELSE '[]' END
          )
        AND NOT EXISTS (
          SELECT 1
          FROM json_each(CASE WHEN json_valid(chunk.sparse_terms_json)
            THEN chunk.sparse_terms_json ELSE '[]' END) AS legacy
          LEFT JOIN legal_corpus_sparse_terms AS sparse
            ON sparse.chunk_id=chunk.id
            AND sparse.term=CAST(json_extract(legacy.value,'$.term') AS TEXT)
            AND sparse.term_frequency=CAST(json_extract(legacy.value,'$.termFrequency') AS INTEGER)
            AND sparse.title_frequency=CAST(json_extract(legacy.value,'$.titleFrequency') AS INTEGER)
            AND sparse.article_frequency=CAST(json_extract(legacy.value,'$.articleFrequency') AS INTEGER)
          WHERE sparse.chunk_id IS NULL
        )
      ORDER BY chunk.id
      LIMIT ?
    )`).bind(bounded).run();
  return Math.max(0, Number(result.meta.changes ?? 0));
}
