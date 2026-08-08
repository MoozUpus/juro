import { z } from "zod";
import type { PlatformStaffAccess } from "../auth/staff-access";
import {
  canonicalDocumentEvaluationEvent,
  documentEvaluationEvidenceDigest,
  documentEvaluationPersistedEvidenceSchema,
  documentEvaluationRecordsDigest,
  documentEvaluationReviewEventSchema,
  documentEvaluationSha256,
  type DocumentEvaluationPersistedEvidence,
  type DocumentEvaluationReviewEvent,
} from "../../evaluation/document-evaluation-contract";

const GENESIS_HASH = "0".repeat(64);
const MAX_CHAIN_RETRIES = 3;
const evidenceIdSchema = z.string().min(1).max(180).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u);

const reviewRequestSchema = z.object({
  action: z.literal("review"),
  evaluationRunId: evidenceIdSchema,
  corpusVersion: z.string().min(1).max(80),
  packageId: z.string().regex(/^document-package-\d{3}$/u),
  disposition: z.enum(["pass", "fail"]),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  artifactBytes: z.number().int().positive().max(50 * 1024 * 1024),
  fileId: evidenceIdSchema,
  analysisId: evidenceIdSchema,
  analysisRunId: evidenceIdSchema,
  scanResultId: evidenceIdSchema,
  actualFormat: z.enum(["docx", "text_pdf", "scanned_pdf", "jpg", "png", "zip"]),
  actualDocumentType: z.enum(["contract", "claim", "notice", "employment_order", "corporate_resolution", "application"]),
  datesAndSumsVerified: z.boolean(),
  ocrCharacterAccuracyBps: z.number().int().min(0).max(10_000).nullable().default(null),
  userSideDetected: z.boolean(),
  userSideConfirmed: z.boolean(),
  comparisonPeerPackageId: z.string().regex(/^document-package-\d{3}$/u).nullable().default(null),
  comparisonId: evidenceIdSchema.nullable().default(null),
  comparisonReviewed: z.boolean(),
  promptInjectionResisted: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.comparisonReviewed && (!value.comparisonPeerPackageId || !value.comparisonId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["comparisonId"], message: "COMPARISON_EVIDENCE_REQUIRED" });
  }
  if (!value.comparisonReviewed && (value.comparisonPeerPackageId || value.comparisonId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["comparisonId"], message: "COMPARISON_EVIDENCE_FORBIDDEN" });
  }
  if (value.userSideConfirmed && !value.userSideDetected) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["userSideConfirmed"], message: "USER_SIDE_CONFIRMATION_INVALID" });
  }
});

const exportRequestSchema = z.object({
  action: z.literal("export"),
  evaluationRunId: evidenceIdSchema,
  corpusVersion: z.string().min(1).max(80),
  applicationCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  artifactManifestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export const documentEvaluationReviewRequestSchema = z.discriminatedUnion("action", [
  reviewRequestSchema,
  exportRequestSchema,
]);

export type DocumentEvaluationReviewRequest = z.output<typeof documentEvaluationReviewRequestSchema>;

type StoredRow = {
  id: string;
  actorUserId: string;
  actorSessionId: string;
  actorAssignmentId: string;
  capability: "ai.quality.review";
  requestAction: "review" | "export";
  evaluationRunId: string;
  corpusVersion: string;
  packageId: string | null;
  reviewVersion: number;
  disposition: "pass" | "fail" | null;
  artifactSha256: string | null;
  artifactBytes: number | null;
  fileId: string | null;
  analysisId: string | null;
  analysisRunId: string | null;
  analysisResultSha256: string | null;
  scanResultId: string | null;
  scanProvider: string | null;
  provider: "anthropic" | "openai" | null;
  providerModel: string | null;
  providerResponseId: string | null;
  completedAt: string | null;
  actualFormat: DocumentEvaluationReviewEvent["actualFormat"];
  actualDocumentType: DocumentEvaluationReviewEvent["actualDocumentType"];
  criticalRisksDetected: number | null;
  datesAndSumsVerified: number | null;
  ocrCharacterAccuracyBps: number | null;
  userSideDetected: number | null;
  userSideConfirmed: number | null;
  comparisonPeerPackageId: string | null;
  comparisonId: string | null;
  comparisonReviewed: number | null;
  promptInjectionResisted: number | null;
  applicationCommit: string | null;
  artifactManifestSha256: string | null;
  resultCount: number;
  resultDigest: string;
  actorMfaVerifiedAt: string;
  previousHash: string;
  eventHash: string;
  createdAt: string;
};

type AuthoritativeReviewEvidence = {
  analysisResultSha256: string;
  scanProvider: string;
  provider: "anthropic" | "openai";
  providerModel: string;
  providerResponseId: string;
  completedAt: string;
  criticalRisksDetected: number;
};

export class DocumentEvaluationReviewError extends Error {
  constructor(readonly code:
    | "DOCUMENT_EVALUATION_REVIEW_INVALID"
    | "DOCUMENT_EVALUATION_REVIEW_STALE_OR_UNVERIFIED"
    | "DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED"
    | "DOCUMENT_EVALUATION_REVIEW_WRITE_FAILED"
    | "DOCUMENT_EVALUATION_REVIEW_NOT_FOUND"
    | "DOCUMENT_EVALUATION_COMPARISON_INCOMPLETE") {
    super(code);
    this.name = "DocumentEvaluationReviewError";
  }
}

async function authoritativeReviewEvidence(input: {
  db: D1Database;
  fileId: string;
  analysisId: string;
  analysisRunId: string;
  scanResultId: string;
  artifactSha256: string;
  artifactBytes: number;
  actualFormat: NonNullable<DocumentEvaluationReviewEvent["actualFormat"]>;
}): Promise<AuthoritativeReviewEvidence> {
  const row = await input.db.prepare(
    `SELECT analysis.result_sha256 AS analysisResultSha256,scan.provider AS scanProvider,
      run.provider,run.model AS providerModel,run.provider_response_id AS providerResponseId,
      run.completed_at AS completedAt,
      (SELECT count(*) FROM document_risks risk
       WHERE risk.analysis_id=analysis.id AND risk.level='critical') AS criticalRisksDetected
     FROM document_files file
     JOIN document_analyses analysis
       ON analysis.id=? AND analysis.uploaded_file_id=file.id
      AND analysis.workspace_id=file.workspace_id AND analysis.owner_user_id=file.owner_user_id
     JOIN file_scan_results scan
       ON scan.id=? AND scan.analysis_id=analysis.id AND scan.file_id=file.id
      AND scan.workspace_id=analysis.workspace_id AND scan.owner_user_id=analysis.owner_user_id
     JOIN ai_runs run
       ON run.id=? AND run.workspace_id=analysis.workspace_id AND run.user_id=analysis.owner_user_id
     WHERE file.id=? AND file.kind='analysis_safe' AND file.sha256=? AND file.size_bytes=?
       AND ((?='docx' AND file.mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
         OR (? IN ('text_pdf','scanned_pdf') AND file.mime_type='application/pdf')
         OR (?='jpg' AND file.mime_type='image/jpeg')
         OR (?='png' AND file.mime_type='image/png')
         OR (?='zip' AND file.mime_type='application/zip'))
       AND analysis.status='completed' AND analysis.summary_json IS NOT NULL
       AND json_valid(analysis.summary_json)=1 AND analysis.result_sha256 IS NOT NULL
       AND analysis.error_code IS NULL AND scan.verdict='clean'
       AND scan.source_sha256=file.sha256 AND run.status='completed'
       AND run.provider IN ('anthropic','openai') AND run.provider_response_id IS NOT NULL
       AND run.completed_at IS NOT NULL AND run.error_code IS NULL LIMIT 1`,
  ).bind(
    input.analysisId, input.scanResultId, input.analysisRunId, input.fileId,
    input.artifactSha256, input.artifactBytes, input.actualFormat, input.actualFormat,
    input.actualFormat, input.actualFormat, input.actualFormat,
  ).first<AuthoritativeReviewEvidence>();
  if (!row || !/^[a-f0-9]{64}$/u.test(row.analysisResultSha256)) {
    throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_STALE_OR_UNVERIFIED");
  }
  return row;
}

async function assertRecordStillAuthoritative(
  db: D1Database,
  record: DocumentEvaluationReviewEvent,
): Promise<void> {
  if (!record.fileId || !record.analysisId || !record.analysisRunId || !record.scanResultId
    || !record.artifactSha256 || !record.artifactBytes || !record.actualFormat) {
    throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED");
  }
  const actual = await authoritativeReviewEvidence({
    db, fileId: record.fileId, analysisId: record.analysisId,
    analysisRunId: record.analysisRunId, scanResultId: record.scanResultId,
    artifactSha256: record.artifactSha256, artifactBytes: record.artifactBytes,
    actualFormat: record.actualFormat,
  });
  if (actual.analysisResultSha256 !== record.analysisResultSha256
    || actual.scanProvider !== record.scanProvider
    || actual.provider !== record.provider
    || actual.providerModel !== record.providerModel
    || actual.providerResponseId !== record.providerResponseId
    || actual.completedAt !== record.completedAt
    || actual.criticalRisksDetected !== record.criticalRisksDetected) {
    throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_STALE_OR_UNVERIFIED");
  }
}

function fromStored(row: StoredRow): DocumentEvaluationReviewEvent {
  return documentEvaluationReviewEventSchema.parse({
    ...row,
    datesAndSumsVerified: row.datesAndSumsVerified === null ? null : row.datesAndSumsVerified === 1,
    userSideDetected: row.userSideDetected === null ? null : row.userSideDetected === 1,
    userSideConfirmed: row.userSideConfirmed === null ? null : row.userSideConfirmed === 1,
    comparisonReviewed: row.comparisonReviewed === null ? null : row.comparisonReviewed === 1,
    promptInjectionResisted: row.promptInjectionResisted === null ? null : row.promptInjectionResisted === 1,
  });
}

async function storedEvents(db: D1Database): Promise<DocumentEvaluationReviewEvent[]> {
  const rows = await db.prepare(
    `SELECT id,actor_user_id AS actorUserId,actor_session_id AS actorSessionId,
      actor_assignment_id AS actorAssignmentId,capability,request_action AS requestAction,
      evaluation_run_id AS evaluationRunId,corpus_version AS corpusVersion,package_id AS packageId,
      review_version AS reviewVersion,disposition,artifact_sha256 AS artifactSha256,
      artifact_bytes AS artifactBytes,file_id AS fileId,analysis_id AS analysisId,
      analysis_run_id AS analysisRunId,scan_result_id AS scanResultId,scan_provider AS scanProvider,
      analysis_result_sha256 AS analysisResultSha256,
      provider,provider_model AS providerModel,provider_response_id AS providerResponseId,
      completed_at AS completedAt,actual_format AS actualFormat,actual_document_type AS actualDocumentType,
      critical_risks_detected AS criticalRisksDetected,dates_and_sums_verified AS datesAndSumsVerified,
      ocr_character_accuracy_bps AS ocrCharacterAccuracyBps,user_side_detected AS userSideDetected,
      user_side_confirmed AS userSideConfirmed,comparison_peer_package_id AS comparisonPeerPackageId,
      comparison_id AS comparisonId,comparison_reviewed AS comparisonReviewed,
      prompt_injection_resisted AS promptInjectionResisted,application_commit AS applicationCommit,
      artifact_manifest_sha256 AS artifactManifestSha256,result_count AS resultCount,
      result_digest AS resultDigest,actor_mfa_verified_at AS actorMfaVerifiedAt,
      previous_hash AS previousHash,event_hash AS eventHash,created_at AS createdAt
     FROM document_evaluation_review_events ORDER BY actor_user_id,created_at,id LIMIT 10001`,
  ).all<StoredRow>();
  if (rows.results.length > 10_000) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED");
  return rows.results.map(fromStored);
}

export async function verifyDocumentEvaluationReviewHistory(
  db: D1Database,
): Promise<{ valid: boolean; checked: number }> {
  let events: DocumentEvaluationReviewEvent[];
  try { events = await storedEvents(db); } catch { return { valid: false, checked: 0 }; }
  const byActor = new Map<string, DocumentEvaluationReviewEvent[]>();
  for (const event of events) byActor.set(event.actorUserId, [...(byActor.get(event.actorUserId) ?? []), event]);
  for (const actorEvents of byActor.values()) {
    const byPrevious = new Map(actorEvents.map((event) => [event.previousHash, event]));
    let previous = GENESIS_HASH;
    for (let index = 0; index < actorEvents.length; index += 1) {
      const event = byPrevious.get(previous);
      if (!event || await documentEvaluationSha256(canonicalDocumentEvaluationEvent(event)) !== event.eventHash) {
        return { valid: false, checked: events.length };
      }
      previous = event.eventHash;
    }
    if (byPrevious.size !== actorEvents.length) return { valid: false, checked: events.length };
  }
  return { valid: true, checked: events.length };
}

function actorHead(events: readonly DocumentEvaluationReviewEvent[], actorUserId: string): string {
  const actorEvents = events.filter((event) => event.actorUserId === actorUserId);
  if (!actorEvents.length) return GENESIS_HASH;
  const used = new Set(actorEvents.map((event) => event.previousHash));
  const head = actorEvents.find((event) => !used.has(event.eventHash));
  if (!head) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED");
  return head.eventHash;
}

function emptyReviewFields() {
  return {
    packageId: null, reviewVersion: 0, disposition: null, artifactSha256: null,
    artifactBytes: null, fileId: null, analysisId: null, analysisRunId: null,
    analysisResultSha256: null,
    scanResultId: null, scanProvider: null, provider: null, providerModel: null,
    providerResponseId: null, completedAt: null, actualFormat: null,
    actualDocumentType: null, criticalRisksDetected: null, datesAndSumsVerified: null,
    ocrCharacterAccuracyBps: null, userSideDetected: null, userSideConfirmed: null,
    comparisonPeerPackageId: null, comparisonId: null, comparisonReviewed: null,
    promptInjectionResisted: null,
  } as const;
}

async function appendEvent(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  request: DocumentEvaluationReviewRequest;
  now: Date;
  exportRecords?: readonly DocumentEvaluationReviewEvent[];
}): Promise<DocumentEvaluationReviewEvent> {
  const createdAt = input.now.toISOString();
  if (!input.staff.assignmentIds[0] || !input.staff.mfaVerifiedAt) {
    throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INVALID");
  }
  for (let attempt = 0; attempt < MAX_CHAIN_RETRIES; attempt += 1) {
    const events = await storedEvents(input.db);
    const integrity = await verifyDocumentEvaluationReviewHistory(input.db);
    if (!integrity.valid) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED");
    const previousHash = actorHead(events, input.staff.userId);
    let eventWithoutHash: Omit<DocumentEvaluationReviewEvent, "eventHash">;
    if (input.request.action === "review") {
      const reviewPackageId = input.request.packageId;
      const authoritative = await authoritativeReviewEvidence({
        db: input.db,
        fileId: input.request.fileId,
        analysisId: input.request.analysisId,
        analysisRunId: input.request.analysisRunId,
        scanResultId: input.request.scanResultId,
        artifactSha256: input.request.artifactSha256,
        artifactBytes: input.request.artifactBytes,
        actualFormat: input.request.actualFormat,
      });
      const latestVersion = events
        .filter((event) => event.requestAction === "review"
          && event.evaluationRunId === input.request.evaluationRunId
          && event.packageId === reviewPackageId)
        .reduce((maximum, event) => Math.max(maximum, event.reviewVersion), 0);
      const resultDigest = await documentEvaluationSha256(JSON.stringify({
        evaluationRunId: input.request.evaluationRunId,
        corpusVersion: input.request.corpusVersion,
        packageId: input.request.packageId,
        disposition: input.request.disposition,
        artifactSha256: input.request.artifactSha256,
        artifactBytes: input.request.artifactBytes,
        fileId: input.request.fileId,
        analysisId: input.request.analysisId,
        analysisRunId: input.request.analysisRunId,
        analysisResultSha256: authoritative.analysisResultSha256,
        scanResultId: input.request.scanResultId,
        scanProvider: authoritative.scanProvider,
        provider: authoritative.provider,
        providerModel: authoritative.providerModel,
        providerResponseId: authoritative.providerResponseId,
        completedAt: authoritative.completedAt,
        actualFormat: input.request.actualFormat,
        actualDocumentType: input.request.actualDocumentType,
        criticalRisksDetected: authoritative.criticalRisksDetected,
        datesAndSumsVerified: input.request.datesAndSumsVerified,
        ocrCharacterAccuracyBps: input.request.ocrCharacterAccuracyBps,
        userSideDetected: input.request.userSideDetected,
        userSideConfirmed: input.request.userSideConfirmed,
        comparisonPeerPackageId: input.request.comparisonPeerPackageId,
        comparisonId: input.request.comparisonId,
        comparisonReviewed: input.request.comparisonReviewed,
        promptInjectionResisted: input.request.promptInjectionResisted,
      }));
      eventWithoutHash = {
        id: crypto.randomUUID(), actorUserId: input.staff.userId, actorSessionId: input.staff.sessionId,
        actorAssignmentId: input.staff.assignmentIds[0], capability: "ai.quality.review",
        requestAction: "review", evaluationRunId: input.request.evaluationRunId,
        corpusVersion: input.request.corpusVersion, packageId: input.request.packageId,
        reviewVersion: latestVersion + 1, disposition: input.request.disposition,
        artifactSha256: input.request.artifactSha256, artifactBytes: input.request.artifactBytes,
        fileId: input.request.fileId, analysisId: input.request.analysisId,
        analysisRunId: input.request.analysisRunId,
        analysisResultSha256: authoritative.analysisResultSha256,
        scanResultId: input.request.scanResultId,
        scanProvider: authoritative.scanProvider, provider: authoritative.provider,
        providerModel: authoritative.providerModel, providerResponseId: authoritative.providerResponseId,
        completedAt: authoritative.completedAt, actualFormat: input.request.actualFormat,
        actualDocumentType: input.request.actualDocumentType,
        criticalRisksDetected: authoritative.criticalRisksDetected,
        datesAndSumsVerified: input.request.datesAndSumsVerified,
        ocrCharacterAccuracyBps: input.request.ocrCharacterAccuracyBps,
        userSideDetected: input.request.userSideDetected, userSideConfirmed: input.request.userSideConfirmed,
        comparisonPeerPackageId: input.request.comparisonPeerPackageId,
        comparisonId: input.request.comparisonId, comparisonReviewed: input.request.comparisonReviewed,
        promptInjectionResisted: input.request.promptInjectionResisted,
        applicationCommit: null, artifactManifestSha256: null, resultCount: 1, resultDigest,
        actorMfaVerifiedAt: input.staff.mfaVerifiedAt, previousHash, createdAt,
      };
    } else {
      const records = input.exportRecords ?? [];
      if (!records.length) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_NOT_FOUND");
      const resultDigest = await documentEvaluationRecordsDigest(records);
      eventWithoutHash = {
        id: crypto.randomUUID(), actorUserId: input.staff.userId, actorSessionId: input.staff.sessionId,
        actorAssignmentId: input.staff.assignmentIds[0], capability: "ai.quality.review",
        requestAction: "export", evaluationRunId: input.request.evaluationRunId,
        corpusVersion: input.request.corpusVersion, ...emptyReviewFields(),
        applicationCommit: input.request.applicationCommit,
        artifactManifestSha256: input.request.artifactManifestSha256,
        resultCount: records.length, resultDigest, actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
        previousHash, createdAt,
      };
    }
    const event: DocumentEvaluationReviewEvent = {
      ...eventWithoutHash,
      eventHash: await documentEvaluationSha256(canonicalDocumentEvaluationEvent(eventWithoutHash)),
    };
    documentEvaluationReviewEventSchema.parse(event);
    try {
      await input.db.prepare(
        `INSERT INTO document_evaluation_review_events
         (id,actor_user_id,actor_session_id,actor_assignment_id,capability,request_action,
          evaluation_run_id,corpus_version,package_id,review_version,disposition,artifact_sha256,
          artifact_bytes,file_id,analysis_id,analysis_run_id,analysis_result_sha256,
          scan_result_id,scan_provider,provider,
          provider_model,provider_response_id,completed_at,actual_format,actual_document_type,
          critical_risks_detected,dates_and_sums_verified,ocr_character_accuracy_bps,
          user_side_detected,user_side_confirmed,comparison_peer_package_id,comparison_id,
          comparison_reviewed,prompt_injection_resisted,application_commit,artifact_manifest_sha256,
          result_count,result_digest,actor_mfa_verified_at,previous_hash,event_hash,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        event.id,event.actorUserId,event.actorSessionId,event.actorAssignmentId,event.capability,
        event.requestAction,event.evaluationRunId,event.corpusVersion,event.packageId,event.reviewVersion,
        event.disposition,event.artifactSha256,event.artifactBytes,event.fileId,event.analysisId,
        event.analysisRunId,event.analysisResultSha256,event.scanResultId,event.scanProvider,
        event.provider,event.providerModel,
        event.providerResponseId,event.completedAt,event.actualFormat,event.actualDocumentType,
        event.criticalRisksDetected,event.datesAndSumsVerified === null ? null : Number(event.datesAndSumsVerified),
        event.ocrCharacterAccuracyBps,event.userSideDetected === null ? null : Number(event.userSideDetected),
        event.userSideConfirmed === null ? null : Number(event.userSideConfirmed),event.comparisonPeerPackageId,
        event.comparisonId,event.comparisonReviewed === null ? null : Number(event.comparisonReviewed),
        event.promptInjectionResisted === null ? null : Number(event.promptInjectionResisted),
        event.applicationCommit,event.artifactManifestSha256,event.resultCount,event.resultDigest,
        event.actorMfaVerifiedAt,event.previousHash,event.eventHash,event.createdAt,
      ).run();
      return event;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/STALE_OR_UNVERIFIED/u.test(message)) {
        throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_STALE_OR_UNVERIFIED");
      }
      if (!/CHAIN_CONFLICT|chain_uidx/u.test(message) || attempt === MAX_CHAIN_RETRIES - 1) {
        throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_WRITE_FAILED");
      }
    }
  }
  throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_WRITE_FAILED");
}

function latestReviewRecords(
  events: readonly DocumentEvaluationReviewEvent[],
  evaluationRunId: string,
  corpusVersion: string,
): DocumentEvaluationReviewEvent[] {
  const latest = new Map<string, DocumentEvaluationReviewEvent>();
  for (const event of events) {
    if (event.requestAction !== "review"
      || event.evaluationRunId !== evaluationRunId
      || event.corpusVersion !== corpusVersion
      || !event.packageId) continue;
    const current = latest.get(event.packageId);
    if (!current || event.reviewVersion > current.reviewVersion) latest.set(event.packageId, event);
  }
  return [...latest.values()].sort((left, right) => (left.packageId ?? "").localeCompare(right.packageId ?? ""));
}

function assertComparisonPairs(records: readonly DocumentEvaluationReviewEvent[]): void {
  const byPackage = new Map(records.map((record) => [record.packageId, record]));
  for (const record of records) {
    if (record.comparisonReviewed !== true || !record.comparisonPeerPackageId || !record.comparisonId) continue;
    const peer = byPackage.get(record.comparisonPeerPackageId);
    if (!peer
      || peer.comparisonReviewed !== true
      || peer.comparisonPeerPackageId !== record.packageId
      || peer.comparisonId !== record.comparisonId
      || peer.fileId === record.fileId) {
      throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_COMPARISON_INCOMPLETE");
    }
  }
}

export async function executeDocumentEvaluationReview(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  request: DocumentEvaluationReviewRequest;
  now?: Date;
}): Promise<
  | { action: "review"; eventId: string; eventHash: string; reviewVersion: number; integrity: { valid: boolean; checked: number } }
  | { action: "export"; evidence: DocumentEvaluationPersistedEvidence; integrity: { valid: boolean; checked: number } }
> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INVALID");
  if (input.request.action === "review") {
    const event = await appendEvent({ db: input.db, staff: input.staff, request: input.request, now });
    const integrity = await verifyDocumentEvaluationReviewHistory(input.db);
    if (!integrity.valid) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED");
    return { action: "review", eventId: event.id, eventHash: event.eventHash, reviewVersion: event.reviewVersion, integrity };
  }
  const before = await storedEvents(input.db);
  const records = latestReviewRecords(before, input.request.evaluationRunId, input.request.corpusVersion);
  if (!records.length) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_NOT_FOUND");
  for (const record of records) await assertRecordStillAuthoritative(input.db, record);
  assertComparisonPairs(records);
  const exportEvent = await appendEvent({
    db: input.db, staff: input.staff, request: input.request, now, exportRecords: records,
  });
  const history = await storedEvents(input.db);
  const integrity = await verifyDocumentEvaluationReviewHistory(input.db);
  if (!integrity.valid) throw new DocumentEvaluationReviewError("DOCUMENT_EVALUATION_REVIEW_INTEGRITY_FAILED");
  const recordsDigest = await documentEvaluationRecordsDigest(records);
  const withoutDigest: Omit<DocumentEvaluationPersistedEvidence, "evidenceDigest"> = {
    schemaVersion: 1,
    evidenceKind: "juro-document-evaluation-persisted-evidence",
    evaluationRunId: input.request.evaluationRunId,
    corpusVersion: input.request.corpusVersion,
    applicationCommit: input.request.applicationCommit,
    artifactManifestSha256: input.request.artifactManifestSha256,
    exportedAt: exportEvent.createdAt,
    reviewCount: records.length,
    checkedHistoryEventCount: history.length,
    recordsDigest,
    records,
    history,
    exportEventId: exportEvent.id,
    exportEventHash: exportEvent.eventHash,
  };
  const evidence = documentEvaluationPersistedEvidenceSchema.parse({
    ...withoutDigest,
    evidenceDigest: await documentEvaluationEvidenceDigest(withoutDigest),
  });
  return { action: "export", evidence, integrity };
}
