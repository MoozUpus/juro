import {
  detectArticleNumbers,
  detectLegalQueryLanguage,
  normalizeLegalSearchQuery,
  transliterateUzbek,
  transliterateUzbekToCyrillic,
} from "../legal/legal-language";
import {
  canAccessCorpusScope,
  type LegalCorpusLanguage,
  type LegalCorpusSourceClass,
} from "./trust";
import { sparseStorageMode } from "./sparse-index";

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
  documentNumber: string | null;
  adoptingAuthority: string | null;
  sourceClass: LegalCorpusSourceClass;
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
  /** Raw provider similarity, used only for coverage calibration. */
  semanticScore?: number;
  fusionScore?: number;
  /** True only after an exact immutable D1 window was loaded around the hit. */
  windowHydrated?: boolean;
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
  sparseLength: number;
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
  if (language === "uz-Latn" || language === "mixed") variants.add(transliterateUzbekToCyrillic(trimmed));
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

function sparseEntriesForTermsSql(
  mode: "legacy" | "compressed",
  placeholders: string,
): string {
  const legacy = `SELECT sparse.term AS term,sparse.chunk_id AS chunkId,
    sparse.term_frequency AS termFrequency,sparse.title_frequency AS titleFrequency,
    sparse.article_frequency AS articleFrequency
    FROM legal_corpus_sparse_terms AS sparse
    WHERE sparse.term IN (${placeholders})`;
  if (mode === "legacy") return legacy;
  return `${legacy}
    UNION ALL
    SELECT term.term AS term,chunk_key.chunk_id AS chunkId,
      posting.term_frequency AS termFrequency,posting.title_frequency AS titleFrequency,
      posting.article_frequency AS articleFrequency
    FROM legal_corpus_sparse_term_dictionary AS term
    INNER JOIN legal_corpus_sparse_postings AS posting ON posting.term_id=term.id
    INNER JOIN legal_corpus_sparse_chunk_keys AS chunk_key ON chunk_key.id=posting.chunk_key_id
    WHERE term.term IN (${placeholders})`;
}

function sparseEntriesForCandidateChunkSql(mode: "legacy" | "compressed"): string {
  const legacy = `SELECT sparse.term_frequency AS termFrequency,
    sparse.title_frequency AS titleFrequency,sparse.article_frequency AS articleFrequency
    FROM legal_corpus_sparse_terms AS sparse
    WHERE sparse.chunk_id=candidate.chunkId`;
  if (mode === "legacy") return legacy;
  return `${legacy}
    UNION ALL
    SELECT posting.term_frequency AS termFrequency,
      posting.title_frequency AS titleFrequency,posting.article_frequency AS articleFrequency
    FROM legal_corpus_sparse_chunk_keys AS chunk_key
    INNER JOIN legal_corpus_sparse_postings AS posting ON posting.chunk_key_id=chunk_key.id
    WHERE chunk_key.chunk_id=candidate.chunkId`;
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
    byChunk.set(item.chunkId, { ...existing, denseRank: index + 1, semanticScore: item.score });
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
  // Candidate recall favors passages covering more distinct query concepts.
  // Repeated occurrences of one common token are only a secondary signal;
  // final ordering is calculated by BM25 after this bounded SQL selection.
  const rows = await input.db.prepare(`
    SELECT chunk.id AS chunkId,
      document.id AS documentId,coalesce(variant.title,document.title) AS documentTitle,
      document.document_type AS documentType,document.document_number AS documentNumber,
      document.adopting_authority AS adoptingAuthority,document.source_class AS sourceClass,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      chunk.content_text AS exactQuote,
      provision.source_url AS sourceUrl,provision.language AS language,
      provision.status AS status,provision.valid_from AS validFrom,
      coalesce(provision.valid_to,version.valid_to) AS validTo,
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
      AND (?=0 OR (document.provider='lex_uz'
        AND document.source_class='OFFICIAL_LEGISLATION'
        AND document.scope='global'))
      AND (
        (? IS NULL AND variant.current_version_id=version.id
          AND (?=1 OR provision.status='active'))
        OR
        (? IS NOT NULL AND version.valid_from IS NOT NULL
          AND version.valid_from<=?
          AND (version.valid_to IS NULL OR version.valid_to>?))
      )
      AND (
        ? IS NULL OR version.version_number=(
          SELECT max(applicable.version_number)
          FROM legal_corpus_versions AS applicable
          WHERE applicable.variant_id=version.variant_id
            AND applicable.valid_from IS NOT NULL
            AND applicable.valid_from<=?
            AND (applicable.valid_to IS NULL OR applicable.valid_to>?)
        )
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
      documentNumber: row.documentNumber,
      adoptingAuthority: row.adoptingAuthority,
      sourceClass: row.sourceClass,
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
  const sparseMode = await sparseStorageMode(input.db);
  const sparseTermBindings = sparseMode === "compressed" ? [...terms, ...terms] : terms;
  const sparseEntriesForTerms = sparseEntriesForTermsSql(sparseMode, termPlaceholders);
  const sparseEntriesForCandidateChunk = sparseEntriesForCandidateChunkSql(sparseMode);
  const tenantId = scope.tenantId ?? null;
  const userId = scope.userId ?? null;
  const matterId = scope.matterId ?? null;
  const candidateLimit = Math.min(360, limit * 12);

  const termStats = await input.db.prepare(`
    WITH sparse_entries AS (${sparseEntriesForTerms})
    SELECT term,COUNT(*) AS documentFrequency
    FROM sparse_entries
    GROUP BY term
  `).bind(...sparseTermBindings).all<{
    term: string;
    documentFrequency: number;
  }>();
  const documentFrequency = new Map(termStats.results.map((row) => [
    row.term,
    Number(row.documentFrequency),
  ]));
  // A global COUNT(*) over the complete chunk table made every interactive
  // search scan the full corpus merely to calculate BM25's N. On the staging
  // corpus that is more than one million rows and can consume the entire chat
  // deadline before candidate retrieval begins. Query-relative N preserves
  // the useful IDF ordering (rare query terms outrank common query terms)
  // while touching only the postings already selected by the bounded query.
  const corpusCount = Math.max(
    2,
    ...termStats.results.map((row) => Math.max(1, Number(row.documentFrequency)) + 1),
  );

  const rows = await input.db.prepare(`
    WITH sparse_entries AS (${sparseEntriesForTerms}),
    candidate_chunks AS (
      SELECT sparse.chunkId AS chunkId,
        SUM(sparse.termFrequency + sparse.titleFrequency * 4 + sparse.articleFrequency * 8) AS rawScore,
        COUNT(*) AS matchedTermCount,
        json_group_array(json_object(
          'term',sparse.term,
          'termFrequency',sparse.termFrequency,
          'titleFrequency',sparse.titleFrequency,
          'articleFrequency',sparse.articleFrequency
        )) AS matchedTermsJson
      FROM sparse_entries AS sparse
      INNER JOIN legal_corpus_chunks AS candidate_chunk ON candidate_chunk.id=sparse.chunkId
      INNER JOIN legal_corpus_provisions AS candidate_provision ON candidate_provision.id=candidate_chunk.provision_id
      INNER JOIN legal_corpus_versions AS candidate_version ON candidate_version.id=candidate_provision.version_id
      INNER JOIN legal_corpus_variants AS candidate_variant ON candidate_variant.id=candidate_provision.variant_id
      INNER JOIN legal_corpus_documents AS candidate_document ON candidate_document.id=candidate_provision.document_id
      WHERE candidate_document.availability_status='ready'
        AND (?=0 OR (candidate_document.provider='lex_uz'
          AND candidate_document.source_class='OFFICIAL_LEGISLATION'
          AND candidate_document.scope='global'))
        AND (
          (? IS NULL AND candidate_variant.current_version_id=candidate_version.id
            AND (?=1 OR candidate_provision.status='active'))
          OR
          (? IS NOT NULL AND candidate_version.valid_from IS NOT NULL
            AND candidate_version.valid_from<=?
            AND (candidate_version.valid_to IS NULL OR candidate_version.valid_to>?))
        )
        AND (
          ? IS NULL OR candidate_version.version_number=(
            SELECT max(applicable.version_number)
            FROM legal_corpus_versions AS applicable
            WHERE applicable.variant_id=candidate_version.variant_id
              AND applicable.valid_from IS NOT NULL
              AND applicable.valid_from<=?
              AND (applicable.valid_to IS NULL OR applicable.valid_to>?)
          )
        )
        AND (
          candidate_document.scope='global'
          OR (candidate_document.scope='tenant' AND ? IS NOT NULL AND candidate_document.tenant_id=?)
          OR (candidate_document.scope='user' AND ? IS NOT NULL
            AND candidate_document.owner_user_id=?
            AND (candidate_document.tenant_id IS NULL OR candidate_document.tenant_id=?)
            AND (candidate_document.matter_id IS NULL OR candidate_document.matter_id=?))
        )
      GROUP BY sparse.chunkId
      ORDER BY matchedTermCount DESC,rawScore DESC,sparse.chunkId ASC
      LIMIT ?
    )
    SELECT candidate.chunkId AS chunkId,
      document.id AS documentId,coalesce(variant.title,document.title) AS documentTitle,
      document.document_type AS documentType,document.document_number AS documentNumber,
      document.adopting_authority AS adoptingAuthority,document.source_class AS sourceClass,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      chunk.content_text AS exactQuote,
      provision.source_url AS sourceUrl,provision.language AS language,
      provision.status AS status,provision.valid_from AS validFrom,
      coalesce(provision.valid_to,version.valid_to) AS validTo,
      version.version_date AS versionDate,version.fetched_at AS fetchedAt,
      chunk.content_sha256 AS contentHash,
      document.provider AS provider,
      document.scope AS scope,document.tenant_id AS tenantId,
      document.owner_user_id AS ownerUserId,document.matter_id AS matterId,
      coalesce((SELECT sum(length_term.termFrequency
          + length_term.titleFrequency + length_term.articleFrequency)
        FROM (${sparseEntriesForCandidateChunk}) AS length_term),1) AS sparseLength,
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
    ...sparseTermBindings,
    input.officialOnly ? 1 : 0,
    asOfDate, scope.includeHistorical ? 1 : 0,
    asOfDate, asOfDate, asOfDate,
    asOfDate, asOfDate, asOfDate,
    tenantId, tenantId,
    userId, userId, tenantId, matterId,
    candidateLimit,
  ).all<SparseCandidateRow>();

  const candidates = rows.results.filter((row) => scopeAllows(row, scope));
  const lengths = candidates.map((row) => Math.max(1, Number(row.sparseLength ?? 1)));
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
      documentNumber: row.documentNumber,
      adoptingAuthority: row.adoptingAuthority,
      sourceClass: row.sourceClass,
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
  preferredLanguage?: LegalCorpusLanguage;
}): "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage" {
  if (input.sources.length === 0) return "no_coverage";
  const requestedArticles = detectArticleNumbers(input.query);
  const foundArticles = new Set(input.sources.map((source) => source.articleNumber).filter(Boolean));
  if (requestedArticles.length > 0 && requestedArticles.some((article) => !foundArticles.has(article))) {
    return foundArticles.size > 0 ? "partial_coverage" : "weak_coverage";
  }
  const best = input.sources.reduce((score, source) => {
    const normalizedFusion = Math.min(1, Math.max(0, (source.fusionScore ?? 0) * (RRF_K + 1) / 2));
    const semantic = source.semanticScore === undefined
      ? normalizedFusion
      : Math.min(1, Math.max(0, source.semanticScore));
    const officialQuality = source.provider === "lex_uz"
      && Boolean(source.sourceUrl)
      && /^[a-f0-9]{64}$/u.test(source.contentHash)
      && source.exactQuote.trim().length >= 40 ? 1 : 0;
    const versionQuality = source.status === "active" && source.validTo === null ? 1 : 0;
    const languageQuality = !input.preferredLanguage || source.language === input.preferredLanguage ? 1 : 0.65;
    const hydrationQuality = source.windowHydrated === false ? 0 : 1;
    return Math.max(score,
      normalizedFusion * 0.25
      + semantic * 0.15
      + officialQuality * 0.25
      + versionQuality * 0.15
      + languageQuality * 0.10
      + hydrationQuality * 0.10,
    );
  }, 0);
  if (best >= 0.76) return "good_coverage";
  if (best >= 0.56) return "partial_coverage";
  return "weak_coverage";
}
