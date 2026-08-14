import { detectLegalQueryLanguage } from "../legal/legal-language";
import { retrieveLiveLexSources } from "../legal/live-lex-retrieval";
import {
  assessLegalCorpusCoverage,
  retrieveLegalCorpus,
  type LegalCorpusRetrievalItem,
  type LegalCorpusSearchScope,
} from "./retrieval";
import { featureEnabled, type LegalCorpusFeatureFlag } from "./trust";

export type LegalSourceProviderResult = {
  source_id: string;
  provider: "lex_uz";
  jurisdiction: "UZ";
  document_id: string;
  document_title: string;
  document_type: string;
  article_number: string;
  article_title: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  status: "active" | "repealed" | "historical" | "unknown";
  valid_from: string | null;
  valid_to: string | null;
  version_date: string | null;
  exact_quote: string;
  source_url: string;
  fetched_at: string;
  content_hash: string;
  confidence: number;
};

export type LegalSourceProviderRequest = {
  query: string;
  scope?: LegalCorpusSearchScope;
  limit?: number;
  signal?: AbortSignal;
};

export interface LegalSourceProvider {
  readonly id: "lex_uz_indexed" | "lex_uz_live";
  search(request: LegalSourceProviderRequest): Promise<LegalSourceProviderResult[]>;
}

function indexedSource(item: LegalCorpusRetrievalItem): LegalSourceProviderResult | null {
  if (!item.sourceUrl) return null;
  return {
    source_id: item.chunkId,
    provider: "lex_uz",
    jurisdiction: "UZ",
    document_id: item.documentId,
    document_title: item.documentTitle,
    document_type: item.documentType ?? "legal_act",
    article_number: item.articleNumber ?? "",
    article_title: item.articleTitle ?? "",
    language: item.language,
    status: item.status,
    valid_from: item.validFrom,
    valid_to: item.validTo,
    version_date: item.versionDate,
    exact_quote: item.exactQuote,
    source_url: item.sourceUrl,
    fetched_at: item.fetchedAt,
    content_hash: item.contentHash,
    confidence: item.fusionScore ?? 0,
  };
}

export class LexUzIndexedProvider implements LegalSourceProvider {
  readonly id = "lex_uz_indexed" as const;

  constructor(private readonly db: D1Database) {}

  async search(request: LegalSourceProviderRequest): Promise<LegalSourceProviderResult[]> {
    const results = await retrieveLegalCorpus({
      db: this.db,
      query: request.query,
      scope: request.scope,
      limit: request.limit,
      officialOnly: true,
    });
    return results.map(indexedSource).filter((source): source is LegalSourceProviderResult => Boolean(source));
  }
}

function liveLocale(query: string): "ru" | "uz" {
  return detectLegalQueryLanguage(query) === "ru" ? "ru" : "uz";
}

function corpusLanguage(locale: string): LegalSourceProviderResult["language"] {
  if (locale === "ru") return "ru";
  if (locale === "uzc") return "uz-Cyrl";
  if (locale === "en") return "en";
  return "uz-Latn";
}

export class LexUzLiveProvider implements LegalSourceProvider {
  readonly id = "lex_uz_live" as const;

  async search(request: LegalSourceProviderRequest): Promise<LegalSourceProviderResult[]> {
    const result = await retrieveLiveLexSources({
      query: request.query,
      locale: liveLocale(request.query),
      limit: request.limit,
      signal: request.signal,
      budgetMs: 7_500,
    });
    return result.sources.map((source): LegalSourceProviderResult => ({
      source_id: source.id,
      provider: "lex_uz" as const,
      jurisdiction: "UZ" as const,
      document_id: source.actIdentifier ?? source.id,
      document_title: source.actTitle,
      document_type: "legal_act",
      article_number: source.article ?? "",
      article_title: "",
      language: corpusLanguage(source.locale),
      status: source.applicabilityStatus === "historical" ? "historical" : "active",
      valid_from: null,
      valid_to: null,
      version_date: source.revisionDate,
      exact_quote: source.spans?.map((span) => span.text).join("\n\n") ?? source.excerpt ?? "",
      source_url: source.officialUrl,
      fetched_at: source.lastCheckedAt,
      content_hash: source.contentSha256,
      confidence: source.sourceQuality?.passed ? 1 : 0,
    })).filter((source) => source.exact_quote.length > 0 && source.confidence > 0);
  }
}

export type LegalSourceResolution = {
  sources: LegalSourceProviderResult[];
  coverage: "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage";
  mode: "indexed" | "live_fallback" | "unavailable";
};

type ProviderEnv = Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

/**
 * Indexed official sources are always preferred. Live Lex.uz is a controlled
 * fallback for insufficient coverage and is never queried for arbitrary URLs.
 */
export async function resolveLegalSources(input: {
  db: D1Database;
  env: ProviderEnv;
  query: string;
  scope?: LegalCorpusSearchScope;
  limit?: number;
  signal?: AbortSignal;
}): Promise<LegalSourceResolution> {
  if (!featureEnabled(input.env, "LEGAL_CORPUS_ENABLED")) {
    return { sources: [], coverage: "no_coverage", mode: "unavailable" };
  }
  const indexedProvider = new LexUzIndexedProvider(input.db);
  const indexed = await indexedProvider.search({
    query: input.query, scope: input.scope, limit: input.limit, signal: input.signal,
  });
  const coverage = assessLegalCorpusCoverage({
    query: input.query,
    sources: indexed.map((source) => ({
      chunkId: source.source_id,
      documentId: source.document_id,
      documentTitle: source.document_title,
      documentType: source.document_type,
      articleNumber: source.article_number || null,
      articleTitle: source.article_title || null,
      exactQuote: source.exact_quote,
      sourceUrl: source.source_url,
      language: source.language,
      status: source.status,
      validFrom: source.valid_from,
      validTo: source.valid_to,
      versionDate: source.version_date,
      fetchedAt: source.fetched_at,
      contentHash: source.content_hash,
    })),
  });
  if (coverage === "good_coverage" || coverage === "partial_coverage"
    || !featureEnabled(input.env, "LEGAL_CORPUS_LIVE_LEXUZ_ENABLED")) {
    return { sources: indexed, coverage, mode: "indexed" };
  }
  const live = await new LexUzLiveProvider().search({
    query: input.query, scope: input.scope, limit: input.limit, signal: input.signal,
  });
  return {
    sources: live,
    coverage: live.length > 0 ? "partial_coverage" : "no_coverage",
    mode: live.length > 0 ? "live_fallback" : "unavailable",
  };
}
