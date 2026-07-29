import {
  clearDeviceContinuityCookie,
  clearSessionCookie,
} from "../../../../../../lib/auth/session";
import {
  localSessionFromCookie,
  revokeOneSession,
} from "../../../../../../lib/auth/session-management";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import {
  requireD1,
} from "../../../../../../lib/document-builder/storage/runtime";

function response(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    pragma: "no-cache",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return Response.json(body, { status, headers });
}

export const DELETE = withApiErrors(async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { sessionId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return response({
      code: "INVALID_SESSION_ID",
      error: "Некорректный идентификатор сессии.",
    }, 400);
  }
  const db = requireD1();
  const current = await localSessionFromCookie(
    db,
    request.headers.get("cookie"),
    { touch: false },
  );
  try {
    const result = await revokeOneSession(db, {
      userId: user.id,
      sessionId,
      currentSessionId: current?.userId === user.id
        ? current.sessionId
        : null,
    });
    return response(
      { ok: true, ...result },
      200,
      result.revokedCurrent
        ? [clearSessionCookie(), clearDeviceContinuityCookie()]
        : [],
    );
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "SESSION_NOT_FOUND"
    ) {
      return response({
        code: "SESSION_NOT_FOUND",
        error: "Сессия не найдена.",
      }, 404);
    }
    throw error;
  }
});
