import { assertSafeWrite, requireApiUser } from "../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse, notFound } from "../../../../lib/document-builder/auth/responses";
import { AiUnavailableError, arrayBufferToBase64, callOpenAiJson } from "../../../../lib/document-builder/ai/openai";
import { getDocumentAccess } from "../../../../lib/document-builder/permissions";
import { getPrivateObject } from "../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    bank: { type: ["string", "null"] },
    transaction: { type: ["string", "null"] },
    matchesQuestionnaire: { type: ["boolean", "null"] },
    discrepancies: { type: "array", items: { type: "string" }, maxItems: 20 },
    summary: { type: "string" },
  },
  required: ["amount", "date", "bank", "transaction", "matchesQuestionnaire", "discrepancies", "summary"],
};

export async function POST(request: Request): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const body = await request.json() as { documentId?: string; attachmentId?: string; questionnaireSummary?: string };
    if (!body.documentId || !body.attachmentId) return badRequest("Не указано вложение.");
    const access = await getDocumentAccess(body.documentId, user.id);
    if (!access || access.role !== "owner") return forbidden();
    const file = await requireD1().prepare(
      `SELECT f.r2_key AS r2Key, f.file_name AS fileName, f.mime_type AS mimeType
       FROM document_attachments a JOIN document_files f ON f.id = a.file_id
       WHERE a.id = ? AND a.document_id = ? LIMIT 1`,
    ).bind(body.attachmentId, body.documentId).first<{ r2Key: string; fileName: string; mimeType: string }>();
    if (!file) return notFound("Вложение не найдено.");
    const object = await getPrivateObject(file.r2Key);
    if (!object) return notFound("Файл недоступен.");
    try {
      const dataUrl = `data:${file.mimeType};base64,${arrayBufferToBase64(await object.arrayBuffer())}`;
      const content = file.mimeType.startsWith("image/")
        ? [
            { type: "input_text", text: `Сравни файл с анкетой: ${body.questionnaireSummary?.slice(0, 20_000) ?? ""}` },
            { type: "input_image", image_url: dataUrl },
          ]
        : [
            { type: "input_text", text: `Сравни файл с анкетой: ${body.questionnaireSummary?.slice(0, 20_000) ?? ""}` },
            { type: "input_file", filename: file.fileName, file_data: dataUrl },
          ];
      const result = await callOpenAiJson<Record<string, unknown>>({
        schemaName: "juro_attachment_analysis",
        schema,
        instructions: "Проанализируй приложенную квитанцию, подтверждение перевода, документ или изображение. Извлеки сумму, дату, банк и транзакцию, сравни с кратким содержанием анкеты и перечисли расхождения. Не сохраняй результат и не делай вывод о подлинности.",
        input: [{ role: "user", content }],
        rawInput: true,
      });
      return jsonResponse({ status: "completed", result, persisted: false });
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      return jsonResponse({ status: "unavailable", message: `${error.message} Файл сохранён, но содержимое не анализировалось.`, persisted: false });
    }
  } catch (error) {
    return apiError(error);
  }
}
