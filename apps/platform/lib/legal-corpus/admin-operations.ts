import { z } from "zod";
import type { PlatformStaffAccess } from "../auth/staff-access";
import { readDirectLegalSourceHealth, type DirectLegalSourceHealth } from "../legal/direct-source-health";
import { operationalEnvironment, type OperationalEnvironment } from "../operations/operational-feature-flags";
import {
  lexCatalogSearchUrl,
  LEX_CORPUS_CATEGORIES,
  LEX_CORPUS_LANGUAGES,
  type LexCorpusCategoryKey,
} from "./lex-discovery";
import {
  featureEnabled,
  LEGAL_CORPUS_FEATURE_FLAGS,
  type LegalCorpusFeatureFlag,
  type LegalCorpusLanguage,
} from "./trust";
import {
  OwnerMaterialPromotionError,
  promoteCompletedAnalysisToOwnerCorpus,
  withdrawOwnerMaterial,
} from "./owner-materials";

type AdminEnv = Pick<Env, "DB"> & Partial<Pick<Env, "BUCKET">> & { APP_ENV?: Env["APP_ENV"] }
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

export const legalCorpusAdminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("seed_discovery"),
    reason: z.string().trim().min(10).max(500),
  }).strict(),
  z.object({
    action: z.literal("retry_discovery"),
    checkpointId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/u),
    reason: z.string().trim().min(10).max(500),
  }).strict(),
  z.object({
    action: z.literal("retry_ingestion"),
    jobId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/u),
    reason: z.string().trim().min(10).max(500),
  }).strict(),
  z.object({
    action: z.literal("publish_owner_material"),
    analysisId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/u),
    workspaceId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/u),
    title: z.string().trim().min(2).max(300),
    language: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
    rightsConfirmed: z.literal(true),
    reason: z.string().trim().min(10).max(500),
  }).strict(),
  z.object({
    action: z.literal("withdraw_owner_material"),
    documentId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/u),
    reason: z.string().trim().min(10).max(500),
  }).strict(),
]);

export type LegalCorpusAdminAction = z.infer<typeof legalCorpusAdminActionSchema>;

export class LegalCorpusAdminError extends Error {
  constructor(readonly code:
    | "LEGAL_CORPUS_ADMIN_DISABLED"
    | "LEGAL_CORPUS_ADMIN_INVALID"
    | "LEGAL_CORPUS_ADMIN_NOT_FOUND"
    | "LEGAL_CORPUS_ADMIN_CONFLICT"
    | "LEGAL_CORPUS_ADMIN_INTEGRITY_FAILED") {
    super(code);
    this.name = "LegalCorpusAdminError";
  }
}

export type LegalCorpusTotals = {
  canonicalDocuments: number;
  languageVariants: number;
  uniqueProvisions: number;
  currentProvisions: number;
  currentChunks: number;
  indexedChunks: number;
  activeDocuments: number;
  repealedDocuments: number;
  historicalVersions: number;
  documentsFetchedToday: number;
  liveOrManualQueued: number;
  failedDocuments: number;
  lastSuccessfulUpdate: string | null;
};

export type LegalCorpusCoverageRow = {
  categoryKey: LexCorpusCategoryKey;
  language: LegalCorpusLanguage;
  status: string;
  expectedDocuments: number | null;
  discoveredDocuments: number;
  fetchedDocuments: number;
  extractedDocuments: number;
  indexedDocuments: number;
  technicallyUnavailable: number;
  pageNumber: number;
  lastErrorCode: string | null;
  updatedAt: string;
  complete: boolean;
};

export type LegalCorpusCheckpointView = {
  id: string;
  categoryKey: LexCorpusCategoryKey;
  language: LegalCorpusLanguage;
  status: string;
  pageNumber: number;
  expectedDocumentCount: number | null;
  discoveredDocumentCount: number;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
  canRetry: boolean;
};

export type LegalCorpusFailureView = {
  id: string;
  jobId: string | null;
  sourceUrl: string | null;
  language: string | null;
  attemptedAt: string;
  httpStatus: number | null;
  errorCode: string;
  safeMessage: string;
  retryable: boolean;
  retryCount: number;
  retryState: string;
  canRetry: boolean;
};

export type LegalCorpusAdminEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  actorUserId: string;
  createdAt: string;
};

export type LegalCorpusAdminDashboard = {
  environment: OperationalEnvironment;
  featureFlags: Record<LegalCorpusFeatureFlag, boolean>;
  lexHealth: DirectLegalSourceHealth;
  totals: LegalCorpusTotals;
  coverage: LegalCorpusCoverageRow[];
  checkpoints: LegalCorpusCheckpointView[];
  failures: LegalCorpusFailureView[];
  events: LegalCorpusAdminEvent[];
  integrity: { valid: boolean; checked: number };
};

type CountRow = Record<keyof LegalCorpusTotals, number | string | null>;
type CheckpointRow = Omit<LegalCorpusCheckpointView, "canRetry">;
type FailureRow = Omit<LegalCorpusFailureView, "retryable" | "canRetry"> & { retryable: number };
type StoredAdminEvent = LegalCorpusAdminEvent & {
  environment: OperationalEnvironment;
  detailsJson: string;
  actorSessionId: string;
  actorAssignmentId: string;
  actorMfaVerifiedAt: string;
  previousEventHash: string | null;
  eventHash: string;
};

function publicAdminEvent(event: StoredAdminEvent): LegalCorpusAdminEvent {
  return {
    id: event.id,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    reason: event.reason,
    actorUserId: event.actorUserId,
    createdAt: event.createdAt,
  };
}

function nonNegative(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function flags(env: AdminEnv): Record<LegalCorpusFeatureFlag, boolean> {
  return Object.fromEntries(
    LEGAL_CORPUS_FEATURE_FLAGS.map((flag) => [flag, featureEnabled(env, flag)]),
  ) as Record<LegalCorpusFeatureFlag, boolean>;
}

function canonicalEvent(value: Omit<StoredAdminEvent, "eventHash">): string {
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function storedAdminEvents(
  db: D1Database,
  environment: OperationalEnvironment,
  limit = 1_001,
): Promise<StoredAdminEvent[]> {
  const result = await db.prepare(`SELECT id,environment,action,target_type AS targetType,target_id AS targetId,
      reason,details_json AS detailsJson,actor_user_id AS actorUserId,
      actor_session_id AS actorSessionId,actor_assignment_id AS actorAssignmentId,
      actor_mfa_verified_at AS actorMfaVerifiedAt,previous_event_hash AS previousEventHash,
      event_hash AS eventHash,created_at AS createdAt
    FROM legal_corpus_admin_events WHERE environment=? ORDER BY created_at,id LIMIT ?`)
    .bind(environment, limit).all<StoredAdminEvent>();
  return result.results;
}

async function recentAdminEvents(
  db: D1Database,
  environment: OperationalEnvironment,
): Promise<StoredAdminEvent[]> {
  const result = await db.prepare(`SELECT * FROM (SELECT id,environment,action,target_type AS targetType,target_id AS targetId,
      reason,details_json AS detailsJson,actor_user_id AS actorUserId,
      actor_session_id AS actorSessionId,actor_assignment_id AS actorAssignmentId,
      actor_mfa_verified_at AS actorMfaVerifiedAt,previous_event_hash AS previousEventHash,
      event_hash AS eventHash,created_at AS createdAt
    FROM legal_corpus_admin_events WHERE environment=? ORDER BY created_at DESC,id DESC LIMIT 50)
    ORDER BY createdAt,id`).bind(environment).all<StoredAdminEvent>();
  return result.results;
}

async function recentOwnerPublicationEvents(
  db: D1Database,
  environment: OperationalEnvironment,
): Promise<LegalCorpusAdminEvent[]> {
  const result = await db.prepare(`SELECT * FROM (
      SELECT id,'owner_material_auto_trusted' AS action,'owner_material' AS targetType,
        document_id AS targetId,reason,actor_user_id AS actorUserId,created_at AS createdAt
      FROM legal_corpus_owner_ingestions WHERE environment=?
      UNION ALL
      SELECT id,'owner_material_withdrawn' AS action,'owner_material' AS targetType,
        document_id AS targetId,reason,actor_user_id AS actorUserId,created_at AS createdAt
      FROM legal_corpus_owner_ingestion_withdrawals WHERE environment=?
      UNION ALL
      SELECT id,'owner_material_published' AS action,'owner_material' AS targetType,
        document_id AS targetId,reason,actor_user_id AS actorUserId,created_at AS createdAt
      FROM legal_corpus_owner_publications WHERE environment=?
      UNION ALL
      SELECT id,'owner_material_withdrawn' AS action,'owner_material' AS targetType,
        document_id AS targetId,reason,actor_user_id AS actorUserId,created_at AS createdAt
      FROM legal_corpus_owner_withdrawals WHERE environment=?
    ) ORDER BY createdAt DESC,id DESC LIMIT 50`).bind(
      environment, environment, environment, environment,
    ).all<LegalCorpusAdminEvent>();
  return result.results;
}

export async function verifyLegalCorpusAdminHistory(
  db: D1Database,
  environment: OperationalEnvironment,
): Promise<{ valid: boolean; checked: number }> {
  const events = await storedAdminEvents(db, environment);
  if (events.length > 1_000) return { valid: false, checked: events.length };
  const byPrevious = new Map<string, StoredAdminEvent>();
  for (const event of events) {
    if (
      !event.actorUserId
      || !event.actorSessionId
      || !event.actorAssignmentId
      || !event.actorMfaVerifiedAt
    ) return { valid: false, checked: events.length };
    const { eventHash, ...unsigned } = event;
    if (await sha256Hex(canonicalEvent(unsigned)) !== eventHash) {
      return { valid: false, checked: events.length };
    }
    const key = event.previousEventHash ?? "ROOT";
    if (byPrevious.has(key)) return { valid: false, checked: events.length };
    byPrevious.set(key, event);
  }
  let cursor = "ROOT";
  let traversed = 0;
  while (byPrevious.has(cursor)) {
    const event = byPrevious.get(cursor)!;
    cursor = event.eventHash;
    traversed += 1;
  }
  return { valid: traversed === events.length, checked: events.length };
}

function totalsFrom(row: CountRow | null): LegalCorpusTotals {
  return {
    canonicalDocuments: nonNegative(row?.canonicalDocuments),
    languageVariants: nonNegative(row?.languageVariants),
    uniqueProvisions: nonNegative(row?.uniqueProvisions),
    currentProvisions: nonNegative(row?.currentProvisions),
    currentChunks: nonNegative(row?.currentChunks),
    indexedChunks: nonNegative(row?.indexedChunks),
    activeDocuments: nonNegative(row?.activeDocuments),
    repealedDocuments: nonNegative(row?.repealedDocuments),
    historicalVersions: nonNegative(row?.historicalVersions),
    documentsFetchedToday: nonNegative(row?.documentsFetchedToday),
    liveOrManualQueued: nonNegative(row?.liveOrManualQueued),
    failedDocuments: nonNegative(row?.failedDocuments),
    lastSuccessfulUpdate: typeof row?.lastSuccessfulUpdate === "string" ? row.lastSuccessfulUpdate : null,
  };
}

export async function readLegalCorpusAdminDashboard(input: {
  env: AdminEnv;
  now?: Date;
}): Promise<LegalCorpusAdminDashboard> {
  const environment = operationalEnvironment(input.env.APP_ENV);
  const now = input.now ?? new Date();
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  // Keep the aggregate reads sequential. D1 has a bounded SQLite heap and the
  // category coverage query is intentionally more expensive than a point
  // lookup; parallel fan-out previously made remote integrity probes return
  // SQLITE_NOMEM under load.
  const totals = await input.env.DB.prepare(`SELECT
      (SELECT count(*) FROM legal_corpus_documents) AS canonicalDocuments,
      (SELECT count(*) FROM legal_corpus_variants) AS languageVariants,
      (SELECT count(DISTINCT p.document_id||'|'||coalesce(p.article_number_normalized,'#'||p.sequence))
         FROM legal_corpus_provisions p JOIN legal_corpus_variants v ON v.current_version_id=p.version_id) AS uniqueProvisions,
      (SELECT count(*) FROM legal_corpus_provisions p JOIN legal_corpus_variants v ON v.current_version_id=p.version_id) AS currentProvisions,
      (SELECT count(*) FROM legal_corpus_chunks c JOIN legal_corpus_variants v ON v.current_version_id=c.version_id) AS currentChunks,
      (SELECT count(*) FROM legal_corpus_chunks c JOIN legal_corpus_variants v ON v.current_version_id=c.version_id WHERE c.indexed_at IS NOT NULL) AS indexedChunks,
      (SELECT count(DISTINCT v.document_id) FROM legal_corpus_variants v JOIN legal_corpus_versions x ON x.id=v.current_version_id WHERE x.status='active') AS activeDocuments,
      (SELECT count(DISTINCT v.document_id) FROM legal_corpus_variants v JOIN legal_corpus_versions x ON x.id=v.current_version_id WHERE x.status='repealed') AS repealedDocuments,
      (SELECT count(*) FROM legal_corpus_versions x LEFT JOIN legal_corpus_variants v ON v.current_version_id=x.id WHERE v.id IS NULL) AS historicalVersions,
      (SELECT count(DISTINCT variant_id) FROM legal_corpus_versions WHERE fetched_at>=?) AS documentsFetchedToday,
      (SELECT count(*) FROM legal_corpus_ingestion_jobs WHERE status IN ('queued','retrying') AND correlation_id NOT LIKE 'lex-catalog:%') AS liveOrManualQueued,
      (SELECT count(DISTINCT coalesce(canonical_document_id,source_url)) FROM legal_corpus_failures WHERE retry_state IN ('terminal','technically_unavailable')) AS failedDocuments,
      (SELECT max(finished_at) FROM legal_corpus_runs WHERE status='success') AS lastSuccessfulUpdate`).bind(dayStart).first<CountRow>();
  const coverage = await input.env.DB.prepare(`SELECT cp.category_key AS categoryKey,cp.language,cp.status,
      cp.expected_document_count AS expectedDocuments,cp.discovered_document_count AS discoveredDocuments,
      (SELECT count(DISTINCT sa.document_id) FROM legal_corpus_discovery_documents dd
        JOIN legal_corpus_source_aliases sa ON sa.source_url=dd.source_url
        JOIN legal_corpus_variants v ON v.document_id=sa.document_id AND v.language=dd.language
        WHERE dd.checkpoint_id=cp.id AND v.current_version_id IS NOT NULL) AS fetchedDocuments,
      (SELECT count(DISTINCT p.document_id) FROM legal_corpus_discovery_documents dd
        JOIN legal_corpus_source_aliases sa ON sa.source_url=dd.source_url
        JOIN legal_corpus_variants v ON v.document_id=sa.document_id AND v.language=dd.language
        JOIN legal_corpus_provisions p ON p.version_id=v.current_version_id
        WHERE dd.checkpoint_id=cp.id) AS extractedDocuments,
      (SELECT count(DISTINCT p.document_id) FROM legal_corpus_discovery_documents dd
        JOIN legal_corpus_source_aliases sa ON sa.source_url=dd.source_url
        JOIN legal_corpus_variants v ON v.document_id=sa.document_id AND v.language=dd.language
        JOIN legal_corpus_provisions p ON p.version_id=v.current_version_id
        JOIN legal_corpus_chunks c ON c.provision_id=p.id AND c.indexed_at IS NOT NULL
        WHERE dd.checkpoint_id=cp.id) AS indexedDocuments,
      (SELECT count(DISTINCT f.source_url) FROM legal_corpus_discovery_documents dd
        JOIN legal_corpus_failures f ON f.source_url=dd.source_url AND f.language=dd.language
        WHERE dd.checkpoint_id=cp.id AND f.retry_state='technically_unavailable') AS technicallyUnavailable,
      cp.page_number AS pageNumber,cp.last_error_code AS lastErrorCode,cp.updated_at AS updatedAt
    FROM legal_corpus_discovery_checkpoints cp ORDER BY cp.category_key,cp.language`)
    .all<Omit<LegalCorpusCoverageRow, "complete">>();
  const checkpoints = await input.env.DB.prepare(`SELECT id,category_key AS categoryKey,language,status,page_number AS pageNumber,
      expected_document_count AS expectedDocumentCount,discovered_document_count AS discoveredDocumentCount,
      attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,last_error_code AS lastErrorCode,updated_at AS updatedAt
      FROM legal_corpus_discovery_checkpoints ORDER BY updated_at DESC,id LIMIT 100`)
    .all<CheckpointRow>();
  const failures = await input.env.DB.prepare(`SELECT id,job_id AS jobId,source_url AS sourceUrl,language,attempted_at AS attemptedAt,
      http_status AS httpStatus,error_code AS errorCode,safe_message AS safeMessage,retryable,retry_count AS retryCount,retry_state AS retryState
      FROM legal_corpus_failures WHERE source_url IS NULL OR source_url LIKE 'https://lex.uz/%'
      ORDER BY attempted_at DESC,id LIMIT 100`).all<FailureRow>();
  const events = await recentAdminEvents(input.env.DB, environment);
  const ownerEvents = await recentOwnerPublicationEvents(input.env.DB, environment);
  const lexHealth = await readDirectLegalSourceHealth(input.env.DB, environment, now);
  const integrity = await verifyLegalCorpusAdminHistory(input.env.DB, environment);
  return {
    environment,
    featureFlags: flags(input.env),
    lexHealth,
    totals: totalsFrom(totals),
    coverage: coverage.results.map((row) => ({
      ...row,
      expectedDocuments: row.expectedDocuments === null ? null : nonNegative(row.expectedDocuments),
      discoveredDocuments: nonNegative(row.discoveredDocuments),
      fetchedDocuments: nonNegative(row.fetchedDocuments),
      extractedDocuments: nonNegative(row.extractedDocuments),
      indexedDocuments: nonNegative(row.indexedDocuments),
      technicallyUnavailable: nonNegative(row.technicallyUnavailable),
      pageNumber: nonNegative(row.pageNumber),
      complete: row.status === "completed"
        && row.expectedDocuments !== null
        && nonNegative(row.indexedDocuments) + nonNegative(row.technicallyUnavailable) >= nonNegative(row.expectedDocuments),
    })),
    checkpoints: checkpoints.results.map((row) => ({ ...row, canRetry: ["retrying", "failed", "dead_letter"].includes(row.status) })),
    failures: failures.results.map((row) => ({
      ...row,
      retryable: row.retryable === 1,
      canRetry: Boolean(row.jobId && row.retryable === 1 && ["pending", "retrying", "terminal"].includes(row.retryState)),
    })),
    events: [...events.map(publicAdminEvent), ...ownerEvents]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .slice(-50),
    integrity,
  };
}

function checkpointId(category: LexCorpusCategoryKey, language: LegalCorpusLanguage): string {
  return `lex-catalog:${category}:${language}`;
}

async function eventStatement(input: {
  db: D1Database;
  environment: OperationalEnvironment;
  action: StoredAdminEvent["action"];
  targetType: StoredAdminEvent["targetType"];
  targetId: string | null;
  reason: string;
  details: Record<string, unknown>;
  staff: Pick<PlatformStaffAccess, "userId" | "sessionId" | "assignmentIds" | "mfaVerifiedAt">;
  now: string;
}): Promise<D1PreparedStatement> {
  const assignmentId = input.staff.assignmentIds[0];
  if (!assignmentId || !input.staff.mfaVerifiedAt) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_INVALID");
  const heads = await input.db.prepare(`SELECT event_hash AS eventHash FROM legal_corpus_admin_events event
    WHERE environment=? AND NOT EXISTS (
      SELECT 1 FROM legal_corpus_admin_events successor
      WHERE successor.environment=event.environment AND successor.previous_event_hash=event.event_hash
    ) LIMIT 2`).bind(input.environment).all<{ eventHash: string }>();
  if (heads.results.length > 1) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_INTEGRITY_FAILED");
  const head = heads.results[0] ?? null;
  const unsigned: Omit<StoredAdminEvent, "eventHash"> = {
    id: crypto.randomUUID(),
    environment: input.environment,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    detailsJson: JSON.stringify(input.details),
    actorUserId: input.staff.userId,
    actorSessionId: input.staff.sessionId,
    actorAssignmentId: assignmentId,
    actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
    previousEventHash: head?.eventHash ?? null,
    createdAt: input.now,
  };
  const eventHash = await sha256Hex(canonicalEvent(unsigned));
  return input.db.prepare(`INSERT INTO legal_corpus_admin_events
    (id,environment,action,target_type,target_id,reason,details_json,actor_user_id,actor_session_id,
     actor_assignment_id,actor_mfa_verified_at,previous_event_hash,event_hash,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      unsigned.id, unsigned.environment, unsigned.action, unsigned.targetType, unsigned.targetId,
      unsigned.reason, unsigned.detailsJson, unsigned.actorUserId, unsigned.actorSessionId,
      unsigned.actorAssignmentId, unsigned.actorMfaVerifiedAt, unsigned.previousEventHash, eventHash,
      unsigned.createdAt,
    );
}

function requireEnabled(env: AdminEnv, action: LegalCorpusAdminAction["action"]): void {
  if (action === "withdraw_owner_material") return;
  const actionFlag = action === "publish_owner_material"
    ? "LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST"
    : "LEGAL_CORPUS_AUTO_INGEST_ENABLED";
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, actionFlag)) {
    throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_DISABLED");
  }
}

export async function performLegalCorpusAdminAction(input: {
  env: AdminEnv;
  staff: Pick<PlatformStaffAccess, "userId" | "sessionId" | "assignmentIds" | "mfaVerifiedAt">;
  value: LegalCorpusAdminAction;
  now?: Date;
}): Promise<{ action: LegalCorpusAdminAction["action"]; affected: number; targetId?: string }> {
  requireEnabled(input.env, input.value.action);
  const integrity = await verifyLegalCorpusAdminHistory(input.env.DB, operationalEnvironment(input.env.APP_ENV));
  if (!integrity.valid) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_INTEGRITY_FAILED");
  const environment = operationalEnvironment(input.env.APP_ENV);
  const now = (input.now ?? new Date()).toISOString();
  try {
    if (input.value.action === "withdraw_owner_material") {
      const result = await withdrawOwnerMaterial({
        env: { DB: input.env.DB, APP_ENV: input.env.APP_ENV ?? "development" },
        staff: input.staff,
        documentId: input.value.documentId,
        reason: input.value.reason,
        now: new Date(now),
      });
      return { action: input.value.action, affected: 1, targetId: result.documentId };
    }
    if (input.value.action === "publish_owner_material") {
      if (!input.env.BUCKET) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_INVALID");
      const result = await promoteCompletedAnalysisToOwnerCorpus({
        env: { DB: input.env.DB, BUCKET: input.env.BUCKET, APP_ENV: input.env.APP_ENV ?? "development" },
        staff: input.staff,
        analysisId: input.value.analysisId,
        workspaceId: input.value.workspaceId,
        title: input.value.title,
        language: input.value.language,
        rightsConfirmed: input.value.rightsConfirmed,
        reason: input.value.reason,
        now: new Date(now),
      });
      return {
        action: input.value.action,
        affected: result.status === "published" ? 1 : 0,
        targetId: result.documentId,
      };
    }
    if (input.value.action === "seed_discovery") {
      const statements: D1PreparedStatement[] = [];
      for (const category of LEX_CORPUS_CATEGORIES) {
        for (const language of LEX_CORPUS_LANGUAGES) {
          statements.push(input.env.DB.prepare(`INSERT INTO legal_corpus_discovery_checkpoints
            (id,category_key,language,search_url,status,page_number,expected_document_count,discovered_document_count,next_event_target,view_state,view_state_generator,attempt_count,next_attempt_at,last_error_code,started_at,completed_at,created_at,updated_at)
            VALUES (?,?,?,?,'queued',0,NULL,0,NULL,NULL,NULL,0,?,NULL,NULL,NULL,?,?)
            ON CONFLICT(category_key,language) DO NOTHING`).bind(
              checkpointId(category.key, language.language), category.key, language.language,
              lexCatalogSearchUrl(category.key, language.language), now, now, now,
            ));
        }
      }
      statements.push(await eventStatement({
        db: input.env.DB, environment, action: "discovery_seeded", targetType: "catalog", targetId: null,
        reason: input.value.reason, details: { considered: statements.length }, staff: input.staff, now,
      }));
      const result = await input.env.DB.batch(statements);
      const affected = result.slice(0, -1).reduce((total, item) => total + Number(item.meta.changes ?? 0), 0);
      return { action: input.value.action, affected };
    }
    if (input.value.action === "retry_discovery") {
      const checkpoint = await input.env.DB.prepare(`SELECT id,status FROM legal_corpus_discovery_checkpoints WHERE id=?`)
        .bind(input.value.checkpointId).first<{ id: string; status: string }>();
      if (!checkpoint) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_NOT_FOUND");
      if (!["retrying", "failed", "dead_letter"].includes(checkpoint.status)) {
        throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_CONFLICT");
      }
      const result = await input.env.DB.batch([
        input.env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints SET status='queued',attempt_count=0,
          next_attempt_at=?,last_error_code=NULL,completed_at=NULL,updated_at=? WHERE id=? AND status=?`)
          .bind(now, now, checkpoint.id, checkpoint.status),
        await eventStatement({
          db: input.env.DB, environment, action: "discovery_retried", targetType: "checkpoint", targetId: checkpoint.id,
          reason: input.value.reason, details: { previousStatus: checkpoint.status }, staff: input.staff, now,
        }),
      ]);
      if (Number(result[0]?.meta.changes ?? 0) !== 1) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_CONFLICT");
      return { action: input.value.action, affected: 1 };
    }
    const job = await input.env.DB.prepare(`SELECT id,status FROM legal_corpus_ingestion_jobs WHERE id=?`)
      .bind(input.value.jobId).first<{ id: string; status: string }>();
    if (!job) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_NOT_FOUND");
    if (!["retrying", "failed", "dead_letter"].includes(job.status)) {
      throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_CONFLICT");
    }
    const result = await input.env.DB.batch([
      input.env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs SET status='queued',attempt_count=0,
        next_attempt_at=?,last_error_code=NULL,updated_at=? WHERE id=? AND status=?`)
        .bind(now, now, job.id, job.status),
      input.env.DB.prepare(`UPDATE legal_corpus_failures SET retry_state='retrying' WHERE job_id=? AND retry_state IN ('pending','terminal')`)
        .bind(job.id),
      await eventStatement({
        db: input.env.DB, environment, action: "ingestion_retried", targetType: "ingestion_job", targetId: job.id,
        reason: input.value.reason, details: { previousStatus: job.status }, staff: input.staff, now,
      }),
    ]);
    if (Number(result[0]?.meta.changes ?? 0) !== 1) throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_CONFLICT");
    return { action: input.value.action, affected: 1 };
  } catch (error) {
    if (error instanceof LegalCorpusAdminError) throw error;
    if (error instanceof OwnerMaterialPromotionError) {
      if (error.code === "OWNER_MATERIAL_NOT_FOUND") {
        throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_NOT_FOUND");
      }
      if (error.code === "OWNER_MATERIAL_NOT_OWNED" || error.code === "OWNER_MATERIAL_NOT_READY"
        || error.code === "OWNER_MATERIAL_EXTRACTION_INVALID" || error.code === "OWNER_MATERIAL_CAPACITY_REJECTED"
        || error.code === "OWNER_MATERIAL_SENSITIVE_DATA_REJECTED"
        || error.code === "OWNER_MATERIAL_PROMPT_INJECTION_REJECTED") {
        throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_INVALID");
      }
      throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_CONFLICT");
    }
    throw new LegalCorpusAdminError("LEGAL_CORPUS_ADMIN_CONFLICT");
  }
}
