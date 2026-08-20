import { z } from "zod";

const uuid = z.string().uuid();
const locale = z.enum(["ru", "uz"]);

export const lawyerTaskOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    requestId: uuid,
    title: z.string().trim().min(2).max(240),
    description: z.string().trim().max(2_000).optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    locale,
  }).strict(),
  z.object({
    action: z.literal("update"),
    requestId: uuid,
    taskId: uuid,
    status: z.enum(["planned", "in_progress", "waiting_information", "waiting_counterparty", "overdue", "completed", "cancelled"]),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    locale,
  }).strict(),
  z.object({
    action: z.literal("comment"),
    requestId: uuid,
    taskId: uuid,
    body: z.string().trim().min(1).max(2_000),
    locale,
  }).strict(),
]);

export const lawyerDocumentRequestOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    requestId: uuid,
    title: z.string().trim().min(2).max(240),
    description: z.string().trim().min(4).max(2_000),
    locale,
  }).strict(),
  z.object({
    action: z.literal("provide"),
    requestId: uuid,
    documentRequestId: uuid,
    documentId: uuid,
    locale,
  }).strict(),
  z.object({
    action: z.literal("cancel"),
    requestId: uuid,
    documentRequestId: uuid,
    locale,
  }).strict(),
]);

export function lawyerWorkspaceOperationError(localeValue: "ru" | "uz", code: string) {
  const ru = localeValue === "ru";
  const values: Record<string, [string, string]> = {
    INVALID_INPUT: ["Проверьте введённые данные.", "Kiritilgan ma’lumotlarni tekshiring."],
    REQUEST_UNAVAILABLE: ["Заявка или доступ к делу недоступны.", "So‘rov yoki ishga ruxsat mavjud emas."],
    TASK_UNAVAILABLE: ["Задача недоступна для изменения.", "Vazifani o‘zgartirish mumkin emas."],
    DOCUMENT_UNAVAILABLE: ["Документ недоступен для этого дела.", "Hujjat bu ish uchun mavjud emas."],
    DOCUMENT_REQUEST_UNAVAILABLE: ["Запрос документа недоступен.", "Hujjat so‘rovi mavjud emas."],
    INVALID_TRANSITION: ["Это изменение статуса недоступно.", "Bu holat o‘zgarishi mumkin emas."],
  };
  return values[code]?.[ru ? 0 : 1] ?? (ru ? "Не удалось выполнить действие." : "Amalni bajarib bo‘lmadi.");
}
