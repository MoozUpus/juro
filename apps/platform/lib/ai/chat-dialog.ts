import { z } from "zod";

export const clarificationAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(4_000),
}).strict();

export const clarificationAnswersSchema = z.array(clarificationAnswerSchema).min(1).max(3)
  .superRefine((answers, context) => {
    const questions = new Set<string>();
    for (const [index, item] of answers.entries()) {
      const normalized = item.question.trim().toLocaleLowerCase("ru");
      if (questions.has(normalized)) {
        context.addIssue({ code: "custom", message: "CLARIFICATION_QUESTION_DUPLICATED", path: [index, "question"] });
      }
      questions.add(normalized);
    }
  });

export type ClarificationAnswer = z.infer<typeof clarificationAnswerSchema>;

export const aiAnswerPreferencesSchema = z.object({
  responseStyle: z.enum(["plain", "legal"]).default("plain"),
  clarificationPolicy: z.literal("critical_only").default("critical_only"),
  solutionPath: z.enum(["recommended", "all_legal_options"]).default("recommended"),
  includeLegalDetails: z.boolean().default(false),
}).strict();

export type AiAnswerPreferences = z.infer<typeof aiAnswerPreferencesSchema>;

export const storedUserMessageMetaSchema = z.object({
  kind: z.literal("juro_ai_user_message").optional(),
  clarificationAnswers: clarificationAnswersSchema.optional(),
  legalContextDate: z.string().date().nullable().optional(),
  preferences: aiAnswerPreferencesSchema.optional(),
}).strict();

export type StoredUserMessageMeta = z.infer<typeof storedUserMessageMetaSchema>;

export function parseClarificationAnswers(value: unknown): ClarificationAnswer[] | null {
  const parsed = clarificationAnswersSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseStoredUserMessageMeta(value: unknown): StoredUserMessageMeta | null {
  const parsed = storedUserMessageMetaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeAiAnswerPreferences(value: unknown): AiAnswerPreferences | null {
  const parsed = aiAnswerPreferencesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : null;
}

export function formatClarificationAnswers(locale: "ru" | "uz", answers: ClarificationAnswer[]): string {
  const heading = locale === "ru" ? "Уточнения пользователя:" : "Foydalanuvchi aniqliklari:";
  return [heading, ...answers.map((item) => `${item.question}\n${item.answer}`)].join("\n\n");
}

export function clarificationQuestionKind(question: string): "date" | "number" | "text" {
  const normalized = question.toLocaleLowerCase("ru");
  if (/(дата|когда|срок|qachon|sana|muddat)/u.test(normalized)) return "date";
  if (/(сумм|размер|стоим|оплат|заработ|so['’`ʻ‘]?m|miqdor|narx|to['’`ʻ‘]?lov)/u.test(normalized)) return "number";
  return "text";
}

export function aiPreferenceInstruction(input: AiAnswerPreferences, locale: "ru" | "uz"): string {
  const lines = [
    "Задавай уточняющие вопросы только когда без факта существенно меняются применимая норма, срок, срочность, риск, квалификация или необходимость передачи юристу.",
    "Не проси уточнения только для полноты: если безопасен предварительный ответ, дай его и явно обозначь предположения.",
    "За один clarification turn задай не более трёх коротких вопросов; один вопрос должен запрашивать один недостающий факт.",
  ];
  if (input.responseStyle === "plain") lines.push("Объясняй простым языком; юридический термин сразу поясняй, если без него нельзя.");
  else lines.push("Используй юридически точный язык, но не усложняй текст без необходимости.");
  if (input.solutionPath === "all_legal_options") lines.push("Когда это безопасно и подтверждено, покажи все существенные законные варианты и их ключевые различия.");
  else lines.push("Сначала предложи рекомендуемый законный следующий шаг; альтернативы показывай только если они существенно меняют выбор пользователя.");
  if (input.includeLegalDetails) lines.push("Показывай реквизиты подтверждённых норм и дату применимой редакции рядом с источником, если они доступны.");
  if (locale === "uz") lines.push("Matnni o‘zbek lotin yozuvida tabiiy va tushunarli tuzing.");
  return lines.join(" ");
}
