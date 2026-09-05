import { parseJsonRequest } from "../../../../../lib/auth/input";
import { BillingDomainError, confirmSubscriptionCheckout } from "../../../../../lib/billing/checkout-service";
import { paymentFoundationStatus } from "../../../../../lib/billing/foundation";
import { checkoutConfirmSchema, checkoutOrderParamsSchema } from "../../../../../lib/billing/input";
import { billingErrorMessage } from "../../../../../lib/billing/localization";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../../lib/platform/workspace";

type Context = { params: Promise<{ orderId: string }> };
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const availability = paymentFoundationStatus(runtimeEnv());
  if (!availability.enabled || !availability.sandboxEnabled) return response({ code: "PAYMENT_METHOD_UNAVAILABLE", reason: availability.reason }, 503);
  const parsed = await parseJsonRequest(request, checkoutConfirmSchema, 2_048);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const workspace = parsed.data.workspaceId
    ? await workspaceForUserById(user.id, parsed.data.workspaceId)
    : await workspaceForUser(user);
  if (!workspace) return response({ code: "ORDER_UNAVAILABLE" }, 404);
  const route = checkoutOrderParamsSchema.safeParse(await context.params);
  if (!route.success) return response({ code: "ORDER_UNAVAILABLE" }, 404);
  const { orderId } = route.data;
  const base = parsed.data.accountType === "business" && parsed.data.workspaceId
    ? `/${parsed.data.locale}/business/${encodeURIComponent(parsed.data.workspaceId)}`
    : `/${parsed.data.locale}/${parsed.data.accountType}`;
  const checkoutUrl = `${base}/orders/${orderId}/payment`;
  try {
    const checkout = await confirmSubscriptionCheckout(
      requireD1(),
      { userId: user.id, workspaceId: workspace.id },
      orderId,
      { requestId: parsed.data.requestId, renewalMode: parsed.data.renewalMode, checkoutUrl },
    );
    return response(checkout);
  } catch (error) {
    if (error instanceof BillingDomainError) {
      return response({
        code: error.code,
        error: billingErrorMessage(error.code, parsed.data.locale),
      }, error.status);
    }
    throw error;
  }
});
