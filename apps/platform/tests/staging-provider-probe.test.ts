import assert from "node:assert/strict";
import test from "node:test";
import {
  createRollingStagingProviderProbeExecution,
  providerProbeOutputSchema,
  pruneRollingStagingProviderProbeRows,
  STAGING_PROVIDER_PROBE_EXECUTION_BUDGET_MS,
  stagingProviderProbeEnabled,
} from "../worker/staging-provider-probe";
import { anthropicResponseStartTimeoutMs } from "../lib/ai/anthropic-provider";
import {
  stagingAiChatLifecycleProbeEnabled,
  stagingAiChatProbeLocaleForExecution,
  stagingAiChatSyntheticIds,
} from "../worker/staging-ai-chat-lifecycle-probe";
import { createUnavailableVerifiedSourceClarification } from "../lib/ai/fast-clarification";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";
import { recordStagingAiSloProbe } from "../lib/ai/slo-telemetry";

test("staging provider probe is impossible outside explicitly enabled staging", () => {
  assert.equal(stagingProviderProbeEnabled({ APP_ENV: "development", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingProviderProbeEnabled({ APP_ENV: "production", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingProviderProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "false" } as never), false);
  assert.equal(stagingProviderProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), true);
});

test("provider probe accepts only the fixed minimal technical result", () => {
  assert.deepEqual(providerProbeOutputSchema.parse({ status: "ok" }), { status: "ok" });
  assert.throws(() => providerProbeOutputSchema.parse({ status: "done" }));
  assert.throws(() => providerProbeOutputSchema.parse({ status: "ok", extra: true }));
});

test("rolling provider probes use unique timestamped executions and retain the 30-second shared SLO", () => {
  const first = createRollingStagingProviderProbeExecution(
    new Date("2026-08-12T05:00:00.000Z"),
    "00000000-0000-4000-8000-000000000010",
  );
  const second = createRollingStagingProviderProbeExecution(
    new Date("2026-08-12T05:05:00.000Z"),
    "00000000-0000-4000-8000-000000000011",
  );
  assert.notEqual(first.probeKey, second.probeKey);
  assert.match(first.probeKey, /^staging-provider-slo-v27-20260812T050000000Z-00000000-0000-4000-8000-000000000010$/);
  assert.equal(STAGING_PROVIDER_PROBE_EXECUTION_BUDGET_MS, 30_000);
  assert.notEqual(first.locale, second.locale);
  assert.throws(() => createRollingStagingProviderProbeExecution(new Date(), "not-a-uuid"));
});

test("Anthropic staging connectivity probes may wait for the bounded non-streaming response start", () => {
  // Normal fast chat remains a short user-facing response-start check. It is
  // not reported as a provider first-content measurement because Anthropic's
  // structured result is returned non-streaming.
  assert.equal(anthropicResponseStartTimeoutMs({
    interactive: true,
    providerTimeoutMs: 25_500,
  }), 4_500);

  // The staging probe tests connectivity, so it may use the same bounded
  // provider window. It can never exceed that total response budget.
  assert.equal(anthropicResponseStartTimeoutMs({
    interactive: true,
    providerTimeoutMs: 25_500,
    nonStreamingResponseStartTimeoutMs: 25_500,
  }), 25_500);
  assert.equal(anthropicResponseStartTimeoutMs({
    interactive: true,
    providerTimeoutMs: 7_000,
    nonStreamingResponseStartTimeoutMs: 25_500,
  }), 7_000);
});

test("AI chat lifecycle probe is staging-only and uses isolated rolling locale fixtures", () => {
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "development", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "production", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "false" } as never), false);
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), true);
  const ruExecution = "00000000-0000-4000-8000-000000000010";
  const uzExecution = "00000000-0000-4000-8000-000000000011";
  assert.equal(stagingAiChatProbeLocaleForExecution(ruExecution), "ru");
  assert.equal(stagingAiChatProbeLocaleForExecution(uzExecution), "uz");
  const ru = stagingAiChatSyntheticIds("ru", ruExecution);
  const uz = stagingAiChatSyntheticIds("uz", uzExecution);
  assert.notEqual(ru.userId, uz.userId);
  assert.match(ru.userId, /^staging-ai-chat-v27-ru-00000000-0000-4000-8000-000000000010-user$/);
  assert.match(uz.userId, /^staging-ai-chat-v27-uz-00000000-0000-4000-8000-000000000011-user$/);
  assert.equal(ru.registryKey, `legal-chat:${ru.workspaceId}:${ru.userId}:${ru.idempotencyKey}`);
});

test("lifecycle probe's early no-source message is a validated clarification, not provider text", () => {
  const preliminary = createUnavailableVerifiedSourceClarification({
    locale: "ru",
    answerMode: "short",
    reasoningMode: "fast",
    legalDatabaseAsOf: "unavailable",
  });
  assert.equal(preliminary.responseKind, "clarification_required");
  assert.deepEqual(preliminary.confirmedFindings, []);
  assert.deepEqual(preliminary.sources, []);
  assert.match(preliminary.answer, /не делает правовой вывод/);
});

test("rolling probe retention prunes only expired v27 technical rows and preserves historic evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const now = new Date("2026-08-12T05:00:00.000Z");
    const expiredAt = new Date(now.getTime() - 31 * 24 * 60 * 60_000).toISOString();
    const currentAt = now.toISOString();
    const insert = sqlite.prepare(`
      INSERT INTO staging_provider_probes (
        id,probe_key,provider,status,model,provider_response_id,input_tokens,
        output_tokens,cached_input_tokens,latency_ms,error_code,started_at,
        finished_at,created_at,updated_at
      ) VALUES (?,?,?,'succeeded','probe-model',NULL,0,0,0,1,NULL,?,?,?,?)
    `);
    insert.run(
      "historic-openai", "staging-openai-legal-chat-v26", "openai", expiredAt,
      expiredAt, expiredAt, expiredAt,
    );
    insert.run(
      "expired-openai", "staging-provider-slo-v27-20260712T050000000Z-a", "openai", expiredAt,
      expiredAt, expiredAt, expiredAt,
    );
    insert.run(
      "current-anthropic", "staging-provider-slo-v27-20260812T050000000Z-b", "anthropic", currentAt,
      currentAt, currentAt, currentAt,
    );
    await recordStagingAiSloProbe({
      db: d1,
      correlationId: "00000000-0000-4000-8000-000000000099",
      answerMode: "short",
      reasoningMode: "fast",
      provider: "openai",
      model: "probe-model",
      outcome: "completed",
      endToEndMs: 100,
      firstUsefulStage: "provider_validated",
      firstUsefulLatencyMs: 90,
      now,
    });
    const deleted = await pruneRollingStagingProviderProbeRows({
      APP_ENV: "staging",
      DB: d1,
    } as never, now);
    assert.equal(deleted, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM staging_provider_probes WHERE id='historic-openai'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM staging_provider_probes WHERE id='expired-openai'").get()?.count, 0);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM staging_provider_probes WHERE id='current-anthropic'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM ai_slo_telemetry_events").get()?.count, 1);
  } finally {
    sqlite.close();
  }
});
