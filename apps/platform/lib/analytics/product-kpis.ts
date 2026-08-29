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
  caseCreation: {
    cohortStartedAt: string;
    cohortEndedAt: string;
    conversionWindowDays: 7;
    eligibleSignups: number;
    caseCreatingUsers: number;
    rateBasisPoints: number | null;
    readiness: ProductKpiReadiness;
  };
  engagedReturn: {
    cohortStartedAt: string;
    cohortEndedAt: string;
    activationWindowDays: 7;
    returnWindowDays: 7;
    activatedUsers: number;
    returningUsers: number;
    rateBasisPoints: number | null;
    readiness: ProductKpiReadiness;
  };
  answerFunnel: {
    cohortStartedAt: string;
    cohortEndedAt: string;
    answerWindowDays: 7;
    sourceOpenWindowDays: 7;
    firstQuestionUsers: number;
    answeredUsers: number;
    sourceOpeningUsers: number;
    answerCompletionRateBasisPoints: number | null;
    answerDropOffRateBasisPoints: number | null;
    sourceOpenRateBasisPoints: number | null;
    sourceDropOffRateBasisPoints: number | null;
    answerReadiness: ProductKpiReadiness;
    sourceReadiness: ProductKpiReadiness;
  };
  feedbackQuality: {
    windowStartedAt: string;
    windowEndedAt: string;
    submitted: number;
    helpful: number;
    partial: number;
    reportedErrors: number;
    outdatedReports: number;
    userReportedErrorRateBasisPoints: number | null;
    readiness: ProductKpiReadiness;
  };
  lawyerEscalation: {
    cohortStartedAt: string;
    cohortEndedAt: string;
    conversionWindowDays: 7;
    eligibleOutcomeUsers: number;
    escalatingUsers: number;
    rateBasisPoints: number | null;
    readiness: ProductKpiReadiness;
    firstOutcomeUsers: {
      groundedAnswer: number;
      documentAnalysis: number;
      caseCreated: number;
    };
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
    lawyerMarketplace: {
      cohortStartedAt: string;
      cohortEndedAt: string;
      conversionWindowDays: 7;
      directoryVisitors: number;
      requestingVisitors: number;
      conversionRateBasisPoints: number | null;
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
  caseCreatedUsers: number;
};

type DurationRow = { durationSeconds: number };
type PlanSummaryRow = { created: number; completed: number };
type LawyerRequestSummaryRow = { created: number; acceptedOrLater: number; completed: number };
type EngagedReturnSummaryRow = { activatedUsers: number; returningUsers: number };
type LawyerMarketplaceSummaryRow = { directoryVisitors: number; requestingVisitors: number };
type AnswerFunnelSummaryRow = {
  firstQuestionUsers: number;
  answeredUsers: number;
  sourceOpeningUsers: number;
};
type FeedbackQualitySummaryRow = {
  submitted: number;
  helpful: number;
  partial: number;
  reportedErrors: number;
  outdatedReports: number;
};
type LawyerEscalationSummaryRow = {
  eligibleOutcomeUsers: number;
  escalatingUsers: number;
  groundedAnswerUsers: number;
  documentAnalysisUsers: number;
  caseCreatedUsers: number;
};

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
  (SELECT count(DISTINCT userId) FROM value_events WHERE outcome='case_plan') AS casePlanUsers,
  (SELECT count(DISTINCT eligible.userId)
    FROM eligible
    JOIN cases matter ON matter.owner_user_id=eligible.userId
    WHERE julianday(matter.created_at)>=julianday(eligible.onboardedAt)
      AND julianday(matter.created_at)<=julianday(eligible.onboardedAt)+7
  ) AS caseCreatedUsers`;

const activationDurationsSql = `${activationCtes}
SELECT CAST(round((julianday(firstValueAt)-julianday(onboardedAt))*86400) AS INTEGER) AS durationSeconds
FROM first_values JOIN eligible USING(userId)
ORDER BY durationSeconds`;

const engagedReturnSummarySql = `${activationCtes},
engagement_events AS (
  SELECT conversation.owner_user_id AS userId,message.created_at AS engagedAt
  FROM conversation_messages message
  JOIN conversations conversation ON conversation.id=message.conversation_id
  WHERE message.author_type='user'
  UNION ALL
  SELECT matter.owner_user_id AS userId,matter.created_at AS engagedAt FROM cases matter
  UNION ALL
  SELECT document.owner_user_id AS userId,document.created_at AS engagedAt FROM documents document
  UNION ALL
  SELECT analysis.owner_user_id AS userId,analysis.created_at AS engagedAt FROM document_analyses analysis
  UNION ALL
  SELECT request.requester_user_id AS userId,request.created_at AS engagedAt FROM lawyer_requests request
),
returning_users AS (
  SELECT DISTINCT first.userId
  FROM first_values first
  JOIN engagement_events engagement ON engagement.userId=first.userId
  WHERE date(engagement.engagedAt)>date(first.firstValueAt)
    AND julianday(engagement.engagedAt)<=julianday(first.firstValueAt)+7
)
SELECT
  (SELECT count(*) FROM first_values) AS activatedUsers,
  (SELECT count(*) FROM returning_users) AS returningUsers`;

const answerFunnelSummarySql = `
WITH ranked_questions AS (
  SELECT conversation.owner_user_id AS userId,message.id AS requestMessageId,
    message.created_at AS questionAt,
    row_number() OVER (
      PARTITION BY conversation.owner_user_id
      ORDER BY message.created_at,message.id
    ) AS questionRank
  FROM conversation_messages message
  JOIN conversations conversation ON conversation.id=message.conversation_id
  WHERE message.author_type='user'
),
eligible_questions AS (
  SELECT question.userId,question.requestMessageId,question.questionAt
  FROM ranked_questions question
  JOIN user_profiles profile ON profile.id=question.userId
  WHERE question.questionRank=1
    AND question.questionAt>=? AND question.questionAt<?
    AND ${excludedUserPredicate}
),
ranked_answers AS (
  SELECT eligible.userId,run.response_message_id AS responseMessageId,
    run.completed_at AS answerAt,
    row_number() OVER (
      PARTITION BY eligible.userId
      ORDER BY run.completed_at,run.id
    ) AS answerRank
  FROM eligible_questions eligible
  JOIN ai_runs run ON run.user_id=eligible.userId
    AND run.request_message_id=eligible.requestMessageId
  JOIN conversation_messages response ON response.id=run.response_message_id
    AND response.author_type='assistant'
  WHERE run.status='completed' AND run.completed_at IS NOT NULL
    AND julianday(run.completed_at)>=julianday(eligible.questionAt)
    AND julianday(run.completed_at)<=julianday(eligible.questionAt)+7
    AND json_valid(response.structured_json)=1
    AND json_extract(response.structured_json,'$.responseKind')='answer'
    AND json_extract(response.structured_json,'$.sourceValidationStatus')='validated'
    AND json_array_length(response.structured_json,'$.sources')>0
),
first_answers AS (
  SELECT userId,responseMessageId,answerAt
  FROM ranked_answers
  WHERE answerRank=1
),
source_opening_users AS (
  SELECT DISTINCT answer.userId
  FROM first_answers answer
  JOIN ai_answer_source_opens source_open
    ON source_open.user_id=answer.userId
    AND source_open.response_message_id=answer.responseMessageId
  WHERE julianday(source_open.first_opened_at)>=julianday(answer.answerAt)
    AND julianday(source_open.first_opened_at)<=julianday(answer.answerAt)+7
)
SELECT
  (SELECT count(*) FROM eligible_questions) AS firstQuestionUsers,
  (SELECT count(*) FROM first_answers) AS answeredUsers,
  (SELECT count(*) FROM source_opening_users) AS sourceOpeningUsers`;

const feedbackQualitySummarySql = `
SELECT count(*) AS submitted,
  COALESCE(sum(CASE WHEN feedback.feedback_type='helpful' THEN 1 ELSE 0 END),0) AS helpful,
  COALESCE(sum(CASE WHEN feedback.feedback_type IN ('not_helpful','incomplete','language') THEN 1 ELSE 0 END),0) AS partial,
  COALESCE(sum(CASE WHEN feedback.feedback_type IN ('wrong_norm','broken_link','outdated','unsafe','ignored_facts') THEN 1 ELSE 0 END),0) AS reportedErrors,
  COALESCE(sum(CASE WHEN feedback.feedback_type='outdated' THEN 1 ELSE 0 END),0) AS outdatedReports
FROM ai_feedback feedback
JOIN user_profiles profile ON profile.id=feedback.user_id
WHERE feedback.created_at>=? AND feedback.created_at<?
  AND ${excludedUserPredicate}`;

const lawyerEscalationSummarySql = `
WITH outcome_events AS (
  SELECT run.user_id AS userId,run.completed_at AS outcomeAt,'grounded_answer' AS outcome
  FROM ai_runs run
  JOIN conversation_messages response ON response.id=run.response_message_id
    AND response.author_type='assistant'
  WHERE run.status='completed' AND run.completed_at IS NOT NULL
    AND json_valid(response.structured_json)=1
    AND json_extract(response.structured_json,'$.responseKind')='answer'
    AND json_extract(response.structured_json,'$.sourceValidationStatus')='validated'
    AND json_array_length(response.structured_json,'$.sources')>0
  UNION ALL
  SELECT analysis.owner_user_id AS userId,analysis.updated_at AS outcomeAt,
    'document_analysis' AS outcome
  FROM document_analyses analysis
  WHERE analysis.status='completed'
  UNION ALL
  SELECT matter.owner_user_id AS userId,matter.created_at AS outcomeAt,
    'case_created' AS outcome
  FROM cases matter
),
ranked_outcomes AS (
  SELECT event.userId,event.outcomeAt,event.outcome,
    row_number() OVER (
      PARTITION BY event.userId
      ORDER BY event.outcomeAt,event.outcome
    ) AS outcomeRank
  FROM outcome_events event
),
eligible_outcomes AS (
  SELECT outcome.userId,outcome.outcomeAt,outcome.outcome
  FROM ranked_outcomes outcome
  JOIN user_profiles profile ON profile.id=outcome.userId
  WHERE outcome.outcomeRank=1
    AND outcome.outcomeAt>=? AND outcome.outcomeAt<?
    AND ${excludedUserPredicate}
),
escalating_users AS (
  SELECT DISTINCT outcome.userId
  FROM eligible_outcomes outcome
  JOIN lawyer_requests request ON request.requester_user_id=outcome.userId
  WHERE julianday(request.created_at)>=julianday(outcome.outcomeAt)
    AND julianday(request.created_at)<=julianday(outcome.outcomeAt)+7
)
SELECT
  (SELECT count(*) FROM eligible_outcomes) AS eligibleOutcomeUsers,
  (SELECT count(*) FROM escalating_users) AS escalatingUsers,
  (SELECT count(*) FROM eligible_outcomes WHERE outcome='grounded_answer') AS groundedAnswerUsers,
  (SELECT count(*) FROM eligible_outcomes WHERE outcome='document_analysis') AS documentAnalysisUsers,
  (SELECT count(*) FROM eligible_outcomes WHERE outcome='case_created') AS caseCreatedUsers`;

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

const lawyerMarketplaceSummarySql = `
WITH first_visits AS (
  SELECT user_id AS userId,min(first_viewed_at) AS firstViewedAt
  FROM lawyer_directory_daily_visits
  GROUP BY user_id
),
eligible_visits AS (
  SELECT visit.userId,visit.firstViewedAt
  FROM first_visits visit
  JOIN user_profiles profile ON profile.id=visit.userId
  WHERE visit.firstViewedAt>=? AND visit.firstViewedAt<?
    AND ${excludedUserPredicate}
),
requesting_visitors AS (
  SELECT DISTINCT visit.userId
  FROM eligible_visits visit
  JOIN lawyer_requests request ON request.requester_user_id=visit.userId
  WHERE julianday(request.created_at)>=julianday(visit.firstViewedAt)
    AND julianday(request.created_at)<=julianday(visit.firstViewedAt)+7
)
SELECT
  (SELECT count(*) FROM eligible_visits) AS directoryVisitors,
  (SELECT count(*) FROM requesting_visitors) AS requestingVisitors`;

export async function readProductKpiDashboard(input: {
  db: D1Database;
  now?: Date;
}): Promise<ProductKpiDashboard> {
  const now = input.now ?? new Date();
  const asOf = now.toISOString();
  const cohortStartedAt = isoDaysBefore(now, 37);
  const cohortEndedAt = isoDaysBefore(now, 7);
  const returnCohortStartedAt = isoDaysBefore(now, 44);
  const returnCohortEndedAt = isoDaysBefore(now, 14);
  const answerCohortStartedAt = returnCohortStartedAt;
  const answerCohortEndedAt = returnCohortEndedAt;
  const workflowStartedAt = isoDaysBefore(now, 30);
  const activationBindings = [cohortStartedAt, cohortEndedAt, asOf] as const;
  const returnBindings = [returnCohortStartedAt, returnCohortEndedAt, asOf] as const;
  const answerBindings = [answerCohortStartedAt, answerCohortEndedAt, asOf] as const;
  const workflowBindings = [workflowStartedAt, asOf, asOf] as const;
  const marketplaceBindings = [cohortStartedAt, cohortEndedAt, asOf] as const;

  const [summaryResult, durationResult, returnResult, answerResult, feedbackResult, escalationResult, planResult, lawyerResult, marketplaceResult] = await input.db.batch([
    input.db.prepare(activationSummarySql).bind(...activationBindings),
    input.db.prepare(activationDurationsSql).bind(...activationBindings),
    input.db.prepare(engagedReturnSummarySql).bind(...returnBindings),
    input.db.prepare(answerFunnelSummarySql).bind(...answerBindings),
    input.db.prepare(feedbackQualitySummarySql).bind(...workflowBindings),
    input.db.prepare(lawyerEscalationSummarySql).bind(...marketplaceBindings),
    input.db.prepare(planSummarySql).bind(...workflowBindings),
    input.db.prepare(lawyerRequestSummarySql).bind(...workflowBindings),
    input.db.prepare(lawyerMarketplaceSummarySql).bind(...marketplaceBindings),
  ]);

  const summary = (summaryResult.results?.[0] ?? {}) as Partial<ActivationSummaryRow>;
  const plan = (planResult.results?.[0] ?? {}) as Partial<PlanSummaryRow>;
  const lawyer = (lawyerResult.results?.[0] ?? {}) as Partial<LawyerRequestSummaryRow>;
  const engagedReturn = (returnResult.results?.[0] ?? {}) as Partial<EngagedReturnSummaryRow>;
  const answerFunnel = (answerResult.results?.[0] ?? {}) as Partial<AnswerFunnelSummaryRow>;
  const feedbackQuality = (feedbackResult.results?.[0] ?? {}) as Partial<FeedbackQualitySummaryRow>;
  const lawyerEscalation = (escalationResult.results?.[0] ?? {}) as Partial<LawyerEscalationSummaryRow>;
  const marketplace = (marketplaceResult.results?.[0] ?? {}) as Partial<LawyerMarketplaceSummaryRow>;
  const durations = (durationResult.results ?? [])
    .map((row) => numeric((row as Partial<DurationRow>).durationSeconds))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const eligibleSignups = numeric(summary.eligibleSignups);
  const activatedSignups = numeric(summary.activatedSignups);
  const caseCreatingUsers = numeric(summary.caseCreatedUsers);
  const createdPlans = numeric(plan.created);
  const createdRequests = numeric(lawyer.created);
  const activatedReturnUsers = numeric(engagedReturn.activatedUsers);
  const firstQuestionUsers = numeric(answerFunnel.firstQuestionUsers);
  const answeredUsers = numeric(answerFunnel.answeredUsers);
  const sourceOpeningUsers = numeric(answerFunnel.sourceOpeningUsers);
  const submittedFeedback = numeric(feedbackQuality.submitted);
  const eligibleEscalationUsers = numeric(lawyerEscalation.eligibleOutcomeUsers);
  const directoryVisitors = numeric(marketplace.directoryVisitors);

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
    caseCreation: {
      cohortStartedAt,
      cohortEndedAt,
      conversionWindowDays: 7,
      eligibleSignups,
      caseCreatingUsers,
      rateBasisPoints: rateBasisPoints(caseCreatingUsers, eligibleSignups),
      readiness: readiness(eligibleSignups),
    },
    engagedReturn: {
      cohortStartedAt: returnCohortStartedAt,
      cohortEndedAt: returnCohortEndedAt,
      activationWindowDays: 7,
      returnWindowDays: 7,
      activatedUsers: activatedReturnUsers,
      returningUsers: numeric(engagedReturn.returningUsers),
      rateBasisPoints: rateBasisPoints(numeric(engagedReturn.returningUsers), activatedReturnUsers),
      readiness: readiness(activatedReturnUsers),
    },
    answerFunnel: {
      cohortStartedAt: answerCohortStartedAt,
      cohortEndedAt: answerCohortEndedAt,
      answerWindowDays: 7,
      sourceOpenWindowDays: 7,
      firstQuestionUsers,
      answeredUsers,
      sourceOpeningUsers,
      answerCompletionRateBasisPoints: rateBasisPoints(answeredUsers, firstQuestionUsers),
      answerDropOffRateBasisPoints: rateBasisPoints(firstQuestionUsers - answeredUsers, firstQuestionUsers),
      sourceOpenRateBasisPoints: rateBasisPoints(sourceOpeningUsers, answeredUsers),
      sourceDropOffRateBasisPoints: rateBasisPoints(answeredUsers - sourceOpeningUsers, answeredUsers),
      answerReadiness: readiness(firstQuestionUsers),
      sourceReadiness: readiness(answeredUsers),
    },
    feedbackQuality: {
      windowStartedAt: workflowStartedAt,
      windowEndedAt: asOf,
      submitted: submittedFeedback,
      helpful: numeric(feedbackQuality.helpful),
      partial: numeric(feedbackQuality.partial),
      reportedErrors: numeric(feedbackQuality.reportedErrors),
      outdatedReports: numeric(feedbackQuality.outdatedReports),
      userReportedErrorRateBasisPoints: rateBasisPoints(
        numeric(feedbackQuality.reportedErrors),
        submittedFeedback,
      ),
      readiness: readiness(submittedFeedback),
    },
    lawyerEscalation: {
      cohortStartedAt,
      cohortEndedAt,
      conversionWindowDays: 7,
      eligibleOutcomeUsers: eligibleEscalationUsers,
      escalatingUsers: numeric(lawyerEscalation.escalatingUsers),
      rateBasisPoints: rateBasisPoints(
        numeric(lawyerEscalation.escalatingUsers),
        eligibleEscalationUsers,
      ),
      readiness: readiness(eligibleEscalationUsers),
      firstOutcomeUsers: {
        groundedAnswer: numeric(lawyerEscalation.groundedAnswerUsers),
        documentAnalysis: numeric(lawyerEscalation.documentAnalysisUsers),
        caseCreated: numeric(lawyerEscalation.caseCreatedUsers),
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
      lawyerMarketplace: {
        cohortStartedAt,
        cohortEndedAt,
        conversionWindowDays: 7,
        directoryVisitors,
        requestingVisitors: numeric(marketplace.requestingVisitors),
        conversionRateBasisPoints: rateBasisPoints(numeric(marketplace.requestingVisitors), directoryVisitors),
        readiness: readiness(directoryVisitors),
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
