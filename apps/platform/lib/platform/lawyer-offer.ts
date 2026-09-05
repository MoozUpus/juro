import { z } from "zod";
import { lawyerText } from "./lawyer-localization";
import type { PlatformLocale } from "./routing";

const locale = z.enum(["ru", "uz", "en"]);

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

export function lawyerOfferError(localeValue: PlatformLocale, code: string) {
  const messages: Record<string, string> = {
    REQUEST_UNAVAILABLE: lawyerText(localeValue, "Заявка или доступ недоступны.", "So‘rov yoki ruxsat mavjud emas.", "The request or case access is unavailable."),
    OFFER_UNAVAILABLE: lawyerText(localeValue, "Предложение недоступно.", "Taklif mavjud emas.", "The offer is unavailable."),
    OFFER_ALREADY_RESOLVED: lawyerText(localeValue, "Предложение уже обработано.", "Taklif allaqachon ko‘rib chiqilgan.", "This offer has already been resolved."),
    INVALID_INPUT: lawyerText(localeValue, "Проверьте условия предложения.", "Taklif shartlarini tekshiring.", "Review the offer terms and try again."),
  };
  return messages[code] ?? lawyerText(localeValue, "Не удалось выполнить действие.", "Amalni bajarib bo‘lmadi.", "We could not complete this action.");
}
