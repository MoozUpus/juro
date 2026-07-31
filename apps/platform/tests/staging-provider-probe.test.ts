import assert from "node:assert/strict";
import test from "node:test";
import {
  providerProbeOutputSchema,
  stagingProviderProbeEnabled,
} from "../worker/staging-provider-probe";

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
