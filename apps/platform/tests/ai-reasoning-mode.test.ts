import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { legalChatResponseSchema } from "../lib/ai/legal-chat-schema";
import {
  aiReasoningProfile,
  aiReasoningRuntimeRoute,
  DEFAULT_AI_REASONING_MODE,
  parseAiReasoningMode,
} from "../lib/ai/reasoning-mode";
import { recordAiSloTelemetry } from "../lib/ai/slo-telemetry";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const drizzleRoot = new URL("../drizzle/", import.meta.url);

function migrationStatements(sql: string): string[] {
  return sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test("balanced is the safe default while all three public reasoning modes remain explicit", () => {
  assert.equal(DEFAULT_AI_REASONING_MODE, "balanced");
  assert.equal(parseAiReasoningMode(undefined), "balanced");
  assert.equal(parseAiReasoningMode("unexpected"), "balanced");
  assert.equal(parseAiReasoningMode("fast"), "fast");
  assert.equal(parseAiReasoningMode("balanced"), "balanced");
  assert.equal(parseAiReasoningMode("deep"), "deep");
  assert.equal(legalChatResponseSchema.shape.reasoningMode.parse("balanced"), "balanced");
  assert.equal(legalChatResponseSchema.shape.reasoningMode.safeParse("unexpected").success, false);
});

test("reasoning profiles preserve the intended model and cost boundary", () => {
  const fast = aiReasoningProfile("fast");
  const balanced = aiReasoningProfile("balanced");
  const deep = aiReasoningProfile("deep");

  assert.deepEqual(
    [fast.modelTier, balanced.modelTier, deep.modelTier],
    ["chat", "chat", "deep"],
  );
  assert.deepEqual(
    [fast.openAiReasoningEffort, balanced.openAiReasoningEffort, deep.openAiReasoningEffort],
    ["low", "medium", "high"],
  );
  assert.ok(fast.maxOutputTokens.detailed < balanced.maxOutputTokens.detailed);
  assert.ok(balanced.maxOutputTokens.detailed < deep.maxOutputTokens.detailed);
  assert.ok(fast.fallbackTimeoutMs < balanced.fallbackTimeoutMs);
  assert.ok(balanced.fallbackTimeoutMs < deep.fallbackTimeoutMs);
});

test("runtime execution and Admin use one exact mode-to-model mapping", async () => {
  const settings = {
    openaiChatModel: "gpt-chat-test",
    openaiDeepModel: "gpt-deep-test",
    anthropicChatFallbackModel: "claude-fallback-test",
  };
  const fast = aiReasoningRuntimeRoute(settings, "fast");
  const balanced = aiReasoningRuntimeRoute(settings, "balanced");
  const deep = aiReasoningRuntimeRoute(settings, "deep");
  assert.deepEqual(
    [fast.primaryModel, balanced.primaryModel, deep.primaryModel],
    ["gpt-chat-test", "gpt-chat-test", "gpt-deep-test"],
  );
  assert.deepEqual(
    [fast.fallbackModel, balanced.fallbackModel, deep.fallbackModel],
    ["claude-fallback-test", "claude-fallback-test", "claude-fallback-test"],
  );
  assert.deepEqual([fast.isDefault, balanced.isDefault, deep.isDefault], [false, true, false]);

  const provider = await readFile(new URL("../lib/ai/provider.ts", import.meta.url), "utf8");
  const anthropic = await readFile(new URL("../lib/ai/anthropic-provider.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/_staff/AiSettingsConsole.tsx", import.meta.url), "utf8");
  assert.match(provider, /aiReasoningRuntimeRoute\(settings, input\.reasoningMode\)\.primaryModel/);
  assert.match(anthropic, /aiReasoningRuntimeRoute\(settings, input\.reasoningMode\)\.fallbackModel/);
  assert.match(route, /aiReasoningRuntimeRoute\(runtimeSettings, reasoningMode\)/);
  assert.match(admin, /aiReasoningRuntimeRoute\(dashboard\.current, mode\)/);
  assert.match(admin, /Фактическая маршрутизация режимов/);
  assert.match(admin, /Rejimlarning amaldagi marshruti/);
  assert.match(admin, /Сбалансированный/);
  assert.match(admin, /Muvozanatli/);
  assert.match(admin, /profile\.providerTimeoutMs/);
  assert.match(admin, /profile\.fallbackTimeoutMs/);
  assert.match(admin, /DEFAULT_AI_EXECUTION_BUDGET_MS/);
  assert.match(admin, /row\.openaiDeepModel/);
  assert.match(admin, /row\.anthropicChatFallbackModel/);
});

test("AI composer exposes the three localized modes and starts balanced", async () => {
  const client = await readFile(
    new URL("../app/_platform/AiLawyerClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(client, /useState<AiReasoningMode>\(DEFAULT_AI_REASONING_MODE\)/);
  assert.match(client, /"Быстрый"/);
  assert.match(client, /"Сбалансированный"/);
  assert.match(client, /"Глубокий"/);
  assert.match(client, /"Tezkor"/);
  assert.match(client, /"Muvozanatli"/);
  assert.match(client, /"Chuqur"/);
});

test("D1 accepts balanced SLO telemetry and keeps the journal append-only", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordAiSloTelemetry({
      db: d1,
      now: new Date("2026-08-29T00:00:00.000Z"),
      value: {
        correlationId: "00000000-0000-4000-8000-000000000161",
        environment: "staging",
        authKind: "authenticated",
        answerMode: "detailed",
        reasoningMode: "balanced",
        provider: "openai",
        model: "gpt-5.6-terra",
        outcome: "completed",
        authLatencyMs: 10,
        contextLatencyMs: 20,
        retrievalLatencyMs: 30,
        providerTtftMs: 200,
        providerTotalMs: 1_200,
        validationLatencyMs: 30,
        persistenceLatencyMs: 20,
        endToEndMs: 1_500,
        firstUsefulStage: "preliminary",
        firstUsefulLatencyMs: 500,
      },
    });
    const row = sqlite.prepare(
      "SELECT reasoning_mode AS reasoningMode FROM ai_slo_telemetry_events",
    ).get() as { reasoningMode: string };
    assert.equal(row.reasoningMode, "balanced");
    assert.throws(
      () => sqlite.exec("UPDATE ai_slo_telemetry_events SET reasoning_mode='fast'"),
      /AI_SLO_TELEMETRY_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.exec("DELETE FROM ai_slo_telemetry_events"),
      /AI_SLO_TELEMETRY_APPEND_ONLY/,
    );
  } finally {
    sqlite.close();
  }
});

test("0161 preserves existing SLO rows while expanding the immutable mode constraint", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    const journal = JSON.parse(
      readFileSync(new URL("meta/_journal.json", drizzleRoot), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    for (const entry of journal.entries) {
      if (entry.tag === "0161_balanced_ai_reasoning_mode") break;
      const sql = readFileSync(new URL(`${entry.tag}.sql`, drizzleRoot), "utf8");
      for (const statement of migrationStatements(sql)) sqlite.exec(statement);
    }
    sqlite.exec(`INSERT INTO ai_slo_telemetry_events (
      id,environment,correlation_hash,request_kind,auth_kind,answer_mode,reasoning_mode,
      provider,model,outcome,fallback,auth_latency_ms,context_latency_ms,retrieval_latency_ms,
      provider_ttft_ms,provider_total_ms,validation_latency_ms,persistence_latency_ms,end_to_end_ms,
      first_useful_stage,first_useful_latency_ms,first_useful_pass,full_response_pass,safe_error_code,
      occurred_at,created_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000160','staging',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'legal_chat','authenticated','short','fast','openai','gpt-5.6-terra','completed','none',
      10,20,30,200,1200,30,20,1500,'preliminary',500,1,1,NULL,
      '2026-08-28T23:59:00.000Z','2026-08-28T23:59:00.000Z'
    )`);

    const migration = readFileSync(
      new URL("0161_balanced_ai_reasoning_mode.sql", drizzleRoot),
      "utf8",
    );
    for (const statement of migrationStatements(migration)) sqlite.exec(statement);

    const preserved = sqlite.prepare(
      "SELECT id,reasoning_mode AS reasoningMode,provider_total_ms AS providerTotalMs FROM ai_slo_telemetry_events",
    ).get() as { id: string; reasoningMode: string; providerTotalMs: number };
    assert.equal(preserved.id, "00000000-0000-4000-8000-000000000160");
    assert.equal(preserved.reasoningMode, "fast");
    assert.equal(preserved.providerTotalMs, 1_200);
    assert.throws(
      () => sqlite.exec("UPDATE ai_slo_telemetry_events SET reasoning_mode='balanced'"),
      /AI_SLO_TELEMETRY_IMMUTABLE/,
    );
  } finally {
    sqlite.close();
  }
});
