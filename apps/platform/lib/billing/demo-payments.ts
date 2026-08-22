import { calculateDemoFeeBreakdown, type DemoFeeBreakdown, type DemoServiceKind } from "./demo-fees";

export const DEMO_PAYMENT_FLOW_TYPES = [
  "subscription",
  "lawyer_service",
  "uzum_installment",
] as const;

export const DEMO_PAYMENT_ACTIONS = [
  "succeed",
  "fail",
  "cancel",
  "refund",
  "payout",
] as const;

export type DemoPaymentFlowType = typeof DEMO_PAYMENT_FLOW_TYPES[number];
export type DemoPaymentAction = typeof DEMO_PAYMENT_ACTIONS[number];
export type DemoPaymentStatus = "previewed" | "succeeded" | "failed" | "cancelled" | "refunded" | "paid_out";

type Actor = { userId: string; workspaceId: string };

export type DemoPaymentRun = {
  id: string;
  externalId: string;
  flowType: DemoPaymentFlowType;
  provider: "demo";
  isSimulation: 1;
  amountMinor: number;
  currency: "UZS";
  installmentCount: 3 | 6 | 12 | null;
  serviceKind: DemoServiceKind | null;
  paymentMethod: "direct" | "installment" | null;
  legalArea: string | null;
  feePolicyVersionId: string | null;
  caseTransferFeeRuleId: string | null;
  breakdownJson: string | null;
  breakdown: DemoFeeBreakdown | null;
  status: DemoPaymentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

function selectRunSql(extra = "") {
  return `SELECT id,external_id AS externalId,flow_type AS flowType,provider,is_simulation AS isSimulation,
    amount_minor AS amountMinor,currency,installment_count AS installmentCount,service_kind AS serviceKind,
    payment_method AS paymentMethod,legal_area AS legalArea,fee_policy_version_id AS feePolicyVersionId,
    case_transfer_fee_rule_id AS caseTransferFeeRuleId,breakdown_json AS breakdownJson,status,version,
    created_at AS createdAt,updated_at AS updatedAt
    FROM demo_payment_runs WHERE workspace_id=? AND user_id=?${extra}`;
}

function hydrateBreakdown(run: DemoPaymentRun): DemoPaymentRun {
  try {
    return { ...run, breakdown: run.breakdownJson ? JSON.parse(run.breakdownJson) as DemoFeeBreakdown : null };
  } catch {
    return { ...run, breakdown: null };
  }
}

export async function listDemoPaymentRuns(db: D1Database, actor: Actor): Promise<DemoPaymentRun[]> {
  const rows = await db.prepare(`${selectRunSql()} ORDER BY created_at DESC LIMIT 30`)
    .bind(actor.workspaceId, actor.userId).all<DemoPaymentRun>();
  return rows.results.map(hydrateBreakdown);
}

export async function createDemoPaymentRun(
  db: D1Database,
  actor: Actor,
  input: {
    requestId: string;
    flowType: DemoPaymentFlowType;
    amountMinor: number;
    installmentCount?: 3 | 6 | 12;
    serviceKind?: "subscription" | "consultation" | "case_transfer";
    legalArea?: string;
    caseType?: string;
  },
  now = new Date(),
): Promise<DemoPaymentRun> {
  const idempotencyKey = `demo-payment:create:${input.requestId}`;
  const existing = await db.prepare(`${selectRunSql(" AND idempotency_key=?")} LIMIT 1`)
    .bind(actor.workspaceId, actor.userId, idempotencyKey).first<DemoPaymentRun>();
  if (existing) return hydrateBreakdown(existing);

  const id = crypto.randomUUID();
  const externalId = `demo_${crypto.randomUUID().replaceAll("-", "")}`;
  const at = now.toISOString();
  const installmentCount = input.flowType === "uzum_installment"
    ? (input.installmentCount ?? 3)
    : null;
  const serviceKind = input.flowType === "subscription"
    ? "subscription"
    : input.flowType === "uzum_installment"
      ? "case_transfer"
      : (input.serviceKind ?? "consultation");
  const paymentMethod = input.flowType === "uzum_installment" ? "installment" : "direct";
  const breakdown = await calculateDemoFeeBreakdown(db, {
    serviceKind,
    paymentMethod,
    amountMinor: input.amountMinor,
    legalArea: input.legalArea,
    caseType: input.caseType,
    installmentCount: input.installmentCount,
    now,
  });
  await db.batch([
    db.prepare(`INSERT INTO demo_payment_runs(
      id,external_id,workspace_id,user_id,flow_type,provider,is_simulation,amount_minor,currency,
      installment_count,service_kind,payment_method,legal_area,fee_policy_version_id,case_transfer_fee_rule_id,
      lawyer_service_amount_minor,consultation_fee_amount_minor,case_transfer_fee_amount_minor,
      juro_service_markup_minor,client_total_minor,lawyer_payout_minor,breakdown_json,
      status,idempotency_key,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,'demo',1,?,'UZS',?,?,?,?,?,?,?,?,?,?,?,?,?,'previewed',?,1,?,?)`).bind(
      id,
      externalId,
      actor.workspaceId,
      actor.userId,
      input.flowType,
      input.amountMinor,
      installmentCount,
      serviceKind,
      paymentMethod,
      input.legalArea?.trim() || null,
      breakdown.feePolicy.id,
      breakdown.appliedCaseTransferRule?.id ?? null,
      breakdown.lawyerServiceAmountMinor,
      breakdown.consultationFeeAmountMinor,
      breakdown.caseTransferFeeAmountMinor,
      breakdown.juroServiceMarkupMinor,
      breakdown.clientTotalMinor,
      breakdown.lawyerPayoutMinor,
      JSON.stringify(breakdown),
      idempotencyKey,
      at,
      at,
    ),
    db.prepare(`INSERT INTO demo_payment_events(
      id,run_id,ordinal,action,previous_status,status,actor_user_id,created_at
    ) VALUES (?, ?, 1, 'created', NULL, 'previewed', ?, ?)`).bind(
      input.requestId,
      id,
      actor.userId,
      at,
    ),
  ]);
  const created = await db.prepare(`${selectRunSql(" AND id=?")} LIMIT 1`)
    .bind(actor.workspaceId, actor.userId, id).first<DemoPaymentRun>();
  if (!created) throw new Error("DEMO_PAYMENT_CREATE_FAILED");
  return hydrateBreakdown(created);
}

function nextStatus(action: DemoPaymentAction, run: DemoPaymentRun): DemoPaymentStatus | null {
  if (run.status === "previewed") {
    if (action === "succeed") return "succeeded";
    if (action === "fail") return "failed";
    if (action === "cancel") return "cancelled";
  }
  if (run.status === "succeeded" && action === "refund") return "refunded";
  if (run.status === "succeeded" && action === "payout" && run.flowType === "lawyer_service") return "paid_out";
  return null;
}

export async function transitionDemoPaymentRun(
  db: D1Database,
  actor: Actor,
  input: { requestId: string; runId: string; action: DemoPaymentAction },
  now = new Date(),
): Promise<DemoPaymentRun> {
  const current = await db.prepare(`${selectRunSql(" AND id=?")} LIMIT 1`)
    .bind(actor.workspaceId, actor.userId, input.runId).first<DemoPaymentRun>();
  if (!current) throw new Error("DEMO_PAYMENT_UNAVAILABLE");

  const replay = await db.prepare(
    "SELECT id FROM demo_payment_events WHERE id=? AND run_id=? AND actor_user_id=? LIMIT 1",
  ).bind(input.requestId, input.runId, actor.userId).first();
  if (replay) return current;

  const target = nextStatus(input.action, current);
  if (!target) throw new Error("DEMO_PAYMENT_STATE_CONFLICT");
  const at = now.toISOString();
  const results = await db.batch([
    db.prepare(`INSERT INTO demo_payment_events(
      id,run_id,ordinal,action,previous_status,status,actor_user_id,created_at
    ) SELECT ?,r.id,
      (SELECT COALESCE(MAX(e.ordinal),0)+1 FROM demo_payment_events e WHERE e.run_id=r.id),
      ?,r.status,?,?,?
      FROM demo_payment_runs r
      WHERE r.id=? AND r.workspace_id=? AND r.user_id=? AND r.status=?`).bind(
      input.requestId,
      input.action,
      target,
      actor.userId,
      at,
      input.runId,
      actor.workspaceId,
      actor.userId,
      current.status,
    ),
    db.prepare(`UPDATE demo_payment_runs SET status=?,version=version+1,updated_at=?
      WHERE id=? AND workspace_id=? AND user_id=? AND status=?
      AND EXISTS (SELECT 1 FROM demo_payment_events e WHERE e.id=? AND e.run_id=demo_payment_runs.id)`).bind(
      target,
      at,
      input.runId,
      actor.workspaceId,
      actor.userId,
      current.status,
      input.requestId,
    ),
  ]);
  if (Number(results[1]?.meta?.changes ?? 0) !== 1) throw new Error("DEMO_PAYMENT_STATE_CONFLICT");
  const updated = await db.prepare(`${selectRunSql(" AND id=?")} LIMIT 1`)
    .bind(actor.workspaceId, actor.userId, input.runId).first<DemoPaymentRun>();
  if (!updated) throw new Error("DEMO_PAYMENT_UNAVAILABLE");
  return hydrateBreakdown(updated);
}
