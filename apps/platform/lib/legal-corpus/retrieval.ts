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

type SparseCandidateRow = SparseRow & {
  sparseTermsJson: string;
  matchedTermsJson: string;
  matchedTermCount: number;
};

type SparseMatchedTerm = {
  term: string;
  termFrequency: number;
  titleFrequency: number;
  articleFrequency: number;
};

function toSparseQueryTerms(query: string): string[] {
  const tokens = query
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .match(/[\p{L}\p{N}][\p{L}\p{N}._-]{0,80}/gu) ?? [];
  return [...new Set(tokens)].slice(0, 24);
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
  hydratedDense: readonly LegalCorpusRetrievalItem[] = [],
): LegalCorpusRetrievalItem[] {
  const byChunk = new Map<string, LegalCorpusRetrievalItem>();
  const score = new Map<string, number>();
  hydratedDense.forEach((item) => {
    if (!byChunk.has(item.chunkId)) byChunk.set(item.chunkId, { ...item });
  });
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

async function hydrateDenseCandidates(input: {
  db: D1Database;
  candidates: readonly DenseCorpusCandidate[];
  scope: LegalCorpusSearchScope;
  officialOnly: boolean;
}): Promise<LegalCorpusRetrievalItem[]> {
  const chunkIds = [...new Set(input.candidates.map((candidate) => candidate.chunkId))]
    .filter((chunkId) => /^[A-Za-z0-9:_-]{1,200}$/u.test(chunkId))
    .slice(0, 60);
  if (chunkIds.length === 0) return [];

  const scope = input.scope;
  const asOfDate = scope.asOfDate ?? null;
  const tenantId = scope.tenantId ?? null;
  const userId = scope.userId ?? null;
  const matterId = scope.matterId ?? null;
  const placeholders = chunkIds.map(() => "?").join(",");
  const rows = await input.db.prepare(`
    SELECT chunk.id AS chunkId,
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
    FROM legal_corpus_chunks AS chunk
    INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
    INNER JOIN legal_corpus_versions AS version ON version.id=provision.version_id
    INNER JOIN legal_corpus_variants AS variant ON variant.id=provision.variant_id
    INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
    WHERE chunk.id IN (${placeholders})
      AND document.availability_status='ready'
      AND (?=0 OR document.provider='lex_uz')
      AND (
        (? IS NULL AND variant.current_version_id=version.id
          AND (?=1 OR provision.status='active'))
        OR
        (? IS NOT NULL AND version.valid_from IS NOT NULL
          AND version.valid_from<=?
          AND (version.valid_to IS NULL OR version.valid_to>?))
      )
      AND (
        document.scope='global'
        OR (document.scope='tenant' AND ? IS NOT NULL AND document.tenant_id=?)
        OR (document.scope='user' AND ? IS NOT NULL
          AND document.owner_user_id=?
          AND (document.tenant_id IS NULL OR document.tenant_id=?)
          AND (document.matter_id IS NULL OR document.matter_id=?))
      )
  `).bind(
    ...chunkIds,
    input.officialOnly ? 1 : 0,
    asOfDate, scope.includeHistorical ? 1 : 0,
    asOfDate, asOfDate, asOfDate,
    tenantId, tenantId,
    userId, userId, tenantId, matterId,
  ).all<SparseRow>();

  const byId = new Map(rows.results
    .filter((row) => scopeAllows(row, scope))
    .map((row) => [row.chunkId, row]));
  return chunkIds.flatMap((chunkId) => {
    const row = byId.get(chunkId);
    if (!row) return [];
    return [{
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
    }];
  });
}

/**
 * Sparse BM25 retrieval over an exportable inverted index of immutable corpus
 * chunks. A dense provider is optional: when it is unavailable, RRF remains
 * deterministic and the grounded answer flow receives only proven evidence.
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
  const terms = toSparseQueryTerms(variants.join(" "));
  if (terms.length === 0) return [];
  const termPlaceholders = terms.map(() => "?").join(",");
  const tenantId = scope.tenantId ?? null;
  const userId = scope.userId ?? null;
  const matterId = scope.matterId ?? null;
  const candidateLimit = Math.min(360, limit * 12);

  const termStats = await input.db.prepare(`
    SELECT term,COUNT(*) AS documentFrequency,
      (SELECT COUNT(*) FROM legal_corpus_chunks) AS corpusCount
    FROM legal_corpus_sparse_terms
    WHERE term IN (${termPlaceholders})
    GROUP BY term
  `).bind(...terms).all<{
    term: string;
    documentFrequency: number;
    corpusCount: number;
  }>();
  const documentFrequency = new Map(termStats.results.map((row) => [
    row.term,
    Number(row.documentFrequency),
  ]));
  const corpusCount = Math.max(1, Number(termStats.results[0]?.corpusCount ?? 1));

  const rows = await input.db.prepare(`
    WITH candidate_chunks AS (
      SELECT sparse.chunk_id AS chunkId,
        SUM(sparse.term_frequency + sparse.title_frequency * 4 + sparse.article_frequency * 8) AS rawScore,
        COUNT(*) AS matchedTermCount,
        json_group_array(json_object(
          'term',sparse.term,
          'termFrequency',sparse.term_frequency,
          'titleFrequency',sparse.title_frequency,
          'articleFrequency',sparse.article_frequency
        )) AS matchedTermsJson
      FROM legal_corpus_sparse_terms AS sparse
      INNER JOIN legal_corpus_chunks AS candidate_chunk ON candidate_chunk.id=sparse.chunk_id
      INNER JOIN legal_corpus_provisions AS candidate_provision ON candidate_provision.id=candidate_chunk.provision_id
      INNER JOIN legal_corpus_versions AS candidate_version ON candidate_version.id=candidate_provision.version_id
      INNER JOIN legal_corpus_variants AS candidate_variant ON candidate_variant.id=candidate_provision.variant_id
      INNER JOIN legal_corpus_documents AS candidate_document ON candidate_document.id=candidate_provision.document_id
      WHERE sparse.term IN (${termPlaceholders})
        AND candidate_document.availability_status='ready'
        AND (?=0 OR candidate_document.provider='lex_uz')
        AND (
          (? IS NULL AND candidate_variant.current_version_id=candidate_version.id
            AND (?=1 OR candidate_provision.status='active'))
          OR
          (? IS NOT NULL AND candidate_version.valid_from IS NOT NULL
            AND candidate_version.valid_from<=?
            AND (candidate_version.valid_to IS NULL OR candidate_version.valid_to>?))
        )
        AND (
          candidate_document.scope='global'
          OR (candidate_document.scope='tenant' AND ? IS NOT NULL AND candidate_document.tenant_id=?)
          OR (candidate_document.scope='user' AND ? IS NOT NULL
            AND candidate_document.owner_user_id=?
            AND (candidate_document.tenant_id IS NULL OR candidate_document.tenant_id=?)
            AND (candidate_document.matter_id IS NULL OR candidate_document.matter_id=?))
        )
      GROUP BY sparse.chunk_id
      ORDER BY rawScore DESC,matchedTermCount DESC,sparse.chunk_id ASC
      LIMIT ?
    )
    SELECT candidate.chunkId AS chunkId,
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
      document.owner_user_id AS ownerUserId,document.matter_id AS matterId,
      chunk.sparse_terms_json AS sparseTermsJson,
      candidate.matchedTermsJson AS matchedTermsJson,
      candidate.matchedTermCount AS matchedTermCount
    FROM candidate_chunks AS candidate
    INNER JOIN legal_corpus_chunks AS chunk ON chunk.id=candidate.chunkId
    INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
    INNER JOIN legal_corpus_versions AS version ON version.id=provision.version_id
    INNER JOIN legal_corpus_variants AS variant ON variant.id=provision.variant_id
    INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
    ORDER BY candidate.rawScore DESC,candidate.matchedTermCount DESC,provision.sequence ASC
  `).bind(
    ...terms,
    input.officialOnly ? 1 : 0,
    asOfDate, scope.includeHistorical ? 1 : 0,
    asOfDate, asOfDate, asOfDate,
    tenantId, tenantId,
    userId, userId, tenantId, matterId,
    candidateLimit,
  ).all<SparseCandidateRow>();

  const candidates = rows.results.filter((row) => scopeAllows(row, scope));
  const lengths = candidates.map((row) => {
    try {
      const entries = JSON.parse(row.sparseTermsJson) as SparseMatchedTerm[];
      return Math.max(1, entries.reduce((total, entry) => total
        + Number(entry.termFrequency ?? 0)
        + Number(entry.titleFrequency ?? 0)
        + Number(entry.articleFrequency ?? 0), 0));
    } catch {
      return 1;
    }
  });
  const averageLength = lengths.length > 0
    ? lengths.reduce((total, length) => total + length, 0) / lengths.length
    : 1;
  const k1 = 1.2;
  const b = 0.75;
  const scored = candidates.map((row, index) => {
    let matched: SparseMatchedTerm[] = [];
    try {
      matched = JSON.parse(row.matchedTermsJson) as SparseMatchedTerm[];
    } catch {
      matched = [];
    }
    const documentLength = lengths[index] ?? 1;
    const score = matched.reduce((total, entry) => {
      const frequency = Number(entry.termFrequency ?? 0)
        + Number(entry.titleFrequency ?? 0) * 4
        + Number(entry.articleFrequency ?? 0) * 8;
      const df = Math.max(1, documentFrequency.get(entry.term) ?? 1);
      const idf = Math.log(1 + (corpusCount - df + 0.5) / (df + 0.5));
      const denominator = frequency + k1 * (1 - b + b * (documentLength / averageLength));
      return total + idf * ((frequency * (k1 + 1)) / Math.max(denominator, 0.0001));
    }, 0);
    return { row, score };
  }).sort((left, right) => right.score - left.score
    || right.row.matchedTermCount - left.row.matchedTermCount
    || left.row.chunkId.localeCompare(right.row.chunkId));

  const sparse = scored.slice(0, limit * 2)
    .map(({ row }, index) => ({
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
  let hydratedDense: LegalCorpusRetrievalItem[] = [];
  if (input.denseSearch) {
    try {
      dense = await input.denseSearch(input.query.slice(0, MAX_QUERY_LENGTH), limit * 2);
      hydratedDense = await hydrateDenseCandidates({
        db: input.db,
        candidates: dense,
        scope,
        officialOnly: input.officialOnly ?? false,
      });
    } catch {
      // Dense search is an optional provider. Sparse results remain a safe,
      // complete fallback and no provider error is surfaced as legal evidence.
      dense = [];
      hydratedDense = [];
    }
  }
  return reciprocalRankFusion(sparse, dense, limit, hydratedDense);
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
