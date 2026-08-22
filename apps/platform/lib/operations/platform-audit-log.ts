import { z } from "zod";
import type { PlatformStaffAccess } from "../auth/staff-access";

const GENESIS_HASH = "0".repeat(64);
const MAX_CHAIN_RETRIES = 3;
const EVENT_DOMAIN = "juro-platform-audit-access-v1";

export const platformAuditSources = [
  "security",
  "staff_role",
  "workspace",
  "operations",
] as const;

export const platformAuditSeverities = ["info", "warning", "critical"] as const;

const opaqueIdentifier = z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/);

export const platformAuditFiltersSchema = z.object({
  source: z.enum(platformAuditSources).optional(),
  severity: z.enum(platformAuditSeverities).optional(),
  action: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  actorUserId: opaqueIdentifier.optional(),
  scopeId: opaqueIdentifier.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "INVALID_DATE_RANGE" });
  }
});

export const platformAuditRequestSchema = z.object({
  action: z.enum(["query", "export"]),
  filters: platformAuditFiltersSchema.default({ limit: 200 }),
}).strict();

export type PlatformAuditSource = (typeof platformAuditSources)[number];
export type PlatformAuditSeverity = (typeof platformAuditSeverities)[number];
export type PlatformAuditFilters = z.output<typeof platformAuditFiltersSchema>;

export type PlatformAuditRow = {
  id: string;
  source: PlatformAuditSource;
  actorUserId: string | null;
  scopeId: string;
  entityType: string;
  entityId: string | null;
  action: string;
  severity: PlatformAuditSeverity;
  createdAt: string;
};

export type PlatformAuditAccessEvent = {
  id: string;
  actorUserId: string;
  actorSessionId: string;
  actorAssignmentId: string;
  capability: "staff.security.audit";
  requestAction: "query" | "export";
  filtersHash: string;
  resultCount: number;
  resultDigest: string;
  actorMfaVerifiedAt: string;
  previousHash: string;
  eventHash: string;
  createdAt: string;
};

export class PlatformAuditError extends Error {
  constructor(readonly code:
    | "PLATFORM_AUDIT_INVALID"
    | "PLATFORM_AUDIT_ACCESS_INTEGRITY_FAILED"
    | "PLATFORM_AUDIT_ACCESS_WRITE_FAILED") {
    super(code);
    this.name = "PlatformAuditError";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function canonicalAccessEvent(event: Omit<PlatformAuditAccessEvent, "eventHash">): string {
  return JSON.stringify([EVENT_DOMAIN, event]);
}

async function storedAccessEvents(
  db: D1Database,
  actorUserId?: string,
): Promise<PlatformAuditAccessEvent[]> {
  const where = actorUserId ? "WHERE actor_user_id=?" : "";
  const result = await db.prepare(
    `SELECT id,actor_user_id AS actorUserId,actor_session_id AS actorSessionId,
      actor_assignment_id AS actorAssignmentId,capability,
      request_action AS requestAction,filters_hash AS filtersHash,
      result_count AS resultCount,result_digest AS resultDigest,
      actor_mfa_verified_at AS actorMfaVerifiedAt,previous_hash AS previousHash,
      event_hash AS eventHash,created_at AS createdAt
     FROM platform_audit_access_events ${where}
     ORDER BY actor_user_id,created_at,id LIMIT 10001`,
  ).bind(...(actorUserId ? [actorUserId] : [])).all<PlatformAuditAccessEvent>();
  return result.results;
}

export async function verifyPlatformAuditAccessHistory(
  db: D1Database,
  actorUserId?: string,
): Promise<{ valid: boolean; checked: number }> {
  const events = await storedAccessEvents(db, actorUserId);
  if (events.length > 10_000) return { valid: false, checked: events.length };
  const eventsByActor = new Map<string, PlatformAuditAccessEvent[]>();
  for (const event of events) {
    eventsByActor.set(event.actorUserId, [...(eventsByActor.get(event.actorUserId) ?? []), event]);
  }
  for (const actorEvents of eventsByActor.values()) {
    const byPreviousHash = new Map(actorEvents.map((event) => [event.previousHash, event]));
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < actorEvents.length; index += 1) {
      const event = byPreviousHash.get(previousHash);
      if (!event || event.capability !== "staff.security.audit" || !event.actorMfaVerifiedAt || !event.createdAt) {
        return { valid: false, checked: events.length };
      }
      const canonical: Omit<PlatformAuditAccessEvent, "eventHash"> = {
        id: event.id,
        actorUserId: event.actorUserId,
        actorSessionId: event.actorSessionId,
        actorAssignmentId: event.actorAssignmentId,
        capability: event.capability,
        requestAction: event.requestAction,
        filtersHash: event.filtersHash,
        resultCount: event.resultCount,
        resultDigest: event.resultDigest,
        actorMfaVerifiedAt: event.actorMfaVerifiedAt,
        previousHash: event.previousHash,
        createdAt: event.createdAt,
      };
      if (await sha256Hex(canonicalAccessEvent(canonical)) !== event.eventHash) {
        return { valid: false, checked: events.length };
      }
      previousHash = event.eventHash;
    }
    if (byPreviousHash.size !== actorEvents.length) return { valid: false, checked: events.length };
  }
  return { valid: true, checked: events.length };
}

type AuditSourceQuery = {
  source: PlatformAuditSource;
  selectSql: string;
  actionSql: string;
  actorSql: string;
  scopeSql: string;
  severitySql: string;
};

const auditSourceQueries: AuditSourceQuery[] = [
  {
    source: "security",
    selectSql: `SELECT id,'security' AS source,NULL AS actorUserId,user_id AS scopeId,
      'user_security' AS entityType,user_id AS entityId,event_type AS action,
      CASE WHEN severity IN ('info','warning','critical') THEN severity ELSE 'warning' END AS severity,
      created_at AS createdAt FROM security_events`,
    actionSql: "event_type",
    actorSql: "NULL",
    scopeSql: "user_id",
    severitySql: "CASE WHEN severity IN ('info','warning','critical') THEN severity ELSE 'warning' END",
  },
  {
    source: "staff_role",
    selectSql: `SELECT id,'staff_role' AS source,actor_user_id AS actorUserId,subject_user_id AS scopeId,
      'staff_assignment' AS entityType,subject_assignment_id AS entityId,event_type AS action,
      'warning' AS severity,created_at AS createdAt FROM platform_staff_role_events`,
    actionSql: "event_type",
    actorSql: "actor_user_id",
    scopeSql: "subject_user_id",
    severitySql: "'warning'",
  },
  {
    source: "workspace",
    selectSql: `SELECT id,'workspace' AS source,actor_user_id AS actorUserId,workspace_id AS scopeId,
      entity_type AS entityType,entity_id AS entityId,action,'info' AS severity,
      created_at AS createdAt FROM workspace_audit_events`,
    actionSql: "action",
    actorSql: "actor_user_id",
    scopeSql: "workspace_id",
    severitySql: "'info'",
  },
  {
    source: "operations",
    selectSql: `SELECT id,'operations' AS source,actor_user_id AS actorUserId,environment AS scopeId,
      'provider_circuit' AS entityType,provider AS entityId,'provider_circuit.'||transition AS action,
      CASE WHEN transition='opened' THEN 'critical' ELSE 'info' END AS severity,
      created_at AS createdAt FROM ai_cost_control_events`,
    actionSql: "'provider_circuit.'||transition",
    actorSql: "actor_user_id",
    scopeSql: "environment",
    severitySql: "CASE WHEN transition='opened' THEN 'critical' ELSE 'info' END",
  },
  {
    source: "operations",
    selectSql: `SELECT id,'operations' AS source,created_by_user_id AS actorUserId,incident_id AS scopeId,
      'system_status' AS entityType,incident_id AS entityId,'system_status.'||state AS action,
      CASE WHEN state='resolved' THEN 'info' ELSE 'warning' END AS severity,
      created_at AS createdAt FROM system_status_updates`,
    actionSql: "'system_status.'||state",
    actorSql: "created_by_user_id",
    scopeSql: "incident_id",
    severitySql: "CASE WHEN state='resolved' THEN 'info' ELSE 'warning' END",
  },
  {
    source: "operations",
    selectSql: `SELECT id,'operations' AS source,actor_user_id AS actorUserId,environment AS scopeId,
      'feature_flag' AS entityType,feature_key AS entityId,
      CASE WHEN enabled=1 THEN 'feature.enabled' ELSE 'feature.disabled' END AS action,
      CASE WHEN enabled=1 THEN 'info' ELSE 'warning' END AS severity,
      created_at AS createdAt FROM operational_feature_flag_versions`,
    actionSql: "CASE WHEN enabled=1 THEN 'feature.enabled' ELSE 'feature.disabled' END",
    actorSql: "actor_user_id",
    scopeSql: "environment",
    severitySql: "CASE WHEN enabled=1 THEN 'info' ELSE 'warning' END",
  },
  {
    source: "operations",
    selectSql: `SELECT id,'operations' AS source,actor_user_id AS actorUserId,environment AS scopeId,
      'job_redrive' AS entityType,source_job_id AS entityId,'job.redrive' AS action,
      'warning' AS severity,created_at AS createdAt FROM operational_job_redrive_events`,
    actionSql: "'job.redrive'",
    actorSql: "actor_user_id",
    scopeSql: "environment",
    severitySql: "'warning'",
  },
];

function auditSourceStatement(
  db: D1Database,
  query: AuditSourceQuery,
  filters: PlatformAuditFilters,
): D1PreparedStatement {
  const where: string[] = [];
  const bindings: Array<string | number> = [];
  if (filters.severity) { where.push(`${query.severitySql}=?`); bindings.push(filters.severity); }
  if (filters.action) { where.push(`${query.actionSql} LIKE ?`); bindings.push(`%${filters.action}%`); }
  if (filters.actorUserId) { where.push(`${query.actorSql}=?`); bindings.push(filters.actorUserId); }
  if (filters.scopeId) { where.push(`${query.scopeSql}=?`); bindings.push(filters.scopeId); }
  if (filters.from) { where.push("created_at>=?"); bindings.push(filters.from); }
  if (filters.to) { where.push("created_at<=?"); bindings.push(filters.to); }
  bindings.push(filters.limit);
  return db.prepare(`${query.selectSql}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY createdAt DESC,id DESC LIMIT ?`).bind(...bindings);
}

async function safeAuditRows(db: D1Database, filters: PlatformAuditFilters): Promise<PlatformAuditRow[]> {
  // Production D1 rejects the previous seven-term compound SELECT. Querying
  // each allowlisted source independently also bounds every table read before
  // the global merge while preserving the exact top-N result.
  const sources = filters.source
    ? auditSourceQueries.filter((query) => query.source === filters.source)
    : auditSourceQueries;
  const results = await db.batch(
    sources.map((query) => auditSourceStatement(db, query, filters)),
  );
  return results
    .flatMap((result) => result.results as PlatformAuditRow[])
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)
      || right.id.localeCompare(left.id))
    .slice(0, filters.limit);
}

async function appendAccessEvent(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  requestAction: "query" | "export";
  filters: PlatformAuditFilters;
  rows: PlatformAuditRow[];
  now: Date;
}): Promise<PlatformAuditAccessEvent> {
  const actorAssignmentId = input.staff.assignmentIds[0];
  if (
    input.staff.capability !== "staff.security.audit"
    || !actorAssignmentId
    || !input.staff.mfaVerifiedAt
  ) throw new PlatformAuditError("PLATFORM_AUDIT_ACCESS_WRITE_FAILED");
  const filtersHash = await sha256Hex(JSON.stringify(input.filters));
  const resultDigest = await sha256Hex(JSON.stringify(input.rows));
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CHAIN_RETRIES; attempt += 1) {
    const actorEvents = await storedAccessEvents(input.db, input.staff.userId);
    const referencedHashes = new Set(actorEvents.map((event) => event.previousHash));
    const heads = actorEvents.filter((event) => !referencedHashes.has(event.eventHash));
    if (actorEvents.length > 0 && heads.length !== 1) {
      throw new PlatformAuditError("PLATFORM_AUDIT_ACCESS_INTEGRITY_FAILED");
    }
    const previous = heads[0];
    const eventWithoutHash: Omit<PlatformAuditAccessEvent, "eventHash"> = {
      id: crypto.randomUUID(),
      actorUserId: input.staff.userId,
      actorSessionId: input.staff.sessionId,
      actorAssignmentId,
      capability: "staff.security.audit",
      requestAction: input.requestAction,
      filtersHash,
      resultCount: input.rows.length,
      resultDigest,
      actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
      previousHash: previous?.eventHash ?? GENESIS_HASH,
      createdAt: input.now.toISOString(),
    };
    const event: PlatformAuditAccessEvent = {
      ...eventWithoutHash,
      eventHash: await sha256Hex(canonicalAccessEvent(eventWithoutHash)),
    };
    try {
      await input.db.prepare(
        `INSERT INTO platform_audit_access_events
         (id,actor_user_id,actor_session_id,actor_assignment_id,capability,
          request_action,filters_hash,result_count,result_digest,
          actor_mfa_verified_at,previous_hash,event_hash,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        event.id,event.actorUserId,event.actorSessionId,event.actorAssignmentId,
        event.capability,event.requestAction,event.filtersHash,event.resultCount,
        event.resultDigest,event.actorMfaVerifiedAt,event.previousHash,
        event.eventHash,event.createdAt,
      ).run();
      return event;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("CHAIN_CONFLICT") && !message.includes("chain_uidx")) break;
    }
  }
  if (lastError instanceof PlatformAuditError) throw lastError;
  throw new PlatformAuditError("PLATFORM_AUDIT_ACCESS_WRITE_FAILED");
}

export async function queryPlatformAuditLog(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  value: z.input<typeof platformAuditRequestSchema>;
  now?: Date;
}): Promise<{
  rows: PlatformAuditRow[];
  filters: PlatformAuditFilters;
  accessEventId: string;
  accessIntegrity: { valid: true; checked: number };
}> {
  const parsed = platformAuditRequestSchema.safeParse(input.value);
  if (!parsed.success) throw new PlatformAuditError("PLATFORM_AUDIT_INVALID");
  const integrity = await verifyPlatformAuditAccessHistory(input.db, input.staff.userId);
  if (!integrity.valid) throw new PlatformAuditError("PLATFORM_AUDIT_ACCESS_INTEGRITY_FAILED");
  const rows = await safeAuditRows(input.db, parsed.data.filters);
  const event = await appendAccessEvent({
    db: input.db,
    staff: input.staff,
    requestAction: parsed.data.action,
    filters: parsed.data.filters,
    rows,
    now: input.now ?? new Date(),
  });
  return {
    rows,
    filters: parsed.data.filters,
    accessEventId: event.id,
    accessIntegrity: { valid: true, checked: integrity.checked + 1 },
  };
}

function csvCell(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function platformAuditRowsCsv(rows: PlatformAuditRow[]): string {
  const header = ["id","source","actorUserId","scopeId","entityType","entityId","action","severity","createdAt"];
  const lines = rows.map((row) => [
    row.id,row.source,row.actorUserId ?? "",row.scopeId,row.entityType,
    row.entityId ?? "",row.action,row.severity,row.createdAt,
  ].map(csvCell).join(","));
  return `\uFEFF${header.map(csvCell).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}
