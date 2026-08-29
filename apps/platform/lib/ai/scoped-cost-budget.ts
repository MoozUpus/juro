import { z } from "zod";
import type { ProviderEnvironment } from "./provider-cost-control";

const MAX_COST_MICROUSD = 1_000_000_000_000_000;
const SCOPE_TYPES = ["user", "feature"] as const;
const BUDGET_ACTIONS = ["alert_only", "disable_deep", "block_calls"] as const;

export const AI_COST_FEATURES = [
  "legal_chat",
  "guest_legal_chat",
  "document_analysis",
  "document_indexing",
  "document_search",
] as const;

export type AiCostFeature = (typeof AI_COST_FEATURES)[number];
export type ScopeBudgetType = (typeof SCOPE_TYPES)[number];
export type ScopeBudgetAction = (typeof BUDGET_ACTIONS)[number];
export type ScopeBudgetReason = "cost_limit" | "unpriced_usage";
export type ScopeBudgetPeriod = "daily" | "monthly";

export const scopedCostBudgetPolicyMutationSchema = z.object({
  scopeType: z.enum(SCOPE_TYPES),
  scopeKey: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/u),
  dailyCostLimitMicrousd: z.number().int().min(1).max(MAX_COST_MICROUSD),
  monthlyCostLimitMicrousd: z.number().int().min(1).max(MAX_COST_MICROUSD),
  action: z.enum(BUDGET_ACTIONS),
  enabled: z.boolean().default(true),
  effectiveFrom: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.monthlyCostLimitMicrousd < value.dailyCostLimitMicrousd) {
    context.addIssue({
      code: "custom",
      path: ["monthlyCostLimitMicrousd"],
      message: "MONTHLY_LIMIT_BELOW_DAILY_LIMIT",
    });
  }
  if (
    value.scopeType === "feature"
    && !(AI_COST_FEATURES as readonly string[]).includes(value.scopeKey)
  ) {
    context.addIssue({
      code: "custom",
      path: ["scopeKey"],
      message: "FEATURE_SCOPE_UNSUPPORTED",
    });
  }
});

export class ScopedCostBudgetError extends Error {
  constructor(
    readonly code:
      | "AI_SCOPE_BUDGET_INVALID"
      | "AI_SCOPE_BUDGET_PERSISTENCE_FAILED"
      | "AI_COST_BUDGET_EXHAUSTED"
      | "AI_COST_DEEP_DISABLED",
    readonly scopeType?: ScopeBudgetType,
    readonly scopeKey?: string,
    readonly reason?: ScopeBudgetReason,
  ) {
    super(code);
    this.name = "ScopedCostBudgetError";
  }
}

export type ScopeBudgetPolicyView = {
  id: string;
  environment: ProviderEnvironment;
  scopeType: ScopeBudgetType;
  scopeKey: string;
  dailyCostLimitMicrousd: number;
  monthlyCostLimitMicrousd: number;
  action: ScopeBudgetAction;
  enabled: number;
  effectiveFrom: string;
  createdAt: string;
};

export type ScopeBudgetStatusView = ScopeBudgetPolicyView & {
  usageDay: string;
  usageMonth: string;
  dailyCostMicrousd: number;
  monthlyCostMicrousd: number;
  dailyUnpricedRequests: number;
  monthlyUnpricedRequests: number;
  dailyLimitReached: boolean;
  monthlyLimitReached: boolean;
  pricingIncomplete: boolean;
};

export type ScopeBudgetEventView = {
  id: string;
  policyId: string;
  environment: ProviderEnvironment;
  scopeType: ScopeBudgetType;
  scopeKey: string;
  periodType: ScopeBudgetPeriod;
  periodKey: string;
  reason: ScopeBudgetReason;
  action: ScopeBudgetAction;
  observedValue: number;
  thresholdValue: number | null;
  createdAt: string;
};

export type ScopeBudgetAlertView = {
  id: string;
  policyId: string;
  scopeType: ScopeBudgetType;
  scopeKey: string;
  periodType: ScopeBudgetPeriod;
  periodKey: string;
  reason: ScopeBudgetReason;
  action: ScopeBudgetAction;
  status: "pending" | "sending" | "retrying" | "sent" | "failed";
  attemptCount: number;
  errorCode: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type ScopedCostBudgetDashboard = {
  scopePolicies: ScopeBudgetPolicyView[];
  scopeBudgetStatuses: ScopeBudgetStatusView[];
  scopeBudgetEvents: ScopeBudgetEventView[];
  scopeBudgetAlerts: ScopeBudgetAlertView[];
};

type ScopeSpend = {
  dailyCostMicrousd: number;
  monthlyCostMicrousd: number;
  dailyUnpricedRequests: number;
  monthlyUnpricedRequests: number;
};

function canonicalTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_INVALID");
  return new Date(timestamp).toISOString();
}

function safeFeature(value: string): AiCostFeature {
  if ((AI_COST_FEATURES as readonly string[]).includes(value)) return value as AiCostFeature;
  throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_INVALID");
}

async function activePolicy(input: {
  db: D1Database;
  environment: ProviderEnvironment;
  scopeType: ScopeBudgetType;
  scopeKey: string;
  now: string;
}): Promise<ScopeBudgetPolicyView | null> {
  return input.db.prepare(
    `SELECT id,environment,scope_type AS scopeType,scope_key AS scopeKey,
      daily_cost_limit_microusd AS dailyCostLimitMicrousd,
      monthly_cost_limit_microusd AS monthlyCostLimitMicrousd,action,enabled,
      effective_from AS effectiveFrom,created_at AS createdAt
     FROM ai_scope_budget_policy_versions
     WHERE environment=? AND scope_type=? AND scope_key=? AND effective_from<=?
     ORDER BY effective_from DESC,id DESC LIMIT 1`,
  ).bind(
    input.environment,
    input.scopeType,
    input.scopeKey,
    input.now,
  ).first<ScopeBudgetPolicyView>();
}

async function scopeSpend(input: {
  db: D1Database;
  environment: ProviderEnvironment;
  scopeType: ScopeBudgetType;
  scopeKey: string;
  usageDay: string;
  monthStart: string;
}): Promise<ScopeSpend> {
  const scopeColumn = input.scopeType === "user" ? "user_id" : "feature";
  const row = await input.db.prepare(
    `SELECT
      COALESCE(sum(CASE WHEN usage_day=? THEN estimated_cost_microusd ELSE 0 END),0) AS dailyCostMicrousd,
      COALESCE(sum(estimated_cost_microusd),0) AS monthlyCostMicrousd,
      COALESCE(sum(CASE WHEN usage_day=? THEN unpriced_request_count ELSE 0 END),0) AS dailyUnpricedRequests,
      COALESCE(sum(unpriced_request_count),0) AS monthlyUnpricedRequests
     FROM ai_cost_daily_aggregates
     WHERE environment=? AND usage_day>=? AND usage_day<=? AND ${scopeColumn}=?`,
  ).bind(
    input.usageDay,
    input.usageDay,
    input.environment,
    input.monthStart,
    input.usageDay,
    input.scopeKey,
  ).first<ScopeSpend>();
  return {
    dailyCostMicrousd: Number(row?.dailyCostMicrousd ?? 0),
    monthlyCostMicrousd: Number(row?.monthlyCostMicrousd ?? 0),
    dailyUnpricedRequests: Number(row?.dailyUnpricedRequests ?? 0),
    monthlyUnpricedRequests: Number(row?.monthlyUnpricedRequests ?? 0),
  };
}

async function recordScopeBudgetEvent(input: {
  db: D1Database;
  policy: ScopeBudgetPolicyView;
  periodType: ScopeBudgetPeriod;
  periodKey: string;
  reason: ScopeBudgetReason;
  observedValue: number;
  thresholdValue: number | null;
  now: string;
}): Promise<void> {
  const eventId = crypto.randomUUID();
  const alertId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT OR IGNORE INTO ai_scope_budget_events
         (id,policy_id,environment,scope_type,scope_key,period_type,period_key,reason,
          action,observed_value,threshold_value,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        eventId,
        input.policy.id,
        input.policy.environment,
        input.policy.scopeType,
        input.policy.scopeKey,
        input.periodType,
        input.periodKey,
        input.reason,
        input.policy.action,
        input.observedValue,
        input.thresholdValue,
        input.now,
      ),
      input.db.prepare(
        `INSERT INTO ai_scope_budget_alert_jobs
         (id,budget_event_id,policy_id,environment,scope_type,scope_key,period_type,period_key,
          reason,action,observed_value,threshold_value,status,attempt_count,provider_message_id,
          sent_at,error_code,created_at,updated_at)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'pending',0,NULL,NULL,NULL,?,?
         WHERE EXISTS (SELECT 1 FROM ai_scope_budget_events WHERE id=?)`,
      ).bind(
        alertId,
        eventId,
        input.policy.id,
        input.policy.environment,
        input.policy.scopeType,
        input.policy.scopeKey,
        input.periodType,
        input.periodKey,
        input.reason,
        input.policy.action,
        input.observedValue,
        input.thresholdValue,
        input.now,
        input.now,
        eventId,
      ),
      input.db.prepare(
        `INSERT INTO job_outbox
         (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
          correlation_id,enqueued_at,available_at,status,dispatch_attempts,created_at,updated_at)
         SELECT ?,'EMAIL_NOTIFICATIONS_QUEUE','email.send',1,?,?,NULL,?,?,?,'pending',0,?,?
         WHERE EXISTS (SELECT 1 FROM ai_scope_budget_alert_jobs WHERE id=? AND status='pending')`,
      ).bind(
        outboxId,
        `scope_budget_alert_${alertId}`,
        alertId,
        `scope_budget_${eventId}`,
        input.now,
        input.now,
        input.now,
        input.now,
        alertId,
      ),
    ]);
  } catch {
    throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_PERSISTENCE_FAILED");
  }
}

async function activeStatuses(input: {
  db: D1Database;
  environment: ProviderEnvironment;
  feature: AiCostFeature;
  userId: string | null;
  now: string;
  recordAlerts: boolean;
}): Promise<Array<{ status: ScopeBudgetStatusView; reasons: ScopeBudgetReason[] }>> {
  const usageDay = input.now.slice(0, 10);
  const usageMonth = usageDay.slice(0, 7);
  const monthStart = `${usageMonth}-01`;
  const policies = await Promise.all([
    activePolicy({
      db: input.db,
      environment: input.environment,
      scopeType: "feature",
      scopeKey: input.feature,
      now: input.now,
    }),
    input.userId
      ? activePolicy({
        db: input.db,
        environment: input.environment,
        scopeType: "user",
        scopeKey: input.userId,
        now: input.now,
      })
      : Promise.resolve(null),
  ]);
  const enabled = policies.filter((policy): policy is ScopeBudgetPolicyView => policy?.enabled === 1);
  const statuses = await Promise.all(enabled.map(async (policy) => {
    const spend = await scopeSpend({
      db: input.db,
      environment: input.environment,
      scopeType: policy.scopeType,
      scopeKey: policy.scopeKey,
      usageDay,
      monthStart,
    });
    const status: ScopeBudgetStatusView = {
      ...policy,
      usageDay,
      usageMonth,
      ...spend,
      dailyLimitReached: spend.dailyCostMicrousd >= policy.dailyCostLimitMicrousd,
      monthlyLimitReached: spend.monthlyCostMicrousd >= policy.monthlyCostLimitMicrousd,
      pricingIncomplete: spend.monthlyUnpricedRequests > 0,
    };
    const reasons: ScopeBudgetReason[] = [];
    if (status.dailyLimitReached) {
      reasons.push("cost_limit");
      if (input.recordAlerts) await recordScopeBudgetEvent({
        db: input.db,
        policy,
        periodType: "daily",
        periodKey: usageDay,
        reason: "cost_limit",
        observedValue: status.dailyCostMicrousd,
        thresholdValue: policy.dailyCostLimitMicrousd,
        now: input.now,
      });
    }
    if (status.monthlyLimitReached) {
      reasons.push("cost_limit");
      if (input.recordAlerts) await recordScopeBudgetEvent({
        db: input.db,
        policy,
        periodType: "monthly",
        periodKey: usageMonth,
        reason: "cost_limit",
        observedValue: status.monthlyCostMicrousd,
        thresholdValue: policy.monthlyCostLimitMicrousd,
        now: input.now,
      });
    }
    if (status.dailyUnpricedRequests > 0) {
      reasons.push("unpriced_usage");
      if (input.recordAlerts) await recordScopeBudgetEvent({
        db: input.db,
        policy,
        periodType: "daily",
        periodKey: usageDay,
        reason: "unpriced_usage",
        observedValue: status.dailyUnpricedRequests,
        thresholdValue: null,
        now: input.now,
      });
    }
    return { status, reasons: [...new Set(reasons)] };
  }));
  return statuses;
}

export async function evaluateScopedCostBudgets(input: {
  db: D1Database;
  environment: ProviderEnvironment;
  feature: string;
  userId: string | null;
  reasoningMode?: "fast" | "balanced" | "deep" | null;
  now?: string;
  enforce?: boolean;
}): Promise<ScopeBudgetStatusView[]> {
  const feature = safeFeature(input.feature);
  const now = canonicalTimestamp(input.now ?? new Date().toISOString());
  const statuses = await activeStatuses({
    db: input.db,
    environment: input.environment,
    feature,
    userId: input.userId,
    now,
    recordAlerts: true,
  });
  if (input.enforce !== false) {
    // Missing price coverage is an observability failure, not proof that a
    // monetary threshold was reached. Keep its durable alert evidence, but do
    // not silently turn an unknown cost into a budget breach.
    const breached = statuses.filter(({ reasons }) => reasons.includes("cost_limit"));
    const blocked = breached.find(({ status }) => status.action === "block_calls");
    if (blocked) {
      throw new ScopedCostBudgetError(
        "AI_COST_BUDGET_EXHAUSTED",
        blocked.status.scopeType,
        blocked.status.scopeKey,
        "cost_limit",
      );
    }
    const deepDisabled = input.reasoningMode === "deep"
      ? breached.find(({ status }) => status.action === "disable_deep")
      : undefined;
    if (deepDisabled) {
      throw new ScopedCostBudgetError(
        "AI_COST_DEEP_DISABLED",
        deepDisabled.status.scopeType,
        deepDisabled.status.scopeKey,
        "cost_limit",
      );
    }
  }
  return statuses.map(({ status }) => status);
}

export async function createScopedCostBudgetPolicyVersion(input: {
  db: D1Database;
  environment: ProviderEnvironment;
  actorUserId: string;
  value: z.input<typeof scopedCostBudgetPolicyMutationSchema>;
  now?: Date;
}): Promise<{ id: string }> {
  const parsed = scopedCostBudgetPolicyMutationSchema.safeParse(input.value);
  if (!parsed.success) throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_INVALID");
  const value = parsed.data;
  const now = input.now ?? new Date();
  const effectiveFrom = canonicalTimestamp(value.effectiveFrom);
  if (Date.parse(effectiveFrom) > now.getTime() + 366 * 24 * 60 * 60 * 1_000) {
    throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_INVALID");
  }
  if (value.scopeType === "user") {
    const user = await input.db.prepare(
      "SELECT 1 AS found FROM user_profiles WHERE id=? LIMIT 1",
    ).bind(value.scopeKey).first<{ found: number }>();
    if (!user?.found) throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_INVALID");
  }
  const id = crypto.randomUUID();
  try {
    await input.db.prepare(
      `INSERT INTO ai_scope_budget_policy_versions
       (id,environment,scope_type,scope_key,daily_cost_limit_microusd,
        monthly_cost_limit_microusd,action,enabled,effective_from,created_by_user_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      input.environment,
      value.scopeType,
      value.scopeKey,
      value.dailyCostLimitMicrousd,
      value.monthlyCostLimitMicrousd,
      value.action,
      value.enabled ? 1 : 0,
      effectiveFrom,
      input.actorUserId,
      now.toISOString(),
    ).run();
  } catch {
    throw new ScopedCostBudgetError("AI_SCOPE_BUDGET_PERSISTENCE_FAILED");
  }
  return { id };
}

export async function readScopedCostBudgetDashboard(input: {
  db: D1Database;
  environment: ProviderEnvironment;
  now?: Date;
}): Promise<ScopedCostBudgetDashboard> {
  const now = (input.now ?? new Date()).toISOString();
  const [policies, events, alerts] = await Promise.all([
    input.db.prepare(
      `SELECT id,environment,scope_type AS scopeType,scope_key AS scopeKey,
        daily_cost_limit_microusd AS dailyCostLimitMicrousd,
        monthly_cost_limit_microusd AS monthlyCostLimitMicrousd,action,enabled,
        effective_from AS effectiveFrom,created_at AS createdAt
       FROM ai_scope_budget_policy_versions WHERE environment=?
       ORDER BY effective_from DESC,created_at DESC LIMIT 200`,
    ).bind(input.environment).all<ScopeBudgetPolicyView>(),
    input.db.prepare(
      `SELECT id,policy_id AS policyId,environment,scope_type AS scopeType,scope_key AS scopeKey,
        period_type AS periodType,period_key AS periodKey,reason,action,
        observed_value AS observedValue,threshold_value AS thresholdValue,created_at AS createdAt
       FROM ai_scope_budget_events WHERE environment=? ORDER BY created_at DESC LIMIT 200`,
    ).bind(input.environment).all<ScopeBudgetEventView>(),
    input.db.prepare(
      `SELECT id,policy_id AS policyId,scope_type AS scopeType,scope_key AS scopeKey,
        period_type AS periodType,period_key AS periodKey,reason,action,status,
        attempt_count AS attemptCount,error_code AS errorCode,created_at AS createdAt,sent_at AS sentAt
       FROM ai_scope_budget_alert_jobs WHERE environment=? ORDER BY created_at DESC LIMIT 200`,
    ).bind(input.environment).all<ScopeBudgetAlertView>(),
  ]);
  const latest = new Map<string, ScopeBudgetPolicyView>();
  for (const policy of policies.results) {
    const key = `${policy.scopeType}:${policy.scopeKey}`;
    if (!latest.has(key) && policy.effectiveFrom <= now) latest.set(key, policy);
  }
  const active = [...latest.values()].filter((policy) => policy.enabled === 1);
  const usageDay = now.slice(0, 10);
  const usageMonth = usageDay.slice(0, 7);
  const monthStart = `${usageMonth}-01`;
  const scopeBudgetStatuses = await Promise.all(active.map(async (policy) => {
    const spend = await scopeSpend({
      db: input.db,
      environment: input.environment,
      scopeType: policy.scopeType,
      scopeKey: policy.scopeKey,
      usageDay,
      monthStart,
    });
    return {
      ...policy,
      usageDay,
      usageMonth,
      ...spend,
      dailyLimitReached: spend.dailyCostMicrousd >= policy.dailyCostLimitMicrousd,
      monthlyLimitReached: spend.monthlyCostMicrousd >= policy.monthlyCostLimitMicrousd,
      pricingIncomplete: spend.monthlyUnpricedRequests > 0,
    } satisfies ScopeBudgetStatusView;
  }));
  return {
    scopePolicies: policies.results,
    scopeBudgetStatuses,
    scopeBudgetEvents: events.results,
    scopeBudgetAlerts: alerts.results,
  };
}
