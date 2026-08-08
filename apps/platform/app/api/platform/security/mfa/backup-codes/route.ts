import {
  manageMfaInputSchema,
  parseJsonRequest,
} from "../../../../../../lib/auth/input";
import {
  identityKeyring,
  jsonNoStore,
  localSessionForRequest,
  mfaErrorResponse,
} from "../../../../../../lib/auth/mfa-http";
import { regenerateBackupCodes } from "../../../../../../lib/auth/mfa-service";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const POST = withApiErrors(async function POST(request: Request) {
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
  const { code, locale } = parsed.data;
  try {
    const session = await localSessionForRequest(request);
    const result = await regenerateBackupCodes(
      requireD1(),
      identityKeyring(),
      {
        userId: session.userId,
        sessionId: session.sessionId,
        code,
      },
    );
    return jsonNoStore({ ok: true, backupCodes: result.backupCodes });
  } catch (error) {
    const response = mfaErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }
});
