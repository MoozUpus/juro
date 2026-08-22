import { z } from "zod";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_policy"),
    consultationFeePercent: z.literal(1),
    installmentServiceMarkupPercent: z.number().int().min(0).max(100),
    installmentWaivesCaseTransfer: z.literal(true),
    effectiveFrom: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(3).max(2_000),
  }).strict(),
  z.object({
    action: z.literal("create_case_transfer_rule"),
    labelRu: z.string().trim().min(3).max(160),
    labelUz: z.string().trim().min(3).max(160),
    legalArea: z.string().trim().min(2).max(120).optional(),
    caseType: z.string().trim().min(2).max(120).optional(),
    feePercent: z.union([z.literal(2), z.literal(5)]),
    priority: z.number().int().min(0).max(10_000).default(100),
    effectiveFrom: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(3).max(2_000),
  }).strict().refine((value) => Boolean(value.legalArea || value.caseType), { message: "RULE_MATCH_REQUIRED" }),
]);

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function snapshot() {
  const db = requireD1();
  const [policies, rules, events, transactions] = await Promise.all([
    db.prepare(
      `SELECT id,version,mode,consultation_fee_basis_points AS consultationFeeBasisPoints,
        installment_service_markup_basis_points AS installmentServiceMarkupBasisPoints,
        installment_waives_case_transfer AS installmentWaivesCaseTransfer,
        effective_from AS effectiveFrom,effective_to AS effectiveTo,reason,source,created_at AS createdAt
       FROM billing_fee_policy_versions ORDER BY version DESC LIMIT 25`,
    ).all(),
    db.prepare(
      `SELECT id,version,label_ru AS labelRu,label_uz AS labelUz,legal_area AS legalArea,
        case_type AS caseType,fee_basis_points AS feeBasisPoints,priority,
        effective_from AS effectiveFrom,effective_to AS effectiveTo,reason,created_at AS createdAt
       FROM billing_case_transfer_fee_rules ORDER BY priority DESC,version DESC LIMIT 100`,
    ).all(),
    db.prepare(
      `SELECT entity_type AS entityType,entity_id AS entityId,action,reason,actor_user_id AS actorUserId,created_at AS createdAt
       FROM billing_fee_configuration_events ORDER BY created_at DESC,id DESC LIMIT 100`,
    ).all(),
    db.prepare(
      `SELECT run.id,run.external_id AS externalId,demo.account_key AS demoAccountKey,
        run.flow_type AS flowType,run.service_kind AS serviceKind,run.amount_minor AS amountMinor,
        run.consultation_fee_amount_minor AS consultationFeeAmountMinor,
        run.case_transfer_fee_amount_minor AS caseTransferFeeAmountMinor,
        run.client_total_minor AS clientTotalMinor,run.lawyer_payout_minor AS lawyerPayoutMinor,
        run.status,run.provider,run.is_simulation AS isSimulation,run.created_at AS createdAt
       FROM demo_payment_runs run
       LEFT JOIN investor_demo_accounts demo ON demo.user_id=run.user_id AND demo.workspace_id=run.workspace_id
       WHERE run.provider='demo' AND run.is_simulation=1
       ORDER BY run.created_at DESC,run.id DESC LIMIT 100`,
    ).all(),
  ]);
  return { policies: policies.results, rules: rules.results, events: events.results, transactions: transactions.results };
}

async function getBillingFees(request: Request) {
  await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  return response(await snapshot());
}

async function postBillingFees(request: Request) {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const parsed = await parseJsonRequest(request, inputSchema, 4_096);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  if (parsed.data.action === "create_policy") {
    const current = await db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM billing_fee_policy_versions").first<{ version: number }>();
    const version = Number(current?.version ?? 0) + 1;
    const next = {
      version,
      mode: "sandbox",
      consultationFeeBasisPoints: 100,
      installmentServiceMarkupBasisPoints: parsed.data.installmentServiceMarkupPercent * 100,
      installmentWaivesCaseTransfer: true,
      effectiveFrom: parsed.data.effectiveFrom,
    };
    const results = await db.batch([
      db.prepare(
        `INSERT INTO billing_fee_policy_versions
         (id,version,mode,consultation_fee_basis_points,installment_service_markup_basis_points,
          installment_waives_case_transfer,effective_from,effective_to,created_by_user_id,reason,source,created_at)
         VALUES (?,?,'sandbox',100,?,1,?,NULL,?,?,'admin',?)`,
      ).bind(id, version, next.installmentServiceMarkupBasisPoints, parsed.data.effectiveFrom, staff.userId, parsed.data.reason, now),
      db.prepare(
        `INSERT INTO billing_fee_configuration_events
         (id,entity_type,entity_id,action,actor_user_id,reason,previous_snapshot_json,next_snapshot_json,created_at)
         SELECT ?,'fee_policy',?,'created',?,?,NULL,?,?
         WHERE EXISTS (SELECT 1 FROM billing_fee_policy_versions WHERE id=?)`,
      ).bind(crypto.randomUUID(), id, staff.userId, parsed.data.reason, JSON.stringify(next), now, id),
    ]);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "FEE_CONFIG_CONFLICT" }, 409);
  } else {
    const current = await db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM billing_case_transfer_fee_rules").first<{ version: number }>();
    const version = Number(current?.version ?? 0) + 1;
    const next = {
      version,
      labelRu: parsed.data.labelRu,
      labelUz: parsed.data.labelUz,
      legalArea: parsed.data.legalArea ?? null,
      caseType: parsed.data.caseType ?? null,
      feeBasisPoints: parsed.data.feePercent * 100,
      priority: parsed.data.priority,
      effectiveFrom: parsed.data.effectiveFrom,
    };
    const results = await db.batch([
      db.prepare(
        `INSERT INTO billing_case_transfer_fee_rules
         (id,version,label_ru,label_uz,legal_area,case_type,fee_basis_points,priority,
          effective_from,effective_to,created_by_user_id,reason,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,?)`,
      ).bind(id, version, parsed.data.labelRu, parsed.data.labelUz, next.legalArea, next.caseType, next.feeBasisPoints, next.priority, next.effectiveFrom, staff.userId, parsed.data.reason, now),
      db.prepare(
        `INSERT INTO billing_fee_configuration_events
         (id,entity_type,entity_id,action,actor_user_id,reason,previous_snapshot_json,next_snapshot_json,created_at)
         SELECT ?,'case_transfer_rule',?,'created',?,?,NULL,?,?
         WHERE EXISTS (SELECT 1 FROM billing_case_transfer_fee_rules WHERE id=?)`,
      ).bind(crypto.randomUUID(), id, staff.userId, parsed.data.reason, JSON.stringify(next), now, id),
    ]);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "FEE_RULE_CONFLICT" }, 409);
  }
  return response(await snapshot(), 201);
}

export const GET = withPlatformStaffErrors(getBillingFees);
export const POST = withPlatformStaffErrors(postBillingFees);
