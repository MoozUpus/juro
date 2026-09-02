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
  FederatedLexUzIndexedProvider,
  LexUzIndexedProvider,
  type LegalSourceProviderResult,
} from "./source-provider";
import {
  featureEnabled,
  type LegalCorpusFeatureFlag,
} from "./trust";
import { createQdrantDenseSearch } from "./qdrant-indexing";

type CorpusRuntimeEnv = Pick<Env, "DB"> & { APP_ENV?: Env["APP_ENV"] }
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>
  & {
    LEGAL_CORPUS_FEDERATED_ENABLED?: string;
    LEGAL_CORPUS_FEDERATED_SOURCE_SET?: string;
    LEGAL_CORPUS_LEGACY_DB?: D1Database;
    LEGAL_CORPUS_V2_DB?: D1Database;
    LEGAL_CORPUS_SHARD_1_DB?: D1Database;
    LEGAL_CORPUS_SHARD_2_DB?: D1Database;
    LEGAL_CORPUS_SHARD_3_DB?: D1Database;
    OPENAI_API_KEY?: string;
    EMBEDDING_MODEL?: string;
    QDRANT_URL?: string;
    QDRANT_API_KEY?: string;
    QDRANT_COLLECTION?: string;
  };

const MAX_FEDERATED_CORPUS_BINDINGS = 32;
const ALL_STAGING_CORPUS_SOURCE_SET = "all-staging-d1";

function isD1Database(value: unknown): value is D1Database {
  return Boolean(value) && typeof value === "object"
    && typeof (value as { prepare?: unknown }).prepare === "function";
}

export function configuredFederatedCorpusShards(
  env: CorpusRuntimeEnv,
): Array<{ databaseName: string; db: D1Database }> | null {
  if (env.LEGAL_CORPUS_FEDERATED_ENABLED !== "true") return null;
  if (env.APP_ENV !== "staging") {
    throw new TypeError("LEGAL_CORPUS_FEDERATION_ENVIRONMENT_INVALID");
  }
  const record = env as CorpusRuntimeEnv & Record<string, unknown>;
  if (env.LEGAL_CORPUS_FEDERATED_SOURCE_SET === ALL_STAGING_CORPUS_SOURCE_SET) {
    const explicit = [
      ["juro-staging", record.LEGAL_CORPUS_LEGACY_DB],
      ["juro-staging-corpus-v2", record.LEGAL_CORPUS_V2_DB],
      ["juro-staging-corpus-shard-1", record.LEGAL_CORPUS_SHARD_1_DB],
      ["juro-staging-corpus-shard-2", record.LEGAL_CORPUS_SHARD_2_DB],
      ["juro-staging-corpus-shard-3", record.LEGAL_CORPUS_SHARD_3_DB],
    ] as const;
    if (explicit.some(([, value]) => !isD1Database(value))) {
      throw new TypeError("LEGAL_CORPUS_FEDERATION_BINDINGS_INCOMPLETE");
    }
    return explicit.map(([databaseName, db]) => ({ databaseName, db: db as D1Database }));
  }
  const values = Array.from({ length: MAX_FEDERATED_CORPUS_BINDINGS }, (_, index) => (
    record[`LEGAL_CORPUS_SHARD_${index + 1}_DB`]
  ));
  const lastBinding = values.findLastIndex((value) => value !== undefined && value !== null);
  if (lastBinding < 1) {
    throw new TypeError("LEGAL_CORPUS_FEDERATION_BINDINGS_INCOMPLETE");
  }
  return values.slice(0, lastBinding + 1).map((value, index) => {
    if (!isD1Database(value)) {
      throw new TypeError(`LEGAL_CORPUS_FEDERATION_BINDING_INVALID:${index + 1}`);
    }
    return {
      databaseName: `juro-staging-corpus-shard-${index + 1}`,
      db: value,
    };
  });
}

async function liveFallbackIngestionEnv(
  env: CorpusRuntimeEnv,
  shards: ReturnType<typeof configuredFederatedCorpusShards>,
  federationRequested: boolean,
): Promise<CorpusRuntimeEnv | null> {
  if (!shards) return federationRequested ? null : env;
  const states = await Promise.all(shards.map(async (shard) => {
    try {
      const row = await shard.db.prepare(`SELECT acquisition_state AS state
        FROM legal_corpus_shard_control WHERE singleton_id=1 LIMIT 1`)
        .first<{ state: string }>();
      return row?.state === "active" ? shard.db : null;
    } catch {
      // Legacy and corpus-v2 databases predate shard-control. They are
      // intentionally read-only federation sources, never ingestion targets.
      return null;
    }
  }));
  const active = states.filter((db): db is D1Database => Boolean(db));
  return active.length === 1 ? { ...env, DB: active[0]! } : null;
}

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
  coverageStatus: "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage";
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
      documentNumber: source.document_number,
      adoptingAuthority: source.adopting_authority,
      sourceClass: source.source_class,
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
    documentType: source.document_type,
    documentNumber: source.document_number,
    adoptingAuthority: source.adopting_authority,
    sourceClass: source.source_class,
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
  coverageStatus: LegalChatSourceRetrieval["coverageStatus"],
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
    coverageStatus,
  };
}

function liveCoverage(
  query: string,
  sources: readonly LegalSourceContext[],
): LegalChatSourceRetrieval["coverageStatus"] {
  return assessLegalCorpusCoverage({
    query,
    sources: sources.flatMap((source) => {
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
      }];
    }),
  });
}

function withLiveCoverage(
  result: LiveLexRetrievalResult,
  query: string,
): LegalChatSourceRetrieval {
  return { ...result, coverageStatus: liveCoverage(query, result.sources) };
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
  const federationRequested = input.env.LEGAL_CORPUS_FEDERATED_ENABLED === "true";
  if (!featureEnabled(input.env, "LEGAL_CORPUS_ENABLED")) {
    return withLiveCoverage(await liveSearch(liveInput), input.query);
  }

  let indexed: LegalSourceProviderResult[] = [];
  let federatedShards: ReturnType<typeof configuredFederatedCorpusShards> = null;
  try {
    federatedShards = configuredFederatedCorpusShards(input.env);
    const denseSearch = input.env.APP_ENV
      ? createQdrantDenseSearch({
        ...input.env,
        APP_ENV: input.env.APP_ENV,
        DB: input.env.DB,
      })
      : undefined;
    const indexedProvider = federatedShards
      ? new FederatedLexUzIndexedProvider(federatedShards, denseSearch)
      : new LexUzIndexedProvider(input.env.DB, denseSearch);
    indexed = await indexedProvider.search({
      query: input.query,
      scope: input.scope,
      limit: input.limit,
      signal: input.signal,
    });
  } catch {
    indexed = [];
  }
  const coverage = providerCoverage(input.query, indexed);
  const indexedPacket = indexedRetrieval(indexed, input.now ?? new Date(), coverage);
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
    const ingestionEnv = await liveFallbackIngestionEnv(
      input.env,
      federatedShards,
      federationRequested,
    );
    if (ingestionEnv) await queueValidatedLiveSources(ingestionEnv, live, input.correlationId);
    return withLiveCoverage(live, input.query);
  }
  if (useIndexed) return indexedPacket;
  if (!liveEnabled) {
    return hasUsableIndexedCoverage
      ? indexedPacket
      : indexedRetrieval([], input.now ?? new Date(), "no_coverage");
  }
  const live = await liveSearch(liveInput);
  const ingestionEnv = await liveFallbackIngestionEnv(
    input.env,
    federatedShards,
    federationRequested,
  );
  if (ingestionEnv) await queueValidatedLiveSources(ingestionEnv, live, input.correlationId);
  return withLiveCoverage(live, input.query);
}
