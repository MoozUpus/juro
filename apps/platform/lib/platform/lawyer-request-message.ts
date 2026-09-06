import { z } from "zod";
import { lawyerText } from "./lawyer-localization";
import type { PlatformLocale } from "./routing";

const sendMessageSchema = z.object({
  action: z.literal("send").optional(),
  body: z.string().trim().max(4_000).optional().default(""),
  documentId: z.string().uuid().optional(),
  locale: z.enum(["ru", "uz", "en"]),
}).strict().refine((value) => Boolean(value.body || value.documentId), {
  message: "A message requires text or a document",
});

const markMessagesReadSchema = z.object({
  action: z.literal("mark_read"),
  locale: z.enum(["ru", "uz", "en"]),
}).strict();

export const lawyerRequestMessageSchema = z.union([
  sendMessageSchema,
  markMessagesReadSchema,
]);

export function lawyerRequestMessageError(locale: PlatformLocale, code: string) {
  const messages: Record<string, string> = {
    REQUEST_UNAVAILABLE: lawyerText(locale, "Переписка по заявке недоступна.", "So‘rov bo‘yicha yozishma mavjud emas.", "Messages for this request are unavailable."),
    INVALID_INPUT: lawyerText(locale, "Добавьте текст или выберите документ.", "Matn kiriting yoki hujjatni tanlang.", "Add a message or select a document."),
    DOCUMENT_UNAVAILABLE: lawyerText(locale, "Этот документ нельзя прикрепить к заявке.", "Bu hujjatni so‘rovga biriktirib bo‘lmaydi.", "This document cannot be attached to the request."),
  };
  return messages[code] ?? lawyerText(locale, "Не удалось отправить сообщение.", "Xabarni yuborib bo‘lmadi.", "We could not send the message.");
}
