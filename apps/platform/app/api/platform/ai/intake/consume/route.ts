import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUserById } from "../../../../../../lib/platform/workspace";
import {
  openQuestionIntake,
  questionIntakeConsumeSchema,
  questionIntakeKeyring,
  QuestionIntakeError,
} from "../../../../../../lib/ai/question-intake";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
    },
  });
}

function locale(request: Request): "ru" | "uz" {
  return request.headers.get("x-juro-locale") === "uz" ? "uz" : "ru";
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const language = locale(request);
  const parsed = await parseJsonRequest(request, questionIntakeConsumeSchema, 512);
  if (!parsed.ok) {
    return response({
      code: "AI_QUESTION_INTAKE_UNAVAILABLE",
      error: language === "ru" ? "Черновик вопроса недоступен." : "Savol qoralamasi mavjud emas.",
    }, 404);
  }
  const user = await requireApiUser(request);
  const workspace = await workspaceForUserById(user.id, parsed.data.workspaceId);
  if (!workspace) {
    return response({
      code: "AI_QUESTION_INTAKE_UNAVAILABLE",
      error: language === "ru" ? "Черновик вопроса недоступен." : "Savol qoralamasi mavjud emas.",
    }, 404);
  }
  try {
    const question = await openQuestionIntake({
      db: requireD1(),
      keyring: questionIntakeKeyring(runtimeEnv().IDENTITY_KEYRING),
      workspaceId: workspace.id,
      userId: user.id,
      handle: parsed.data.handle,
    });
    return response({ question });
  } catch (error) {
    if (!(error instanceof QuestionIntakeError)) throw error;
    const unavailable = error.code === "AI_QUESTION_INTAKE_UNAVAILABLE";
    return response({
      code: error.code,
      error: unavailable
        ? (language === "ru" ? "Черновик вопроса истёк или уже был открыт." : "Savol qoralamasi eskirgan yoki avval ochilgan.")
        : (language === "ru" ? "Защищённый черновик временно недоступен." : "Himoyalangan qoralama vaqtincha mavjud emas."),
    }, unavailable ? 404 : 503);
  }
});
