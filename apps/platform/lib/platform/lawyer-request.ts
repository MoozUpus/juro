import { z } from "zod";

const uuid = z.string().uuid();
const localizedLocale = z.enum(["ru", "uz"]);

export const lawyerRequestSchema = z.object({
  // A first-time Client may start with a marketplace intake rather than an
  // already-created matter. The request route creates a private Client case
  // atomically in that situation; a supplied ID is still scoped server-side.
  caseId: uuid.optional(),
  lawyerProfileId: uuid.optional(),
  anonymizedSummary: z.string().trim().min(20).max(2_000),
  serviceCode: z.enum([
    "initial_consultation",
    "document_review",
    "case_strategy",
    "representation",
    "other",
  ]).optional(),
  preferredFormat: z.enum(["chat", "video", "phone", "office"]).optional(),
  proposedStartsAt: z.string().datetime({ offset: true }).optional(),
  consent: z.literal(true),
  locale: localizedLocale,
}).strict();

export const conflictCheckDecisionSchema = z.object({
  decision: z.enum(["clear", "conflict"]),
  locale: localizedLocale,
}).strict();

export const lawyerAccessGrantSchema = z.object({
  consent: z.literal(true),
  locale: localizedLocale,
}).strict();

export function localizedHandoffError(locale: "ru" | "uz", code: string) {
  const ru = locale === "ru";
  const messages: Record<string, string> = {
    PLAN_LIMIT: ru ? "Передача дела юристу недоступна на бесплатном плане." : "Ishni yuristga topshirish bepul rejada mavjud emas.",
    CASE_UNAVAILABLE: ru ? "Выбранное дело недоступно." : "Tanlangan ish mavjud emas.",
    LAWYER_UNAVAILABLE: ru ? "Выбранный юрист сейчас недоступен." : "Tanlangan yurist hozir mavjud emas.",
    REQUEST_UNAVAILABLE: ru ? "Заявка недоступна." : "So‘rov mavjud emas.",
    CONFLICT_REQUIRED: ru ? "Сначала необходим положительный conflict check." : "Avval ijobiy manfaatlar to‘qnashuvi tekshiruvi talab qilinadi.",
    GRANT_EXISTS: ru ? "Доступ к этому делу уже предоставлен." : "Bu ishga kirish huquqi allaqachon berilgan.",
    INVALID_INPUT: ru ? "Проверьте введённые данные." : "Kiritilgan ma’lumotlarni tekshiring.",
  };
  return messages[code] ?? (ru ? "Не удалось выполнить действие." : "Amalni bajarib bo‘lmadi.");
}

export type LawyerRequestInput = z.infer<typeof lawyerRequestSchema>;
