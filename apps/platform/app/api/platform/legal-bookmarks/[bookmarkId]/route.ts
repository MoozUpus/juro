import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  LegalBookmarkError,
  archiveLegalBookmark,
  legalBookmarkArchiveSchema,
  legalBookmarkUpdateSchema,
  updateLegalBookmark,
} from "../../../../../lib/legal/user-bookmarks";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

type Context = { params: Promise<{ bookmarkId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function contextFor(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { bookmarkId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookmarkId)) {
    throw new LegalBookmarkError("BOOKMARK_UNAVAILABLE", "Закладка недоступна.", 404);
  }
  return { user, workspace, bookmarkId };
}

export const PUT = withApiErrors(async function PUT(request: Request, context: Context) {
  try {
    const scope = await contextFor(request, context);
    const parsed = await parseJsonRequest(request, legalBookmarkUpdateSchema, 4_096);
    if (!parsed.ok) return response({ code: "INVALID_INPUT", error: "Проверьте дело, комментарий и версию закладки." }, parsed.error === "payload_too_large" ? 413 : 400);
    return response(await updateLegalBookmark({
      db: requireD1(), workspaceId: scope.workspace.id, userId: scope.user.id,
      bookmarkId: scope.bookmarkId, ...parsed.data,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
    }));
  } catch (error) {
    if (error instanceof LegalBookmarkError) return response({ code: error.code, error: error.message }, error.status);
    throw error;
  }
});

export const DELETE = withApiErrors(async function DELETE(request: Request, context: Context) {
  try {
    const scope = await contextFor(request, context);
    const parsed = await parseJsonRequest(request, legalBookmarkArchiveSchema, 1_024);
    if (!parsed.ok) return response({ code: "INVALID_INPUT", error: "Некорректная версия закладки." }, parsed.error === "payload_too_large" ? 413 : 400);
    return response(await archiveLegalBookmark({
      db: requireD1(), workspaceId: scope.workspace.id, userId: scope.user.id,
      bookmarkId: scope.bookmarkId, revision: parsed.data.revision,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
    }));
  } catch (error) {
    if (error instanceof LegalBookmarkError) return response({ code: error.code, error: error.message }, error.status);
    throw error;
  }
});
