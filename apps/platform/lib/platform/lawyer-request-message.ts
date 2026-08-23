import { z } from "zod";

const sendMessageSchema = z.object({
  action: z.literal("send").optional(),
  body: z.string().trim().max(4_000).optional().default(""),
  documentId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().optional(),
  locale: z.enum(["ru", "uz"]),
}).strict().refine((value) => Boolean(value.body || value.documentId), {
  message: "A message requires text or a document",
});

const markMessagesReadSchema = z.object({
  action: z.literal("mark_read"),
  locale: z.enum(["ru", "uz"]),
}).strict();

const pinMessageSchema = z.object({
  action: z.literal("pin"),
  messageId: z.string().uuid(),
  pinned: z.boolean(),
  locale: z.enum(["ru", "uz"]),
}).strict();

const typingSchema = z.object({
  action: z.literal("typing"),
  typing: z.boolean(),
  locale: z.enum(["ru", "uz"]),
}).strict();

export const lawyerRequestMessageSchema = z.union([
  sendMessageSchema,
  markMessagesReadSchema,
  pinMessageSchema,
  typingSchema,
]);

export function lawyerRequestMessageError(locale: "ru" | "uz", code: string) {
  const ru = locale === "ru";
  const messages: Record<string, string> = {
    REQUEST_UNAVAILABLE: ru ? "Переписка по заявке недоступна." : "So‘rov bo‘yicha yozishma mavjud emas.",
    INVALID_INPUT: ru ? "Добавьте текст или выберите документ." : "Matn kiriting yoki hujjatni tanlang.",
    DOCUMENT_UNAVAILABLE: ru ? "Этот документ нельзя прикрепить к заявке." : "Bu hujjatni so‘rovga biriktirib bo‘lmaydi.",
    MESSAGE_UNAVAILABLE: ru ? "Это сообщение недоступно в текущей переписке." : "Bu xabar joriy yozishmada mavjud emas.",
  };
  return messages[code] ?? (ru ? "Не удалось отправить сообщение." : "Xabarni yuborib bo‘lmadi.");
}
