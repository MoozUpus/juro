import type { LegalSourceContext } from "../ai/provider";
import {
  retrieveLiveLexSources,
  type LiveLexRetrievalResult,
} from "../legal/live-lex-retrieval";
import { detectArticleNumbers } from "../legal/legal-language";
import {
  legalDatabaseFreshnessFromAsOf,
  type LegalDatabaseFreshness,
} from "../legal/verified-retrieval";
import {
  createTargetLegalAnswerClient,
  type TargetLegalAnswerResult,
} from "./target-retrieval";

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
    rerankingOutcome: "not_configured" | "not_needed" | "selected" | "rejected" | "deterministic_fallback" | "failed_closed";
    rerankingFailureCode: string | null;
    exactWindowSuccesses: number;
    denseUnavailable: boolean;
    repairQueriesRun?: number;
    indexedAvailability?: "available" | "degraded" | "unavailable";
    coverageRequirements?: Array<{
      requirementId: string;
      statement: string;
      status: "covered" | "uncovered";
      provisionIds: string[];
    }>;
    selectedProvisions?: Array<{
      provisionId: string;
      chunkId: string;
      sparseRank: number | null;
      denseRank: number | null;
      semanticScore: number | null;
      fusionScore: number | null;
      selectionMethod: "semantic_reranker" | "deterministic_fallback";
      matchedQueryCount: number;
      requirementIds: string[];
    }>;
    indexVersion?: string | null;
    rerankerVersion?: string | null;
    fusionOutcome: "indexed" | "live" | "mixed" | "none";
  };
};

export function shouldRetrieveSecondaryInternet(
  retrieval: Pick<LegalChatSourceRetrieval, "coverageStatus">,
): boolean {
  return retrieval.coverageStatus === "weak_coverage"
    || retrieval.coverageStatus === "no_coverage";
}

type LiveSearchInput = Parameters<typeof retrieveLiveLexSources>[0];

function liveCoverage(
  query: string,
  sources: readonly LegalSourceContext[],
): LegalChatSourceRetrieval["coverageStatus"] {
  if (sources.length === 0) return "no_coverage";
  const requestedArticles = detectArticleNumbers(query);
  const foundArticles = new Set(sources.map((source) => source.article).filter(Boolean));
  if (requestedArticles.some((article) => !foundArticles.has(article))) {
    return foundArticles.size > 0 ? "partial_coverage" : "weak_coverage";
  }
  return sources.some((source) =>
    source.verificationState === "direct_validated"
    && source.sourceQuality?.passed
    && Boolean(source.spans?.[0]?.text.trim() || source.excerpt?.trim())
  ) ? "good_coverage" : "partial_coverage";
}

function withLiveCoverage(
  result: LiveLexRetrievalResult,
  query: string,
): LegalChatSourceRetrieval {
  return {
    ...result,
    coverageStatus: liveCoverage(query, result.sources),
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

function unavailableHistoricalCoverage(
  applicableAt: string,
  now: Date,
): LegalChatSourceRetrieval {
  const checkedAt = now.toISOString();
  return {
    sources: [],
    freshness: legalDatabaseFreshnessFromAsOf(checkedAt, now),
    legalDatabaseAsOf: applicableAt,
    sourceAccessMode: "approved_package",
    sourcesRetrievedAt: null,
    sourceValidationStatus: "unavailable",
    errors: [{ code: "HISTORICAL_INDEXED_COVERAGE_UNAVAILABLE" }],
    evidence: [],
    coverageStatus: "no_coverage",
    retrievalTelemetry: {
      indexedHitCount: 0,
      liveHitCount: 0,
      queriesRun: 0,
      retrievedCandidateCount: 0,
      rerankCandidateCount: 0,
      rerankedCandidateCount: 0,
      rerankingOutcome: "failed_closed",
      rerankingFailureCode: "HISTORICAL_INDEXED_COVERAGE_UNAVAILABLE",
      exactWindowSuccesses: 0,
      denseUnavailable: false,
      indexedAvailability: "unavailable",
      fusionOutcome: "none",
    },
  };
}

function unavailableTargetCeilingCoverage(now: Date): LegalChatSourceRetrieval {
  const checkedAt = now.toISOString();
  return {
    sources: [],
    freshness: legalDatabaseFreshnessFromAsOf(checkedAt, now),
    legalDatabaseAsOf: checkedAt,
    sourceAccessMode: "approved_package",
    sourcesRetrievedAt: null,
    sourceValidationStatus: "unavailable",
    errors: [{ code: "TARGET_EVIDENCE_CEILING_EXCEEDED" }],
    evidence: [],
    coverageStatus: "no_coverage",
    retrievalTelemetry: {
      indexedHitCount: 0,
      liveHitCount: 0,
      queriesRun: 0,
      retrievedCandidateCount: 0,
      rerankCandidateCount: 0,
      rerankedCandidateCount: 0,
      rerankingOutcome: "failed_closed",
      rerankingFailureCode: "TARGET_EVIDENCE_CEILING_EXCEEDED",
      exactWindowSuccesses: 0,
      denseUnavailable: false,
      indexedAvailability: "available",
      fusionOutcome: "none",
    },
  };
}

function citationArticle(label: string): string | null {
  return label.match(/(?:article|статья|ст\.?|modda|модда)\s*(\d+(?:[.-]\d+)?)/iu)?.[1] ?? null;
}

function targetAnswerDetails(result: TargetLegalAnswerResult) {
  if (result.kind === "legal_answer" || result.kind === "conditional_answer") {
    return {
      statements: result.whatTheLawSays.map((statement) => ({
        statement,
        temporalEndpoint: result.temporalEndpoint,
      })),
      formulationsUsed: result.formulationsUsed,
    };
  }
  if (result.kind === "comparison_answer") {
    return {
      statements: [
        ...result.left.whatTheLawSays.map((statement) => ({
          statement,
          temporalEndpoint: result.left.temporalEndpoint,
        })),
        ...result.right.whatTheLawSays.map((statement) => ({
          statement,
          temporalEndpoint: result.right.temporalEndpoint,
        })),
      ],
      formulationsUsed: result.endpointFormulationSearches,
    };
  }
  return null;
}

function uniqueTargetStatements(
  answer: NonNullable<ReturnType<typeof targetAnswerDetails>>,
) {
  const unique = new Map<string, (typeof answer.statements)[number]>();
  for (const entry of answer.statements) {
    const endpointKey = entry.temporalEndpoint.kind === "timestamp"
      ? entry.temporalEndpoint.instant
      : "current";
    const key = `${entry.statement.provisionRenditionId}:${endpointKey}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }
  return [...unique.values()];
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function withinSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener("abort", aborted);
      reject(signal.reason);
    };
    signal.addEventListener("abort", aborted, { once: true });
    promise.then((value) => {
      signal.removeEventListener("abort", aborted);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", aborted);
      reject(error);
    });
  });
}

async function withTargetCoverage(
  result: TargetLegalAnswerResult,
  locale: "ru" | "uz",
  now: Date,
): Promise<LegalChatSourceRetrieval | null> {
  const answer = targetAnswerDetails(result);
  if (!answer) return null;
  const checkedAt = now.toISOString();
  const statements = uniqueTargetStatements(answer);
  if (statements.length > 12) return unavailableTargetCeilingCoverage(now);
  const sources = await Promise.all(statements.map(async (
    { statement, temporalEndpoint },
  ): Promise<LegalSourceContext> => {
    const historicalInstant = temporalEndpoint.kind === "timestamp"
      ? temporalEndpoint.instant
      : null;
    const citation = statement.officialCitations[0]!;
    const endpointKey = historicalInstant ?? "current";
    const idHash = await sha256Text(`${statement.provisionRenditionId}:${endpointKey}`);
    const id = `target:${idHash.slice(0, 48)}`;
    const textSha256 = await sha256Text(statement.controllingQuotation);
    return {
        id,
        actTitle: citation.label.split(" — ")[0]?.trim() || citation.label,
        actIdentifier: statement.provisionConceptId,
        officialUrl: citation.url,
        revisionDate: historicalInstant,
        lastCheckedAt: checkedAt,
        locale,
        publishedAt: null,
        sourceType: "lex",
        status: "verified",
        verificationState: "verified",
        verifiedAt: checkedAt,
        contentSha256: statement.evidenceSha256,
        article: citationArticle(citation.label),
        excerpt: statement.controllingQuotation.slice(0, 1_200),
        effectiveDate: historicalInstant,
        applicabilityStatus: historicalInstant ? "historical" : "current",
        sourceClass: "OFFICIAL_LEGISLATION",
        spans: [{
          id,
          article: citationArticle(citation.label),
          paragraph: null,
          text: statement.controllingQuotation,
          textSha256,
          quality: "high",
        }],
        sourceQuality: {
          passed: true,
          title: true,
          sufficientText: true,
          clean: true,
          locale: true,
          canonicalUrl: true,
          structured: true,
        },
    };
  }));
  if (sources.length === 0) return null;
  const freshness = legalDatabaseFreshnessFromAsOf(checkedAt, now);
  return {
    sources,
    freshness,
    legalDatabaseAsOf: freshness.asOf,
    sourceAccessMode: "approved_package",
    sourcesRetrievedAt: checkedAt,
    sourceValidationStatus: "validated",
    errors: [],
    evidence: sources.map((source) => ({
      sourceId: source.id,
      sourceKind: "lex",
      canonicalUrl: source.officialUrl,
      contentSha256: source.contentSha256,
      retrievedAt: checkedAt,
      validatedAt: checkedAt,
      validationStatus: "validated",
    })),
    coverageStatus: "good_coverage",
    retrievalTelemetry: {
      indexedHitCount: sources.length,
      liveHitCount: 0,
      queriesRun: answer.formulationsUsed,
      retrievedCandidateCount: sources.length,
      rerankCandidateCount: 0,
      rerankedCandidateCount: 0,
      rerankingOutcome: "not_configured",
      rerankingFailureCode: null,
      exactWindowSuccesses: sources.length,
      denseUnavailable: false,
      indexedAvailability: "available",
      indexVersion: "r2-native-accepted",
      rerankerVersion: "target-provision-selector",
      fusionOutcome: "indexed",
    },
  };
}

/**
 * Retrieves hash-verified evidence through the R2-native sparse+dense target
 * service. Current requests continue to direct Lex when indexed evidence is
 * unavailable or insufficient; historical requests fail closed because live
 * retrieval is not applicability-aware. The retired D1/Qdrant protocol is absent.
 */
export async function retrieveCorpusAwareLegalSources(input: {
  query: string;
  locale: "ru" | "uz";
  targetService?: Fetcher;
  targetEnvironment?: "development" | "staging" | "production";
  targetQuestionId?: string;
  contextualQuestion?: string | Promise<string>;
  applicableAt?: string;
  lexSearchQueries?: readonly string[] | Promise<readonly string[]>;
  limit?: number;
  signal?: AbortSignal;
  budgetMs?: number;
  targetBudgetMs?: number;
  discoverOfficialUrls?: LiveSearchInput["discoverOfficialUrls"];
  liveSearch?: typeof retrieveLiveLexSources;
  onLiveSearchStarted?: () => void | Promise<void>;
  now?: Date;
}): Promise<LegalChatSourceRetrieval> {
  input.signal?.throwIfAborted();
  if (input.targetService && input.targetEnvironment && input.targetQuestionId) {
    const targetTimeoutMs = Math.min(4_000, Math.max(1, input.targetBudgetMs
      ?? Math.max(500, Math.floor((input.budgetMs ?? 12_000) / 3))));
    const targetController = new AbortController();
    const abortFromCaller = () => targetController.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const targetTimer = setTimeout(() => targetController.abort(
      new DOMException("Target retrieval deadline exceeded", "TimeoutError"),
    ), targetTimeoutMs);
    try {
      const contextualQuestion = await withinSignal(
        Promise.resolve(input.contextualQuestion).catch(() => undefined),
        targetController.signal,
      );
      const target = await withinSignal(createTargetLegalAnswerClient({
          service: input.targetService,
          environment: input.targetEnvironment,
          signal: targetController.signal,
        }).answer({
          id: input.targetQuestionId,
          question: input.query,
          contextualQuestion,
          applicableAt: input.applicableAt,
        }), targetController.signal);
      const indexed = await withTargetCoverage(target, input.locale, input.now ?? new Date());
      if (indexed) return indexed;
    } catch (error) {
      if (input.signal?.aborted) throw error;
    } finally {
      clearTimeout(targetTimer);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
  if (input.applicableAt) {
    return unavailableHistoricalCoverage(input.applicableAt, input.now ?? new Date());
  }
  await input.onLiveSearchStarted?.();
  const liveSearch = input.liveSearch ?? retrieveLiveLexSources;
  const result = await liveSearch({
    query: input.query,
    locale: input.locale,
    limit: input.limit,
    signal: input.signal,
    budgetMs: input.budgetMs,
    searchQueries: Promise.resolve(input.lexSearchQueries ?? []).catch(() => []),
    discoverOfficialUrls: input.discoverOfficialUrls,
  });
  return withLiveCoverage(result, input.query);
}
