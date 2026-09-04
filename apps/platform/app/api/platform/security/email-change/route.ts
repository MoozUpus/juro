import {
  activeEmailChangeStatus,
  confirmEmailChange,
  invalidateEmailChangeChallenge,
  markEmailChangeCodesQueued,
  reserveEmailChangeChallenge,
  type EmailChangeConfirmation,
  type EmailChangeReservation,
} from "../../../../../lib/auth/email-change";
import {
  randomOtp,
  randomToken,
  normalizeEmail,
} from "../../../../../lib/auth/crypto";
import { runtimeIdentityProtection } from "../../../../../lib/auth/identity-runtime";
import {
  emailChangeInputSchema,
  parseJsonRequest,
} from "../../../../../lib/auth/input";
import {
  identityKeyring,
  jsonNoStore,
  localSessionForRequest,
} from "../../../../../lib/auth/mfa-http";
import {
  hasActiveMfa,
  MfaError,
  requireRecentLocalSession,
} from "../../../../../lib/auth/mfa-service";
import type { LocalSession } from "../../../../../lib/auth/session-management";
import {
  replacementSessionCookiesUntil,
} from "../../../../../lib/auth/session";
import { sessionTokenFromCookie } from "../../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import {
  requireD1,
  runtimeEnv,
} from "../../../../../lib/document-builder/storage/runtime";
import { renderJuroAuthEmail } from "../../../../../lib/auth/transactional-email";
import { ensureDefaultWorkspace } from "../../../../../lib/platform/workspace";
import { dispatchOutbox } from "../../../../../worker/platform-outbox";
import type { PlatformJobEnv } from "../../../../../worker/platform-jobs";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const RECENT_SESSION_MS = 10 * 60 * 1_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskedEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function randomDistinctOtpPair(): [currentCode: string, newCode: string] {
  const currentCode = randomOtp();
  let newCode = randomOtp();
  while (newCode === currentCode) newCode = randomOtp();
  return [currentCode, newCode];
}

function invalidInputResponse(
  error:
    | "invalid_content_type"
    | "invalid_json"
    | "invalid_input"
    | "payload_too_large",
) {
  const status = error === "payload_too_large"
    ? 413
    : error === "invalid_content_type"
      ? 415
      : 400;
  return jsonNoStore({
    code: error.toLocaleUpperCase(),
    error: "Проверьте формат запроса.",
  }, status);
}

function authErrorResponse(
  error: unknown,
  locale: "ru" | "uz",
): Response | null {
  if (!(error instanceof MfaError)) return null;
  const ru = locale === "ru";
  if (error.code === "LOCAL_SESSION_REQUIRED") {
    return jsonNoStore({
      code: error.code,
      error: ru
        ? "Смена email доступна только из JURO email-сессии."
        : "Emailni almashtirish faqat JURO email sessiyasida mavjud.",
    }, 401);
  }
  if (error.code === "SESSION_NOT_RECENT") {
    return jsonNoStore({
      code: error.code,
      error: ru
        ? "Для смены email войдите в JURO заново. При включённой 2FA завершите вход вторым фактором."
        : "Emailni almashtirish uchun JURO hisobiga qayta kiring. 2FA yoqilgan bo‘lsa, kirishni ikkinchi omil bilan yakunlang.",
    }, 401);
  }
  return null;
}

async function recentEmailChangeSession(
  request: Request,
  now: Date,
): Promise<LocalSession> {
  const session = await localSessionForRequest(request, {
    recent: true,
    minimumAssurance: "primary",
    now,
  });
  if (await hasActiveMfa(requireD1(), session.userId)) {
    requireRecentLocalSession(session, {
      now,
      minimumAssurance: "mfa",
    });
  }
  return session;
}

function reservationError(
  reservation: Extract<EmailChangeReservation, { status: "blocked" }>,
  locale: "ru" | "uz",
  nowMs: number,
): Response {
  const ru = locale === "ru";
  if (reservation.reason === "cooldown") {
    const latest = reservation.latestActiveCreatedAt
      ? Date.parse(reservation.latestActiveCreatedAt)
      : Number.NaN;
    const retryAfterSeconds = Number.isFinite(latest)
      ? Math.max(1, 60 - Math.floor((nowMs - latest) / 1_000))
      : 60;
    return jsonNoStore({
      code: "EMAIL_CHANGE_COOLDOWN",
      retryAfterSeconds,
      error: ru
        ? `Новые коды можно запросить через ${retryAfterSeconds} сек.`
        : `Yangi kodlarni ${retryAfterSeconds} soniyadan keyin so‘rash mumkin.`,
    }, 429);
  }
  if (reservation.reason === "rate_limit") {
    return jsonNoStore({
      code: "EMAIL_CHANGE_RATE_LIMIT",
      error: ru
        ? "Слишком много запросов. Попробуйте позже."
        : "Juda ko‘p so‘rov. Keyinroq urinib ko‘ring.",
    }, 429);
  }
  return jsonNoStore({
    code: reservation.reason === "state_changed"
      ? "EMAIL_CHANGE_STATE_CHANGED"
      : "EMAIL_CHANGE_ADDRESS_UNAVAILABLE",
    error: reservation.reason === "state_changed"
      ? (ru
        ? "Состояние аккаунта изменилось. Обновите страницу и повторите."
        : "Hisob holati o‘zgardi. Sahifani yangilab, qayta urinib ko‘ring.")
      : (ru
        ? "Этот адрес нельзя использовать для смены email."
        : "Bu manzildan emailni almashtirish uchun foydalanib bo‘lmaydi."),
  }, 409);
}

function confirmationError(
  result: Exclude<EmailChangeConfirmation, { status: "confirmed" }>,
  locale: "ru" | "uz",
): Response {
  const ru = locale === "ru";
  const values: Record<
    Exclude<typeof result.status, "incorrect">,
    [number, string, string, string]
  > = {
    invalid: [400, "EMAIL_CHANGE_INVALID", "Проверка недействительна.", "Tekshiruv yaroqsiz."],
    not_queued: [409, "EMAIL_CHANGE_NOT_QUEUED", "Письма ещё не приняты почтовым провайдером.", "Xatlar hali pochta provayderi tomonidan qabul qilinmagan."],
    used: [409, "EMAIL_CHANGE_USED", "Эта проверка уже использована.", "Bu tekshiruv allaqachon ishlatilgan."],
    replaced: [409, "EMAIL_CHANGE_REPLACED", "Проверка заменена новой. Используйте последние письма.", "Tekshiruv yangisi bilan almashtirilgan. Oxirgi xatlardan foydalaning."],
    expired: [410, "EMAIL_CHANGE_EXPIRED", "Срок действия кодов истёк.", "Kodlarning amal qilish muddati tugagan."],
    attempts_exceeded: [429, "EMAIL_CHANGE_ATTEMPTS_EXCEEDED", "Попытки закончились. Запросите новые коды.", "Urinishlar tugadi. Yangi kodlarni so‘rang."],
    target_unavailable: [409, "EMAIL_CHANGE_ADDRESS_UNAVAILABLE", "Этот адрес больше нельзя использовать.", "Bu manzildan endi foydalanib bo‘lmaydi."],
    state_conflict: [409, "EMAIL_CHANGE_STATE_CHANGED", "Состояние аккаунта изменилось. Обновите страницу и повторите.", "Hisob holati o‘zgardi. Sahifani yangilab, qayta urinib ko‘ring."],
  };
  if (result.status === "incorrect") {
    return jsonNoStore({
      code: "EMAIL_CHANGE_CODE_INCORRECT",
      error: ru
        ? "Один или оба кода неверны."
        : "Kodlardan biri yoki ikkalasi noto‘g‘ri.",
      attemptsRemaining: Math.max(
        0,
        result.maxAttempts - result.attemptCount,
      ),
    }, 400);
  }
  const [status, code, ruMessage, uzMessage] = values[result.status];
  return jsonNoStore({
    code,
    error: ru ? ruMessage : uzMessage,
  }, status);
}

async function queueVerificationEmails(input: {
  apiKey: string;
  from: string;
  challengeId: string;
  currentEmail: string;
  newEmail: string;
  currentCode: string;
  newCode: string;
  locale: "ru" | "uz";
}): Promise<boolean> {
  const current = renderJuroAuthEmail({
    locale: input.locale,
    purpose: "email_change_current",
    code: input.currentCode,
  });
  const next = renderJuroAuthEmail({
    locale: input.locale,
    purpose: "email_change",
    code: input.newCode,
  });
  let response: Response | null = null;
  try {
    response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `juro_email_change_${input.challengeId}`,
      },
      body: JSON.stringify([
        {
          from: input.from,
          to: [input.currentEmail],
          subject: current.subject,
          html: current.html,
          text: current.text,
        },
        {
          from: input.from,
          to: [input.newEmail],
          subject: next.subject,
          html: next.html,
          text: next.text,
        },
      ]),
      signal: AbortSignal.timeout(8_000),
    });
    const accepted = response.ok;
    await response.body?.cancel();
    return accepted;
  } catch {
    try {
      await response?.body?.cancel();
    } catch {
      // The provider request already failed; there is no response body to keep.
    }
    return false;
  }
}

export const GET = withApiErrors(async function GET(request: Request) {
  const env = runtimeEnv();
  const configured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  let session: LocalSession;
  try {
    session = await localSessionForRequest(request);
  } catch (error) {
    if (
      error instanceof MfaError
      && error.code === "LOCAL_SESSION_REQUIRED"
    ) {
      return jsonNoStore({
        available: false,
        canManage: false,
        reason: "LOCAL_SESSION_REQUIRED",
        active: null,
      });
    }
    throw error;
  }
  const active = await activeEmailChangeStatus(requireD1(), {
    identityContext: runtimeIdentityProtection(),
    userId: session.userId,
    sessionId: session.sessionId,
    currentEmail: session.email,
    now: new Date().toISOString(),
  });
  return jsonNoStore({
    available: configured,
    canManage: true,
    reason: configured ? null : "EMAIL_NOT_CONFIGURED",
    currentEmail: session.email,
    active: active
      ? {
        challengeId: active.challengeId,
        currentDestination: maskedEmail(active.currentEmail),
        newDestination: maskedEmail(active.newEmail),
        expiresAt: active.expiresAt,
      }
      : null,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, emailChangeInputSchema);
  if (!parsed.ok) return invalidInputResponse(parsed.error);
  const body = parsed.data;
  const locale = body.locale;
  if (body.action === "cancel") {
    try {
      const session = await localSessionForRequest(request);
      await invalidateEmailChangeChallenge(requireD1(), {
        challengeId: body.challengeId,
        userId: session.userId,
        sessionId: session.sessionId,
        invalidatedAt: new Date().toISOString(),
      });
      return jsonNoStore({ ok: true });
    } catch (error) {
      const response = authErrorResponse(error, locale);
      if (response) return response;
      throw error;
    }
  }

  const nowDate = new Date();
  const nowMs = nowDate.getTime();
  const now = nowDate.toISOString();
  let session: LocalSession;
  let currentToken: string;
  let securityEmailKeyring: ReturnType<typeof identityKeyring>;
  try {
    session = await recentEmailChangeSession(request, nowDate);
    securityEmailKeyring = identityKeyring();
    const token = sessionTokenFromCookie(request.headers.get("cookie"));
    if (!token) throw new MfaError("LOCAL_SESSION_REQUIRED");
    currentToken = token;
  } catch (error) {
    const response = authErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }
  const db = requireD1();

  if (body.action === "request_codes") {
    const newEmail = normalizeEmail(body.newEmail);
    if (!EMAIL_RE.test(newEmail) || newEmail.length > 254) {
      return jsonNoStore({
        code: "EMAIL_CHANGE_ADDRESS_INVALID",
        error: locale === "ru"
          ? "Проверьте новый адрес электронной почты."
          : "Yangi elektron pochta manzilini tekshiring.",
      }, 400);
    }
    const env = runtimeEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      return jsonNoStore({
        code: "EMAIL_NOT_CONFIGURED",
        error: locale === "ru"
          ? "Отправка кодов временно не настроена."
          : "Kod yuborish vaqtincha sozlanmagan.",
      }, 503);
    }
    const challengeId = crypto.randomUUID();
    const [currentCode, newCode] = randomDistinctOtpPair();
    const currentCodeSalt = randomToken(16);
    const newCodeSalt = randomToken(16);
    const reservation = await reserveEmailChangeChallenge(db, {
      identityContext: runtimeIdentityProtection(),
      id: challengeId,
      userId: session.userId,
      sessionId: session.sessionId,
      currentEmail: session.email,
      newEmail,
      currentCodeSalt,
      currentCode,
      newCodeSalt,
      newCode,
      locale,
      expiresAt: new Date(nowMs + CHALLENGE_TTL_MS).toISOString(),
      now,
      recentSince: new Date(nowMs - RECENT_SESSION_MS).toISOString(),
      cooldownSince: new Date(nowMs - 60 * 1_000).toISOString(),
      hourlySince: new Date(nowMs - 60 * 60 * 1_000).toISOString(),
    });
    if (reservation.status === "blocked") {
      return reservationError(reservation, locale, nowMs);
    }
    const accepted = await queueVerificationEmails({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      challengeId,
      currentEmail: session.email,
      newEmail,
      currentCode,
      newCode,
      locale,
    });
    if (!accepted) {
      await invalidateEmailChangeChallenge(db, {
        challengeId,
        userId: session.userId,
        sessionId: session.sessionId,
        invalidatedAt: new Date().toISOString(),
      });
      return jsonNoStore({
        code: "EMAIL_PROVIDER_ERROR",
        error: locale === "ru"
          ? "Не удалось отправить оба письма. Попробуйте позже."
          : "Ikkala xatni yuborib bo‘lmadi. Keyinroq urinib ko‘ring.",
      }, 502);
    }
    const queuedAt = new Date().toISOString();
    if (!await markEmailChangeCodesQueued(db, {
      challengeId,
      userId: session.userId,
      sessionId: session.sessionId,
      queuedAt,
    })) {
      await invalidateEmailChangeChallenge(db, {
        challengeId,
        userId: session.userId,
        sessionId: session.sessionId,
        invalidatedAt: new Date().toISOString(),
      });
      return jsonNoStore({
        code: "EMAIL_CHANGE_STATE_CHANGED",
        error: locale === "ru"
          ? "Состояние аккаунта изменилось. Запросите новые коды."
          : "Hisob holati o‘zgardi. Yangi kodlarni so‘rang.",
      }, 409);
    }
    return jsonNoStore({
      ok: true,
      challengeId,
      currentDestination: maskedEmail(session.email),
      newDestination: maskedEmail(newEmail),
      expiresInSeconds: CHALLENGE_TTL_MS / 1_000,
      resendAfterSeconds: 60,
    });
  }

  const result = await confirmEmailChange(db, {
    identityContext: runtimeIdentityProtection(),
    challengeId: body.challengeId,
    userId: session.userId,
    sessionId: session.sessionId,
    currentToken,
    currentEmail: session.email,
    workspaceId: await ensureDefaultWorkspace(session.userId),
    currentCode: body.currentCode,
    newCode: body.newCode,
    assuranceLevel: session.assuranceLevel,
    locale,
    securityEmailKeyring,
    now,
    recentSince: new Date(nowMs - RECENT_SESSION_MS).toISOString(),
  });
  if (result.status !== "confirmed") {
    return confirmationError(result, locale);
  }
  const env = runtimeEnv();
  if (String((env as { ASYNC_RUNTIME_ENABLED?: string }).ASYNC_RUNTIME_ENABLED) === "true") {
    try {
      await dispatchOutbox(
        env as unknown as PlatformJobEnv,
        1,
        result.securityEmailJobId,
      );
    } catch {
      // The transactional outbox remains pending for a later safe retry.
    }
  }
  return jsonNoStore(
    {
      ok: true,
      email: result.newEmail,
      revokedSessions: result.revokedSessions,
      securityNotificationQueued: true,
    },
    200,
    replacementSessionCookiesUntil(
      result.session.token,
      result.session.expiresAt,
      new URL(request.url).hostname,
      nowDate,
    ),
  );
});
