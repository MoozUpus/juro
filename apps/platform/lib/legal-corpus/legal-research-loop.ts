import type { LegalSourceSpan } from "../ai/provider";
import type { LegalCorpusLanguage } from "./trust";
import {
  retrieveLegalCorpus,
  type DenseCorpusCandidate,
  type LegalCorpusRetrievalItem,
  type LegalCorpusSearchScope,
} from "./retrieval";
import { detectArticleNumbers } from "../legal/legal-language";

const RRF_K = 60;
// A remote D1-backed local run pays a network round trip for each search. Keep
// the original wording plus three independent statutory hypotheses inside the
// interactive deadline. Cross-facet formulations below fill missing/duplicate
// planner slots without adding unbounded remote work.
const MAX_RESEARCH_QUERIES = 6;
const MAX_REPAIR_QUERIES = 1;
const MAX_PROVISION_SET_SIZE = 12;
const MAX_PRIMARY_RERANK_CANDIDATES = 32;
// The reranker is an in-process scoring pass over already hydrated metadata,
// so a broader graph pool costs microseconds rather than another model call.
// Keep enough room for primary semantic hits plus bounded neighbourhoods from
// every Coverage Requirement; the final evidence ceiling remains 12.
const MAX_RERANK_CANDIDATES = 256;
const MAX_GRAPH_EXPANSION_ANCHORS = 12;
const MAX_CANDIDATES_PER_QUERY = 6;
const MAX_RESULTS_PER_QUERY = 20;
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
  coverageStatus: "good_coverage" | "partial_coverage" | "no_coverage";
  coverageRequirements: JuroLegalCoverageAssessment[];
  repairQueriesRun: number;
  indexedAvailability: "available" | "degraded" | "unavailable";
};

export type JuroLegalResearchCandidate = {
  provisionId: string;
  passage: LegalCorpusRetrievalItem;
  chunkIds: string[];
  matchedQueries: string[];
  queryMatches: JuroLegalCandidateQueryMatch[];
};

export type JuroLegalCandidateQueryMatch = {
  query: string;
  /** One-based rank inside this exact sparse+dense query branch. */
  resultRank: number;
  sparseRank?: number;
  denseRank?: number;
  semanticScore?: number;
  fusionScore?: number;
};

export type JuroLegalCoverageRequirement = {
  id: string;
  statement: string;
  alternatives: readonly string[];
};

export type JuroLegalCoverageAssessment = {
  requirementId: string;
  statement: string;
  status: "covered" | "uncovered";
  provisionIds: string[];
};

export type JuroLegalProvisionSelection = {
  provisionId: string;
  requirementIds: readonly string[];
};

export type JuroLegalRerankDecision = {
  outcome: "selected" | "rejected";
  selections: readonly JuroLegalProvisionSelection[];
  /** A grounded, material requirement noticed while reading candidates. */
  discoveredRequirements?: readonly {
    statement: string;
    alternatives: readonly string[];
  }[];
};

export type JuroLegalCandidateReranker = (input: {
  question: string;
  requirements: readonly JuroLegalCoverageRequirement[];
  candidates: readonly JuroLegalResearchCandidate[];
  limit: number;
}) => Promise<JuroLegalRerankDecision | readonly string[]>;

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
  /** The remote primitive itself performs sparse+dense fusion. */
  supportsHybrid?: boolean;
  findLegalSources(input: {
    query: string;
    locale: "ru" | "uz";
    scope?: LegalCorpusSearchScope;
    limit?: number;
  }): Promise<LegalCorpusRetrievalItem[]>;
  findLegalSourcesBatch?(input: {
    queries: readonly string[];
    locale: "ru" | "uz";
    scope?: LegalCorpusSearchScope;
    limit?: number;
  }): Promise<LegalCorpusRetrievalItem[][]>;
  inspectLegalAct(input: { anchorChunkId: string }): Promise<JuroActRecord | null>;
  readLegalProvisions(input: {
    anchorChunkId: string;
    before?: number;
    after?: number;
  }): Promise<LegalSourceSpan[]>;
  hydrateLegalSources?(input: {
    anchorChunkIds: readonly string[];
    before?: number;
    after?: number;
    includeReferences?: boolean;
  }): Promise<Array<{
    anchorChunkId: string;
    act: JuroActRecord | null;
    spans: LegalSourceSpan[];
  }>>;
};

function normalizeQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 900);
}

function queryIdentity(value: string): string {
  return normalizeQuery(value)
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function uniqueQueries(values: readonly string[]): string[] {
  const identities = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const query = normalizeQuery(value);
    const identity = queryIdentity(query);
    if (!query || !identity || identities.has(identity)) continue;
    identities.add(identity);
    result.push(query);
  }
  return result;
}

function minDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function maxDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

function mergeCandidateQueryMatches(
  left: readonly JuroLegalCandidateQueryMatch[],
  right: readonly JuroLegalCandidateQueryMatch[],
): JuroLegalCandidateQueryMatch[] {
  const merged = new Map<string, JuroLegalCandidateQueryMatch>();
  for (const match of [...left, ...right]) {
    const identity = queryIdentity(match.query);
    const current = merged.get(identity);
    if (!current || match.resultRank < current.resultRank) merged.set(identity, match);
  }
  return [...merged.values()];
}

function passageIdentity(item: LegalCorpusRetrievalItem): string {
  return [
    item.documentId,
    item.versionDate ?? item.validFrom ?? "current",
    item.articleNumber ?? "",
    item.chunkId,
  ].join("\u001f");
}

function explicitlyNamesAct(query: string, item: LegalCorpusRetrievalItem): boolean {
  const queryKey = queryIdentity(query);
  const explicitIdentifiers = [item.documentNumber, item.documentId]
    .flatMap((value) => value ? [queryIdentity(value)] : [])
    .filter((value) => value.length >= 3);
  if (explicitIdentifiers.some((identifier) => queryKey.includes(identifier))) return true;

  const queryTerms = relevanceTerms(query);
  const distinctiveTitleTerms = relevanceTerms(item.documentTitle).filter((term) =>
    !NON_DISTINCTIVE_ACT_TITLE_TERM.test(term)
  );
  const matchedTitleTerms = distinctiveTitleTerms.filter((titleTerm) => queryTerms.some((queryTerm) =>
    sharesTermFragment(titleTerm, queryTerm)
  ));
  const titleDocumentForms = relevanceTerms(item.documentTitle).filter((term) =>
    DOCUMENT_FORM_ACT_TITLE_TERM.test(term)
  );
  const namesDocumentForm = titleDocumentForms.some((titleTerm) => queryTerms.some((queryTerm) =>
    DOCUMENT_FORM_ACT_TITLE_TERM.test(queryTerm) && sharesTermFragment(titleTerm, queryTerm)
  ));
  if (matchedTitleTerms.length >= 2 || (matchedTitleTerms.length === 1 && namesDocumentForm)) return true;

  // Derive common short act names from the title itself instead of keeping an
  // act alias dictionary. For example, "Трудовой кодекс Республики
  // Узбекистан" yields "ткру", which is present in "ТК РУз" after compacting.
  const titleInitials = (item.documentTitle.normalize("NFKC")
    .toLocaleLowerCase("und")
    .match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((word) => word[0])
    .join("");
  const compactQuery = queryKey.replace(/\s+/gu, "");
  return titleInitials.length >= 3 && compactQuery.includes(titleInitials);
}

function isNarrowExactArticleLookup(query: string): boolean {
  const normalized = normalizeQuery(query);
  if (
    normalized.length > 160
    || /[?？]/u.test(normalized)
    || detectArticleNumbers(normalized).length !== 1
    || !/(?:ст(?:атья|атью|атьи|атье)?\.?\s*№?\s*\d|modda(?:si|ni|da)?\s*№?\s*\d)/iu.test(normalized)
  ) return false;

  // Reranking may be skipped only for a locator-style request for one known
  // provision. Once the user asks about application, consequences, guarantees
  // or surrounding law, complementary provisions are material even if the
  // query also names an exact act and article.
  return !/(?:^|[^\p{L}\p{N}_])(?:можно|нельзя|как|какие|какой|почему|когда|если|ещ[её]|увол[\p{L}\p{N}_]*|гарант[\p{L}\p{N}_]*|примен[\p{L}\p{N}_]*|основан[\p{L}\p{N}_]*|исключ[\p{L}\p{N}_]*|действ[\p{L}\p{N}_]*|поряд[\p{L}\p{N}_]*|срок[\p{L}\p{N}_]*|mumkin|qanday|nega|qachon|agar|kafolat[\p{L}\p{N}_]*|qo['’ʻʼ]?llan[\p{L}\p{N}_]*|bo['’ʻʼ]?shat[\p{L}\p{N}_]*)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);
}

// Jurisdiction names and document-form labels identify a legal-document class,
// not a particular act. They must never be enough to skip semantic reranking.
const NON_DISTINCTIVE_ACT_TITLE_TERM = /^(?:республик\p{L}*|узбекистан\p{L}*|закон\p{L}*|кодекс\p{L}*|указ\p{L}*|постановлен\p{L}*|решен\p{L}*|положен\p{L}*|o?zbekiston\p{L}*|respublik\p{L}*|qonun\p{L}*|kodeks\p{L}*|qaror\p{L}*|farmon\p{L}*|nizom\p{L}*|republic\p{L}*|uzbekistan\p{L}*|law|code|decree|resolution|regulation)$/iu;
const DOCUMENT_FORM_ACT_TITLE_TERM = /^(?:закон\p{L}*|кодекс\p{L}*|указ\p{L}*|постановлен\p{L}*|решен\p{L}*|положен\p{L}*|qonun\p{L}*|kodeks\p{L}*|qaror\p{L}*|farmon\p{L}*|nizom\p{L}*|law|code|decree|resolution|regulation)$/iu;

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

function passageMatchesAnyRequiredConcept(
  item: LegalCorpusRetrievalItem,
  concepts: readonly JuroLegalRequiredConcept[],
): boolean {
  return concepts.length === 0 || concepts.some((concept) =>
    passageMatchesRequiredConcepts(item, [concept])
  );
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
  denseSearchIncludesSparse?: boolean;
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
    denseSearchIncludesSparse: input.denseSearchIncludesSparse,
    officialOnly: true,
  });
}

const legalAnchorChunkId = /^[A-Za-z0-9:_-]{1,200}$/u;

type JuroProvisionWindowRow = {
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  textSha256: string;
  articleNumber: string | null;
  articleTitle: string | null;
  part: string | null;
  sequence: number;
};

function inspectJuroActRecordStatement(db: D1Database, anchorChunkId: string) {
  return db.prepare(`
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
  `).bind(anchorChunkId);
}

function provisionIdentity(item: LegalCorpusRetrievalItem): string {
  return item.provisionId ?? [
    item.documentId,
    item.versionDate ?? item.validFrom ?? "current",
    item.articleNumber ?? item.chunkId,
  ].join("\u001f");
}

function loadJuroProvisionWindowStatement(
  db: D1Database,
  anchorChunkId: string,
  before = 2,
  after = 4,
) {
  return db.prepare(`
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
  `).bind(anchorChunkId, before, after);
}

function loadJuroProvisionGraphStatement(
  db: D1Database,
  anchorChunkId: string,
  directArticleNumbers: readonly string[],
  reverseArticleNumbers: readonly string[],
) {
  const directClause = directArticleNumbers.length > 0
    ? `provision.article_number_normalized IN (${directArticleNumbers.map(() => "?").join(",")})`
    : "0";
  const reverseClause = reverseArticleNumbers.length > 0
    ? reverseArticleNumbers.map(() => "(lower(provision.text) LIKE '%стать%' || ? || '%' OR lower(provision.text) LIKE '%' || ? || '-модд%')").join(" OR ")
    : "0";
  const reverseBindings = reverseArticleNumbers.flatMap((article) => [article, article]);
  return db.prepare(`
    WITH anchor AS (
      SELECT provision.version_id AS versionId
      FROM legal_corpus_chunks AS chunk
      INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
      WHERE chunk.id=?
      LIMIT 1
    )
    SELECT chunk.id AS chunkId,chunk.chunk_index AS chunkIndex,chunk.total_chunks AS totalChunks,
      chunk.content_text AS text,chunk.content_sha256 AS textSha256,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      provision.part AS part,provision.sequence AS sequence
    FROM anchor
    INNER JOIN legal_corpus_provisions AS provision ON provision.version_id=anchor.versionId
      AND (${directClause} OR ${reverseClause})
    INNER JOIN legal_corpus_chunks AS chunk ON chunk.provision_id=provision.id
    ORDER BY provision.sequence,chunk.chunk_index
    LIMIT 40
  `).bind(anchorChunkId, ...directArticleNumbers, ...reverseBindings);
}

function juroProvisionSpans(rows: readonly JuroProvisionWindowRow[]): LegalSourceSpan[] {
  return rows.flatMap((row) => {
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

/** Loads server-owned metadata for the immutable version containing a hit. */
export async function inspectJuroActRecord(input: {
  db: D1Database;
  anchorChunkId: string;
}): Promise<JuroActRecord | null> {
  if (!legalAnchorChunkId.test(input.anchorChunkId)) return null;
  const result = await inspectJuroActRecordStatement(input.db, input.anchorChunkId)
    .all<JuroActRecord>();
  const row = result.results[0];
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
  if (!legalAnchorChunkId.test(input.anchorChunkId)) return [];
  const before = Math.max(0, Math.min(input.before ?? 2, 12));
  const after = Math.max(0, Math.min(input.after ?? 4, 24));
  const result = await loadJuroProvisionWindowStatement(
    input.db,
    input.anchorChunkId,
    before,
    after,
  ).all<JuroProvisionWindowRow>();
  return juroProvisionSpans(result.results);
}

/** Hydrates all selected evidence anchors in one D1 round trip. */
export async function hydrateJuroLegalSources(input: {
  db: D1Database;
  anchorChunkIds: readonly string[];
  before?: number;
  after?: number;
  includeReferences?: boolean;
}): Promise<Array<{
  anchorChunkId: string;
  act: JuroActRecord | null;
  spans: LegalSourceSpan[];
}>> {
  const before = Math.max(0, Math.min(input.before ?? 2, 12));
  const after = Math.max(0, Math.min(input.after ?? 4, 24));
  const anchorChunkIds = [...new Set(input.anchorChunkIds)]
    .filter((anchorChunkId) => legalAnchorChunkId.test(anchorChunkId))
    .slice(0, MAX_PROVISION_SET_SIZE);
  if (anchorChunkIds.length === 0) return [];
  const results = await input.db.batch(anchorChunkIds.flatMap((anchorChunkId) => [
    inspectJuroActRecordStatement(input.db, anchorChunkId),
    loadJuroProvisionWindowStatement(input.db, anchorChunkId, before, after),
  ]));
  const packets = anchorChunkIds.map((anchorChunkId, index) => {
    const act = results[index * 2]?.results[0] as JuroActRecord | undefined;
    const rows = (results[index * 2 + 1]?.results ?? []) as JuroProvisionWindowRow[];
    return {
      anchorChunkId,
      act: act?.sourceUrl ? act : null,
      rows,
    };
  });
  if (!input.includeReferences) {
    return packets.map(({ anchorChunkId, act, rows }) => ({
      anchorChunkId,
      act,
      spans: juroProvisionSpans(rows),
    }));
  }
  const referencePattern = /(?:стат(?:ья|ьи|ье|ей|ью)|modda(?:si|ning|ga|dan)?)[^\d]{0,12}(\d+(?:-\d+)?)/giu;
  const packetGroups = new Map<string, {
    anchorChunkId: string;
    packetIndexes: number[];
    directNumbers: Set<string>;
    reverseNumbers: Set<string>;
  }>();
  packets.forEach((packet, packetIndex) => {
    if (!packet.act) return;
    const group = packetGroups.get(packet.act.documentId) ?? {
      anchorChunkId: packet.anchorChunkId,
      packetIndexes: [],
      directNumbers: new Set<string>(),
      reverseNumbers: new Set<string>(),
    };
    group.packetIndexes.push(packetIndex);
    const anchorRow = packet.rows.find((row) => row.chunkId === packet.anchorChunkId);
    if (anchorRow) {
      for (const match of anchorRow.text.matchAll(referencePattern)) {
        if (match[1]) group.directNumbers.add(match[1]);
      }
    }
    if (anchorRow?.articleNumber && /^\d+(?:-\d+)?$/u.test(anchorRow.articleNumber)) {
      group.reverseNumbers.add(anchorRow.articleNumber);
    }
    packetGroups.set(packet.act.documentId, group);
  });
  const groups = [...packetGroups.values()].map((group) => ({
    ...group,
    directNumbers: [...group.directNumbers].slice(0, 16),
    reverseNumbers: [...group.reverseNumbers].slice(0, 8),
  })).filter((group) => group.directNumbers.length > 0 || group.reverseNumbers.length > 0);
  const graphStatements = groups.map((group) => loadJuroProvisionGraphStatement(
    input.db,
    group.anchorChunkId,
    group.directNumbers,
    group.reverseNumbers,
  ));
  const graphResults = graphStatements.length > 0 ? await input.db.batch(graphStatements) : [];
  const graphRowsByPacket = new Map<number, JuroProvisionWindowRow[]>();
  groups.forEach((group, groupIndex) => {
    const rows = (graphResults[groupIndex]?.results ?? []) as JuroProvisionWindowRow[];
    // A document group shares the same direct/reverse-reference query. Attach
    // that exact row set once; copying it into every anchor packet multiplied
    // the private response by the number of same-act anchors, only for the
    // caller to deduplicate those chunk IDs immediately afterward.
    const firstPacketIndex = group.packetIndexes[0];
    if (firstPacketIndex !== undefined) graphRowsByPacket.set(firstPacketIndex, rows);
  });
  return packets.map(({ anchorChunkId, act, rows }, index) => {
    const uniqueRows = [...new Map([...rows, ...(graphRowsByPacket.get(index) ?? [])]
      .map((row) => [row.chunkId, row])).values()];
    return { anchorChunkId, act, spans: juroProvisionSpans(uniqueRows) };
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
  coverageRequirements?: readonly JuroLegalCoverageRequirement[] | Promise<readonly JuroLegalCoverageRequirement[]>;
  planningAvailable?: boolean | Promise<boolean>;
  locale: "ru" | "uz";
  scope?: LegalCorpusSearchScope;
  limit?: number;
  denseSearch?: (query: string, limit: number) => Promise<DenseCorpusCandidate[]>;
  denseSearchIncludesSparse?: boolean;
  requireDense?: boolean;
  search?: IndexedSearch;
  readTools?: JuroLegalCorpusReadTools;
  rerankCandidates?: JuroLegalCandidateReranker;
  hydrateExactWindows?: boolean;
  maxQueries?: number;
  signal?: AbortSignal;
}): Promise<JuroLegalResearchResult> {
  input.signal?.throwIfAborted();
  const limit = Math.max(1, Math.min(input.limit ?? 8, MAX_PROVISION_SET_SIZE));
  const maxQueries = Math.max(1, Math.min(input.maxQueries ?? MAX_RESEARCH_QUERIES, MAX_RESEARCH_QUERIES));
  const original = normalizeQuery(input.originalQuery);
  const readTools: JuroLegalCorpusReadTools = input.readTools ?? {
    findLegalSources: ({ query, scope, limit: searchLimit }) => findJuroLegalPassages({
      db: input.db,
      query,
      scope,
      limit: searchLimit,
      denseSearch: input.denseSearch,
      denseSearchIncludesSparse: input.denseSearchIncludesSparse,
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
    hydrateLegalSources: ({ anchorChunkIds, before, after, includeReferences }) => hydrateJuroLegalSources({
      db: input.db,
      anchorChunkIds,
      before,
      after,
      includeReferences,
    }),
  };
  const requestSearchCache = new Map<string, Promise<LegalCorpusRetrievalItem[]>>();
  const findLegalSources = (query: string) => {
    const identity = queryIdentity(query);
    const cached = requestSearchCache.get(identity);
    if (cached) return cached;
    const pending = readTools.findLegalSources({
      query,
      locale: input.locale,
      scope: input.scope,
      limit: Math.min(limit * 2, MAX_RESULTS_PER_QUERY),
    });
    requestSearchCache.set(identity, pending);
    return pending;
  };
  const firstSearch = findLegalSources(original);
  const [
    firstRankedList,
    proposed,
    resolvedRerankingQuestion,
    resolvedRequiredConcepts,
    resolvedCoverageRequirements,
    planningAvailable,
  ] = await Promise.all([
    firstSearch,
    Promise.resolve(input.generatedQueries ?? []),
    Promise.resolve(input.rerankingQuestion ?? original),
    Promise.resolve(input.requiredConcepts ?? []),
    Promise.resolve(input.coverageRequirements ?? []),
    Promise.resolve(input.planningAvailable ?? true),
  ]);
  if (!planningAvailable) throw new TypeError("LEGAL_RETRIEVAL_PLANNING_UNAVAILABLE");
  const rerankingQuestion = normalizeQuery(resolvedRerankingQuestion) || original;
  const requiredConcepts = resolvedRequiredConcepts.slice(0, 5).map((concept) => ({
    alternatives: concept.alternatives.map(normalizeQuery).filter(Boolean).slice(0, 5),
  })).filter((concept) => concept.alternatives.length > 0);
  const coverageRequirements: JuroLegalCoverageRequirement[] = resolvedCoverageRequirements.length > 0
    ? resolvedCoverageRequirements.slice(0, 8).flatMap((requirement, index) => {
      const statement = normalizeQuery(requirement.statement);
      const alternatives = requirement.alternatives.map(normalizeQuery).filter(Boolean).slice(0, 5);
      return statement && alternatives.length > 0 ? [{
        id: normalizeQuery(requirement.id).slice(0, 80) || `requirement-${index + 1}`,
        statement,
        alternatives,
      }] : [];
    })
    : requiredConcepts.map((concept, index) => ({
      id: `requirement-${index + 1}`,
      statement: concept.alternatives.join(" / "),
      alternatives: concept.alternatives,
    }));
  const semanticBranches = [
    ...coverageRequirements.map((requirement) => uniqueQueries([
      requirement.statement,
      ...requirement.alternatives,
    ]).join(" ")),
    ...proposed.map(normalizeQuery),
    ...crossFacetQueries(requiredConcepts),
  ];
  const queries = uniqueQueries([
    original,
    ...semanticBranches,
  ])
    .slice(0, maxQueries);
  const remainingQueries = queries.slice(1);
  let executedQueries = queries;
  const remainingLists = remainingQueries.length === 0
    ? []
    : readTools.findLegalSourcesBatch
      ? await readTools.findLegalSourcesBatch({
        queries: remainingQueries,
        locale: input.locale,
        scope: input.scope,
        limit: Math.min(limit * 2, MAX_RESULTS_PER_QUERY),
      })
      : await Promise.all(remainingQueries.map(findLegalSources));
  let rankedLists = [firstRankedList, ...remainingLists];
  input.signal?.throwIfAborted();

  type RankedCandidate = { identity: string; item: LegalCorpusRetrievalItem };
  type ProvisionCandidate = {
    provisionId: string;
    representative: RankedCandidate;
    members: RankedCandidate[];
    matchedQueries: string[];
    queryMatches: JuroLegalCandidateQueryMatch[];
  };
  let expandedCandidates: Array<{
    item: LegalCorpusRetrievalItem;
    matchedQueries: string[];
  }> = [];
  const buildCandidateState = () => {
    const byIdentity = new Map<string, LegalCorpusRetrievalItem>();
    const scores = new Map<string, number>();
    const queryMatches = new Map<string, Set<string>>();
    const queryRankMatches = new Map<string, Map<string, JuroLegalCandidateQueryMatch>>();
    rankedLists.forEach((items, queryIndex) => items.forEach((item, rank) => {
      const identity = passageIdentity(item);
      const current = byIdentity.get(identity);
      const preferred = preferredLanguage(input.locale, original);
      const representative = !current || (item.language === preferred && current.language !== preferred)
        ? item
        : current;
      byIdentity.set(identity, {
        ...representative,
        sparseRank: minDefined(current?.sparseRank, item.sparseRank),
        denseRank: minDefined(current?.denseRank, item.denseRank),
        semanticScore: maxDefined(current?.semanticScore, item.semanticScore),
        fusionScore: maxDefined(current?.fusionScore, item.fusionScore),
      });
      scores.set(identity, (scores.get(identity) ?? 0) + 1 / (RRF_K + rank + 1));
      const query = executedQueries[queryIndex] ?? original;
      const matches = queryMatches.get(identity) ?? new Set<string>();
      matches.add(query);
      queryMatches.set(identity, matches);
      const rankMatches = queryRankMatches.get(identity) ?? new Map<string, JuroLegalCandidateQueryMatch>();
      const queryKey = queryIdentity(query);
      const currentMatch = rankMatches.get(queryKey);
      const nextMatch: JuroLegalCandidateQueryMatch = {
        query,
        resultRank: rank + 1,
        sparseRank: item.sparseRank,
        denseRank: item.denseRank,
        semanticScore: item.semanticScore,
        fusionScore: item.fusionScore,
      };
      if (!currentMatch || nextMatch.resultRank < currentMatch.resultRank) {
        rankMatches.set(queryKey, nextMatch);
      }
      queryRankMatches.set(identity, rankMatches);
    }));
    for (const expanded of expandedCandidates) {
      const identity = passageIdentity(expanded.item);
      const current = byIdentity.get(identity);
      if (!current) {
        byIdentity.set(identity, expanded.item);
      } else if (current.candidateExcerptOnly && !expanded.item.candidateExcerptOnly) {
        // Prefer the exact D1-hydrated provision text while retaining the
        // sparse/dense evidence that originally discovered the same chunk.
        byIdentity.set(identity, {
          ...expanded.item,
          sparseRank: current.sparseRank,
          denseRank: current.denseRank,
          semanticScore: current.semanticScore,
          fusionScore: current.fusionScore,
        });
      }
      const matches = queryMatches.get(identity) ?? new Set<string>();
      expanded.matchedQueries.forEach((query) => matches.add(query));
      queryMatches.set(identity, matches);
    }
    const preferred = preferredLanguage(input.locale, original);
    const fusedRanking: RankedCandidate[] = [...byIdentity.entries()]
      .map(([identity, item]) => ({
        identity,
        item: { ...item, fusionScore: scores.get(identity) ?? item.fusionScore ?? 0 },
      }))
      .sort((left, right) => (right.item.fusionScore ?? 0) - (left.item.fusionScore ?? 0)
        || Number(right.item.language === preferred) - Number(left.item.language === preferred)
        || left.item.chunkId.localeCompare(right.item.chunkId));
    const deterministicCandidates = fusedRanking
      .filter(({ identity, item }) => [...(queryMatches.get(identity) ?? [])]
        .some((query) => passageMatchesQuery(item, query)))
      .filter(({ item }) => passageMatchesRequiredConcepts(item, requiredConcepts))
      .slice(0, MAX_RERANK_CANDIDATES);
    const fusedByIdentity = new Map(fusedRanking.map((candidate) => [candidate.identity, candidate]));
    const diversifiedCandidates: RankedCandidate[] = [];
    const diversifiedIdentities = new Set<string>();
    for (let rank = 0; rank < MAX_CANDIDATES_PER_QUERY; rank += 1) {
      rankedLists.forEach((items) => {
        if (diversifiedCandidates.length >= MAX_PRIMARY_RERANK_CANDIDATES) return;
        const item = items[rank];
        if (!item) return;
        const identity = passageIdentity(item);
        const candidate = fusedByIdentity.get(identity);
        if (candidate && !diversifiedIdentities.has(identity)) {
          diversifiedIdentities.add(identity);
          diversifiedCandidates.push(candidate);
        }
      });
    }
    for (const expanded of expandedCandidates) {
      if (diversifiedCandidates.length >= MAX_RERANK_CANDIDATES) break;
      const identity = passageIdentity(expanded.item);
      const candidate = fusedByIdentity.get(identity);
      if (!candidate || diversifiedIdentities.has(identity)) continue;
      diversifiedIdentities.add(identity);
      diversifiedCandidates.push(candidate);
    }
    for (const candidate of fusedRanking) {
      if (diversifiedCandidates.length >= MAX_RERANK_CANDIDATES) break;
      if (diversifiedIdentities.has(candidate.identity)) continue;
      diversifiedIdentities.add(candidate.identity);
      diversifiedCandidates.push(candidate);
    }
    const groups = new Map<string, ProvisionCandidate>();
    for (const candidate of diversifiedCandidates.slice(0, MAX_RERANK_CANDIDATES)) {
      const id = provisionIdentity(candidate.item);
      const existing = groups.get(id);
      const candidateQueries = [...(queryMatches.get(candidate.identity) ?? [])];
      if (existing) {
        existing.members.push(candidate);
        existing.matchedQueries = uniqueQueries([...existing.matchedQueries, ...candidateQueries]);
        existing.queryMatches = mergeCandidateQueryMatches(
          existing.queryMatches,
          [...(queryRankMatches.get(candidate.identity)?.values() ?? [])],
        );
      } else {
        groups.set(id, {
          provisionId: id,
          representative: candidate,
          members: [candidate],
          matchedQueries: candidateQueries,
          queryMatches: [...(queryRankMatches.get(candidate.identity)?.values() ?? [])],
        });
      }
    }
    return {
      fusedRanking,
      deterministicCandidates,
      matchedQueries: queryMatches,
      provisionCandidates: [...groups.values()].slice(0, MAX_RERANK_CANDIDATES),
    };
  };

  let candidateState = buildCandidateState();
  const initialRequestedArticles = new Set(detectArticleNumbers(rerankingQuestion));
  const initialExactArticleCandidates = initialRequestedArticles.size === 1
    && isNarrowExactArticleLookup(rerankingQuestion)
    ? candidateState.provisionCandidates.filter(({ representative: { item } }) => item.articleNumber
      && initialRequestedArticles.has(item.articleNumber)
      && explicitlyNamesAct(rerankingQuestion, item))
    : [];
  const initialUnambiguousExactArticleMatch = initialExactArticleCandidates.length > 0
    && new Set(initialExactArticleCandidates.map(({ representative }) => representative.item.articleNumber)
      .filter((article): article is string => Boolean(article))).size === initialRequestedArticles.size
    && new Set(initialExactArticleCandidates.map((candidate) => candidate.provisionId)).size === 1;
  if (
    input.rerankCandidates
    && !initialUnambiguousExactArticleMatch
    && input.hydrateExactWindows !== false
    && readTools.hydrateLegalSources
    && candidateState.provisionCandidates.length > 0
  ) {
    const documentCoverage = new Map<string, {
      count: number;
      queries: Set<string>;
      score: number;
      authority: number;
    }>();
    for (const candidate of candidateState.provisionCandidates) {
      const documentId = candidate.representative.item.documentId;
      const typeAndTitle = `${candidate.representative.item.documentType ?? ""} ${candidate.representative.item.documentTitle}`;
      const authority = /кодекс|kodeks/iu.test(typeAndTitle) ? 2 : /закон|qonun/iu.test(typeAndTitle) ? 1 : 0;
      const current = documentCoverage.get(documentId) ?? {
        count: 0,
        queries: new Set<string>(),
        score: 0,
        authority: 0,
      };
      current.count += 1;
      candidate.matchedQueries.forEach((query) => current.queries.add(queryIdentity(query)));
      current.score += candidate.representative.item.fusionScore ?? 0;
      current.authority = Math.max(current.authority, authority);
      documentCoverage.set(documentId, current);
    }
    // Expand one highest-coherence governing document. Semantic candidates
    // from other acts remain available to reranking, while keeping all eight
    // graph anchors in the governing code prevents a localized secondary act
    // from truncating a complementary statutory family.
    const governingDocumentIds = [...documentCoverage.entries()]
      .sort(([, left], [, right]) => right.queries.size - left.queries.size
        || right.authority - left.authority
        || right.count - left.count
        || right.score - left.score)
      .slice(0, 1)
      .map(([documentId]) => documentId);
    const expansionAnchors = governingDocumentIds.flatMap((documentId) => {
      const candidates = candidateState.provisionCandidates
        .filter((candidate) => candidate.representative.item.documentId === documentId
          && Boolean(candidate.representative.item.articleTitle?.trim()));
      const perDocumentLimit = MAX_GRAPH_EXPANSION_ANCHORS;
      const selected = new Map<string, ProvisionCandidate>();
      const addBestForQuery = (query: string, queryLimit: number) => {
        const queryKey = queryIdentity(query);
        candidates
          .flatMap((candidate) => {
            const match = candidate.queryMatches.find((entry) => queryIdentity(entry.query) === queryKey);
            return match ? [{ candidate, rank: match.resultRank }] : [];
          })
          .sort((left, right) => left.rank - right.rank
            || (right.candidate.representative.item.fusionScore ?? 0)
              - (left.candidate.representative.item.fusionScore ?? 0))
          .slice(0, queryLimit)
          .forEach(({ candidate }) => {
            if (selected.size < perDocumentLimit || selected.has(candidate.provisionId)) {
              selected.set(candidate.provisionId, candidate);
            }
          });
      };
      // Keep the operative action and ongoing-rights branches represented
      // even when many status provisions have strong literal overlap. Their
      // exact windows commonly contain the terminal guarantee and the general
      // preservation rule that complete the answer.
      executedQueries.slice(-1).forEach((query) => addBestForQuery(query, 2));
      executedQueries.slice(-2, -1).forEach((query) => addBestForQuery(query, 1));
      // Reserve several exact-text status anchors before rank slots are spent
      // on the broad action branch. An ambiguous colloquial status can be
      // governed by separate leave and protection families; both need graph
      // windows before the reranker can compare their later consequences.
      const statusAnchorTexts = coverageRequirements.slice(0, 2).map((requirement) => [
        requirement.statement,
        ...requirement.alternatives,
      ].join(" "));
      if (statusAnchorTexts.length > 0) {
        candidates
          .map((candidate) => ({
            candidate,
            score: statusAnchorTexts.reduce((total, statusText) =>
              total + passageQueryMatchCount(candidate.representative.item, statusText), 0),
          }))
          .filter(({ score }) => score > 0)
          .sort((left, right) => right.score - left.score
            || (right.candidate.representative.item.fusionScore ?? 0)
              - (left.candidate.representative.item.fusionScore ?? 0))
          .slice(0, Math.max(0, perDocumentLimit - 3))
          .forEach(({ candidate }) => {
            if (selected.size < perDocumentLimit || selected.has(candidate.provisionId)) {
              selected.set(candidate.provisionId, candidate);
            }
          });
      }
      // Reserve graph breadth for the two plausible statuses plus the final
      // preservation and action branches before giving spare anchors to more
      // action results. Previously the reverse insertion order could fill the
      // per-document budget with action hits and silently drop a rank-1 status
      // anchor such as the governing childcare-leave provision.
      const coreQueries = uniqueQueries([
        ...executedQueries.slice(1, 3),
        ...executedQueries.slice(-2),
      ]);
      coreQueries.forEach((query) => addBestForQuery(query, 1));
      // The two plausible-status branches frequently share the same rank-1
      // entitlement provision. Keep their second interpretation as well so a
      // distinct governing family can contribute its bounded neighbours to
      // reranking instead of disappearing behind that duplicate rank-1 hit.
      executedQueries.slice(1, 3).forEach((query) => addBestForQuery(query, 2));
      const queryPriority = [...executedQueries].reverse();
      queryPriority.forEach((query, index) => addBestForQuery(
        query,
        index === 0 ? Math.ceil(perDocumentLimit / 2)
          : index === 1 ? Math.ceil(perDocumentLimit / 4)
          : 1,
      ));
      for (const candidate of candidates) {
        if (selected.size >= perDocumentLimit) break;
        selected.set(candidate.provisionId, candidate);
      }
      return [...selected.values()].slice(0, perDocumentLimit);
    }).slice(0, MAX_GRAPH_EXPANSION_ANCHORS);
    if (expansionAnchors.length > 0) {
      const anchorsByChunkId = new Map(expansionAnchors.map((candidate) => [
        candidate.representative.item.chunkId,
        candidate,
      ]));
      const packets = await readTools.hydrateLegalSources({
          anchorChunkIds: [...anchorsByChunkId.keys()],
          before: 3,
          // Statutory guarantees are commonly defined as short consecutive
          // sets. A bounded seven-provision look-ahead lets an earlier status
          // anchor expose later entitlement and consequence rules without
          // recursive searching.
          after: 7,
          includeReferences: true,
        }).catch(() => Promise.all(expansionAnchors.map(async (candidate) => {
        const passage = candidate.representative.item;
        return {
          anchorChunkId: passage.chunkId,
          act: passage.sourceUrl ? {
            documentId: passage.documentId,
            title: passage.documentTitle,
            documentType: passage.documentType,
            documentNumber: passage.documentNumber,
            adoptingAuthority: passage.adoptingAuthority,
            adoptionDate: null,
            publicationDate: null,
            language: passage.language,
            status: passage.status,
            validFrom: passage.validFrom,
            validTo: passage.validTo,
            versionDate: passage.versionDate,
            sourceUrl: passage.sourceUrl,
            fetchedAt: passage.fetchedAt,
          } satisfies JuroActRecord : null,
          spans: await readTools.readLegalProvisions({
            anchorChunkId: passage.chunkId,
            before: 3,
            after: 7,
          }),
        };
      })));
      const graphQueries = [
        rerankingQuestion,
        ...coverageRequirements.map((requirement) => [
          requirement.statement,
          ...requirement.alternatives,
        ].filter((value, index, all) => all.indexOf(value) === index).join(" ")),
      ];
      const expandedByPacket = packets.map((packet) => {
        const anchor = anchorsByChunkId.get(packet.anchorChunkId);
        const act = packet.act;
        if (!anchor || !act) return [];
        const anchorSequenceText = /:p(\d+)(?::|$)/u.exec(packet.anchorChunkId)?.[1];
        const anchorSequence = anchorSequenceText ? Number(anchorSequenceText) : null;
        const ranked = packet.spans.flatMap((span, originalIndex) => {
          const articleLabel = span.article?.trim() ?? "";
          const articleMatch = /^([^\.\s]+)(?:\.\s*(.*))?$/u.exec(articleLabel);
          if (!articleMatch) return [];
          const articleNumber = articleMatch[1] ?? null;
          const articleTitle = articleMatch[2]?.trim() || null;
          return [{
            item: {
              ...anchor.representative.item,
              chunkId: span.id,
              provisionId: span.id.replace(/:c\d+$/u, ""),
              documentTitle: act.title,
              documentType: act.documentType,
              documentNumber: act.documentNumber,
              adoptingAuthority: act.adoptingAuthority,
              articleNumber,
              articleTitle,
              exactQuote: span.text,
              contentHash: span.textSha256,
              fusionScore: 0,
              sparseRank: undefined,
              denseRank: undefined,
              semanticScore: undefined,
              candidateExcerptOnly: false,
              windowHydrated: true,
            },
            matchedQueries: span.id === anchor.representative.item.chunkId
              ? anchor.matchedQueries
              : [],
            originalIndex,
            relevance: Math.max(...graphQueries.map((query) =>
              passageQueryMatchCount({
                ...anchor.representative.item,
                chunkId: span.id,
                articleNumber,
                articleTitle,
                exactQuote: span.text,
              }, query)
            )),
          }];
        }).sort((left, right) => {
          const leftSequenceText = /:p(\d+)(?::|$)/u.exec(left.item.provisionId ?? left.item.chunkId)?.[1];
          const rightSequenceText = /:p(\d+)(?::|$)/u.exec(right.item.provisionId ?? right.item.chunkId)?.[1];
          const leftDistance = anchorSequence === null || !leftSequenceText
            ? Number.MAX_SAFE_INTEGER : Math.abs(Number(leftSequenceText) - anchorSequence);
          const rightDistance = anchorSequence === null || !rightSequenceText
            ? Number.MAX_SAFE_INTEGER : Math.abs(Number(rightSequenceText) - anchorSequence);
          const leftFollows = anchorSequence !== null && leftSequenceText
            ? Number(leftSequenceText) >= anchorSequence : false;
          const rightFollows = anchorSequence !== null && rightSequenceText
            ? Number(rightSequenceText) >= anchorSequence : false;
          return right.relevance - left.relevance
            || leftDistance - rightDistance
            || Number(rightFollows) - Number(leftFollows)
            || left.originalIndex - right.originalIndex;
        });
        const consequenceOrdered: typeof ranked = [];
        const orderedIds = new Set<string>();
        for (const candidate of ranked) {
          const candidateId = candidate.item.provisionId ?? candidate.item.chunkId;
          if (!orderedIds.has(candidateId)) {
            consequenceOrdered.push(candidate);
            orderedIds.add(candidateId);
          }
          const sequenceText = /:p(\d+)(?::|$)/u.exec(candidateId)?.[1];
          if (!sequenceText) continue;
          const following = ranked.find((other) => {
            const otherId = other.item.provisionId ?? other.item.chunkId;
            const otherSequenceText = /:p(\d+)(?::|$)/u.exec(otherId)?.[1];
            return otherSequenceText && Number(otherSequenceText) === Number(sequenceText) + 1;
          });
          const followingId = following?.item.provisionId ?? following?.item.chunkId;
          if (following && followingId && !orderedIds.has(followingId)) {
            consequenceOrdered.push(following);
            orderedIds.add(followingId);
          }
        }
        return consequenceOrdered.map(({ item, matchedQueries }) => ({ item, matchedQueries }));
      });
      expandedCandidates = [];
      const maximumPacketSize = Math.max(0, ...expandedByPacket.map((items) => items.length));
      for (let rank = 0; rank < maximumPacketSize; rank += 1) {
        expandedByPacket.forEach((items) => {
          const candidate = items[rank];
          if (candidate) expandedCandidates.push(candidate);
        });
      }
      // Fill the bounded graph pool round-robin across diversified anchors,
      // nearest provision first (preferring the following rule at equal
      // distance). This preserves consequences such as the provision directly
      // after a selected prohibition instead of spending the pool on one large
      // cross-reference neighbourhood.
      candidateState = buildCandidateState();
    }
  }
  const requestedArticles = new Set(detectArticleNumbers(rerankingQuestion));
  const exactArticleCandidates = requestedArticles.size > 0
    && isNarrowExactArticleLookup(rerankingQuestion)
    ? candidateState.provisionCandidates.filter(({ representative: { item } }) => item.articleNumber
      && requestedArticles.has(item.articleNumber)
      && explicitlyNamesAct(rerankingQuestion, item))
    : [];
  const unambiguousExactArticleMatch = exactArticleCandidates.length > 0
    && new Set(exactArticleCandidates.map(({ representative }) => representative.item.articleNumber)
      .filter((article): article is string => Boolean(article))).size === requestedArticles.size
    && requestedArticles.size === 1
    && new Set(exactArticleCandidates.map((candidate) => candidate.provisionId)).size === 1;
  const hybridSearchConfigured = Boolean(input.denseSearch || readTools.supportsHybrid);
  const denseUnavailable = hybridSearchConfigured
    && candidateState.fusedRanking.length > 0
    && candidateState.fusedRanking.every(({ item }) => item.denseRank === undefined);
  const denseRequiredButUnavailable = Boolean(input.requireDense)
    && (!hybridSearchConfigured || denseUnavailable)
    && !unambiguousExactArticleMatch;

  let fused: RankedCandidate[] = unambiguousExactArticleMatch
    ? [exactArticleCandidates[0]!.representative]
    : input.rerankCandidates || denseRequiredButUnavailable ? [] : candidateState.deterministicCandidates;
  const activeRequirements = [...coverageRequirements];
  let selections: JuroLegalProvisionSelection[] = unambiguousExactArticleMatch
    ? [{
      provisionId: exactArticleCandidates[0]!.provisionId,
      requirementIds: activeRequirements.map((requirement) => requirement.id),
    }]
    : [];
  let rerankedCandidateCount = 0;
  let repairQueriesRun = 0;
  let rerankingOutcome: JuroLegalResearchResult["rerankingOutcome"] = unambiguousExactArticleMatch
    ? "not_needed"
    : denseRequiredButUnavailable ? "failed_closed"
    : input.rerankCandidates
    ? candidateState.provisionCandidates.length > 0 ? "failed_closed" : "not_needed"
    : "not_configured";
  let rerankingFailureCode: string | null = denseRequiredButUnavailable
    ? hybridSearchConfigured ? "DENSE_UNAVAILABLE" : "DENSE_NOT_CONFIGURED"
    : null;

  const runReranker = async (): Promise<JuroLegalRerankDecision> => {
    const candidates: JuroLegalResearchCandidate[] = candidateState.provisionCandidates.map((candidate) => ({
      provisionId: candidate.provisionId,
      passage: candidate.representative.item,
      chunkIds: candidate.members.map(({ item }) => item.chunkId),
      matchedQueries: candidate.matchedQueries,
      queryMatches: candidate.queryMatches,
    }));
    const rawDecision = await input.rerankCandidates!({
      question: rerankingQuestion,
      requirements: activeRequirements,
      candidates,
      limit,
    });
    if (Array.isArray(rawDecision)) {
      const byChunkId = new Map(candidates.flatMap((candidate) => candidate.chunkIds
        .map((chunkId) => [chunkId, candidate.provisionId] as const)));
      const legacySelections = [...new Set(rawDecision as readonly string[])]
        .slice(0, limit)
        .flatMap((chunkId) => {
          const provisionId = byChunkId.get(chunkId);
          return provisionId ? [{
            provisionId,
            requirementIds: activeRequirements.map((requirement) => requirement.id),
          }] : [];
        });
      return { outcome: legacySelections.length > 0 ? "selected" : "rejected", selections: legacySelections };
    }
    return rawDecision as JuroLegalRerankDecision;
  };

  const applyDecision = (decision: JuroLegalRerankDecision) => {
    const allowedProvisionIds = new Set(candidateState.provisionCandidates.map((candidate) => candidate.provisionId));
    const allowedRequirementIds = new Set(activeRequirements.map((requirement) => requirement.id));
    selections = decision.outcome === "selected"
      ? decision.selections.slice(0, limit).flatMap((selection) =>
        allowedProvisionIds.has(selection.provisionId) ? [{
          provisionId: selection.provisionId,
          requirementIds: [...new Set(selection.requirementIds)].filter((id) => allowedRequirementIds.has(id)),
        }] : [])
      : [];
    const selectedIds = new Set(selections.map((selection) => selection.provisionId));
    fused = candidateState.fusedRanking.filter((candidate) => selectedIds.has(provisionIdentity(candidate.item)))
      .filter((candidate, index, all) => all.findIndex((other) =>
        provisionIdentity(other.item) === provisionIdentity(candidate.item)) === index)
      .slice(0, limit);
    rerankedCandidateCount = fused.length;
    rerankingOutcome = decision.outcome === "rejected" || fused.length === 0 ? "rejected" : "selected";
    for (const discovered of decision.discoveredRequirements ?? []) {
      const statement = normalizeQuery(discovered.statement);
      const alternatives = discovered.alternatives.map(normalizeQuery).filter(Boolean).slice(0, 5);
      if (!statement || alternatives.length === 0) continue;
      if (activeRequirements.some((requirement) => queryIdentity(requirement.statement) === queryIdentity(statement))) continue;
      activeRequirements.push({
        id: `discovered-${activeRequirements.length + 1}`,
        statement,
        alternatives,
      });
      if (activeRequirements.length >= 8) break;
    }
  };

  if (
    input.rerankCandidates
    && candidateState.provisionCandidates.length > 0
    && !unambiguousExactArticleMatch
    && !denseRequiredButUnavailable
  ) {
    try {
      applyDecision(await runReranker());
      const coveredIds = new Set(selections.flatMap((selection) => [...selection.requirementIds]));
      const repairQueries = uniqueQueries(activeRequirements
        .filter((requirement) => !coveredIds.has(requirement.id))
        .map((requirement) => [requirement.statement, ...requirement.alternatives].join(" ")))
        .filter((query) => !executedQueries.some((existing) => queryIdentity(existing) === queryIdentity(query)))
        .slice(0, MAX_REPAIR_QUERIES);
      if (selections.length > 0 && repairQueries.length > 0) {
        const repairLists = await Promise.all(repairQueries.map(findLegalSources));
        repairQueriesRun = repairQueries.length;
        executedQueries = [...executedQueries, ...repairQueries];
        rankedLists = [...rankedLists, ...repairLists];
        candidateState = buildCandidateState();
        applyDecision(await runReranker());
      }
    } catch (error) {
      fused = [];
      selections = [];
      rerankingOutcome = "failed_closed";
      const providerCode = (error as { code?: unknown } | null)?.code;
      rerankingFailureCode = typeof providerCode === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(providerCode)
        ? providerCode
        : error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{1,63}$/u.test(error.name)
          ? error.name
          : "RERANK_FAILED";
    }
  }
  fused = fused.slice(0, limit);
  const selectionMethod: JuroLegalResearchHit["selectionMethod"] = selections.length > 0
    && input.rerankCandidates
    && !unambiguousExactArticleMatch
    ? "semantic_reranker"
    : "deterministic_fallback";

  const anchorChunkIds = [...new Set(fused.map(({ item }) => item.chunkId))];
  const hydrationRequiredIds = new Set(fused
    .filter(({ item }) => item.windowHydrated !== true)
    .map(({ item }) => item.chunkId));
  const hydrateIndividually = () => {
    input.signal?.throwIfAborted();
    return Promise.all(anchorChunkIds.map(async (anchorChunkId) => {
      input.signal?.throwIfAborted();
      const [act, spans] = await Promise.all([
        readTools.inspectLegalAct({ anchorChunkId }),
        readTools.readLegalProvisions({ anchorChunkId }),
      ]);
      input.signal?.throwIfAborted();
      return { anchorChunkId, act, spans };
    }));
  };
  input.signal?.throwIfAborted();
  const anchorPackets = () => fused.map(({ item }) => ({
    anchorChunkId: item.chunkId,
    act: item.sourceUrl ? {
      documentId: item.documentId,
      title: item.documentTitle,
      documentType: item.documentType,
      documentNumber: item.documentNumber,
      adoptingAuthority: item.adoptingAuthority,
      adoptionDate: null,
      publicationDate: null,
      language: item.language,
      status: item.status,
      validFrom: item.validFrom,
      validTo: item.validTo,
      versionDate: item.versionDate,
      sourceUrl: item.sourceUrl,
      fetchedAt: item.fetchedAt,
    } satisfies JuroActRecord : null,
    spans: [] as LegalSourceSpan[],
  }));
  const trustedExactPackets = anchorPackets()
    .filter((packet) => !hydrationRequiredIds.has(packet.anchorChunkId));
  const hydrationPackets = input.hydrateExactWindows === false
    ? anchorPackets()
    : readTools.hydrateLegalSources
    ? [
      ...trustedExactPackets,
      ...(hydrationRequiredIds.size > 0
        ? await readTools.hydrateLegalSources({
          anchorChunkIds: [...hydrationRequiredIds],
          before: 0,
          after: 0,
        }).catch(() => {
          input.signal?.throwIfAborted();
          return anchorPackets().filter((packet) => hydrationRequiredIds.has(packet.anchorChunkId));
        })
        : []),
    ]
    : await hydrateIndividually();
  input.signal?.throwIfAborted();
  const hydrationByAnchor = new Map(hydrationPackets.map((packet) => [packet.anchorChunkId, packet]));
  const hydrated: Array<JuroLegalResearchHit | null> = await Promise.all(fused.map(async ({ identity, item }): Promise<JuroLegalResearchHit | null> => {
    const packet = hydrationByAnchor.get(item.chunkId);
    const act = packet?.act ?? null;
    const window = packet?.spans ?? [];
    if (!act) return null;
    const fallbackSpan: LegalSourceSpan = {
      id: item.chunkId,
      article: item.articleNumber,
      paragraph: null,
      text: item.exactQuote,
      textSha256: item.contentHash,
      quality: "high",
    };
    const exactWindowHydrated = item.windowHydrated === true || window.length > 0;
    if (!exactWindowHydrated && item.candidateExcerptOnly) return null;
    const spans = window.length > 0 ? window : [fallbackSpan];
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
        && passageMatchesAnyRequiredConcept(adjacentPassage, requiredConcepts);
    }).slice(0, Math.max(0, limit - 1));
    return {
      passage: { ...item, windowHydrated: exactWindowHydrated },
      act,
      spans,
      responsiveSpans: [anchorSpan, ...responsiveAdjacentSpans],
      selectionMethod,
      exactWindowHydrated,
      matchedQueries: [...(candidateState.matchedQueries.get(identity) ?? [])],
    };
  }));
  const hits = hydrated.filter((hit): hit is JuroLegalResearchHit => hit !== null);
  const hydratedProvisionIds = new Set(hits.map((hit) => provisionIdentity(hit.passage)));
  const coverageRequirementsResult: JuroLegalCoverageAssessment[] = activeRequirements.map((requirement) => {
    const provisionIds = [...new Set(selections
      .filter((selection) => selection.requirementIds.includes(requirement.id))
      .map((selection) => selection.provisionId)
      .filter((provisionId) => hydratedProvisionIds.has(provisionId)))];
    return {
      requirementId: requirement.id,
      statement: requirement.statement,
      status: provisionIds.length > 0 ? "covered" : "uncovered",
      provisionIds,
    };
  });
  const coveredRequirementCount = coverageRequirementsResult
    .filter((requirement) => requirement.status === "covered").length;
  let coverageStatus: JuroLegalResearchResult["coverageStatus"] = hits.length === 0
    ? "no_coverage"
    : coverageRequirementsResult.length === 0 || coveredRequirementCount === coverageRequirementsResult.length
      ? "good_coverage"
      : coveredRequirementCount > 0 ? "partial_coverage" : "no_coverage";
  if (hits.length > 0 && requestedArticles.size > 0) {
    const foundArticles = new Set(hits.map((hit) => hit.passage.articleNumber).filter(Boolean));
    if ([...requestedArticles].some((article) => !foundArticles.has(article))) {
      coverageStatus = "partial_coverage";
    }
  }
  return {
    hits,
    queriesRun: executedQueries.length,
    retrievedCandidateCount: candidateState.fusedRanking.length,
    rerankCandidateCount: candidateState.provisionCandidates.length,
    rerankedCandidateCount,
    rerankingOutcome,
    rerankingFailureCode,
    exactWindowSuccesses: hits.filter((hit) => hit.exactWindowHydrated).length,
    denseUnavailable,
    coverageStatus,
    coverageRequirements: coverageRequirementsResult,
    repairQueriesRun,
    indexedAvailability: rerankingOutcome === "failed_closed"
      ? "unavailable"
      : denseUnavailable ? "degraded" : "available",
  };
}
