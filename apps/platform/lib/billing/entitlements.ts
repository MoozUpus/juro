export type WorkspaceEntitlements = {
  planCode: "free" | "individual" | "business" | "legal_team";
  subscriptionStatus: string | null;
  /** Server-enforced answer cycles per user for the current UTC month. */
  aiAnswerCyclesMonthly: number;
  lawyerHandoff: boolean;
  fullDocumentAnalysis: boolean;
  expertDocumentAnalysis: boolean;
  documentComparison: boolean;
};

const AI_ANSWER_CYCLE_LIMITS = {
  free: 20,
  individual: 120,
  business: 300,
  legal_team: 600,
} as const;

type SubscriptionEvidence = {
  planCode: string;
  status: string;
  currentPeriodEndsAt: string | null;
};

const FREE_ENTITLEMENTS: WorkspaceEntitlements = {
  planCode: "free",
  subscriptionStatus: null,
  aiAnswerCyclesMonthly: AI_ANSWER_CYCLE_LIMITS.free,
  lawyerHandoff: false,
  fullDocumentAnalysis: false,
  expertDocumentAnalysis: false,
  documentComparison: false,
};

const PAID_PLAN_CODES = new Set(["individual", "business", "legal_team"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function entitlementsForSubscription(
  subscription: SubscriptionEvidence | null,
  now = new Date(),
): WorkspaceEntitlements {
  const periodEnd = subscription?.currentPeriodEndsAt === null
    ? null
    : Date.parse(subscription?.currentPeriodEndsAt ?? "");

  if (!subscription
    || !PAID_PLAN_CODES.has(subscription.planCode)
    || !ACTIVE_STATUSES.has(subscription.status)
    || (periodEnd !== null
      && (!Number.isFinite(periodEnd)
        || periodEnd <= now.getTime()))) {
    return { ...FREE_ENTITLEMENTS };
  }

  const planCode = subscription.planCode as WorkspaceEntitlements["planCode"];
  return {
    planCode,
    subscriptionStatus: subscription.status,
    aiAnswerCyclesMonthly: AI_ANSWER_CYCLE_LIMITS[planCode],
    lawyerHandoff: true,
    fullDocumentAnalysis: true,
    expertDocumentAnalysis: true,
    documentComparison: true,
  };
}

export async function workspaceEntitlements(
  db: D1Database,
  workspaceId: string,
  now = new Date(),
): Promise<WorkspaceEntitlements> {
  const subscription = await db.prepare(
    "SELECT plan_code AS planCode,status,current_period_ends_at AS currentPeriodEndsAt FROM subscriptions WHERE workspace_id=? LIMIT 1",
  ).bind(workspaceId).first<SubscriptionEvidence>();
  return entitlementsForSubscription(subscription ?? null, now);
}
