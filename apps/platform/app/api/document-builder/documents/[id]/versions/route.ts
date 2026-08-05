import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import {
  createDocumentVersion,
  createDocumentVersionSchema,
  DocumentVersionError,
  documentVersionIdempotencyKeySchema,
  listDocumentVersions,
} from "../../../../../../lib/document-builder/document-versions";
import { requireOwner } from "../../../../../../lib/document-builder/permissions";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const access = await requireOwner(id, user.id);
    if (!access?.workspaceId) return forbidden();
    return jsonResponse({ versions: await listDocumentVersions({ db: requireD1(), documentId: id, workspaceId: access.workspaceId, ownerUserId: user.id }) });
  } catch (error) { return versionError(error); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const access = await requireOwner(id, user.id);
    if (!access?.workspaceId) return forbidden();
    const parsed = createDocumentVersionSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Не удалось проверить данные версии.", "INVALID_DOCUMENT_VERSION");
    const idempotency = documentVersionIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!idempotency.success) return badRequest("Для сохранения версии требуется корректный Idempotency-Key.", "INVALID_IDEMPOTENCY_KEY");
    const result = await createDocumentVersion({ db: requireD1(), bucket: requireR2(), documentId: id, workspaceId: access.workspaceId, ownerUserId: user.id, revision: parsed.data.revision, idempotencyKey: idempotency.data });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) { return versionError(error); }
}

function versionError(error: unknown): Response {
  if (!(error instanceof DocumentVersionError)) return apiError(error);
  const messages: Record<DocumentVersionError["code"], string> = {
    DOCUMENT_NOT_FOUND: "Документ не найден.", DOCUMENT_ARCHIVED: "Сначала восстановите документ из архива.",
    REVISION_CONFLICT: "Документ изменён в другой вкладке. Обновите страницу.", IDEMPOTENCY_CONFLICT: "Этот запрос уже использован для другой версии.",
    VERSION_NOT_FOUND: "Версия не найдена.", VERSION_NOT_READY: "Версия ещё не готова.",
    VERSION_OBJECT_INVALID: "Снимок версии повреждён или не прошёл проверку.", VERSION_STORAGE_FAILED: "Хранилище версий временно недоступно.",
  };
  return jsonResponse({ error: messages[error.code], code: error.code }, { status: error.status });
}
