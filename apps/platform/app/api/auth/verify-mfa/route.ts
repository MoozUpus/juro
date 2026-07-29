import {
  parseJsonRequest,
  verifyMfaInputSchema,
} from "../../../../lib/auth/input";
import {
  identityKeyring,
  jsonNoStore,
  mfaErrorResponse,
} from "../../../../lib/auth/mfa-http";
import {
  MfaError,
  verifyLoginMfa,
} from "../../../../lib/auth/mfa-service";
import {
  clearMfaChallengeCookie,
  deviceContinuityCookie,
  sessionCookie,
} from "../../../../lib/auth/session";
import { authRequestSecurityContext } from "../../../../lib/auth/request-security-evidence";
import {
  deviceContinuityTokenFromCookie,
  mfaChallengeTokenFromCookie,
} from "../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { isPersonalAccountType } from "../../../../lib/platform/routing";

function terminalMfaError(error: unknown): boolean {
  return error instanceof MfaError
    && [
      "MFA_CHALLENGE_INVALID",
      "MFA_CHALLENGE_EXPIRED",
      "MFA_CHALLENGE_USED",
      "MFA_ATTEMPTS_EXCEEDED",
    ].includes(error.code);
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, verifyMfaInputSchema);
  if (!parsed.ok) {
    const status = parsed.error === "payload_too_large"
      ? 413
      : parsed.error === "invalid_content_type"
        ? 415
        : 400;
    return jsonNoStore({
      code: parsed.error.toLocaleUpperCase(),
      error: "Проверьте формат запроса.",
    }, status);
  }
  const { code, locale, rememberMe } = parsed.data;
  const token = mfaChallengeTokenFromCookie(request.headers.get("cookie"));
  if (!token) {
    return jsonNoStore({
      code: "MFA_CHALLENGE_INVALID",
      error: locale === "ru"
        ? "Проверка входа недействительна. Начните вход заново."
        : "Kirish tekshiruvi yaroqsiz. Kirishni qaytadan boshlang.",
    }, 401, [clearMfaChallengeCookie()]);
  }
  try {
    const result = await verifyLoginMfa(
      requireD1(),
      identityKeyring(),
      {
        token,
        code,
        userAgent: request.headers.get("user-agent"),
        securityContext: authRequestSecurityContext(request),
        deviceToken: deviceContinuityTokenFromCookie(
          request.headers.get("cookie"),
        ),
        rememberMe,
      },
    );
    const userLocale = result.locale === "uz" ? "uz" : "ru";
    const accountType = isPersonalAccountType(result.accountType)
      ? result.accountType
      : "individual";
    const redirectTo = result.onboardingCompletedAt
      ? `/${userLocale}/${accountType}/dashboard`
      : `/${userLocale}/onboarding`;
    return jsonNoStore({ ok: true, redirectTo }, 200, [
      clearMfaChallengeCookie(),
      sessionCookie(result.session.token, rememberMe),
      ...(result.session.deviceContinuityToken
        ? [deviceContinuityCookie(result.session.deviceContinuityToken)]
        : []),
    ]);
  } catch (error) {
    const response = mfaErrorResponse(error, locale);
    if (!response) throw error;
    if (terminalMfaError(error)) {
      response.headers.append("set-cookie", clearMfaChallengeCookie());
    }
    return response;
  }
});
