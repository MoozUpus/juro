import { z } from "zod";

const compactText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null).optional();
const stringList = (maximumItems: number) => z.array(compactText(80)).min(1).max(maximumItems).transform((items) => [...new Set(items)]);

export const lawyerAvailabilitySchema = z.enum(["unknown", "available", "limited", "unavailable"]);
export const lawyerAdvocateStatusSchema = z.enum(["not_declared", "declared"]);

const editableFields = {
  displayName: compactText(160),
  specialties: stringList(20),
  languages: stringList(10),
  experienceYears: z.number().int().min(0).max(99).nullable().optional(),
  priceDescription: optionalText(280),
  availabilityStatus: lawyerAvailabilitySchema,
  nextAvailableAt: z.string().datetime({ offset: true }).nullable().optional(),
  advocateStatus: lawyerAdvocateStatusSchema,
  firmName: optionalText(180),
  bio: optionalText(2_000),
  city: optionalText(100),
  region: optionalText(100),
  education: optionalText(500),
  consultationFormats: stringList(10).optional(),
};

export const lawyerProfileCreateSchema = z.object({ ...editableFields, locale: z.enum(["ru", "uz"]) }).strict();
export const lawyerProfileUpdateSchema = z.object({ ...editableFields, locale: z.enum(["ru", "uz"]) }).partial().strict().refine(
  (value) => Object.keys(value).some((key) => key !== "locale"),
  "At least one editable field is required",
);

export const lawyerProfileModerationListSchema = z.object({
  status: z.enum(["profile_incomplete", "pending_review", "changes_requested", "public_approved", "rejected", "suspended", "blocked", "archived"]).default("pending_review"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const lawyerProfileModerationSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  reason: compactText(2_000),
  locale: z.enum(["ru", "uz"]),
}).strict();

export const lawyerProfileLifecycleSchema = z.object({
  action: z.enum(["suspend", "block", "archive", "restore"]),
  reason: compactText(2_000),
  locale: z.enum(["ru", "uz"]),
}).strict();

export function lawyerProfileError(locale: "ru" | "uz", code: "PROFILE_UNAVAILABLE" | "PROFILE_FORBIDDEN" | "PROFILE_LOCKED" | "INVALID_INPUT") {
  const ru = locale === "ru";
  const messages = {
    PROFILE_UNAVAILABLE: ru ? "Профиль юриста недоступен." : "Yurist profili mavjud emas.",
    PROFILE_FORBIDDEN: ru ? "Этот раздел доступен только для профиля юриста." : "Bu bo‘lim faqat yurist profiliga tegishli.",
    PROFILE_LOCKED: ru ? "Профиль временно ограничен модерацией и не может быть изменён." : "Profil moderatsiya tufayli vaqtincha cheklangan va o‘zgartirib bo‘lmaydi.",
    INVALID_INPUT: ru ? "Проверьте данные профессионального профиля." : "Professional profil ma’lumotlarini tekshiring.",
  };
  return messages[code];
}
