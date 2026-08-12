import assert from "node:assert/strict";
import test from "node:test";
import {
  stagingDocumentAnalysisProbeEnabled,
  stagingDocumentAnalysisProbeProviderOptions,
} from "../worker/staging-document-analysis-probe";

test("document analysis probe is impossible outside explicitly enabled staging", () => {
  assert.equal(stagingDocumentAnalysisProbeEnabled({ APP_ENV: "development", STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED: "true" } as never), false);
  assert.equal(stagingDocumentAnalysisProbeEnabled({ APP_ENV: "production", STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED: "true" } as never), false);
  assert.equal(stagingDocumentAnalysisProbeEnabled({ APP_ENV: "staging", STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED: "false" } as never), false);
  assert.equal(stagingDocumentAnalysisProbeEnabled({ APP_ENV: "staging", STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED: "true" } as never), true);
});

test("document analysis probe shares one bounded deadline and intentionally has no provider fallback", () => {
  assert.deepEqual(stagingDocumentAnalysisProbeProviderOptions(10_000), {
    providerTimeoutMs: 30_000,
    providerMaxAttempts: 1,
    deadlineAt: 40_000,
    fallbackEnabled: false,
  });
});
