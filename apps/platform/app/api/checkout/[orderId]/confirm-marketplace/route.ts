import { parseJsonRequest } from "../../../../../lib/auth/input";
import { confirmMarketplaceServiceCheckoutTransition } from "../../../../../lib/billing/marketplace-service";
import { BillingDomainError } from "../../../../../lib/billing/checkout-service";
import { paymentFoundationStatus } from "../../../../../lib/billing/foundation";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../../lib/platform/workspace";
import { trackProductEvent } from "../../../../../lib/platform/analytics";
import { z } from "zod";
const body = z.object({
  requestId: z.uuid(),
  locale: z.enum(["ru", "uz"]),
  accountType: z.enum(["individual", "entrepreneur", "lawyer", "business"]),
  workspaceId: z.string().optional(),
}).strict();
type Ctx = { params: Promise<{ orderId: string }> };

export const POST = withApiErrors(async (request: Request, context: Ctx) => {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, body, 1_024);
  const { orderId } = await context.params;
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const state = paymentFoundationStatus(runtimeEnv());
  if (!state.enabled || !state.sandboxEnabled) {
    return Response.json({ code: "PAYMENT_METHOD_UNAVAILABLE" }, { status: 503 });
  }
  const workspace = parsed.data.workspaceId
    ? await workspaceForUserById(user.id, parsed.data.workspaceId)
    : await workspaceForUser(user);
  if (!workspace) return Response.json({ code: "ORDER_UNAVAILABLE" }, { status: 404 });
  const base = parsed.data.accountType === "business" && parsed.data.workspaceId
    ? `/${parsed.data.locale}/business/${encodeURIComponent(parsed.data.workspaceId)}`
    : `/${parsed.data.locale}/${parsed.data.accountType}`;
  try {
    const transition = await confirmMarketplaceServiceCheckoutTransition(
      requireD1(),
      { userId: user.id, workspaceId: workspace.id },
      orderId,
      parsed.data.requestId,
      `${base}/orders/${encodeURIComponent(orderId)}/payment`,
    );
    if (transition.createdPaymentAttempt) {
      trackProductEvent({
        event: "paid_action_started",
        surface: "platform",
        locale: parsed.data.locale,
        accountType: workspace.type,
        outcome: "started",
      });
    }
    return Response.json(transition.checkout);
  } catch (error) {
    if (error instanceof BillingDomainError) {
      return Response.json({ code: error.code, error: error.message }, { status: error.status });
    }
    throw error;
  }
});
