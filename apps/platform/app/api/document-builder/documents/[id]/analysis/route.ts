import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireOwner } from "../../../../../../lib/document-builder/permissions";
import { requireD1, requireR2, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import {
  builderAnalysisIdempotencyKeySchema,
  builderAnalysisRequestSchema,
  BuilderAnalysisError,
  startBuilderDocumentAnalysis,
} from "../../../../../../lib/document-analysis/builder-analysis";
import {
  assertOperationalFeatureEnabled,
  operationalEnvironment,
  OperationalFeatureError,
  operationalFeatureMessage,
} from "../../../../../../lib/operations/operational-feature-flags";
import { isLocale, type PlatformLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function requestLocale(request: Request): PlatformLocale {
  const requested = request.headers.get("x-juro-locale")?.trim().toLowerCase() ?? "";
  return isLocale(requested) ? requested : "ru";
}

function message(locale: PlatformLocale, code: BuilderAnalysisError["code"] | "BUILDER_ANALYSIS_INVALID_REQUEST"): string {
  const messages: Record<typeof code, Record<PlatformLocale, string>> = {
    BUILDER_ANALYSIS_NOT_FOUND: { ru: "Документ не найден.", uz: "Hujjat topilmadi.", en: "The document was not found." },
    BUILDER_ANALYSIS_INVALID_DOCUMENT: { ru: "В документе недостаточно текста для анализа.", uz: "Hujjatda tahlil uchun yetarli matn yo‘q.", en: "The document does not contain enough text to analyse." },
    BUILDER_ANALYSIS_TOO_LARGE: { ru: "Текст документа слишком большой для текущего режима анализа.", uz: "Hujjat matni joriy tahlil rejimi uchun juda katta.", en: "The document text is too large for the selected analysis mode." },
    BUILDER_ANALYSIS_PLAN_LIMIT: { ru: "Полный и экспертный анализ доступны на подходящем тарифе. Быстрый анализ доступен сейчас.", uz: "To‘liq va ekspert tahlili mos tarifda mavjud. Tezkor tahlil hozir mavjud.", en: "Full and expert analysis require an eligible plan. Quick analysis is available now." },
    BUILDER_ANALYSIS_CAPACITY_UNAVAILABLE: { ru: "Можно хранить не более 20 анализов общим объёмом до 1 ГБ. Удалите ненужный анализ.", uz: "20 tagacha, jami 1 GB hajmdagi tahlilni saqlash mumkin. Keraksiz tahlilni o‘chiring.", en: "You can store up to 20 analyses with a combined size of 1 GB. Delete an analysis you no longer need." },
    BUILDER_ANALYSIS_IDEMPOTENCY_CONFLICT: { ru: "Документ изменился после запуска. Повторите анализ текущей версии.", uz: "Tahlil boshlanganidan keyin hujjat o‘zgardi. Joriy nusxani qayta tahlil qiling.", en: "The document changed after analysis started. Run the analysis again for the current revision." },
    BUILDER_ANALYSIS_STORAGE_FAILED: { ru: "Приватный снимок документа не сохранён. Анализ не запущен.", uz: "Hujjatning maxfiy nusxasi saqlanmadi. Tahlil boshlanmadi.", en: "The private document snapshot could not be saved, so analysis was not started." },
    BUILDER_ANALYSIS_PERSISTENCE_FAILED: { ru: "Анализ не поставлен в очередь. Попробуйте ещё раз.", uz: "Tahlil navbatga qo‘yilmadi. Qayta urinib ko‘ring.", en: "The analysis could not be added to the queue. Try again." },
    BUILDER_ANALYSIS_INVALID_REQUEST: { ru: "Проверьте режим и язык анализа.", uz: "Tahlil rejimi va tilini tekshiring.", en: "Check the analysis mode and language." },
  };
  return messages[code][locale];
}

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  assertSafeWrite(request);
  const uiLocale = requestLocale(request);
  const user = await requireApiUser();
  const { id } = await context.params;
  const access = await requireOwner(id, user.id);
  if (!access?.workspaceId) return response({ code: "BUILDER_ANALYSIS_NOT_FOUND", error: message(uiLocale, "BUILDER_ANALYSIS_NOT_FOUND") }, 404);
  const raw = await parseJsonRequest(request, z.unknown(), 4_096);
  if (!raw.ok) {
    return response({ code: "BUILDER_ANALYSIS_INVALID_REQUEST", error: message(uiLocale, "BUILDER_ANALYSIS_INVALID_REQUEST") }, raw.error === "payload_too_large" ? 413 : 400);
  }
  const parsed = builderAnalysisRequestSchema.safeParse(raw.data);
  if (!parsed.success) return response({ code: "BUILDER_ANALYSIS_INVALID_REQUEST", error: message(uiLocale, "BUILDER_ANALYSIS_INVALID_REQUEST") }, 400);
  const idempotency = builderAnalysisIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!idempotency.success) {
    return response({ code: "BUILDER_ANALYSIS_INVALID_REQUEST", error: message(uiLocale, "BUILDER_ANALYSIS_IDEMPOTENCY_CONFLICT") }, 400);
  }
  const db = requireD1();
  try {
    await assertOperationalFeatureEnabled({
      db,
      environment: operationalEnvironment(runtimeEnv().APP_ENV),
      key: "document_analysis_upload",
    });
    const result = await startBuilderDocumentAnalysis({
      db,
      bucket: requireR2(),
      workspaceId: access.workspaceId,
      userId: user.id,
      documentId: id,
      mode: parsed.data.mode,
      locale: parsed.data.locale,
      idempotencyKey: idempotency.data,
    });
    return response(result, result.replayed ? 200 : 202);
  } catch (error) {
    if (error instanceof OperationalFeatureError) {
      return response({ code: error.code, error: operationalFeatureMessage(uiLocale) }, 503);
    }
    if (error instanceof BuilderAnalysisError) {
      return response({ code: error.code, error: message(uiLocale, error.code) }, error.status);
    }
    throw error;
  }
});
