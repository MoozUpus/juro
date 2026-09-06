import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUserById } from "../../../../../lib/platform/workspace";
import {
  issueQuestionIntake,
  questionIntakeCreateSchema,
  questionIntakeKeyring,
  QuestionIntakeError,
} from "../../../../../lib/ai/question-intake";
import { aiText, parseAiOutputLocale, type AiOutputLocale } from "../../../../../lib/ai/localization";

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

function intakeError(error: QuestionIntakeError, language: AiOutputLocale) {
  if (error.code === "AI_QUESTION_INTAKE_CAPACITY_EXCEEDED") {
    return response({
      code: error.code,
      error: aiText(language, "Завершите один из ранее открытых черновиков вопроса.", "Oldin ochilgan savol qoralamalaridan birini yakunlang.", "Finish one of your existing question drafts before creating another."),
    }, 429);
  }
  if (error.code === "AI_QUESTION_INTAKE_INVALID") {
    return response({
      code: error.code,
      error: aiText(language, "Введите вопрос длиной не более 4 000 символов.", "4 000 belgidan oshmaydigan savol kiriting.", "Enter a question of no more than 4,000 characters."),
    }, 400);
  }
  return response({
    code: error.code,
    error: aiText(language, "Защищённая передача вопроса временно недоступна.", "Savolni himoyalangan tarzda uzatish vaqtincha mavjud emas.", "Secure question transfer is temporarily unavailable."),
  }, error.code === "AI_QUESTION_INTAKE_UNAVAILABLE" ? 404 : 503);
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const language = parseAiOutputLocale(request.headers.get("x-juro-locale"));
  const parsed = await parseJsonRequest(request, questionIntakeCreateSchema, 20_000);
  if (!parsed.ok) {
    return response({
      code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "AI_QUESTION_INTAKE_INVALID",
      error: aiText(language, "Введите вопрос длиной не более 4 000 символов.", "4 000 belgidan oshmaydigan savol kiriting.", "Enter a question of no more than 4,000 characters."),
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const user = await requireApiUser(request);
  const workspace = await workspaceForUserById(user.id, parsed.data.workspaceId);
  if (!workspace) {
    return response({
      code: "AI_QUESTION_INTAKE_UNAVAILABLE",
      error: aiText(language, "Защищённая передача вопроса недоступна для этого рабочего пространства.", "Bu ish maydoni uchun savolni himoyalangan tarzda uzatish mavjud emas.", "Secure question transfer is unavailable for this workspace."),
    }, 404);
  }
  try {
    const intake = await issueQuestionIntake({
      db: requireD1(),
      keyring: questionIntakeKeyring(runtimeEnv().IDENTITY_KEYRING),
      workspaceId: workspace.id,
      userId: user.id,
      question: parsed.data.question,
    });
    return response(intake, 201);
  } catch (error) {
    if (error instanceof QuestionIntakeError) return intakeError(error, language);
    throw error;
  }
});
