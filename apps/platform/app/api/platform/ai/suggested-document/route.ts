import { z } from "zod";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  aiSuggestedDocumentIdempotencyKeySchema,
  aiSuggestedDocumentRequestSchema,
  AiSuggestedDocumentError,
  createAiSuggestedDocumentDraft,
  previewAiSuggestedDocument,
} from "../../../../../lib/ai/suggested-document";
import { aiText, parseAiOutputLocale, type AiOutputLocale } from "../../../../../lib/ai/localization";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, status === 200 ? { headers: { "cache-control": "private, no-store" } } : { status, headers: { "cache-control": "private, no-store" } });
}

function localizedError(locale: AiOutputLocale, code: string): string {
  if (code === "AI_SUGGESTED_DOCUMENT_NOT_FOUND") return aiText(locale, "Сохранённая рекомендация AI не найдена.", "Saqlangan AI tavsiyasi topilmadi.", "The saved AI document recommendation was not found.");
  if (code === "AI_SUGGESTED_DOCUMENT_UNAVAILABLE") return aiText(locale, "Подходящий опубликованный шаблон пока недоступен.", "Mos e’lon qilingan shablon hozircha mavjud emas.", "A suitable published English template is not available yet.");
  if (code === "AI_SUGGESTED_DOCUMENT_CONFLICT") return aiText(locale, "Этот запрос уже использован с другими данными. Обновите предпросмотр.", "Bu so‘rov boshqa ma’lumotlar bilan ishlatilgan. Ko‘rib chiqishni yangilang.", "This request was already used with different data. Refresh the preview.");
  if (code === "AI_SUGGESTED_DOCUMENT_SENSITIVE_CONSENT_REQUIRED") return aiText(locale, "Подтвердите сохранение выбранных конфиденциальных реквизитов.", "Tanlangan maxfiy rekvizitlarni saqlashni tasdiqlang.", "Confirm that the selected sensitive details may be saved.");
  return aiText(locale, "Рекомендацию документа не удалось проверить.", "Hujjat tavsiyasini tekshirib bo‘lmadi.", "The document recommendation could not be verified.");
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const raw = await parseJsonRequest(request, z.unknown(), 64_000);
  const locale = raw.ok && raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
    ? parseAiOutputLocale((raw.data as { locale?: unknown }).locale)
    : "ru";
  if (!raw.ok) {
    return response({ code: "AI_SUGGESTED_DOCUMENT_INVALID", error: localizedError(locale, "AI_SUGGESTED_DOCUMENT_INVALID") }, raw.error === "payload_too_large" ? 413 : 400);
  }
  if (!raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) {
    return response({ code: "AI_SUGGESTED_DOCUMENT_INVALID", error: localizedError(locale, "AI_SUGGESTED_DOCUMENT_INVALID") }, 400);
  }
  const parsed = aiSuggestedDocumentRequestSchema.safeParse({ action: "preview", ...raw.data });
  if (!parsed.success) return response({ code: "AI_SUGGESTED_DOCUMENT_INVALID", error: localizedError(locale, "AI_SUGGESTED_DOCUMENT_INVALID") }, 400);
  const db = requireD1();
  try {
    if (parsed.data.action === "preview") {
      return response(await previewAiSuggestedDocument({
        db, workspaceId: workspace.id, user,
        assistantMessageId: parsed.data.assistantMessageId,
        locale: parsed.data.locale,
      }));
    }
    const idempotency = aiSuggestedDocumentIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!idempotency.success) return response({ code: "AI_SUGGESTED_DOCUMENT_INVALID", error: localizedError(parsed.data.locale, "AI_SUGGESTED_DOCUMENT_INVALID") }, 400);
    const result = await createAiSuggestedDocumentDraft({
      db, workspaceId: workspace.id, workspaceRole: workspace.role, user,
      assistantMessageId: parsed.data.assistantMessageId,
      locale: parsed.data.locale,
      fields: parsed.data.fields,
      sensitiveDataConsent: parsed.data.sensitiveDataConsent,
      idempotencyKey: idempotency.data,
    });
    return response(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (!(error instanceof AiSuggestedDocumentError)) throw error;
    const status = error.code === "AI_SUGGESTED_DOCUMENT_NOT_FOUND" ? 404
      : error.code === "AI_SUGGESTED_DOCUMENT_CONFLICT" ? 409 : 422;
    return response({ code: error.code, error: localizedError(parsed.data.locale, error.code) }, status);
  }
});
