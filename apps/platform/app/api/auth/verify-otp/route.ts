import { normalizeEmail, sha256 } from "../../../../lib/auth/crypto";
import {
  consumeOtpChallenge,
  type OtpChallengeResult,
} from "../../../../lib/auth/otp-challenge";
import {
  identityKeyring,
  mfaErrorResponse,
} from "../../../../lib/auth/mfa-http";
import {
  createLoginMfaChallenge,
  hasActiveMfa,
} from "../../../../lib/auth/mfa-service";
import {
  parseJsonRequest,
  verifyOtpInputSchema,
} from "../../../../lib/auth/input";
import {
  mfaChallengeCookie,
  sessionCookie,
} from "../../../../lib/auth/session";
import {
  createPrimarySessionIfMfaDisabled,
} from "../../../../lib/auth/session-management";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import {
  recordRegistrationAcceptances,
} from "../../../../lib/legal/acceptance";
import { ensureDefaultWorkspace } from "../../../../lib/platform/workspace";

function json(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "private, no-store", pragma: "no-cache" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function otpError(
  result: Exclude<OtpChallengeResult, { status: "verified" }>,
  locale: "ru" | "uz",
): Response {
  const ru = locale === "ru";
  switch (result.status) {
    case "used":
      return json({
        code: "OTP_USED",
        error: ru
          ? "Этот код уже использован. Запросите новый."
          : "Bu kod allaqachon ishlatilgan. Yangi kod so‘rang.",
      }, 400);
    case "replaced":
      return json({
        code: "OTP_REPLACED",
        error: ru
          ? "Код заменён новым. Используйте последнее письмо."
          : "Kod yangisi bilan almashtirilgan. Oxirgi xatdan foydalaning.",
      }, 400);
    case "expired":
      return json({
        code: "OTP_EXPIRED",
        error: ru
          ? "Срок действия кода истёк. Запросите новый."
          : "Kod muddati tugagan. Yangi kod so‘rang.",
      }, 400);
    case "attempts_exceeded":
      return json({
        code: "OTP_ATTEMPTS_EXCEEDED",
        error: ru
          ? "Попытки закончились. Запросите новый код."
          : "Urinishlar tugadi. Yangi kod so‘rang.",
      }, 429);
    case "incorrect":
      return json({
        code: "OTP_INCORRECT",
        error: ru ? "Неверный код." : "Kod noto‘g‘ri.",
      }, 400);
    default:
      return json({
        code: "OTP_INVALID",
        error: ru ? "Код недействителен." : "Kod yaroqsiz.",
      }, 400);
  }
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, verifyOtpInputSchema);
  if (!parsed.ok) {
    const status = parsed.error === "payload_too_large"
      ? 413
      : parsed.error === "invalid_content_type"
        ? 415
        : 400;
    return json({
      code: parsed.error.toLocaleUpperCase(),
      error: "Проверьте формат запроса.",
    }, status);
  }
  const body = parsed.data;
  const email = normalizeEmail(body.email);
  const code = body.code;
  const locale = body.locale;
  const purpose = body.purpose;
  if (purpose === "register" && (!body.acceptTerms || !body.acceptPrivacy || !body.acceptPersonalData)) return json({ error: locale === "ru" ? "Нужно принять обязательные документы." : "Majburiy hujjatlarni qabul qilish kerak." }, 400);

  const db = requireD1();
  const now = new Date().toISOString();
  const emailHash = await sha256(email);
  const verification = await consumeOtpChallenge(db, {
    challengeId: body.challengeId,
    emailHash,
    purpose,
    code,
    now,
  });
  if (verification.status !== "verified") {
    return otpError(verification, locale);
  }

  let user = await db.prepare("SELECT id, onboarding_completed_at AS onboardingCompletedAt FROM user_profiles WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email).first<{ id: string; onboardingCompletedAt: string | null }>();
  if (purpose === "login" && !user) return json({ error: locale === "ru" ? "Не удалось завершить вход." : "Kirishni yakunlab bo‘lmadi." }, 400);
  if (purpose === "register" && user) {
    return json({
      code: "ACCOUNT_EXISTS",
      error: locale === "ru"
        ? "Аккаунт уже существует. Используйте вход."
        : "Hisob allaqachon mavjud. Kirishdan foydalaning.",
    }, 409);
  }
  const accountType = verification.accountType;
  const fullName = [body?.firstName?.trim(), body?.lastName?.trim()].filter(Boolean).join(" ").slice(0, 160) || null;
  if (!user) {
    user = { id: crypto.randomUUID(), onboardingCompletedAt: null };
    await db.prepare("INSERT INTO user_profiles (id,email,full_name,locale,account_type,company_name,onboarding_completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,NULL,?,?)")
      .bind(user.id, email, fullName, locale, accountType, body?.companyName?.trim().slice(0, 180) || null, now, now).run();
  }
  await ensureDefaultWorkspace(user.id);

  if (purpose === "register") {
    await recordRegistrationAcceptances(db, {
      userId: user.id,
      locale,
      otpChallengeId: body.challengeId,
      acceptedMarketing: Boolean(body.marketing),
      acceptedAt: now,
    });
  }
  const redirectTo = purpose === "register" || !user.onboardingCompletedAt
    ? `/onboarding?lang=${locale}`
    : `/${locale}/${accountType}/main`;
  if (await hasActiveMfa(db, user.id)) {
    try {
      const challenge = await createLoginMfaChallenge(
        db,
        identityKeyring(),
        {
          userId: user.id,
          emailHash,
          emailOtpChallengeId: body.challengeId,
          userAgent: request.headers.get("user-agent"),
          now: new Date(now),
        },
      );
      return json({
        ok: true,
        requiresTwoFactor: true,
        expiresInSeconds: 300,
      }, 200, mfaChallengeCookie(challenge.token));
    } catch (error) {
      const response = mfaErrorResponse(error, locale);
      if (response) return response;
      throw error;
    }
  }
  const session = await createPrimarySessionIfMfaDisabled(db, {
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    now: new Date(now),
  });
  if (!session) {
    try {
      const challenge = await createLoginMfaChallenge(
        db,
        identityKeyring(),
        {
          userId: user.id,
          emailHash,
          emailOtpChallengeId: body.challengeId,
          userAgent: request.headers.get("user-agent"),
          now: new Date(now),
        },
      );
      return json({
        ok: true,
        requiresTwoFactor: true,
        expiresInSeconds: 300,
      }, 200, mfaChallengeCookie(challenge.token));
    } catch (error) {
      const response = mfaErrorResponse(error, locale);
      if (response) return response;
      throw error;
    }
  }
  return json({
    ok: true,
    redirectTo,
  }, 200, sessionCookie(session.token));
});
