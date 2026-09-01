import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { AiFeedbackError, aiFeedbackInputSchema, listAiFeedback, saveAiFeedback } from "../../../../../lib/ai/feedback";
import { trackProductEvent } from "../../../../../lib/platform/analytics";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function error(locale: string) {
  return locale === "ru" ? "Сохранённый AI-ответ недоступен." : "Saqlangan AI javobi mavjud emas.";
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const assistantMessageId = new URL(request.url).searchParams.get("assistantMessageId") || "";
  const parsed = aiFeedbackInputSchema.pick({ assistantMessageId: true }).safeParse({ assistantMessageId });
  if (!parsed.success) return response({ code: "AI_FEEDBACK_INVALID", error: error("uz") }, 400);
  try {
    return response({ feedback: await listAiFeedback({ db: requireD1(), workspaceId: workspace.id, userId: user.id, assistantMessageId: parsed.data.assistantMessageId }) });
  } catch (value) {
    if (value instanceof AiFeedbackError) return response({ code: value.code, error: error("uz") }, 404);
    throw value;
  }
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, aiFeedbackInputSchema, 4_096);
  if (!parsed.ok) return response({ code: "AI_FEEDBACK_INVALID", error: error("uz") }, parsed.error === "payload_too_large" ? 413 : 400);
  try {
    const result = await saveAiFeedback({ db: requireD1(), workspaceId: workspace.id, userId: user.id, now: isoNow(), ...parsed.data });
    if (!result.replay) {
      trackProductEvent({
        event: "feedback_submitted",
        surface: "platform",
        locale: "unknown",
        accountType: workspace.type,
        outcome: "completed",
        reason: result.feedbackType,
      });
    }
    return response(result, 201);
  } catch (value) {
    if (value instanceof AiFeedbackError) return response({ code: value.code, error: error("uz") }, 404);
    throw value;
  }
});
