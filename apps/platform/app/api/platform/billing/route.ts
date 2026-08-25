import { pricingConfig } from "../../../../config/pricing";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { workspaceEntitlements } from "../../../../lib/billing/entitlements";
import { billingPlanSelectionSchema } from "../../../../lib/billing/input";
import { paymentProviderStatus } from "../../../../lib/billing/provider";
import { paymentDemoStatus, paymentFoundationStatus } from "../../../../lib/billing/foundation";
import { listDemoPaymentRuns } from "../../../../lib/billing/demo-payments";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";
import { lawyerTrialView, type LawyerTrialRow } from "../../../../lib/platform/lawyer-trial";
import { trackProductEvent } from "../../../../lib/platform/analytics";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const [records, entitlements] = await Promise.all([
    db.batch([
      db.prepare(
        `SELECT id,provider,plan_code AS planCode,status,current_period_ends_at AS currentPeriodEndsAt,
          cancel_at_period_end AS cancelAtPeriodEnd,created_at AS createdAt,updated_at AS updatedAt
         FROM subscriptions WHERE workspace_id=? LIMIT 1`,
      ).bind(workspace.id),
      db.prepare(
        `SELECT id,amount_minor AS amountMinor,currency,status,created_at AS createdAt
         FROM payments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30`,
      ).bind(workspace.id),
    ]),
    workspaceEntitlements(db, workspace.id),
  ]);
  const [subscription, payments] = records;
  const demo = paymentDemoStatus(runtimeEnv());
  const [trialRow, demoRuns] = await Promise.all([
    db.prepare(
      `SELECT t.id,t.starts_at AS startsAt,t.ends_at AS endsAt,t.status,t.post_expiry_mode AS postExpiryMode
       FROM lawyer_trials t JOIN lawyer_profiles p ON p.id=t.lawyer_profile_id
       WHERE p.user_id=? LIMIT 1`,
    ).bind(user.id).first<LawyerTrialRow>(),
    demo.enabled ? listDemoPaymentRuns(db, { userId: user.id, workspaceId: workspace.id }) : Promise.resolve([]),
  ]);
  return response({
    provider: paymentFoundationStatus(runtimeEnv()),
    demo,
    config: pricingConfig,
    subscription: subscription.results[0] ?? null,
    payments: payments.results,
    demoRuns,
    trial: trialRow ? lawyerTrialView(trialRow) : null,
    entitlements,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  await requireApiUser();
  const parsed = await parseJsonRequest(request, billingPlanSelectionSchema, 1_024);
  if (!parsed.ok) {
    return response({
      code: parsed.error.toUpperCase(),
      error: "Некорректный тариф / Noto‘g‘ri tarif.",
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  if (!pricingConfig.plans.some((plan) => plan.code === parsed.data.planCode)) {
    return response({
      code: "PLAN_UNAVAILABLE",
      error: parsed.data.locale === "ru" ? "Неизвестный тариф." : "Noma’lum tarif.",
    }, 400);
  }

  trackProductEvent({ event: "paid_action_started", surface: "billing", locale: parsed.data.locale });

  const provider = paymentProviderStatus();
  if (!provider.credentialsConfigured) {
    return response({
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      error: parsed.data.locale === "ru"
        ? "Оплата не выполнена: платёжный провайдер не подключён. JURO не показывает ложный результат платежа."
        : "To‘lov bajarilmadi: to‘lov provayderi ulanmagan. JURO soxta muvaffaqiyatni ko‘rsatmaydi.",
    }, 503);
  }
  return response({
    code: "PAYMENT_ADAPTER_REQUIRED",
    error: parsed.data.locale === "ru"
      ? "Для выбранного провайдера ещё не настроен checkout adapter."
      : "Tanlangan provayder uchun checkout adapteri hali sozlanmagan.",
  }, 501);
});
