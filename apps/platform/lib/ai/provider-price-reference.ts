export type AiVerifiedPriceReference = {
  provider: "openai";
  model: "gpt-5.6-sol" | "gpt-5.6-terra";
  operation: "responses";
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
  cachedInputMicrousdPerMillionTokens: number;
  effectiveFrom: string;
  sourceUrl: string;
  reviewAfter: string | null;
};

export type AiPriceCandidate = {
  id: string;
  provider: string;
  model: string;
  operation: string;
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
  cachedInputMicrousdPerMillionTokens: number;
  effectiveFrom: string;
  sourceUrl: string | null;
  createdAt: string;
};

export type AiUsedPriceVersion = {
  priceVersionId: string;
  provider: string;
  model: string;
  operation: string;
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
  cachedInputMicrousdPerMillionTokens: number;
  usageDay: string;
  requestCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
};

export type AiPriceReferenceCheck = {
  provider: AiVerifiedPriceReference["provider"];
  model: AiVerifiedPriceReference["model"];
  operation: AiVerifiedPriceReference["operation"];
  status: "verified" | "missing" | "source_missing" | "rate_mismatch" | "review_due";
  expectedInputMicrousdPerMillionTokens: number;
  expectedOutputMicrousdPerMillionTokens: number;
  expectedCachedInputMicrousdPerMillionTokens: number;
  referenceEffectiveFrom: string;
  referenceSourceUrl: string;
  reviewAfter: string | null;
  activePriceVersionId: string | null;
  activeEffectiveFrom: string | null;
  activeSourceUrl: string | null;
  activeInputMicrousdPerMillionTokens: number | null;
  activeOutputMicrousdPerMillionTokens: number | null;
  activeCachedInputMicrousdPerMillionTokens: number | null;
};

export type AiHistoricalPriceMismatch = {
  priceVersionId: string;
  provider: AiVerifiedPriceReference["provider"];
  model: AiVerifiedPriceReference["model"];
  operation: AiVerifiedPriceReference["operation"];
  requestCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
};

export type AiPriceVerificationView = {
  status: "verified" | "needs_review";
  checkedAt: string;
  checks: AiPriceReferenceCheck[];
  historicalMispricedRequestCount: number;
  historicalMismatches: AiHistoricalPriceMismatch[];
};

/**
 * Current standard-processing prices verified against model-specific official
 * OpenAI pages. These are an operator verification reference, not the billing
 * source of truth: usage remains pinned to append-only D1 price versions.
 */
export const AI_VERIFIED_PRICE_REFERENCES = [
  {
    provider: "openai",
    model: "gpt-5.6-terra",
    operation: "responses",
    inputMicrousdPerMillionTokens: 2_000_000,
    outputMicrousdPerMillionTokens: 12_000_000,
    cachedInputMicrousdPerMillionTokens: 200_000,
    effectiveFrom: "2026-07-30T00:00:00.000Z",
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra",
    reviewAfter: null,
  },
  {
    provider: "openai",
    model: "gpt-5.6-sol",
    operation: "responses",
    inputMicrousdPerMillionTokens: 4_000_000,
    outputMicrousdPerMillionTokens: 20_000_000,
    cachedInputMicrousdPerMillionTokens: 400_000,
    effectiveFrom: "2026-08-21T00:00:00.000Z",
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol",
    // OpenAI guarantees this promotional price at least through November 21.
    // After that date the reference must be reverified before it can be green.
    reviewAfter: "2026-11-22T00:00:00.000Z",
  },
] as const satisfies readonly AiVerifiedPriceReference[];

function sameRoute(
  row: Pick<AiPriceCandidate, "provider" | "model" | "operation">,
  reference: AiVerifiedPriceReference,
): boolean {
  return row.provider === reference.provider
    && row.model === reference.model
    && row.operation === reference.operation;
}

function ratesMatch(
  row: Pick<AiPriceCandidate, "inputMicrousdPerMillionTokens" | "outputMicrousdPerMillionTokens" | "cachedInputMicrousdPerMillionTokens">,
  reference: AiVerifiedPriceReference,
): boolean {
  return row.inputMicrousdPerMillionTokens === reference.inputMicrousdPerMillionTokens
    && row.outputMicrousdPerMillionTokens === reference.outputMicrousdPerMillionTokens
    && row.cachedInputMicrousdPerMillionTokens === reference.cachedInputMicrousdPerMillionTokens;
}

function activePrice(
  prices: readonly AiPriceCandidate[],
  reference: AiVerifiedPriceReference,
  nowIso: string,
): AiPriceCandidate | null {
  return prices
    .filter((price) => sameRoute(price, reference) && price.effectiveFrom <= nowIso)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom)
      || right.createdAt.localeCompare(left.createdAt)
      || right.id.localeCompare(left.id))[0] ?? null;
}

export function verifyAiPriceReferences(input: {
  prices: readonly AiPriceCandidate[];
  usedPriceVersions: readonly AiUsedPriceVersion[];
  now: Date;
}): AiPriceVerificationView {
  const checkedAt = input.now.toISOString();
  const checks = AI_VERIFIED_PRICE_REFERENCES.map((reference): AiPriceReferenceCheck => {
    const active = activePrice(input.prices, reference, checkedAt);
    const status = !active
      ? "missing"
      : !active.sourceUrl
        ? "source_missing"
        : reference.reviewAfter && checkedAt >= reference.reviewAfter
          ? "review_due"
          : ratesMatch(active, reference)
            ? "verified"
            : "rate_mismatch";
    return {
      provider: reference.provider,
      model: reference.model,
      operation: reference.operation,
      status,
      expectedInputMicrousdPerMillionTokens: reference.inputMicrousdPerMillionTokens,
      expectedOutputMicrousdPerMillionTokens: reference.outputMicrousdPerMillionTokens,
      expectedCachedInputMicrousdPerMillionTokens: reference.cachedInputMicrousdPerMillionTokens,
      referenceEffectiveFrom: reference.effectiveFrom,
      referenceSourceUrl: reference.sourceUrl,
      reviewAfter: reference.reviewAfter,
      activePriceVersionId: active?.id ?? null,
      activeEffectiveFrom: active?.effectiveFrom ?? null,
      activeSourceUrl: active?.sourceUrl ?? null,
      activeInputMicrousdPerMillionTokens: active?.inputMicrousdPerMillionTokens ?? null,
      activeOutputMicrousdPerMillionTokens: active?.outputMicrousdPerMillionTokens ?? null,
      activeCachedInputMicrousdPerMillionTokens: active?.cachedInputMicrousdPerMillionTokens ?? null,
    };
  });
  const historicalMismatchMap = new Map<string, AiHistoricalPriceMismatch>();
  for (const row of input.usedPriceVersions) {
    const reference = AI_VERIFIED_PRICE_REFERENCES.find((candidate) => sameRoute(row, candidate));
    if (!reference || row.usageDay < reference.effectiveFrom.slice(0, 10) || ratesMatch(row, reference)) continue;
    const existing = historicalMismatchMap.get(row.priceVersionId);
    historicalMismatchMap.set(row.priceVersionId, existing ? {
      ...existing,
      requestCount: existing.requestCount + row.requestCount,
      firstUsedAt: existing.firstUsedAt < row.firstUsedAt ? existing.firstUsedAt : row.firstUsedAt,
      lastUsedAt: existing.lastUsedAt > row.lastUsedAt ? existing.lastUsedAt : row.lastUsedAt,
    } : {
      priceVersionId: row.priceVersionId,
      provider: reference.provider,
      model: reference.model,
      operation: reference.operation,
      requestCount: row.requestCount,
      firstUsedAt: row.firstUsedAt,
      lastUsedAt: row.lastUsedAt,
    });
  }
  const historicalMismatches = [...historicalMismatchMap.values()];
  return {
    status: checks.every((check) => check.status === "verified") && historicalMismatches.length === 0
      ? "verified"
      : "needs_review",
    checkedAt,
    checks,
    historicalMispricedRequestCount: historicalMismatches.reduce(
      (total, mismatch) => total + mismatch.requestCount,
      0,
    ),
    historicalMismatches,
  };
}
