import type { LegalSourceContext } from "../ai/provider";
import {
  retrieveLiveLexSources,
  type LiveLexRetrievalResult,
} from "../legal/live-lex-retrieval";
import {
  legalDatabaseFreshnessFromAsOf,
  type LegalDatabaseFreshness,
} from "../legal/verified-retrieval";
import { enqueueOfficialLexCorpusDocument } from "./ingestion";
import {
  assessLegalCorpusCoverage,
  type LegalCorpusSearchScope,
} from "./retrieval";
import {
  LexUzIndexedProvider,
  type LegalSourceProviderResult,
} from "./source-provider";
import {
  featureEnabled,
  type LegalCorpusFeatureFlag,
} from "./trust";

type CorpusRuntimeEnv = Pick<Env, "DB"> & { APP_ENV?: Env["APP_ENV"] }
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

export type LegalChatSourceEvidence = {
  sourceId: string;
  sourceKind: "lex";
  canonicalUrl: string;
  contentSha256: string;
  retrievedAt: string;
  validatedAt: string;
  validationStatus: "validated";
};

export type LegalChatSourceRetrieval = {
  sources: LegalSourceContext[];
  freshness: LegalDatabaseFreshness;
  legalDatabaseAsOf: string;
  sourceAccessMode: "direct" | "approved_package";
  sourcesRetrievedAt: string | null;
  sourceValidationStatus: "validated" | "unavailable";
  errors: Array<{ code: string }>;
  evidence: LegalChatSourceEvidence[];
};

type LiveSearchInput = Parameters<typeof retrieveLiveLexSources>[0];

function providerCoverage(query: string, sources: readonly LegalSourceProviderResult[]) {
  return assessLegalCorpusCoverage({
    query,
    sources: sources.map((source) => ({
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
}

function sourceLocale(language: LegalSourceProviderResult["language"]): string {
  if (language === "uz-Cyrl") return "uzc";
  if (language === "uz-Latn") return "uz";
  return language;
}

function officialLexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
      && /^(?:\/(?:ru|uz|uzc|en))?\/docs\/-?\d+/u.test(url.pathname);
  } catch {
    return false;
  }
}

function indexedContext(source: LegalSourceProviderResult): LegalSourceContext | null {
  if (
    !officialLexUrl(source.source_url)
    || !source.document_title.trim()
    || !source.exact_quote.trim()
    || !/^[a-f0-9]{64}$/u.test(source.content_hash)
  ) {
    return null;
  }
  const historical = source.status === "historical" || source.status === "repealed";
  return {
    id: source.source_id,
    actTitle: source.document_title,
    actIdentifier: source.document_id,
    officialUrl: source.source_url,
    revisionDate: source.version_date,
    lastCheckedAt: source.fetched_at,
    locale: sourceLocale(source.language),
    publishedAt: null,
    sourceType: "lex",
    status: "verified",
    verificationState: "verified",
    verifiedAt: source.fetched_at,
    contentSha256: source.content_hash,
    article: source.article_number || null,
    excerpt: source.exact_quote.slice(0, 1_200),
    effectiveDate: source.valid_from,
    applicabilityStatus: historical ? "historical" : "current",
    spans: [{
      id: `${source.source_id}:span`,
      article: source.article_number || null,
      paragraph: null,
      text: source.exact_quote,
      textSha256: source.content_hash,
      quality: "high",
    }],
    sourceQuality: {
      passed: true,
      title: source.document_title.trim().length > 0,
      sufficientText: source.exact_quote.trim().length > 0,
      clean: true,
      locale: true,
      canonicalUrl: true,
      structured: true,
    },
  };
}

function indexedRetrieval(
  sources: readonly LegalSourceProviderResult[],
  now: Date,
): LegalChatSourceRetrieval {
  const contexts = sources.map(indexedContext).filter((source): source is LegalSourceContext => Boolean(source));
  const retrievedAt = contexts.map((source) => source.lastCheckedAt)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) ?? null;
  const freshness = retrievedAt
    ? legalDatabaseFreshnessFromAsOf(retrievedAt, now)
    : legalDatabaseFreshnessFromAsOf("unavailable", now);
  return {
    sources: contexts,
    freshness,
    legalDatabaseAsOf: freshness.asOf,
    sourceAccessMode: "approved_package",
    sourcesRetrievedAt: retrievedAt,
    sourceValidationStatus: contexts.length > 0 ? "validated" : "unavailable",
    errors: contexts.length > 0 ? [] : [{ code: "LEGAL_CORPUS_INDEXED_SOURCE_REJECTED" }],
    evidence: contexts.map((source) => ({
      sourceId: source.id,
      sourceKind: "lex",
      canonicalUrl: source.officialUrl,
      contentSha256: source.contentSha256,
      retrievedAt: source.lastCheckedAt,
      validatedAt: source.verifiedAt,
      validationStatus: "validated",
    })),
  };
}

async function queueValidatedLiveSources(
  env: CorpusRuntimeEnv,
  result: LiveLexRetrievalResult,
  correlationId?: string,
): Promise<void> {
  if (
    result.sourceValidationStatus !== "validated"
    || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")
  ) return;
  await Promise.all(result.sources.map(async (source) => {
    if (source.verificationState !== "direct_validated" || !source.sourceQuality?.passed) return;
    try {
      await enqueueOfficialLexCorpusDocument(env, {
        sourceUrl: source.officialUrl,
        correlationId,
      });
    } catch {
      // Interactive legal answers must not fail because the background corpus
      // queue is temporarily unavailable. No question or source text is logged.
    }
  }));
}

/**
 * Keeps the current direct Lex flow as the exact feature-off fallback. When
 * enabled, an immutable indexed packet is preferred; weak/no coverage falls
 * back to the existing live validator and queues only those validated URLs.
 */
export async function retrieveCorpusAwareLegalSources(input: {
  env: CorpusRuntimeEnv;
  query: string;
  locale: "ru" | "uz";
  limit?: number;
  signal?: AbortSignal;
  budgetMs?: number;
  scope?: LegalCorpusSearchScope;
  correlationId?: string;
  now?: Date;
  discoverOfficialUrls?: LiveSearchInput["discoverOfficialUrls"];
  liveSearch?: typeof retrieveLiveLexSources;
}): Promise<LegalChatSourceRetrieval> {
  const liveSearch = input.liveSearch ?? retrieveLiveLexSources;
  const liveInput: LiveSearchInput = {
    query: input.query,
    locale: input.locale,
    limit: input.limit,
    signal: input.signal,
    budgetMs: input.budgetMs,
    discoverOfficialUrls: input.discoverOfficialUrls,
  };
  if (!featureEnabled(input.env, "LEGAL_CORPUS_ENABLED")) {
    return liveSearch(liveInput);
  }

  let indexed: LegalSourceProviderResult[] = [];
  try {
    indexed = await new LexUzIndexedProvider(input.env.DB).search({
      query: input.query,
      scope: input.scope,
      limit: input.limit,
      signal: input.signal,
    });
  } catch {
    indexed = [];
  }
  const coverage = providerCoverage(input.query, indexed);
  const indexedPacket = indexedRetrieval(indexed, input.now ?? new Date());
  const hasUsableIndexedCoverage = indexedPacket.sources.length > 0
    && (coverage === "good_coverage" || coverage === "partial_coverage");
  const liveEnabled = featureEnabled(input.env, "LEGAL_CORPUS_LIVE_LEXUZ_ENABLED");
  const useIndexed = hasUsableIndexedCoverage
    && (indexedPacket.freshness.status === "fresh" || !liveEnabled);

  // The existing direct Lex fallback resolves the current page. It must not
  // be presented as point-in-time evidence when an explicit historical date
  // was requested. Until a matching ONDATE packet is indexed, fail closed.
  if (input.scope?.asOfDate) {
    return indexedPacket;
  }

  if (featureEnabled(input.env, "LEGAL_CORPUS_SHADOW_MODE")) {
    const live = await liveSearch(liveInput);
    await queueValidatedLiveSources(input.env, live, input.correlationId);
    return live;
  }
  if (useIndexed) return indexedPacket;
  if (!liveEnabled) {
    return hasUsableIndexedCoverage ? indexedPacket : indexedRetrieval([], input.now ?? new Date());
  }
  const live = await liveSearch(liveInput);
  await queueValidatedLiveSources(input.env, live, input.correlationId);
  return live;
}
