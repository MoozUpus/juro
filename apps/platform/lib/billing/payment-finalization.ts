import { sha256 } from "../auth/crypto";
import { buildCapturedPaymentLedger } from "./ledger";
import { subscriptionEntitlementsConfigSchema, type sandboxPaymentEventSchema } from "./input";
import { finalizeMarketplaceServiceSandboxPayment } from "./marketplace-payment-finalization";
import type { z } from "zod";

type SandboxPaymentEvent = z.infer<typeof sandboxPaymentEventSchema>;

type AttemptRow = {
  attemptId: string;
  paymentId: string | null;
  attemptStatus: string;
  amountMinor: number;
  orderId: string;
  workspaceId: string;
  customerUserId: string;
  orderStatus: string;
  orderType: string;
  snapshotId: string;
  lawyerBaseAmountMinor: number;
  lawyerVatAmountMinor: number;
  lawyerGrossAmountMinor: number;
  juroBaseAmountMinor: number;
  juroVatAmountMinor: number;
  juroGrossAmountMinor: number;
  subscriptionCreditMinor: number;
  discountAmountMinor: number;
  providerCommissionRateBasisPoints: number;
  providerCommissionBaseMinor: number;
  providerCommissionAmountMinor: number;
  clientTotalMinor: number;
  expectedProviderSettlementMinor: number;
  lawyerExpectedPayoutMinor: number;
  juroExpectedRevenueMinor: number;
  taxPolicyVersionId: string;
  pricingPolicyVersionId: string;
  planVersionId: string;
  planCode: string;
  billingPeriod: string;
  entitlementsJson: string;
  consentScopeJson: string;
};

export type PaymentFinalizationResult = Readonly<{
  replay: boolean;
  orderId: string;
  orderStatus: string;
  paymentId: string | null;
}>;

function periodEnd(start: Date, billingPeriod: string): string {
  const end = new Date(start);
  if (billingPeriod === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
  else if (billingPeriod === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else if (billingPeriod === "one_time") end.setUTCMonth(end.getUTCMonth() + 1);
  else throw new Error("SUBSCRIPTION_BILLING_PERIOD_INVALID");
  return end.toISOString();
}

function safeIdPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function finalizeSandboxPayment(
  db: D1Database,
  event: SandboxPaymentEvent,
  rawBody: string,
  now = new Date(),
): Promise<PaymentFinalizationResult> {
  const existingEvent = await db.prepare(
    "SELECT order_id AS orderId,internal_status AS internalStatus FROM payment_provider_events WHERE provider='sandbox' AND provider_event_id=? LIMIT 1",
  ).bind(event.eventId).first<{ orderId: string | null; internalStatus: string }>();
  if (existingEvent) {
    const order = existingEvent.orderId ? await db.prepare("SELECT status FROM marketplace_orders WHERE id=? LIMIT 1").bind(existingEvent.orderId).first<{ status: string }>() : null;
    return Object.freeze({ replay: true, orderId: existingEvent.orderId ?? "", orderStatus: order?.status ?? existingEvent.internalStatus, paymentId: null });
  }

  const orderKind = await db.prepare(`SELECT o.order_type AS orderType FROM payment_attempts a
    JOIN marketplace_orders o ON o.id=a.order_id WHERE a.provider='sandbox' AND a.provider_attempt_id=? LIMIT 1`)
    .bind(event.providerAttemptId).first<{ orderType: string }>();
  if (orderKind?.orderType === "LEGAL_SERVICE") {
    return finalizeMarketplaceServiceSandboxPayment(db, event, rawBody, now);
  }

  const attempt = await db.prepare(`SELECT a.id AS attemptId,a.payment_id AS paymentId,a.internal_status AS attemptStatus,
    a.amount_minor AS amountMinor,o.id AS orderId,o.workspace_id AS workspaceId,o.customer_user_id AS customerUserId,
    o.status AS orderStatus,o.order_type AS orderType,s.id AS snapshotId,
    s.lawyer_base_amount_minor AS lawyerBaseAmountMinor,s.lawyer_vat_amount_minor AS lawyerVatAmountMinor,
    s.lawyer_gross_amount_minor AS lawyerGrossAmountMinor,s.juro_base_amount_minor AS juroBaseAmountMinor,
    s.juro_vat_amount_minor AS juroVatAmountMinor,s.juro_gross_amount_minor AS juroGrossAmountMinor,
    s.subscription_credit_minor AS subscriptionCreditMinor,s.discount_amount_minor AS discountAmountMinor,
    s.provider_commission_rate_basis_points AS providerCommissionRateBasisPoints,
    s.provider_commission_base_minor AS providerCommissionBaseMinor,
    s.provider_commission_amount_minor AS providerCommissionAmountMinor,s.client_total_minor AS clientTotalMinor,
    s.expected_provider_settlement_minor AS expectedProviderSettlementMinor,
    s.lawyer_expected_payout_minor AS lawyerExpectedPayoutMinor,s.juro_expected_revenue_minor AS juroExpectedRevenueMinor,
    s.tax_policy_version_id AS taxPolicyVersionId,s.pricing_policy_version_id AS pricingPolicyVersionId,
    v.id AS planVersionId,p.code AS planCode,v.billing_period AS billingPeriod,v.entitlements_json AS entitlementsJson,
    c.scope_json AS consentScopeJson
    FROM payment_attempts a
    JOIN marketplace_orders o ON o.id=a.order_id
    JOIN pricing_snapshots s ON s.id=o.accepted_pricing_snapshot_id AND s.order_id=o.id
    JOIN order_items i ON i.order_id=o.id AND i.item_type='SUBSCRIPTION_PERIOD'
    JOIN subscription_plan_versions v ON v.id=i.reference_id
    JOIN subscription_plans p ON p.id=v.plan_id
    JOIN consents c ON c.id=('subscription-renewal:' || o.id) AND c.user_id=o.customer_user_id
    WHERE a.provider='sandbox' AND a.provider_attempt_id=? LIMIT 1`)
    .bind(event.providerAttemptId).first<AttemptRow>();
  if (!attempt) throw new Error("PAYMENT_ATTEMPT_UNAVAILABLE");
  if (event.currency !== "UZS" || event.amountMinor !== attempt.amountMinor || event.amountMinor !== attempt.clientTotalMinor) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }
  if (attempt.orderType !== "SUBSCRIPTION") throw new Error("ORDER_TYPE_UNSUPPORTED");
  if (attempt.attemptStatus !== "client_action_required" || attempt.orderStatus !== "AWAITING_PAYMENT") {
    throw new Error("PAYMENT_STATE_CONFLICT");
  }
  const occurredAt = Date.parse(event.occurredAt);
  if (!Number.isFinite(occurredAt) || occurredAt > now.getTime() + 5 * 60_000 || occurredAt < now.getTime() - 24 * 60 * 60_000) {
    throw new Error("PAYMENT_EVENT_TIME_INVALID");
  }

  const at = now.toISOString();
  const payloadSha256 = await sha256(rawBody);
  if (event.type === "payment.failed") {
    try {
      await db.batch([
        db.prepare(`INSERT INTO payment_provider_events(
          id,provider,provider_event_id,event_type,payload_sha256,signature_verified,internal_status,
          order_id,payment_attempt_id,received_at,processed_at
        ) VALUES (?,'sandbox',?,?,?,?,? ,?,?,?,?)`).bind(
          crypto.randomUUID(), event.eventId, event.type, payloadSha256, 1, "processed",
          attempt.orderId, attempt.attemptId, at, at,
        ),
        db.prepare("UPDATE payment_attempts SET provider_status='declined',internal_status='failed',failed_at=?,version=version+1,updated_at=? WHERE id=? AND internal_status='client_action_required'")
          .bind(at, at, attempt.attemptId),
        db.prepare("UPDATE marketplace_orders SET provider_status='declined',failed_at=?,version=version+1,updated_at=? WHERE id=? AND status='AWAITING_PAYMENT'")
          .bind(at, at, attempt.orderId),
        db.prepare(`INSERT INTO workspace_audit_events(
          id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
        ) VALUES (?,?,?,'marketplace_order',?,'sandbox_payment_declined',?,?)`).bind(
          crypto.randomUUID(), attempt.workspaceId, attempt.customerUserId, attempt.orderId,
          JSON.stringify({ eventId: event.eventId, paymentAttemptId: attempt.attemptId }), at,
        ),
      ]);
    } catch (error) {
      if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
      return Object.freeze({ replay: true, orderId: attempt.orderId, orderStatus: attempt.orderStatus, paymentId: attempt.paymentId });
    }
    return Object.freeze({ replay: false, orderId: attempt.orderId, orderStatus: "AWAITING_PAYMENT", paymentId: null });
  }

  const parsedEntitlements = subscriptionEntitlementsConfigSchema.safeParse(JSON.parse(attempt.entitlementsJson));
  if (!parsedEntitlements.success) throw new Error("ENTITLEMENT_CONFIG_INVALID");
  const parsedConsent = (() => {
    try {
      const value = JSON.parse(attempt.consentScopeJson) as { orderId?: unknown; pricingSnapshotId?: unknown; renewalMode?: unknown; autoRenew?: unknown };
      if (value.orderId !== attempt.orderId || value.pricingSnapshotId !== attempt.snapshotId) return null;
      if (value.renewalMode !== "ONE_TIME" && value.renewalMode !== "AUTO_RENEW") return null;
      if (value.autoRenew !== (value.renewalMode === "AUTO_RENEW")) return null;
      return value;
    } catch {
      return null;
    }
  })();
  if (!parsedConsent) throw new Error("SUBSCRIPTION_CONSENT_INVALID");
  const existingSubscription = await db.prepare("SELECT id FROM subscriptions WHERE workspace_id=? LIMIT 1")
    .bind(attempt.workspaceId).first<{ id: string }>();
  const subscriptionId = existingSubscription?.id ?? crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const periodStart = at;
  const periodEndsAt = periodEnd(now, attempt.billingPeriod);
  const pricing = Object.freeze({
    currency: "UZS" as const,
    lawyerBaseAmountMinor: attempt.lawyerBaseAmountMinor,
    lawyerVatAmountMinor: attempt.lawyerVatAmountMinor,
    lawyerGrossAmountMinor: attempt.lawyerGrossAmountMinor,
    juroBaseAmountMinor: attempt.juroBaseAmountMinor,
    juroVatAmountMinor: attempt.juroVatAmountMinor,
    juroGrossAmountMinor: attempt.juroGrossAmountMinor,
    subscriptionCreditMinor: attempt.subscriptionCreditMinor,
    discountAmountMinor: attempt.discountAmountMinor,
    providerCommissionRateBasisPoints: attempt.providerCommissionRateBasisPoints,
    providerCommissionBaseMinor: attempt.providerCommissionBaseMinor,
    providerCommissionAmountMinor: attempt.providerCommissionAmountMinor,
    lawyerCommissionShareMinor: 0,
    juroCommissionShareMinor: 0,
    clientTotalMinor: attempt.clientTotalMinor,
    expectedProviderSettlementMinor: attempt.expectedProviderSettlementMinor,
    lawyerExpectedPayoutMinor: attempt.lawyerExpectedPayoutMinor,
    juroExpectedRevenueMinor: attempt.juroExpectedRevenueMinor,
    taxPolicyVersionId: attempt.taxPolicyVersionId,
    pricingPolicyVersionId: attempt.pricingPolicyVersionId,
    calculatedAt: at,
  });
  const posting = buildCapturedPaymentLedger(pricing, "SUBSCRIPTION_REVENUE");
  const ledgerTransactionId = `ledger:${event.eventId}`;
  const ledgerAccountRows = posting.entries.map((entry) => ({
    id: `ledger:platform:JURO:${entry.accountCode}:UZS`,
    code: entry.accountCode,
  }));
  const uniqueAccounts = [...new Map(ledgerAccountRows.map((row) => [row.id, row])).values()];

  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO payment_provider_events(
      id,provider,provider_event_id,event_type,payload_sha256,signature_verified,internal_status,
      order_id,payment_attempt_id,received_at,processed_at
    ) VALUES (?,'sandbox',?,?,?,?,? ,?,?,?,?)`).bind(
      crypto.randomUUID(), event.eventId, event.type, payloadSha256, 1, "processed",
      attempt.orderId, attempt.attemptId, at, at,
    ),
    db.prepare(`INSERT INTO subscriptions(
      id,workspace_id,provider,provider_customer_id,provider_subscription_id,plan_code,plan_version_id,
      order_id,status,billing_period,auto_renew_consent_at,started_at,current_period_ends_at,
      cancel_at_period_end,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?)
    ON CONFLICT(workspace_id) DO UPDATE SET provider=excluded.provider,
      provider_subscription_id=excluded.provider_subscription_id,plan_code=excluded.plan_code,
      plan_version_id=excluded.plan_version_id,order_id=excluded.order_id,status='active',
      billing_period=excluded.billing_period,started_at=excluded.started_at,
      current_period_ends_at=excluded.current_period_ends_at,cancel_at_period_end=0,
      version=subscriptions.version+1,updated_at=excluded.updated_at`).bind(
      subscriptionId, attempt.workspaceId, "sandbox", null, `sandbox_sub_${attempt.orderId}`,
      attempt.planCode, attempt.planVersionId, attempt.orderId, "active", attempt.billingPeriod,
      parsedConsent.autoRenew ? at : null, at, periodEndsAt, at, at,
    ),
    db.prepare(`INSERT INTO payments(
      id,workspace_id,subscription_id,provider_payment_id,amount_minor,currency,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,'UZS','settled',?,?)`).bind(
      paymentId, attempt.workspaceId, subscriptionId, event.eventId, event.amountMinor, at, at,
    ),
    db.prepare("UPDATE payment_attempts SET payment_id=?,provider_status='funded',internal_status='settled',settled_at=?,version=version+1,updated_at=? WHERE id=? AND internal_status='client_action_required'")
      .bind(paymentId, at, at, attempt.attemptId),
    db.prepare("UPDATE subscription_invoices SET subscription_id=?,status='paid',paid_at=?,updated_at=? WHERE order_id=? AND status='issued'")
      .bind(subscriptionId, at, at, attempt.orderId),
    db.prepare("UPDATE marketplace_orders SET status='ACTIVE',provider_status='funded',settled_at=?,version=version+1,updated_at=? WHERE id=? AND status='AWAITING_PAYMENT'")
      .bind(at, at, attempt.orderId),
    ...uniqueAccounts.map((account) => db.prepare(`INSERT OR IGNORE INTO ledger_accounts(
      id,owner_type,owner_id,code,currency,status,created_at
    ) VALUES (?,'platform','JURO',?,'UZS','active',?)`).bind(account.id, account.code, at)),
    db.prepare(`INSERT INTO ledger_transactions(
      id,external_id,workspace_id,order_id,payment_id,transaction_type,status,idempotency_key,currency,
      debit_total_minor,credit_total_minor,occurred_at,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,'payment_capture','draft',?,'UZS',0,0,?,1,?,?)`).bind(
      ledgerTransactionId, `ledger_ext_${event.eventId}`, attempt.workspaceId, attempt.orderId,
      paymentId, `sandbox:webhook:${event.eventId}`, event.occurredAt, at, at,
    ),
    ...posting.entries.map((entry, index) => db.prepare(`INSERT INTO ledger_entries(
      id,transaction_id,account_id,sequence,side,amount_minor,currency,memo,created_at
    ) VALUES (?,?,?,?,?,?,'UZS',?,?)`).bind(
      `${ledgerTransactionId}:${index + 1}`, ledgerTransactionId,
      `ledger:platform:JURO:${entry.accountCode}:UZS`, index + 1, entry.side,
      entry.amountMinor, entry.memo, at,
    )),
    db.prepare("UPDATE ledger_transactions SET status='posted',debit_total_minor=?,credit_total_minor=?,posted_at=?,version=version+1,updated_at=? WHERE id=? AND status='draft'")
      .bind(posting.debitMinor, posting.creditMinor, at, at, ledgerTransactionId),
    ...parsedEntitlements.data.entitlements.map((entitlement) => db.prepare(`INSERT INTO subscription_entitlements(
      id,subscription_id,entitlement_code,limit_value,unit,period_start,period_end,rollover_allowed,
      metadata_json,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
    ON CONFLICT(subscription_id,entitlement_code,period_start) DO NOTHING`).bind(
      `entitlement:${safeIdPart(subscriptionId)}:${safeIdPart(entitlement.code)}:${periodStart}`,
      subscriptionId, entitlement.code, entitlement.limitValue, entitlement.unit, periodStart,
      periodEndsAt, entitlement.rolloverAllowed ? 1 : 0, JSON.stringify(entitlement.metadata), at, at,
    )),
    db.prepare(`INSERT INTO workspace_audit_events(
      id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
    ) VALUES (?,?,?,'marketplace_order',?,'sandbox_payment_funded',?,?)`).bind(
      crypto.randomUUID(), attempt.workspaceId, attempt.customerUserId, attempt.orderId,
      JSON.stringify({ eventId: event.eventId, paymentAttemptId: attempt.attemptId, paymentId, ledgerTransactionId }), at,
    ),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
    return Object.freeze({ replay: true, orderId: attempt.orderId, orderStatus: attempt.orderStatus, paymentId: attempt.paymentId });
  }
  return Object.freeze({ replay: false, orderId: attempt.orderId, orderStatus: "ACTIVE", paymentId });
}
