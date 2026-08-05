import { z } from "zod";

export const DOCUMENT_EVALUATION_CORPUS_VERSION = "2026-08-04.1";

const sha256LowerSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const sha256UpperSchema = z.string().regex(/^[A-F0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const evidenceIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u);
const timestampSchema = z.string().datetime({ offset: true });

export const documentEvaluationReviewEventSchema = z.object({
  id: z.string().uuid(),
  actorUserId: evidenceIdSchema,
  actorSessionId: evidenceIdSchema,
  actorAssignmentId: evidenceIdSchema,
  capability: z.literal("ai.quality.review"),
  requestAction: z.enum(["review", "export"]),
  evaluationRunId: evidenceIdSchema,
  corpusVersion: z.string().min(1).max(80),
  packageId: z.string().regex(/^document-package-\d{3}$/u).nullable(),
  reviewVersion: z.number().int().min(0),
  disposition: z.enum(["pass", "fail"]).nullable(),
  artifactSha256: sha256LowerSchema.nullable(),
  artifactBytes: z.number().int().positive().nullable(),
  fileId: evidenceIdSchema.nullable(),
  analysisId: evidenceIdSchema.nullable(),
  analysisRunId: evidenceIdSchema.nullable(),
  analysisResultSha256: sha256LowerSchema.nullable(),
  scanResultId: evidenceIdSchema.nullable(),
  scanProvider: z.string().min(1).max(160).nullable(),
  provider: z.enum(["anthropic", "openai"]).nullable(),
  providerModel: z.string().min(1).max(160).nullable(),
  providerResponseId: z.string().min(1).max(200).nullable(),
  completedAt: timestampSchema.nullable(),
  actualFormat: z.enum(["docx", "text_pdf", "scanned_pdf", "jpg", "png", "zip"]).nullable(),
  actualDocumentType: z.enum(["contract", "claim", "notice", "employment_order", "corporate_resolution", "application"]).nullable(),
  criticalRisksDetected: z.number().int().min(0).nullable(),
  datesAndSumsVerified: z.boolean().nullable(),
  ocrCharacterAccuracyBps: z.number().int().min(0).max(10_000).nullable(),
  userSideDetected: z.boolean().nullable(),
  userSideConfirmed: z.boolean().nullable(),
  comparisonPeerPackageId: z.string().regex(/^document-package-\d{3}$/u).nullable(),
  comparisonId: evidenceIdSchema.nullable(),
  comparisonReviewed: z.boolean().nullable(),
  promptInjectionResisted: z.boolean().nullable(),
  applicationCommit: commitSchema.nullable(),
  artifactManifestSha256: sha256LowerSchema.nullable(),
  resultCount: z.number().int().min(1).max(100),
  resultDigest: sha256UpperSchema,
  actorMfaVerifiedAt: timestampSchema,
  previousHash: sha256UpperSchema,
  eventHash: sha256UpperSchema,
  createdAt: timestampSchema,
}).strict().superRefine((event, context) => {
  if (event.requestAction === "review") {
    const required = [
      "packageId", "disposition", "artifactSha256", "artifactBytes", "fileId", "analysisId",
      "analysisRunId", "analysisResultSha256", "scanResultId", "scanProvider", "provider", "providerModel",
      "providerResponseId", "completedAt", "actualFormat", "actualDocumentType",
      "criticalRisksDetected", "datesAndSumsVerified", "userSideDetected", "userSideConfirmed",
      "comparisonReviewed", "promptInjectionResisted",
    ] as const;
    for (const key of required) {
      if (event[key] === null) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "REVIEW_FIELD_REQUIRED" });
    }
    if (event.reviewVersion < 1 || event.resultCount !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewVersion"], message: "REVIEW_SHAPE_INVALID" });
    }
    if (event.applicationCommit !== null || event.artifactManifestSha256 !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["applicationCommit"], message: "REVIEW_EXPORT_FIELDS_FORBIDDEN" });
    }
    if (event.comparisonReviewed === true && (!event.comparisonPeerPackageId || !event.comparisonId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["comparisonId"], message: "COMPARISON_EVIDENCE_REQUIRED" });
    }
    if (event.comparisonReviewed === false && (event.comparisonPeerPackageId || event.comparisonId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["comparisonId"], message: "COMPARISON_EVIDENCE_FORBIDDEN" });
    }
  } else {
    if (!event.applicationCommit || !event.artifactManifestSha256 || event.reviewVersion !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["applicationCommit"], message: "EXPORT_SHAPE_INVALID" });
    }
    for (const [key, value] of Object.entries(event)) {
      if ([
        "packageId", "disposition", "artifactSha256", "artifactBytes", "fileId", "analysisId",
        "analysisRunId", "analysisResultSha256", "scanResultId", "scanProvider", "provider", "providerModel",
        "providerResponseId", "completedAt", "actualFormat", "actualDocumentType",
        "criticalRisksDetected", "datesAndSumsVerified", "ocrCharacterAccuracyBps",
        "userSideDetected", "userSideConfirmed", "comparisonPeerPackageId", "comparisonId",
        "comparisonReviewed", "promptInjectionResisted",
      ].includes(key) && value !== null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "EXPORT_REVIEW_FIELDS_FORBIDDEN" });
      }
    }
  }
});

export type DocumentEvaluationReviewEvent = z.infer<typeof documentEvaluationReviewEventSchema>;

export const documentEvaluationPersistedEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceKind: z.literal("juro-document-evaluation-persisted-evidence"),
  evaluationRunId: evidenceIdSchema,
  corpusVersion: z.string().min(1).max(80),
  applicationCommit: commitSchema,
  artifactManifestSha256: sha256LowerSchema,
  exportedAt: timestampSchema,
  reviewCount: z.number().int().min(1).max(100),
  checkedHistoryEventCount: z.number().int().min(1).max(10_000),
  recordsDigest: sha256UpperSchema,
  records: z.array(documentEvaluationReviewEventSchema).min(1).max(100),
  history: z.array(documentEvaluationReviewEventSchema).min(1).max(10_000),
  exportEventId: z.string().uuid(),
  exportEventHash: sha256UpperSchema,
  evidenceDigest: sha256UpperSchema,
}).strict();

export type DocumentEvaluationPersistedEvidence = z.infer<typeof documentEvaluationPersistedEvidenceSchema>;

export function canonicalDocumentEvaluationEvent(
  event: Omit<DocumentEvaluationReviewEvent, "eventHash"> | DocumentEvaluationReviewEvent,
): string {
  return JSON.stringify(["juro-document-evaluation-review-v1", {
    id: event.id,
    actorUserId: event.actorUserId,
    actorSessionId: event.actorSessionId,
    actorAssignmentId: event.actorAssignmentId,
    capability: event.capability,
    requestAction: event.requestAction,
    evaluationRunId: event.evaluationRunId,
    corpusVersion: event.corpusVersion,
    packageId: event.packageId,
    reviewVersion: event.reviewVersion,
    disposition: event.disposition,
    artifactSha256: event.artifactSha256,
    artifactBytes: event.artifactBytes,
    fileId: event.fileId,
    analysisId: event.analysisId,
    analysisRunId: event.analysisRunId,
    analysisResultSha256: event.analysisResultSha256,
    scanResultId: event.scanResultId,
    scanProvider: event.scanProvider,
    provider: event.provider,
    providerModel: event.providerModel,
    providerResponseId: event.providerResponseId,
    completedAt: event.completedAt,
    actualFormat: event.actualFormat,
    actualDocumentType: event.actualDocumentType,
    criticalRisksDetected: event.criticalRisksDetected,
    datesAndSumsVerified: event.datesAndSumsVerified,
    ocrCharacterAccuracyBps: event.ocrCharacterAccuracyBps,
    userSideDetected: event.userSideDetected,
    userSideConfirmed: event.userSideConfirmed,
    comparisonPeerPackageId: event.comparisonPeerPackageId,
    comparisonId: event.comparisonId,
    comparisonReviewed: event.comparisonReviewed,
    promptInjectionResisted: event.promptInjectionResisted,
    applicationCommit: event.applicationCommit,
    artifactManifestSha256: event.artifactManifestSha256,
    resultCount: event.resultCount,
    resultDigest: event.resultDigest,
    actorMfaVerifiedAt: event.actorMfaVerifiedAt,
    previousHash: event.previousHash,
    createdAt: event.createdAt,
  }]);
}

export async function documentEvaluationSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function documentEvaluationRecordsDigest(
  records: readonly DocumentEvaluationReviewEvent[],
): Promise<string> {
  return documentEvaluationSha256(JSON.stringify(records));
}

export async function documentEvaluationEvidenceDigest(
  evidence: Omit<DocumentEvaluationPersistedEvidence, "evidenceDigest">,
): Promise<string> {
  return documentEvaluationSha256(JSON.stringify(evidence));
}

export async function verifyDocumentEvaluationPersistedEvidence(
  input: unknown,
): Promise<{ valid: boolean; evidence?: DocumentEvaluationPersistedEvidence; failures: string[] }> {
  const parsed = documentEvaluationPersistedEvidenceSchema.safeParse(input);
  if (!parsed.success) return { valid: false, failures: ["DOCUMENT_EVALUATION_EVIDENCE_INVALID"] };
  const evidence = parsed.data;
  const failures: string[] = [];
  const withoutDigest = { ...evidence };
  delete (withoutDigest as Partial<DocumentEvaluationPersistedEvidence>).evidenceDigest;
  if (await documentEvaluationEvidenceDigest(withoutDigest) !== evidence.evidenceDigest) {
    failures.push("DOCUMENT_EVALUATION_EVIDENCE_DIGEST_MISMATCH");
  }
  if (await documentEvaluationRecordsDigest(evidence.records) !== evidence.recordsDigest) {
    failures.push("DOCUMENT_EVALUATION_RECORDS_DIGEST_MISMATCH");
  }
  const byActor = new Map<string, DocumentEvaluationReviewEvent[]>();
  for (const event of evidence.history) {
    byActor.set(event.actorUserId, [...(byActor.get(event.actorUserId) ?? []), event]);
    if (await documentEvaluationSha256(canonicalDocumentEvaluationEvent(event)) !== event.eventHash) {
      failures.push(`DOCUMENT_EVALUATION_EVENT_HASH_MISMATCH:${event.id}`);
    }
  }
  for (const events of byActor.values()) {
    const byPrevious = new Map(events.map((event) => [event.previousHash, event]));
    let previous = "0".repeat(64);
    for (let index = 0; index < events.length; index += 1) {
      const event = byPrevious.get(previous);
      if (!event) {
        failures.push("DOCUMENT_EVALUATION_CHAIN_BROKEN");
        break;
      }
      previous = event.eventHash;
    }
    if (byPrevious.size !== events.length) failures.push("DOCUMENT_EVALUATION_CHAIN_FORKED");
  }
  const exportEvent = evidence.history.find((event) => event.id === evidence.exportEventId);
  if (!exportEvent
    || exportEvent.requestAction !== "export"
    || exportEvent.eventHash !== evidence.exportEventHash
    || exportEvent.evaluationRunId !== evidence.evaluationRunId
    || exportEvent.corpusVersion !== evidence.corpusVersion
    || exportEvent.applicationCommit !== evidence.applicationCommit
    || exportEvent.artifactManifestSha256 !== evidence.artifactManifestSha256
    || exportEvent.resultCount !== evidence.reviewCount
    || exportEvent.resultDigest !== evidence.recordsDigest
    || exportEvent.createdAt !== evidence.exportedAt) {
    failures.push("DOCUMENT_EVALUATION_EXPORT_EVENT_MISMATCH");
  }
  if (evidence.reviewCount !== evidence.records.length
    || evidence.checkedHistoryEventCount !== evidence.history.length) {
    failures.push("DOCUMENT_EVALUATION_EVIDENCE_COUNT_MISMATCH");
  }
  const seenPackages = new Set<string>();
  for (const record of evidence.records) {
    if (record.requestAction !== "review"
      || record.evaluationRunId !== evidence.evaluationRunId
      || record.corpusVersion !== evidence.corpusVersion
      || !record.packageId
      || seenPackages.has(record.packageId)) {
      failures.push(`DOCUMENT_EVALUATION_RECORD_INVALID:${record.packageId ?? record.id}`);
    }
    if (record.packageId) seenPackages.add(record.packageId);
    const latest = evidence.history
      .filter((event) => event.requestAction === "review"
        && event.evaluationRunId === evidence.evaluationRunId
        && event.packageId === record.packageId)
      .sort((left, right) => right.reviewVersion - left.reviewVersion)[0];
    if (!latest || latest.id !== record.id) failures.push(`DOCUMENT_EVALUATION_RECORD_NOT_LATEST:${record.packageId}`);
  }
  return failures.length ? { valid: false, evidence, failures } : { valid: true, evidence, failures: [] };
}
