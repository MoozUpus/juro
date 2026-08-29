const DAY_MS = 24 * 60 * 60 * 1_000;

export const PRODUCT_KPI_PRIVACY_MIN_SAMPLE = 5;
export const PRODUCT_KPI_COMPARABLE_MIN_SAMPLE = 30;

export type ProductKpiReadiness =
  | "no_data"
  | "privacy_threshold"
  | "insufficient_sample"
  | "ready";

export type ProductKpiDashboard = {
  asOf: string;
  activation: {
    cohortStartedAt: string;
    cohortEndedAt: string;
    valueWindowDays: 7;
    eligibleSignups: number;
    activatedSignups: number;
    rateBasisPoints: number | null;
    readiness: ProductKpiReadiness;
    privacyMinSample: number;
    comparableMinSample: number;
    qualifyingUsers: {
      groundedAnswer: number;
      documentAnalysis: number;
      caseWithPlan: number;
    };
    ttfvSeconds: { p50: number | null; p75: number | null; p95: number | null };
  };
  workflows: {
    windowStartedAt: string;
    windowEndedAt: string;
    plans: {
      created: number;
      completed: number;
      completionRateBasisPoints: number | null;
      readiness: ProductKpiReadiness;
    };
    lawyerRequests: {
      created: number;
      acceptedOrLater: number;
      completed: number;
      acceptanceRateBasisPoints: number | null;
      readiness: ProductKpiReadiness;
    };
  };
  privacy: {
    protectedByFreshMfa: true;
    rawIdentifiersReturned: false;
    contentReturned: false;
    excludedCohorts: readonly ["legal_evaluation", "investor_demo", "active_platform_staff"];
  };
};

type ActivationSummaryRow = {
  eligibleSignups: number;
  activatedSignups: number;
  groundedAnswerUsers: number;
  documentAnalysisUsers: number;
  casePlanUsers: number;
};

type DurationRow = { durationSeconds: number };
type PlanSummaryRow = { created: number; completed: number };
type LawyerRequestSummaryRow = { created: number; acceptedOrLater: number; completed: number };

const investorDemoIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
] as const;

const excludedUserPredicate = `
  profile.id NOT GLOB 'legal_eval_user_*'
  AND profile.id NOT IN ('${investorDemoIds.join("','")}')
  AND NOT EXISTS (
    SELECT 1 FROM platform_staff_assignments staff
    WHERE staff.user_id=profile.id
      AND staff.revoked_at IS NULL
      AND (staff.expires_at IS NULL OR staff.expires_at>?)
  )`;

function isoDaysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function numeric(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function rateBasisPoints(numerator: number, denominator: number): number | null {
  if (denominator < PRODUCT_KPI_PRIVACY_MIN_SAMPLE) return null;
  return Math.round((numerator * 10_000) / denominator);
}

function readiness(sample: number): ProductKpiReadiness {
  if (sample === 0) return "no_data";
  if (sample < PRODUCT_KPI_PRIVACY_MIN_SAMPLE) return "privacy_threshold";
  if (sample < PRODUCT_KPI_COMPARABLE_MIN_SAMPLE) return "insufficient_sample";
  return "ready";
}

function percentile(sortedValues: number[], fraction: number): number | null {
  if (sortedValues.length < PRODUCT_KPI_PRIVACY_MIN_SAMPLE) return null;
  const index = Math.ceil(fraction * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? null;
}

const activationCtes = `
WITH eligible AS (
  SELECT profile.id AS userId,profile.onboarding_completed_at AS onboardedAt
  FROM user_profiles profile
  WHERE profile.onboarding_completed_at>=?
    AND profile.onboarding_completed_at<?
    AND ${excludedUserPredicate}
),
value_events AS (
  SELECT eligible.userId,run.completed_at AS valueAt,'grounded_answer' AS outcome
  FROM eligible
  JOIN ai_runs run ON run.user_id=eligible.userId
  JOIN conversation_messages message ON message.id=run.response_message_id
  WHERE run.status='completed' AND run.completed_at IS NOT NULL
    AND julianday(run.completed_at)>=julianday(eligible.onboardedAt)
    AND julianday(run.completed_at)<=julianday(eligible.onboardedAt)+7
    AND json_valid(message.structured_json)=1
    AND json_extract(message.structured_json,'$.responseKind')='answer'
    AND json_extract(message.structured_json,'$.sourceValidationStatus')='validated'
    AND json_array_length(message.structured_json,'$.sources')>0
  UNION ALL
  SELECT eligible.userId,analysis.updated_at AS valueAt,'document_analysis' AS outcome
  FROM eligible
  JOIN document_analyses analysis ON analysis.owner_user_id=eligible.userId
  WHERE analysis.status='completed'
    AND julianday(analysis.updated_at)>=julianday(eligible.onboardedAt)
    AND julianday(analysis.updated_at)<=julianday(eligible.onboardedAt)+7
  UNION ALL
  SELECT eligible.userId,
    CASE WHEN julianday(matter.created_at)>julianday(plan.created_at)
      THEN matter.created_at ELSE plan.created_at END AS valueAt,
    'case_plan' AS outcome
  FROM eligible
  JOIN cases matter ON matter.owner_user_id=eligible.userId
  JOIN action_plans plan ON plan.case_id=matter.id
  WHERE julianday(matter.created_at)>=julianday(eligible.onboardedAt)
    AND julianday(plan.created_at)>=julianday(eligible.onboardedAt)
    AND julianday(matter.created_at)<=julianday(eligible.onboardedAt)+7
    AND julianday(plan.created_at)<=julianday(eligible.onboardedAt)+7
),
first_values AS (
  SELECT userId,min(valueAt) AS firstValueAt FROM value_events GROUP BY userId
)`;

const activationSummarySql = `${activationCtes}
SELECT
  (SELECT count(*) FROM eligible) AS eligibleSignups,
  (SELECT count(*) FROM first_values) AS activatedSignups,
  (SELECT count(DISTINCT userId) FROM value_events WHERE outcome='grounded_answer') AS groundedAnswerUsers,
  (SELECT count(DISTINCT userId) FROM value_events WHERE outcome='document_analysis') AS documentAnalysisUsers,
  (SELECT count(DISTINCT userId) FROM value_events WHERE outcome='case_plan') AS casePlanUsers`;

const activationDurationsSql = `${activationCtes}
SELECT CAST(round((julianday(firstValueAt)-julianday(onboardedAt))*86400) AS INTEGER) AS durationSeconds
FROM first_values JOIN eligible USING(userId)
ORDER BY durationSeconds`;

const planSummarySql = `
SELECT count(*) AS created,
  COALESCE(sum(CASE WHEN plan.status='completed' THEN 1 ELSE 0 END),0) AS completed
FROM action_plans plan
JOIN cases matter ON matter.id=plan.case_id
JOIN user_profiles profile ON profile.id=matter.owner_user_id
WHERE plan.created_at>=? AND plan.created_at<?
  AND ${excludedUserPredicate}`;

const lawyerRequestSummarySql = `
SELECT count(*) AS created,
  COALESCE(sum(CASE WHEN request.status IN ('accepted','offer_proposed','offer_accepted','completed') THEN 1 ELSE 0 END),0) AS acceptedOrLater,
  COALESCE(sum(CASE WHEN request.status='completed' THEN 1 ELSE 0 END),0) AS completed
FROM lawyer_requests request
JOIN user_profiles profile ON profile.id=request.requester_user_id
WHERE request.created_at>=? AND request.created_at<?
  AND ${excludedUserPredicate}`;

export async function readProductKpiDashboard(input: {
  db: D1Database;
  now?: Date;
}): Promise<ProductKpiDashboard> {
  const now = input.now ?? new Date();
  const asOf = now.toISOString();
  const cohortStartedAt = isoDaysBefore(now, 37);
  const cohortEndedAt = isoDaysBefore(now, 7);
  const workflowStartedAt = isoDaysBefore(now, 30);
  const activationBindings = [cohortStartedAt, cohortEndedAt, asOf] as const;
  const workflowBindings = [workflowStartedAt, asOf, asOf] as const;

  const [summaryResult, durationResult, planResult, lawyerResult] = await input.db.batch([
    input.db.prepare(activationSummarySql).bind(...activationBindings),
    input.db.prepare(activationDurationsSql).bind(...activationBindings),
    input.db.prepare(planSummarySql).bind(...workflowBindings),
    input.db.prepare(lawyerRequestSummarySql).bind(...workflowBindings),
  ]);

  const summary = (summaryResult.results?.[0] ?? {}) as Partial<ActivationSummaryRow>;
  const plan = (planResult.results?.[0] ?? {}) as Partial<PlanSummaryRow>;
  const lawyer = (lawyerResult.results?.[0] ?? {}) as Partial<LawyerRequestSummaryRow>;
  const durations = (durationResult.results ?? [])
    .map((row) => numeric((row as Partial<DurationRow>).durationSeconds))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const eligibleSignups = numeric(summary.eligibleSignups);
  const activatedSignups = numeric(summary.activatedSignups);
  const createdPlans = numeric(plan.created);
  const createdRequests = numeric(lawyer.created);

  return {
    asOf,
    activation: {
      cohortStartedAt,
      cohortEndedAt,
      valueWindowDays: 7,
      eligibleSignups,
      activatedSignups,
      rateBasisPoints: rateBasisPoints(activatedSignups, eligibleSignups),
      readiness: readiness(eligibleSignups),
      privacyMinSample: PRODUCT_KPI_PRIVACY_MIN_SAMPLE,
      comparableMinSample: PRODUCT_KPI_COMPARABLE_MIN_SAMPLE,
      qualifyingUsers: {
        groundedAnswer: numeric(summary.groundedAnswerUsers),
        documentAnalysis: numeric(summary.documentAnalysisUsers),
        caseWithPlan: numeric(summary.casePlanUsers),
      },
      ttfvSeconds: {
        p50: percentile(durations, 0.5),
        p75: percentile(durations, 0.75),
        p95: percentile(durations, 0.95),
      },
    },
    workflows: {
      windowStartedAt: workflowStartedAt,
      windowEndedAt: asOf,
      plans: {
        created: createdPlans,
        completed: numeric(plan.completed),
        completionRateBasisPoints: rateBasisPoints(numeric(plan.completed), createdPlans),
        readiness: readiness(createdPlans),
      },
      lawyerRequests: {
        created: createdRequests,
        acceptedOrLater: numeric(lawyer.acceptedOrLater),
        completed: numeric(lawyer.completed),
        acceptanceRateBasisPoints: rateBasisPoints(numeric(lawyer.acceptedOrLater), createdRequests),
        readiness: readiness(createdRequests),
      },
    },
    privacy: {
      protectedByFreshMfa: true,
      rawIdentifiersReturned: false,
      contentReturned: false,
      excludedCohorts: ["legal_evaluation", "investor_demo", "active_platform_staff"],
    },
  };
}
