import {
  jsonNoStore,
  localSessionForRequest,
  mfaErrorResponse,
  type MfaLocale,
} from "../../../../../../lib/auth/mfa-http";
import { replacementSessionCookiesUntil } from "../../../../../../lib/auth/session";
import { rotatePeriodicSessionToken } from "../../../../../../lib/auth/session-rotation";
import { sessionTokenFromCookie } from "../../../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../../../lib/platform/routing";

function requestLocale(request: Request): MfaLocale | null {
  const value = new URL(request.url).searchParams.get("lang") ?? "ru";
  return isLocale(value) ? value : null;
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const locale = requestLocale(request);
  if (!locale) {
    return jsonNoStore({
      code: "INVALID_LOCALE",
      error: "Choose a supported interface language.",
    }, 400);
  }
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
        ? "Войдите в JURO, чтобы обновить сессию."
        : locale === "uz"
          ? "Sessiyani yangilash uchun JURO hisobiga kiring."
          : "Sign in to JURO to refresh your session.",
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
        : locale === "uz"
          ? "Sessiya holati o‘zgardi. So‘rovni takrorlang."
          : "The session state changed. Try the request again.",
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
    replacementSessionCookiesUntil(
      result.token,
      result.expiresAt,
      new URL(request.url).hostname,
      now,
    ),
  );
});
