import { z } from "zod";

import { AiUnavailableError, callOpenAiStructured } from "../document-builder/ai/openai";
import { runtimeEnv } from "../document-builder/storage/runtime";
import {
  assertOperationalFeatureEnabled,
  operationalEnvironment,
  OperationalFeatureError,
} from "../operations/operational-feature-flags";
import { resolveAiRuntimeSettings } from "../ai/runtime-settings";
import { classifyLegalSourceUrl } from "./source-fetch";

const discoverySchema = z.object({
  urls: z.array(z.string().url().max(2_000)).max(3),
}).strict();

const discoveryJsonSchema = z.toJSONSchema(discoverySchema, {
  target: "draft-7",
  unrepresentable: "throw",
}) as Record<string, unknown>;

export type LexDiscoveryTelemetry = {
  model: string;
  providerResponseId: string | null;
  attempts: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
};

async function assertDiscoveryEnabled(): Promise<void> {
  const env = runtimeEnv();
  if (!env.DB) return;
  try {
    await assertOperationalFeatureEnabled({
      db: env.DB,
      environment: operationalEnvironment(env.APP_ENV),
      key: "ai_lex_web_discovery",
    });
  } catch (error) {
    if (error instanceof OperationalFeatureError) {
      throw new AiUnavailableError(
        "Поиск официальных страниц временно отключён оператором.",
        "PROVIDER_UNAVAILABLE",
        false,
        null,
        "operator_kill_switch",
      );
    }
    throw error;
  }
}

function validatedLexUrls(values: readonly string[], locale: "ru" | "uz"): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    try {
      const reference = classifyLegalSourceUrl(value);
      if (reference.sourceKind !== "lex" || reference.locale !== locale || seen.has(reference.canonicalUrl)) continue;
      seen.add(reference.canonicalUrl);
      urls.push(reference.canonicalUrl);
    } catch {
      // Model output is discovery-only and never trusted as a legal source.
    }
  }
  return urls.slice(0, 3);
}

/**
 * Uses OpenAI Web Search only to discover candidate Lex.uz URLs. Returned URLs
 * are still untrusted; callers must server-fetch, canonicalize, parse, clean,
 * quality-check, and rank every candidate before it can become evidence.
 */
export async function discoverOfficialLexUrls(input: {
  query: string;
  locale: "ru" | "uz";
  requestId: string;
  safetyIdentifier: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onTelemetry?: (event: LexDiscoveryTelemetry) => void | Promise<void>;
}): Promise<string[]> {
  await assertDiscoveryEnabled();
  const env = runtimeEnv();
  const settings = await resolveAiRuntimeSettings({ db: env.DB, env });
  const timeoutMs = Math.max(1, Math.min(input.timeoutMs ?? 3_500, 5_000));
  const result = await callOpenAiStructured({
    schemaName: "juro_lex_url_discovery",
    schema: discoveryJsonSchema,
    parse: (value) => discoverySchema.parse(value),
    instructions: [
      "Find only official Lex.uz document pages relevant to the supplied legal search query.",
      "Return candidate document URLs only. Do not answer the legal question, quote law, infer an article, or use snippets as evidence.",
      "Every URL must be an HTTPS lex.uz or www.lex.uz document URL in the requested language.",
    ].join(" "),
    input: { query: input.query.slice(0, 500), locale: input.locale },
    model: settings.openaiChatModel,
    maxAttempts: 1,
    firstByteTimeoutMs: timeoutMs,
    totalResponseTimeoutMs: timeoutMs,
    requestId: input.requestId,
    safetyIdentifier: input.safetyIdentifier,
    reasoningEffort: "low",
    textVerbosity: "low",
    maxOutputTokens: 300,
    webSearchAllowedDomains: ["lex.uz", "www.lex.uz"],
    signal: input.signal,
  });
  await input.onTelemetry?.({
    model: result.model,
    providerResponseId: result.providerResponseId,
    attempts: result.attempts,
    latencyMs: result.latencyMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });
  return validatedLexUrls(result.data.urls, input.locale);
}
