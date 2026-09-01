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
  caseCreatedCount: nonNegativeInteger,
  returnEligibleCount: nonNegativeInteger,
  returnedCount: nonNegativeInteger,
}).strict();

const questionJourneyRowSchema = z.object({
  questionCount: nonNegativeInteger,
  answeredCount: nonNegativeInteger,
}).strict();

const planCompletionRowSchema = z.object({
  planCount: nonNegativeInteger,
  completedCount: nonNegativeInteger,
}).strict();

const lawyerConversionRowSchema = z.object({
  requestCount: nonNegativeInteger,
  acceptedCount: nonNegativeInteger,
}).strict();

const feedbackRowSchema = z.object({
  answerCount: nonNegativeInteger,
  errorReportedCount: nonNegativeInteger,
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
  endToEndObservedCount: nonNegativeInteger,
  firstUsefulObservedCount: nonNegativeInteger,
  endToEndP50Ms: nullableDuration,
  endToEndP95Ms: nullableDuration,
  firstUsefulP50Ms: nullableDuration,
  firstUsefulP95Ms: nullableDuration,
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
  | "incomplete_pricing"
  | "incomplete_usage";

export type ThresholdedRate = {
  status: Exclude<ProductMetricSampleStatus, "incomplete_pricing" | "incomplete_usage">;
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
    observationDays: 14;
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
  questionJourney: {
    completion: ThresholdedRate;
    dropOff: ThresholdedRate;
  };
  returnRate: ThresholdedRate;
  caseCreation: ThresholdedRate;
  planCompletion: ThresholdedRate;
  lawyerConversion: ThresholdedRate;
  userReportedError: ThresholdedRate;
  successfulAnswerCost: {
    status: "sufficient" | "insufficient" | "incomplete_pricing" | "incomplete_usage";
    minimumSampleSize: number;
    completedAnswers: number | null;
    pricingComplete: boolean;
    microusdPerAnswer: number | null;
  };
  averageAiAttemptCost: {
    status: "sufficient" | "insufficient" | "incomplete_pricing";
    minimumSampleSize: number;
    providerAttempts: number | null;
    pricingComplete: boolean;
    microusdPerAttempt: number | null;
  };
  aiReliability: {
    completion: ThresholdedRate;
    fallback: ThresholdedRate;
    latency: {
      status: "sufficient" | "insufficient";
      minimumSampleSize: number;
      observed: number | null;
      endToEndP50Ms: number | null;
      endToEndP95Ms: number | null;
      firstUsefulP50Ms: number | null;
      firstUsefulP95Ms: number | null;
    };
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
       ), case_created AS (
         SELECT activation.id
         FROM progression_eligible activation
         WHERE EXISTS (
           SELECT 1 FROM cases value
           WHERE value.owner_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+7
         )
       ), return_eligible AS (
         SELECT * FROM activations
         WHERE julianday(first_completed_at)<=julianday(?)-14
       ), returned AS (
         SELECT activation.id
         FROM return_eligible activation
         WHERE EXISTS (
           SELECT 1 FROM conversations conversation
           JOIN conversation_messages message ON message.conversation_id=conversation.id
           WHERE conversation.owner_user_id=activation.id
             AND message.author_type='user'
             AND julianday(message.created_at)>=julianday(activation.first_completed_at)+1
             AND julianday(message.created_at)<=julianday(activation.first_completed_at)+14
         ) OR EXISTS (
           SELECT 1 FROM cases value
           WHERE value.owner_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)+1
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+14
         ) OR EXISTS (
           SELECT 1 FROM action_plans value
           WHERE value.created_by_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)+1
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+14
         ) OR EXISTS (
           SELECT 1 FROM lawyer_requests value
           WHERE value.requester_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)+1
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+14
         ) OR EXISTS (
           SELECT 1 FROM lawyer_consultations value
           WHERE value.client_user_id=activation.id
             AND julianday(value.created_at)>=julianday(activation.first_completed_at)+1
             AND julianday(value.created_at)<=julianday(activation.first_completed_at)+14
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
         (SELECT count(*) FROM progressed) AS progressedCount,
         (SELECT count(*) FROM case_created) AS caseCreatedCount,
         (SELECT count(*) FROM return_eligible) AS returnEligibleCount,
         (SELECT count(*) FROM returned) AS returnedCount`,
    ).bind(from, until, until, until, until),
    input.db.prepare(
      `WITH questions AS (
         SELECT user_id,first_completed_at
         FROM product_account_milestones
         WHERE event_name='first_question_sent'
           AND julianday(first_completed_at)>=julianday(?)
           AND julianday(first_completed_at)<julianday(?)
           AND julianday(first_completed_at)<=julianday(?)-7
       )
       SELECT count(*) AS questionCount,
         sum(CASE WHEN EXISTS (
           SELECT 1 FROM product_value_activations activation
           WHERE activation.user_id=questions.user_id
             AND julianday(activation.first_completed_at)>=julianday(questions.first_completed_at)
             AND julianday(activation.first_completed_at)<=julianday(questions.first_completed_at)+7
         ) THEN 1 ELSE 0 END) AS answeredCount
       FROM questions`,
    ).bind(from, until, until),
    input.db.prepare(
      `SELECT count(*) AS planCount,
         sum(CASE WHEN status='completed'
           AND julianday(updated_at)>=julianday(created_at)
           AND julianday(updated_at)<=julianday(created_at)+14 THEN 1 ELSE 0 END) AS completedCount
       FROM action_plans
       WHERE julianday(created_at)>=julianday(?)
         AND julianday(created_at)<julianday(?)
         AND julianday(created_at)<=julianday(?)-14`,
    ).bind(from, until, until),
    input.db.prepare(
      `SELECT count(*) AS requestCount,
         sum(CASE WHEN EXISTS (
           SELECT 1 FROM lawyer_access_grants access
           WHERE access.lawyer_request_id=request.id
             AND julianday(access.created_at)>=julianday(request.created_at)
             AND julianday(access.created_at)<=julianday(request.created_at)+14
         ) THEN 1 ELSE 0 END) AS acceptedCount
       FROM lawyer_requests request
       WHERE julianday(request.created_at)>=julianday(?)
         AND julianday(request.created_at)<julianday(?)
         AND julianday(request.created_at)<=julianday(?)-14`,
    ).bind(from, until, until),
    input.db.prepare(
      `WITH answers AS (
         SELECT response.id,run.completed_at
         FROM ai_runs run
         JOIN conversation_messages response ON response.id=run.response_message_id
         WHERE run.status='completed'
           AND julianday(run.completed_at)>=julianday(?)
           AND julianday(run.completed_at)<julianday(?)
           AND julianday(run.completed_at)<=julianday(?)-7
           AND json_valid(response.structured_json)
           AND json_extract(response.structured_json,'$.responseKind')='answer'
       )
       SELECT count(*) AS answerCount,
         sum(CASE WHEN EXISTS (
           SELECT 1 FROM ai_feedback feedback
           WHERE feedback.assistant_message_id=answers.id
             AND feedback.feedback_type IN (
               'not_helpful','wrong_norm','broken_link','outdated','incomplete',
               'language','unsafe','ignored_facts'
             )
             AND julianday(feedback.created_at)>=julianday(answers.completed_at)
             AND julianday(feedback.created_at)<=julianday(answers.completed_at)+7
         ) THEN 1 ELSE 0 END) AS errorReportedCount
       FROM answers`,
    ).bind(from, until, until),
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
      `WITH windowed AS (
         SELECT id,outcome,fallback,end_to_end_ms,first_useful_latency_ms
         FROM ai_slo_telemetry_events
         WHERE environment=? AND request_kind='legal_chat' AND auth_kind='authenticated'
           AND julianday(occurred_at)>=julianday(?)
           AND julianday(occurred_at)<julianday(?)
       ), ranked_end_to_end AS (
         SELECT end_to_end_ms,
           row_number() OVER (ORDER BY end_to_end_ms) AS rank_number,
           count(*) OVER () AS sample_count
         FROM windowed WHERE outcome='completed' AND end_to_end_ms IS NOT NULL
       ), ranked_first_useful AS (
         SELECT first_useful_latency_ms,
           row_number() OVER (ORDER BY first_useful_latency_ms) AS rank_number,
           count(*) OVER () AS sample_count
         FROM windowed WHERE outcome='completed' AND first_useful_latency_ms IS NOT NULL
       )
       SELECT (SELECT count(*) FROM windowed) AS totalCount,
         (SELECT count(*) FROM windowed WHERE outcome='completed') AS completedCount,
         (SELECT count(*) FROM windowed WHERE fallback<>'none') AS fallbackCount,
         (SELECT count(*) FROM ranked_end_to_end) AS endToEndObservedCount,
         (SELECT count(*) FROM ranked_first_useful) AS firstUsefulObservedCount,
         (SELECT end_to_end_ms FROM ranked_end_to_end
           WHERE rank_number=CAST((sample_count+1)/2 AS INTEGER) LIMIT 1) AS endToEndP50Ms,
         (SELECT end_to_end_ms FROM ranked_end_to_end
           WHERE rank_number=CAST((95*sample_count+99)/100 AS INTEGER) LIMIT 1) AS endToEndP95Ms,
         (SELECT first_useful_latency_ms FROM ranked_first_useful
           WHERE rank_number=CAST((sample_count+1)/2 AS INTEGER) LIMIT 1) AS firstUsefulP50Ms,
         (SELECT first_useful_latency_ms FROM ranked_first_useful
           WHERE rank_number=CAST((95*sample_count+99)/100 AS INTEGER) LIMIT 1) AS firstUsefulP95Ms`,
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
  const questionJourney = firstParsed(results[1], questionJourneyRowSchema, "PRODUCT_METRICS_QUESTION_JOURNEY_INVALID");
  const planCompletion = firstParsed(results[2], planCompletionRowSchema, "PRODUCT_METRICS_PLAN_COMPLETION_INVALID");
  const lawyerConversion = firstParsed(results[3], lawyerConversionRowSchema, "PRODUCT_METRICS_LAWYER_CONVERSION_INVALID");
  const feedback = firstParsed(results[4], feedbackRowSchema, "PRODUCT_METRICS_FEEDBACK_INVALID");
  const cost = firstParsed(results[5], costRowSchema, "PRODUCT_METRICS_COST_INVALID");
  const reliability = firstParsed(results[6], reliabilityRowSchema, "PRODUCT_METRICS_RELIABILITY_INVALID");
  const providerRows = (results[7]?.results ?? []).map((row) => providerRowSchema.parse(row));

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
  const questionCompletion = thresholdedRate(
    questionJourney.answeredCount,
    questionJourney.questionCount,
    PRODUCT_METRICS_MINIMUM_COHORT,
  );
  const questionDropOff = thresholdedRate(
    questionJourney.questionCount - questionJourney.answeredCount,
    questionJourney.questionCount,
    PRODUCT_METRICS_MINIMUM_COHORT,
  );
  const returnRate = suppressDependentRate(
    thresholdedRate(
      cohort.returnedCount,
      cohort.returnEligibleCount,
      PRODUCT_METRICS_MINIMUM_COHORT,
    ),
    activation.status,
  );
  const caseCreation = suppressDependentRate(
    thresholdedRate(
      cohort.caseCreatedCount,
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
  const providerUsageComplete = cost.providerAttemptCount >= cost.completedAnswerCount;
  const averageAttemptCostSufficient = cost.providerAttemptCount
    >= PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE;
  const pricingComplete = cost.unpricedAttemptCount === 0;
  const latencySufficient = reliability.endToEndObservedCount
    >= PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE
    && reliability.firstUsefulObservedCount >= PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE
    && reliability.endToEndP50Ms !== null
    && reliability.endToEndP95Ms !== null
    && reliability.firstUsefulP50Ms !== null
    && reliability.firstUsefulP95Ms !== null;

  return {
    generatedAt: until,
    environment,
    window: { days, from, until, observationDays: 14 },
    activation,
    timeToFirstValue: {
      status: ttfvSufficient ? "sufficient" : "insufficient",
      minimumSampleSize: PRODUCT_METRICS_MINIMUM_COHORT,
      observed: ttfvSufficient ? cohort.activatedCount : null,
      p50Ms: ttfvSufficient ? cohort.ttfvP50Ms : null,
      p95Ms: ttfvSufficient ? cohort.ttfvP95Ms : null,
    },
    workflowProgression,
    questionJourney: {
      completion: questionCompletion,
      dropOff: questionDropOff,
    },
    returnRate,
    caseCreation,
    planCompletion: thresholdedRate(
      planCompletion.completedCount,
      planCompletion.planCount,
      PRODUCT_METRICS_MINIMUM_COHORT,
    ),
    lawyerConversion: thresholdedRate(
      lawyerConversion.acceptedCount,
      lawyerConversion.requestCount,
      PRODUCT_METRICS_MINIMUM_COHORT,
    ),
    userReportedError: thresholdedRate(
      feedback.errorReportedCount,
      feedback.answerCount,
      PRODUCT_METRICS_MINIMUM_COHORT,
    ),
    successfulAnswerCost: {
      status: !costSufficient
        ? "insufficient"
        : !providerUsageComplete
          ? "incomplete_usage"
          : !pricingComplete
            ? "incomplete_pricing"
            : "sufficient",
      minimumSampleSize: PRODUCT_METRICS_MINIMUM_COHORT,
      completedAnswers: costSufficient ? cost.completedAnswerCount : null,
      pricingComplete,
      microusdPerAnswer: costSufficient && providerUsageComplete && pricingComplete
        ? Math.round(cost.totalCostMicrousd / cost.completedAnswerCount)
        : null,
    },
    averageAiAttemptCost: {
      status: !averageAttemptCostSufficient
        ? "insufficient"
        : !pricingComplete
          ? "incomplete_pricing"
          : "sufficient",
      minimumSampleSize: PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE,
      providerAttempts: averageAttemptCostSufficient ? cost.providerAttemptCount : null,
      pricingComplete,
      microusdPerAttempt: averageAttemptCostSufficient && pricingComplete
        ? Math.round(cost.totalCostMicrousd / cost.providerAttemptCount)
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
      latency: {
        status: latencySufficient ? "sufficient" : "insufficient",
        minimumSampleSize: PRODUCT_METRICS_MINIMUM_RELIABILITY_SAMPLE,
        observed: latencySufficient
          ? Math.min(reliability.endToEndObservedCount, reliability.firstUsefulObservedCount)
          : null,
        endToEndP50Ms: latencySufficient ? reliability.endToEndP50Ms : null,
        endToEndP95Ms: latencySufficient ? reliability.endToEndP95Ms : null,
        firstUsefulP50Ms: latencySufficient ? reliability.firstUsefulP50Ms : null,
        firstUsefulP95Ms: latencySufficient ? reliability.firstUsefulP95Ms : null,
      },
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
