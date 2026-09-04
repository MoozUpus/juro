import {
  confirmTotpEnrollmentInputSchema,
  parseJsonRequest,
} from "../../../../../../lib/auth/input";
import {
  identityKeyring,
  jsonNoStore,
  localSessionForRequest,
  mfaErrorResponse,
} from "../../../../../../lib/auth/mfa-http";
import {
  confirmTotpEnrollment,
  MfaError,
} from "../../../../../../lib/auth/mfa-service";
import {
  replacementSessionCookiesUntil,
} from "../../../../../../lib/auth/session";
import { sessionTokenFromCookie } from "../../../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(
    request,
    confirmTotpEnrollmentInputSchema,
  );
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
  const { credentialId, code, locale } = parsed.data;
  try {
    const session = await localSessionForRequest(request, { recent: true });
    const currentToken = sessionTokenFromCookie(request.headers.get("cookie"));
    if (!currentToken) throw new MfaError("LOCAL_SESSION_REQUIRED");
    const result = await confirmTotpEnrollment(
      requireD1(),
      identityKeyring(),
      {
        userId: session.userId,
        sessionId: session.sessionId,
        currentToken,
        credentialId,
        code,
      },
    );
    return jsonNoStore(
      { ok: true, backupCodes: result.backupCodes },
      200,
      replacementSessionCookiesUntil(
        result.session.token,
        result.session.expiresAt,
        new URL(request.url).hostname,
      ),
    );
  } catch (error) {
    const response = mfaErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }
});
