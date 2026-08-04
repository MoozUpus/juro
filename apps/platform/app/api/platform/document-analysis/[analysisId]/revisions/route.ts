import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  AnalysisRevisionError,
  applySuggestedRevisions,
  listAnalysisRevisionState,
} from "../../../../../../lib/document-analysis/revisions";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

const applySchema = z.object({
  mode: z.enum(["selected", "all"]),
  revisionIds: z.array(z.string().min(1).max(200)).max(100).default([]),
}).strict();

const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store", pragma: "no-cache" },
});

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: { params: Promise<{ analysisId: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  try {
    return response(await listAnalysisRevisionState(requireD1(), {
      analysisId, workspaceId: workspace.id, userId: user.id,
    }));
  } catch (error) {
    if (error instanceof AnalysisRevisionError) return revisionError(error);
    throw error;
  }
});

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  const parsed = applySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ code: "ANALYSIS_REVISION_INVALID_SELECTION", error: "Некорректный список исправлений." }, 400);
  try {
    const result = await applySuggestedRevisions(
      { DB: requireD1(), BUCKET: requireR2() },
      {
        analysisId,
        workspaceId: workspace.id,
        userId: user.id,
        mode: parsed.data.mode,
        revisionIds: parsed.data.revisionIds,
        idempotencyKey: request.headers.get("idempotency-key") ?? "",
      },
    );
    return response(result, result.replay ? 200 : 201);
  } catch (error) {
    if (error instanceof AnalysisRevisionError) return revisionError(error);
    throw error;
  }
});

function revisionError(error: AnalysisRevisionError): Response {
  const messages: Record<AnalysisRevisionError["code"], string> = {
    ANALYSIS_REVISION_NOT_FOUND: "Исправления не найдены.",
    ANALYSIS_REVISION_NOT_READY: "Исправления доступны после завершения анализа.",
    ANALYSIS_REVISION_INVALID_DECISION: "Это исправление уже нельзя изменить.",
    ANALYSIS_REVISION_INVALID_SELECTION: "Выбранные исправления недоступны для применения.",
    ANALYSIS_REVISION_IDEMPOTENCY_CONFLICT: "Запрос применения уже использован для другого набора исправлений.",
    ANALYSIS_REVISION_SOURCE_INVALID: "Нормализованный текст документа недоступен или повреждён.",
    ANALYSIS_REVISION_NO_APPLICABLE_CHANGES: "Текст изменился: выбранные фрагменты нельзя применить автоматически.",
    ANALYSIS_REVISION_CONFLICT: "Версия документа изменилась. Обновите страницу и повторите действие.",
    ANALYSIS_REVISION_STORAGE_FAILED: "Исправленная версия не сохранена. Исходный документ не изменён.",
  };
  return response({ code: error.code, error: messages[error.code] }, error.status);
}
