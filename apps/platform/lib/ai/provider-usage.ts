import { z } from "zod";
import {
  evaluateProviderCostControl,
  ProviderCostControlError,
  readProviderCostControlDashboard,
  type ProviderCostControlDashboard,
} from "./provider-cost-control";
import {
  AI_COST_FEATURES,
  evaluateScopedCostBudgets,
  readScopedCostBudgetDashboard,
  ScopedCostBudgetError,
  type ScopedCostBudgetDashboard,
} from "./scoped-cost-budget";

const PROVIDERS = ["openai", "anthropic"] as const;
const MAX_RATE_MICROUSD = 1_000_000_000_000;

export type ProviderName = (typeof PROVIDERS)[number];

type PriceRow = {
  id: string;
  inputRate: number;
  outputRate: number;
  cachedInputRate: number;
};

export type ProviderUsageInput = {
  db: D1Database;
  environment: "development" | "staging" | "production";
  workspaceId: string | null;
  userId: string | null;
  feature: string;
  operation: string;
  provider: ProviderName;
  model: string;
  providerRequestId?: string | null;
  inputTokens: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  itemCount?: number;
  dimensions?: number | null;
  status: "succeeded" | "failed";
  errorCode?: string | null;
  startedAt: string;
  completedAt: string;
  eventId?: string;
};

export type ProviderUsageRecord = {
  id: string;
  priceVersionId: string | null;
  estimatedCostMicrousd: number | null;
};

export type AiModelPriceView = {
  id: string;
  provider: ProviderName;
  model: string;
  operation: string;
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
  cachedInputMicrousdPerMillionTokens: number;
  currency: "USD";
  effectiveFrom: string;
  sourceUrl: string | null;
  createdAt: string;
};

export type AiCostDailyView = {
  usageDay: string;
  feature: string;
  operation: string;
  provider: ProviderName;
  model: string;
  requestCount: number;
  failedRequestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostMicrousd: number;
  unpricedRequestCount: number;
};

export type AiCostUserView = {
  workspaceId: string;
  userId: string;
  currentPlanCode: string | null;
  requestCount: number;
  failedRequestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostMicrousd: number;
  unpricedRequestCount: number;
};

export type AiCostPlanView = {
  attribution: "subscription" | "unassigned" | "guest_or_system";
  planCode: string | null;
  userCount: number;
  requestCount: number;
  failedRequestCount: number;
  estimatedCostMicrousd: number;
  unpricedRequestCount: number;
};

export type AiCostOperationalView = {
  providerRequests: number;
  providerFailures: number;
  providerFailureRateBps: number | null;
  averageProviderLatencyMs: number | null;
  cacheEligibleRequests: number;
  cacheHitRequests: number;
  cacheHitRateBps: number | null;
  inputTokens: number;
  cachedInputTokens: number;
  cachedInputTokenShareBps: number | null;
  completedLegalChatRuns: number;
  deepEscalationCount: number;
  deepEscalationRateBps: number | null;
  providerFallbackCount: number;
  providerFallbackRateBps: number | null;
};

export const AI_COST_MINIMUM_PRICED_SUCCESS_SAMPLE = 30;

export type AiCostMeasurementStatus =
  | "no_data"
  | "incomplete_pricing"
  | "insufficient_sample"
  | "ready";

export type AiCostMeasurementView = {
  windowStart: string;
  windowEnd: string;
  firstEventAt: string | null;
  lastEventAt: string | null;
  successfulRequests: number;
  failedRequests: number;
  pricedSuccessfulRequests: number;
  unpricedSuccessfulRequests: number;
  pricingCoverageBps: number;
  estimatedCostMicrousd: number;
  costPerPricedSuccessMicrousd: number | null;
  minimumPricedSuccessfulRequests: number;
  status: AiCostMeasurementStatus;
};

export type AiCostDashboard = {
  prices: AiModelPriceView[];
  daily: AiCostDailyView[];
  byUser: AiCostUserView[];
  byPlan: AiCostPlanView[];
  planSnapshotAt: string;
  operational: AiCostOperationalView;
  unpricedEvents: number;
  measurement: AiCostMeasurementView;
} & ProviderCostControlDashboard & ScopedCostBudgetDashboard;

export class ProviderUsageError extends Error {
  constructor(readonly code: "PROVIDER_USAGE_INVALID" | "PROVIDER_USAGE_PERSISTENCE_FAILED") {
    super(code);
    this.name = "ProviderUsageError";
  }
}

const priceMutationSchema = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/),
  operation: z.string().trim().min(1).max(64).regex(/^[a-z0-9._-]+$/),
  inputMicrousdPerMillionTokens: z.number().int().min(0).max(MAX_RATE_MICROUSD),
  outputMicrousdPerMillionTokens: z.number().int().min(0).max(MAX_RATE_MICROUSD).default(0),
  cachedInputMicrousdPerMillionTokens: z.number().int().min(0).max(MAX_RATE_MICROUSD).default(0),
  effectiveFrom: z.string().datetime({ offset: true }),
  sourceUrl: z.string().url().max(500).nullable().optional(),
}).strict();

export const aiModelPriceMutationSchema = priceMutationSchema;

function cleanIdentifier(value: string, max: number, pattern: RegExp): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || !pattern.test(normalized)) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  return normalized;
}

function safeInteger(value: number | undefined, fallback = 0): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  return candidate;
}

function canonicalTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  return new Date(timestamp).toISOString();
}

function safeProviderRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 255 && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : null;
}

async function activePrice(
  db: D1Database,
  provider: ProviderName,
  model: string,
  operation: string,
  completedAt: string,
): Promise<PriceRow | null> {
  return db.prepare(
    `SELECT id,input_microusd_per_million_tokens AS inputRate,
      output_microusd_per_million_tokens AS outputRate,
      cached_input_microusd_per_million_tokens AS cachedInputRate
     FROM ai_model_price_versions
     WHERE provider=? AND model=? AND operation=? AND effective_from<=?
     ORDER BY effective_from DESC,id DESC LIMIT 1`,
  ).bind(provider, model, operation, completedAt).first<PriceRow>();
}

function estimatedCost(input: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  price: PriceRow;
}): number {
  const uncached = Math.max(0, input.inputTokens - input.cachedInputTokens);
  const numerator = BigInt(uncached) * BigInt(input.price.inputRate)
    + BigInt(input.cachedInputTokens) * BigInt(input.price.cachedInputRate)
    + BigInt(input.outputTokens) * BigInt(input.price.outputRate);
  const cost = (numerator + 999_999n) / 1_000_000n;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  return Number(cost);
}

async function aggregateId(parts: readonly string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `cost_${hex.slice(0, 59)}`;
}

export async function recordProviderUsage(input: ProviderUsageInput): Promise<ProviderUsageRecord> {
  const feature = cleanIdentifier(input.feature, 64, /^[a-z0-9._-]+$/);
  const operation = cleanIdentifier(input.operation, 64, /^[a-z0-9._-]+$/);
  const model = cleanIdentifier(input.model, 120, /^[A-Za-z0-9._:-]+$/);
  const startedAt = canonicalTimestamp(input.startedAt);
  const completedAt = canonicalTimestamp(input.completedAt);
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  if ((input.workspaceId === null) !== (input.userId === null)) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  const inputTokens = safeInteger(input.inputTokens);
  const outputTokens = safeInteger(input.outputTokens);
  const cachedInputTokens = safeInteger(input.cachedInputTokens);
  if (cachedInputTokens > inputTokens) throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  const itemCount = safeInteger(input.itemCount);
  const dimensions = input.dimensions === null || input.dimensions === undefined
    ? null
    : safeInteger(input.dimensions);
  if (dimensions !== null && dimensions === 0) throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  const errorCode = input.status === "failed"
    ? cleanIdentifier(input.errorCode || "PROVIDER_REQUEST_FAILED", 100, /^[A-Z0-9._-]+$/)
    : null;
  if (input.status === "failed" && (inputTokens || outputTokens || cachedInputTokens)) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }

  const price = input.status === "succeeded"
    ? await activePrice(input.db, input.provider, model, operation, completedAt)
    : null;
  const cost = price
    ? estimatedCost({ inputTokens, outputTokens, cachedInputTokens, price })
    : null;
  const eventId = input.eventId || crypto.randomUUID();
  if (!/^[A-Za-z0-9._:-]{1,180}$/.test(eventId)) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  const usageDay = completedAt.slice(0, 10);
  const scopeKey = input.workspaceId && input.userId
    ? `${input.workspaceId}:${input.userId}`
    : "system";
  const dailyId = await aggregateId([
    input.environment,
    usageDay,
    scopeKey,
    feature,
    operation,
    input.provider,
    model,
  ]);
  const now = completedAt;
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO ai_provider_usage_events
         (id,environment,usage_day,workspace_id,user_id,feature,operation,provider,model,
          provider_request_id,request_count,input_tokens,output_tokens,cached_input_tokens,
          item_count,dimensions,status,error_code,price_version_id,estimated_cost_microusd,
          started_at,completed_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        eventId,
        input.environment,
        usageDay,
        input.workspaceId,
        input.userId,
        feature,
        operation,
        input.provider,
        model,
        safeProviderRequestId(input.providerRequestId),
        inputTokens,
        outputTokens,
        cachedInputTokens,
        itemCount,
        dimensions,
        input.status,
        errorCode,
        price?.id ?? null,
        cost,
        startedAt,
        completedAt,
        now,
      ),
      input.db.prepare(
        `INSERT INTO ai_cost_daily_aggregates
         (id,environment,usage_day,scope_key,workspace_id,user_id,feature,operation,provider,model,
          request_count,failed_request_count,input_tokens,output_tokens,cached_input_tokens,
          estimated_cost_microusd,unpriced_request_count,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
          request_count=request_count+1,
          failed_request_count=failed_request_count+excluded.failed_request_count,
          input_tokens=input_tokens+excluded.input_tokens,
          output_tokens=output_tokens+excluded.output_tokens,
          cached_input_tokens=cached_input_tokens+excluded.cached_input_tokens,
          estimated_cost_microusd=estimated_cost_microusd+excluded.estimated_cost_microusd,
          unpriced_request_count=unpriced_request_count+excluded.unpriced_request_count,
          updated_at=excluded.updated_at`,
      ).bind(
        dailyId,
        input.environment,
        usageDay,
        scopeKey,
        input.workspaceId,
        input.userId,
        feature,
        operation,
        input.provider,
        model,
        input.status === "failed" ? 1 : 0,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        cost ?? 0,
        input.status === "succeeded" && !price ? 1 : 0,
        now,
        now,
      ),
    ]);
  } catch {
    throw new ProviderUsageError("PROVIDER_USAGE_PERSISTENCE_FAILED");
  }
  try {
    await evaluateProviderCostControl({
      db: input.db,
      environment: input.environment,
      provider: input.provider,
      now: completedAt,
    });
    if ((AI_COST_FEATURES as readonly string[]).includes(feature)) {
      await evaluateScopedCostBudgets({
        db: input.db,
        environment: input.environment,
        feature,
        userId: input.userId,
        now: completedAt,
        enforce: false,
      });
    }
  } catch (error) {
    if (error instanceof ProviderCostControlError || error instanceof ScopedCostBudgetError) {
      throw new ProviderUsageError("PROVIDER_USAGE_PERSISTENCE_FAILED");
    }
    throw error;
  }
  return { id: eventId, priceVersionId: price?.id ?? null, estimatedCostMicrousd: cost };
}

function priceSourceAllowed(provider: ProviderName, value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  const host = url.hostname.toLowerCase();
  const allowed = provider === "openai"
    ? host === "openai.com" || host.endsWith(".openai.com")
    : host === "anthropic.com" || host.endsWith(".anthropic.com") || host === "platform.claude.com";
  if (!allowed) throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  url.hash = "";
  return url.toString();
}

export async function createAiModelPriceVersion(input: {
  db: D1Database;
  actorUserId: string;
  value: z.input<typeof priceMutationSchema>;
  now?: Date;
}): Promise<{ id: string }> {
  const value = priceMutationSchema.parse(input.value);
  const now = input.now ?? new Date();
  const effectiveFrom = canonicalTimestamp(value.effectiveFrom);
  if (Date.parse(effectiveFrom) > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
    throw new ProviderUsageError("PROVIDER_USAGE_INVALID");
  }
  const id = crypto.randomUUID();
  const sourceUrl = priceSourceAllowed(value.provider, value.sourceUrl);
  try {
    await input.db.prepare(
      `INSERT INTO ai_model_price_versions
       (id,provider,model,operation,input_microusd_per_million_tokens,
        output_microusd_per_million_tokens,cached_input_microusd_per_million_tokens,
        currency,effective_from,source_url,created_by_user_id,created_at)
       VALUES (?,?,?,?,?,?,?,'USD',?,?,?,?)`,
    ).bind(
      id,
      value.provider,
      value.model,
      value.operation,
      value.inputMicrousdPerMillionTokens,
      value.outputMicrousdPerMillionTokens,
      value.cachedInputMicrousdPerMillionTokens,
      effectiveFrom,
      sourceUrl,
      input.actorUserId,
      now.toISOString(),
    ).run();
  } catch {
    throw new ProviderUsageError("PROVIDER_USAGE_PERSISTENCE_FAILED");
  }
  return { id };
}

export async function readAiCostDashboard(input: {
  db: D1Database;
  environment: "development" | "staging" | "production";
  days?: number;
  now?: Date;
}): Promise<AiCostDashboard> {
  const days = Math.min(Math.max(input.days ?? 30, 1), 93);
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cutoffTimestamp = `${cutoff}T00:00:00.000Z`;
  const windowEnd = now.toISOString();
  const [prices, daily, byUser, byPlan, operationalRow, legalChatRow, unpriced, measurementRow, control, scopedControl] = await Promise.all([
    input.db.prepare(
      `SELECT id,provider,model,operation,
        input_microusd_per_million_tokens AS inputMicrousdPerMillionTokens,
        output_microusd_per_million_tokens AS outputMicrousdPerMillionTokens,
        cached_input_microusd_per_million_tokens AS cachedInputMicrousdPerMillionTokens,
        currency,effective_from AS effectiveFrom,source_url AS sourceUrl,created_at AS createdAt
       FROM ai_model_price_versions ORDER BY effective_from DESC,created_at DESC LIMIT 100`,
    ).all<AiModelPriceView>(),
    input.db.prepare(
      `SELECT usage_day AS usageDay,feature,operation,provider,model,
        sum(request_count) AS requestCount,sum(failed_request_count) AS failedRequestCount,
        sum(input_tokens) AS inputTokens,sum(output_tokens) AS outputTokens,
        sum(cached_input_tokens) AS cachedInputTokens,
        sum(estimated_cost_microusd) AS estimatedCostMicrousd,
        sum(unpriced_request_count) AS unpricedRequestCount
       FROM ai_cost_daily_aggregates
       WHERE environment=? AND usage_day>=?
       GROUP BY usage_day,feature,operation,provider,model
       ORDER BY usage_day DESC,estimatedCostMicrousd DESC LIMIT 500`,
    ).bind(input.environment, cutoff).all<AiCostDailyView>(),
    input.db.prepare(
      `SELECT aggregate.workspace_id AS workspaceId,aggregate.user_id AS userId,
        subscription.plan_code AS currentPlanCode,
        sum(aggregate.request_count) AS requestCount,
        sum(aggregate.failed_request_count) AS failedRequestCount,
        sum(aggregate.input_tokens) AS inputTokens,
        sum(aggregate.output_tokens) AS outputTokens,
        sum(aggregate.cached_input_tokens) AS cachedInputTokens,
        sum(aggregate.estimated_cost_microusd) AS estimatedCostMicrousd,
        sum(aggregate.unpriced_request_count) AS unpricedRequestCount
       FROM ai_cost_daily_aggregates AS aggregate
       LEFT JOIN subscriptions AS subscription ON subscription.workspace_id=aggregate.workspace_id
       WHERE aggregate.environment=? AND aggregate.usage_day>=? AND aggregate.user_id IS NOT NULL
       GROUP BY aggregate.workspace_id,aggregate.user_id,subscription.plan_code
       ORDER BY estimatedCostMicrousd DESC,requestCount DESC LIMIT 200`,
    ).bind(input.environment, cutoff).all<AiCostUserView>(),
    input.db.prepare(
      `SELECT
        CASE
          WHEN aggregate.user_id IS NULL THEN 'guest_or_system'
          WHEN subscription.plan_code IS NULL THEN 'unassigned'
          ELSE 'subscription'
        END AS attribution,
        subscription.plan_code AS planCode,
        count(DISTINCT aggregate.user_id) AS userCount,
        sum(aggregate.request_count) AS requestCount,
        sum(aggregate.failed_request_count) AS failedRequestCount,
        sum(aggregate.estimated_cost_microusd) AS estimatedCostMicrousd,
        sum(aggregate.unpriced_request_count) AS unpricedRequestCount
       FROM ai_cost_daily_aggregates AS aggregate
       LEFT JOIN subscriptions AS subscription ON subscription.workspace_id=aggregate.workspace_id
       WHERE aggregate.environment=? AND aggregate.usage_day>=?
       GROUP BY attribution,subscription.plan_code
       ORDER BY estimatedCostMicrousd DESC,requestCount DESC`,
    ).bind(input.environment, cutoff).all<AiCostPlanView>(),
    input.db.prepare(
      `SELECT count(*) AS providerRequests,
        COALESCE(sum(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS providerFailures,
        COALESCE(sum(CASE WHEN status='succeeded' AND input_tokens>0 THEN 1 ELSE 0 END),0) AS cacheEligibleRequests,
        COALESCE(sum(CASE WHEN status='succeeded' AND input_tokens>0 AND cached_input_tokens>0 THEN 1 ELSE 0 END),0) AS cacheHitRequests,
        COALESCE(sum(CASE WHEN status='succeeded' THEN input_tokens ELSE 0 END),0) AS inputTokens,
        COALESCE(sum(CASE WHEN status='succeeded' THEN cached_input_tokens ELSE 0 END),0) AS cachedInputTokens,
        COALESCE(sum(round((julianday(completed_at)-julianday(started_at))*86400000)),0) AS totalProviderLatencyMs
       FROM ai_provider_usage_events
       WHERE environment=? AND completed_at>=? AND completed_at<=?`,
    ).bind(input.environment, cutoffTimestamp, windowEnd).first<{
      providerRequests: number;
      providerFailures: number;
      cacheEligibleRequests: number;
      cacheHitRequests: number;
      inputTokens: number;
      cachedInputTokens: number;
      totalProviderLatencyMs: number;
    }>(),
    input.db.prepare(
      `SELECT count(*) AS completedLegalChatRuns,
        COALESCE(sum(CASE WHEN reasoning_mode='deep' THEN 1 ELSE 0 END),0) AS deepEscalationCount,
        COALESCE(sum(CASE WHEN fallback_from_provider IS NOT NULL THEN 1 ELSE 0 END),0) AS providerFallbackCount
       FROM ai_runs
       WHERE status='completed' AND completed_at>=? AND completed_at<=?`,
    ).bind(cutoffTimestamp, windowEnd).first<{
      completedLegalChatRuns: number;
      deepEscalationCount: number;
      providerFallbackCount: number;
    }>(),
    input.db.prepare(
      `SELECT count(*) AS count FROM ai_provider_usage_events
       WHERE environment=? AND status='succeeded' AND price_version_id IS NULL`,
    ).bind(input.environment).first<{ count: number }>(),
    input.db.prepare(
      `WITH boundary AS (
         SELECT CASE
           WHEN min(effective_from) IS NULL OR min(effective_from)<? THEN ?
           ELSE min(effective_from)
         END AS windowStart
         FROM ai_model_price_versions
       )
       SELECT boundary.windowStart AS windowStart,
        min(events.created_at) AS firstEventAt,max(events.created_at) AS lastEventAt,
        COALESCE(sum(CASE WHEN events.status='succeeded' THEN 1 ELSE 0 END),0) AS successfulRequests,
        COALESCE(sum(CASE WHEN events.status='failed' THEN 1 ELSE 0 END),0) AS failedRequests,
        COALESCE(sum(CASE WHEN events.status='succeeded' AND events.price_version_id IS NOT NULL THEN 1 ELSE 0 END),0) AS pricedSuccessfulRequests,
        COALESCE(sum(CASE WHEN events.status='succeeded' AND events.price_version_id IS NULL THEN 1 ELSE 0 END),0) AS unpricedSuccessfulRequests,
        COALESCE(sum(CASE WHEN events.status='succeeded' AND events.price_version_id IS NOT NULL THEN events.estimated_cost_microusd ELSE 0 END),0) AS estimatedCostMicrousd
       FROM boundary
       LEFT JOIN ai_provider_usage_events AS events
        ON events.environment=? AND events.created_at>=boundary.windowStart AND events.created_at<=?`,
    ).bind(cutoffTimestamp, cutoffTimestamp, input.environment, windowEnd).first<{
      windowStart: string;
      firstEventAt: string | null;
      lastEventAt: string | null;
      successfulRequests: number;
      failedRequests: number;
      pricedSuccessfulRequests: number;
      unpricedSuccessfulRequests: number;
      estimatedCostMicrousd: number;
    }>(),
    readProviderCostControlDashboard({ db: input.db, environment: input.environment }),
    readScopedCostBudgetDashboard({ db: input.db, environment: input.environment, now }),
  ]);
  const successfulRequests = Number(measurementRow?.successfulRequests ?? 0);
  const failedRequests = Number(measurementRow?.failedRequests ?? 0);
  const pricedSuccessfulRequests = Number(measurementRow?.pricedSuccessfulRequests ?? 0);
  const unpricedSuccessfulRequests = Number(measurementRow?.unpricedSuccessfulRequests ?? 0);
  const estimatedCostMicrousd = Number(measurementRow?.estimatedCostMicrousd ?? 0);
  const providerRequests = Number(operationalRow?.providerRequests ?? 0);
  const providerFailures = Number(operationalRow?.providerFailures ?? 0);
  const cacheEligibleRequests = Number(operationalRow?.cacheEligibleRequests ?? 0);
  const cacheHitRequests = Number(operationalRow?.cacheHitRequests ?? 0);
  const inputTokens = Number(operationalRow?.inputTokens ?? 0);
  const cachedInputTokens = Number(operationalRow?.cachedInputTokens ?? 0);
  const totalProviderLatencyMs = Number(operationalRow?.totalProviderLatencyMs ?? 0);
  const completedLegalChatRuns = Number(legalChatRow?.completedLegalChatRuns ?? 0);
  const deepEscalationCount = Number(legalChatRow?.deepEscalationCount ?? 0);
  const providerFallbackCount = Number(legalChatRow?.providerFallbackCount ?? 0);
  const status: AiCostMeasurementStatus = successfulRequests + failedRequests === 0
    ? "no_data"
    : unpricedSuccessfulRequests > 0
      ? "incomplete_pricing"
      : pricedSuccessfulRequests < AI_COST_MINIMUM_PRICED_SUCCESS_SAMPLE
        ? "insufficient_sample"
        : "ready";
  return {
    prices: prices.results,
    daily: daily.results,
    byUser: byUser.results,
    byPlan: byPlan.results,
    planSnapshotAt: windowEnd,
    operational: {
      providerRequests,
      providerFailures,
      providerFailureRateBps: providerRequests > 0
        ? Math.floor(providerFailures * 10_000 / providerRequests)
        : null,
      averageProviderLatencyMs: providerRequests > 0
        ? Math.round(totalProviderLatencyMs / providerRequests)
        : null,
      cacheEligibleRequests,
      cacheHitRequests,
      cacheHitRateBps: cacheEligibleRequests > 0
        ? Math.floor(cacheHitRequests * 10_000 / cacheEligibleRequests)
        : null,
      inputTokens,
      cachedInputTokens,
      cachedInputTokenShareBps: inputTokens > 0
        ? Math.floor(cachedInputTokens * 10_000 / inputTokens)
        : null,
      completedLegalChatRuns,
      deepEscalationCount,
      deepEscalationRateBps: completedLegalChatRuns > 0
        ? Math.floor(deepEscalationCount * 10_000 / completedLegalChatRuns)
        : null,
      providerFallbackCount,
      providerFallbackRateBps: completedLegalChatRuns > 0
        ? Math.floor(providerFallbackCount * 10_000 / completedLegalChatRuns)
        : null,
    },
    unpricedEvents: Number(unpriced?.count ?? 0),
    measurement: {
      windowStart: measurementRow?.windowStart ?? cutoffTimestamp,
      windowEnd,
      firstEventAt: measurementRow?.firstEventAt ?? null,
      lastEventAt: measurementRow?.lastEventAt ?? null,
      successfulRequests,
      failedRequests,
      pricedSuccessfulRequests,
      unpricedSuccessfulRequests,
      pricingCoverageBps: successfulRequests > 0
        ? Math.floor(pricedSuccessfulRequests * 10_000 / successfulRequests)
        : 0,
      estimatedCostMicrousd,
      costPerPricedSuccessMicrousd: pricedSuccessfulRequests > 0
        ? Math.round(estimatedCostMicrousd / pricedSuccessfulRequests)
        : null,
      minimumPricedSuccessfulRequests: AI_COST_MINIMUM_PRICED_SUCCESS_SAMPLE,
      status,
    },
    ...control,
    ...scopedControl,
  };
}
