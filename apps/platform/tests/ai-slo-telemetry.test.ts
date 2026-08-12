import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateAiSloTelemetry,
  AI_FIRST_USEFUL_SLO_MS,
  AI_FULL_RESPONSE_SLO_MS,
  aiSloTelemetryEventSchema,
  createStagingAiSloProbeCorrelationId,
  recordAiSloTelemetry,
  recordStagingAiSloProbe,
} from "../lib/ai/slo-telemetry";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-12T05:00:00.000Z");

function correlation(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function completedEvent(index: number, input: {
  endToEndMs: number;
  firstUsefulLatencyMs: number;
  occurredAt?: string;
}) {
  return {
    correlationId: correlation(index),
    environment: "staging" as const,
    authKind: "authenticated" as const,
    answerMode: "short" as const,
    reasoningMode: "fast" as const,
    provider: "openai" as const,
    model: "gpt-4.1-mini",
    outcome: "completed" as const,
    authLatencyMs: 10,
    contextLatencyMs: 20,
    retrievalLatencyMs: 30,
    providerTtftMs: 40,
    providerTotalMs: input.endToEndMs - 100,
    validationLatencyMs: 20,
    persistenceLatencyMs: 10,
    endToEndMs: input.endToEndMs,
    firstUsefulStage: "preliminary" as const,
    firstUsefulLatencyMs: input.firstUsefulLatencyMs,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  };
}

function failedEvent(index: number, input: { endToEndMs: number; occurredAt?: string }) {
  return {
    correlationId: correlation(index),
    environment: "staging" as const,
    authKind: "authenticated" as const,
    answerMode: "short" as const,
    reasoningMode: "fast" as const,
    provider: "openai" as const,
    model: "gpt-4.1-mini",
    outcome: "timed_out" as const,
    authLatencyMs: 10,
    contextLatencyMs: 20,
    retrievalLatencyMs: 30,
    providerTtftMs: null,
    providerTotalMs: null,
    validationLatencyMs: null,
    persistenceLatencyMs: null,
    endToEndMs: input.endToEndMs,
    firstUsefulStage: "none" as const,
    firstUsefulLatencyMs: null,
    safeErrorCode: "AI_SLO_TIMEOUT" as const,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  };
}

test("0113 persists a one-way correlation hash and rejects content or account fields", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const event = completedEvent(1, { endToEndMs: 2_100, firstUsefulLatencyMs: 900 });
    assert.equal(aiSloTelemetryEventSchema.safeParse({ ...event, prompt: "secret request" }).success, false);
    assert.equal(aiSloTelemetryEventSchema.safeParse({ ...event, userId: "00000000-0000-4000-8000-999999999999" }).success, false);

    const first = await recordAiSloTelemetry({ db: d1, value: event, now });
    const replay = await recordAiSloTelemetry({ db: d1, value: event, now });
    assert.equal(first.persisted, true);
    assert.equal(replay.persisted, false);
    assert.equal(first.firstUsefulPass, true);
    assert.equal(first.fullResponsePass, true);
    assert.equal(first.correlationHash.length, 64);

    const row = sqlite.prepare(
      "SELECT correlation_hash AS correlationHash,request_kind AS requestKind,first_useful_pass AS firstUsefulPass FROM ai_slo_telemetry_events",
    ).get() as { correlationHash: string; requestKind: string; firstUsefulPass: number };
    assert.equal(row.requestKind, "legal_chat");
    assert.equal(row.firstUsefulPass, 1);
    assert.ok(!JSON.stringify(row).includes(event.correlationId));
    assert.deepEqual(
      sqlite.prepare("PRAGMA table_info(ai_slo_telemetry_events)").all().map((entry) => (entry as { name: string }).name),
      [
        "id", "environment", "correlation_hash", "request_kind", "auth_kind", "answer_mode", "reasoning_mode",
        "provider", "model", "outcome", "fallback", "auth_latency_ms", "context_latency_ms",
        "retrieval_latency_ms", "provider_ttft_ms", "provider_total_ms", "validation_latency_ms",
        "persistence_latency_ms", "end_to_end_ms", "first_useful_stage", "first_useful_latency_ms",
        "first_useful_pass", "full_response_pass", "safe_error_code", "occurred_at", "created_at",
      ],
    );
    assert.throws(
      () => sqlite.prepare("UPDATE ai_slo_telemetry_events SET outcome='failed'").run(),
      /AI_SLO_TELEMETRY_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM ai_slo_telemetry_events").run(),
      /AI_SLO_TELEMETRY_APPEND_ONLY/,
    );
  } finally {
    sqlite.close();
  }
});

test("0113 computes exact bounded p50/p95 SLO aggregates and includes failed requests in pass rates", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const samples = [
      { endToEndMs: 1_000, firstUsefulLatencyMs: 1_000 },
      { endToEndMs: 2_000, firstUsefulLatencyMs: 2_000 },
      { endToEndMs: 3_000, firstUsefulLatencyMs: 3_000 },
      { endToEndMs: 4_000, firstUsefulLatencyMs: 4_000 },
      { endToEndMs: 33_000, firstUsefulLatencyMs: 6_000 },
    ];
    await Promise.all(samples.map((sample, index) => recordAiSloTelemetry({
      db: d1,
      now,
      value: completedEvent(index + 1, {
        ...sample,
        occurredAt: new Date(now.getTime() + index * 1_000).toISOString(),
      }),
    })));
    const aggregate = await aggregateAiSloTelemetry({
      db: d1,
      environment: "staging",
      from: now.toISOString(),
      until: new Date(now.getTime() + 10_000).toISOString(),
      minimumSampleSize: 5,
      now,
    });
    assert.equal(aggregate.sufficientSample, true);
    assert.equal(aggregate.sampleStatus, "sufficient");
    assert.equal(aggregate.truncated, false);
    assert.equal(aggregate.sampledEvents, 5);
    assert.equal(aggregate.firstUseful.p50Ms, 3_000);
    assert.equal(aggregate.firstUseful.p95Ms, 6_000);
    assert.equal(aggregate.firstUseful.targetMs, AI_FIRST_USEFUL_SLO_MS);
    assert.equal(aggregate.firstUseful.evaluated, 5);
    assert.equal(aggregate.firstUseful.passed, 4);
    assert.equal(aggregate.firstUseful.passRate, 0.8);
    assert.equal(aggregate.firstUseful.sampleStatus, "sufficient");
    assert.equal(aggregate.firstUseful.excludedUnmeasurable, 0);
    assert.equal(aggregate.fullResponse.p50Ms, 3_000);
    assert.equal(aggregate.fullResponse.p95Ms, 33_000);
    assert.equal(aggregate.fullResponse.targetMs, AI_FULL_RESPONSE_SLO_MS);
    assert.equal(aggregate.fullResponse.passed, 4);
    assert.equal(aggregate.fullResponse.passRate, 0.8);
    assert.equal(aggregate.fullResponse.sampleStatus, "sufficient");
    assert.equal(aggregate.stages.providerTtft.p95Ms, 40);
    assert.deepEqual(aggregate.outcomes, {
      completed: 5,
      failed: 0,
      timed_out: 0,
      cancelled: 0,
    });
  } finally {
    sqlite.close();
  }
});

test("0113 reports insufficient samples and bounds a staging synthetic probe to staging only", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const probeCorrelationId = createStagingAiSloProbeCorrelationId();
    const record = await recordStagingAiSloProbe({
      db: d1,
      correlationId: probeCorrelationId,
      answerMode: "short",
      reasoningMode: "fast",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      outcome: "completed",
      endToEndMs: 2_000,
      firstUsefulStage: "provider_validated",
      firstUsefulLatencyMs: 1_500,
      now,
    });
    assert.equal(record.persisted, true);
    const aggregate = await aggregateAiSloTelemetry({
      db: d1,
      environment: "staging",
      requestKind: "staging_synthetic_probe",
      from: new Date(now.getTime() - 1_000).toISOString(),
      until: new Date(now.getTime() + 1_000).toISOString(),
      minimumSampleSize: 2,
      now,
    });
    assert.equal(aggregate.sufficientSample, false);
    assert.equal(aggregate.sampledEvents, 1);
    assert.equal(aiSloTelemetryEventSchema.safeParse({
      ...completedEvent(99, { endToEndMs: 1_000, firstUsefulLatencyMs: 500 }),
      environment: "development",
      requestKind: "staging_synthetic_probe",
    }).success, false);
  } finally {
    sqlite.close();
  }
});

test("non-streaming staging probes contribute to full-response SLO without fabricating first useful content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const record = await recordStagingAiSloProbe({
      db: d1,
      correlationId: createStagingAiSloProbeCorrelationId(),
      answerMode: "short",
      reasoningMode: "fast",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      outcome: "completed",
      endToEndMs: 7_000,
      firstUsefulStage: "none",
      firstUsefulLatencyMs: null,
      now,
    });
    assert.equal(record.firstUsefulPass, false);
    assert.equal(record.fullResponsePass, true);
    const aggregate = await aggregateAiSloTelemetry({
      db: d1,
      environment: "staging",
      requestKind: "staging_synthetic_probe",
      from: new Date(now.getTime() - 1_000).toISOString(),
      until: new Date(now.getTime() + 1_000).toISOString(),
      minimumSampleSize: 1,
      now,
    });
    assert.equal(aggregate.firstUseful.observed, 0);
    assert.equal(aggregate.firstUseful.p95Ms, null);
    assert.equal(aggregate.firstUseful.evaluated, 0);
    assert.equal(aggregate.firstUseful.excludedUnmeasurable, 1);
    assert.equal(aggregate.firstUseful.sampleStatus, "unmeasurable");
    assert.equal(aggregate.firstUseful.sufficientSample, false);
    assert.equal(aggregate.fullResponse.p95Ms, 7_000);
    assert.equal(aggregate.fullResponse.sampleStatus, "sufficient");
    assert.equal(aggregate.sufficientSample, false);
    assert.equal(aggregate.sampleStatus, "insufficient");
  } finally {
    sqlite.close();
  }
});

test("percentiles use completed responses while interactive failures remain in each SLO pass-rate denominator", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordAiSloTelemetry({
      db: d1,
      now,
      value: completedEvent(201, {
        endToEndMs: 1_000,
        firstUsefulLatencyMs: 500,
        occurredAt: now.toISOString(),
      }),
    });
    await recordAiSloTelemetry({
      db: d1,
      now,
      value: completedEvent(202, {
        endToEndMs: 2_000,
        firstUsefulLatencyMs: 700,
        occurredAt: new Date(now.getTime() + 1_000).toISOString(),
      }),
    });
    await recordAiSloTelemetry({
      db: d1,
      now,
      value: failedEvent(203, {
        endToEndMs: 29_000,
        occurredAt: new Date(now.getTime() + 2_000).toISOString(),
      }),
    });

    const aggregate = await aggregateAiSloTelemetry({
      db: d1,
      environment: "staging",
      from: now.toISOString(),
      until: new Date(now.getTime() + 10_000).toISOString(),
      minimumSampleSize: 2,
      now,
    });

    assert.equal(aggregate.fullResponse.observed, 2);
    assert.equal(aggregate.fullResponse.evaluated, 3);
    assert.equal(aggregate.fullResponse.missingMeasurements, 1);
    assert.equal(aggregate.fullResponse.p95Ms, 2_000);
    assert.equal(aggregate.fullResponse.passed, 2);
    assert.equal(aggregate.fullResponse.passRate, 2 / 3);
    assert.equal(aggregate.firstUseful.observed, 2);
    assert.equal(aggregate.firstUseful.evaluated, 3);
    assert.equal(aggregate.firstUseful.missingMeasurements, 1);
    assert.equal(aggregate.firstUseful.p95Ms, 700);
    assert.equal(aggregate.firstUseful.passed, 2);
    assert.equal(aggregate.firstUseful.passRate, 2 / 3);
    assert.equal(aggregate.sufficientSample, true);
  } finally {
    sqlite.close();
  }
});

test("unmeasurable non-streaming probes cannot satisfy the aggregate first-useful sample gate", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await Promise.all([1, 2, 3].map((index) => recordStagingAiSloProbe({
      db: d1,
      correlationId: createStagingAiSloProbeCorrelationId(),
      answerMode: "short",
      reasoningMode: "fast",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      outcome: "completed",
      endToEndMs: 1_000 + index,
      firstUsefulStage: "none",
      firstUsefulLatencyMs: null,
      now,
    })));
    const aggregate = await aggregateAiSloTelemetry({
      db: d1,
      environment: "staging",
      requestKind: "staging_synthetic_probe",
      from: new Date(now.getTime() - 1_000).toISOString(),
      until: new Date(now.getTime() + 1_000).toISOString(),
      minimumSampleSize: 3,
      now,
    });
    assert.equal(aggregate.fullResponse.sufficientSample, true);
    assert.equal(aggregate.firstUseful.observed, 0);
    assert.equal(aggregate.firstUseful.evaluated, 0);
    assert.equal(aggregate.firstUseful.excludedUnmeasurable, 3);
    assert.equal(aggregate.firstUseful.sampleStatus, "unmeasurable");
    assert.equal(aggregate.sufficientSample, false);
    assert.equal(aggregate.sampleStatus, "insufficient");
  } finally {
    sqlite.close();
  }
});
