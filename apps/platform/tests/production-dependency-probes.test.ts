import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { DependencyHealthKey } from "../lib/operations/dependency-health";
import { recordDependencyHealthEvidence } from "../worker/dependency-health-evidence";
import type { PlatformJobEnv } from "../worker/platform-jobs";
import {
  productionDependencyProbesEnabled,
  runProductionDependencyProbes,
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
