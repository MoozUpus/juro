import { z } from "zod";
import type { PlatformJobEnv } from "./platform-jobs";

// v1 completed for OpenAI and terminally failed for Anthropic before the
// owner rotated the staging Anthropic key. Keep those records immutable. v5
// verified only a trivial Anthropic schema; v6 exercised the exact legal-chat
// schema but found an application-boundary error. v10-v13 isolated the strict
// grammar rejection. v14 confirmed plain JSON is not contract-reliable. v15
// validates forced non-strict tool use plus the unchanged Zod/source boundary.
// v16 persists only bounded HTTP/type metadata after v15 failed before model
// generation; provider messages and bodies remain excluded.
const PROBE_KEY = "staging-anthropic-legal-chat-v16";
type Provider = "openai" | "anthropic";
const providers = ["anthropic"] as const satisfies readonly Provider[];

export const providerProbeOutputSchema = z.object({
  status: z.literal("ok"),
}).strict();

const providerProbeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: { status: { type: "string", const: "ok" } },
};

export type StagingProviderProbeSummary = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

class ProviderProbeStageError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "ProviderProbeStageError";
  }
}

export function stagingProviderProbeEnabled(
  env: Pick<PlatformJobEnv, "APP_ENV" | "STAGING_SYNTHETIC_PROBES_ENABLED">,
): boolean {
  return env.APP_ENV === "staging"
    && (env as Record<string, unknown>).STAGING_SYNTHETIC_PROBES_ENABLED === "true";
}

function probeId(provider: Provider): string {
  return `${PROBE_KEY}-${provider}`;
}

function providerErrorCode(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : null;
  if (typeof code === "string" && /^[A-Z0-9_]{3,64}$/.test(code)) return code;
  if (error instanceof ProviderProbeStageError) return error.safeCode;
  // D1 stores no exception message, provider response, prompt, or output.
  // The narrow class is sufficient to distinguish transport/schema/runtime
  // failures while preserving the closed probe's no-content guarantee.
  const name = error instanceof Error ? error.name : "";
  if (name === "ZodError") return "PROVIDER_PROBE_SCHEMA_INVALID";
  if (name === "TypeError") return "PROVIDER_PROBE_TYPE_ERROR";
  if (name === "ReferenceError") return "PROVIDER_PROBE_REFERENCE_ERROR";
  return "PROVIDER_PROBE_FAILED";
}

function anthropicHttpFailureCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const status = "providerStatus" in error ? (error as { providerStatus?: unknown }).providerStatus : null;
    const type = "providerErrorType" in error ? (error as { providerErrorType?: unknown }).providerErrorType : null;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      const safeType = typeof type === "string" && /^[a-z_]{3,40}$/.test(type)
        ? `_${type.toUpperCase()}`
        : "";
      return `PROBE_ANTHROPIC_HTTP_${status}${safeType}`.slice(0, 64);
    }
  }
  return error instanceof TypeError ? "PROBE_ANTHROPIC_CALL_TYPE_ERROR" : "PROBE_ANTHROPIC_CALL_FAILED";
}

async function executeProviderProbe(provider: Provider) {
  if (provider === "anthropic") {
    const { callAnthropicStructured } = await import("../lib/document-builder/ai/anthropic");
    const {
      enforceLegalChatSourceBoundary,
      forceClarificationWithoutVerifiedSources,
      legalChatJsonSchema,
      parseLegalChatResponse,
    } = await import("../lib/ai/legal-chat-schema");
    let result;
    try {
      result = await callAnthropicStructured({
        instructions: "JURO staging contract check. Call emit_result with a clarification response, no legal conclusions and no sources.",
        input: {
          jurisdiction: "UZ",
          question: "Synthetic staging check: request clarification only.",
          language: "ru",
          answerMode: "short",
          reasoningMode: "fast",
          legalDatabaseAsOf: "2026-08-03T00:00:00.000Z",
          verifiedSources: [],
        },
        schema: legalChatJsonSchema,
        parse: parseLegalChatResponse,
        maxAttempts: 1,
        timeoutMs: 20_000,
        requestId: probeId(provider),
        strictOutput: false,
      });
    } catch (error) {
      throw new ProviderProbeStageError(anthropicHttpFailureCode(error));
    }
    try {
      const constrained = forceClarificationWithoutVerifiedSources(result.data, {
        locale: "ru",
        answerMode: "short",
        reasoningMode: "fast",
        legalDatabaseAsOf: "2026-08-03T00:00:00.000Z",
      });
      enforceLegalChatSourceBoundary(constrained, new Set());
      return { ...result, data: constrained };
    } catch (error) {
      throw new ProviderProbeStageError(
        error instanceof TypeError ? "PROBE_LEGAL_BOUNDARY_TYPE_ERROR" : "PROBE_LEGAL_BOUNDARY_FAILED",
      );
    }
  }
  const instructions = "JURO staging connectivity probe. This is fixed synthetic technical input, not legal advice or user data. Return exactly the JSON object {\"status\":\"ok\"}.";
  if (provider === "openai") {
    const { callOpenAiStructured } = await import("../lib/document-builder/ai/openai");
    return callOpenAiStructured({
      instructions,
      input: "fixed synthetic connectivity probe",
      schemaName: "juro_staging_provider_probe",
      schema: providerProbeJsonSchema,
      parse: (value) => providerProbeOutputSchema.parse(value),
      maxAttempts: 1,
      timeoutMs: 20_000,
      requestId: probeId(provider),
      textVerbosity: "low",
    });
  }
  throw new Error("PROVIDER_PROBE_NOT_IMPLEMENTED");
}

async function runOne(
  env: PlatformJobEnv,
  provider: Provider,
): Promise<"succeeded" | "failed" | "skipped"> {
  const id = probeId(provider);
  const now = new Date().toISOString();
  const insert = await env.DB.prepare(`
    INSERT INTO staging_provider_probes (
      id,probe_key,provider,status,model,provider_response_id,input_tokens,
      output_tokens,cached_input_tokens,latency_ms,error_code,started_at,
      finished_at,created_at,updated_at
    ) VALUES (?,?,?,'running',NULL,NULL,0,0,0,0,NULL,?,NULL,?,?)
    ON CONFLICT(probe_key,provider) DO NOTHING
  `).bind(id, PROBE_KEY, provider, now, now, now).run();
  if (Number(insert.meta.changes ?? 0) !== 1) return "skipped";

  try {
    const result = await executeProviderProbe(provider);
    const finishedAt = new Date().toISOString();
    const updated = await env.DB.prepare(`
      UPDATE staging_provider_probes
      SET status='succeeded',model=?,provider_response_id=?,input_tokens=?,
          output_tokens=?,cached_input_tokens=?,latency_ms=?,finished_at=?,
          updated_at=?
      WHERE id=? AND status='running'
    `).bind(
      result.model,
      result.providerResponseId,
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.cachedInputTokens,
      result.latencyMs,
      finishedAt,
      finishedAt,
      id,
    ).run();
    if (Number(updated.meta.changes ?? 0) !== 1) throw new Error("PROVIDER_PROBE_LEASE_LOST");
    return "succeeded";
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE staging_provider_probes
      SET status='failed',error_code=?,finished_at=?,updated_at=?
      WHERE id=? AND status='running'
    `).bind(providerErrorCode(error), finishedAt, finishedAt, id).run();
    return "failed";
  }
}

/**
 * Closed, one-time, staging-only real-provider validation. No HTTP route or
 * user content is involved; D1 holds only technical result metadata.
 */
export async function runStagingProviderProbes(
  env: PlatformJobEnv,
): Promise<StagingProviderProbeSummary | null> {
  if (!stagingProviderProbeEnabled(env)) return null;
  const outcomes = await Promise.all(providers.map((provider) => runOne(env, provider)));
  return {
    attempted: outcomes.filter((outcome) => outcome !== "skipped").length,
    succeeded: outcomes.filter((outcome) => outcome === "succeeded").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
  };
}
