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
import { featureEnabled, type LegalCorpusFeatureFlag, type LegalCorpusLanguage } from "./trust";

const BATCH_SIZE = 32;

type IndexEnv = LegalCorpusEmbeddingEnv & QdrantCorpusEnv
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

type VersionRow = {
  versionId: string;
  previousVersionId: string | null;
  isCurrent: number;
};

type ChunkRow = {
  chunkId: string;
  documentId: string;
  variantId: string;
  versionId: string;
  language: LegalCorpusLanguage;
  status: "active" | "repealed" | "historical" | "unknown";
  articleNumber: string | null;
  contentText: string;
  sparseTermsJson: string;
};

type SparseEntry = {
  term: string;
  termFrequency: number;
  titleFrequency: number;
  articleFrequency: number;
};

export type LegalCorpusQdrantSyncResult = {
  status: "disabled" | "indexed";
  versionId: string;
  chunkCount: number;
};

function sparseWeights(value: string): Array<{ term: string; weight: number }> {
  let entries: SparseEntry[];
  try {
    entries = JSON.parse(value) as SparseEntry[];
  } catch {
    throw new TypeError("LEGAL_CORPUS_SPARSE_VECTOR_REJECTED");
  }
  if (!Array.isArray(entries) || entries.length > 512) {
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
  options: {
    client?: Pick<QdrantLegalCorpusClient, "assertCompatible" | "setVersionCurrent" | "upsert">;
    embeddings?: LegalCorpusEmbeddingProvider;
    now?: Date;
  } = {},
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
  await client.assertCompatible();
  if (version.isCurrent === 1 && version.previousVersionId) {
    await client.setVersionCurrent(version.previousVersionId, false);
  }

  const rows = await env.DB.prepare(`
    SELECT chunk.id AS chunkId,document.id AS documentId,variant.id AS variantId,
      version.id AS versionId,provision.language AS language,provision.status,
      provision.article_number AS articleNumber,chunk.content_text AS contentText,
      chunk.sparse_terms_json AS sparseTermsJson
    FROM legal_corpus_chunks AS chunk
    INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
    INNER JOIN legal_corpus_versions AS version ON version.id=chunk.version_id
    INNER JOIN legal_corpus_variants AS variant ON variant.id=version.variant_id
    INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
    WHERE chunk.version_id=? AND document.provider='lex_uz'
      AND document.scope='global' AND document.availability_status='ready'
    ORDER BY chunk.id ASC
    LIMIT 16000
  `).bind(versionId).all<ChunkRow>();
  const indexedAt = (options.now ?? new Date()).toISOString();
  let chunkCount = 0;
  for (let start = 0; start < rows.results.length; start += BATCH_SIZE) {
    const batch = rows.results.slice(start, start + BATCH_SIZE);
    const vectors = await embeddings.embed(
      batch.map((row) => row.contentText),
      { feature: "legal_corpus_indexing" },
    );
    if (vectors.length !== batch.length) throw new TypeError("LEGAL_CORPUS_DENSE_VECTOR_REJECTED");
    const points: QdrantCorpusPoint[] = await Promise.all(batch.map(async (row, index) => ({
      id: await qdrantPointId(row.chunkId),
      chunkId: row.chunkId,
      documentId: row.documentId,
      variantId: row.variantId,
      versionId: row.versionId,
      language: row.language,
      status: row.status,
      isCurrent: version.isCurrent === 1,
      articleNumber: row.articleNumber,
      dense: vectors[index]!,
      sparse: await encodeQdrantSparseTerms(sparseWeights(row.sparseTermsJson)),
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

export function createQdrantDenseSearch(env: IndexEnv):
((query: string, limit: number) => Promise<Array<{ chunkId: string; score: number }>>) | undefined {
  if (!featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")) return undefined;
  const client = new QdrantLegalCorpusClient(env);
  const embeddings = new OpenAiLegalCorpusEmbeddingProvider(env);
  return async (query, limit) => {
    const [[vector], sparse] = await Promise.all([
      embeddings.embed([query], { feature: "legal_corpus_retrieval" }),
      encodeQdrantSparseQuery(query),
    ]);
    if (!vector) return [];
    return client.queryHybrid({ dense: vector, sparse, limit });
  };
}
