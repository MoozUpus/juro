import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { paymentProviderStatus } from "../../../../lib/billing/provider";
import { pricingConfig } from "../../../../config/pricing";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const [subscription, payments] = await db.batch([
    db.prepare(
      `SELECT id,provider,plan_code AS planCode,status,current_period_ends_at AS currentPeriodEndsAt,
        cancel_at_period_end AS cancelAtPeriodEnd,created_at AS createdAt,updated_at AS updatedAt
       FROM subscriptions WHERE workspace_id=? LIMIT 1`,
    ).bind(workspace.id),
    db.prepare(
      `SELECT id,amount_minor AS amountMinor,currency,status,created_at AS createdAt
       FROM payments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30`,
    ).bind(workspace.id),
  ]);
  return response({
    provider: paymentProviderStatus(),
    config: pricingConfig,
    subscription: subscription.results[0] ?? null,
    payments: payments.results,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  await requireApiUser();
  const body = await request.json().catch(() => null) as { planCode?: string } | null;
  if (!pricingConfig.plans.some(plan => plan.code === body?.planCode)) return response({ error: "Неизвестный тариф." }, 400);
  const provider = paymentProviderStatus();
  if (!provider.configured) {
    return response({
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      error: "Оплата не выполнена: платёжный провайдер не подключён. JURO не показывает ложный результат платежа.",
    }, 503);
  }
  return response({ code: "PAYMENT_ADAPTER_REQUIRED", error: "Для выбранного провайдера ещё не настроен checkout adapter." }, 501);
});
