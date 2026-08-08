import {
  identityKeyring,
  jsonNoStore,
  localSessionForRequest,
  mfaErrorResponse,
} from "../../../../../../lib/auth/mfa-http";
import { beginTotpEnrollment } from "../../../../../../lib/auth/mfa-service";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const locale = new URL(request.url).searchParams.get("lang") === "uz"
    ? "uz"
    : "ru";
  try {
    const session = await localSessionForRequest(request, { recent: true });
    const enrollment = await beginTotpEnrollment(
      requireD1(),
      identityKeyring(),
      {
        userId: session.userId,
        sessionId: session.sessionId,
        email: session.email,
      },
    );
    return jsonNoStore(enrollment);
  } catch (error) {
    const response = mfaErrorResponse(error, locale);
    if (response) return response;
    throw error;
  }
});
