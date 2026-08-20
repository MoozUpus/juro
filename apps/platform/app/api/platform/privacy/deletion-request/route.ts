import {
  cancelAccountDeletionRequest,
  confirmAccountDeletion,
  invalidateAccountDeletionChallenge,
  reserveAccountDeletionChallenge,
  retryAccountDeletionRequest,
  type DeletionConfirmationResult,
} from "../../../../../lib/auth/account-deletion";
import {
  RECOVERABLE_DELETION_DELAY_MS,
  accountDeletionSubjectHash,
} from "../../../../../lib/auth/account-deletion-lifecycle";
import { randomOtp, randomToken } from "../../../../../lib/auth/crypto";
import { runtimeIdentityProtection } from "../../../../../lib/auth/identity-runtime";
import {
  accountDeletionInputSchema,
  parseJsonRequest,
} from "../../../../../lib/auth/input";
import {
  jsonNoStore,
  localSessionForRequest,
} from "../../../../../lib/auth/mfa-http";
import { MfaError } from "../../../../../lib/auth/mfa-service";
import { clearSessionCookie } from "../../../../../lib/auth/session";
import { sharedAuthCookieDomain } from "../../../../../lib/auth/session-persistence";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import {
  requireD1,
  runtimeEnv,
} from "../../../../../lib/document-builder/storage/runtime";
import { ensureDefaultWorkspace } from "../../../../../lib/platform/workspace";
import { dispatchOutbox } from "../../../../../worker/platform-outbox";
import type { PlatformJobEnv } from "../../../../../worker/platform-jobs";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const RECENT_SESSION_MS = 10 * 60 * 1_000;

function sessionCookiesToClear(request: Request): string[] {
  const domain = sharedAuthCookieDomain(new URL(request.url).hostname);
  return [
    clearSessionCookie(),
    ...(domain ? [clearSessionCookie(domain)] : []),
  ];
}

function requestError(locale: "ru" | "uz", code: string, status: number) {
  const ru = locale === "ru";
  const messages: Record<string, [string, string]> = {
    LOCAL_SESSION_REQUIRED: [
      "Запрос удаления доступен только из JURO email-сессии.",
      "O‘chirish so‘rovi faqat JURO email sessiyasida mavjud.",
    ],
    SESSION_NOT_RECENT: [
      "Для удаления войдите в JURO заново и повторите запрос.",
      "O‘chirish uchun JURO hisobiga qayta kirib, so‘rovni takrorlang.",
    ],
  };
  const [ruMessage, uzMessage] = messages[code] ?? [
    "Запрос не выполнен.",
    "So‘rov bajarilmadi.",
  ];
  return jsonNoStore(
    {
      code,
      error: ru ? ruMessage : uzMessage,
    },
    status,
  );
}

function authErrorResponse(
  error: unknown,
  locale: "ru" | "uz",
): Response | null {
  if (!(error instanceof MfaError)) return null;
  if (error.code === "LOCAL_SESSION_REQUIRED") {
    return requestError(locale, error.code, 401);
  }
  if (error.code === "SESSION_NOT_RECENT") {
    return requestError(locale, error.code, 401);
  }
  return null;
}

function invalidInputResponse(
  error:
    | "invalid_content_type"
    | "invalid_json"
    | "invalid_input"
    | "payload_too_large",
) {
  const status =
    error === "payload_too_large"
      ? 413
      : error === "invalid_content_type"
        ? 415
        : 400;
  return jsonNoStore(
    {
      code: error.toLocaleUpperCase(),
      error: "Проверьте формат запроса.",
    },
    status,
  );
}

function maskedEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function confirmationError(
  result: Exclude<
    DeletionConfirmationResult,
    {
      status: "confirmed";
    }
  >,
  locale: "ru" | "uz",
): Response {
  const ru = locale === "ru";
  if (result.status === "existing_request") {
    return jsonNoStore(
      {
        code: "DELETION_REQUEST_EXISTS",
        error: ru
          ? "Запрос на удаление уже зарегистрирован."
          : "O‘chirish so‘rovi allaqachon ro‘yxatdan o‘tgan.",
        request: result.request,
      },
      409,
    );
  }
  const values: Record<
    Exclude<typeof result.status, "existing_request">,
    [number, string, string, string]
  > = {
    invalid: [
      400,
      "DELETION_CODE_INVALID",
      "Проверка недействительна.",
      "Tekshiruv yaroqsiz.",
    ],
    used: [
      409,
      "DELETION_CODE_USED",
      "Этот код уже использован.",
      "Bu kod allaqachon ishlatilgan.",
    ],
    replaced: [
      400,
      "DELETION_CODE_REPLACED",
      "Код заменён новым. Используйте последнее письмо.",
      "Kod yangisi bilan almashtirilgan. Oxirgi xatdan foydalaning.",
    ],
    expired: [
      400,
      "DELETION_CODE_EXPIRED",
      "Срок действия кода истёк.",
      "Kod muddati tugagan.",
    ],
    attempts_exceeded: [
      429,
      "DELETION_ATTEMPTS_EXCEEDED",
      "Попытки закончились. Запросите новый код.",
      "Urinishlar tugadi. Yangi kod so‘rang.",
    ],
    incorrect: [
      400,
      "DELETION_CODE_INCORRECT",
      "Неверный код.",
      "Kod noto‘g‘ri.",
    ],
  };
  const [status, code, ruMessage, uzMessage] = values[result.status];
  return jsonNoStore(
    {
      code,
      error: ru ? ruMessage : uzMessage,
      ...(result.status === "incorrect"
        ? {
            attemptsRemaining: Math.max(
              0,
              result.maxAttempts - result.attemptCount,
            ),
          }
        : {}),
    },
    status,
  );
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, accountDeletionInputSchema);
  if (!parsed.ok) return invalidInputResponse(parsed.error);
  const body = parsed.data;
  const locale = body.locale;
  let session;
  try {
    session = await localSessionForRequest(request, {
      recent: true,
      minimumAssurance: "primary",
    });
  } catch (error) {
    const response = authErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }

  const db = requireD1();
  const env = runtimeEnv();
  const identityKeyring = env.IDENTITY_KEYRING;
  if (!identityKeyring) {
    return jsonNoStore(
      {
        code: "IDENTITY_KEYRING_UNAVAILABLE",
        error:
          locale === "ru"
            ? "Защищённое удаление аккаунта временно недоступно."
            : "Hisobni himoyalangan tarzda o‘chirish vaqtincha mavjud emas.",
      },
      503,
    );
  }
  const identityContext = runtimeIdentityProtection();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  if (body.action === "request_code") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      return jsonNoStore(
        {
          code: "EMAIL_NOT_CONFIGURED",
          error:
            locale === "ru"
              ? "Отправка кода временно не настроена."
              : "Kod yuborish vaqtincha sozlanmagan.",
        },
        503,
      );
    }
    const id = crypto.randomUUID();
    const code = randomOtp();
    const salt = randomToken(16);
    const reservation = await reserveAccountDeletionChallenge(db, {
      identityContext,
      id,
      userId: session.userId,
      sessionId: session.sessionId,
      email: session.email,
      locale,
      codeSalt: salt,
      code,
      expiresAt: new Date(nowMs + CHALLENGE_TTL_MS).toISOString(),
      now,
      recentSince: new Date(nowMs - RECENT_SESSION_MS).toISOString(),
      cooldownSince: new Date(nowMs - 60 * 1_000).toISOString(),
      hourlySince: new Date(nowMs - 60 * 60 * 1_000).toISOString(),
    });
    if (reservation.status === "existing_request") {
      return confirmationError(reservation, locale);
    }
    if (reservation.status === "blocked") {
      const latest = reservation.latestActiveCreatedAt
        ? Date.parse(reservation.latestActiveCreatedAt)
        : Number.NaN;
      const retryAfterSeconds = Number.isFinite(latest)
        ? Math.max(0, 60 - Math.floor((nowMs - latest) / 1_000))
        : 0;
      if (retryAfterSeconds > 0) {
        return jsonNoStore(
          {
            code: "DELETION_CODE_COOLDOWN",
            retryAfterSeconds,
            error:
              locale === "ru"
                ? `Новый код можно запросить через ${retryAfterSeconds} сек.`
                : `Yangi kodni ${retryAfterSeconds} soniyadan keyin so‘rash mumkin.`,
          },
          429,
        );
      }
      return jsonNoStore(
        {
          code: "DELETION_CODE_RATE_LIMIT",
          error:
            locale === "ru"
              ? "Слишком много запросов. Попробуйте позже."
              : "Juda ko‘p so‘rov. Keyinroq urinib ko‘ring.",
        },
        429,
      );
    }

    const subject =
      locale === "ru"
        ? "Подтверждение удаления аккаунта JURO"
        : "JURO hisobini o‘chirishni tasdiqlash";
    const html =
      locale === "ru"
        ? `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>Подтверждение удаления JURO</h2><p style="font-size:28px;letter-spacing:8px;font-weight:700">${code}</p><p>Код действует 10 минут. Если вы не запрашивали удаление аккаунта, никому не сообщайте код и завершите другие сессии в настройках безопасности.</p></div>`
        : `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>JURO hisobini o‘chirishni tasdiqlash</h2><p style="font-size:28px;letter-spacing:8px;font-weight:700">${code}</p><p>Kod 10 daqiqa amal qiladi. Hisobni o‘chirishni so‘ramagan bo‘lsangiz, kodni hech kimga bermang va xavfsizlik sozlamalarida boshqa sessiyalarni yakunlang.</p></div>`;
    let sent: Response | null = null;
    try {
      sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
          "idempotency-key": `juro_account_deletion_${id}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [session.email],
          subject,
          html,
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      sent = null;
    }
    if (!sent?.ok) {
      await invalidateAccountDeletionChallenge(db, {
        id,
        userId: session.userId,
        sessionId: session.sessionId,
        invalidatedAt: new Date().toISOString(),
      });
      return jsonNoStore(
        {
          code: "EMAIL_PROVIDER_ERROR",
          error:
            locale === "ru"
              ? "Не удалось отправить письмо. Попробуйте позже."
              : "Xat yuborilmadi. Keyinroq urinib ko‘ring.",
        },
        502,
      );
    }
    return jsonNoStore({
      ok: true,
      challengeId: id,
      expiresInSeconds: CHALLENGE_TTL_MS / 1_000,
      resendAfterSeconds: 60,
      destination: maskedEmail(session.email),
    });
  }

  const workspaceId = await ensureDefaultWorkspace(session.userId);
  if (body.action === "cancel") {
    const result = await cancelAccountDeletionRequest(db, {
      requestId: body.requestId,
      userId: session.userId,
      sessionId: session.sessionId,
      workspaceId,
      identityKeyring,
      assuranceLevel: session.assuranceLevel,
      now,
    });
    if (
      result.status === "cancelled" ||
      result.status === "already_cancelled"
    ) {
      return jsonNoStore({
        ok: true,
        requestId: body.requestId,
        status: "cancelled",
      });
    }
    const code =
      result.status === "completed"
        ? "DELETION_ALREADY_COMPLETED"
        : result.status === "not_cancelable"
          ? "DELETION_NOT_CANCELABLE"
          : "DELETION_REQUEST_INVALID";
    return jsonNoStore(
      {
        code,
        error:
          locale === "ru"
            ? result.status === "completed"
              ? "Удаление аккаунта уже завершено."
              : result.status === "not_cancelable"
                ? "Этот запрос уже нельзя отменить."
                : "Запрос удаления не найден."
            : result.status === "completed"
              ? "Hisobni o‘chirish allaqachon yakunlangan."
              : result.status === "not_cancelable"
                ? "Bu so‘rovni endi bekor qilib bo‘lmaydi."
                : "O‘chirish so‘rovi topilmadi.",
      },
      result.status === "completed"
        ? 410
        : result.status === "invalid"
          ? 404
          : 409,
    );
  }

  if (body.action === "retry") {
    const result = await retryAccountDeletionRequest(db, {
      requestId: body.requestId,
      userId: session.userId,
      sessionId: session.sessionId,
      workspaceId,
      identityKeyring,
      assuranceLevel: session.assuranceLevel,
      now,
    });
    if (result.status === "retried" || result.status === "already_queued") {
      await dispatchOutbox(env as PlatformJobEnv, 1, body.requestId);
      return jsonNoStore(
        {
          ok: true,
          requestId: body.requestId,
          status: "scheduled",
          logout: true,
        },
        200,
        sessionCookiesToClear(request),
      );
    }
    const code =
      result.status === "completed"
        ? "DELETION_ALREADY_COMPLETED"
        : result.status === "not_retryable"
          ? "DELETION_NOT_RETRYABLE"
          : "DELETION_REQUEST_INVALID";
    return jsonNoStore(
      {
        code,
        error:
          locale === "ru"
            ? result.status === "completed"
              ? "Удаление аккаунта уже завершено."
              : result.status === "not_retryable"
                ? "Этот запрос сейчас нельзя запустить повторно."
                : "Запрос удаления не найден."
            : result.status === "completed"
              ? "Hisobni o‘chirish allaqachon yakunlangan."
              : result.status === "not_retryable"
                ? "Bu so‘rovni hozir qayta ishga tushirib bo‘lmaydi."
                : "O‘chirish so‘rovi topilmadi.",
      },
      result.status === "completed"
        ? 410
        : result.status === "invalid"
          ? 404
          : 409,
    );
  }
  const deletionSubject = await accountDeletionSubjectHash(
    identityKeyring,
    session.userId,
  );
  const scheduledPurgeAt = new Date(
    nowMs +
      (body.deletionMode === "recoverable_30d"
        ? RECOVERABLE_DELETION_DELAY_MS
        : 0),
  ).toISOString();
  const result = await confirmAccountDeletion(db, {
    identityContext,
    challengeId: body.challengeId,
    userId: session.userId,
    sessionId: session.sessionId,
    email: session.email,
    workspaceId,
    code: body.code,
    reason: body.reason || null,
    deletionMode: body.deletionMode,
    scheduledPurgeAt,
    subjectHash: deletionSubject.hash,
    subjectKeyVersion: deletionSubject.keyVersion,
    assuranceLevel: session.assuranceLevel,
    now,
    recentSince: new Date(nowMs - RECENT_SESSION_MS).toISOString(),
  });
  if (result.status !== "confirmed") {
    return confirmationError(result, locale);
  }
  if (body.deletionMode === "immediate") {
    await dispatchOutbox(env as PlatformJobEnv, 1, result.requestId);
  }
  return jsonNoStore(
    {
      ok: true,
      requestId: result.requestId,
      status: "scheduled",
      deletionMode: result.deletionMode,
      scheduledPurgeAt: result.scheduledPurgeAt,
      logout: true,
      revokedSessions: result.revokedSessions,
    },
    201,
    sessionCookiesToClear(request),
  );
});
