import { z } from "zod";

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "auth_otp";

const siteverifySchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
}).passthrough();

export type TurnstileValidationResult =
  | { status: "verified" }
  | { status: "invalid" }
  | { status: "unavailable" };

export async function validateAuthTurnstile(input: {
  secretKey: string;
  token: string;
  remoteIp: string | null;
  expectedHostname: string;
  fetcher?: typeof fetch;
}): Promise<TurnstileValidationResult> {
  const secretKey = input.secretKey.trim();
  const token = input.token.trim();
  const expectedHostname = input.expectedHostname.trim().toLocaleLowerCase();
  if (
    !secretKey || !token || token.length > 2_048 || !expectedHostname ||
    expectedHostname.length > 253
  ) {
    return { status: "invalid" };
  }

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: input.remoteIp?.trim() || undefined,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { status: "unavailable" };
  }
  if (!response.ok) return { status: "unavailable" };

  let parsed: z.infer<typeof siteverifySchema>;
  try {
    parsed = siteverifySchema.parse(await response.json());
  } catch {
    return { status: "unavailable" };
  }
  if (!parsed.success) return { status: "invalid" };
  if (parsed.action !== TURNSTILE_ACTION) return { status: "invalid" };
  if (parsed.hostname?.toLocaleLowerCase() !== expectedHostname) {
    return { status: "invalid" };
  }
  return { status: "verified" };
}

export const authTurnstileAction = TURNSTILE_ACTION;
