import { ArchiveInspectionError, verifyArchiveBytes } from "../document-analysis/archive-inspector";
import {
  arrayBufferHex,
  hashUploadIntent,
  initializeDocumentAnalysisUpload,
  parseDocumentAnalysisUploadIntent,
  parseUploadIdempotencyKey,
  validateTextUploadBytes,
  validateUploadMagicBytes,
} from "../document-analysis/upload-pipeline";
import type { PlatformStaffAccess } from "../auth/staff-access";
import { operationalEnvironment } from "../operations/operational-feature-flags";
import { OwnerMaterialPromotionError, promoteCompletedAnalysisToOwnerCorpus } from "./owner-materials";
import type { LegalCorpusLanguage } from "./trust";

const OWNER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

type OwnerUploadEnv = Pick<Env, "APP_ENV" | "DB" | "BUCKET" | "QUARANTINE_BUCKET">
  & { LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST?: string };
type OwnerPublicationEnv = Pick<Env, "DB" | "BUCKET">
  & { APP_ENV?: "development" | "staging" | "production" }
  & { LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST?: string };

export class OwnerCorpusUploadError extends Error {
  constructor(readonly code:
    | "OWNER_UPLOAD_INVALID"
    | "OWNER_UPLOAD_ACCESS_DENIED"
    | "OWNER_UPLOAD_STORAGE_FAILED"
    | "OWNER_UPLOAD_UNSAFE"
    | "OWNER_UPLOAD_CONFLICT") {
    super(code);
    this.name = "OwnerCorpusUploadError";
  }
}

type OwnerUploadAuthorization = Pick<PlatformStaffAccess,
  "userId" | "sessionId" | "assignmentIds" | "mfaVerifiedAt">;

export async function createOwnerCorpusUpload(input: {
  env: OwnerUploadEnv;
  staff: OwnerUploadAuthorization;
  idempotencyKey: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  title: string;
  language: LegalCorpusLanguage;
  rightsConfirmed: true;
  reason: string;
  now?: Date;
}): Promise<{ analysisId: string; status: "scan_queued"; replay: boolean }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const title = input.title.trim();
  const reason = input.reason.trim();
  if (input.env.LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST !== "true"
    || input.rightsConfirmed !== true || input.bytes.byteLength < 1 || input.bytes.byteLength > OWNER_UPLOAD_MAX_BYTES
    || title.length < 2 || title.length > 300 || reason.length < 10 || reason.length > 500) {
    throw new OwnerCorpusUploadError("OWNER_UPLOAD_INVALID");
  }
  const assignment = await activePublisherAssignment(input.env.DB, input.staff, now);
  if (!assignment) throw new OwnerCorpusUploadError("OWNER_UPLOAD_ACCESS_DENIED");
  const workspace = await input.env.DB.prepare(`SELECT workspace.id
    FROM workspaces workspace
    JOIN workspace_members member ON member.workspace_id=workspace.id
    WHERE member.user_id=? AND member.status='active'
    ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END,member.joined_at,workspace.id LIMIT 1`).bind(
    input.staff.userId,
  ).first<{ id: string }>();
  if (!workspace) throw new OwnerCorpusUploadError("OWNER_UPLOAD_ACCESS_DENIED");

  const sourceSha256 = await sha256Hex(input.bytes);
  const intent = parseDocumentAnalysisUploadIntent({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256: sourceSha256,
    locale: input.language.startsWith("uz-") ? "uz" : "ru",
    mode: "quick",
    caseId: null,
    consent: true,
  });
  const idempotencyKey = parseUploadIdempotencyKey(input.idempotencyKey);
  const requestHash = await hashUploadIntent(intent);
  const initialized = await initializeDocumentAnalysisUpload({
    db: input.env.DB,
    workspaceId: workspace.id,
    userId: input.staff.userId,
    idempotencyKey,
    requestHash,
    intent,
  });
  const record = initialized.record;
  if (initialized.replay) {
    const existing = await input.env.DB.prepare(`SELECT status FROM legal_corpus_owner_upload_requests
      WHERE analysis_id=? AND actor_user_id=? LIMIT 1`).bind(record.analysisId, input.staff.userId).first<{ status: string }>();
    if (existing) return { analysisId: record.analysisId, status: "scan_queued", replay: true };
  }

  try {
    const stored = await input.env.QUARANTINE_BUCKET.put(record.r2Key, input.bytes, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      sha256: sourceSha256,
      httpMetadata: { contentType: intent.mimeType, cacheControl: "private, no-store" },
      customMetadata: {
        workspaceId: workspace.id,
        ownerUserId: input.staff.userId,
        analysisId: record.analysisId,
        fileId: record.fileId,
        lifecycle: "owner-corpus-quarantine",
      },
    });
    const head = stored ?? await input.env.QUARANTINE_BUCKET.head(record.r2Key);
    if (!head || head.size !== input.bytes.byteLength || arrayBufferHex(head.checksums.sha256) !== sourceSha256) {
      throw new OwnerCorpusUploadError("OWNER_UPLOAD_STORAGE_FAILED");
    }
    await validateOwnerUploadBytes(intent.mimeType, input.bytes);

    const authorization = {
      environment: operationalEnvironment(input.env.APP_ENV),
      analysisId: record.analysisId,
      workspaceId: workspace.id,
      fileId: record.fileId,
      sourceSha256,
      title,
      language: input.language,
      rightsConfirmed: 1 as const,
      reason,
      actorUserId: input.staff.userId,
      actorSessionId: input.staff.sessionId,
      actorAssignmentId: assignment.id,
      actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
      createdAt: nowIso,
    };
    const authorizationHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(authorization)), true);
    const jobId = `malware-scan:${record.analysisId}`;
    await input.env.DB.batch([
      input.env.DB.prepare("UPDATE document_files SET kind='analysis_quarantined',updated_at=? WHERE id=? AND kind='analysis_upload_pending'")
        .bind(nowIso, record.fileId),
      input.env.DB.prepare("UPDATE document_analyses SET status='quarantined',error_code=NULL,updated_at=? WHERE id=? AND status='initiated'")
        .bind(nowIso, record.analysisId),
      input.env.DB.prepare(`INSERT OR IGNORE INTO job_outbox
        (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
         correlation_id,enqueued_at,available_at,status,dispatch_attempts,created_at,updated_at)
        VALUES (?,'MALWARE_SCAN_QUEUE','malware.scan',1,?,?,?, ?,?,?,'pending',0,?,?)`).bind(
        jobId, `${jobId}:${sourceSha256.slice(0, 16)}`, record.analysisId, workspace.id,
        `owner-upload:${record.analysisId}`, nowIso, nowIso, nowIso, nowIso,
      ),
      input.env.DB.prepare(`INSERT INTO legal_corpus_owner_upload_requests
        (id,environment,analysis_id,workspace_id,file_id,source_sha256,title,language,rights_confirmed,
         reason,actor_user_id,actor_session_id,actor_assignment_id,actor_mfa_verified_at,
         authorization_hash,status,error_code,published_document_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'scan_queued',NULL,NULL,?,?)`).bind(
        crypto.randomUUID(), authorization.environment, authorization.analysisId, authorization.workspaceId,
        authorization.fileId, authorization.sourceSha256, authorization.title, authorization.language,
        authorization.rightsConfirmed, authorization.reason, authorization.actorUserId,
        authorization.actorSessionId, authorization.actorAssignmentId, authorization.actorMfaVerifiedAt,
        authorizationHash, nowIso, nowIso,
      ),
      input.env.DB.prepare(`INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
        VALUES (?,?,?,'document_analysis',?,'owner_corpus_upload_scan_queued',?,?)`).bind(
        crypto.randomUUID(), workspace.id, input.staff.userId, record.analysisId,
        JSON.stringify({ fileId: record.fileId, mimeType: intent.mimeType, sizeBytes: input.bytes.byteLength, sourceSha256 }), nowIso,
      ),
    ]);
    return { analysisId: record.analysisId, status: "scan_queued", replay: false };
  } catch (error) {
    try { await input.env.QUARANTINE_BUCKET.delete(record.r2Key); } catch { /* isolated retention cleanup is safe */ }
    await input.env.DB.batch([
      input.env.DB.prepare("UPDATE document_files SET kind='analysis_rejected',archived_at=?,updated_at=? WHERE id=?")
        .bind(nowIso, nowIso, record.fileId),
      input.env.DB.prepare("UPDATE document_analyses SET status='failed',error_code='OWNER_UPLOAD_REJECTED',updated_at=? WHERE id=?")
        .bind(nowIso, record.analysisId),
    ]);
    if (error instanceof OwnerCorpusUploadError) throw error;
    if (error instanceof ArchiveInspectionError) throw new OwnerCorpusUploadError("OWNER_UPLOAD_UNSAFE");
    throw new OwnerCorpusUploadError("OWNER_UPLOAD_CONFLICT");
  }
}

export async function publishPendingOwnerCorpusUpload(
  env: OwnerPublicationEnv,
  analysisId: string,
  now = new Date(),
): Promise<"not_requested" | "published" | "failed"> {
  if (env.LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST !== "true") return "not_requested";
  const request = await env.DB.prepare(`SELECT id,workspace_id AS workspaceId,title,language,reason,
      actor_user_id AS actorUserId,actor_session_id AS actorSessionId,
      actor_assignment_id AS actorAssignmentId,actor_mfa_verified_at AS actorMfaVerifiedAt
    FROM legal_corpus_owner_upload_requests WHERE analysis_id=? AND status='scan_queued' LIMIT 1`).bind(
    analysisId,
  ).first<{
    id: string; workspaceId: string; title: string; language: LegalCorpusLanguage; reason: string;
    actorUserId: string; actorSessionId: string; actorAssignmentId: string; actorMfaVerifiedAt: string;
  }>();
  if (!request) return "not_requested";
  try {
    const published = await promoteCompletedAnalysisToOwnerCorpus({
      env: { APP_ENV: env.APP_ENV ?? "development", DB: env.DB, BUCKET: env.BUCKET },
      staff: {
        userId: request.actorUserId,
        sessionId: request.actorSessionId,
        assignmentIds: [request.actorAssignmentId],
        mfaVerifiedAt: request.actorMfaVerifiedAt,
      },
      ownerUploadRequestId: request.id,
      analysisId,
      workspaceId: request.workspaceId,
      title: request.title,
      language: request.language,
      rightsConfirmed: true,
      reason: request.reason,
      now,
    });
    await env.DB.prepare(`UPDATE legal_corpus_owner_upload_requests
      SET status='published',error_code=NULL,published_document_id=?,updated_at=?
      WHERE id=? AND status='scan_queued'`).bind(published.documentId, now.toISOString(), request.id).run();
    return "published";
  } catch (error) {
    const errorCode = error instanceof OwnerMaterialPromotionError
      ? error.code
      : "OWNER_UPLOAD_PUBLICATION_FAILED";
    await env.DB.prepare(`UPDATE legal_corpus_owner_upload_requests SET status='failed',error_code=?,updated_at=?
      WHERE id=? AND status='scan_queued'`).bind(errorCode, now.toISOString(), request.id).run();
    return "failed";
  }
}

async function activePublisherAssignment(
  db: D1Database,
  staff: OwnerUploadAuthorization,
  now: Date,
): Promise<{ id: string } | null> {
  const mfaAt = Date.parse(staff.mfaVerifiedAt);
  if (!Number.isFinite(mfaAt) || mfaAt > now.getTime() || mfaAt < now.getTime() - 15 * 60_000) return null;
  for (const assignmentId of staff.assignmentIds) {
    const assignment = await db.prepare(`SELECT id FROM platform_staff_assignments
      WHERE id=? AND user_id=? AND role IN ('administrator','legal_reviewer')
        AND revoked_at IS NULL AND granted_at<=? AND expires_at>? LIMIT 1`).bind(
      assignmentId, staff.userId, now.toISOString(), now.toISOString(),
    ).first<{ id: string }>();
    if (assignment) return assignment;
  }
  return null;
}

async function validateOwnerUploadBytes(mimeType: string, bytes: Uint8Array): Promise<void> {
  if (!validateUploadMagicBytes(mimeType, bytes.subarray(0, 16), bytes.subarray(Math.max(0, bytes.byteLength - 16)))) {
    throw new OwnerCorpusUploadError("OWNER_UPLOAD_UNSAFE");
  }
  if (mimeType === "application/zip" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    await verifyArchiveBytes(bytes, mimeType);
  }
  if ((mimeType === "text/plain" || mimeType === "text/html" || mimeType === "application/json")
    && !validateTextUploadBytes(mimeType, bytes)) {
    throw new OwnerCorpusUploadError("OWNER_UPLOAD_UNSAFE");
  }
}

async function sha256Hex(value: Uint8Array, uppercase = false): Promise<string> {
  const copy = Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return uppercase ? hex.toUpperCase() : hex;
}
