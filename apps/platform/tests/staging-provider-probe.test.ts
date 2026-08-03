import assert from "node:assert/strict";
import test from "node:test";
import {
  providerProbeOutputSchema,
  stagingProviderProbeEnabled,
} from "../worker/staging-provider-probe";
import {
  stagingAiChatLifecycleProbeEnabled,
  stagingAiChatSyntheticIds,
} from "../worker/staging-ai-chat-lifecycle-probe";

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

test("AI chat lifecycle probe is staging-only and uses isolated locale fixtures", () => {
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "development", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "production", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "false" } as never), false);
  assert.equal(stagingAiChatLifecycleProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), true);
  const ru = stagingAiChatSyntheticIds("ru");
  const uz = stagingAiChatSyntheticIds("uz");
  assert.notEqual(ru.userId, uz.userId);
  assert.match(ru.userId, /^staging-ai-chat-v26-ru-/);
  assert.match(uz.userId, /^staging-ai-chat-v26-uz-/);
  assert.equal(ru.registryKey, `legal-chat:${ru.workspaceId}:${ru.userId}:${ru.idempotencyKey}`);
});
