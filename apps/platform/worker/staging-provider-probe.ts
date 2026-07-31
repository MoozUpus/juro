import { z } from "zod";
import type { PlatformJobEnv } from "./platform-jobs";

// v1 completed for OpenAI and terminally failed for Anthropic before the
// owner rotated the staging Anthropic key. Keep that record immutable and use
// a fresh logical key for the explicit post-rotation Anthropic verification.
// v5 verifies the latest staging key rotation.
const PROBE_KEY = "staging-anthropic-connectivity-v5";
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
  return typeof code === "string" && /^[A-Z0-9_]{3,64}$/.test(code)
    ? code
    : "PROVIDER_PROBE_FAILED";
}

async function executeProviderProbe(provider: Provider) {
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
  const { callAnthropicStructured } = await import("../lib/document-builder/ai/anthropic");
  return callAnthropicStructured({
    instructions,
    input: "fixed synthetic connectivity probe",
    schema: providerProbeJsonSchema,
    parse: (value) => providerProbeOutputSchema.parse(value),
    maxAttempts: 1,
    timeoutMs: 20_000,
    requestId: probeId(provider),
  });
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
