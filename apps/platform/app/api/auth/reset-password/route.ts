import { normalizeEmail } from "../../../../lib/auth/crypto";
import {
  userIdByEmail,
  userIdentitySelect,
  type UserIdentityRow,
} from "../../../../lib/auth/identity-protection";
import { runtimeIdentityProtection } from "../../../../lib/auth/identity-runtime";
import { localizedRequestFormatError } from "../../../../lib/auth/request-locale";
import {
  parseJsonRequest,
  resetPasswordInputSchema,
} from "../../../../lib/auth/input";
import {
  consumeOtpChallenge,
  type OtpChallengeResult,
} from "../../../../lib/auth/otp-challenge";
import {
  passwordCredentialWriteStatement,
  passwordLoginFailureClearStatement,
  preparePasswordCredential,
} from "../../../../lib/auth/password";
import { batchWithSecurityEvent } from "../../../../lib/auth/security-events";
import {
  notifyPasswordChangedWithRetry,
  preparePasswordChangedSecurityEmailRetry,
} from "../../../../lib/auth/security-email";
import { assertSafeWrite, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";

type Locale = "ru" | "uz" | "en";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
    },
  });
}

function localized(
  locale: Locale,
  values: { ru: string; uz: string; en: string },
): string {
  return values[locale];
}

function otpError(
  result: Exclude<OtpChallengeResult, { status: "verified" }>,
  locale: Locale,
): Response {
  const messages = {
    used: {
      code: "OTP_USED",
      status: 400,
      ru: "Этот код уже использован. Запросите новый.",
      uz: "Bu kod allaqachon ishlatilgan. Yangi kod so‘rang.",
      en: "This code has already been used. Request a new one.",
    },
    replaced: {
      code: "OTP_REPLACED",
      status: 400,
      ru: "Используйте код из последнего письма.",
      uz: "Oxirgi xatdagi koddan foydalaning.",
      en: "Use the code from the most recent email.",
    },
    expired: {
      code: "OTP_EXPIRED",
      status: 400,
      ru: "Срок действия кода истёк. Запросите новый.",
      uz: "Kod muddati tugagan. Yangi kod so‘rang.",
      en: "The code has expired. Request a new one.",
    },
    attempts_exceeded: {
      code: "OTP_ATTEMPTS_EXCEEDED",
      status: 429,
      ru: "Попытки закончились. Запросите новый код.",
      uz: "Urinishlar tugadi. Yangi kod so‘rang.",
      en: "There are no attempts left. Request a new code.",
    },
    locked: {
      code: "OTP_VERIFICATION_LOCKED",
      status: 429,
      ru: "Слишком много неверных попыток. Повторите позднее.",
      uz: "Noto‘g‘ri urinishlar juda ko‘p. Keyinroq qayta urinib ko‘ring.",
      en: "Too many incorrect attempts. Try again later.",
    },
    incorrect: {
      code: "OTP_INCORRECT",
      status: 400,
      ru: "Неверный код.",
      uz: "Kod noto‘g‘ri.",
      en: "The code is incorrect.",
    },
    invalid: {
      code: "OTP_INVALID",
      status: 400,
      ru: "Код недействителен.",
      uz: "Kod yaroqsiz.",
      en: "The code is invalid.",
    },
  } as const;
  const selected = messages[result.status] ?? messages.invalid;
  return json({
    code: selected.code,
    error: selected[locale],
    ...(result.status === "locked"
      ? { retryAfterSeconds: result.retryAfterSeconds }
      : {}),
  }, selected.status);
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, resetPasswordInputSchema);
  if (!parsed.ok) {
    return json({
      code: parsed.error.toLocaleUpperCase(),
      error: localizedRequestFormatError(request),
    }, parsed.error === "payload_too_large" ? 413 : parsed.error === "invalid_content_type" ? 415 : 400);
  }
  const { challengeId, code, locale, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const db = requireD1();
  const identityContext = runtimeIdentityProtection();
  const verification = await consumeOtpChallenge(db, {
    identityContext,
    challengeId,
    email,
    purpose: "password_reset",
    code,
    now: new Date().toISOString(),
  });
  if (verification.status !== "verified") {
    return otpError(verification, locale);
  }

  const userId = await userIdByEmail(db, identityContext, email);
  const profile = userId
    ? await db.prepare(
      `SELECT u.id,${userIdentitySelect("u")},
        u.email_verified_at AS emailVerifiedAt
       FROM user_profiles u WHERE u.id=? LIMIT 1`,
    ).bind(userId).first<UserIdentityRow & {
      emailVerifiedAt: string | null;
    }>()
    : null;
  // The same success response is returned when no eligible account exists.
  // The requester has proved control of the mailbox, but this still avoids
  // turning password recovery into a general account-discovery endpoint.
  if (profile?.emailVerifiedAt && identityContext.keyring) {
    const now = new Date();
    const timestamp = now.toISOString();
    const credential = await preparePasswordCredential(password, now);
    const unchangedIdentity = {
      selectSql: `SELECT 1 FROM user_profiles
        WHERE id=? AND email IS ? AND email_ciphertext IS ?
          AND email_iv IS ? AND email_key_version IS ?
          AND email_lookup_hash IS ? AND email_lookup_key_version IS ?
          AND email_verified_at IS ?`,
      bindings: [
        profile.id,
        profile.email,
        profile.emailCiphertext,
        profile.emailIv,
        profile.emailKeyVersion,
        profile.emailLookupHash,
        profile.emailLookupKeyVersion,
        profile.emailVerifiedAt,
      ],
    };
    const clearPasswordFailures = await passwordLoginFailureClearStatement(db, {
      email,
      guard: unchangedIdentity,
    });
    const passwordChangedGuard = {
      selectSql: `SELECT 1
        FROM user_password_credentials credential
        JOIN auth_otp_challenges challenge ON challenge.id=?
        WHERE credential.user_id=?
          AND credential.password_changed_at=?
          AND challenge.purpose='password_reset'
          AND challenge.consumed_at IS NOT NULL`,
      bindings: [challengeId, profile.id, timestamp],
    };
    const passwordChangedEmail = await preparePasswordChangedSecurityEmailRetry(
      db,
      {
        keyring: identityContext.keyring,
        userId: profile.id,
        authOtpChallengeId: challengeId,
        email,
        locale,
        requiredGuard: passwordChangedGuard,
        now: timestamp,
      },
    );
    const results = await batchWithSecurityEvent(
      db,
      {
        userId: profile.id,
        eventType: "password.changed",
        severity: "warning",
        authSource: "email_otp",
        assuranceLevel: "primary",
        metadata: { allSessionsRevoked: true, reason: "password_reset" },
        createdAt: timestamp,
      },
      () => [
        passwordCredentialWriteStatement(
          db,
          profile.id,
          credential,
          unchangedIdentity,
        ),
        clearPasswordFailures,
        db.prepare(
          `UPDATE auth_otp_challenges SET invalidated_at=?
           WHERE id<>? AND consumed_at IS NULL AND invalidated_at IS NULL
             AND email_hash=(
               SELECT email_hash FROM auth_otp_challenges WHERE id=?
             )
             AND EXISTS (${unchangedIdentity.selectSql})`,
        ).bind(
          timestamp,
          challengeId,
          challengeId,
          ...unchangedIdentity.bindings,
        ),
        db.prepare(
          `UPDATE auth_sessions SET revoked_at=?
           WHERE user_id=? AND revoked_at IS NULL
             AND EXISTS (${unchangedIdentity.selectSql})`,
        ).bind(timestamp, profile.id, ...unchangedIdentity.bindings),
        db.prepare(
          `UPDATE auth_devices SET revoked_at=?
           WHERE user_id=? AND revoked_at IS NULL
             AND EXISTS (${unchangedIdentity.selectSql})`,
        ).bind(timestamp, profile.id, ...unchangedIdentity.bindings),
        db.prepare(
          `UPDATE auth_device_continuities SET revoked_at=?
           WHERE user_id=? AND revoked_at IS NULL
             AND EXISTS (${unchangedIdentity.selectSql})`,
        ).bind(
          timestamp,
          profile.id,
          ...unchangedIdentity.bindings,
        ),
        db.prepare(
          `UPDATE auth_mfa_challenges SET invalidated_at=?
           WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL
           AND EXISTS (${unchangedIdentity.selectSql})`,
        ).bind(timestamp, profile.id, ...unchangedIdentity.bindings),
        ...passwordChangedEmail.statements,
      ],
      unchangedIdentity,
    );

    const passwordChanged = Number(results[0]?.meta?.changes ?? 0) === 1;
    const env = runtimeEnv();
    if (passwordChanged) {
      try {
        await notifyPasswordChangedWithRetry(db, {
          jobId: passwordChangedEmail.jobId,
          authOtpChallengeId: challengeId,
          email,
          locale,
          now: timestamp,
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM,
        });
      } catch {
        // Notification delivery must not disclose account existence or undo a
        // completed password/session rotation. The encrypted retry and outbox
        // were committed atomically with that rotation before this call.
      }
    }
  }
  return json({
    ok: true,
    message: localized(locale, {
      ru: "Если для этого email есть аккаунт, пароль обновлён. Теперь можно войти с новым паролем.",
      uz: "Agar bu email uchun hisob mavjud bo‘lsa, parol yangilandi. Endi yangi parol bilan kirishingiz mumkin.",
      en: "If an account uses this email, its password has been updated. You can now sign in with the new password.",
    }),
  });
});
