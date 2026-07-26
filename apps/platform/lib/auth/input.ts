import { z } from "zod";

const emailInput = z.string().trim().min(3).max(254);
const localeInput = z.enum(["ru", "uz"]).default("ru");
const purposeInput = z.enum(["login", "register"]);
const accountTypeInput = z.enum(["individual", "business"]).default(
  "individual",
);

export const requestOtpInputSchema = z.object({
  email: emailInput,
  purpose: purposeInput,
  locale: localeInput,
  accountType: accountTypeInput,
}).strict();

export const verifyOtpInputSchema = z.object({
  challengeId: z.string().uuid(),
  email: emailInput,
  code: z.string().regex(/^\d{6}$/),
  purpose: purposeInput,
  locale: localeInput,
  accountType: z.enum(["individual", "business"]).optional(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  companyName: z.string().max(180).optional(),
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
  acceptPersonalData: z.boolean().optional(),
  marketing: z.boolean().optional(),
}).strict();

const mfaCodeInput = z.string().trim().min(6).max(64);

export const verifyMfaInputSchema = z.object({
  code: mfaCodeInput,
  locale: localeInput,
}).strict();

export const confirmTotpEnrollmentInputSchema = z.object({
  credentialId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  locale: localeInput,
}).strict();

export const manageMfaInputSchema = z.object({
  code: mfaCodeInput,
  locale: localeInput,
}).strict();

export type JsonRequestError =
  | "invalid_content_type"
  | "invalid_json"
  | "invalid_input"
  | "payload_too_large";

export async function parseJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 4_096,
): Promise<
  | { ok: true; data: T }
  | { ok: false; error: JsonRequestError }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase().startsWith("application/json")) {
    return { ok: false, error: "invalid_content_type" };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: "payload_too_large" };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, error: "payload_too_large" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: "invalid_input" };
}
