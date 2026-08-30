import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { DependencyHealthKey } from "../lib/operations/dependency-health";
import { recordDependencyHealthEvidence } from "../worker/dependency-health-evidence";
import type { PlatformJobEnv } from "../worker/platform-jobs";
import {
  PRODUCTION_ANTHROPIC_CONNECTIVITY_TIMEOUT_MS,
  PRODUCTION_ANTHROPIC_MODEL_ACCESS_TIMEOUT_MS,
  PRODUCTION_MALWARE_SCANNER_PROBE_TIMEOUT_MS,
  PRODUCTION_PROVIDER_PROBE_TIMEOUT_MS,
  productionDependencyProbesEnabled,
  productionOpenAiProbeOptions,
  runAnthropicProductionProbe,
  runProductionDependencyProbes,
  safeProviderFailureReason,
} from "../worker/production-dependency-probes";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const probedKeys = [
  "private_r2",
  "document_builder",
  "malware_scanner",
  "openai",
  "anthropic",
  "document_analysis",
  "resend",
  "lawyer_area",
] as const satisfies readonly DependencyHealthKey[];

function probeEnv(db: D1Database) {
  return {
    APP_ENV: "production",
    PRODUCTION_SYNTHETIC_PROBES_ENABLED: "true",
    DB: db,
  } as unknown as PlatformJobEnv & { PRODUCTION_SYNTHETIC_PROBES_ENABLED: string };
}

function builderBucket() {
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    async delete(key: string) {
      objects.delete(key);
    },
    async put(key: string, value: Uint8Array) {
      const bytes = Uint8Array.from(value);
      objects.set(key, bytes);
      return { size: bytes.byteLength };
    },
    async head(key: string) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
    async get(key: string) {
      const bytes = objects.get(key);
      return bytes ? {
        body: null,
        async arrayBuffer() {
          return bytes.slice().buffer;
        },
      } : null;
    },
  } as unknown as R2Bucket;
  return { bucket, objects };
}

function builderAssets(requests: string[]): Fetcher {
  return {
    async fetch(request: RequestInfo | URL) {
      const url = new URL(request instanceof Request ? request.url : String(request));
      requests.push(url.href);
      const path = url.pathname.replace(/^\//u, "");
      try {
        return new Response(await readFile(new URL(`../public/${path}`, import.meta.url)));
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  } as Fetcher;
}

async function seedOperational(
  env: ReturnType<typeof probeEnv>,
  excluded: readonly DependencyHealthKey[] = [],
): Promise<void> {
  const excludedKeys = new Set(excluded);
  const now = new Date();
  for (const key of probedKeys) {
    if (excludedKeys.has(key)) continue;
    await recordDependencyHealthEvidence(env, {
      key,
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: now.getTime() - 10,
    }, now);
  }
}

test("production dependency probes are impossible outside explicitly enabled production", () => {
  assert.equal(productionDependencyProbesEnabled({
    APP_ENV: "development",
    PRODUCTION_SYNTHETIC_PROBES_ENABLED: "true",
  }), false);
  assert.equal(productionDependencyProbesEnabled({
    APP_ENV: "staging",
    PRODUCTION_SYNTHETIC_PROBES_ENABLED: "true",
  }), false);
  assert.equal(productionDependencyProbesEnabled({
    APP_ENV: "production",
    PRODUCTION_SYNTHETIC_PROBES_ENABLED: "false",
  }), false);
  assert.equal(productionDependencyProbesEnabled({
    APP_ENV: "production",
    PRODUCTION_SYNTHETIC_PROBES_ENABLED: "true",
  }), true);
});

test("the production malware probe allows a bounded ClamAV cold start", () => {
  assert.equal(PRODUCTION_MALWARE_SCANNER_PROBE_TIMEOUT_MS, 55_000);
  assert.ok(PRODUCTION_MALWARE_SCANNER_PROBE_TIMEOUT_MS > 30_000);
  assert.ok(PRODUCTION_MALWARE_SCANNER_PROBE_TIMEOUT_MS < 60_000);
});

test("production provider probes stay bounded and isolate OpenAI from fallback", () => {
  assert.equal(PRODUCTION_PROVIDER_PROBE_TIMEOUT_MS, 20_000);
  assert.equal(PRODUCTION_ANTHROPIC_MODEL_ACCESS_TIMEOUT_MS, 3_000);
  assert.equal(PRODUCTION_ANTHROPIC_CONNECTIVITY_TIMEOUT_MS, 5_000);
  assert.ok(PRODUCTION_ANTHROPIC_MODEL_ACCESS_TIMEOUT_MS < PRODUCTION_ANTHROPIC_CONNECTIVITY_TIMEOUT_MS);
  assert.ok(PRODUCTION_ANTHROPIC_CONNECTIVITY_TIMEOUT_MS < PRODUCTION_PROVIDER_PROBE_TIMEOUT_MS);
  assert.deepEqual(productionOpenAiProbeOptions(), {
    providerTimeoutMs: 20_000,
    fallbackEnabled: false,
  });
});

test("Anthropic production probe runs model access, connectivity, then the legal-chat contract", async () => {
  const calls: string[] = [];
  const result = await runAnthropicProductionProbe({
    modelAccess: async () => { calls.push("model-access"); },
    connectivity: async () => { calls.push("connectivity"); },
    legalChat: async () => {
      calls.push("legal-chat");
      return {
        provider: "anthropic",
        fallbackFromProvider: null,
        responseKind: "clarification_required",
      };
    },
  });
  assert.deepEqual(calls, ["model-access", "connectivity", "legal-chat"]);
  assert.deepEqual(result, {
    provider: "anthropic",
    fallbackFromProvider: null,
    responseKind: "clarification_required",
  });
});

test("Anthropic production probe stops at model-access failure and tags the stage", async () => {
  let connectivityCalled = false;
  let legalChatCalled = false;
  await assert.rejects(() => runAnthropicProductionProbe({
    modelAccess: async () => { throw new Error("private model-access detail"); },
    connectivity: async () => { connectivityCalled = true; },
    legalChat: async () => {
      legalChatCalled = true;
      throw new Error("must not run");
    },
  }), (error: unknown) => error instanceof Error
    && (error as Error & { providerProbeStage?: unknown }).providerProbeStage === "anthropic_model_access");
  assert.equal(connectivityCalled, false);
  assert.equal(legalChatCalled, false);
});

test("Anthropic production probe stops at connectivity failure and tags the stage", async () => {
  let legalChatCalled = false;
  await assert.rejects(() => runAnthropicProductionProbe({
    modelAccess: async () => undefined,
    connectivity: async () => { throw new Error("private connectivity detail"); },
    legalChat: async () => {
      legalChatCalled = true;
      throw new Error("must not run");
    },
  }), (error: unknown) => error instanceof Error
    && (error as Error & { providerProbeStage?: unknown }).providerProbeStage === "anthropic_connectivity");
  assert.equal(legalChatCalled, false);
});

test("Anthropic production probe tags a legal-chat contract failure after connectivity succeeds", async () => {
  await assert.rejects(() => runAnthropicProductionProbe({
    modelAccess: async () => undefined,
    connectivity: async () => undefined,
    legalChat: async () => { throw new Error("private legal-chat detail"); },
  }), (error: unknown) => error instanceof Error
    && (error as Error & { providerProbeStage?: unknown }).providerProbeStage === "anthropic_legal_chat_contract");
});

test("Anthropic probe diagnostics classify only documented content-free 400 causes", () => {
  const failure = (message: string) => Object.assign(new Error(message), {
    providerStatus: 400,
    providerErrorType: "invalid_request_error",
  });
  assert.equal(safeProviderFailureReason("anthropic", failure(
    "You have reached your specified workspace API usage limits. Access resumes later.",
  )), "anthropic_workspace_spend_limit");
  assert.equal(safeProviderFailureReason("anthropic", failure(
    "You have reached your specified API usage limits. Access resumes later.",
  )), "anthropic_organization_spend_limit");
  assert.equal(safeProviderFailureReason("anthropic", failure(
    "anthropic-workspace-id is required when authenticating with an identity-linked API key; send the id.",
  )), "anthropic_workspace_header_required");
  assert.equal(safeProviderFailureReason("anthropic", failure(
    "anthropic-workspace-id header must be a valid workspace ID.",
  )), "anthropic_workspace_header_invalid");
  assert.equal(safeProviderFailureReason("anthropic", failure(
    "messages.0.content contains private request text that must never be logged",
  )), null);
  assert.equal(safeProviderFailureReason("openai", failure(
    "You have reached your specified API usage limits.",
  )), null);
});

test("fresh operational evidence skips every production dependency probe", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = probeEnv(d1);
    await seedOperational(env);
    const unexpected = async () => {
      throw new Error("A fresh probe must not call a provider.");
    };
    assert.deepEqual(await runProductionDependencyProbes(env, {
      openai: unexpected,
      anthropic: unexpected,
      documentAnalysis: unexpected,
      fetchImpl: unexpected as unknown as typeof fetch,
    }), {
      privateR2: "skipped",
      documentBuilder: "skipped",
      malwareScanner: "skipped",
      openai: "skipped",
      anthropic: "skipped",
      documentAnalysis: "skipped",
      resend: "skipped",
      lawyerArea: "skipped",
    });
  } finally {
    sqlite.close();
  }
});

test("provider probes publish operational evidence only for exact non-fallback results", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = probeEnv(d1);
    await seedOperational(env, ["openai", "anthropic"]);
    const summary = await runProductionDependencyProbes(env, {
      openai: async () => ({
        provider: "openai",
        fallbackFromProvider: null,
        responseKind: "clarification_required",
      }),
      anthropic: async () => ({
        provider: "anthropic",
        fallbackFromProvider: null,
        responseKind: "clarification_required",
      }),
    });
    assert.equal(summary?.openai, "succeeded");
    assert.equal(summary?.anthropic, "succeeded");
    const rows = sqlite.prepare(`SELECT dependency_key AS dependencyKey,state,evidence_kind AS evidenceKind
      FROM dependency_health_checks
      WHERE dependency_key IN ('openai','anthropic')
      ORDER BY dependency_key`).all() as Array<{
        dependencyKey: string;
        state: string;
        evidenceKind: string;
      }>;
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { dependencyKey: "anthropic", state: "operational", evidenceKind: "synthetic_probe" },
      { dependencyKey: "openai", state: "operational", evidenceKind: "synthetic_probe" },
    ]);
  } finally {
    sqlite.close();
  }
});

test("provider probe failures log only bounded diagnostic fields", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const originalConsoleError = console.error;
  const errors: string[] = [];
  console.error = (...values: unknown[]) => { errors.push(values.join(" ")); };
  try {
    const env = probeEnv(d1);
    await seedOperational(env, ["openai"]);
    const failure = Object.assign(new Error("raw provider message must stay private"), {
      code: "PROVIDER_TIMEOUT",
      providerStatus: 429,
      providerErrorType: "first_byte_timeout",
      providerRequestId: "untrusted request id with spaces",
    });
    const summary = await runProductionDependencyProbes(env, {
      openai: async () => { throw failure; },
    });
    assert.equal(summary?.openai, "failed");
    assert.equal(errors.length, 1);
    const log = JSON.parse(errors[0]) as Record<string, unknown>;
    assert.deepEqual({ ...log, elapsedMs: 0 }, {
      event: "production_dependency_probe.provider_failed",
      provider: "openai",
      safeCode: "PROVIDER_TIMEOUT",
      errorName: "Error",
      providerStatus: 429,
      providerErrorType: "first_byte_timeout",
      providerRequestId: null,
      providerProbeStage: null,
      providerFailureReason: null,
      elapsedMs: 0,
    });
    assert.equal(errors[0].includes("raw provider message"), false);
    assert.deepEqual({ ...(sqlite.prepare(`SELECT state,safe_error_code AS safeErrorCode
      FROM dependency_health_checks WHERE dependency_key='openai'
      ORDER BY checked_at DESC,id DESC LIMIT 1`).get() as object) }, {
      state: "degraded",
      safeErrorCode: "PROVIDER_TIMEOUT",
    });
  } finally {
    console.error = originalConsoleError;
    sqlite.close();
  }
});

test("Anthropic probe logs a fixed spend-limit reason without the upstream message", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const originalConsoleError = console.error;
  const errors: string[] = [];
  console.error = (...values: unknown[]) => { errors.push(values.join(" ")); };
  try {
    const env = probeEnv(d1);
    await seedOperational(env, ["anthropic"]);
    const failure = Object.assign(new Error(
      "You have reached your specified workspace API usage limits. private-upstream-marker",
    ), {
      code: "PROVIDER_UNAVAILABLE",
      providerStatus: 400,
      providerErrorType: "invalid_request_error",
      providerRequestId: "req_anthropicprobe1234",
      providerProbeStage: "anthropic_connectivity",
    });
    const summary = await runProductionDependencyProbes(env, {
      anthropic: async () => { throw failure; },
    });
    assert.equal(summary?.anthropic, "failed");
    assert.equal(errors.length, 1);
    const log = JSON.parse(errors[0]) as Record<string, unknown>;
    assert.deepEqual({ ...log, elapsedMs: 0 }, {
      event: "production_dependency_probe.provider_failed",
      provider: "anthropic",
      safeCode: "PROVIDER_UNAVAILABLE",
      errorName: "Error",
      providerStatus: 400,
      providerErrorType: "invalid_request_error",
      providerRequestId: "req_anthropicprobe1234",
      providerProbeStage: "anthropic_connectivity",
      providerFailureReason: "anthropic_workspace_spend_limit",
      elapsedMs: 0,
    });
    assert.equal(errors[0].includes("private-upstream-marker"), false);
  } finally {
    console.error = originalConsoleError;
    sqlite.close();
  }
});

test("the Builder probe uses the binding-local asset origin and removes its R2 archive", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const { bucket, objects } = builderBucket();
  const assetRequests: string[] = [];
  try {
    const env = {
      ...probeEnv(d1),
      ASSETS: builderAssets(assetRequests),
      BUCKET: bucket,
    };
    await seedOperational(env, ["document_builder"]);
    const summary = await runProductionDependencyProbes(env);
    assert.equal(summary?.documentBuilder, "succeeded");
    assert.equal(objects.size, 0);
    assert.equal(assetRequests.length, 4);
    assert.ok(assetRequests.every((request) => new URL(request).origin === "https://juro-assets.invalid"));
    assert.deepEqual({ ...(sqlite.prepare(`SELECT state,safe_error_code AS safeErrorCode
      FROM dependency_health_checks WHERE dependency_key='document_builder'
      ORDER BY checked_at DESC,id DESC LIMIT 1`).get() as object) }, {
      state: "operational",
      safeErrorCode: null,
    });
  } finally {
    sqlite.close();
  }
});

test("the Builder probe records a content-free DOCX-stage failure for an invalid template", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const { bucket } = builderBucket();
  try {
    const env = {
      ...probeEnv(d1),
      ASSETS: {
        async fetch() {
          return new Response(Uint8Array.of(0));
        },
      } as unknown as Fetcher,
      BUCKET: bucket,
    };
    await seedOperational(env, ["document_builder"]);
    const originalConsoleError = console.error;
    const errors: string[] = [];
    console.error = (...values: unknown[]) => { errors.push(values.join(" ")); };
    let summary;
    try {
      summary = await runProductionDependencyProbes(env);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(summary?.documentBuilder, "failed");
    assert.deepEqual(JSON.parse(errors[0]), {
      event: "production_dependency_probe.builder_failed",
      stage: "docx",
      errorName: "Error",
      reason: "End of data reached (data length = 1, asked index = 4). Corrupted zip ?",
    });
    assert.deepEqual({ ...(sqlite.prepare(`SELECT state,safe_error_code AS safeErrorCode
      FROM dependency_health_checks WHERE dependency_key='document_builder'
      ORDER BY checked_at DESC,id DESC LIMIT 1`).get() as object) }, {
      state: "degraded",
      safeErrorCode: "BUILDER_DOCX_FAILED",
    });
  } finally {
    sqlite.close();
  }
});

test("the lawyer-area probe exercises and atomically removes its synthetic access grant", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = probeEnv(d1);
    await seedOperational(env, ["lawyer_area"]);
    const summary = await runProductionDependencyProbes(env);
    assert.equal(summary?.lawyerArea, "succeeded");
    assert.equal((sqlite.prepare(`SELECT COUNT(*) AS count FROM lawyer_access_grants
      WHERE id LIKE 'production-health-lawyer-v1-%'`).get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare(`SELECT COUNT(*) AS count FROM user_profiles
      WHERE id LIKE 'production-health-lawyer-v1-%'`).get() as { count: number }).count, 0);
    assert.deepEqual({ ...(sqlite.prepare(`SELECT state,evidence_kind AS evidenceKind
      FROM dependency_health_checks WHERE dependency_key='lawyer_area'
      ORDER BY checked_at DESC,id DESC LIMIT 1`).get() as object) }, {
      state: "operational",
      evidenceKind: "synthetic_probe",
    });
  } finally {
    sqlite.close();
  }
});
