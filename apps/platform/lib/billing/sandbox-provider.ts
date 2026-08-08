import { sandboxPaymentEventSchema } from "./input";

const encoder = new TextEncoder();
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("PAYMENT_SANDBOX_WEBHOOK_SECRET_INVALID");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesFromHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return bytes;
}

export async function signSandboxWebhook(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await hmacKey(secret, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
}

export async function verifySandboxWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  suppliedSignature: string,
  now = new Date(),
): Promise<boolean> {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  const signature = bytesFromHex(suppliedSignature);
  if (!signature) return false;
  const key = await hmacKey(secret, ["verify"]);
  return crypto.subtle.verify("HMAC", key, Uint8Array.from(signature).buffer, encoder.encode(`${timestamp}.${rawBody}`));
}

export function parseSandboxPaymentEvent(rawBody: string) {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return { ok: false as const, code: "INVALID_JSON" };
  }
  const parsed = sandboxPaymentEventSchema.safeParse(value);
  return parsed.success
    ? { ok: true as const, event: parsed.data }
    : { ok: false as const, code: "INVALID_EVENT" };
}
