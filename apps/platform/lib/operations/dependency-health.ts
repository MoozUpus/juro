import { z } from "zod";
import type { StatusComponentKey } from "./system-status";

/**
 * Dependency evidence is deliberately content-free. A record proves that a
 * bounded technical check happened; it never contains a user request,
 * provider response, document, URL payload, credential, or stack trace.
 */
export const dependencyHealthKeys = [
  "d1",
  "private_r2",
  "queues",
  "queue_dlq",
  "malware_scanner",
  "openai",
  "anthropic",
  "resend",
  "legal_source_sync",
  "document_analysis",
  "document_builder",
  "lawyer_area",
] as const;

export const dependencyHealthEnvironments = ["development", "staging", "production"] as const;

export const dependencyHealthRecordedStates = [
  "operational",
  "degraded",
  "partial_outage",
  "outage",
  "maintenance",
  "unknown",
  "stale",
] as const;

export const dependencyHealthEvidenceKinds = [
  "probe",
  "synthetic_probe",
  "scheduled_job",
  "manual_verification",
  "integration_event",
] as const;

// These are intentionally technical, short and non-user-specific. Callers
// cannot persist arbitrary provider messages, paths, e-mail addresses or IDs.
export const dependencyHealthSafeErrorCodes = [
  "PROBE_TIMEOUT",
  "PROBE_NETWORK_ERROR",
  "PROBE_HTTP_ERROR",
  "PROBE_AUTH_ERROR",
  "PROBE_CONFIGURATION_ERROR",
  "DEPENDENCY_UNAVAILABLE",
  "QUEUE_BACKLOG",
  "QUEUE_PROBE_NOT_CONSUMED",
  "QUEUE_PROBE_INVALID_MESSAGE",
  "DLQ_BACKLOG",
  "DLQ_INVALID_MESSAGE",
  "DLQ_UNMATCHED_MESSAGE",
  "SCANNER_UNAVAILABLE",
  "SCANNER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_CREDIT_BALANCE_LOW",
  "PROVIDER_SPEND_LIMIT_REACHED",
  "PROVIDER_BILLING_CONFIGURATION",
  "PROVIDER_WORKSPACE_CONFIGURATION",
  "PROVIDER_REQUEST_CONFIGURATION",
  "EMAIL_DELIVERY_FAILED",
  "LEGAL_SYNC_FAILED",
  "LEGAL_SYNC_STALE",
  "ANALYSIS_JOB_FAILED",
  "BUILDER_UNAVAILABLE",
  "BUILDER_ASSET_UNAVAILABLE",
  "BUILDER_GENERATION_FAILED",
  "BUILDER_DEFAULTS_FAILED",
  "BUILDER_RENDER_FAILED",
  "BUILDER_DOCX_FAILED",
  "BUILDER_PDF_FAILED",
  "BUILDER_ARCHIVE_FAILED",
  "BUILDER_OUTPUT_INVALID",
  "BUILDER_STORAGE_FAILED",
  "LAWYER_HANDOFF_UNAVAILABLE",
] as const;

export type DependencyHealthKey = (typeof dependencyHealthKeys)[number];
export type DependencyHealthEnvironment = (typeof dependencyHealthEnvironments)[number];
export type DependencyHealthState = (typeof dependencyHealthRecordedStates)[number];
export type DependencyHealthEvidenceKind = (typeof dependencyHealthEvidenceKinds)[number];
export type DependencyHealthSafeErrorCode = (typeof dependencyHealthSafeErrorCodes)[number];

const maxDependencyHealthLatencyMs = 60_000;
const futureClockSkewMs = 5 * 60_000;

/**
 * A status component only becomes operational when every dependency required
 * for that component has fresh operational evidence. This is intentionally
 * conservative: unknown evidence must never create a green status.
 */
export const dependencyKeysByComponent = {
  platform: ["d1", "queues", "queue_dlq"],
  otp: ["d1", "resend"],
  ai: ["d1", "openai", "anthropic", "legal_source_sync"],
  document_analysis: [
    "d1",
    "private_r2",
    "queues",
    "queue_dlq",
    "malware_scanner",
    // Provider availability is an OR condition implemented by the routed
    // feature probe below. Requiring one named provider here would mark the
    // feature degraded even when its bounded fallback completed successfully.
    "document_analysis",
  ],
  upload: ["d1", "private_r2", "malware_scanner"],
  document_builder: ["d1", "private_r2", "document_builder"],
  email: ["d1", "resend", "queues"],
  lawyer_area: ["d1", "lawyer_area"],
} as const satisfies Record<StatusComponentKey, readonly DependencyHealthKey[]>;

/**
 * Freshness is purpose-specific. The legal corpus is expected to update daily;
 * request-path dependencies need much fresher evidence. A failed probe keeps
 * its explicit failure state rather than being silently weakened to stale.
 */
export const dependencyHealthMaxAgeMs: Readonly<Record<DependencyHealthKey, number>> = {
  d1: 10 * 60_000,
  private_r2: 10 * 60_000,
  queues: 15 * 60_000,
  queue_dlq: 15 * 60_000,
  malware_scanner: 15 * 60_000,
  openai: 15 * 60_000,
  anthropic: 15 * 60_000,
  // A content-free production acceptance email runs at most once per UTC day;
  // ordinary email traffic records fresher integration evidence in between.
  resend: 26 * 60 * 60_000,
  legal_source_sync: 26 * 60 * 60_000,
  document_analysis: 30 * 60_000,
  document_builder: 30 * 60_000,
  lawyer_area: 30 * 60_000,
};

const safeErrorCodeSchema = z.enum(dependencyHealthSafeErrorCodes);

export const recordDependencyHealthSchema = z.object({
  environment: z.enum(dependencyHealthEnvironments),
  key: z.enum(dependencyHealthKeys),
  state: z.enum(dependencyHealthRecordedStates),
  checkedAt: z.string().datetime({ offset: true }).optional(),
  latencyMs: z.number().int().min(0).max(maxDependencyHealthLatencyMs).nullable().optional(),
  safeErrorCode: safeErrorCodeSchema.nullable().optional(),
  evidenceKind: z.enum(dependencyHealthEvidenceKinds),
}).strict().superRefine((value, context) => {
  if (value.state === "operational" && value.safeErrorCode) {
    context.addIssue({
      code: "custom",
      path: ["safeErrorCode"],
      message: "OPERATIONAL_EVIDENCE_CANNOT_HAVE_ERROR_CODE",
    });
  }
});

type DependencyHealthRow = {
  id: string;
  environment: DependencyHealthEnvironment;
  key: DependencyHealthKey;
  state: DependencyHealthState;
  checkedAt: string;
  latencyMs: number | null;
  safeErrorCode: string | null;
  evidenceKind: DependencyHealthEvidenceKind;
  createdAt: string;
  lastSuccessfulAt: string | null;
};

const dependencyHealthRowSchema: z.ZodType<DependencyHealthRow> = z.object({
  id: z.string().uuid(),
  environment: z.enum(dependencyHealthEnvironments),
  key: z.enum(dependencyHealthKeys),
  state: z.enum(dependencyHealthRecordedStates),
  checkedAt: z.string().datetime({ offset: true }),
  latencyMs: z.number().int().min(0).max(maxDependencyHealthLatencyMs).nullable(),
  safeErrorCode: safeErrorCodeSchema.nullable(),
  evidenceKind: z.enum(dependencyHealthEvidenceKinds),
  createdAt: z.string().datetime({ offset: true }),
  lastSuccessfulAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export type DependencyHealthSnapshot = {
  key: DependencyHealthKey;
  state: DependencyHealthState;
  recordedState: DependencyHealthState | null;
  checkedAt: string | null;
  lastSuccessfulAt: string | null;
  checkAgeMs: number | null;
  latencyMs: number | null;
  safeErrorCode: string | null;
  evidenceKind: DependencyHealthEvidenceKind | null;
};

export type DependencyComponentHealth = {
  key: StatusComponentKey;
  status: DependencyHealthState;
  dependencyKeys: readonly DependencyHealthKey[];
  lastCheckedAt: string | null;
  lastSuccessfulAt: string | null;
  checkAgeMs: number | null;
};

export class DependencyHealthError extends Error {
  constructor(readonly code: "DEPENDENCY_HEALTH_INVALID" | "DEPENDENCY_HEALTH_PERSISTENCE_FAILED") {
    super(code);
  }
}

function canonicalTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new DependencyHealthError("DEPENDENCY_HEALTH_INVALID");
  return new Date(timestamp).toISOString();
}

function oldestTimestamp(values: readonly (string | null)[]): string | null {
  const timestamps = values.filter((value): value is string => value !== null);
  if (timestamps.length !== values.length || timestamps.length === 0) return null;
  return timestamps.reduce((oldest, value) => value < oldest ? value : oldest);
}

function maxAge(values: readonly (number | null)[]): number | null {
  const ages = values.filter((value): value is number => value !== null);
  if (ages.length !== values.length || ages.length === 0) return null;
  return Math.max(...ages);
}

const stateRank: Readonly<Record<DependencyHealthState, number>> = {
  operational: 0,
  // Missing mandatory evidence is more important than an old observation:
  // `stale` says a check once succeeded, while `unknown` says no check exists
  // for a dependency the component requires. Explicit failures still win.
  stale: 1,
  unknown: 2,
  maintenance: 3,
  degraded: 4,
  partial_outage: 5,
  outage: 6,
};

function highestState(states: readonly DependencyHealthState[]): DependencyHealthState {
  return states.reduce<DependencyHealthState>(
    (current, state) => stateRank[state] > stateRank[current] ? state : current,
    "operational",
  );
}

function effectiveState(row: DependencyHealthRow, now: Date): { state: DependencyHealthState; ageMs: number } {
  const ageMs = Math.max(0, now.getTime() - Date.parse(row.checkedAt));
  // Only a formerly healthy observation can age into stale. `unknown` is not
  // a successful observation, so it must remain unknown until real evidence
  // replaces it.
  if (row.state === "operational" && ageMs > dependencyHealthMaxAgeMs[row.key]) {
    return { state: "stale", ageMs };
  }
  return { state: row.state, ageMs };
}

export function dependencyHealthEnvironment(value: string | undefined): DependencyHealthEnvironment {
  return value === "production" || value === "staging" ? value : "development";
}

export async function recordDependencyHealth(input: {
  db: D1Database;
  value: z.input<typeof recordDependencyHealthSchema>;
  now?: Date;
}): Promise<{ id: string; checkedAt: string }> {
  const value = recordDependencyHealthSchema.parse(input.value);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const checkedAt = canonicalTimestamp(value.checkedAt ?? nowIso);
  if (Date.parse(checkedAt) > now.getTime() + futureClockSkewMs) {
    throw new DependencyHealthError("DEPENDENCY_HEALTH_INVALID");
  }
  const id = crypto.randomUUID();
  try {
    await input.db.prepare(
      `INSERT INTO dependency_health_checks
       (id,environment,dependency_key,state,checked_at,latency_ms,safe_error_code,evidence_kind,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      value.environment,
      value.key,
      value.state,
      checkedAt,
      value.latencyMs ?? null,
      value.safeErrorCode ?? null,
      value.evidenceKind,
      nowIso,
    ).run();
  } catch {
    throw new DependencyHealthError("DEPENDENCY_HEALTH_PERSISTENCE_FAILED");
  }
  return { id, checkedAt };
}

export async function readDependencyHealth(input: {
  db: D1Database;
  environment: DependencyHealthEnvironment;
  now?: Date;
}): Promise<DependencyHealthSnapshot[]> {
  const now = input.now ?? new Date();
  const result = await input.db.prepare(
    `WITH ranked AS (
       SELECT id,environment,dependency_key AS key,state,checked_at AS checkedAt,
              latency_ms AS latencyMs,safe_error_code AS safeErrorCode,
              evidence_kind AS evidenceKind,created_at AS createdAt,
              MAX(CASE WHEN state='operational' THEN checked_at END) OVER (
                PARTITION BY dependency_key
              ) AS lastSuccessfulAt,
              ROW_NUMBER() OVER (
                PARTITION BY dependency_key ORDER BY checked_at DESC,id DESC
              ) AS row_number
       FROM dependency_health_checks
       WHERE environment=?
     )
     SELECT id,environment,key,state,checkedAt,latencyMs,safeErrorCode,evidenceKind,createdAt,lastSuccessfulAt
     FROM ranked WHERE row_number=1`,
  ).bind(input.environment).all<unknown>();

  const latest = new Map<DependencyHealthKey, DependencyHealthRow>();
  for (const candidate of result.results) {
    const parsed = dependencyHealthRowSchema.safeParse(candidate);
    if (parsed.success) latest.set(parsed.data.key, parsed.data);
  }

  return dependencyHealthKeys.map((key) => {
    const row = latest.get(key);
    if (!row) {
      return {
        key,
        state: "unknown",
        recordedState: null,
        checkedAt: null,
        lastSuccessfulAt: null,
        checkAgeMs: null,
        latencyMs: null,
        safeErrorCode: null,
        evidenceKind: null,
      };
    }
    const effective = effectiveState(row, now);
    return {
      key,
      state: effective.state,
      recordedState: row.state,
      checkedAt: row.checkedAt,
      lastSuccessfulAt: row.lastSuccessfulAt,
      checkAgeMs: effective.ageMs,
      latencyMs: row.latencyMs,
      safeErrorCode: row.safeErrorCode,
      evidenceKind: row.evidenceKind,
    };
  });
}

export function deriveComponentHealth(
  dependencyHealth: readonly DependencyHealthSnapshot[],
): DependencyComponentHealth[] {
  const healthByKey = new Map(dependencyHealth.map((entry) => [entry.key, entry]));
  return (Object.entries(dependencyKeysByComponent) as Array<
    [StatusComponentKey, readonly DependencyHealthKey[]]
  >).map(([key, dependencyKeys]) => {
    const entries = dependencyKeys.map((dependencyKey) => healthByKey.get(dependencyKey) ?? {
      key: dependencyKey,
      state: "unknown" as const,
      recordedState: null,
      checkedAt: null,
      lastSuccessfulAt: null,
      checkAgeMs: null,
      latencyMs: null,
      safeErrorCode: null,
      evidenceKind: null,
    });
    return {
      key,
      status: highestState(entries.map((entry) => entry.state)),
      dependencyKeys,
      lastCheckedAt: oldestTimestamp(entries.map((entry) => entry.checkedAt)),
      lastSuccessfulAt: oldestTimestamp(entries.map((entry) => entry.lastSuccessfulAt)),
      checkAgeMs: maxAge(entries.map((entry) => entry.checkAgeMs)),
    };
  });
}
