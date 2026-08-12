import { z } from "zod";
import { runAnthropicLegalChat } from "../lib/ai/anthropic-provider";
import {
  AiExecutionBudgetAbortError,
  createAiExecutionBudget,
  type AiExecutionBudget,
} from "../lib/ai/execution-budget";
import {
  createStagingAiSloProbeCorrelationId,
  recordStagingAiSloProbe,
  type AiSloFirstUsefulStage,
} from "../lib/ai/slo-telemetry";
import type { PlatformJobEnv } from "./platform-jobs";
import {
  runStagingAiChatLifecycleProbe,
} from "./staging-ai-chat-lifecycle-probe";
import {
  providerFailureEvidence,
  recordDependencyHealthEvidence,
} from "./dependency-health-evidence";

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
// v27 intentionally leaves those historical rows untouched and adds bounded,
// rolling execution records plus append-only, content-free SLO evidence.
const ROLLING_PROBE_VERSION = "v27";
const ROLLING_PROBE_KEY_PREFIX = `staging-provider-slo-${ROLLING_PROBE_VERSION}`;
export const STAGING_PROVIDER_PROBE_EXECUTION_BUDGET_MS = 30_000;
const STAGING_PROVIDER_PROBE_PROVIDER_TIMEOUT_MS = 25_500;
const STAGING_PROVIDER_PROBE_POST_PROVIDER_RESERVE_MS = 2_000;
const STAGING_PROVIDER_PROBE_RETENTION_MS = 30 * 24 * 60 * 60_000;
const STAGING_PROVIDER_PROBE_MAX_RECORDS_PER_PROVIDER = 2_000;
const STAGING_PROVIDER_PROBE_ABANDONED_AFTER_MS = 2 * 60_000;
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
  retentionDeleted: number;
};

export type RollingProbeExecution = {
  id: string;
  probeKey: string;
  startedAt: number;
  startedAtIso: string;
  /** Alternates every five-minute scheduled slot without storing a counter. */
  locale: "ru" | "uz";
};

type ProviderProbeTiming = {
  model: string | null;
  providerStartedAt: number | null;
  providerTtftMs: number | null;
  validationLatencyMs: number | null;
  persistenceLatencyMs: number | null;
  firstUsefulStage: AiSloFirstUsefulStage;
  firstUsefulLatencyMs: number | null;
};

type ProviderProbeResult = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  latencyMs: number;
  attempts: number;
  timing: ProviderProbeTiming;
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

function normalizedExecutionId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ProviderProbeStageError("PROBE_EXECUTION_ID_INVALID");
  }
  return value.toLowerCase();
}

/** Creates one opaque, timestamped execution identifier shared by both providers. */
export function createRollingStagingProviderProbeExecution(
  now = new Date(),
  id = crypto.randomUUID(),
): RollingProbeExecution {
  const executionId = normalizedExecutionId(id);
  const startedAt = now.getTime();
  if (!Number.isFinite(startedAt)) throw new ProviderProbeStageError("PROBE_EXECUTION_TIME_INVALID");
  const startedAtIso = now.toISOString();
  const timestampKey = startedAtIso.replace(/[-:.]/g, "");
  const locale = Math.floor(startedAt / (5 * 60_000)) % 2 === 0 ? "ru" : "uz";
  return {
    id: executionId,
    probeKey: `${ROLLING_PROBE_KEY_PREFIX}-${timestampKey}-${executionId}`,
    startedAt,
    startedAtIso,
    locale,
  };
}

function probeId(provider: Provider, execution: RollingProbeExecution): string {
  return `${execution.id}-${provider}`;
}

function newProviderTiming(): ProviderProbeTiming {
  return {
    model: null,
    providerStartedAt: null,
    providerTtftMs: null,
    validationLatencyMs: null,
    persistenceLatencyMs: null,
    firstUsefulStage: "none",
    firstUsefulLatencyMs: null,
  };
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

function providerTimeoutMs(budget: AiExecutionBudget): number {
  const remaining = budget.remainingMs - STAGING_PROVIDER_PROBE_POST_PROVIDER_RESERVE_MS;
  if (budget.signal.aborted || remaining < 1) {
    throw new ProviderProbeStageError("PROBE_BUDGET_EXHAUSTED");
  }
  return Math.min(STAGING_PROVIDER_PROBE_PROVIDER_TIMEOUT_MS, remaining);
}

function stageTimeoutMs(budget: AiExecutionBudget): number {
  return Math.max(1, Math.min(
    STAGING_PROVIDER_PROBE_PROVIDER_TIMEOUT_MS + 1_500,
    budget.remainingMs,
  ));
}

function requireProbeBudget(budget: AiExecutionBudget): void {
  if (budget.signal.aborted || budget.remainingMs < STAGING_PROVIDER_PROBE_POST_PROVIDER_RESERVE_MS) {
    throw new AiExecutionBudgetAbortError(budget.abortReason ?? "overall_timeout");
  }
}

function sloFailure(input: {
  error: unknown;
  budget: AiExecutionBudget;
}): {
  outcome: "failed" | "timed_out" | "cancelled";
  safeErrorCode: "AI_SLO_TIMEOUT" | "AI_SLO_PROVIDER_UNAVAILABLE" | "AI_SLO_ABORTED" |
    "AI_SLO_VALIDATION_FAILED" | "AI_SLO_PERSISTENCE_FAILED" | "AI_SLO_INTERNAL_ERROR";
} {
  const code = providerErrorCode(input.error);
  if (
    input.error instanceof AiExecutionBudgetAbortError
    || input.budget.abortReason === "overall_timeout"
    || code.includes("TIMEOUT")
    || code.includes("BUDGET_EXHAUSTED")
  ) {
    return { outcome: "timed_out", safeErrorCode: "AI_SLO_TIMEOUT" };
  }
  if (code.includes("CANCELLED") || input.budget.abortReason === "caller") {
    return { outcome: "cancelled", safeErrorCode: "AI_SLO_ABORTED" };
  }
  if (code.includes("INVALID_AI_OUTPUT") || code.includes("SCHEMA") || code.includes("BOUNDARY")) {
    return { outcome: "failed", safeErrorCode: "AI_SLO_VALIDATION_FAILED" };
  }
  if (code.includes("PERSISTENCE") || code.includes("FINALIZATION") || code.includes("RESERVATION")) {
    return { outcome: "failed", safeErrorCode: "AI_SLO_PERSISTENCE_FAILED" };
  }
  if (code.includes("PROVIDER") || code.includes("ANTHROPIC") || code.includes("OPENAI") || code.includes("CONFIG")) {
    return { outcome: "failed", safeErrorCode: "AI_SLO_PROVIDER_UNAVAILABLE" };
  }
  return { outcome: "failed", safeErrorCode: "AI_SLO_INTERNAL_ERROR" };
}

/**
 * Prunes only completed/failed v27 technical probe rows. It never deletes the
 * prior fixed-key evidence or the append-only SLO telemetry ledger.
 */
export async function pruneRollingStagingProviderProbeRows(
  env: PlatformJobEnv,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - STAGING_PROVIDER_PROBE_RETENTION_MS).toISOString();
  const abandonedBefore = new Date(now.getTime() - STAGING_PROVIDER_PROBE_ABANDONED_AFTER_MS).toISOString();
  const prefix = `${ROLLING_PROBE_KEY_PREFIX}-%`;
  // Only v27 rolling rows are mutable/retained here. Historical probe rows and
  // append-only ai_slo_telemetry_events are intentionally never touched.
  await env.DB.prepare(`
    UPDATE staging_provider_probes
    SET status='failed',error_code='PROBE_EXECUTION_ABANDONED',finished_at=?,updated_at=?
    WHERE probe_key LIKE ? AND status='running' AND started_at<?
  `).bind(now.toISOString(), now.toISOString(), prefix, abandonedBefore).run();
  const expired = await env.DB.prepare(`
    DELETE FROM staging_provider_probes
    WHERE probe_key LIKE ? AND status IN ('succeeded','failed') AND created_at<?
  `).bind(prefix, cutoff).run();
  let deleted = Number(expired.meta.changes ?? 0);
  for (const provider of providers) {
    const result = await env.DB.prepare(`
      DELETE FROM staging_provider_probes
      WHERE id IN (
        SELECT id FROM staging_provider_probes
        WHERE probe_key LIKE ? AND provider=? AND status IN ('succeeded','failed')
        ORDER BY created_at DESC,id DESC
        LIMIT -1 OFFSET ?
      )
    `).bind(prefix, provider, STAGING_PROVIDER_PROBE_MAX_RECORDS_PER_PROVIDER).run();
    deleted += Number(result.meta.changes ?? 0);
  }
  return deleted;
}

async function executeProviderProbe(input: {
  env: PlatformJobEnv;
  provider: Provider;
  execution: RollingProbeExecution;
  budget: AiExecutionBudget;
  timing: ProviderProbeTiming;
}): Promise<ProviderProbeResult> {
  const { env, provider, execution, budget, timing } = input;
  if (provider === "anthropic") {
    const stage = budget.beginStage("probe.anthropic.provider", {
      timeoutMs: stageTimeoutMs(budget),
    });
    try {
      // This technical probe is not an interactive user response. Anthropic's
      // non-streaming Messages endpoint may not resolve fetch until it has a
      // complete JSON/tool payload, so use the full already-reserved provider
      // window for connectivity rather than the user's 4.5 s response-start
      // threshold. The shared 30 s budget remains authoritative.
      const timeoutMs = providerTimeoutMs(budget);
      const result = await runAnthropicLegalChat({
        question: "Synthetic staging check: request clarification only.",
        locale: "ru",
        answerMode: "short",
        reasoningMode: "fast",
        sources: [],
        legalDatabaseAsOf: "unavailable",
        requestId: probeId(provider, execution),
        safetyIdentifier: "staging-synthetic-provider-probe",
      }, {
        budget,
        signal: stage.signal,
        providerTimeoutMs: timeoutMs,
        nonStreamingResponseStartTimeoutMs: timeoutMs,
        beforeProviderCall: ({ model }) => {
          timing.model = model;
          timing.providerStartedAt = Date.now();
        },
      });
      if (result.data.responseKind !== "clarification_required" || result.data.sources.length !== 0
        || result.data.confirmedFindings.length !== 0) {
        throw new ProviderProbeStageError("PROBE_LEGAL_BOUNDARY_FAILED");
      }
      // Anthropic currently returns one complete non-streaming structured
      // response. That proves bounded provider completion, but it has no
      // independently observable first useful content. Keep this probe out of
      // the 5-second first-useful SLO instead of recording terminal arrival as
      // a fake token/TTFT measurement.
      timing.firstUsefulStage = "none";
      timing.firstUsefulLatencyMs = null;
      stage.complete();
      return {
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        timing,
      };
    } catch (error) {
      stage.fail();
      if (error instanceof AiExecutionBudgetAbortError || budget.signal.aborted) throw error;
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
  }
  if (provider === "openai") {
    try {
      const result = await runStagingAiChatLifecycleProbe(env, {
        budget,
        executionId: execution.id,
        locale: execution.locale,
        onProviderPrepared: ({ model }) => {
          timing.model = model;
          timing.providerStartedAt = Date.now();
        },
      });
      timing.model = result.model;
      timing.providerTtftMs = result.timing.providerTtftMs;
      timing.validationLatencyMs = result.timing.validationLatencyMs;
      timing.persistenceLatencyMs = result.timing.persistenceLatencyMs;
      timing.firstUsefulStage = "provider_validated";
      timing.firstUsefulLatencyMs = result.timing.firstUsefulLatencyMs;
      return {
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        timing,
      };
    } catch (error) {
      if (error instanceof AiExecutionBudgetAbortError || budget.signal.aborted) throw error;
      console.error({
        event: "staging.provider_probe_exception",
        provider: "openai",
        errorName: error instanceof Error && typeof error.name === "string" ? error.name : "UnknownError",
        safeCode: openAiHttpFailureCode(error),
      });
      throw new ProviderProbeStageError(openAiHttpFailureCode(error));
    }
  }
  throw new ProviderProbeStageError("PROVIDER_PROBE_NOT_IMPLEMENTED");
}

async function markProbeFailed(input: {
  env: PlatformJobEnv;
  id: string;
  safeCode: string;
  startedAt: number;
  allowedStatuses?: readonly ("running" | "succeeded")[];
}): Promise<void> {
  const finishedAt = new Date().toISOString();
  const statuses = input.allowedStatuses ?? ["running"];
  const statusPredicate = statuses.map(() => "?").join(",");
  await input.env.DB.prepare(`
    UPDATE staging_provider_probes
    SET status='failed',error_code=?,latency_ms=?,finished_at=?,updated_at=?
    WHERE id=? AND status IN (${statusPredicate})
  `).bind(
    input.safeCode,
    Math.max(0, Date.now() - input.startedAt),
    finishedAt,
    finishedAt,
    input.id,
    ...statuses,
  ).run();
}

async function recordProbeSloSuccess(input: {
  env: PlatformJobEnv;
  provider: Provider;
  correlationId: string;
  result: ProviderProbeResult;
  startedAt: number;
}): Promise<void> {
  await recordStagingAiSloProbe({
    db: input.env.DB,
    correlationId: input.correlationId,
    answerMode: "short",
    reasoningMode: "fast",
    provider: input.provider,
    model: input.result.model,
    outcome: "completed",
    fallback: "none",
    providerTtftMs: input.result.timing.providerTtftMs,
    providerTotalMs: input.result.latencyMs,
    validationLatencyMs: input.result.timing.validationLatencyMs,
    persistenceLatencyMs: input.result.timing.persistenceLatencyMs,
    endToEndMs: Math.max(0, Date.now() - input.startedAt),
    firstUsefulStage: input.result.timing.firstUsefulStage,
    firstUsefulLatencyMs: input.result.timing.firstUsefulLatencyMs,
  });
}

async function runOne(input: {
  env: PlatformJobEnv;
  provider: Provider;
  execution: RollingProbeExecution;
  budget: AiExecutionBudget;
}): Promise<"succeeded" | "failed" | "skipped"> {
  const { env, provider, execution, budget } = input;
  const id = probeId(provider, execution);
  const correlationId = createStagingAiSloProbeCorrelationId();
  const timing = newProviderTiming();
  const insert = await env.DB.prepare(`
    INSERT INTO staging_provider_probes (
      id,probe_key,provider,status,model,provider_response_id,input_tokens,
      output_tokens,cached_input_tokens,latency_ms,error_code,started_at,
      finished_at,created_at,updated_at
    ) VALUES (?,?,?,'running',NULL,NULL,0,0,0,0,NULL,?,NULL,?,?)
    ON CONFLICT(probe_key,provider) DO NOTHING
  `).bind(
    id,
    execution.probeKey,
    provider,
    execution.startedAtIso,
    execution.startedAtIso,
    execution.startedAtIso,
  ).run();
  if (Number(insert.meta.changes ?? 0) !== 1) return "skipped";

  try {
    const result = await executeProviderProbe({ env, provider, execution, budget, timing });
    requireProbeBudget(budget);
    const finishedAt = new Date().toISOString();
    const updated = await env.DB.prepare(`
      UPDATE staging_provider_probes
      SET status='succeeded',model=?,provider_response_id=NULL,input_tokens=?,
          output_tokens=?,cached_input_tokens=?,latency_ms=?,finished_at=?,
          updated_at=?
      WHERE id=? AND status='running'
    `).bind(
      result.model,
      result.inputTokens,
      result.outputTokens,
      result.cachedInputTokens,
      Math.max(0, Date.now() - execution.startedAt),
      finishedAt,
      finishedAt,
      id,
    ).run();
    if (Number(updated.meta.changes ?? 0) !== 1) {
      throw new ProviderProbeStageError("PROBE_EXECUTION_LEASE_LOST");
    }
    requireProbeBudget(budget);
    try {
      await recordProbeSloSuccess({
        env,
        provider,
        correlationId,
        result,
        startedAt: execution.startedAt,
      });
    } catch {
      // A successful provider call without durable, safe SLO evidence must
      // never create a green provider signal. The probe result remains
      // inspectable, but is explicitly downgraded instead of hidden.
      await markProbeFailed({
        env,
        id,
        startedAt: execution.startedAt,
        safeCode: "PROBE_SLO_TELEMETRY_FAILED",
        allowedStatuses: ["succeeded"],
      });
      console.error(JSON.stringify({
        event: "staging.provider_probe_slo_persistence_failed",
        provider,
        executionId: execution.id,
      }));
      return "failed";
    }
    await recordDependencyHealthEvidence(env, {
      key: provider,
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: execution.startedAt,
      minimumOperationalIntervalMs: 15 * 60_000,
    });
    return "succeeded";
  } catch (error) {
    const safeCode = providerErrorCode(error);
    await markProbeFailed({
      env,
      id,
      startedAt: execution.startedAt,
      safeCode,
    });
    const failure = sloFailure({ error, budget });
    try {
      await recordStagingAiSloProbe({
        db: env.DB,
        correlationId,
        answerMode: "short",
        reasoningMode: "fast",
        provider: timing.model ? provider : "none",
        model: timing.model,
        outcome: failure.outcome,
        fallback: "none",
        providerTtftMs: timing.providerTtftMs,
        providerTotalMs: timing.providerStartedAt === null
          ? null
          : Math.max(0, Date.now() - timing.providerStartedAt),
        validationLatencyMs: timing.validationLatencyMs,
        persistenceLatencyMs: timing.persistenceLatencyMs,
        endToEndMs: Math.max(0, Date.now() - execution.startedAt),
        firstUsefulStage: "none",
        firstUsefulLatencyMs: null,
        safeErrorCode: failure.safeErrorCode,
      });
    } catch {
      console.error(JSON.stringify({
        event: "staging.provider_probe_slo_persistence_failed",
        provider,
        executionId: execution.id,
      }));
    }
    await recordDependencyHealthEvidence(env, {
      ...providerFailureEvidence(provider, safeCode),
      evidenceKind: "synthetic_probe",
      startedAt: execution.startedAt,
    });
    return "failed";
  }
}

/**
 * Rolling, staging-only real-provider validation. Every invocation has an
 * opaque execution ID, new technical rows for both providers, one shared hard
 * 30-second deadline, and append-only SLO measurements. It has no HTTP entry
 * point and never records prompts, outputs, user IDs, account IDs, URLs, or
 * provider response bodies. Retention affects only its v27 technical table;
 * historical provider evidence and append-only SLO telemetry are preserved.
 */
export async function runStagingProviderProbes(
  env: PlatformJobEnv,
): Promise<StagingProviderProbeSummary | null> {
  if (!stagingProviderProbeEnabled(env)) return null;
  // Retention is deliberately outside the provider execution window. A
  // retention fault must never make an interactive provider check run late or
  // be reported as a provider outage.
  let retentionDeleted = 0;
  try {
    retentionDeleted = await pruneRollingStagingProviderProbeRows(env);
  } catch {
    console.error(JSON.stringify({
      event: "staging.provider_probe_retention_failed",
      environment: env.APP_ENV,
    }));
  }
  const execution = createRollingStagingProviderProbeExecution();
  const budget = createAiExecutionBudget({
    totalBudgetMs: STAGING_PROVIDER_PROBE_EXECUTION_BUDGET_MS,
  });
  try {
    const outcomes = await Promise.all(providers.map((provider) => runOne({
      env,
      provider,
      execution,
      budget,
    })));
    return {
      attempted: outcomes.filter((outcome) => outcome !== "skipped").length,
      succeeded: outcomes.filter((outcome) => outcome === "succeeded").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
      skipped: outcomes.filter((outcome) => outcome === "skipped").length,
      retentionDeleted,
    };
  } finally {
    budget.dispose();
  }
}
