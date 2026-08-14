import { z } from "zod";

/**
 * Append-only operational measurements for the interactive AI SLO.
 *
 * This module deliberately has no user, workspace, conversation, prompt,
 * answer, document, URL, provider payload, or credential field. Callers pass
 * only the opaque, request-scoped correlation UUID created by the run store;
 * it is one-way hashed before persistence.
 */

export const AI_FIRST_USEFUL_SLO_MS = 5_000;
export const AI_FULL_RESPONSE_SLO_MS = 30_000;
export const DEFAULT_AI_SLO_MINIMUM_SAMPLE_SIZE = 20;
export const DEFAULT_AI_SLO_MAX_WINDOW_EVENTS = 5_000;

export const aiSloEnvironments = ["development", "staging", "production"] as const;
export const aiSloRequestKinds = ["legal_chat", "staging_synthetic_probe"] as const;
export const aiSloAuthKinds = ["authenticated", "guest", "system"] as const;
export const aiSloAnswerModes = ["short", "detailed"] as const;
export const aiSloReasoningModes = ["fast", "deep"] as const;
export const aiSloProviders = ["openai", "anthropic", "none"] as const;
export const aiSloOutcomes = ["completed", "failed", "timed_out", "cancelled"] as const;
export const aiSloFallbacks = ["none", "openai_to_anthropic", "anthropic_to_openai"] as const;
export const aiSloFirstUsefulStages = [
  "none",
  "auth",
  "context",
  "retrieval",
  "preliminary",
  "provider_validated",
  "validation",
  "persistence",
] as const;
export const aiSloSafeErrorCodes = [
  "AI_SLO_TIMEOUT",
  "AI_SLO_PROVIDER_UNAVAILABLE",
  "AI_SLO_ABORTED",
  "AI_SLO_VALIDATION_FAILED",
  "AI_SLO_PERSISTENCE_FAILED",
  "AI_SLO_INTERNAL_ERROR",
] as const;

export type AiSloEnvironment = (typeof aiSloEnvironments)[number];
export type AiSloRequestKind = (typeof aiSloRequestKinds)[number];
export type AiSloFirstUsefulStage = (typeof aiSloFirstUsefulStages)[number];

const maxLatencyMs = 30 * 60_000;
const futureClockSkewMs = 5 * 60_000;
const modelSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const correlationIdSchema = z.string().uuid();
const durationSchema = z.number().int().min(0).max(maxLatencyMs).nullable().default(null);

export const aiSloTelemetryEventSchema = z.object({
  /** A request-scoped UUID from the AI run, never an account or user identifier. */
  correlationId: correlationIdSchema,
  environment: z.enum(aiSloEnvironments),
  requestKind: z.enum(aiSloRequestKinds).default("legal_chat"),
  authKind: z.enum(aiSloAuthKinds),
  answerMode: z.enum(aiSloAnswerModes),
  reasoningMode: z.enum(aiSloReasoningModes),
  provider: z.enum(aiSloProviders),
  model: modelSchema.nullable().default(null),
  outcome: z.enum(aiSloOutcomes),
  fallback: z.enum(aiSloFallbacks).default("none"),
  authLatencyMs: durationSchema,
  contextLatencyMs: durationSchema,
  retrievalLatencyMs: durationSchema,
  providerTtftMs: durationSchema,
  providerTotalMs: durationSchema,
  validationLatencyMs: durationSchema,
  persistenceLatencyMs: durationSchema,
  endToEndMs: z.number().int().min(0).max(maxLatencyMs),
  firstUsefulStage: z.enum(aiSloFirstUsefulStages),
  firstUsefulLatencyMs: durationSchema,
  safeErrorCode: z.enum(aiSloSafeErrorCodes).nullable().default(null),
  occurredAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  const hasFirstUseful = value.firstUsefulStage !== "none";
  if (hasFirstUseful !== (value.firstUsefulLatencyMs !== null)) {
    context.addIssue({
      code: "custom",
      path: ["firstUsefulLatencyMs"],
      message: "AI_SLO_FIRST_USEFUL_SHAPE_INVALID",
    });
  }
  // A non-streaming provider probe may complete a connectivity check without
  // possessing a genuine first-useful-content measurement. It is valid for
  // the 30-second completion SLO, but must remain excluded from the 5-second
  // first-useful metric rather than inventing a terminal timestamp.
  if (value.outcome === "completed" && !hasFirstUseful && value.requestKind !== "staging_synthetic_probe") {
    context.addIssue({
      code: "custom",
      path: ["firstUsefulStage"],
      message: "AI_SLO_COMPLETED_EVENT_REQUIRES_FIRST_USEFUL_STAGE",
    });
  }
  if (value.outcome === "completed" && value.safeErrorCode !== null) {
    context.addIssue({
      code: "custom",
      path: ["safeErrorCode"],
      message: "AI_SLO_COMPLETED_EVENT_CANNOT_HAVE_ERROR_CODE",
    });
  }
  if (value.outcome !== "completed" && value.safeErrorCode === null) {
    context.addIssue({
      code: "custom",
      path: ["safeErrorCode"],
      message: "AI_SLO_FAILED_EVENT_REQUIRES_SAFE_ERROR_CODE",
    });
  }
  if (value.provider === "none" && (
    value.model !== null || value.providerTtftMs !== null || value.providerTotalMs !== null
  )) {
    context.addIssue({
      code: "custom",
      path: ["provider"],
      message: "AI_SLO_PROVIDER_NONE_CANNOT_HAVE_PROVIDER_DETAILS",
    });
  }
  if (value.provider !== "none" && value.model === null) {
    context.addIssue({
      code: "custom",
      path: ["model"],
      message: "AI_SLO_PROVIDER_EVENT_REQUIRES_MODEL",
    });
  }
  if (value.fallback === "openai_to_anthropic" && value.provider !== "anthropic") {
    context.addIssue({ code: "custom", path: ["fallback"], message: "AI_SLO_FALLBACK_PROVIDER_INVALID" });
  }
  if (value.fallback === "anthropic_to_openai" && value.provider !== "openai") {
    context.addIssue({ code: "custom", path: ["fallback"], message: "AI_SLO_FALLBACK_PROVIDER_INVALID" });
  }
  if (value.requestKind === "staging_synthetic_probe" && value.environment !== "staging") {
    context.addIssue({ code: "custom", path: ["environment"], message: "AI_SLO_STAGING_PROBE_REQUIRES_STAGING" });
  }
  if (value.firstUsefulLatencyMs !== null && value.firstUsefulLatencyMs > value.endToEndMs) {
    context.addIssue({ code: "custom", path: ["firstUsefulLatencyMs"], message: "AI_SLO_FIRST_USEFUL_AFTER_END_TO_END" });
  }
});

export type AiSloTelemetryEventInput = z.input<typeof aiSloTelemetryEventSchema>;

type AiSloTelemetryRow = {
  id: string;
  requestKind: AiSloRequestKind;
  outcome: (typeof aiSloOutcomes)[number];
  authLatencyMs: number | null;
  contextLatencyMs: number | null;
  retrievalLatencyMs: number | null;
  providerTtftMs: number | null;
  providerTotalMs: number | null;
  validationLatencyMs: number | null;
  persistenceLatencyMs: number | null;
  endToEndMs: number;
  firstUsefulStage: AiSloFirstUsefulStage;
  firstUsefulLatencyMs: number | null;
  firstUsefulPass: number;
  fullResponsePass: number;
};

const aiSloTelemetryRowSchema: z.ZodType<AiSloTelemetryRow> = z.object({
  id: z.string().uuid(),
  requestKind: z.enum(aiSloRequestKinds),
  outcome: z.enum(aiSloOutcomes),
  authLatencyMs: z.number().int().min(0).nullable(),
  contextLatencyMs: z.number().int().min(0).nullable(),
  retrievalLatencyMs: z.number().int().min(0).nullable(),
  providerTtftMs: z.number().int().min(0).nullable(),
  providerTotalMs: z.number().int().min(0).nullable(),
  validationLatencyMs: z.number().int().min(0).nullable(),
  persistenceLatencyMs: z.number().int().min(0).nullable(),
  endToEndMs: z.number().int().min(0),
  firstUsefulStage: z.enum(aiSloFirstUsefulStages),
  firstUsefulLatencyMs: z.number().int().min(0).nullable(),
  firstUsefulPass: z.number().int().min(0).max(1),
  fullResponsePass: z.number().int().min(0).max(1),
}).strict();

export class AiSloTelemetryError extends Error {
  constructor(readonly code: "AI_SLO_TELEMETRY_INVALID" | "AI_SLO_TELEMETRY_PERSISTENCE_FAILED") {
    super(code);
    this.name = "AiSloTelemetryError";
  }
}

export type AiSloTelemetryRecord = {
  id: string;
  correlationHash: string;
  persisted: boolean;
  firstUsefulPass: boolean;
  fullResponsePass: boolean;
};

export type AiSloMetricSummary = {
  /** Numeric observations that can be used to calculate a percentile. */
  observed: number;
  /** Requests in this metric's denominator, including failed requests. */
  evaluated: number;
  /**
   * Events intentionally outside this metric's measurement contract. Today
   * this is limited to a completed non-streaming staging probe, for which a
   * real first-useful-content timestamp does not exist.
   */
  excludedUnmeasurable: number;
  /** Evaluated requests that did not produce a numeric observation. */
  missingMeasurements: number;
  minimumSampleSize: number;
  sufficientSample: boolean;
  sampleStatus: "sufficient" | "insufficient" | "unmeasurable" | "truncated" | "invalid_rows";
  p50Ms: number | null;
  p95Ms: number | null;
  targetMs: number | null;
  passed: number | null;
  passRate: number | null;
};

export type AiSloAggregate = {
  environment: AiSloEnvironment;
  requestKind: AiSloRequestKind | null;
  from: string;
  until: string;
  totalEvents: number;
  sampledEvents: number;
  /** Rows rejected by the strict read schema; never use them for a percentile. */
  discardedEvents: number;
  minimumSampleSize: number;
  sufficientSample: boolean;
  truncated: boolean;
  sampleStatus: "sufficient" | "insufficient" | "truncated" | "invalid_rows";
  firstUseful: AiSloMetricSummary;
  fullResponse: AiSloMetricSummary;
  stages: Readonly<Record<
    "auth" | "context" | "retrieval" | "providerTtft" | "providerTotal" | "validation" | "persistence",
    AiSloMetricSummary
  >>;
  outcomes: Readonly<Record<(typeof aiSloOutcomes)[number], number>>;
};

function canonicalTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AiSloTelemetryError("AI_SLO_TELEMETRY_INVALID");
  return new Date(parsed).toISOString();
}

function validateTimestamp(value: string, now: Date): string {
  const timestamp = canonicalTimestamp(value);
  if (Date.parse(timestamp) > now.getTime() + futureClockSkewMs) {
    throw new AiSloTelemetryError("AI_SLO_TELEMETRY_INVALID");
  }
  return timestamp;
}

async function correlationHash(environment: AiSloEnvironment, correlationId: string): Promise<string> {
  const parsed = correlationIdSchema.safeParse(correlationId);
  if (!parsed.success) throw new AiSloTelemetryError("AI_SLO_TELEMETRY_INVALID");
  const bytes = new TextEncoder().encode(`juro.ai.slo.v1\n${environment}\n${parsed.data.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Use this only for system-generated staging synthetic probes. */
export function createStagingAiSloProbeCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Persist one final request measurement. Duplicate delivery of the same
 * correlation is idempotent; telemetry failure is exposed to the caller so it
 * can be logged without masking a durable AI answer.
 */
export async function recordAiSloTelemetry(input: {
  db: D1Database;
  value: AiSloTelemetryEventInput;
  now?: Date;
}): Promise<AiSloTelemetryRecord> {
  const value = aiSloTelemetryEventSchema.safeParse(input.value);
  if (!value.success) throw new AiSloTelemetryError("AI_SLO_TELEMETRY_INVALID");
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const occurredAt = validateTimestamp(value.data.occurredAt ?? nowIso, now);
  const hash = await correlationHash(value.data.environment, value.data.correlationId);
  const id = crypto.randomUUID();
  const firstUsefulPass = value.data.firstUsefulLatencyMs !== null
    && value.data.firstUsefulLatencyMs <= AI_FIRST_USEFUL_SLO_MS;
  const fullResponsePass = value.data.outcome === "completed"
    && value.data.endToEndMs <= AI_FULL_RESPONSE_SLO_MS;
  try {
    const result = await input.db.prepare(
      `INSERT OR IGNORE INTO ai_slo_telemetry_events
       (id,environment,correlation_hash,request_kind,auth_kind,answer_mode,reasoning_mode,provider,model,
        outcome,fallback,auth_latency_ms,context_latency_ms,retrieval_latency_ms,provider_ttft_ms,
        provider_total_ms,validation_latency_ms,persistence_latency_ms,end_to_end_ms,first_useful_stage,
        first_useful_latency_ms,first_useful_pass,full_response_pass,safe_error_code,occurred_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      value.data.environment,
      hash,
      value.data.requestKind,
      value.data.authKind,
      value.data.answerMode,
      value.data.reasoningMode,
      value.data.provider,
      value.data.model,
      value.data.outcome,
      value.data.fallback,
      value.data.authLatencyMs,
      value.data.contextLatencyMs,
      value.data.retrievalLatencyMs,
      value.data.providerTtftMs,
      value.data.providerTotalMs,
      value.data.validationLatencyMs,
      value.data.persistenceLatencyMs,
      value.data.endToEndMs,
      value.data.firstUsefulStage,
      value.data.firstUsefulLatencyMs,
      firstUsefulPass ? 1 : 0,
      fullResponsePass ? 1 : 0,
      value.data.safeErrorCode,
      occurredAt,
      nowIso,
    ).run();
    return {
      id,
      correlationHash: hash,
      persisted: Number(result.meta.changes ?? 0) === 1,
      firstUsefulPass,
      fullResponsePass,
    };
  } catch {
    throw new AiSloTelemetryError("AI_SLO_TELEMETRY_PERSISTENCE_FAILED");
  }
}

/**
 * Best-effort variant for a request's non-critical tail. It is intentionally
 * explicit so callers never accidentally make telemetry a reason to fail a
 * legal answer or charge.
 */
export async function tryRecordAiSloTelemetry(input: {
  db: D1Database;
  value: AiSloTelemetryEventInput;
  now?: Date;
}): Promise<{ ok: true; record: AiSloTelemetryRecord } | { ok: false; error: AiSloTelemetryError }> {
  try {
    return { ok: true, record: await recordAiSloTelemetry(input) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof AiSloTelemetryError
        ? error
        : new AiSloTelemetryError("AI_SLO_TELEMETRY_PERSISTENCE_FAILED"),
    };
  }
}

/** A constrained helper for a staging-only synthetic probe, never real chat traffic. */
export async function recordStagingAiSloProbe(input: {
  db: D1Database;
  correlationId: string;
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  provider: "openai" | "anthropic" | "none";
  model?: string | null;
  outcome: "completed" | "failed" | "timed_out" | "cancelled";
  fallback?: "none" | "openai_to_anthropic" | "anthropic_to_openai";
  authLatencyMs?: number | null;
  contextLatencyMs?: number | null;
  retrievalLatencyMs?: number | null;
  providerTtftMs?: number | null;
  providerTotalMs?: number | null;
  validationLatencyMs?: number | null;
  persistenceLatencyMs?: number | null;
  endToEndMs: number;
  firstUsefulStage: AiSloFirstUsefulStage;
  firstUsefulLatencyMs?: number | null;
  safeErrorCode?: (typeof aiSloSafeErrorCodes)[number] | null;
  now?: Date;
}): Promise<AiSloTelemetryRecord> {
  return recordAiSloTelemetry({
    db: input.db,
    now: input.now,
    value: {
      correlationId: input.correlationId,
      environment: "staging",
      requestKind: "staging_synthetic_probe",
      authKind: "system",
      answerMode: input.answerMode,
      reasoningMode: input.reasoningMode,
      provider: input.provider,
      model: input.model ?? null,
      outcome: input.outcome,
      fallback: input.fallback ?? "none",
      authLatencyMs: input.authLatencyMs ?? null,
      contextLatencyMs: input.contextLatencyMs ?? null,
      retrievalLatencyMs: input.retrievalLatencyMs ?? null,
      providerTtftMs: input.providerTtftMs ?? null,
      providerTotalMs: input.providerTotalMs ?? null,
      validationLatencyMs: input.validationLatencyMs ?? null,
      persistenceLatencyMs: input.persistenceLatencyMs ?? null,
      endToEndMs: input.endToEndMs,
      firstUsefulStage: input.firstUsefulStage,
      firstUsefulLatencyMs: input.firstUsefulLatencyMs ?? null,
      safeErrorCode: input.safeErrorCode ?? null,
    },
  });
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] ?? null;
}

function metricSummary(
  values: readonly number[],
  options: {
    targetMs?: number;
    passValues?: readonly number[];
    evaluated?: number;
    excludedUnmeasurable?: number;
    minimumSampleSize: number;
    truncated: boolean;
    discardedEvents: number;
  },
): AiSloMetricSummary {
  const passed = options.passValues ? options.passValues.reduce((sum, value) => sum + value, 0) : null;
  const evaluated = options.evaluated ?? values.length;
  const excludedUnmeasurable = options.excludedUnmeasurable ?? 0;
  const missingMeasurements = Math.max(0, evaluated - values.length);
  const sufficientSample = !options.truncated
    && options.discardedEvents === 0
    && values.length >= options.minimumSampleSize;
  const sampleStatus = options.truncated
    ? "truncated"
    : options.discardedEvents > 0
      ? "invalid_rows"
      : sufficientSample
        ? "sufficient"
        : values.length === 0 && evaluated === 0 && excludedUnmeasurable > 0
          ? "unmeasurable"
          : "insufficient";
  return {
    observed: values.length,
    evaluated,
    excludedUnmeasurable,
    missingMeasurements,
    minimumSampleSize: options.minimumSampleSize,
    sufficientSample,
    sampleStatus,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    targetMs: options.targetMs ?? null,
    passed,
    passRate: options.passValues && evaluated > 0
      ? passed! / evaluated
      : null,
  };
}

function values(rows: readonly AiSloTelemetryRow[], key: keyof Pick<AiSloTelemetryRow,
  "authLatencyMs" | "contextLatencyMs" | "retrievalLatencyMs" | "providerTtftMs" | "providerTotalMs" |
  "validationLatencyMs" | "persistenceLatencyMs" | "firstUsefulLatencyMs" | "endToEndMs"
>): number[] {
  return rows.flatMap((row) => {
    const value = row[key];
    return typeof value === "number" ? [value] : [];
  });
}

function safePositiveInt(value: number | undefined, fallback: number, max: number): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > max) {
    throw new AiSloTelemetryError("AI_SLO_TELEMETRY_INVALID");
  }
  return candidate;
}

/**
 * Produces exact nearest-rank p50/p95 values for a bounded window. When the
 * requested window is larger than the sampled cap, `truncated` is true and
 * `sufficientSample` is intentionally false rather than claiming confidence.
 */
export async function aggregateAiSloTelemetry(input: {
  db: D1Database;
  environment: AiSloEnvironment;
  from: string;
  until?: string;
  requestKind?: AiSloRequestKind;
  minimumSampleSize?: number;
  maxWindowEvents?: number;
  now?: Date;
}): Promise<AiSloAggregate> {
  const now = input.now ?? new Date();
  const from = canonicalTimestamp(input.from);
  const until = canonicalTimestamp(input.until ?? now.toISOString());
  if (Date.parse(until) < Date.parse(from)) throw new AiSloTelemetryError("AI_SLO_TELEMETRY_INVALID");
  const minimumSampleSize = safePositiveInt(input.minimumSampleSize, DEFAULT_AI_SLO_MINIMUM_SAMPLE_SIZE, 10_000);
  const maxWindowEvents = safePositiveInt(input.maxWindowEvents, DEFAULT_AI_SLO_MAX_WINDOW_EVENTS, 50_000);
  const kindClause = input.requestKind ? " AND request_kind=?" : "";
  const bindings: (string | number)[] = [input.environment, from, until];
  if (input.requestKind) bindings.push(input.requestKind);
  const count = await input.db.prepare(
    `SELECT count(*) AS count FROM ai_slo_telemetry_events
     WHERE environment=? AND occurred_at>=? AND occurred_at<=?${kindClause}`,
  ).bind(...bindings).first<{ count: number }>();
  const rowsResult = await input.db.prepare(
    `SELECT id,request_kind AS requestKind,outcome,
      auth_latency_ms AS authLatencyMs,context_latency_ms AS contextLatencyMs,
      retrieval_latency_ms AS retrievalLatencyMs,provider_ttft_ms AS providerTtftMs,
      provider_total_ms AS providerTotalMs,validation_latency_ms AS validationLatencyMs,
      persistence_latency_ms AS persistenceLatencyMs,end_to_end_ms AS endToEndMs,
      first_useful_stage AS firstUsefulStage,first_useful_latency_ms AS firstUsefulLatencyMs,
      first_useful_pass AS firstUsefulPass,full_response_pass AS fullResponsePass
     FROM ai_slo_telemetry_events
     WHERE environment=? AND occurred_at>=? AND occurred_at<=?${kindClause}
     ORDER BY occurred_at DESC,id DESC LIMIT ?`,
  ).bind(...bindings, maxWindowEvents).all<unknown>();
  const rows: AiSloTelemetryRow[] = [];
  for (const candidate of rowsResult.results) {
    const parsed = aiSloTelemetryRowSchema.safeParse(candidate);
    if (parsed.success) rows.push(parsed.data);
  }
  const totalEvents = Number(count?.count ?? 0);
  const truncated = totalEvents > maxWindowEvents;
  const discardedEvents = rowsResult.results.length - rows.length;
  const outcomes: Record<(typeof aiSloOutcomes)[number], number> = {
    completed: 0,
    failed: 0,
    timed_out: 0,
    cancelled: 0,
  };
  for (const row of rows) outcomes[row.outcome] += 1;
  const explicitlyUnmeasurableFirstUsefulRows = rows.filter((row) => (
    row.requestKind === "staging_synthetic_probe"
    && row.outcome === "completed"
    && row.firstUsefulStage === "none"
    && row.firstUsefulLatencyMs === null
  ));
  const firstUsefulRows = rows.filter((row) => row.firstUsefulLatencyMs !== null);
  const firstUsefulEvaluatedRows = rows.filter((row) => !explicitlyUnmeasurableFirstUsefulRows.includes(row));
  // A full-response percentile describes completed responses only. Failed or
  // cancelled runs remain in the pass-rate denominator but their terminal
  // duration is not a completed-response latency sample.
  const completedResponseRows = rows.filter((row) => row.outcome === "completed");
  const firstUseful = metricSummary(values(firstUsefulRows, "firstUsefulLatencyMs"), {
    targetMs: AI_FIRST_USEFUL_SLO_MS,
    passValues: firstUsefulEvaluatedRows.map((row) => row.firstUsefulPass),
    evaluated: firstUsefulEvaluatedRows.length,
    excludedUnmeasurable: explicitlyUnmeasurableFirstUsefulRows.length,
    minimumSampleSize,
    truncated,
    discardedEvents,
  });
  const fullResponse = metricSummary(values(completedResponseRows, "endToEndMs"), {
    targetMs: AI_FULL_RESPONSE_SLO_MS,
    passValues: rows.map((row) => row.fullResponsePass),
    evaluated: rows.length,
    minimumSampleSize,
    truncated,
    discardedEvents,
  });
  // A top-level green sample must be adequate for both user-facing metrics.
  // In particular, a batch of non-streaming Anthropic probes can validate
  // completion but cannot make the first-useful SLO statistically sufficient.
  const sufficientSample = firstUseful.sufficientSample && fullResponse.sufficientSample;
  const stageSummary = (key: keyof Pick<AiSloTelemetryRow,
    "authLatencyMs" | "contextLatencyMs" | "retrievalLatencyMs" | "providerTtftMs" | "providerTotalMs" |
    "validationLatencyMs" | "persistenceLatencyMs"
  >) => metricSummary(values(rows, key), {
    minimumSampleSize,
    truncated,
    discardedEvents,
    evaluated: rows.length,
  });
  return {
    environment: input.environment,
    requestKind: input.requestKind ?? null,
    from,
    until,
    totalEvents,
    sampledEvents: rows.length,
    discardedEvents,
    minimumSampleSize,
    sufficientSample,
    truncated,
    sampleStatus: truncated
      ? "truncated"
      : discardedEvents > 0
        ? "invalid_rows"
        : sufficientSample
          ? "sufficient"
          : "insufficient",
    firstUseful,
    fullResponse,
    stages: {
      auth: stageSummary("authLatencyMs"),
      context: stageSummary("contextLatencyMs"),
      retrieval: stageSummary("retrievalLatencyMs"),
      providerTtft: stageSummary("providerTtftMs"),
      providerTotal: stageSummary("providerTotalMs"),
      validation: stageSummary("validationLatencyMs"),
      persistence: stageSummary("persistenceLatencyMs"),
    },
    outcomes,
  };
}
