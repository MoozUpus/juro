import { normalizeEmail, sha256 } from "../../../../lib/auth/crypto";
import {
  prepareUserIdentityWrite,
  userIdByEmail,
  userIdentityWriteBindings,
} from "../../../../lib/auth/identity-protection";
import { runtimeIdentityProtection } from "../../../../lib/auth/identity-runtime";
import {
  consumeOtpChallenge,
  type OtpChallengeResult,
} from "../../../../lib/auth/otp-challenge";
import {
  identityKeyring,
  mfaErrorResponse,
  optionalIdentityKeyring,
} from "../../../../lib/auth/mfa-http";
import {
  authRequestSecurityContext,
  prepareAuthRequestSecurityEvidence,
} from "../../../../lib/auth/request-security-evidence";
import {
  prepareDeviceContinuity,
} from "../../../../lib/auth/device-continuity";
import {
  createLoginMfaChallenge,
  hasActiveMfa,
} from "../../../../lib/auth/mfa-service";
import {
  parseJsonRequest,
  verifyOtpInputSchema,
} from "../../../../lib/auth/input";
import {
  deviceContinuityCookie,
  mfaChallengeCookie,
  replacementSessionCookies,
} from "../../../../lib/auth/session";
import {
  createPrimarySessionIfMfaDisabled,
} from "../../../../lib/auth/session-management";
import {
  deviceContinuityTokenFromCookie,
} from "../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import {
  recordRegistrationAcceptances,
} from "../../../../lib/legal/acceptance";
import { ensureDefaultWorkspace } from "../../../../lib/platform/workspace";
import { isPersonalAccountType } from "../../../../lib/platform/routing";
import { lawyerLandingDestination } from "../../../../lib/platform/lawyer-entry-routing";

function json(body: unknown, status = 200, cookies?: string | string[]) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "private, no-store", pragma: "no-cache" });
  for (const cookie of cookies ? (Array.isArray(cookies) ? cookies : [cookies]) : []) {
    headers.append("set-cookie", cookie);
  }
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
    case "locked":
      return json({
        code: "OTP_VERIFICATION_LOCKED",
        retryAfterSeconds: result.retryAfterSeconds,
        error: ru
          ? "Слишком много неверных попыток. Повторите через 15 минут."
          : "Juda ko‘p noto‘g‘ri urinish. 15 daqiqadan keyin qayta urinib ko‘ring.",
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
  const identityContext = runtimeIdentityProtection();
  const now = new Date().toISOString();
  const verification = await consumeOtpChallenge(db, {
    identityContext,
    challengeId: body.challengeId,
    email,
    purpose,
    code,
    now,
  });
  if (verification.status !== "verified") {
    return otpError(verification, locale);
  }
  const emailHash = await sha256(email);

  const existingUserId = await userIdByEmail(db, identityContext, email);
  let user = existingUserId
    ? await db.prepare(
      `SELECT u.id,u.account_type AS accountType,
        u.onboarding_completed_at AS onboardingCompletedAt,
        lp.status AS lawyerProfileStatus,
        lp.marketplace_status AS lawyerMarketplaceStatus
       FROM user_profiles u
       LEFT JOIN lawyer_profiles lp ON lp.user_id=u.id
       WHERE u.id=? LIMIT 1`,
    ).bind(existingUserId).first<{
      id: string;
      accountType: string;
      onboardingCompletedAt: string | null;
      lawyerProfileStatus: string | null;
      lawyerMarketplaceStatus: string | null;
    }>()
    : null;
  // The caller has already proved control of this email with a valid OTP, so
  // this response cannot be used for account enumeration. Returning a clear
  // next step prevents people from repeatedly submitting an already-spent
  // one-time code on the login screen.
  if (purpose === "login" && !user) {
    return json({
      code: "ACCOUNT_NOT_FOUND",
      error: locale === "ru"
        ? "Для этого email ещё нет аккаунта. Выберите «Создать аккаунт» и запросите новый код."
        : "Bu email uchun hali hisob yaratilmagan. «Yaratish»ni tanlang va yangi kod so‘rang.",
    }, 404);
  }
  if (purpose === "register" && user) {
    return json({
      code: "ACCOUNT_EXISTS",
      error: locale === "ru"
        ? "Аккаунт уже существует. Используйте вход."
        : "Hisob allaqachon mavjud. Kirishdan foydalaning.",
    }, 409);
  }
  const accountType = user && isPersonalAccountType(user.accountType)
    ? user.accountType
    : verification.accountType;
  const fullName = [body?.firstName?.trim(), body?.lastName?.trim()].filter(Boolean).join(" ").slice(0, 160) || null;
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      accountType,
      onboardingCompletedAt: null,
      lawyerProfileStatus: null,
      lawyerMarketplaceStatus: null,
    };
    const identity = await prepareUserIdentityWrite(identityContext, {
      userId: user.id,
      email,
      phone: null,
    });
    await db.prepare(
      `INSERT INTO user_profiles (
         id,email,email_ciphertext,email_iv,email_key_version,
         email_lookup_hash,email_lookup_key_version,
         phone,phone_ciphertext,phone_iv,phone_key_version,
         phone_lookup_hash,phone_lookup_key_version,
         full_name,locale,account_type,company_name,
         onboarding_completed_at,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
    ).bind(
      user.id,
      ...userIdentityWriteBindings(identity),
      fullName,
      locale,
      accountType,
      null,
      now,
      now,
    ).run();
  }
  const workspaceId = await ensureDefaultWorkspace(user.id);

  if (purpose === "register") {
    await recordRegistrationAcceptances(db, {
      userId: user.id,
      locale,
      otpChallengeId: body.challengeId,
      acceptedMarketing: Boolean(body.marketing),
      acceptedAt: now,
    });
  }
  const requestHostname = new URL(request.url).hostname;
  const normalizedHostname = requestHostname.toLowerCase();
  const lawyerHost = normalizedHostname === "lawyer.juro.uz";
  const redirectTo = accountType === "lawyer"
    ? lawyerLandingDestination({
        locale,
        accountType,
        onboardingCompleted: Boolean(user.onboardingCompletedAt) && purpose !== "register",
        lawyerProfileStatus: user.lawyerProfileStatus,
        lawyerMarketplaceStatus: user.lawyerMarketplaceStatus,
      }, lawyerHost, requestHostname)
    : purpose === "register" || !user.onboardingCompletedAt
      ? `/${locale}/onboarding`
      : `/${locale}/${accountType}/dashboard`;
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
  const continuityKeyring = optionalIdentityKeyring();
  const securityEvidence = await prepareAuthRequestSecurityEvidence(
    continuityKeyring,
    user.id,
    authRequestSecurityContext(request),
  );
  const deviceContinuity = await prepareDeviceContinuity(
    db,
    continuityKeyring,
    {
      userId: user.id,
      deviceToken: deviceContinuityTokenFromCookie(
        request.headers.get("cookie"),
      ),
      securityEvidence,
      now: new Date(now),
    },
  );
  const session = await createPrimarySessionIfMfaDisabled(db, {
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    securityEvidence,
    deviceContinuity,
    loginSecurityNotification: purpose === "login" && continuityKeyring
      ? {
          keyring: continuityKeyring,
          recipientEmail: email,
          locale,
          workspaceId,
        }
      : null,
    rememberMe: body.rememberMe,
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
  }, 200, [
    ...replacementSessionCookies(session.token, body.rememberMe, requestHostname),
    ...(session.deviceContinuityToken
      ? [deviceContinuityCookie(session.deviceContinuityToken)]
      : []),
  ]);
});
