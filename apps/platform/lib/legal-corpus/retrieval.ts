import {
  detectArticleNumbers,
  detectLegalQueryLanguage,
  normalizeLegalSearchQuery,
  transliterateUzbek,
} from "../legal/legal-language";
import { canAccessCorpusScope, type LegalCorpusLanguage } from "./trust";

const RRF_K = 60;
const MAX_QUERY_LENGTH = 3_000;

export type LegalCorpusSearchScope = {
  tenantId?: string | null;
  userId?: string | null;
  matterId?: string | null;
  includeHistorical?: boolean;
  /** Uzbekistan legal calendar date. When present, retrieval selects the
   * immutable version whose half-open validity interval covers this date. */
  asOfDate?: string | null;
};

export type LegalCorpusRetrievalItem = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentType: string | null;
  articleNumber: string | null;
  articleTitle: string | null;
  exactQuote: string;
  sourceUrl: string | null;
  language: LegalCorpusLanguage;
  status: "active" | "repealed" | "historical" | "unknown";
  validFrom: string | null;
  validTo: string | null;
  versionDate: string | null;
  fetchedAt: string;
  contentHash: string;
  provider?: string;
  sparseRank?: number;
  denseRank?: number;
  fusionScore?: number;
};

export type DenseCorpusCandidate = Pick<LegalCorpusRetrievalItem, "chunkId"> & {
  score: number;
};

type SparseRow = LegalCorpusRetrievalItem & {
  scope: "global" | "tenant" | "user";
  tenantId: string | null;
  ownerUserId: string | null;
  matterId: string | null;
};

function toFtsQuery(query: string): string | null {
  const tokens = query
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .match(/[\p{L}\p{N}][\p{L}\p{N}._-]{1,80}/gu) ?? [];
  const unique = [...new Set(tokens)].slice(0, 24);
  return unique.length > 0 ? unique.map((token) => `"${token.replaceAll('"', "")}"`).join(" OR ") : null;
}

function queryVariants(query: string): string[] {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return [];
  const language = detectLegalQueryLanguage(trimmed);
  const variants = new Set<string>([trimmed]);
  variants.add(normalizeLegalSearchQuery(trimmed, language === "ru" ? "ru" : "uz"));
  if (language === "uz-Cyrl" || language === "mixed") variants.add(transliterateUzbek(trimmed));
  for (const article of detectArticleNumbers(trimmed)) variants.add(article);
  return [...variants].filter(Boolean);
}

function scopeAllows(row: SparseRow, scope: LegalCorpusSearchScope): boolean {
  return canAccessCorpusScope({
    source: {
      scope: row.scope,
      tenantId: row.tenantId,
      ownerUserId: row.ownerUserId,
      matterId: row.matterId,
    },
    tenantId: scope.tenantId,
    userId: scope.userId,
    matterId: scope.matterId,
  });
}

/** Deterministic reciprocal-rank fusion that preserves a source only once. */
export function reciprocalRankFusion(
  sparse: readonly LegalCorpusRetrievalItem[],
  dense: readonly DenseCorpusCandidate[],
  limit = 12,
): LegalCorpusRetrievalItem[] {
  const byChunk = new Map<string, LegalCorpusRetrievalItem>();
  const score = new Map<string, number>();
  sparse.forEach((item, index) => {
    byChunk.set(item.chunkId, { ...item, sparseRank: index + 1 });
    score.set(item.chunkId, (score.get(item.chunkId) ?? 0) + 1 / (RRF_K + index + 1));
  });
  dense.forEach((item, index) => {
    const existing = byChunk.get(item.chunkId);
    if (!existing || existing.denseRank !== undefined) return;
    byChunk.set(item.chunkId, { ...existing, denseRank: index + 1 });
    score.set(item.chunkId, (score.get(item.chunkId) ?? 0) + 1 / (RRF_K + index + 1));
  });
  return [...byChunk.values()]
    .map((item) => ({ ...item, fusionScore: score.get(item.chunkId) ?? 0 }))
    .sort((left, right) => (right.fusionScore ?? 0) - (left.fusionScore ?? 0)
      || left.chunkId.localeCompare(right.chunkId))
    .slice(0, Math.max(1, Math.min(limit, 30)));
}

/**
 * Sparse BM25 retrieval over immutable current corpus chunks. A dense provider
 * is optional: when it is unavailable, RRF remains deterministic and the
 * grounded answer flow receives only the proven sparse evidence.
 */
export async function retrieveLegalCorpus(input: {
  db: D1Database;
  query: string;
  scope?: LegalCorpusSearchScope;
  limit?: number;
  denseSearch?: (query: string, limit: number) => Promise<DenseCorpusCandidate[]>;
  officialOnly?: boolean;
}): Promise<LegalCorpusRetrievalItem[]> {
  const scope = input.scope ?? {};
  const asOfDate = scope.asOfDate ?? null;
  if (asOfDate !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(asOfDate)) {
    throw new TypeError("LEGAL_CORPUS_AS_OF_DATE_REJECTED");
  }
  const limit = Math.max(1, Math.min(input.limit ?? 8, 30));
  const variants = queryVariants(input.query);
  const fts = toFtsQuery(variants.join(" "));
  if (!fts) return [];
  const rows = await input.db.prepare(`
    SELECT search.chunk_id AS chunkId,
      document.id AS documentId,document.title AS documentTitle,
      document.document_type AS documentType,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      chunk.content_text AS exactQuote,
      provision.source_url AS sourceUrl,provision.language AS language,
      provision.status AS status,provision.valid_from AS validFrom,provision.valid_to AS validTo,
      version.version_date AS versionDate,version.fetched_at AS fetchedAt,
      chunk.content_sha256 AS contentHash,
      document.provider AS provider,
      document.scope AS scope,document.tenant_id AS tenantId,
      document.owner_user_id AS ownerUserId,document.matter_id AS matterId
    FROM legal_corpus_search AS search
    INNER JOIN legal_corpus_chunks AS chunk ON chunk.id=search.chunk_id
    INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
    INNER JOIN legal_corpus_versions AS version ON version.id=provision.version_id
    INNER JOIN legal_corpus_variants AS variant ON variant.id=provision.variant_id
    INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
    WHERE legal_corpus_search MATCH ?
      AND document.availability_status='ready'
      AND (?=0 OR document.provider='lex_uz')
      AND (
        (? IS NULL AND variant.current_version_id=version.id AND (?=1 OR provision.status='active'))
        OR
        (? IS NOT NULL AND version.valid_from IS NOT NULL AND version.valid_from<=?
          AND (version.valid_to IS NULL OR version.valid_to>?))
      )
    ORDER BY bm25(legal_corpus_search, 10.0, 5.0) ASC, provision.sequence ASC
    LIMIT ?
  `).bind(
    fts, input.officialOnly ? 1 : 0,
    asOfDate, scope.includeHistorical ? 1 : 0,
    asOfDate, asOfDate, asOfDate,
    limit * 3,
  ).all<SparseRow>();
  const sparse = rows.results.filter((row) => scopeAllows(row, scope))
    .slice(0, limit * 2)
    .map((row, index) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      documentType: row.documentType,
      articleNumber: row.articleNumber,
      articleTitle: row.articleTitle,
      exactQuote: row.exactQuote,
      sourceUrl: row.sourceUrl,
      language: row.language,
      status: row.status,
      validFrom: row.validFrom,
      validTo: row.validTo,
      versionDate: row.versionDate,
      fetchedAt: row.fetchedAt,
      contentHash: row.contentHash,
      provider: row.provider,
      sparseRank: index + 1,
    }));
  let dense: DenseCorpusCandidate[] = [];
  if (input.denseSearch) {
    try {
      dense = await input.denseSearch(input.query.slice(0, MAX_QUERY_LENGTH), limit * 2);
    } catch {
      // Dense search is an optional provider. Sparse results remain a safe,
      // complete fallback and no provider error is surfaced as legal evidence.
      dense = [];
    }
  }
  return reciprocalRankFusion(sparse, dense, limit);
}

export function assessLegalCorpusCoverage(input: {
  query: string;
  sources: readonly LegalCorpusRetrievalItem[];
}): "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage" {
  if (input.sources.length === 0) return "no_coverage";
  const requestedArticles = detectArticleNumbers(input.query);
  const foundArticles = new Set(input.sources.map((source) => source.articleNumber).filter(Boolean));
  if (requestedArticles.length > 0 && requestedArticles.some((article) => !foundArticles.has(article))) {
    return foundArticles.size > 0 ? "partial_coverage" : "weak_coverage";
  }
  if (input.sources.length === 1 && !input.sources[0]?.articleNumber) return "weak_coverage";
  return "good_coverage";
}
