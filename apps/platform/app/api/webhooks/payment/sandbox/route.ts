import { finalizeSandboxPayment } from "../../../../../lib/billing/payment-finalization";
import { paymentFoundationStatus } from "../../../../../lib/billing/foundation";
import { parseSandboxPaymentEvent, verifySandboxWebhook } from "../../../../../lib/billing/sandbox-provider";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", pragma: "no-cache" } });
}

export async function POST(request: Request) {
  const env = runtimeEnv();
  const availability = paymentFoundationStatus(env);
  if (!availability.enabled || !availability.sandboxEnabled) return response({ code: "SANDBOX_WEBHOOK_DISABLED" }, 404);
  const secret = env.PAYMENT_SANDBOX_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) return response({ code: "SANDBOX_WEBHOOK_UNAVAILABLE" }, 503);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8_192) return response({ code: "PAYLOAD_TOO_LARGE" }, 413);
  const timestamp = request.headers.get("x-juro-payment-timestamp") ?? "";
  const signature = request.headers.get("x-juro-payment-signature") ?? "";
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8_192) return response({ code: "PAYLOAD_TOO_LARGE" }, 413);
  if (!await verifySandboxWebhook(secret, timestamp, rawBody, signature)) {
    return response({ code: "INVALID_WEBHOOK_SIGNATURE" }, 401);
  }
  const parsed = parseSandboxPaymentEvent(rawBody);
  if (!parsed.ok) return response({ code: parsed.code }, 400);
  try {
    const result = await finalizeSandboxPayment(requireD1(), parsed.event, rawBody);
    return response({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
    const status = code === "PAYMENT_ATTEMPT_UNAVAILABLE" ? 404 : code === "PAYMENT_AMOUNT_MISMATCH" ? 409 : 500;
    return response({ code, correlationId: crypto.randomUUID() }, status);
  }
}
