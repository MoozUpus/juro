import { z } from "zod";
import { runAnthropicLegalChat } from "../lib/ai/anthropic-provider";
import type { PlatformJobEnv } from "./platform-jobs";
import { runStagingAiChatLifecycleProbe } from "./staging-ai-chat-lifecycle-probe";

// v1 completed for OpenAI and terminally failed for Anthropic before the
// owner rotated the staging Anthropic key. Keep those records immutable. v5
// verified only a trivial Anthropic schema; v6 exercised the exact legal-chat
// schema but found an application-boundary error. v10-v13 isolated the strict
// grammar rejection. v14 confirmed plain JSON is not contract-reliable. v15
// validates forced non-strict tool use plus the unchanged Zod/source boundary.
// v16 persists only bounded HTTP/type metadata after v15 failed before model
// generation; provider messages and bodies remain excluded. v17 validates the
// bounded JSON-string tool envelope while preserving the full Zod boundary.
// v18 exercises the production Anthropic adapter, including its fail-closed
// normalization and source-boundary enforcement. v19 adds bounded stage codes
// for preflight versus post-processing failures, without logging content. v20
// adds a request-stage stack path event; prompts and provider bodies stay out.
// v22 records the same bounded stack paths at the probe boundary. v23 uses a
// static adapter import because the worker bundler rewrote the dynamic import
// to index.js, whose public namespace does not expose this internal function.
// v24 exercises the exact OpenAI legal-chat structured-output contract and
// stores only bounded HTTP/error metadata when the request is rejected. v25
// verifies the same contract after normalizing Zod's draft-7 annotations to
// the provider-supported Structured Outputs subset. v26 runs complete RU and
// UZ synthetic tenant lifecycles: reservation, provider, persistence, released
// clarification usage, idempotent replay, audit evidence, and full cleanup.
const PROBE_KEY = "staging-openai-legal-chat-v26";
type Provider = "openai" | "anthropic";
// Staging probes exercise both configured server-side providers with a fixed,
// content-free clarification request. This is deliberately opt-in and
// staging-only; production cannot enable this code path.
const providers = ["openai", "anthropic"] as const satisfies readonly Provider[];

// Retained as the stable minimal probe contract used by unit tests and older
// immutable probe records. v24 itself exercises the full legal-chat schema.
export const providerProbeOutputSchema = z.object({
  status: z.literal("ok"),
}).strict();

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
    const code = "code" in error ? (error as { code?: unknown }).code : null;
    if (typeof code === "string" && /^[A-Z0-9_]{3,48}$/.test(code)) {
      return `PROBE_ANTHROPIC_${code}`.slice(0, 64);
    }
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

function openAiHttpFailureCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error ? (error as { code?: unknown }).code : null;
    const status = "providerStatus" in error ? (error as { providerStatus?: unknown }).providerStatus : null;
    const type = "providerErrorType" in error ? (error as { providerErrorType?: unknown }).providerErrorType : null;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      const safeType = typeof type === "string" && /^[a-zA-Z0-9_.-]{3,48}$/.test(type)
        ? `_${type.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
        : "";
      return `PROBE_OPENAI_HTTP_${status}${safeType}`.slice(0, 64);
    }
    if (typeof code === "string" && /^[A-Z0-9_]{3,48}$/.test(code)) {
      return `PROBE_OPENAI_${code}`.slice(0, 64);
    }
  }
  return error instanceof TypeError ? "PROBE_OPENAI_CALL_TYPE_ERROR" : "PROBE_OPENAI_CALL_FAILED";
}

async function executeProviderProbe(env: PlatformJobEnv, provider: Provider) {
  if (provider === "anthropic") {
    let result;
    try {
      result = await runAnthropicLegalChat({
        question: "Synthetic staging check: request clarification only.",
        locale: "ru",
        answerMode: "short",
        reasoningMode: "fast",
        sources: [],
        legalDatabaseAsOf: "2026-08-03T00:00:00.000Z",
        requestId: probeId(provider),
        safetyIdentifier: "staging-synthetic-provider-probe",
      });
    } catch (error) {
      const stackFrames = error instanceof Error && typeof error.stack === "string"
        ? error.stack.split("\n").slice(1, 6).map((frame) => frame.trim().replace(/[?#].*$/, ""))
        : undefined;
      console.error({
        event: "staging.provider_probe_exception",
        provider: "anthropic",
        errorName: error instanceof Error && typeof error.name === "string" ? error.name : "UnknownError",
        safeCode: anthropicHttpFailureCode(error),
        stackFrames,
      });
      throw new ProviderProbeStageError(anthropicHttpFailureCode(error));
    }
    if (result.data.responseKind !== "clarification_required" || result.data.sources.length !== 0
      || result.data.confirmedFindings.length !== 0) {
      throw new ProviderProbeStageError(
        "PROBE_LEGAL_BOUNDARY_FAILED",
      );
    }
    return result;
  }
  if (provider === "openai") {
    try {
      return await runStagingAiChatLifecycleProbe(env);
    } catch (error) {
      console.error({
        event: "staging.provider_probe_exception",
        provider: "openai",
        errorName: error instanceof Error && typeof error.name === "string" ? error.name : "UnknownError",
        safeCode: openAiHttpFailureCode(error),
      });
      throw new ProviderProbeStageError(openAiHttpFailureCode(error));
    }
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
    const result = await executeProviderProbe(env, provider);
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
