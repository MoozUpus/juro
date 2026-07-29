import {
  manageMfaInputSchema,
  parseJsonRequest,
} from "../../../../../lib/auth/input";
import {
  identityKeyring,
  jsonNoStore,
  localSessionForRequest,
  mfaErrorResponse,
} from "../../../../../lib/auth/mfa-http";
import {
  disableMfa,
  MfaError,
  mfaStatus,
} from "../../../../../lib/auth/mfa-service";
import { sessionCookieUntil } from "../../../../../lib/auth/session-persistence";
import { sessionTokenFromCookie } from "../../../../../lib/auth/session-token";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

export const GET = withApiErrors(async function GET(request: Request) {
  let session;
  try {
    session = await localSessionForRequest(request);
  } catch (error) {
    if (
      !(error instanceof MfaError)
      || error.code !== "LOCAL_SESSION_REQUIRED"
    ) throw error;
    return jsonNoStore({
      available: false,
      canManage: false,
      enabled: false,
      verifiedAt: null,
      backupCodesRemaining: 0,
      reason: "LOCAL_SESSION_REQUIRED",
    });
  }
  try {
    identityKeyring();
  } catch {
    return jsonNoStore({
      available: false,
      canManage: true,
      enabled: false,
      verifiedAt: null,
      backupCodesRemaining: 0,
      reason: "MFA_CONFIGURATION_UNAVAILABLE",
    });
  }
  return jsonNoStore({
    available: true,
    canManage: true,
    ...await mfaStatus(requireD1(), session.userId),
  });
});

export const DELETE = withApiErrors(async function DELETE(request: Request) {
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, manageMfaInputSchema);
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
  const { locale, code } = parsed.data;
  try {
    const session = await localSessionForRequest(request);
    const currentToken = sessionTokenFromCookie(request.headers.get("cookie"));
    if (!currentToken) throw new MfaError("LOCAL_SESSION_REQUIRED");
    const result = await disableMfa(requireD1(), identityKeyring(), {
      userId: session.userId,
      sessionId: session.sessionId,
      currentToken,
      code,
    });
    return jsonNoStore(
      { ok: true },
      200,
      [sessionCookieUntil(result.session.token, result.session.expiresAt)],
    );
  } catch (error) {
    const response = mfaErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }
});
