import { parseJsonRequest } from "../../../../../lib/auth/input";
import { readCheckoutOrder } from "../../../../../lib/billing/checkout-service";
import { paymentFoundationStatus } from "../../../../../lib/billing/foundation";
import { checkoutOrderParamsSchema, sandboxAuthorizeSchema } from "../../../../../lib/billing/input";
import { finalizeSandboxPayment } from "../../../../../lib/billing/payment-finalization";
import { parseSandboxPaymentEvent, signSandboxWebhook, verifySandboxWebhook } from "../../../../../lib/billing/sandbox-provider";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../../lib/platform/workspace";

type Context = { params: Promise<{ orderId: string }> };
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const env = runtimeEnv();
  const availability = paymentFoundationStatus(env);
  if (!availability.enabled || !availability.sandboxEnabled) return response({ code: "SANDBOX_PAYMENT_DISABLED" }, 404);
  const secret = env.PAYMENT_SANDBOX_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) return response({ code: "SANDBOX_PAYMENT_UNAVAILABLE" }, 503);
  const user = await requireApiUser();
  const parsedInput = await parseJsonRequest(request, sandboxAuthorizeSchema, 1_024);
  if (!parsedInput.ok) return response({ code: "INVALID_INPUT" }, parsedInput.error === "payload_too_large" ? 413 : 400);
  const workspace = parsedInput.data.workspaceId
    ? await workspaceForUserById(user.id, parsedInput.data.workspaceId)
    : await workspaceForUser(user);
  if (!workspace) return response({ code: "ORDER_UNAVAILABLE" }, 404);
  const route = checkoutOrderParamsSchema.safeParse(await context.params);
  if (!route.success) return response({ code: "ORDER_UNAVAILABLE" }, 404);
  const { orderId } = route.data;
  const checkout = await readCheckoutOrder(requireD1(), { userId: user.id, workspaceId: workspace.id }, orderId);
  if (!checkout?.paymentAttempt || checkout.order.status !== "AWAITING_PAYMENT") return response({ code: "ORDER_UNAVAILABLE" }, 404);
  const event = {
    eventId: parsedInput.data.requestId,
    type: parsedInput.data.outcome === "FUNDED" ? "payment.funded" : "payment.failed",
    providerAttemptId: String(checkout.paymentAttempt.providerAttemptId),
    amountMinor: Number(checkout.paymentAttempt.amountMinor),
    currency: "UZS",
    occurredAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(event);
  const timestamp = new Date().toISOString();
  const signature = await signSandboxWebhook(secret, timestamp, rawBody);
  if (!await verifySandboxWebhook(secret, timestamp, rawBody, signature)) return response({ code: "SANDBOX_SIGNATURE_FAILURE" }, 500);
  const parsedEvent = parseSandboxPaymentEvent(rawBody);
  if (!parsedEvent.ok) return response({ code: parsedEvent.code }, 500);
  try {
    const result = await finalizeSandboxPayment(requireD1(), parsedEvent.event, rawBody);
    return response({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_FINALIZATION_FAILED";
    return response({ code, correlationId: crypto.randomUUID() }, code === "PAYMENT_AMOUNT_MISMATCH" ? 409 : 500);
  }
});
