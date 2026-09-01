import { z } from "zod";
import {
  dependencyHealthRecordedStates,
  type DependencyHealthState,
} from "../operations/dependency-health";

export const PRODUCT_METRICS_MINIMUM_COHORT = 10;
export const PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE = 20;
export const PRODUCT_METRICS_DEFAULT_DAYS = 30;
export const PRODUCT_METRICS_WINDOWS = [30, 60, 90] as const;

const environmentSchema = z.enum(["development", "staging", "production"]);
const nonNegativeInteger = z.coerce.number().int().nonnegative();
const nullableDuration = z.union([nonNegativeInteger, z.null()]);

const cohortRowSchema = z.object({
  signupCount: nonNegativeInteger,
  activatedCount: nonNegativeInteger,
  ttfvP50Ms: nullableDuration,
  ttfvP95Ms: nullableDuration,
  progressionEligibleCount: nonNegativeInteger,
  progressedCount: nonNegativeInteger,
}).strict();

const costRowSchema = z.object({
  completedAnswerCount: nonNegativeInteger,
  providerAttemptCount: nonNegativeInteger,
  unpricedAttemptCount: nonNegativeInteger,
  totalCostMicrousd: nonNegativeInteger,
}).strict();

const reliabilityRowSchema = z.object({
  totalCount: nonNegativeInteger,
  completedCount: nonNegativeInteger,
  fallbackCount: nonNegativeInteger,
}).strict();

const providerRowSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  currentState: z.enum(dependencyHealthRecordedStates),
  checkedAt: z.string().datetime({ offset: true }),
  observedCount: nonNegativeInteger,
  operationalCount: nonNegativeInteger,
}).strict();

export type ProductMetricSampleStatus =
  | "sufficient"
  | "insufficient"
  | "suppressed"
  | "incomplete_pricing";

export type ThresholdedRate = {
  status: Exclude<ProductMetricSampleStatus, "incomplete_pricing">;
  minimumSampleSize: number;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
};

export type ProductMetricsDashboard = {
  generatedAt: string;
  environment: z.infer<typeof environmentSchema>;
  window: {
    days: number;
    from: string;
    until: string;
    observationDays: 7;
  };
  activation: ThresholdedRate;
  timeToFirstValue: {
    status: "sufficient" | "insufficient";
    minimumSampleSize: number;
    observed: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
  };
  workflowProgression: ThresholdedRate;
  successfulAnswerCost: {
    status: "sufficient" | "insufficient" | "incomplete_pricing";
    minimumSampleSize: number;
    completedAnswers: number | null;
    pricingComplete: boolean;
    microusdPerAnswer: number | null;
  };
  aiReliability: {
    completion: ThresholdedRate;
    fallback: ThresholdedRate;
  };
  providerAvailability: Array<{
    provider: "openai" | "anthropic";
    currentState: DependencyHealthState;
    checkedAt: string;
    availability: ThresholdedRate;
  }>;
};

function safeDays(value: number | undefined): number {
  const candidate = value ?? PRODUCT_METRICS_DEFAULT_DAYS;
  if (
    !Number.isSafeInteger(candidate)
    || !PRODUCT_METRICS_WINDOWS.includes(
      candidate as (typeof PRODUCT_METRICS_WINDOWS)[number],
    )
  ) throw new Error("PRODUCT_METRICS_WINDOW_INVALID");
  return candidate;
}

function thresholdedRate(
  numerator: number,
  denominator: number,
  minimumSampleSize: number,
): ThresholdedRate {
  if (denominator < minimumSampleSize) {
    return {
      status: "insufficient",
      minimumSampleSize,
      numerator: null,
      denominator: null,
      rate: null,
    };
  }
  const complement = denominator - numerator;
  if (
    numerator < 0
    || numerator > denominator
    || (numerator > 0 && numerator < minimumSampleSize)
    || (complement > 0 && complement < minimumSampleSize)
  ) {
    return {
      status: "suppressed",
      minimumSampleSize,
      numerator: null,
      denominator: null,
      rate: null,
    };
  }
  return {
    status: "sufficient",
    minimumSampleSize,
    numerator,
    denominator,
    rate: numerator / denominator,
  };
}

function thresholdedTechnicalRate(
  numerator: number,
  denominator: number,
  minimumSampleSize: number,
): ThresholdedRate {
  if (denominator < minimumSampleSize || numerator < 0 || numerator > denominator) {
    return {
      status: "insufficient",
      minimumSampleSize,
      numerator: null,
      denominator: null,
      rate: null,
    };
  }
  return {
    status: "sufficient",
    minimumSampleSize,
    numerator,
    denominator,
    rate: numerator / denominator,
  };
}

function suppressDependentRate(
  metric: ThresholdedRate,
  upstreamStatus: ThresholdedRate["status"],
): ThresholdedRate {
  if (upstreamStatus === "sufficient") return metric;
  return {
    status: upstreamStatus,
    minimumSampleSize: metric.minimumSampleSize,
    numerator: null,
    denominator: null,
    rate: null,
  };
}

function firstParsed<T>(
  result: D1Result<unknown> | undefined,
  schema: z.ZodType<T>,
  errorCode: string,
): T {
  const parsed = schema.safeParse(result?.results[0]);
  if (!parsed.success) throw new Error(errorCode);
  return parsed.data;
}

export async function readProductMetricsDashboard(input: {
  db: D1Database;
  environment: "development" | "staging" | "production";
  days?: number;
  now?: Date;
}): Promise<ProductMetricsDashboard> {
  const environment = environmentSchema.parse(input.environment);
  const days = safeDays(input.days);
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("PRODUCT_METRICS_WINDOW_INVALID");
  const until = now.toISOString();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000).toISOString();

  const results = await input.db.batch<unknown>([
    input.db.prepare(
      `WITH cohort AS (
         SELECT id,created_at
         FROM user_profiles
         WHERE julianday(created_at)>=julianday(?)
           AND julianday(created_at)<julianday(?)
           AND julianday(created_at)<=julianday(?)-7
           AND account_type IN ('individual','entrepreneur','business','lawyer')
       ), activations AS (
         SELECT cohort.id,activation.first_completed_at,
           CAST(ROUND((julianday(activation.first_completed_at)-julianday(cohort.created_at))*86400000) AS INTEGER) AS ttfv_ms
         FROM cohort
         JOIN product_value_activations activation ON activation.user_id=cohort.id
         WHERE julianday(activation.first_completed_at)>=julianday(cohort.created_at)
           AND julianday(activation.first_completed_at)<=julianday(cohort.created_at)+7
       ), ranked_ttfv AS (
         SELECT ttfv_ms,
           row_number() OVER (ORDER BY ttfv_ms) AS rank_number,
           count(*) OVER () AS sample_count
         FROM activations
       ), progression_eligible AS (
         SELECT * FROM activations
         WHERE julianday(first_completed_at)<=julianday(?)-7
       ), progressed AS (
         SELECT activation.id
         FROM progression_eligible activation
         WHERE EXISTS (
           SELECT 1 FROM cases value
           WHERE value.owner_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+7
         ) OR EXISTS (
           SELECT 1 FROM action_plans value
           WHERE value.created_by_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+7
         ) OR EXISTS (
           SELECT 1 FROM lawyer_requests value
           WHERE value.requester_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+7
         ) OR EXISTS (
           SELECT 1 FROM lawyer_consultations value
           WHERE value.client_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+7
         )
       )
       SELECT
         (SELECT count(*) FROM cohort) AS signupCount,
         (SELECT count(*) FROM activations) AS activatedCount,
         (SELECT ttfv_ms FROM ranked_ttfv
           WHERE rank_number=CAST((sample_count+1)/2 AS INTEGER) LIMIT 1) AS ttfvP50Ms,
         (SELECT ttfv_ms FROM ranked_ttfv
           WHERE rank_number=CAST((95*sample_count+99)/100 AS INTEGER) LIMIT 1) AS ttfvP95Ms,
         (SELECT count(*) FROM progression_eligible) AS progressionEligibleCount,
         (SELECT count(*) FROM progressed) AS progressedCount`,
    ).bind(from, until, until, until),
    input.db.prepare(
      `WITH completed_answers AS (
         SELECT count(*) AS answer_count
         FROM ai_runs run
         JOIN conversation_messages response ON response.id=run.response_message_id
         WHERE run.status='completed'
           AND julianday(run.completed_at)>=julianday(?)
           AND julianday(run.completed_at)<julianday(?)
           AND json_valid(response.structured_json)
           AND json_extract(response.structured_json,'$.responseKind')='answer'
       ), provider_cost AS (
         SELECT count(*) AS attempt_count,
           sum(CASE WHEN price_version_id IS NULL THEN 1 ELSE 0 END) AS unpriced_count,
           COALESCE(sum(estimated_cost_microusd),0) AS total_cost
         FROM ai_provider_usage_events
         WHERE environment=? AND feature='legal_chat' AND status='succeeded'
           AND julianday(completed_at)>=julianday(?)
           AND julianday(completed_at)<julianday(?)
       )
       SELECT answer_count AS completedAnswerCount,
         attempt_count AS providerAttemptCount,
         COALESCE(unpriced_count,0) AS unpricedAttemptCount,
         total_cost AS totalCostMicrousd
       FROM completed_answers CROSS JOIN provider_cost`,
    ).bind(from, until, environment, from, until),
    input.db.prepare(
      `SELECT count(*) AS totalCount,
         sum(CASE WHEN outcome='completed' THEN 1 ELSE 0 END) AS completedCount,
         sum(CASE WHEN fallback<>'none' THEN 1 ELSE 0 END) AS fallbackCount
       FROM ai_slo_telemetry_events
       WHERE environment=? AND request_kind='legal_chat' AND auth_kind='authenticated'
         AND julianday(occurred_at)>=julianday(?)
         AND julianday(occurred_at)<julianday(?)`,
    ).bind(environment, from, until),
    input.db.prepare(
      `WITH windowed AS (
         SELECT dependency_key,state,checked_at,id
         FROM dependency_health_checks
         WHERE environment=? AND dependency_key IN ('openai','anthropic')
           AND julianday(checked_at)>=julianday(?)
           AND julianday(checked_at)<julianday(?)
       ), ranked AS (
         SELECT dependency_key,state,checked_at,
           row_number() OVER (PARTITION BY dependency_key ORDER BY checked_at DESC,id DESC) AS rank_number,
           count(*) OVER (PARTITION BY dependency_key) AS observed_count,
           sum(CASE WHEN state='operational' THEN 1 ELSE 0 END)
             OVER (PARTITION BY dependency_key) AS operational_count
         FROM windowed
       )
       SELECT dependency_key AS provider,state AS currentState,checked_at AS checkedAt,
         observed_count AS observedCount,operational_count AS operationalCount
       FROM ranked WHERE rank_number=1 ORDER BY dependency_key`,
    ).bind(environment, from, until),
  ]);

  const cohort = firstParsed(results[0], cohortRowSchema, "PRODUCT_METRICS_COHORT_INVALID");
  const cost = firstParsed(results[1], costRowSchema, "PRODUCT_METRICS_COST_INVALID");
  const reliability = firstParsed(results[2], reliabilityRowSchema, "PRODUCT_METRICS_RELIABILITY_INVALID");
  const providerRows = (results[3]?.results ?? []).map((row) => providerRowSchema.parse(row));

  const activation = thresholdedRate(
    cohort.activatedCount,
    cohort.signupCount,
    PRODUCT_METRICS_MINIMUM_COHORT,
  );
  const workflowProgression = suppressDependentRate(
    thresholdedRate(
      cohort.progressedCount,
      cohort.progressionEligibleCount,
      PRODUCT_METRICS_MINIMUM_COHORT,
    ),
    activation.status,
  );
  const ttfvSufficient = activation.status === "sufficient"
    && cohort.activatedCount >= PRODUCT_METRICS_MINIMUM_COHORT
    && cohort.ttfvP50Ms !== null
    && cohort.ttfvP95Ms !== null;
  const costSufficient = cost.completedAnswerCount >= PRODUCT_METRICS_MINIMUM_COHORT;
  const pricingComplete = cost.unpricedAttemptCount === 0;

  return {
    generatedAt: until,
    environment,
    window: { days, from, until, observationDays: 7 },
    activation,
    timeToFirstValue: {
      status: ttfvSufficient ? "sufficient" : "insufficient",
      minimumSampleSize: PRODUCT_METRICS_MINIMUM_COHORT,
      observed: ttfvSufficient ? cohort.activatedCount : null,
      p50Ms: ttfvSufficient ? cohort.ttfvP50Ms : null,
      p95Ms: ttfvSufficient ? cohort.ttfvP95Ms : null,
    },
    workflowProgression,
    successfulAnswerCost: {
      status: !costSufficient
        ? "insufficient"
        : !pricingComplete
          ? "incomplete_pricing"
          : "sufficient",
      minimumSampleSize: PRODUCT_METRICS_MINIMUM_COHORT,
      completedAnswers: costSufficient ? cost.completedAnswerCount : null,
      pricingComplete,
      microusdPerAnswer: costSufficient && pricingComplete
        ? Math.round(cost.totalCostMicrousd / cost.completedAnswerCount)
        : null,
    },
    aiReliability: {
      completion: thresholdedTechnicalRate(
        reliability.completedCount,
        reliability.totalCount,
        PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE,
      ),
      fallback: thresholdedTechnicalRate(
        reliability.fallbackCount,
        reliability.totalCount,
        PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE,
      ),
    },
    providerAvailability: providerRows.map((row) => ({
      provider: row.provider,
      currentState: row.currentState,
      checkedAt: row.checkedAt,
      availability: thresholdedTechnicalRate(
        row.operationalCount,
        row.observedCount,
        PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE,
      ),
    })),
  };
}
