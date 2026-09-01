import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import {
  DocumentCaseLinkError,
  changeDocumentCaseLink,
  documentCaseLinkInputSchema,
} from "../../../../../../lib/document-builder/document-case-link";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForContentEditor } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ id: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const PUT = withApiErrors(async function PUT(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return response({ code: "DOCUMENT_UNAVAILABLE", error: "Документ недоступен." }, 404);
  }
  try {
    const parsed = documentCaseLinkInputSchema.safeParse(await request.json());
    if (!parsed.success) return response({ code: "INVALID_INPUT", error: "Выберите доступное дело или снимите привязку." }, 400);
    const result = await changeDocumentCaseLink({
      db: requireD1(),
      workspaceId: workspace.id,
      userId: user.id,
      documentId: id,
      caseId: parsed.data.caseId,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
    });
    return response(result);
  } catch (error) {
    if (error instanceof DocumentCaseLinkError) {
      return response({ code: error.code, error: error.message }, error.status);
    }
    if (error instanceof SyntaxError) return response({ code: "INVALID_JSON", error: "Некорректный JSON." }, 400);
    throw error;
  }
});
