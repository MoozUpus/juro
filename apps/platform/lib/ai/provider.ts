import { callOpenAiJson, hasAiConfiguration } from "../document-builder/ai/openai";
import { runtimeEnv } from "../document-builder/storage/runtime";

export type LegalSourceContext = {
  id: string;
  actTitle: string;
  actIdentifier: string | null;
  officialUrl: string;
  revisionDate: string | null;
  lastCheckedAt: string;
  locale: string;
  publishedAt: string | null;
  sourceType: string;
  status: string;
  verificationState: string;
  verifiedAt: string;
  contentSha256: string;
};

export type LegalIntakeResult = {
  understanding: string;
  clarificationQuestions: string[];
  nextSteps: string[];
  cautions: string[];
  proposedFacts: string[];
  sourceIds: string[];
  jurisdiction: "UZ";
  sourceMode: "verified_sources" | "intake_only";
  confidencePercent: number;
  sourceConflict: boolean;
  sourceWarning: string | null;
};

export type AiProviderStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
};

export interface LegalAiProvider {
  readonly name: string;
  runIntake(input: { question: string; locale: "ru" | "uz"; sources: LegalSourceContext[] }): Promise<LegalIntakeResult>;
}

const intakeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    understanding: { type: "string" },
    clarificationQuestions: { type: "array", maxItems: 6, items: { type: "string" } },
    nextSteps: { type: "array", maxItems: 5, items: { type: "string" } },
    cautions: { type: "array", maxItems: 4, items: { type: "string" } },
    proposedFacts: { type: "array", maxItems: 10, items: { type: "string" } },
    sourceIds: { type: "array", maxItems: 8, items: { type: "string" } },
    jurisdiction: { type: "string", enum: ["UZ"] },
    sourceMode: { type: "string", enum: ["verified_sources", "intake_only"] },
    confidencePercent: { type: "integer", minimum: 0, maximum: 100 },
    sourceConflict: { type: "boolean" },
    sourceWarning: { type: ["string", "null"] },
  },
  required: ["understanding", "clarificationQuestions", "nextSteps", "cautions", "proposedFacts", "sourceIds", "jurisdiction", "sourceMode", "confidencePercent", "sourceConflict", "sourceWarning"],
} as const;

class OpenAiLegalProvider implements LegalAiProvider {
  readonly name = "openai";

  async runIntake(input: { question: string; locale: "ru" | "uz"; sources: LegalSourceContext[] }) {
    const allowedSourceIds = new Set(input.sources.map(source => source.id));
    const result = await callOpenAiJson<LegalIntakeResult>({
      schemaName: "juro_legal_intake",
      schema: intakeSchema as unknown as Record<string, unknown>,
      timeoutMs: 35_000,
      instructions: [
        "Ты — модуль первичного юридического intake платформы JURO для юрисдикции Республики Узбекистан.",
        "Отделяй факты пользователя от предположений, не обещай результат и не выдавай ответ за заключение юриста.",
        "Не создавай номера статей, названия актов или ссылки. Используй только sourceIds из переданного реестра.",
        "Если реестр пуст или его недостаточно, работай только в режиме intake_only: уточняй факты и предлагай нейтральные безопасные организационные шаги без правовых утверждений.",
        "confidencePercent отражает уверенность только в понимании предоставленных фактов, а не вероятность исхода дела.",
        "Если источники противоречат друг другу или недостаточны, установи sourceConflict и sourceWarning; не скрывай ограничение.",
        input.locale === "uz" ? "Отвечай полностью на узбекском языке." : "Отвечай полностью на русском языке.",
      ].join(" "),
      input: {
        jurisdiction: "UZ",
        question: input.question,
        verifiedSources: input.sources,
      },
    });
    const sourceIds = result.sourceIds.filter(id => allowedSourceIds.has(id));
    return {
      ...result,
      jurisdiction: "UZ" as const,
      sourceMode: sourceIds.length ? "verified_sources" as const : "intake_only" as const,
      sourceIds,
      confidencePercent: Math.max(0, Math.min(100, result.confidencePercent)),
      sourceConflict: Boolean(result.sourceConflict),
      sourceWarning: result.sourceWarning?.trim() || (
        sourceIds.length
          ? null
          : input.locale === "uz"
            ? "Aniq huquqiy manba javob bilan ishonchli bog‘lanmadi."
            : "Конкретный правовой источник не был надёжно связан с ответом."
      ),
    };
  }
}

export function aiProviderStatus(): AiProviderStatus {
  const env = runtimeEnv();
  const provider = env.AI_PROVIDER || (env.OPENAI_API_KEY ? "openai" : null);
  return {
    configured: provider === "openai" && hasAiConfiguration(),
    provider,
    model: provider === "openai" ? (env.OPENAI_MODEL || "gpt-5.6-sol") : null,
  };
}

export function legalAiProvider(): LegalAiProvider | null {
  const status = aiProviderStatus();
  return status.configured && status.provider === "openai" ? new OpenAiLegalProvider() : null;
}
