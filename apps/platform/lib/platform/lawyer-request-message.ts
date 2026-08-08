import { z } from "zod";

export const lawyerRequestMessageSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
  locale: z.enum(["ru", "uz"]),
}).strict();

export function lawyerRequestMessageError(locale: "ru" | "uz", code: string) {
  const ru = locale === "ru";
  const messages: Record<string, string> = {
    REQUEST_UNAVAILABLE: ru ? "Переписка по заявке недоступна." : "So‘rov bo‘yicha yozishma mavjud emas.",
    INVALID_INPUT: ru ? "Проверьте текст сообщения." : "Xabar matnini tekshiring.",
  };
  return messages[code] ?? (ru ? "Не удалось отправить сообщение." : "Xabarni yuborib bo‘lmadi.");
}