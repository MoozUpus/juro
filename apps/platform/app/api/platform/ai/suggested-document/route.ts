import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  AiSuggestedDocumentError,
  resolveAiSuggestedDocument,
  resolveAiSuggestedDocumentInputSchema,
} from "../../../../../lib/ai/suggested-document";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, status === 200 ? { headers: { "cache-control": "private, no-store" } } : { status, headers: { "cache-control": "private, no-store" } });
}

function localizedError(locale: "ru" | "uz", code: string): string {
  const ru = locale === "ru";
  if (code === "AI_SUGGESTED_DOCUMENT_NOT_FOUND") return ru ? "Сохранённая рекомендация AI не найдена." : "Saqlangan AI tavsiyasi topilmadi.";
  if (code === "AI_SUGGESTED_DOCUMENT_UNAVAILABLE") return ru ? "Подходящий опубликованный шаблон пока недоступен." : "Mos e’lon qilingan shablon hozircha mavjud emas.";
  return ru ? "Рекомендацию документа не удалось проверить." : "Hujjat tavsiyasini tekshirib bo‘lmadi.";
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = resolveAiSuggestedDocumentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ code: "AI_SUGGESTED_DOCUMENT_INVALID", error: localizedError("uz", "AI_SUGGESTED_DOCUMENT_INVALID") }, 400);
  try {
    return response(await resolveAiSuggestedDocument({
      db: requireD1(),
      workspaceId: workspace.id,
      userId: user.id,
      assistantMessageId: parsed.data.assistantMessageId,
      locale: parsed.data.locale,
    }));
  } catch (error) {
    if (!(error instanceof AiSuggestedDocumentError)) throw error;
    const status = error.code === "AI_SUGGESTED_DOCUMENT_NOT_FOUND" ? 404 : 422;
    return response({ code: error.code, error: localizedError(parsed.data.locale, error.code) }, status);
  }
});
