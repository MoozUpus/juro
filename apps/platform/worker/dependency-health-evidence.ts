import {
  dependencyHealthEnvironment,
  recordDependencyHealth,
  type DependencyHealthEvidenceKind,
  type DependencyHealthKey,
  type DependencyHealthSafeErrorCode,
  type DependencyHealthState,
} from "../lib/operations/dependency-health";

/**
 * Minimal worker-facing boundary for dependency-health evidence. It only
 * accepts pre-classified technical states/codes and deliberately swallows its
 * own persistence failure: health observability must never make a completed
 * queue job, scan, or scheduled task fail or retry.
 */
export type DependencyHealthEvidenceEnv = {
  APP_ENV: string;
  DB: D1Database;
};

type OperationalEvidence = {
  key: DependencyHealthKey;
  state: "operational";
  evidenceKind: DependencyHealthEvidenceKind;
  startedAt: number;
  minimumOperationalIntervalMs?: number;
};

type FailedEvidence = {
  key: DependencyHealthKey;
  state: Exclude<DependencyHealthState, "operational" | "unknown" | "stale">;
  safeErrorCode: DependencyHealthSafeErrorCode;
  evidenceKind: DependencyHealthEvidenceKind;
  startedAt: number;
};

export type DependencyHealthEvidence = OperationalEvidence | FailedEvidence;

const maxLatencyMs = 60_000;

export function dependencyHealthLatencyMs(
  startedAt: number,
  now = Date.now(),
): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.min(maxLatencyMs, Math.max(0, Math.round(now - startedAt)));
}

async function recentlyRecordedOperationalEvidence(
  env: DependencyHealthEvidenceEnv,
  key: DependencyHealthKey,
  environment: ReturnType<typeof dependencyHealthEnvironment>,
  minimumIntervalMs: number,
  now: Date,
): Promise<boolean> {
  if (minimumIntervalMs <= 0) return false;
  const row = await env.DB.prepare(
    `SELECT checked_at AS checkedAt
     FROM dependency_health_checks
     WHERE environment=? AND dependency_key=? AND state='operational'
     ORDER BY checked_at DESC,id DESC
     LIMIT 1`,
  ).bind(environment, key).first<{ checkedAt: string }>();
  if (!row?.checkedAt) return false;
  const lastCheckedAt = Date.parse(row.checkedAt);
  return Number.isFinite(lastCheckedAt) && now.getTime() - lastCheckedAt < minimumIntervalMs;
}

/**
 * Persists one content-free observation. Operational events can be throttled
 * to prevent an append-only ledger from growing with every routine queue
 * message; failures are never throttled. Returns whether a row was written.
 */
export async function recordDependencyHealthEvidence(
  env: DependencyHealthEvidenceEnv,
  evidence: DependencyHealthEvidence,
  now = new Date(),
): Promise<boolean> {
  const environment = dependencyHealthEnvironment(env.APP_ENV);
  try {
    if (
      evidence.state === "operational"
      && await recentlyRecordedOperationalEvidence(
        env,
        evidence.key,
        environment,
        evidence.minimumOperationalIntervalMs ?? 0,
        now,
      )
    ) {
      return false;
    }
    await recordDependencyHealth({
      db: env.DB,
      now,
      value: {
        environment,
        key: evidence.key,
        state: evidence.state,
        latencyMs: dependencyHealthLatencyMs(evidence.startedAt, now.getTime()),
        ...(evidence.state === "operational" ? {} : { safeErrorCode: evidence.safeErrorCode }),
        evidenceKind: evidence.evidenceKind,
      },
    });
    return true;
  } catch {
    // Keep the log content-free: a health write may fail during a database
    // incident, when exposing a low-level error would add no user value.
    console.error(JSON.stringify({
      event: "dependency_health.evidence_persistence_failed",
      environment,
      dependencyKey: evidence.key,
      evidenceKind: evidence.evidenceKind,
    }));
    return false;
  }
}

export function providerFailureEvidence(
  provider: "openai" | "anthropic",
  code: string,
): Pick<FailedEvidence, "key" | "state" | "safeErrorCode"> {
  const normalized = code.toUpperCase();
  const key = provider;
  if (normalized.includes("CONFIG") || normalized.includes("NOT_CONFIGURED")) {
    return { key, state: "outage", safeErrorCode: "PROBE_CONFIGURATION_ERROR" };
  }
  if (
    normalized.includes("AUTH")
    || normalized.includes("HTTP_401")
    || normalized.includes("HTTP_403")
  ) {
    return { key, state: "outage", safeErrorCode: "PROBE_AUTH_ERROR" };
  }
  if (normalized.includes("TIMEOUT")) {
    return { key, state: "degraded", safeErrorCode: "PROVIDER_TIMEOUT" };
  }
  return { key, state: "degraded", safeErrorCode: "PROVIDER_UNAVAILABLE" };
}
