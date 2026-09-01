import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  AiActionPlanSaveError,
  saveAiActionPlanInputSchema,
  saveAiActionPlanToCase,
} from "../../../../../lib/ai/action-plan-save";
import { trackProductEvent } from "../../../../../lib/platform/analytics";
import { workspaceForContentEditor } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function localizedError(locale: "ru" | "uz", code: string): string {
  const ru = locale === "ru";
  if (code === "INVALID_AI_ACTION_PLAN_REQUEST") return ru ? "Некорректный запрос сохранения плана." : "Rejani saqlash so‘rovi noto‘g‘ri.";
  if (code === "AI_ACTION_PLAN_NOT_FOUND") return ru ? "Сохранённый AI-план не найден." : "Saqlangan AI-reja topilmadi.";
  if (code === "AI_ACTION_PLAN_CASE_NOT_FOUND") return ru ? "Выбранное дело недоступно." : "Tanlangan ish mavjud emas.";
  if (code === "AI_ACTION_PLAN_PERSISTENCE_FAILED") return ru ? "План временно не удалось сохранить. Повторите попытку." : "Rejani vaqtincha saqlab bo‘lmadi. Qayta urinib ko‘ring.";
  return ru ? "План нельзя сохранить в дело." : "Rejani ishga saqlab bo‘lmaydi.";
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const parsed = saveAiActionPlanInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ code: "INVALID_AI_ACTION_PLAN_REQUEST", error: localizedError("uz", "INVALID_AI_ACTION_PLAN_REQUEST") }, 400);
  try {
    const result = await saveAiActionPlanToCase({
      db: requireD1(),
      workspaceId: workspace.id,
      userId: user.id,
      assistantMessageId: parsed.data.assistantMessageId,
      targetCaseId: parsed.data.targetCaseId,
    });
    if (!result.replay) {
      trackProductEvent({
        event: "plan_created",
        surface: "platform",
        locale: parsed.data.locale,
        accountType: workspace.type,
        outcome: "completed",
      });
    }
    return response(result, result.replay ? 200 : 201);
  } catch (error) {
    if (!(error instanceof AiActionPlanSaveError)) throw error;
    const status = error.code === "AI_ACTION_PLAN_NOT_FOUND" || error.code === "AI_ACTION_PLAN_CASE_NOT_FOUND" ? 404
      : error.code === "AI_ACTION_PLAN_PERSISTENCE_FAILED" ? 503
        : 422;
    return response({ code: error.code, error: localizedError(parsed.data.locale, error.code) }, status);
  }
});
