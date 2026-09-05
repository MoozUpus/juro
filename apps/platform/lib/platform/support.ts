import { z } from "zod";

export const supportTicketSchema = z.object({
  category: z.enum(["technical", "ai_error", "wrong_norm", "document", "ocr", "tariff", "lawyer", "privacy", "security", "deletion", "workspace", "feedback", "other"]),
  severity: z.enum(["low", "normal", "high", "critical"]),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(10).max(8_000),
  locale: z.enum(["ru", "uz", "en"]),
}).strict();

export const supportTicketReplySchema = z.object({
  message: z.string().trim().min(1).max(8_000),
}).strict();
