import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import {
  LegalBookmarkError,
  createLegalBookmark,
  legalBookmarkCreateSchema,
  listLegalBookmarks,
} from "../../../../lib/legal/user-bookmarks";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const caseId = new URL(request.url).searchParams.get("caseId") || undefined;
  if (caseId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) {
    return response({ code: "CASE_UNAVAILABLE", error: "Дело недоступно." }, 404);
  }
  return response({ bookmarks: await listLegalBookmarks({ db: requireD1(), workspaceId: workspace.id, userId: user.id, caseId }) });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, legalBookmarkCreateSchema, 4_096);
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: "Проверьте источник, дело и комментарий." }, parsed.error === "payload_too_large" ? 413 : 400);
  try {
    const result = await createLegalBookmark({
      db: requireD1(), workspaceId: workspace.id, userId: user.id,
      ...parsed.data, idempotencyKey: request.headers.get("idempotency-key") ?? "",
    });
    return response(result, result.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof LegalBookmarkError) return response({ code: error.code, error: error.message }, error.status);
    throw error;
  }
});
