import type { LegalSourceContext, LegalSourceSpan } from "../ai/provider";
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
  runJuroLegalResearchLoop,
  type JuroLegalCandidateReranker,
  type JuroLegalRequiredConcept,
  type JuroLegalResearchHit,
  type JuroLegalResearchResult,
} from "./legal-research-loop";
import { createJuroLegalCorpusReadServiceTools } from "./legal-read-service";
import { createReadOnlyLegalCorpusDatabase } from "./read-only-d1";
import {
  featureEnabled,
  type LegalCorpusFeatureFlag,
} from "./trust";
import { createQdrantDenseSearch } from "./qdrant-indexing";

type CorpusRuntimeEnv = Pick<Env, "DB"> & { APP_ENV?: Env["APP_ENV"] }
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>
  & {
    OPENAI_API_KEY?: string;
    EMBEDDING_MODEL?: string;
    QDRANT_URL?: string;
    QDRANT_API_KEY?: string;
    QDRANT_COLLECTION?: string;
    LEGAL_CORPUS_READ_DB?: D1Database;
    LEGAL_CORPUS_READ_SERVICE?: Fetcher;
    LEGAL_CORPUS_REMOTE_READ_ENABLED?: string;
  };

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
  sourceAccessMode: "direct" | "approved_package" | "mixed";
  sourcesRetrievedAt: string | null;
  sourceValidationStatus: "validated" | "unavailable";
  errors: Array<{ code: string }>;
  evidence: LegalChatSourceEvidence[];
  coverageStatus: "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage";
  retrievalTelemetry?: {
    indexedHitCount: number;
    liveHitCount: number;
    queriesRun: number;
    retrievedCandidateCount: number;
    rerankCandidateCount: number;
    rerankedCandidateCount: number;
    rerankingOutcome: JuroLegalResearchResult["rerankingOutcome"];
    rerankingFailureCode: string | null;
    exactWindowSuccesses: number;
    denseUnavailable: boolean;
    fusionOutcome: "indexed" | "live" | "mixed" | "none";
  };
};

type LiveSearchInput = Parameters<typeof retrieveLiveLexSources>[0];

function sourceLocale(language: JuroLegalResearchHit["passage"]["language"]): string {
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

function indexedArticleNumber(span: LegalSourceSpan, fallback: string | null): string | null {
  const match = span.article?.match(/^(?:статья|ст\.?|модда|modda|article)?\s*(\d+(?:[.-]\d+)?)/iu);
  return match?.[1] ?? fallback;
}

function indexedContext(hit: JuroLegalResearchHit, span: LegalSourceSpan): LegalSourceContext | null {
  const source = hit.passage;
  if (
    !officialLexUrl(hit.act.sourceUrl)
    || !hit.act.title.trim()
    || !span.text.trim()
    || !/^[a-f0-9]{64}$/u.test(span.textSha256)
  ) {
    return null;
  }
  const historical = source.status === "historical" || source.status === "repealed";
  const anchor = span.id === source.chunkId;
  return {
    id: span.id,
    actTitle: hit.act.title,
    actIdentifier: source.documentId,
    officialUrl: hit.act.sourceUrl,
    revisionDate: source.versionDate,
    lastCheckedAt: source.fetchedAt,
    locale: sourceLocale(source.language),
    publishedAt: hit.act.publicationDate,
    sourceType: "lex",
    documentType: source.documentType,
    documentNumber: source.documentNumber,
    adoptingAuthority: source.adoptingAuthority,
    sourceClass: source.sourceClass,
    status: "verified",
    verificationState: "verified",
    verifiedAt: source.fetchedAt,
    contentSha256: span.textSha256,
    article: indexedArticleNumber(span, source.articleNumber),
    excerpt: span.text.slice(0, 1_200),
    effectiveDate: source.validFrom,
    applicabilityStatus: historical ? "historical" : "current",
    spans: [span],
    sourceQuality: {
      passed: true,
      title: hit.act.title.trim().length > 0,
      sufficientText: span.text.trim().length > 0,
      clean: true,
      locale: true,
      canonicalUrl: true,
      structured: hit.exactWindowHydrated,
    },
    retrievalSelection: anchor ? hit.selectionMethod : "responsive_neighbour",
  };
}

function indexedRetrieval(
  hits: readonly JuroLegalResearchHit[],
  now: Date,
  coverageStatus: LegalChatSourceRetrieval["coverageStatus"],
  metrics: {
    queriesRun: number;
    retrievedCandidateCount: number;
    rerankCandidateCount: number;
    rerankedCandidateCount: number;
    rerankingOutcome: JuroLegalResearchResult["rerankingOutcome"];
    rerankingFailureCode: string | null;
    exactWindowSuccesses: number;
    denseUnavailable: boolean;
  } = {
    queriesRun: 0,
    retrievedCandidateCount: 0,
    rerankCandidateCount: 0,
    rerankedCandidateCount: 0,
    rerankingOutcome: "not_configured",
    rerankingFailureCode: null,
    exactWindowSuccesses: 0,
    denseUnavailable: false,
  },
): LegalChatSourceRetrieval {
  // A selected anchor can have a second independently responsive provision
  // immediately beside it (for example a rule followed by its protected-status
  // exception). Publish those exact provisions as separate source identities;
  // otherwise one anchor ID collapses several article cards back into one.
  const expandedContexts = hits.flatMap((hit) => hit.responsiveSpans
    .map((span) => indexedContext(hit, span))
    .filter((source): source is LegalSourceContext => Boolean(source)));
  const contexts = [...new Map(expandedContexts.map((source) => [source.id, source])).values()]
    .slice(0, 12);
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
    coverageStatus,
    retrievalTelemetry: {
      indexedHitCount: contexts.length,
      liveHitCount: 0,
      queriesRun: metrics.queriesRun,
      retrievedCandidateCount: metrics.retrievedCandidateCount,
      rerankCandidateCount: metrics.rerankCandidateCount,
      rerankedCandidateCount: metrics.rerankedCandidateCount,
      rerankingOutcome: metrics.rerankingOutcome,
      rerankingFailureCode: metrics.rerankingFailureCode,
      exactWindowSuccesses: metrics.exactWindowSuccesses,
      denseUnavailable: metrics.denseUnavailable,
      fusionOutcome: contexts.length > 0 ? "indexed" : "none",
    },
  };
}

function liveCoverage(
  query: string,
  sources: readonly LegalSourceContext[],
  locale: "ru" | "uz",
): LegalChatSourceRetrieval["coverageStatus"] {
  return assessLegalCorpusCoverage({
    query,
    preferredLanguage: locale === "ru" ? "ru" : undefined,
    sources: sources.flatMap((source, index) => {
      const exactQuote = source.spans?.[0]?.text ?? source.excerpt ?? "";
      if (!exactQuote.trim()) return [];
      return [{
        chunkId: source.id,
        documentId: source.actIdentifier ?? source.id,
        documentTitle: source.actTitle,
        documentType: "legal_act",
        documentNumber: source.actIdentifier ?? null,
        adoptingAuthority: null,
        sourceClass: "OFFICIAL_LEGISLATION" as const,
        articleNumber: source.article ?? null,
        articleTitle: null,
        exactQuote,
        sourceUrl: source.officialUrl,
        language: source.locale === "uzc" ? "uz-Cyrl" as const
          : source.locale === "uz" ? "uz-Latn" as const
            : source.locale === "en" ? "en" as const : "ru" as const,
        status: source.applicabilityStatus === "historical" ? "historical" as const : "active" as const,
        validFrom: source.effectiveDate ?? null,
        validTo: null,
        versionDate: source.revisionDate,
        fetchedAt: source.lastCheckedAt,
        contentHash: source.contentSha256,
        provider: "lex_uz",
        denseRank: index + 1,
        semanticScore: source.sourceQuality?.passed ? 1 : 0,
        fusionScore: 2 / (61 + index),
        windowHydrated: Boolean(source.spans?.length),
      }];
    }),
  });
}

function withLiveCoverage(
  result: LiveLexRetrievalResult,
  query: string,
  locale: "ru" | "uz",
): LegalChatSourceRetrieval {
  return {
    ...result,
    coverageStatus: liveCoverage(query, result.sources, locale),
    retrievalTelemetry: {
      indexedHitCount: 0,
      liveHitCount: result.sources.length,
      queriesRun: 0,
      retrievedCandidateCount: 0,
      rerankCandidateCount: 0,
      rerankedCandidateCount: 0,
      rerankingOutcome: "not_configured",
      rerankingFailureCode: null,
      exactWindowSuccesses: 0,
      denseUnavailable: false,
      fusionOutcome: result.sources.length > 0 ? "live" : "none",
    },
  };
}

function sourceDeduplicationKey(source: LegalSourceContext): string {
  const spanHash = source.spans?.[0]?.textSha256 ?? source.contentSha256;
  return [source.actIdentifier ?? source.officialUrl, source.revisionDate ?? "current", source.article ?? "", spanHash]
    .join("\u001f");
}

function mergeIndexedAndLive(
  indexed: LegalChatSourceRetrieval,
  live: LegalChatSourceRetrieval,
  query: string,
  locale: "ru" | "uz",
): LegalChatSourceRetrieval {
  const sourcesByKey = new Map<string, LegalSourceContext>();
  for (const source of [...indexed.sources, ...live.sources]) {
    const key = sourceDeduplicationKey(source);
    const current = sourcesByKey.get(key);
    if (!current || source.verificationState === "direct_validated") sourcesByKey.set(key, source);
  }
  const sources = [...sourcesByKey.values()];
  const sourceIds = new Set(sources.map((source) => source.id));
  const evidence = [...indexed.evidence, ...live.evidence].filter((item, index, all) =>
    sourceIds.has(item.sourceId) && all.findIndex((candidate) => candidate.sourceId === item.sourceId) === index,
  );
  const newestRetrievedAt = [indexed.sourcesRetrievedAt, live.sourcesRetrievedAt]
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort()
    .at(-1) ?? null;
  return {
    sources,
    evidence,
    freshness: live.sources.length > 0 ? live.freshness : indexed.freshness,
    legalDatabaseAsOf: live.sources.length > 0 ? live.legalDatabaseAsOf : indexed.legalDatabaseAsOf,
    sourceAccessMode: indexed.sources.length > 0 && live.sources.length > 0
      ? "mixed"
      : live.sources.length > 0 ? "direct" : "approved_package",
    sourcesRetrievedAt: newestRetrievedAt,
    sourceValidationStatus: sources.length > 0 ? "validated" : "unavailable",
    errors: [...indexed.errors, ...live.errors],
    coverageStatus: liveCoverage(query, sources, locale),
    retrievalTelemetry: {
      indexedHitCount: indexed.sources.length,
      liveHitCount: live.sources.length,
      queriesRun: indexed.retrievalTelemetry?.queriesRun ?? 0,
      retrievedCandidateCount: indexed.retrievalTelemetry?.retrievedCandidateCount ?? 0,
      rerankCandidateCount: indexed.retrievalTelemetry?.rerankCandidateCount ?? 0,
      rerankedCandidateCount: indexed.retrievalTelemetry?.rerankedCandidateCount ?? 0,
      rerankingOutcome: indexed.retrievalTelemetry?.rerankingOutcome ?? "not_configured",
      rerankingFailureCode: indexed.retrievalTelemetry?.rerankingFailureCode ?? null,
      exactWindowSuccesses: indexed.retrievalTelemetry?.exactWindowSuccesses ?? 0,
      denseUnavailable: indexed.retrievalTelemetry?.denseUnavailable ?? false,
      fusionOutcome: indexed.sources.length > 0 && live.sources.length > 0
        ? "mixed"
        : live.sources.length > 0 ? "live" : indexed.sources.length > 0 ? "indexed" : "none",
    },
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
  indexQueries?: readonly string[] | Promise<readonly string[]>;
  rerankingQuestion?: string | Promise<string>;
  requiredConcepts?: readonly JuroLegalRequiredConcept[] | Promise<readonly JuroLegalRequiredConcept[]>;
  lexSearchQueries?: readonly string[] | Promise<readonly string[]>;
  limit?: number;
  signal?: AbortSignal;
  budgetMs?: number;
  scope?: LegalCorpusSearchScope;
  correlationId?: string;
  now?: Date;
  discoverOfficialUrls?: LiveSearchInput["discoverOfficialUrls"];
  liveSearch?: typeof retrieveLiveLexSources;
  onLiveSearchStarted?: () => void | Promise<void>;
  rerankCandidates?: JuroLegalCandidateReranker;
}): Promise<LegalChatSourceRetrieval> {
  const liveSearch = input.liveSearch ?? retrieveLiveLexSources;
  const resolvedLiveInput = (): LiveSearchInput => ({
    query: input.query,
    locale: input.locale,
    limit: input.limit,
    signal: input.signal,
    budgetMs: input.budgetMs,
    searchQueries: Promise.resolve(input.lexSearchQueries ?? []).catch(() => []),
    discoverOfficialUrls: input.discoverOfficialUrls,
  });
  if (!featureEnabled(input.env, "LEGAL_CORPUS_ENABLED")) {
    await input.onLiveSearchStarted?.();
    return withLiveCoverage(await liveSearch(resolvedLiveInput()), input.query, input.locale);
  }

  let indexed: JuroLegalResearchHit[] = [];
  let indexedMetrics = {
    queriesRun: 0,
    retrievedCandidateCount: 0,
    rerankCandidateCount: 0,
    rerankedCandidateCount: 0,
    rerankingOutcome: "not_configured" as JuroLegalResearchResult["rerankingOutcome"],
    rerankingFailureCode: null as string | null,
    exactWindowSuccesses: 0,
    denseUnavailable: false,
  };
  try {
    const remoteReadRequested = input.env.LEGAL_CORPUS_REMOTE_READ_ENABLED === "true";
    if (remoteReadRequested && (
      input.env.APP_ENV !== "development"
      || (!input.env.LEGAL_CORPUS_READ_DB && !input.env.LEGAL_CORPUS_READ_SERVICE)
    )) {
      throw new TypeError("LEGAL_CORPUS_REMOTE_READ_UNAVAILABLE");
    }
    const remoteReadDatabase = remoteReadRequested && input.env.LEGAL_CORPUS_READ_DB
      ? createReadOnlyLegalCorpusDatabase(input.env.LEGAL_CORPUS_READ_DB)
      : undefined;
    const readTools = remoteReadRequested
      && !remoteReadDatabase
      && input.env.LEGAL_CORPUS_READ_SERVICE
      ? createJuroLegalCorpusReadServiceTools({
        service: input.env.LEGAL_CORPUS_READ_SERVICE,
        signal: input.signal,
      })
      : undefined;
    const denseSearch = !remoteReadRequested && input.env.APP_ENV
      ? createQdrantDenseSearch({
        ...input.env,
        APP_ENV: input.env.APP_ENV,
        DB: input.env.DB,
      })
      : undefined;
    const research = await runJuroLegalResearchLoop({
      db: remoteReadDatabase ?? input.env.DB,
      originalQuery: input.query,
      generatedQueries: input.indexQueries,
      rerankingQuestion: input.rerankingQuestion,
      requiredConcepts: input.requiredConcepts,
      locale: input.locale,
      scope: input.scope,
      limit: Math.max(input.limit ?? 3, 8),
      denseSearch,
      readTools,
      rerankCandidates: input.rerankCandidates,
    });
    indexed = research.hits;
    indexedMetrics = {
      queriesRun: research.queriesRun,
      retrievedCandidateCount: research.retrievedCandidateCount,
      rerankCandidateCount: research.rerankCandidateCount,
      rerankedCandidateCount: research.rerankedCandidateCount,
      rerankingOutcome: research.rerankingOutcome,
      rerankingFailureCode: research.rerankingFailureCode,
      exactWindowSuccesses: research.exactWindowSuccesses,
      denseUnavailable: research.denseUnavailable,
    };
  } catch {
    indexed = [];
  }
  const coverage = assessLegalCorpusCoverage({
    query: input.query,
    preferredLanguage: input.locale === "ru" ? "ru" : undefined,
    sources: indexed.map((hit) => hit.passage),
  });
  const indexedPacket = indexedRetrieval(indexed, input.now ?? new Date(), coverage, indexedMetrics);
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
    await input.onLiveSearchStarted?.();
    const live = await liveSearch(resolvedLiveInput());
    await queueValidatedLiveSources(input.env, live, input.correlationId);
    return withLiveCoverage(live, input.query, input.locale);
  }
  if (useIndexed) return indexedPacket;
  if (!liveEnabled) {
    return indexedPacket;
  }
  await input.onLiveSearchStarted?.();
  try {
    const live = await liveSearch(resolvedLiveInput());
    await queueValidatedLiveSources(input.env, live, input.correlationId);
    return mergeIndexedAndLive(
      indexedPacket,
      withLiveCoverage(live, input.query, input.locale),
      input.query,
      input.locale,
    );
  } catch {
    return indexedPacket;
  }
}
