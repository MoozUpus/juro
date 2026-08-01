import { z } from "zod";

const locale = z.enum(["ru", "uz"]);

export const lawyerOfferCreateSchema = z.object({
  scopeDescription: z.string().trim().min(20).max(2_000),
  priceDescription: z.string().trim().min(2).max(500),
  durationDescription: z.string().trim().min(2).max(500),
  locale,
}).strict();

export const lawyerOfferResponseSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
  locale,
}).strict();

export function lawyerOfferError(localeValue: "ru" | "uz", code: string) {
  const ru = localeValue === "ru";
  const messages: Record<string, string> = {
    REQUEST_UNAVAILABLE: ru ? "Заявка или доступ недоступны." : "So‘rov yoki ruxsat mavjud emas.",
    OFFER_UNAVAILABLE: ru ? "Предложение недоступно." : "Taklif mavjud emas.",
    OFFER_ALREADY_RESOLVED: ru ? "Предложение уже обработано." : "Taklif allaqachon ko‘rib chiqilgan.",
    INVALID_INPUT: ru ? "Проверьте условия предложения." : "Taklif shartlarini tekshiring.",
  };
  return messages[code] ?? (ru ? "Не удалось выполнить действие." : "Amalni bajarib bo‘lmadi.");
}