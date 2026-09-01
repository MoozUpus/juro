import { sha256 } from "../auth/crypto";
import { calculatePricing } from "./pricing";

export class BillingDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BillingDomainError";
  }
}

type WorkspaceActor = Readonly<{ userId: string; workspaceId: string }>;

type PlanVersionRow = {
  id: string;
  planId: string;
  planCode: string;
  nameRu: string;
  nameUz: string;
  billingPeriod: string;
  priceMinor: number;
  currency: string;
};

type PricingPolicyRow = {
  id: string;
  providerCommissionRateBasisPoints: number;
  providerFeeBearer: string;
};

type TaxProfileRow = {
  id: string;
  vatRateBasisPoints: number;
  taxModel: string;
};

export type CheckoutOrderView = Readonly<{
  order: Record<string, unknown>;
  items: readonly Record<string, unknown>[];
  pricingSnapshot: Record<string, unknown> | null;
  invoice: Record<string, unknown> | null;
  paymentAttempt: Record<string, unknown> | null;
}>;

export type CheckoutAttemptTransition = Readonly<{
  checkout: CheckoutOrderView;
  createdPaymentAttempt: boolean;
}>;

function externalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function isUniqueError(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error));
}

export async function readCheckoutOrder(
  db: D1Database,
  actor: WorkspaceActor,
  orderId: string,
): Promise<CheckoutOrderView | null> {
  const [orderResult, itemsResult, snapshotResult, invoiceResult, attemptResult] = await db.batch([
    db.prepare(`SELECT id,external_id AS externalId,order_type AS orderType,status,currency,
      total_amount_minor AS totalAmountMinor,accepted_pricing_snapshot_id AS acceptedPricingSnapshotId,
      provider,provider_status AS providerStatus,expires_at AS expiresAt,settled_at AS settledAt,
      failed_at AS failedAt,created_at AS createdAt,updated_at AS updatedAt
      FROM marketplace_orders WHERE id=? AND workspace_id=? AND customer_user_id=? LIMIT 1`)
      .bind(orderId, actor.workspaceId, actor.userId),
    db.prepare(`SELECT id,item_type AS itemType,reference_type AS referenceType,reference_id AS referenceId,
      title_ru AS titleRu,title_uz AS titleUz,quantity,unit_amount_minor AS unitAmountMinor,
      base_amount_minor AS baseAmountMinor,tax_amount_minor AS taxAmountMinor,
      total_amount_minor AS totalAmountMinor,currency
      FROM order_items WHERE order_id=? ORDER BY created_at,id`).bind(orderId),
    db.prepare(`SELECT id,version,lawyer_base_amount_minor AS lawyerBaseAmountMinor,
      lawyer_vat_amount_minor AS lawyerVatAmountMinor,lawyer_gross_amount_minor AS lawyerGrossAmountMinor,
      juro_base_amount_minor AS juroBaseAmountMinor,juro_vat_amount_minor AS juroVatAmountMinor,
      juro_gross_amount_minor AS juroGrossAmountMinor,subscription_credit_minor AS subscriptionCreditMinor,
      discount_amount_minor AS discountAmountMinor,provider_commission_rate_basis_points AS providerCommissionRateBasisPoints,
      provider_commission_amount_minor AS providerCommissionAmountMinor,client_total_minor AS clientTotalMinor,
      expected_provider_settlement_minor AS expectedProviderSettlementMinor,
      lawyer_expected_payout_minor AS lawyerExpectedPayoutMinor,juro_expected_revenue_minor AS juroExpectedRevenueMinor,
      currency,tax_policy_version_id AS taxPolicyVersionId,pricing_policy_version_id AS pricingPolicyVersionId,created_at AS createdAt
      FROM pricing_snapshots WHERE order_id=? ORDER BY version DESC LIMIT 1`).bind(orderId),
    db.prepare(`SELECT id,external_id AS externalId,invoice_number AS invoiceNumber,status,
      subtotal_minor AS subtotalMinor,tax_amount_minor AS taxAmountMinor,total_amount_minor AS totalAmountMinor,
      currency,due_at AS dueAt,issued_at AS issuedAt,paid_at AS paidAt,voided_at AS voidedAt,
      created_at AS createdAt,updated_at AS updatedAt
      FROM subscription_invoices WHERE order_id=? LIMIT 1`).bind(orderId),
    db.prepare(`SELECT id,external_id AS externalId,provider,provider_attempt_id AS providerAttemptId,
      provider_status AS providerStatus,internal_status AS internalStatus,amount_minor AS amountMinor,
      currency,checkout_url AS checkoutUrl,expires_at AS expiresAt,settled_at AS settledAt,
      failed_at AS failedAt,created_at AS createdAt,updated_at AS updatedAt
      FROM payment_attempts WHERE order_id=? ORDER BY created_at DESC LIMIT 1`).bind(orderId),
  ]);
  const order = orderResult.results[0] as Record<string, unknown> | undefined;
  if (!order) return null;
  return Object.freeze({
    order,
    items: Object.freeze(itemsResult.results as Record<string, unknown>[]),
    pricingSnapshot: (snapshotResult.results[0] as Record<string, unknown> | undefined) ?? null,
    invoice: (invoiceResult.results[0] as Record<string, unknown> | undefined) ?? null,
    paymentAttempt: (attemptResult.results[0] as Record<string, unknown> | undefined) ?? null,
  });
}

export async function createSubscriptionCheckout(
  db: D1Database,
  actor: WorkspaceActor,
  input: Readonly<{ requestId: string; planVersionId: string }>,
  now = new Date(),
): Promise<CheckoutOrderView> {
  const idempotencyKey = `checkout:subscription:${actor.userId}:${input.requestId}`;
  const existing = await db.prepare(
    "SELECT id FROM marketplace_orders WHERE workspace_id=? AND idempotency_key=? LIMIT 1",
  ).bind(actor.workspaceId, idempotencyKey).first<{ id: string }>();
  if (existing) return (await readCheckoutOrder(db, actor, existing.id))!;

  const minuteCutoff = new Date(now.getTime() - 60_000).toISOString();
  const recent = await db.prepare(
    "SELECT COUNT(*) AS count FROM marketplace_orders WHERE customer_user_id=? AND created_at>=?",
  ).bind(actor.userId, minuteCutoff).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 10) {
    throw new BillingDomainError("RATE_LIMITED", 429, "Слишком много попыток оформления / Rasmiylashtirish urinishlari juda ko‘p.");
  }

  const at = now.toISOString();
  const [plan, policy, taxProfile] = await Promise.all([
    db.prepare(`SELECT v.id,v.plan_id AS planId,p.code AS planCode,v.name_ru AS nameRu,v.name_uz AS nameUz,
      v.billing_period AS billingPeriod,v.price_minor AS priceMinor,v.currency
      FROM subscription_plan_versions v JOIN subscription_plans p ON p.id=v.plan_id
      WHERE v.id=? AND p.status='active' AND v.approval_status='approved'
        AND v.effective_from<=? AND (v.effective_to IS NULL OR v.effective_to>?) LIMIT 1`)
      .bind(input.planVersionId, at, at).first<PlanVersionRow>(),
    db.prepare(`SELECT v.id,v.provider_commission_rate_basis_points AS providerCommissionRateBasisPoints,
      v.provider_fee_bearer AS providerFeeBearer
      FROM pricing_policy_versions v JOIN pricing_policies p ON p.id=v.policy_id
      WHERE p.code='subscription_standard' AND p.status='approved' AND v.approval_status='approved'
        AND v.effective_from<=? AND (v.effective_to IS NULL OR v.effective_to>?)
      ORDER BY v.version DESC LIMIT 1`).bind(at, at).first<PricingPolicyRow>(),
    db.prepare(`SELECT id,vat_rate_basis_points AS vatRateBasisPoints,tax_model AS taxModel
      FROM tax_profiles WHERE subject_type='PLATFORM' AND subject_id='JURO' AND service_type='SUBSCRIPTION'
        AND approval_status='approved' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?)
      ORDER BY version DESC LIMIT 1`).bind(at, at).first<TaxProfileRow>(),
  ]);
  if (!plan || plan.currency !== "UZS") throw new BillingDomainError("PLAN_UNAVAILABLE", 404, "Тариф не утверждён / Tarif tasdiqlanmagan.");
  if (!policy) throw new BillingDomainError("PRICING_POLICY_UNAVAILABLE", 503, "Расчёт оплаты не утверждён / To‘lov hisobi tasdiqlanmagan.");
  if (!taxProfile || taxProfile.taxModel === "MANUAL_TAX_POLICY") {
    throw new BillingDomainError("TAX_POLICY_UNAVAILABLE", 503, "Налоговая политика не утверждена / Soliq siyosati tasdiqlanmagan.");
  }
  if (policy.providerCommissionRateBasisPoints !== 0) {
    throw new BillingDomainError("STANDARD_PAYMENT_POLICY_INVALID", 503, "Стандартная оплата ожидает отдельную нулевую provider-комиссию.");
  }

  const pricing = calculatePricing({
    currency: "UZS",
    lawyerBaseAmountMinor: 0,
    lawyerVatRateBasisPoints: 0,
    juroBaseAmountMinor: plan.priceMinor,
    juroVatRateBasisPoints: taxProfile.vatRateBasisPoints,
    subscriptionCreditMinor: 0,
    discountAmountMinor: 0,
    providerCommissionRateBasisPoints: 0,
    providerFeeBearer: "PLATFORM_ABSORBS",
    taxPolicyVersionId: taxProfile.id,
    pricingPolicyVersionId: policy.id,
    calculatedAt: at,
  });
  const calculationHash = await sha256(JSON.stringify(pricing));
  const orderId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();
  const orderExternalId = externalId("juro_ord");
  const invoiceExternalId = externalId("juro_inv");
  const invoiceNumber = `JURO-${now.getUTCFullYear()}-${invoiceExternalId.slice(-12).toUpperCase()}`;
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();

  try {
    await db.batch([
      db.prepare(`INSERT INTO marketplace_orders(
        id,external_id,workspace_id,customer_user_id,order_type,status,currency,total_amount_minor,
        idempotency_key,version,expires_at,created_at,updated_at
      ) VALUES (?,?,?,?,?,'PRICED','UZS',?,?,?,?,?,?)`).bind(
        orderId, orderExternalId, actor.workspaceId, actor.userId, "SUBSCRIPTION",
        pricing.clientTotalMinor, idempotencyKey, 1, expiresAt, at, at,
      ),
      db.prepare(`INSERT INTO order_items(
        id,order_id,item_type,reference_type,reference_id,title_ru,title_uz,quantity,
        unit_amount_minor,base_amount_minor,tax_amount_minor,total_amount_minor,currency,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        itemId, orderId, "SUBSCRIPTION_PERIOD", "subscription_plan_version", plan.id,
        plan.nameRu, plan.nameUz, 1, plan.priceMinor, plan.priceMinor,
        pricing.juroVatAmountMinor, pricing.juroGrossAmountMinor, "UZS", at,
      ),
      db.prepare(`INSERT INTO pricing_snapshots(
        id,order_id,version,lawyer_base_amount_minor,lawyer_vat_amount_minor,lawyer_gross_amount_minor,
        juro_base_amount_minor,juro_vat_amount_minor,juro_gross_amount_minor,subscription_credit_minor,
        discount_amount_minor,provider_commission_rate_basis_points,provider_commission_base_minor,
        provider_commission_amount_minor,provider_commission_allocation_json,client_total_minor,
        expected_provider_settlement_minor,lawyer_expected_payout_minor,juro_expected_revenue_minor,
        currency,tax_policy_version_id,pricing_policy_version_id,calculation_hash,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        snapshotId, orderId, 1, pricing.lawyerBaseAmountMinor, pricing.lawyerVatAmountMinor,
        pricing.lawyerGrossAmountMinor, pricing.juroBaseAmountMinor, pricing.juroVatAmountMinor,
        pricing.juroGrossAmountMinor, pricing.subscriptionCreditMinor, pricing.discountAmountMinor,
        pricing.providerCommissionRateBasisPoints, pricing.providerCommissionBaseMinor,
        pricing.providerCommissionAmountMinor, JSON.stringify({ lawyerMinor: pricing.lawyerCommissionShareMinor, platformMinor: pricing.juroCommissionShareMinor }),
        pricing.clientTotalMinor, pricing.expectedProviderSettlementMinor, pricing.lawyerExpectedPayoutMinor,
        pricing.juroExpectedRevenueMinor, "UZS", taxProfile.id, policy.id, calculationHash, at,
      ),
      db.prepare(`INSERT INTO subscription_invoices(
        id,external_id,order_id,workspace_id,invoice_number,status,subtotal_minor,tax_amount_minor,
        total_amount_minor,currency,due_at,version,created_at,updated_at
      ) VALUES (?,?,?,?,?,'draft',?,?,?,'UZS',?,1,?,?)`).bind(
        invoiceId, invoiceExternalId, orderId, actor.workspaceId, invoiceNumber,
        plan.priceMinor, pricing.juroVatAmountMinor, pricing.clientTotalMinor, expiresAt, at, at,
      ),
      db.prepare(`INSERT INTO workspace_audit_events(
        id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
      ) VALUES (?,?,?,'marketplace_order',?,'checkout_priced',?,?)`).bind(
        crypto.randomUUID(), actor.workspaceId, actor.userId, orderId,
        JSON.stringify({ orderType: "SUBSCRIPTION", planVersionId: plan.id, pricingPolicyVersionId: policy.id, taxProfileId: taxProfile.id }), at,
      ),
    ]);
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const replay = await db.prepare(
      "SELECT id FROM marketplace_orders WHERE workspace_id=? AND idempotency_key=? LIMIT 1",
    ).bind(actor.workspaceId, idempotencyKey).first<{ id: string }>();
    if (!replay) throw error;
    return (await readCheckoutOrder(db, actor, replay.id))!;
  }
  return (await readCheckoutOrder(db, actor, orderId))!;
}

export async function confirmSubscriptionCheckoutTransition(
  db: D1Database,
  actor: WorkspaceActor,
  orderId: string,
  input: Readonly<{ requestId: string; renewalMode: "ONE_TIME" | "AUTO_RENEW"; checkoutUrl: string }>,
  now = new Date(),
): Promise<CheckoutAttemptTransition> {
  const view = await readCheckoutOrder(db, actor, orderId);
  if (!view) throw new BillingDomainError("ORDER_UNAVAILABLE", 404, "Заказ недоступен / Buyurtma mavjud emas.");
  const order = view.order;
  if (order.orderType !== "SUBSCRIPTION" || !view.pricingSnapshot || !view.invoice) {
    throw new BillingDomainError("ORDER_NOT_CONFIRMABLE", 409, "Заказ нельзя подтвердить / Buyurtmani tasdiqlab bo‘lmaydi.");
  }
  const retryAfterFailure = Boolean(
    order.acceptedPricingSnapshotId
    && order.status === "AWAITING_PAYMENT"
    && view.paymentAttempt?.internalStatus === "failed",
  );
  if (order.acceptedPricingSnapshotId && !retryAfterFailure) {
    return { checkout: view, createdPaymentAttempt: false };
  }
  if (!retryAfterFailure && order.status !== "PRICED") throw new BillingDomainError("ORDER_NOT_CONFIRMABLE", 409, "Заказ уже изменился / Buyurtma holati o‘zgargan.");
  if (typeof order.expiresAt === "string" && Date.parse(order.expiresAt) <= now.getTime()) {
    throw new BillingDomainError("ORDER_EXPIRED", 409, "Расчёт истёк / Hisob muddati tugagan.");
  }

  const at = now.toISOString();
  const attemptIdempotency = `checkout:confirm:${actor.userId}:${input.requestId}`;
  const existingAttempt = await db.prepare(
    "SELECT id FROM payment_attempts WHERE order_id=? AND idempotency_key=? LIMIT 1",
  ).bind(orderId, attemptIdempotency).first();
  if (existingAttempt) {
    return {
      checkout: (await readCheckoutOrder(db, actor, orderId))!,
      createdPaymentAttempt: false,
    };
  }
  const attemptCutoff = new Date(now.getTime() - 60 * 60_000).toISOString();
  const attemptCount = await db.prepare(`SELECT COUNT(*) AS count FROM payment_attempts a
    JOIN marketplace_orders o ON o.id=a.order_id
    WHERE a.order_id=? AND o.customer_user_id=? AND a.created_at>=?`)
    .bind(orderId, actor.userId, attemptCutoff).first<{ count: number }>();
  if (Number(attemptCount?.count ?? 0) >= 20) {
    throw new BillingDomainError("RATE_LIMITED", 429, "Слишком много попыток оплаты / To‘lov urinishlari juda ko‘p.");
  }
  const attemptId = crypto.randomUUID();
  const providerAttemptId = externalId("sandbox_pay");
  const invoiceId = String(view.invoice.id);
  const snapshotId = String(view.pricingSnapshot.id);
  const totalAmountMinor = Number(view.pricingSnapshot.clientTotalMinor);
  const autoRenew = input.renewalMode === "AUTO_RENEW";
  const consentId = `subscription-renewal:${orderId}`;
  const auditId = `checkout-confirmed:${orderId}`;
  const orderUpdate = retryAfterFailure
    ? db.prepare(`UPDATE marketplace_orders SET provider_status='created',failed_at=NULL,version=version+1,updated_at=?
        WHERE id=? AND workspace_id=? AND customer_user_id=? AND status='AWAITING_PAYMENT' AND accepted_pricing_snapshot_id=?`)
      .bind(at, orderId, actor.workspaceId, actor.userId, snapshotId)
    : db.prepare(`UPDATE marketplace_orders SET accepted_pricing_snapshot_id=?,total_amount_minor=?,
        status='AWAITING_PAYMENT',provider='sandbox',provider_status='created',version=version+1,updated_at=?
        WHERE id=? AND workspace_id=? AND customer_user_id=? AND status='PRICED' AND accepted_pricing_snapshot_id IS NULL`)
      .bind(snapshotId, totalAmountMinor, at, orderId, actor.workspaceId, actor.userId);
  await db.batch([
    orderUpdate,
    db.prepare(`UPDATE subscription_invoices SET status='issued',issued_at=?,updated_at=?
      WHERE id=? AND status='draft'`).bind(at, at, invoiceId),
    db.prepare(`INSERT INTO payment_attempts(
      id,external_id,order_id,provider,provider_attempt_id,provider_status,internal_status,amount_minor,currency,
      idempotency_key,checkout_url,expires_at,version,created_at,updated_at
    ) VALUES (?,?,?,'sandbox',?,'created','client_action_required',?,'UZS',?,?,?,1,?,?)`).bind(
      attemptId, externalId("juro_pay"), orderId, providerAttemptId, totalAmountMinor, attemptIdempotency,
      input.checkoutUrl, order.expiresAt ?? null, at, at,
    ),
    db.prepare(`INSERT OR IGNORE INTO consents(
      id,user_id,workspace_id,type,version,scope_json,granted_at
    ) VALUES (?,?,?,'subscription_checkout','2026-08-03',?,?)`).bind(
      consentId, actor.userId, actor.workspaceId,
      JSON.stringify({ orderId, pricingSnapshotId: snapshotId, renewalMode: input.renewalMode, autoRenew }), at,
    ),
    db.prepare(`INSERT OR IGNORE INTO workspace_audit_events(
      id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
    ) VALUES (?,?,?,'marketplace_order',?,'checkout_confirmed',?,?)`).bind(
      auditId, actor.workspaceId, actor.userId, orderId,
      JSON.stringify({ pricingSnapshotId: snapshotId, paymentAttemptId: attemptId, renewalMode: input.renewalMode }), at,
    ),
  ]);
  const confirmed = await readCheckoutOrder(db, actor, orderId);
  if (!confirmed?.order.acceptedPricingSnapshotId) {
    throw new BillingDomainError("ORDER_CONFIRMATION_CONFLICT", 409, "Заказ уже обрабатывается / Buyurtma qayta ishlanmoqda.");
  }
  return { checkout: confirmed, createdPaymentAttempt: true };
}

export async function confirmSubscriptionCheckout(
  db: D1Database,
  actor: WorkspaceActor,
  orderId: string,
  input: Readonly<{ requestId: string; renewalMode: "ONE_TIME" | "AUTO_RENEW"; checkoutUrl: string }>,
  now = new Date(),
): Promise<CheckoutOrderView> {
  return (await confirmSubscriptionCheckoutTransition(
    db,
    actor,
    orderId,
    input,
    now,
  )).checkout;
}
