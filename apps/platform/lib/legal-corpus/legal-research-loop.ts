import type { LegalSourceSpan } from "../ai/provider";
import type { LegalCorpusLanguage } from "./trust";
import {
  retrieveLegalCorpus,
  type DenseCorpusCandidate,
  type LegalCorpusRetrievalItem,
  type LegalCorpusSearchScope,
} from "./retrieval";

const RRF_K = 60;
// A remote D1-backed local run pays a network round trip for each search. Keep
// the original wording plus three independent statutory hypotheses inside the
// interactive deadline. Cross-facet formulations below fill missing/duplicate
// planner slots without adding unbounded remote work.
const MAX_RESEARCH_QUERIES = 4;
const MAX_HYDRATED_HITS = 4;
const MAX_RERANK_CANDIDATES = 12;
const MAX_CANDIDATES_PER_QUERY = 3;
const MIN_SHARED_TERM_FRAGMENT = 4;
const MAX_RELEVANCE_TERM_LENGTH = 24;

export type JuroActRecord = {
  documentId: string;
  title: string;
  documentType: string | null;
  documentNumber: string | null;
  adoptingAuthority: string | null;
  adoptionDate: string | null;
  publicationDate: string | null;
  language: LegalCorpusLanguage;
  status: LegalCorpusRetrievalItem["status"];
  validFrom: string | null;
  validTo: string | null;
  versionDate: string | null;
  sourceUrl: string;
  fetchedAt: string;
};

export type JuroLegalResearchHit = {
  passage: LegalCorpusRetrievalItem;
  act: JuroActRecord;
  spans: LegalSourceSpan[];
  /**
   * The anchor plus independently responsive provisions from its exact
   * bounded neighbourhood. Each one can become its own citation card.
   */
  responsiveSpans: LegalSourceSpan[];
  selectionMethod: "semantic_reranker" | "deterministic_fallback";
  exactWindowHydrated: boolean;
  matchedQueries: string[];
};

export type JuroLegalResearchResult = {
  hits: JuroLegalResearchHit[];
  queriesRun: number;
  retrievedCandidateCount: number;
  rerankCandidateCount: number;
  rerankedCandidateCount: number;
  rerankingOutcome: "not_configured" | "not_needed" | "selected" | "rejected" | "deterministic_fallback" | "failed_closed";
  rerankingFailureCode: string | null;
  exactWindowSuccesses: number;
  denseUnavailable: boolean;
};

export type JuroLegalResearchCandidate = {
  passage: LegalCorpusRetrievalItem;
  matchedQueries: string[];
};

export type JuroLegalCandidateReranker = (input: {
  question: string;
  candidates: readonly JuroLegalResearchCandidate[];
  limit: number;
}) => Promise<readonly string[]>;

export type JuroLegalRequiredConcept = {
  alternatives: readonly string[];
};

type IndexedSearch = (input: {
  db: D1Database;
  query: string;
  scope?: LegalCorpusSearchScope;
  limit?: number;
  denseSearch?: (query: string, limit: number) => Promise<DenseCorpusCandidate[]>;
  officialOnly?: boolean;
}) => Promise<LegalCorpusRetrievalItem[]>;

/**
 * The only corpus capabilities the interactive research loop needs. Keeping
 * this boundary read-only lets local development delegate retrieval to the
 * staging corpus without exposing staging D1 to the rest of the application.
 */
export type JuroLegalCorpusReadTools = {
  findLegalSources(input: {
    query: string;
    locale: "ru" | "uz";
    scope?: LegalCorpusSearchScope;
    limit?: number;
  }): Promise<LegalCorpusRetrievalItem[]>;
  inspectLegalAct(input: { anchorChunkId: string }): Promise<JuroActRecord | null>;
  readLegalProvisions(input: {
    anchorChunkId: string;
    before?: number;
    after?: number;
  }): Promise<LegalSourceSpan[]>;
};

function normalizeQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 900);
}

function passageIdentity(item: LegalCorpusRetrievalItem): string {
  return [
    item.documentId,
    item.versionDate ?? item.validFrom ?? "current",
    item.articleNumber ?? "",
    item.chunkId,
  ].join("\u001f");
}

function relevanceTerms(value: string): string[] {
  const normalized = value.normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[‘’ʼʻ']/gu, "");
  return [...new Set(normalized.match(/[\p{L}]{4,}|[\p{N}]{2,}/gu) ?? [])]
    .slice(0, 48);
}

/** Bounded prefix-root comparison without a vocabulary or topic switch. */
function sharesTermFragment(left: string, right: string): boolean {
  const a = left.slice(0, MAX_RELEVANCE_TERM_LENGTH);
  const b = right.slice(0, MAX_RELEVANCE_TERM_LENGTH);
  if (a === b) return true;
  if (a.length < MIN_SHARED_TERM_FRAGMENT || b.length < MIN_SHARED_TERM_FRAGMENT) return false;
  // Internal/suffix n-grams make unrelated nominalisations collide (for
  // example words ending in the same "-ение" suffix). A shared leading root
  // keeps ordinary Russian/Uzbek inflections while avoiding that failure.
  return a.slice(0, MIN_SHARED_TERM_FRAGMENT) === b.slice(0, MIN_SHARED_TERM_FRAGMENT);
}

function passageQueryMatchCount(item: LegalCorpusRetrievalItem, query: string): number {
  const queryTerms = relevanceTerms(query);
  if (queryTerms.length === 0) return 0;
  const passageTerms = relevanceTerms([
    item.documentTitle,
    item.articleNumber,
    item.articleTitle,
    item.exactQuote,
  ].filter(Boolean).join(" "));
  const matches = queryTerms.filter((term) => passageTerms.some((candidate) =>
    sharesTermFragment(term, candidate)
  )).length;
  return matches;
}

function passageMatchesQuery(item: LegalCorpusRetrievalItem, query: string): boolean {
  const queryTerms = relevanceTerms(query);
  if (queryTerms.length === 0) return false;
  const matches = passageQueryMatchCount(item, query);
  // One-term lookups remain useful. Natural-language research tasks must share
  // multiple concepts, which prevents a high-ranked hit on one generic word
  // from being mistaken for evidence answering the question.
  const required = queryTerms.length === 1
    ? 1
    : Math.min(4, Math.max(2, Math.ceil(queryTerms.length / 4)));
  return matches >= required;
}

function passageMatchesRequiredConcepts(
  item: LegalCorpusRetrievalItem,
  concepts: readonly JuroLegalRequiredConcept[],
): boolean {
  if (concepts.length === 0) return true;
  const passageTerms = relevanceTerms([
    item.documentTitle,
    item.articleNumber,
    item.articleTitle,
    item.exactQuote,
  ].filter(Boolean).join(" "));
  return concepts.every((concept) => concept.alternatives.some((alternative) => {
    const terms = relevanceTerms(alternative);
    if (terms.length === 0) return false;
    const matches = terms.filter((term) => passageTerms.some((candidate) =>
      sharesTermFragment(term, candidate)
    )).length;
    const required = terms.length === 1 ? 1 : Math.min(3, Math.max(2, Math.ceil(terms.length / 3)));
    return matches >= required;
  }));
}

function preferredLanguage(locale: "ru" | "uz", query: string): LegalCorpusLanguage {
  if (locale === "ru") return "ru";
  return /[ўқғҳ]/iu.test(query) ? "uz-Cyrl" : "uz-Latn";
}

function crossFacetQueries(concepts: readonly JuroLegalRequiredConcept[]): string[] {
  const usable = concepts
    .map((concept) => concept.alternatives.map(normalizeQuery).filter(Boolean).slice(0, 5))
    .filter((alternatives) => alternatives.length > 0);
  const width = Math.min(3, Math.max(0, ...usable.map((alternatives) => alternatives.length)));
  const queries: string[] = [];
  for (let alternativeIndex = 0; alternativeIndex < width; alternativeIndex += 1) {
    const query = normalizeQuery(usable
      .map((alternatives) => alternatives[alternativeIndex] ?? alternatives[0] ?? "")
      .filter(Boolean)
      .join(" "));
    if (query) queries.push(query);
  }
  return queries;
}

/** JURO's bounded hybrid corpus primitive. It never fetches arbitrary URLs. */
export async function findJuroLegalPassages(input: {
  db: D1Database;
  query: string;
  scope?: LegalCorpusSearchScope;
  limit?: number;
  denseSearch?: (query: string, limit: number) => Promise<DenseCorpusCandidate[]>;
  search?: IndexedSearch;
}): Promise<LegalCorpusRetrievalItem[]> {
  const query = normalizeQuery(input.query);
  if (!query) return [];
  return (input.search ?? retrieveLegalCorpus)({
    db: input.db,
    query,
    scope: input.scope,
    limit: Math.max(1, Math.min(input.limit ?? 8, 20)),
    denseSearch: input.denseSearch,
    officialOnly: true,
  });
}

/** Loads server-owned metadata for the immutable version containing a hit. */
export async function inspectJuroActRecord(input: {
  db: D1Database;
  anchorChunkId: string;
}): Promise<JuroActRecord | null> {
  if (!/^[A-Za-z0-9:_-]{1,200}$/u.test(input.anchorChunkId)) return null;
  const row = await input.db.prepare(`
    SELECT document.id AS documentId,coalesce(variant.title,document.title) AS title,
      document.document_type AS documentType,document.document_number AS documentNumber,
      document.adopting_authority AS adoptingAuthority,document.adoption_date AS adoptionDate,
      document.publication_date AS publicationDate,variant.language AS language,
      version.status AS status,version.valid_from AS validFrom,version.valid_to AS validTo,
      version.version_date AS versionDate,coalesce(version.source_url,variant.source_url) AS sourceUrl,
      version.fetched_at AS fetchedAt
    FROM legal_corpus_chunks AS chunk
    INNER JOIN legal_corpus_versions AS version ON version.id=chunk.version_id
    INNER JOIN legal_corpus_variants AS variant ON variant.id=version.variant_id
    INNER JOIN legal_corpus_documents AS document ON document.id=variant.document_id
    WHERE chunk.id=? AND document.provider='lex_uz'
      AND document.source_class='OFFICIAL_LEGISLATION'
      AND document.scope='global' AND document.availability_status='ready'
    LIMIT 1
  `).bind(input.anchorChunkId).first<JuroActRecord>();
  return row?.sourceUrl ? row : null;
}

/**
 * Hydrates an exact, sequential D1 window around a hit. Every returned span
 * carries the hash stored with that immutable chunk; no model text is used.
 */
export async function loadJuroProvisionWindow(input: {
  db: D1Database;
  anchorChunkId: string;
  before?: number;
  after?: number;
}): Promise<LegalSourceSpan[]> {
  if (!/^[A-Za-z0-9:_-]{1,200}$/u.test(input.anchorChunkId)) return [];
  const before = Math.max(0, Math.min(input.before ?? 2, 12));
  const after = Math.max(0, Math.min(input.after ?? 4, 24));
  const rows = await input.db.prepare(`
    WITH anchor AS (
      SELECT chunk.id AS chunkId,provision.version_id AS versionId,provision.sequence AS sequence
      FROM legal_corpus_chunks AS chunk
      INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
      INNER JOIN legal_corpus_documents AS document ON document.id=provision.document_id
      WHERE chunk.id=? AND document.provider='lex_uz'
        AND document.source_class='OFFICIAL_LEGISLATION'
        AND document.scope='global' AND document.availability_status='ready'
      LIMIT 1
    )
    SELECT chunk.id AS chunkId,chunk.chunk_index AS chunkIndex,chunk.total_chunks AS totalChunks,
      chunk.content_text AS text,chunk.content_sha256 AS textSha256,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      provision.part AS part,provision.sequence AS sequence
    FROM anchor
    INNER JOIN legal_corpus_provisions AS provision ON provision.version_id=anchor.versionId
      AND provision.sequence BETWEEN MAX(0,anchor.sequence-?) AND anchor.sequence+?
    INNER JOIN legal_corpus_chunks AS chunk ON chunk.provision_id=provision.id
    ORDER BY CASE WHEN chunk.id=anchor.chunkId THEN 0 ELSE 1 END,
      ABS(provision.sequence-anchor.sequence),provision.sequence,chunk.chunk_index
    LIMIT 64
  `).bind(input.anchorChunkId, before, after).all<{
    chunkId: string;
    chunkIndex: number;
    totalChunks: number;
    text: string;
    textSha256: string;
    articleNumber: string | null;
    articleTitle: string | null;
    part: string | null;
    sequence: number;
  }>();
  return rows.results.flatMap((row) => {
    if (!row.text.trim() || !/^[a-f0-9]{64}$/u.test(row.textSha256)) return [];
    const article = row.articleNumber
      ? [row.articleNumber, row.articleTitle].filter(Boolean).join(". ")
      : row.articleTitle;
    return [{
      id: row.chunkId,
      article: article ?? null,
      paragraph: row.part ?? `chunk:${row.chunkIndex + 1}/${row.totalChunks}`,
      text: row.text,
      textSha256: row.textSha256,
      quality: "high" as const,
      provisionSequence: row.sequence,
    }];
  });
}

/**
 * Bounded agentic research loop: the model may propose search tasks, while the
 * server owns execution, act inspection, exact-window hydration, deduplication,
 * iteration count, and final evidence. The first original-query search starts
 * before model understanding completes.
 */
export async function runJuroLegalResearchLoop(input: {
  db: D1Database;
  originalQuery: string;
  generatedQueries?: readonly string[] | Promise<readonly string[]>;
  rerankingQuestion?: string | Promise<string>;
  requiredConcepts?: readonly JuroLegalRequiredConcept[] | Promise<readonly JuroLegalRequiredConcept[]>;
  locale: "ru" | "uz";
  scope?: LegalCorpusSearchScope;
  limit?: number;
  denseSearch?: (query: string, limit: number) => Promise<DenseCorpusCandidate[]>;
  search?: IndexedSearch;
  readTools?: JuroLegalCorpusReadTools;
  rerankCandidates?: JuroLegalCandidateReranker;
}): Promise<JuroLegalResearchResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 8, MAX_HYDRATED_HITS));
  const original = normalizeQuery(input.originalQuery);
  const readTools: JuroLegalCorpusReadTools = input.readTools ?? {
    findLegalSources: ({ query, scope, limit: searchLimit }) => findJuroLegalPassages({
      db: input.db,
      query,
      scope,
      limit: searchLimit,
      denseSearch: input.denseSearch,
      search: input.search,
    }),
    inspectLegalAct: ({ anchorChunkId }) => inspectJuroActRecord({
      db: input.db,
      anchorChunkId,
    }),
    readLegalProvisions: ({ anchorChunkId, before, after }) => loadJuroProvisionWindow({
      db: input.db,
      anchorChunkId,
      before,
      after,
    }),
  };
  const firstSearch = readTools.findLegalSources({
    query: original,
    locale: input.locale,
    scope: input.scope,
    limit: limit * 2,
  });
  const [proposed, resolvedRerankingQuestion, resolvedRequiredConcepts] = await Promise.all([
    Promise.resolve(input.generatedQueries ?? []),
    Promise.resolve(input.rerankingQuestion ?? original),
    Promise.resolve(input.requiredConcepts ?? []),
  ]);
  const rerankingQuestion = normalizeQuery(resolvedRerankingQuestion) || original;
  const requiredConcepts = resolvedRequiredConcepts.slice(0, 5).map((concept) => ({
    alternatives: concept.alternatives.map(normalizeQuery).filter(Boolean).slice(0, 5),
  })).filter((concept) => concept.alternatives.length > 0);
  const queries = [...new Set([
    original,
    ...proposed.map(normalizeQuery),
    ...crossFacetQueries(requiredConcepts),
  ].filter(Boolean))]
    .slice(0, MAX_RESEARCH_QUERIES);
  const remainingSearches = queries.slice(1).map((query) => readTools.findLegalSources({
    query,
    locale: input.locale,
    scope: input.scope,
    limit: limit * 2,
  }));
  const rankedLists = await Promise.all([firstSearch, ...remainingSearches]);
  const byIdentity = new Map<string, LegalCorpusRetrievalItem>();
  const scores = new Map<string, number>();
  const matchedQueries = new Map<string, Set<string>>();
  rankedLists.forEach((items, queryIndex) => items.forEach((item, rank) => {
    const identity = passageIdentity(item);
    const current = byIdentity.get(identity);
    const preferred = preferredLanguage(input.locale, original);
    if (!current || (item.language === preferred && current.language !== preferred)) {
      byIdentity.set(identity, item);
    }
    scores.set(identity, (scores.get(identity) ?? 0) + 1 / (RRF_K + rank + 1));
    const matches = matchedQueries.get(identity) ?? new Set<string>();
    matches.add(queries[queryIndex] ?? original);
    matchedQueries.set(identity, matches);
  }));
  const preferred = preferredLanguage(input.locale, original);
  const fusedRanking = [...byIdentity.entries()]
    .map(([identity, item]) => ({
      identity,
      item: { ...item, fusionScore: scores.get(identity) ?? item.fusionScore ?? 0 },
    }))
    .sort((left, right) => (right.item.fusionScore ?? 0) - (left.item.fusionScore ?? 0)
      || Number(right.item.language === preferred) - Number(left.item.language === preferred)
      || left.item.chunkId.localeCompare(right.item.chunkId));

  // Sparse retrieval already proves that a candidate matched at least one
  // request-owned query term. The semantic cross-encoder must inspect that
  // complete bounded set: applying a second prefix-overlap threshold here
  // used to erase statutory paraphrases before semantic ranking. Only the
  // no-model deterministic fallback retains both conservative lexical gates.
  const deterministicCandidates = fusedRanking
    .filter(({ identity, item }) => [...(matchedQueries.get(identity) ?? [])]
      .some((query) => passageMatchesQuery(item, query)))
    .filter(({ item }) => passageMatchesRequiredConcepts(item, requiredConcepts))
    .slice(0, MAX_RERANK_CANDIDATES);
  const strictSemanticFallbackCandidates = requiredConcepts.length >= 2
    ? deterministicCandidates.filter(({ item }) => passageMatchesQuery(item, rerankingQuestion))
    : [];
  const repeatedQueryFallbackCandidates = requiredConcepts.length >= 1
    ? deterministicCandidates.filter(({ identity }) => (matchedQueries.get(identity)?.size ?? 0) >= 2)
    : [];
  const semanticFallbackCandidates = [...new Map([
    ...strictSemanticFallbackCandidates,
    ...repeatedQueryFallbackCandidates,
  ].map((candidate) => [candidate.identity, candidate])).values()];
  const fusedByIdentity = new Map(fusedRanking.map((candidate) => [candidate.identity, candidate]));
  const diversifiedCandidates: typeof fusedRanking = [];
  const diversifiedIdentities = new Set<string>();
  // Round-robin selection prevents the first verbose query from consuming the
  // entire cross-encoder budget before later ambiguity/facet branches get one
  // candidate represented.
  for (let rank = 0; rank < MAX_CANDIDATES_PER_QUERY; rank += 1) {
    rankedLists.forEach((items) => {
      if (diversifiedCandidates.length >= MAX_RERANK_CANDIDATES) return;
      const item = items[rank];
      if (!item) return;
      const identity = passageIdentity(item);
      const candidate = fusedByIdentity.get(identity);
      if (!candidate) return;
      if (!diversifiedIdentities.has(identity)) {
        diversifiedIdentities.add(identity);
        diversifiedCandidates.push(candidate);
      }
    });
  }
  for (const candidate of fusedRanking) {
    if (diversifiedCandidates.length >= MAX_RERANK_CANDIDATES) break;
    if (diversifiedIdentities.has(candidate.identity)) continue;
    diversifiedIdentities.add(candidate.identity);
    diversifiedCandidates.push(candidate);
  }
  const candidatePool = diversifiedCandidates.slice(0, MAX_RERANK_CANDIDATES);

  // When a semantic reranker is configured, its decision is the safety gate:
  // an empty answer means that no candidate directly covers the question, and
  // an unavailable reranker must not silently turn a keyword collision into
  // legal evidence. The deterministic path remains available to deployments
  // that intentionally run without a reranker.
  let fused = input.rerankCandidates ? [] : deterministicCandidates;
  let rerankedCandidateCount = 0;
  let rerankingOutcome: JuroLegalResearchResult["rerankingOutcome"] = input.rerankCandidates
    ? candidatePool.length > 0 ? "failed_closed" : "not_needed"
    : "not_configured";
  let rerankingFailureCode: string | null = null;
  if (input.rerankCandidates && candidatePool.length > 0) {
    try {
      const rankedChunkIds = await input.rerankCandidates({
        question: rerankingQuestion,
        candidates: candidatePool.map(({ identity, item }) => ({
          passage: item,
          matchedQueries: [...(matchedQueries.get(identity) ?? [])],
        })),
        limit,
      });
      const byChunkId = new Map(candidatePool.map((candidate) => [candidate.item.chunkId, candidate]));
      const modelRanked = [...new Set(rankedChunkIds)]
        .slice(0, limit)
        .flatMap((chunkId) => {
          const candidate = byChunkId.get(chunkId);
          return candidate ? [candidate] : [];
        });
      rerankedCandidateCount = modelRanked.length;
      rerankingOutcome = modelRanked.length > 0 ? "selected" : "rejected";
      const selectedIdentities = new Set(modelRanked.map((candidate) => candidate.identity));
      // The cross-encoder decides which candidates survive, but its returned
      // order is not a stable ranking primitive. Reapply the deterministic RRF
      // order after selection so identical candidate decisions always produce
      // an identical source packet, source hash, and citation-card order.
      fused = fusedRanking.filter((candidate) => selectedIdentities.has(candidate.identity));
    } catch (error) {
      // A configured semantic gate that did not complete is different from a
      // deployment with no semantic gate. Retain at most one candidate, and
      // only when the model-produced plan supplied independent facets and the
      // passage either matches the complete standalone question or recurs in
      // at least two separately generated searches.
      // This preserves a direct exact provision during a transient provider
      // failure without restoring the broad keyword-only fallback.
      fused = semanticFallbackCandidates.slice(0, limit);
      rerankingOutcome = fused.length > 0 ? "deterministic_fallback" : "failed_closed";
      const providerCode = (error as { code?: unknown } | null)?.code;
      rerankingFailureCode = typeof providerCode === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(providerCode)
        ? providerCode
        : error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{1,63}$/u.test(error.name)
          ? error.name
          : "RERANK_FAILED";
    }
  }
  fused = fused.slice(0, limit);
  const selectionMethod: JuroLegalResearchHit["selectionMethod"] = rerankingOutcome === "selected"
    ? "semantic_reranker"
    : "deterministic_fallback";

  const hydrated: Array<JuroLegalResearchHit | null> = await Promise.all(fused.map(async ({ identity, item }): Promise<JuroLegalResearchHit | null> => {
    const [act, window] = await Promise.all([
      readTools.inspectLegalAct({ anchorChunkId: item.chunkId }),
      readTools.readLegalProvisions({ anchorChunkId: item.chunkId }),
    ]);
    if (!act) return null;
    const fallbackSpan: LegalSourceSpan = {
      id: item.chunkId,
      article: item.articleNumber,
      paragraph: null,
      text: item.exactQuote,
      textSha256: item.contentHash,
      quality: "high",
    };
    const exactWindowHydrated = window.length > 0;
    const spans = exactWindowHydrated ? window : [fallbackSpan];
    const anchorSpan = spans.find((span) => span.id === item.chunkId) ?? spans[0]!;
    const anchorMatchCount = passageQueryMatchCount(item, rerankingQuestion);
    const responsiveAdjacentSpans = spans.filter((span) => {
      if (span.id === anchorSpan.id) return false;
      if (
        anchorSpan.provisionSequence !== undefined
        && span.provisionSequence !== undefined
        && Math.abs(span.provisionSequence - anchorSpan.provisionSequence) > 1
      ) return false;
      const adjacentPassage: LegalCorpusRetrievalItem = {
        ...item,
        chunkId: span.id,
        articleNumber: span.article,
        articleTitle: span.article,
        exactQuote: span.text,
        contentHash: span.textSha256,
      };
      const adjacentMatchCount = passageQueryMatchCount(adjacentPassage, rerankingQuestion);
      return adjacentMatchCount + 2 >= anchorMatchCount
        && passageMatchesQuery(adjacentPassage, rerankingQuestion)
        && passageMatchesRequiredConcepts(adjacentPassage, requiredConcepts);
    }).slice(0, Math.max(0, limit - 1));
    return {
      passage: { ...item, windowHydrated: exactWindowHydrated },
      act,
      spans,
      responsiveSpans: [anchorSpan, ...responsiveAdjacentSpans],
      selectionMethod,
      exactWindowHydrated,
      matchedQueries: [...(matchedQueries.get(identity) ?? [])],
    };
  }));
  const hits = hydrated.filter((hit): hit is JuroLegalResearchHit => hit !== null);
  return {
    hits,
    queriesRun: queries.length,
    retrievedCandidateCount: fusedRanking.length,
    rerankCandidateCount: candidatePool.length,
    rerankedCandidateCount,
    rerankingOutcome,
    rerankingFailureCode,
    exactWindowSuccesses: hits.filter((hit) => hit.exactWindowHydrated).length,
    denseUnavailable: Boolean(input.denseSearch) && hits.every((hit) => hit.passage.denseRank === undefined),
  };
}
