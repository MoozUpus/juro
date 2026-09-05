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
import { aiText, parseAiOutputLocale } from "../../../../../../lib/ai/localization";

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

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const language = parseAiOutputLocale(request.headers.get("x-juro-locale"));
  const parsed = await parseJsonRequest(request, questionIntakeConsumeSchema, 512);
  if (!parsed.ok) {
    return response({
      code: "AI_QUESTION_INTAKE_UNAVAILABLE",
      error: aiText(language, "Черновик вопроса недоступен.", "Savol qoralamasi mavjud emas.", "The question draft is unavailable."),
    }, 404);
  }
  const user = await requireApiUser(request);
  const workspace = await workspaceForUserById(user.id, parsed.data.workspaceId);
  if (!workspace) {
    return response({
      code: "AI_QUESTION_INTAKE_UNAVAILABLE",
      error: aiText(language, "Черновик вопроса недоступен.", "Savol qoralamasi mavjud emas.", "The question draft is unavailable."),
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
        ? aiText(language, "Черновик вопроса истёк или уже был открыт.", "Savol qoralamasi eskirgan yoki avval ochilgan.", "The question draft has expired or was already opened.")
        : aiText(language, "Защищённый черновик временно недоступен.", "Himoyalangan qoralama vaqtincha mavjud emas.", "The secure question draft is temporarily unavailable."),
    }, unavailable ? 404 : 503);
  }
});
