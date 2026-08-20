import { z } from "zod";

const sendMessageSchema = z.object({
  action: z.literal("send").optional(),
  body: z.string().trim().max(4_000).optional().default(""),
  documentId: z.string().uuid().optional(),
  locale: z.enum(["ru", "uz"]),
}).strict().refine((value) => Boolean(value.body || value.documentId), {
  message: "A message requires text or a document",
});

const markMessagesReadSchema = z.object({
  action: z.literal("mark_read"),
  locale: z.enum(["ru", "uz"]),
}).strict();

export const lawyerRequestMessageSchema = z.union([
  sendMessageSchema,
  markMessagesReadSchema,
]);

export function lawyerRequestMessageError(locale: "ru" | "uz", code: string) {
  const ru = locale === "ru";
  const messages: Record<string, string> = {
    REQUEST_UNAVAILABLE: ru ? "Переписка по заявке недоступна." : "So‘rov bo‘yicha yozishma mavjud emas.",
    INVALID_INPUT: ru ? "Добавьте текст или выберите документ." : "Matn kiriting yoki hujjatni tanlang.",
    DOCUMENT_UNAVAILABLE: ru ? "Этот документ нельзя прикрепить к заявке." : "Bu hujjatni so‘rovga biriktirib bo‘lmaydi.",
  };
  return messages[code] ?? (ru ? "Не удалось отправить сообщение." : "Xabarni yuborib bo‘lmadi.");
}
