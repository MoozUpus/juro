import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  AiActionPlanSaveError,
  saveAiActionPlanInputSchema,
  saveAiActionPlanToCase,
} from "../../../../../lib/ai/action-plan-save";
import { aiText, parseAiOutputLocale, type AiOutputLocale } from "../../../../../lib/ai/localization";
import { workspaceForContentEditor } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function localizedError(locale: AiOutputLocale, code: string): string {
  if (code === "INVALID_AI_ACTION_PLAN_REQUEST") return aiText(locale, "Некорректный запрос сохранения плана.", "Rejani saqlash so‘rovi noto‘g‘ri.", "The request to save the action plan is invalid.");
  if (code === "AI_ACTION_PLAN_NOT_FOUND") return aiText(locale, "Сохранённый AI-план не найден.", "Saqlangan AI-reja topilmadi.", "The saved AI action plan was not found.");
  if (code === "AI_ACTION_PLAN_CASE_NOT_FOUND") return aiText(locale, "Выбранное дело недоступно.", "Tanlangan ish mavjud emas.", "The selected matter is unavailable.");
  if (code === "AI_ACTION_PLAN_PERSISTENCE_FAILED") return aiText(locale, "План временно не удалось сохранить. Повторите попытку.", "Rejani vaqtincha saqlab bo‘lmadi. Qayta urinib ko‘ring.", "The action plan could not be saved. Please try again.");
  return aiText(locale, "План нельзя сохранить в дело.", "Rejani ishga saqlab bo‘lmaydi.", "The action plan cannot be saved to this matter.");
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const raw = await request.json().catch(() => null);
  const locale = parseAiOutputLocale(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { locale?: unknown }).locale : undefined);
  const parsed = saveAiActionPlanInputSchema.safeParse(raw);
  if (!parsed.success) return response({ code: "INVALID_AI_ACTION_PLAN_REQUEST", error: localizedError(locale, "INVALID_AI_ACTION_PLAN_REQUEST") }, 400);
  try {
    const result = await saveAiActionPlanToCase({
      db: requireD1(),
      workspaceId: workspace.id,
      userId: user.id,
      assistantMessageId: parsed.data.assistantMessageId,
      targetCaseId: parsed.data.targetCaseId,
    });
    return response(result, result.replay ? 200 : 201);
  } catch (error) {
    if (!(error instanceof AiActionPlanSaveError)) throw error;
    const status = error.code === "AI_ACTION_PLAN_NOT_FOUND" || error.code === "AI_ACTION_PLAN_CASE_NOT_FOUND" ? 404
      : error.code === "AI_ACTION_PLAN_PERSISTENCE_FAILED" ? 503
        : 422;
    return response({ code: error.code, error: localizedError(parsed.data.locale, error.code) }, status);
  }
});
