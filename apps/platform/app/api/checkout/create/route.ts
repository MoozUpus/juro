import { parseJsonRequest } from "../../../../lib/auth/input";
import { createSubscriptionCheckout, BillingDomainError } from "../../../../lib/billing/checkout-service";
import { paymentFoundationStatus } from "../../../../lib/billing/foundation";
import { checkoutCreateSchema } from "../../../../lib/billing/input";
import { billingErrorMessage } from "../../../../lib/billing/localization";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const availability = paymentFoundationStatus(runtimeEnv());
  if (!availability.enabled) return response({ code: "CHECKOUT_UNAVAILABLE", reason: availability.reason }, 503);
  const parsed = await parseJsonRequest(request, checkoutCreateSchema, 2_048);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const workspace = parsed.data.workspaceId
    ? await workspaceForUserById(user.id, parsed.data.workspaceId)
    : await workspaceForUser(user);
  if (!workspace) return response({ code: "ORDER_UNAVAILABLE" }, 404);
  try {
    const checkout = await createSubscriptionCheckout(requireD1(), { userId: user.id, workspaceId: workspace.id }, parsed.data);
    return response(checkout, 201);
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
