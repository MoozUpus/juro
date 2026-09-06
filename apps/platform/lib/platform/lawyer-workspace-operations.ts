import { z } from "zod";
import { lawyerText } from "./lawyer-localization";
import type { PlatformLocale } from "./routing";

const uuid = z.string().uuid();
const locale = z.enum(["ru", "uz", "en"]);

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

export function lawyerWorkspaceOperationError(localeValue: PlatformLocale, code: string) {
  const values: Record<string, [string, string, string]> = {
    INVALID_INPUT: ["Проверьте введённые данные.", "Kiritilgan ma’lumotlarni tekshiring.", "Review the information provided and try again."],
    REQUEST_UNAVAILABLE: ["Заявка или доступ к делу недоступны.", "So‘rov yoki ishga ruxsat mavjud emas.", "The request or case access is unavailable."],
    TASK_UNAVAILABLE: ["Задача недоступна для изменения.", "Vazifani o‘zgartirish mumkin emas.", "This task cannot be updated."],
    DOCUMENT_UNAVAILABLE: ["Документ недоступен для этого дела.", "Hujjat bu ish uchun mavjud emas.", "This document is unavailable for the case."],
    DOCUMENT_REQUEST_UNAVAILABLE: ["Запрос документа недоступен.", "Hujjat so‘rovi mavjud emas.", "The document request is unavailable."],
    INVALID_TRANSITION: ["Это изменение статуса недоступно.", "Bu holat o‘zgarishi mumkin emas.", "This status change is not available."],
  };
  const value = values[code];
  return value
    ? lawyerText(localeValue, value[0], value[1], value[2])
    : lawyerText(localeValue, "Не удалось выполнить действие.", "Amalni bajarib bo‘lmadi.", "We could not complete this action.");
}
