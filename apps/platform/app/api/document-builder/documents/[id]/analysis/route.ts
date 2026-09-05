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

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function message(locale: "ru" | "uz", code: BuilderAnalysisError["code"]): string {
  const ru = locale === "ru";
  if (code === "BUILDER_ANALYSIS_NOT_FOUND") return ru ? "Документ не найден." : "Hujjat topilmadi.";
  if (code === "BUILDER_ANALYSIS_INVALID_DOCUMENT") return ru ? "В документе недостаточно текста для анализа." : "Hujjatda tahlil uchun yetarli matn yo‘q.";
  if (code === "BUILDER_ANALYSIS_TOO_LARGE") return ru ? "Текст документа слишком большой для текущего режима анализа." : "Hujjat matni joriy tahlil rejimi uchun juda katta.";
  if (code === "BUILDER_ANALYSIS_PLAN_LIMIT") return ru ? "Полный и экспертный анализ доступны на подходящем тарифе. Быстрый анализ доступен сейчас." : "To‘liq va ekspert tahlili mos tarifda mavjud. Tezkor tahlil hozir mavjud.";
  if (code === "BUILDER_ANALYSIS_CAPACITY_UNAVAILABLE") return ru ? "Можно хранить не более 20 анализов общим объёмом до 1 ГБ. Удалите ненужный анализ." : "20 tagacha, jami 1 GB hajmdagi tahlilni saqlash mumkin. Keraksiz tahlilni o‘chiring.";
  if (code === "BUILDER_ANALYSIS_IDEMPOTENCY_CONFLICT") return ru ? "Документ изменился после запуска. Повторите анализ текущей версии." : "Tahlil boshlanganidan keyin hujjat o‘zgardi. Joriy nusxani qayta tahlil qiling.";
  if (code === "BUILDER_ANALYSIS_STORAGE_FAILED") return ru ? "Приватный снимок документа не сохранён. Анализ не запущен." : "Hujjatning maxfiy nusxasi saqlanmadi. Tahlil boshlanmadi.";
  return ru ? "Анализ не поставлен в очередь. Попробуйте ещё раз." : "Tahlil navbatga qo‘yilmadi. Qayta urinib ko‘ring.";
}

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { id } = await context.params;
  const access = await requireOwner(id, user.id);
  if (!access?.workspaceId) return response({ code: "BUILDER_ANALYSIS_NOT_FOUND", error: "Документ не найден." }, 404);
  const raw = await parseJsonRequest(request, z.unknown(), 4_096);
  if (!raw.ok) {
    return response({ code: "BUILDER_ANALYSIS_INVALID_REQUEST", error: "Проверьте режим и язык анализа." }, raw.error === "payload_too_large" ? 413 : 400);
  }
  const parsed = builderAnalysisRequestSchema.safeParse(raw.data);
  if (!parsed.success) return response({ code: "BUILDER_ANALYSIS_INVALID_REQUEST", error: "Проверьте режим и язык анализа." }, 400);
  const idempotency = builderAnalysisIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!idempotency.success) {
    return response({ code: "BUILDER_ANALYSIS_INVALID_REQUEST", error: message(parsed.data.locale, "BUILDER_ANALYSIS_IDEMPOTENCY_CONFLICT") }, 400);
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
      return response({ code: error.code, error: operationalFeatureMessage(parsed.data.locale) }, 503);
    }
    if (error instanceof BuilderAnalysisError) {
      return response({ code: error.code, error: message(parsed.data.locale, error.code) }, error.status);
    }
    throw error;
  }
});
