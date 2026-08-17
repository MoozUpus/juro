export type SparseTermEntry = {
  term: string;
  termFrequency: number;
  titleFrequency: number;
  articleFrequency: number;
};

const MAX_SPARSE_TERMS_PER_CHUNK = 512;
const DEFAULT_JSON_COMPACTION_BATCH = 256;
const DEFAULT_COMPRESSED_BACKFILL_BATCH = 256;

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

type SparseStorageMode = "legacy" | "compressed";

/**
 * The compressed tables are deliberately discovered at runtime. This lets the
 * Worker deploy before the additive D1 migration and keeps a rollback capable
 * of reading the legacy index without a schema-dependent deployment order.
 */
export async function sparseStorageMode(db: D1Database): Promise<SparseStorageMode> {
  const compressed = await db.prepare(`SELECT 1 AS present
    FROM sqlite_master
    WHERE type='table' AND name='legal_corpus_sparse_postings'
  `).first<{ present: number }>();
  return compressed ? "compressed" : "legacy";
}

/**
 * Builds the bounded, idempotent sparse write sequence for one immutable
 * chunk. The compressed representation stores a term and chunk identifier
 * once, so a long Lex crawl does not replicate document/version identifiers
 * for every posting. Callers place the chunk INSERT before these statements.
 */
export function sparseTermWriteStatements(input: {
  db: D1Database;
  mode: SparseStorageMode;
  chunkId: string;
  entries: readonly SparseTermEntry[];
  documentId: string;
  versionId: string;
  language: string;
}): D1PreparedStatement[] {
  const entriesJson = sparseTermsJson(input.entries);
  if (input.mode === "legacy") {
    return [
      input.db.prepare("DELETE FROM legal_corpus_sparse_terms WHERE chunk_id=?")
        .bind(input.chunkId),
      input.db.prepare(`INSERT INTO legal_corpus_sparse_terms
        (term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency)
        SELECT
          CAST(json_extract(value,'$.term') AS TEXT),?,?,?, ?,
          CAST(json_extract(value,'$.termFrequency') AS INTEGER),
          CAST(json_extract(value,'$.titleFrequency') AS INTEGER),
          CAST(json_extract(value,'$.articleFrequency') AS INTEGER)
        FROM json_each(?)
        WHERE 1=1
        ON CONFLICT(term,chunk_id) DO UPDATE SET
          term_frequency=excluded.term_frequency,
          title_frequency=excluded.title_frequency,
          article_frequency=excluded.article_frequency
      `).bind(
        input.chunkId, input.documentId, input.versionId, input.language, entriesJson,
      ),
    ];
  }
  return [
    input.db.prepare(`INSERT INTO legal_corpus_sparse_chunk_keys (chunk_id)
      VALUES (?) ON CONFLICT(chunk_id) DO NOTHING`).bind(input.chunkId),
    input.db.prepare(`INSERT INTO legal_corpus_sparse_term_dictionary (term)
      SELECT DISTINCT CAST(json_extract(value,'$.term') AS TEXT)
      FROM json_each(?)
      WHERE length(CAST(json_extract(value,'$.term') AS TEXT)) BETWEEN 1 AND 81
      ON CONFLICT(term) DO NOTHING`).bind(entriesJson),
    input.db.prepare(`DELETE FROM legal_corpus_sparse_postings
      WHERE chunk_key_id=(SELECT id FROM legal_corpus_sparse_chunk_keys WHERE chunk_id=?)
    `).bind(input.chunkId),
    input.db.prepare(`INSERT INTO legal_corpus_sparse_postings
      (term_id,chunk_key_id,term_frequency,title_frequency,article_frequency)
      SELECT term.id,chunk_key.id,
        CAST(json_extract(value,'$.termFrequency') AS INTEGER),
        CAST(json_extract(value,'$.titleFrequency') AS INTEGER),
        CAST(json_extract(value,'$.articleFrequency') AS INTEGER)
      FROM json_each(?)
      INNER JOIN legal_corpus_sparse_term_dictionary AS term
        ON term.term=CAST(json_extract(value,'$.term') AS TEXT)
      INNER JOIN legal_corpus_sparse_chunk_keys AS chunk_key ON chunk_key.chunk_id=?
      WHERE 1=1
      ON CONFLICT(term_id,chunk_key_id) DO UPDATE SET
        term_frequency=excluded.term_frequency,
        title_frequency=excluded.title_frequency,
        article_frequency=excluded.article_frequency
    `).bind(entriesJson, input.chunkId),
  ];
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
  const mode = await sparseStorageMode(db);
  const compressed = mode === "compressed" ? `
    UNION ALL
    SELECT chunk_key.chunk_id AS chunkId,term.term,
      posting.term_frequency AS termFrequency,posting.title_frequency AS titleFrequency,
      posting.article_frequency AS articleFrequency
    FROM legal_corpus_sparse_postings AS posting
    INNER JOIN legal_corpus_sparse_term_dictionary AS term ON term.id=posting.term_id
    INNER JOIN legal_corpus_sparse_chunk_keys AS chunk_key ON chunk_key.id=posting.chunk_key_id
    WHERE chunk_key.chunk_id IN (${placeholders})
  ` : "";
  const rows = await db.prepare(`SELECT chunk_id AS chunkId,term,
      term_frequency AS termFrequency,title_frequency AS titleFrequency,
      article_frequency AS articleFrequency
    FROM legal_corpus_sparse_terms
    WHERE chunk_id IN (${placeholders})
    ${compressed}
    ORDER BY chunkId,term`).bind(
    ...chunkIds,
    ...(mode === "compressed" ? chunkIds : []),
  ).all<StoredSparseTermRow>();
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
 * Moves a bounded set of legacy postings into the compressed index in one D1
 * transaction. Rows are deleted only after their dictionary and postings have
 * been inserted, so a failed batch remains readable through the legacy path.
 */
export async function backfillCompressedSparseIndexBatch(
  db: D1Database,
  maxChunks = DEFAULT_COMPRESSED_BACKFILL_BATCH,
): Promise<number> {
  if (await sparseStorageMode(db) !== "compressed") return 0;
  const bounded = Math.max(1, Math.min(Math.trunc(maxChunks), 256));
  const candidates = await db.prepare(`SELECT chunk_id AS chunkId
    FROM legal_corpus_sparse_terms
    GROUP BY chunk_id
    ORDER BY chunk_id
    LIMIT ?
  `).bind(bounded).all<{ chunkId: string }>();
  const chunkIds = candidates.results.map((row) => String(row.chunkId));
  if (chunkIds.length === 0) return 0;
  const placeholders = chunkIds.map(() => "?").join(",");
  const statement = (sql: string) => db.prepare(sql).bind(...chunkIds);
  const results = await db.batch([
    statement(`INSERT INTO legal_corpus_sparse_chunk_keys (chunk_id)
      SELECT chunk_id FROM legal_corpus_sparse_terms
      WHERE chunk_id IN (${placeholders})
      GROUP BY chunk_id
      ON CONFLICT(chunk_id) DO NOTHING`),
    statement(`INSERT INTO legal_corpus_sparse_term_dictionary (term)
      SELECT term FROM legal_corpus_sparse_terms
      WHERE chunk_id IN (${placeholders})
      GROUP BY term
      ON CONFLICT(term) DO NOTHING`),
    statement(`INSERT INTO legal_corpus_sparse_postings
      (term_id,chunk_key_id,term_frequency,title_frequency,article_frequency)
      SELECT term.id,chunk_key.id,sparse.term_frequency,sparse.title_frequency,sparse.article_frequency
      FROM legal_corpus_sparse_terms AS sparse
      INNER JOIN legal_corpus_sparse_term_dictionary AS term ON term.term=sparse.term
      INNER JOIN legal_corpus_sparse_chunk_keys AS chunk_key ON chunk_key.chunk_id=sparse.chunk_id
      WHERE sparse.chunk_id IN (${placeholders})
      ON CONFLICT(term_id,chunk_key_id) DO UPDATE SET
        term_frequency=excluded.term_frequency,
        title_frequency=excluded.title_frequency,
        article_frequency=excluded.article_frequency`),
    statement(`UPDATE legal_corpus_chunks SET sparse_terms_json='[]'
      WHERE id IN (${placeholders})`),
    statement(`DELETE FROM legal_corpus_sparse_terms WHERE chunk_id IN (${placeholders})`),
  ]);
  if (Number(results[4]?.meta?.changes ?? 0) === 0) {
    throw new Error("LEGAL_CORPUS_SPARSE_BACKFILL_LOST_LEASE");
  }
  return chunkIds.length;
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
