import {
  jsonNoStore,
  localSessionForRequest,
  mfaErrorResponse,
  type MfaLocale,
} from "../../../../../../lib/auth/mfa-http";
import { sessionCookieUntil, sharedAuthCookieDomain } from "../../../../../../lib/auth/session-persistence";
import { rotatePeriodicSessionToken } from "../../../../../../lib/auth/session-rotation";
import { sessionTokenFromCookie } from "../../../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

function requestLocale(request: Request): MfaLocale {
  return new URL(request.url).searchParams.get("lang") === "ru" ? "ru" : "uz";
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const locale = requestLocale(request);
  const now = new Date();
  let session;
  try {
    session = await localSessionForRequest(request, { now });
  } catch (error) {
    const response = mfaErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }
  const currentToken = sessionTokenFromCookie(request.headers.get("cookie"));
  if (!currentToken) {
    return jsonNoStore({
      code: "LOCAL_SESSION_REQUIRED",
      error: locale === "ru"
        ? "Войдите через email-код JURO, чтобы обновить сессию."
        : "Sessiyani yangilash uchun JURO email-kodi orqali kiring.",
    }, 401);
  }

  const result = await rotatePeriodicSessionToken(requireD1(), {
    userId: session.userId,
    sessionId: session.sessionId,
    currentToken,
    now,
  });
  if (result.status === "state_conflict") {
    return jsonNoStore({
      code: "SESSION_STATE_CHANGED",
      error: locale === "ru"
        ? "Состояние сессии изменилось. Повторите запрос."
        : "Sessiya holati o‘zgardi. So‘rovni takrorlang.",
    }, 409);
  }
  if (result.status === "not_due") {
    return jsonNoStore({
      rotated: false,
      nextRefreshAt: result.nextRotationAt,
    });
  }
  return jsonNoStore(
    {
      rotated: true,
      nextRefreshAt: result.nextRotationAt,
    },
    200,
    [sessionCookieUntil(result.token, result.expiresAt, now, sharedAuthCookieDomain(new URL(request.url).hostname))],
  );
});
