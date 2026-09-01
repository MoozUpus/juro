import { sha256 } from "../auth/crypto";
import { applyBasisPoints } from "./money";
import { calculatePricing } from "./pricing";
import {
  BillingDomainError,
  readCheckoutOrder,
  type CheckoutAttemptTransition,
  type CheckoutOrderView,
} from "./checkout-service";

type Actor = Readonly<{ userId: string; workspaceId: string }>;
type Proposal = { id: string; lawyerRequestId: string; lawyerProfileId: string; lawyerUserId: string; lawyerBaseAmountMinor: number; titleRu: string; titleUz: string; acceptanceId: string; agreementVersion: string; agreementSha256: string };
type Policy = { id: string; marketplaceCommissionRateBasisPoints: number; providerCommissionRateBasisPoints: number; providerFeeBearer: "PLATFORM_ABSORBS" | "LAWYER_ABSORBS" | "PLATFORM_AND_LAWYER_PRO_RATA" | "CUSTOM_ALLOCATION" };
type Tax = { id: string; vatRateBasisPoints: number; taxModel: string };

const unique = (error: unknown) => /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error));
const ext = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

async function approvedProposal(db: D1Database, actor: Actor, proposalId: string): Promise<Proposal> {
  const proposal = await db.prepare(`SELECT p.id,p.lawyer_request_id AS lawyerRequestId,p.lawyer_profile_id AS lawyerProfileId,p.lawyer_user_id AS lawyerUserId,p.lawyer_base_amount_minor AS lawyerBaseAmountMinor,p.title_ru AS titleRu,p.title_uz AS titleUz,a.id AS acceptanceId,a.agreement_version AS agreementVersion,a.agreement_sha256 AS agreementSha256
    FROM legal_service_proposals p JOIN proposal_acceptances a ON a.proposal_id=p.id
    WHERE p.id=? AND p.workspace_id=? AND p.client_user_id=? AND p.status='ACCEPTED' AND (p.expires_at IS NULL OR p.expires_at>?) LIMIT 1`)
    .bind(proposalId, actor.workspaceId, actor.userId, new Date().toISOString()).first<Proposal>();
  if (!proposal) throw new BillingDomainError("PROPOSAL_UNAVAILABLE", 404, "Предложение недоступно / Taklif mavjud emas.");
  return proposal;
}

export async function createMarketplaceServiceCheckout(db: D1Database, actor: Actor, input: { proposalId: string; requestId: string }, now = new Date()): Promise<CheckoutOrderView> {
  const key = `checkout:legal-service:${actor.userId}:${input.requestId}`;
  const old = await db.prepare("SELECT id FROM marketplace_orders WHERE workspace_id=? AND idempotency_key=? LIMIT 1").bind(actor.workspaceId, key).first<{ id: string }>();
  if (old) return (await readCheckoutOrder(db, actor, old.id))!;
  const at = now.toISOString(); const proposal = await approvedProposal(db, actor, input.proposalId);
  const [policy, lawyerTax, juroTax] = await Promise.all([
    db.prepare(`SELECT v.id,v.marketplace_commission_rate_basis_points AS marketplaceCommissionRateBasisPoints,v.provider_commission_rate_basis_points AS providerCommissionRateBasisPoints,v.provider_fee_bearer AS providerFeeBearer FROM pricing_policy_versions v JOIN pricing_policies p ON p.id=v.policy_id WHERE p.code='marketplace_service_standard' AND p.status='approved' AND v.approval_status='approved' AND v.effective_from<=? AND (v.effective_to IS NULL OR v.effective_to>?) ORDER BY v.version DESC LIMIT 1`).bind(at, at).first<Policy>(),
    db.prepare(`SELECT id,vat_rate_basis_points AS vatRateBasisPoints,tax_model AS taxModel FROM tax_profiles WHERE subject_type='LAWYER' AND subject_id=? AND service_type='LEGAL_SERVICE' AND approval_status='approved' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY version DESC LIMIT 1`).bind(proposal.lawyerProfileId, at, at).first<Tax>(),
    db.prepare(`SELECT id,vat_rate_basis_points AS vatRateBasisPoints,tax_model AS taxModel FROM tax_profiles WHERE subject_type='PLATFORM' AND subject_id='JURO' AND service_type='MARKETPLACE_SERVICE' AND approval_status='approved' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY version DESC LIMIT 1`).bind(at, at).first<Tax>(),
  ]);
  if (!policy || !lawyerTax || !juroTax || lawyerTax.taxModel === "MANUAL_TAX_POLICY" || juroTax.taxModel === "MANUAL_TAX_POLICY") throw new BillingDomainError("MARKETPLACE_PRICING_UNAVAILABLE", 503, "Расчёт услуги не утверждён / Xizmat hisobi tasdiqlanmagan.");
  if (policy.providerCommissionRateBasisPoints !== 0) throw new BillingDomainError("MARKETPLACE_PROVIDER_FEE_UNSUPPORTED", 503, "Комиссия провайдера требует расчётного провайдера.");
  const juroBase = applyBasisPoints(proposal.lawyerBaseAmountMinor, policy.marketplaceCommissionRateBasisPoints);
  const pricing = calculatePricing({ currency: "UZS", lawyerBaseAmountMinor: proposal.lawyerBaseAmountMinor, lawyerVatRateBasisPoints: lawyerTax.vatRateBasisPoints, juroBaseAmountMinor: juroBase, juroVatRateBasisPoints: juroTax.vatRateBasisPoints, subscriptionCreditMinor: 0, discountAmountMinor: 0, providerCommissionRateBasisPoints: 0, providerFeeBearer: policy.providerFeeBearer, taxPolicyVersionId: juroTax.id, pricingPolicyVersionId: policy.id, calculatedAt: at });
  const orderId = crypto.randomUUID(); const snapshotId = crypto.randomUUID(); const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  try { await db.batch([
    db.prepare("INSERT INTO marketplace_orders (id,external_id,workspace_id,customer_user_id,order_type,status,currency,total_amount_minor,idempotency_key,version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'PRICED','UZS',?,?,?,?,?,?)").bind(orderId, ext("juro_ord"), actor.workspaceId, actor.userId, "LEGAL_SERVICE", pricing.clientTotalMinor, key, 1, expiresAt, at, at),
    db.prepare("INSERT INTO order_items (id,order_id,item_type,reference_type,reference_id,title_ru,title_uz,quantity,unit_amount_minor,base_amount_minor,tax_amount_minor,total_amount_minor,currency,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), orderId, "LEGAL_SERVICE", "legal_service_proposal", proposal.id, proposal.titleRu, proposal.titleUz, 1, proposal.lawyerBaseAmountMinor, proposal.lawyerBaseAmountMinor, pricing.lawyerVatAmountMinor + pricing.juroVatAmountMinor, pricing.clientTotalMinor, "UZS", at),
    db.prepare("INSERT INTO pricing_snapshots (id,order_id,version,lawyer_base_amount_minor,lawyer_vat_amount_minor,lawyer_gross_amount_minor,juro_base_amount_minor,juro_vat_amount_minor,juro_gross_amount_minor,subscription_credit_minor,discount_amount_minor,provider_commission_rate_basis_points,provider_commission_base_minor,provider_commission_amount_minor,provider_commission_allocation_json,client_total_minor,expected_provider_settlement_minor,lawyer_expected_payout_minor,juro_expected_revenue_minor,currency,tax_policy_version_id,pricing_policy_version_id,calculation_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(snapshotId,orderId,1,pricing.lawyerBaseAmountMinor,pricing.lawyerVatAmountMinor,pricing.lawyerGrossAmountMinor,pricing.juroBaseAmountMinor,pricing.juroVatAmountMinor,pricing.juroGrossAmountMinor,0,0,0,pricing.clientTotalMinor,0,"{}",pricing.clientTotalMinor,pricing.expectedProviderSettlementMinor,pricing.lawyerExpectedPayoutMinor,pricing.juroExpectedRevenueMinor,"UZS",juroTax.id,policy.id,await sha256(JSON.stringify(pricing)),at),
    db.prepare("INSERT INTO tax_components (id,pricing_snapshot_id,provider_type,provider_id,tax_profile_id,taxable_base_minor,rate_basis_points,tax_amount_minor,currency,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),snapshotId,"LAWYER",proposal.lawyerProfileId,lawyerTax.id,pricing.lawyerBaseAmountMinor,lawyerTax.vatRateBasisPoints,pricing.lawyerVatAmountMinor,"UZS",at),
    db.prepare("INSERT INTO tax_components (id,pricing_snapshot_id,provider_type,provider_id,tax_profile_id,taxable_base_minor,rate_basis_points,tax_amount_minor,currency,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),snapshotId,"PLATFORM","JURO",juroTax.id,pricing.juroBaseAmountMinor,juroTax.vatRateBasisPoints,pricing.juroVatAmountMinor,"UZS",at),
    db.prepare("INSERT INTO order_agreements (id,order_id,proposal_id,acceptance_id,agreement_version,agreement_sha256,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,proposal.id,proposal.acceptanceId,proposal.agreementVersion,proposal.agreementSha256,at),
    db.prepare("INSERT INTO order_consents (id,order_id,user_id,workspace_id,type,version,scope_json,granted_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,actor.userId,actor.workspaceId,"marketplace_service_checkout","2026-08-03",JSON.stringify({proposalId:proposal.id,acceptanceId:proposal.acceptanceId,pricingSnapshotId:snapshotId}),at),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'marketplace_order',?,'legal_service_checkout_priced',?,?)").bind(crypto.randomUUID(),actor.workspaceId,actor.userId,orderId,JSON.stringify({proposalId:proposal.id,pricingSnapshotId:snapshotId}),at),
  ]); } catch (error) { if (!unique(error)) throw error; const replay=await db.prepare("SELECT id FROM marketplace_orders WHERE workspace_id=? AND idempotency_key=? LIMIT 1").bind(actor.workspaceId,key).first<{id:string}>(); if(!replay) throw error; return (await readCheckoutOrder(db,actor,replay.id))!; }
  return (await readCheckoutOrder(db, actor, orderId))!;
}

export async function confirmMarketplaceServiceCheckoutTransition(
  db: D1Database,
  actor: Actor,
  orderId: string,
  requestId: string,
  checkoutUrl: string,
  now = new Date(),
): Promise<CheckoutAttemptTransition> {
  const view = await readCheckoutOrder(db, actor, orderId);
  if (!view || view.order.orderType !== "LEGAL_SERVICE" || !view.pricingSnapshot) {
    throw new BillingDomainError("ORDER_UNAVAILABLE", 404, "Заказ недоступен / Buyurtma mavjud emas.");
  }
  const idempotencyKey = `checkout:confirm:${actor.userId}:${requestId}`;
  const existingAttempt = await db.prepare(
    "SELECT id FROM payment_attempts WHERE order_id=? AND idempotency_key=? LIMIT 1",
  ).bind(orderId, idempotencyKey).first<{ id: string }>();
  if (existingAttempt) {
    return {
      checkout: (await readCheckoutOrder(db, actor, orderId))!,
      createdPaymentAttempt: false,
    };
  }
  if (view.order.status !== "PRICED" || view.order.acceptedPricingSnapshotId) {
    throw new BillingDomainError("ORDER_NOT_CONFIRMABLE", 409, "Заказ уже изменился / Buyurtma o‘zgargan.");
  }
  if (typeof view.order.expiresAt === "string" && Date.parse(view.order.expiresAt) <= now.getTime()) {
    throw new BillingDomainError("ORDER_EXPIRED", 409, "Расчёт истёк / Hisob muddati tugagan.");
  }
  const recentAttempts = await db.prepare(`SELECT COUNT(*) AS count FROM payment_attempts a
    JOIN marketplace_orders o ON o.id=a.order_id
    WHERE a.order_id=? AND o.customer_user_id=? AND a.created_at>=?`)
    .bind(orderId, actor.userId, new Date(now.getTime() - 60 * 60_000).toISOString())
    .first<{ count: number }>();
  if (Number(recentAttempts?.count ?? 0) >= 20) {
    throw new BillingDomainError("RATE_LIMITED", 429, "Слишком много попыток оплаты / To‘lov urinishlari juda ko‘p.");
  }
  const at = now.toISOString();
  const attemptId = crypto.randomUUID();
  const providerAttemptId = ext("sandbox_pay");
  let createdPaymentAttempt = true;
  try {
    await db.batch([
      db.prepare("UPDATE marketplace_orders SET accepted_pricing_snapshot_id=?,status='AWAITING_PAYMENT',provider='sandbox',provider_status='created',version=version+1,updated_at=? WHERE id=? AND workspace_id=? AND customer_user_id=? AND status='PRICED' AND accepted_pricing_snapshot_id IS NULL").bind(view.pricingSnapshot.id, at, orderId, actor.workspaceId, actor.userId),
      db.prepare("INSERT INTO payment_attempts (id,external_id,order_id,provider,provider_attempt_id,provider_status,internal_status,amount_minor,currency,idempotency_key,checkout_url,expires_at,version,created_at,updated_at) VALUES (?,?,?,'sandbox',?,'created','client_action_required',?,'UZS',?,?,?,1,?,?)").bind(attemptId, ext("juro_pay"), orderId, providerAttemptId, view.pricingSnapshot.clientTotalMinor, idempotencyKey, checkoutUrl, view.order.expiresAt, at, at),
      db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'marketplace_order',?,'legal_service_checkout_confirmed',?,?)").bind(crypto.randomUUID(), actor.workspaceId, actor.userId, orderId, JSON.stringify({ paymentAttemptId: attemptId }), at),
    ]);
  } catch (error) {
    if (!unique(error)) throw error;
    const replay = await db.prepare(
      "SELECT id FROM payment_attempts WHERE order_id=? AND idempotency_key=? LIMIT 1",
    ).bind(orderId, idempotencyKey).first<{ id: string }>();
    if (!replay) {
      throw new BillingDomainError("ORDER_CONFIRMATION_CONFLICT", 409, "Заказ уже обрабатывается / Buyurtma qayta ishlanmoqda.");
    }
    createdPaymentAttempt = false;
  }
  const confirmed = await readCheckoutOrder(db, actor, orderId);
  if (!confirmed?.paymentAttempt) {
    throw new BillingDomainError("ORDER_CONFIRMATION_CONFLICT", 409, "Заказ уже обрабатывается / Buyurtma qayta ishlanmoqda.");
  }
  return { checkout: confirmed, createdPaymentAttempt };
}

export async function confirmMarketplaceServiceCheckout(
  db: D1Database,
  actor: Actor,
  orderId: string,
  requestId: string,
  checkoutUrl: string,
  now = new Date(),
): Promise<CheckoutOrderView> {
  return (await confirmMarketplaceServiceCheckoutTransition(
    db,
    actor,
    orderId,
    requestId,
    checkoutUrl,
    now,
  )).checkout;
}
