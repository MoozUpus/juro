export type CustomIndexEnvironment = "staging" | "production";
export type CustomIndexLane = "sparse" | "dense";

export type CustomIndexBuildMessage = {
  schemaVersion: 1;
  environment: CustomIndexEnvironment;
  releaseId: string;
  lane: CustomIndexLane;
  batchId: string;
  ordinal: number;
  inputLocator: string;
  inputSha256: string;
};

export type CustomIndexCheckpoint = {
  batchId: string;
  lane: CustomIndexLane;
  inputSha256: string;
  outputLocator: string;
  outputSha256: string;
  vectorizeMutationId: string | null;
  providerInputTokens: number;
};

export class CustomIndexPipelineError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CustomIndexPipelineError";
  }
}

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const SAFE_RELEASE_ID = /^[a-z0-9][a-z0-9._:-]{0,299}$/u;
const R2_LOCATOR = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,1023}$/u;

export function assertContentAddressedArtifact(input: {
  expectedSha256: string;
  actualSha256: string;
  metadataSha256: string | null | undefined;
}): void {
  if (!SHA256.test(input.expectedSha256)
    || input.actualSha256 !== input.expectedSha256
    || input.metadataSha256 !== input.expectedSha256) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_R2_INPUT_CORRUPT");
  }
}

export function assertPlanNotExpired(expiresAtEpochMs: number, nowEpochMs: number): void {
  if (!Number.isSafeInteger(expiresAtEpochMs) || !Number.isSafeInteger(nowEpochMs)
    || nowEpochMs >= expiresAtEpochMs) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_PLAN_EXPIRED");
  }
}

export function authorizeProviderRateWindow(input: {
  priorRequestEpochMs: readonly number[];
  nowEpochMs: number;
  maximumRequestsPerMinute: number;
}): number[] {
  if (!Number.isSafeInteger(input.nowEpochMs)
    || !Number.isSafeInteger(input.maximumRequestsPerMinute)
    || input.maximumRequestsPerMinute <= 0
    || input.priorRequestEpochMs.some((value) => !Number.isSafeInteger(value) || value > input.nowEpochMs)) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_RATE_STATE_INVALID");
  }
  const cutoff = input.nowEpochMs - 60_000;
  const active = input.priorRequestEpochMs.filter((value) => value > cutoff);
  if (active.length >= input.maximumRequestsPerMinute) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_RATE_LIMIT");
  }
  return [...active, input.nowEpochMs];
}

function isEnvironment(value: unknown): value is CustomIndexEnvironment {
  return value === "staging" || value === "production";
}

function isLane(value: unknown): value is CustomIndexLane {
  return value === "sparse" || value === "dense";
}

export function buildQueueMessage(
  input: Omit<CustomIndexBuildMessage, "schemaVersion">,
): CustomIndexBuildMessage {
  return parseBuildMessage({ schemaVersion: 1, ...input }, input.environment);
}

export function parseBuildMessage(
  value: unknown,
  expectedEnvironment: CustomIndexEnvironment,
): CustomIndexBuildMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_MESSAGE_INVALID");
  }
  const candidate = value as Partial<CustomIndexBuildMessage>;
  if (!isEnvironment(candidate.environment) || candidate.environment !== expectedEnvironment) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_CROSS_ENVIRONMENT");
  }
  if (candidate.schemaVersion !== 1
    || !SAFE_RELEASE_ID.test(candidate.releaseId ?? "")
    || !isLane(candidate.lane)
    || !SAFE_ID.test(candidate.batchId ?? "")
    || !Number.isSafeInteger(candidate.ordinal)
    || Number(candidate.ordinal) < 0
    || !R2_LOCATOR.test(candidate.inputLocator ?? "")
    || !SHA256.test(candidate.inputSha256 ?? "")) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_MESSAGE_INVALID");
  }
  return candidate as CustomIndexBuildMessage;
}

function assertCheckpoint(checkpoint: CustomIndexCheckpoint): void {
  if (!SAFE_ID.test(checkpoint.batchId)
    || !isLane(checkpoint.lane)
    || !SHA256.test(checkpoint.inputSha256)
    || !R2_LOCATOR.test(checkpoint.outputLocator)
    || !SHA256.test(checkpoint.outputSha256)
    || (checkpoint.lane === "dense") !== Boolean(checkpoint.vectorizeMutationId)
    || !Number.isSafeInteger(checkpoint.providerInputTokens)
    || checkpoint.providerInputTokens < 0) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINT_INVALID");
  }
}

function stableCheckpoint(checkpoint: CustomIndexCheckpoint): string {
  return JSON.stringify({
    batchId: checkpoint.batchId,
    lane: checkpoint.lane,
    inputSha256: checkpoint.inputSha256,
    outputLocator: checkpoint.outputLocator,
    outputSha256: checkpoint.outputSha256,
    vectorizeMutationId: checkpoint.vectorizeMutationId,
    providerInputTokens: checkpoint.providerInputTokens,
  });
}

export class ReleaseCheckpointLedger {
  readonly #environment: CustomIndexEnvironment;
  readonly #releaseId: string;
  readonly #expected: readonly string[];
  readonly #checkpoints = new Map<string, CustomIndexCheckpoint>();

  constructor(input: {
    environment: CustomIndexEnvironment;
    releaseId: string;
    expected: readonly string[];
  }) {
    if (!isEnvironment(input.environment) || !SAFE_RELEASE_ID.test(input.releaseId)
      || input.expected.length === 0 || new Set(input.expected).size !== input.expected.length
      || input.expected.some((id) => !SAFE_ID.test(id))) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_LEDGER_INVALID");
    }
    this.#environment = input.environment;
    this.#releaseId = input.releaseId;
    this.#expected = [...input.expected];
  }

  complete(checkpoint: CustomIndexCheckpoint): {
    checkpoint: CustomIndexCheckpoint;
    duplicate: boolean;
    outOfOrder: boolean;
  } {
    assertCheckpoint(checkpoint);
    const position = this.#expected.indexOf(checkpoint.batchId);
    if (position < 0) throw new CustomIndexPipelineError("CUSTOM_INDEX_UNKNOWN_BATCH");
    const prior = this.#checkpoints.get(checkpoint.batchId);
    if (prior) {
      if (stableCheckpoint(prior) !== stableCheckpoint(checkpoint)) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINT_CONFLICT");
      }
      return { checkpoint: prior, duplicate: true, outOfOrder: false };
    }
    const outOfOrder = this.#expected.slice(0, position)
      .some((batchId) => !this.#checkpoints.has(batchId));
    const stored = { ...checkpoint };
    this.#checkpoints.set(checkpoint.batchId, stored);
    return { checkpoint: stored, duplicate: false, outOfOrder };
  }

  snapshot(): {
    environment: CustomIndexEnvironment;
    releaseId: string;
    expectedCount: number;
    completedCount: number;
    boundedReferences: Array<{ batchId: string; outputLocator: string; outputSha256: string }>;
  } {
    return {
      environment: this.#environment,
      releaseId: this.#releaseId,
      expectedCount: this.#expected.length,
      completedCount: this.#checkpoints.size,
      boundedReferences: [...this.#checkpoints.values()]
        .sort((a, b) => a.batchId.localeCompare(b.batchId))
        .map(({ batchId, outputLocator, outputSha256 }) => ({ batchId, outputLocator, outputSha256 })),
    };
  }
}

type EmbeddingBudgetOptions = {
  maximumInputsPerRequest?: number;
  maximumTokensPerInput?: number;
  maximumAggregateTokensPerRequest?: number;
  maximumRequestsPerMinute?: number;
  authorizedTokens: number;
};

export class EmbeddingBudget {
  readonly #limits: Required<EmbeddingBudgetOptions>;
  #usedTokens = 0;
  readonly #requestTimes: number[] = [];

  constructor(options: EmbeddingBudgetOptions) {
    this.#limits = {
      maximumInputsPerRequest: options.maximumInputsPerRequest ?? 64,
      maximumTokensPerInput: options.maximumTokensPerInput ?? 8192,
      maximumAggregateTokensPerRequest: options.maximumAggregateTokensPerRequest ?? 100_000,
      maximumRequestsPerMinute: options.maximumRequestsPerMinute ?? 60,
      authorizedTokens: options.authorizedTokens,
    };
    if (Object.values(this.#limits).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_BUDGET_INVALID");
    }
  }

  authorize(input: { inputTokenCounts: readonly number[]; nowMs: number }): {
    requestTokens: number;
    usedTokens: number;
    remainingTokens: number;
  } {
    const counts = input.inputTokenCounts;
    if (counts.length === 0 || counts.length > this.#limits.maximumInputsPerRequest
      || counts.some((count) => !Number.isSafeInteger(count) || count <= 0)) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_INPUT_COUNT_LIMIT");
    }
    if (counts.some((count) => count > this.#limits.maximumTokensPerInput)) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_INPUT_TOKEN_LIMIT");
    }
    const requestTokens = counts.reduce((sum, count) => sum + count, 0);
    if (requestTokens > this.#limits.maximumAggregateTokensPerRequest) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_AGGREGATE_TOKEN_LIMIT");
    }
    if (this.#usedTokens + requestTokens > this.#limits.authorizedTokens) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_COST_STOP");
    }
    const cutoff = input.nowMs - 60_000;
    while ((this.#requestTimes[0] ?? Number.POSITIVE_INFINITY) <= cutoff) this.#requestTimes.shift();
    if (this.#requestTimes.length >= this.#limits.maximumRequestsPerMinute) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_RATE_LIMIT");
    }
    this.#requestTimes.push(input.nowMs);
    this.#usedTokens += requestTokens;
    return {
      requestTokens,
      usedTokens: this.#usedTokens,
      remainingTokens: this.#limits.authorizedTokens - this.#usedTokens,
    };
  }
}

export function assertReleaseSealable(input: {
  expectedBatchIds: readonly string[];
  checkpoints: ReadonlyArray<Pick<CustomIndexCheckpoint, "batchId" | "lane" | "vectorizeMutationId">>;
  mutationStatuses: ReadonlyMap<string, string>;
  expectedVectorIds: readonly string[];
  listedVectors: ReadonlyArray<{ id: string; metadataSha256: string }>;
  expectedVectorMetadata: ReadonlyMap<string, string>;
}): void {
  const expectedBatches = [...input.expectedBatchIds].sort();
  const actualBatches = input.checkpoints.map(({ batchId }) => batchId).sort();
  if (new Set(actualBatches).size !== actualBatches.length
    || JSON.stringify(expectedBatches) !== JSON.stringify(actualBatches)
    || !input.checkpoints.some(({ lane }) => lane === "sparse")
    || !input.checkpoints.some(({ lane }) => lane === "dense")) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINTS_INCOMPLETE");
  }
  for (const checkpoint of input.checkpoints) {
    if (checkpoint.lane === "dense"
      && (!checkpoint.vectorizeMutationId
        || input.mutationStatuses.get(checkpoint.vectorizeMutationId) !== "processed")) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_VECTORIZE_NOT_TERMINAL");
    }
  }
  const expectedIds = [...input.expectedVectorIds].sort();
  const listedIds = input.listedVectors.map(({ id }) => id).sort();
  if (new Set(listedIds).size !== listedIds.length
    || JSON.stringify(expectedIds) !== JSON.stringify(listedIds)
    || input.listedVectors.some(({ id, metadataSha256 }) => input.expectedVectorMetadata.get(id) !== metadataSha256)) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_VECTOR_INVENTORY_MISMATCH");
  }
}

export function providerHttpFailureCode(status: number): string {
  return Number.isSafeInteger(status) && status >= 100 && status <= 599
    ? `CUSTOM_INDEX_PROVIDER_HTTP_${status}`
    : "CUSTOM_INDEX_PROVIDER_HTTP_INVALID";
}

export function providerRateLimitTelemetry(headers: Pick<Headers, "get">): {
  providerRetryAfterSeconds: number | null;
  providerRateLimitRequests: number | null;
  providerRateRemainingRequests: number | null;
  providerRateLimitTokens: number | null;
  providerRateRemainingTokens: number | null;
} {
  const integerHeader = (name: string): number | null => {
    const value = headers.get(name);
    if (!value || !/^\d+$/u.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  return {
    providerRetryAfterSeconds: integerHeader("retry-after"),
    providerRateLimitRequests: integerHeader("x-ratelimit-limit-requests"),
    providerRateRemainingRequests: integerHeader("x-ratelimit-remaining-requests"),
    providerRateLimitTokens: integerHeader("x-ratelimit-limit-tokens"),
    providerRateRemainingTokens: integerHeader("x-ratelimit-remaining-tokens"),
  };
}

export async function providerErrorClassification(response: Pick<Response, "clone">): Promise<{
  providerErrorType: string | null;
  providerErrorCode: string | null;
}> {
  const safeToken = (value: unknown): string | null => (
    typeof value === "string" && /^[a-z][a-z0-9_.-]{0,63}$/u.test(value) ? value : null
  );
  try {
    const payload = await response.clone().json() as { error?: { type?: unknown; code?: unknown } };
    return {
      providerErrorType: safeToken(payload.error?.type),
      providerErrorCode: safeToken(payload.error?.code),
    };
  } catch {
    return { providerErrorType: null, providerErrorCode: null };
  }
}

const TELEMETRY_FIELDS = new Set([
  "environment", "releaseId", "component", "status", "r2Reads", "r2Bytes",
  "bm25Traversal", "providerTokens", "providerLatencyMs", "vectorizeMutations",
  "vectorizeLatencyMs", "failureCode",
  "providerRetryAfterSeconds", "providerRateLimitRequests", "providerRateRemainingRequests",
  "providerRateLimitTokens", "providerRateRemainingTokens",
  "providerErrorType", "providerErrorCode",
]);

export function contentFreePipelineTelemetry(input: {
  environment: CustomIndexEnvironment;
  releaseId: string;
  component?: string;
  status?: string;
  r2Reads?: number;
  r2Bytes?: number;
  bm25Traversal?: number;
  providerTokens?: number;
  providerLatencyMs?: number;
  vectorizeMutations?: number;
  vectorizeLatencyMs?: number;
  failureCode?: string | null;
  providerRetryAfterSeconds?: number | null;
  providerRateLimitRequests?: number | null;
  providerRateRemainingRequests?: number | null;
  providerRateLimitTokens?: number | null;
  providerRateRemainingTokens?: number | null;
  providerErrorType?: string | null;
  providerErrorCode?: string | null;
}): Record<string, string | number | null> {
  if (Object.keys(input).some((key) => !TELEMETRY_FIELDS.has(key))) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_TELEMETRY_FIELD_REJECTED");
  }
  if (!isEnvironment(input.environment) || !SAFE_RELEASE_ID.test(input.releaseId)) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_TELEMETRY_INVALID");
  }
  return { service: "legal-custom-index", ...input };
}
