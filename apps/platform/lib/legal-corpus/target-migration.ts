import { z } from "zod";

import {
  canonicalChunkIdSchema,
  captureIdSchema,
  legalEnvironmentSchema,
  legalIdentifierSchema,
  legalInstrumentIdSchema,
  legalLanguageSchema,
  legalScriptSchema,
  officialExpressionIdSchema,
  provisionConceptIdSchema,
  provisionRenditionIdSchema,
  searchReleaseIdSchema,
  sha256Schema,
  textRevisionIdSchema,
  type CanonicalChunkId,
  type ProvisionConceptId,
  type ProvisionRenditionId,
  type TextRevisionId,
  utcInstantSchema,
} from "./target-domain-schemas";

const id = z.string().min(1).max(300);
const identifier = legalIdentifierSchema;
const sha = sha256Schema;
const instant = utcInstantSchema;
const environment = legalEnvironmentSchema;
const capability = z.enum(["current", "history"]);
const language = legalLanguageSchema;
const script = legalScriptSchema;
const authority = z.enum(["controlling", "official_translation", "unknown"]);
const semanticFingerprintSchema = z.string().regex(/^legal-semantic-v1:[a-f0-9]{64}$/u);
const sourceDocumentSchema = z.object({
  sourceId: id,
  legalInstrumentId: legalInstrumentIdSchema,
  publisherInstrumentToken: z.string().min(1).max(200),
  sourceUrl: z.string().url(),
  redirectedTo: z.string().url().optional(),
}).strict();
const rawCaptureSchema = z.object({
  sourceId: id,
  captureId: captureIdSchema,
  legalInstrumentId: legalInstrumentIdSchema,
  sourceUrl: z.string().url(),
  capturedAt: instant,
  sha256: sha,
}).strict();
const revisionSchema = z.object({
  sourceId: id,
  textRevisionId: textRevisionIdSchema,
  officialExpressionId: officialExpressionIdSchema,
  publisherInstrumentToken: z.string().min(1).max(200),
  publisherRevisionToken: z.string().min(1).max(160),
  language,
  script,
  textualAuthority: authority,
  captureIds: z.array(captureIdSchema).min(1),
  sha256: sha,
}).strict();
const renditionSchema = z.object({
  sourceId: id,
  provisionRenditionId: provisionRenditionIdSchema,
  provisionConceptId: provisionConceptIdSchema,
  textRevisionId: textRevisionIdSchema,
  legalInstrumentId: legalInstrumentIdSchema,
  publisherInstrumentToken: z.string().min(1).max(200),
  publisherConceptToken: z.string().min(1).max(200),
  publisherProvisionToken: z.string().min(1).max(200),
  language,
  script,
  textualAuthority: authority,
  applicabilityIdentity: z.string().min(1).max(200),
  sha256: sha,
  semanticFingerprint: semanticFingerprintSchema,
}).strict();
const chunkSchema = z.object({
  sourceId: id,
  chunkId: canonicalChunkIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  ordinal: z.number().int().nonnegative(),
  sha256: sha,
  byteCount: z.number().int().positive(),
  capabilities: z.array(capability).min(1).max(2),
}).strict();
const sparsePostingSchema = z.object({
  sourceId: id,
  chunkId: canonicalChunkIdSchema,
  termHash: sha,
}).strict();
const denseCandidateSchema = z.object({
  sourceId: id,
  chunkId: canonicalChunkIdSchema,
  projection: capability,
  providerId: z.string().min(1).max(500),
}).strict();
const releaseItemSchema = z.object({
  sourceId: id,
  itemKey: z.string().min(1).max(700),
  releaseId: searchReleaseIdSchema,
  capability,
  chunkId: canonicalChunkIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  shardId: z.string().regex(/^\d{2}$/u),
  r2Key: z.string().min(1).max(700),
  byteCount: z.number().int().positive(),
  sha256: sha,
}).strict();
const canonicalObjectSchema = z.object({
  kind: z.enum([
    "legal_instrument",
    "capture_record",
    "immutable_body",
    "normalized_revision",
    "provision_concept",
    "provision_rendition",
    "chunk",
    "authority_evidence",
    "applicability_evidence",
    "provenance_record",
    "audit_relationship",
  ]),
  canonicalIdentity: z.string().min(1).max(700),
  sha256: sha.nullable(),
  metadataSha256: sha,
}).strict();
const lineageSchema = z.object({
  id: identifier,
  predecessorConceptId: provisionConceptIdSchema,
  successorConceptId: provisionConceptIdSchema.nullable(),
  transition: z.enum(["unchanged", "modified", "renumbered", "moved", "split", "merged", "repealed"]),
  evidenceUrl: z.string().url(),
  reviewState: z.enum(["pending", "accepted", "rejected"]),
}).strict();
const authorityEvidenceRecordSchema = z.object({
  sourceId: id,
  authorityEvidenceId: identifier,
  officialExpressionId: officialExpressionIdSchema,
  captureId: captureIdSchema,
  textRevisionId: textRevisionIdSchema,
  textualAuthority: authority,
  evidenceUrl: z.string().url(),
  recordedAt: instant,
  sha256: sha,
}).strict();
const applicabilityEvidenceRecordSchema = z.object({
  sourceId: id,
  applicabilityEvidenceId: identifier,
  provisionRenditionId: provisionRenditionIdSchema,
  applicabilityIdentity: z.string().min(1).max(200),
  evidenceUrl: z.string().url(),
  validFrom: instant,
  validTo: instant.nullable(),
  recordedAt: instant,
}).strict().superRefine((value, context) => {
  if (value.validTo !== null && value.validFrom >= value.validTo) {
    context.addIssue({ code: "custom", message: "Applicability evidence interval must be non-empty" });
  }
});
const provenanceRecordSchema = z.object({
  sourceId: id,
  provenanceRecordId: identifier,
  captureId: captureIdSchema,
  textRevisionId: textRevisionIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  evidenceUrl: z.string().url(),
  recordedAt: instant,
}).strict();
const auditRelationshipSchema = z.object({
  sourceId: id,
  auditRelationshipId: identifier,
  fromKind: z.literal("provision_rendition"),
  fromId: provisionRenditionIdSchema,
  toKind: z.literal("chunk"),
  toId: canonicalChunkIdSchema,
  relationship: z.literal("derived_chunk"),
  evidenceUrl: z.string().url(),
  recordedAt: instant,
}).strict();
const duplicateReviewSchema = z.object({
  semanticFingerprint: semanticFingerprintSchema,
  decision: z.literal("preserve_distinct"),
  evidenceUrl: z.string().url(),
  reviewedBy: z.string().trim().min(1).max(160),
  reviewedAt: instant,
}).strict();
const inventorySchema = z.object({
  runId: identifier,
  environment,
  releaseId: searchReleaseIdSchema,
  capability,
  shardCount: z.number().int().min(1).max(99),
  sourceDocuments: z.array(sourceDocumentSchema),
  rawCaptures: z.array(rawCaptureSchema),
  normalizedRevisions: z.array(revisionSchema),
  provisionRenditions: z.array(renditionSchema),
  chunks: z.array(chunkSchema),
  sparsePostings: z.array(sparsePostingSchema),
  denseCandidates: z.array(denseCandidateSchema),
  releaseItems: z.array(releaseItemSchema),
  targetSparsePostings: z.array(sparsePostingSchema),
  targetDenseCandidates: z.array(denseCandidateSchema),
  targetReleaseItems: z.array(releaseItemSchema),
  targetCanonicalObjects: z.array(canonicalObjectSchema),
  authorityEvidenceRecords: z.array(authorityEvidenceRecordSchema),
  applicabilityEvidenceRecords: z.array(applicabilityEvidenceRecordSchema),
  provenanceRecords: z.array(provenanceRecordSchema),
  auditRelationships: z.array(auditRelationshipSchema),
  duplicateReviews: z.array(duplicateReviewSchema),
  lineageEdges: z.array(lineageSchema),
}).strict();

export type CorpusMigrationInventory = z.input<typeof inventorySchema>;
type Inventory = z.infer<typeof inventorySchema>;
type ExpectedSparse = z.infer<typeof sparsePostingSchema>;
type ExpectedDense = z.infer<typeof denseCandidateSchema>;
type ExpectedItem = z.infer<typeof releaseItemSchema>;
type ExpectedCanonicalObject = z.infer<typeof canonicalObjectSchema>;

export class MigrationReconciliationError extends Error {
  constructor(readonly code:
    | "MIGRATION_RECONCILIATION_INTERRUPTED"
    | "MIGRATION_RECONCILIATION_IDENTITY_CONFLICT") {
    super(code);
    this.name = "MigrationReconciliationError";
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const result = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sorted<T extends { sourceId: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

type CanonicalChunk = {
  id: CanonicalChunkId;
  provisionRenditionId: ProvisionRenditionId;
  sourceIds: string[];
  sourceChunkIds: string[];
  sha256: string;
  byteCount: number;
  capabilities: Array<"current" | "history">;
};

type Canonicalized = {
  revisionBySourceId: Map<string, TextRevisionId>;
  conceptBySourceId: Map<string, ProvisionConceptId>;
  renditionBySourceId: Map<string, ProvisionRenditionId>;
  chunkBySourceId: Map<string, CanonicalChunkId>;
  chunks: CanonicalChunk[];
  projectionEligibleChunkIds: Set<CanonicalChunkId>;
  sourceCounts: Record<string, number>;
  canonicalCounts: Record<string, number>;
  exactDuplicatesAliased: Record<string, number>;
  preservedVariants: Record<string, number>;
  provenance: {
    sourceUrls: string[];
    captureIds: string[];
    captureToRevision: string[];
    revisionToRendition: string[];
    renditionToChunk: string[];
    chunkToSparsePosting: string[];
    chunkToDenseCandidate: string[];
    chunkToReleaseItem: string[];
    authorityEvidence: string[];
    applicabilityEvidence: string[];
    provenanceRecords: string[];
    auditRelationships: string[];
  };
  bodyAliases: Array<{
    sourceId: string;
    captureId: string;
    legalInstrumentId: string;
    sourceUrl: string;
    capturedAt: string;
    sha256: string;
    canonicalLocator: string;
  }>;
  canonicalAliases: {
    normalizedRevisions: Array<{ sourceId: string; sourceIdentity: string; canonicalIdentity: string }>;
    provisionConcepts: Array<{ sourceId: string; sourceIdentity: string; canonicalIdentity: string }>;
    provisionRenditions: Array<{ sourceId: string; sourceIdentity: string; canonicalIdentity: string }>;
    chunks: Array<{ sourceId: string; sourceIdentity: string; canonicalIdentity: string }>;
  };
  duplicateCandidates: Array<{
    semanticFingerprint: string;
    canonicalIdentities: string[];
    reviewState: "unresolved" | "reviewed";
    decision: "preserve_distinct" | null;
    evidenceUrl: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  }>;
  lineageEdges: Inventory["lineageEdges"];
  initialHashMismatches: string[];
  initialMetadataMismatches: string[];
  missingProvenance: string[];
};

const countMapSchema = z.record(z.string(), z.number().int().nonnegative());
const provenanceSummarySchema = z.object({
  sourceUrls: z.array(z.string().url()),
  captureIds: z.array(captureIdSchema),
  captureToRevision: z.array(z.string()),
  revisionToRendition: z.array(z.string()),
  renditionToChunk: z.array(z.string()),
  chunkToSparsePosting: z.array(z.string()),
  chunkToDenseCandidate: z.array(z.string()),
  chunkToReleaseItem: z.array(z.string()),
  authorityEvidence: z.array(z.string()),
  applicabilityEvidence: z.array(z.string()),
  provenanceRecords: z.array(z.string()),
  auditRelationships: z.array(z.string()),
}).strict();
const bodyAliasSchema = z.object({
  sourceId: id,
  captureId: captureIdSchema,
  legalInstrumentId: legalInstrumentIdSchema,
  sourceUrl: z.string().url(),
  capturedAt: instant,
  sha256: sha,
  canonicalLocator: z.string().min(1).max(700),
}).strict();
const canonicalAliasesSchema = z.object({
  normalizedRevisions: z.array(z.object({
    sourceId: id,
    sourceIdentity: textRevisionIdSchema,
    canonicalIdentity: textRevisionIdSchema,
  }).strict()),
  provisionConcepts: z.array(z.object({
    sourceId: id,
    sourceIdentity: provisionConceptIdSchema,
    canonicalIdentity: provisionConceptIdSchema,
  }).strict()),
  provisionRenditions: z.array(z.object({
    sourceId: id,
    sourceIdentity: provisionRenditionIdSchema,
    canonicalIdentity: provisionRenditionIdSchema,
  }).strict()),
  chunks: z.array(z.object({
    sourceId: id,
    sourceIdentity: canonicalChunkIdSchema,
    canonicalIdentity: canonicalChunkIdSchema,
  }).strict()),
}).strict();
const duplicateCandidateSummarySchema = z.object({
  semanticFingerprint: semanticFingerprintSchema,
  canonicalIdentities: z.array(provisionRenditionIdSchema).min(2),
  reviewState: z.enum(["unresolved", "reviewed"]),
  decision: z.literal("preserve_distinct").nullable(),
  evidenceUrl: z.string().url().nullable(),
  reviewedBy: z.string().min(1).max(160).nullable(),
  reviewedAt: instant.nullable(),
}).strict();
const reconciliationSummarySchema = z.object({
  missingObjects: z.array(z.string()),
  extraObjects: z.array(z.string()),
  hashMismatches: z.array(z.string()),
  metadataMismatches: z.array(z.string()),
  missingProvenance: z.array(z.string()),
  crossReleaseContamination: z.array(z.string()),
  nonDisjointShardMembership: z.array(z.string()),
  duplicateProjectionMembership: z.array(z.string()),
}).strict();
const migrationReconciliationReportSchema = z.object({
  runId: identifier,
  environment,
  releaseId: searchReleaseIdSchema,
  capability,
  status: z.enum(["clean", "blocked"]),
  inputSha256: sha,
  reportSha256: sha,
  sourceCounts: countMapSchema,
  canonicalCounts: countMapSchema,
  actualTargetCounts: countMapSchema,
  exactDuplicatesAliased: countMapSchema,
  preservedVariants: countMapSchema,
  provenance: provenanceSummarySchema,
  bodyAliases: z.array(bodyAliasSchema),
  canonicalAliases: canonicalAliasesSchema,
  duplicateCandidates: z.array(duplicateCandidateSummarySchema),
  unresolvedDuplicateCandidates: z.array(duplicateCandidateSummarySchema),
  lineageEdges: z.array(lineageSchema),
  reconciliation: reconciliationSummarySchema,
  shards: z.object({
    shardCount: z.number().int().min(1).max(99),
    perShardItemCounts: countMapSchema,
    itemCount: z.number().int().nonnegative(),
    completeDisjointUnion: z.boolean(),
  }).strict(),
  expected: z.object({
    canonicalObjects: z.array(canonicalObjectSchema),
    sparsePostings: z.array(sparsePostingSchema),
    denseCandidates: z.array(denseCandidateSchema),
    releaseItems: z.array(releaseItemSchema),
  }).strict(),
  restart: z.object({
    idempotent: z.literal(true),
    resumedAfterPartialFailure: z.boolean(),
  }).strict(),
}).strict();

export type MigrationReconciliationReport = z.infer<typeof migrationReconciliationReportSchema>;

async function canonicalize(input: Inventory): Promise<Canonicalized> {
  const initialHashMismatches: string[] = [];
  const initialMetadataMismatches: string[] = [];
  const missingProvenance: string[] = [];
  for (const [kind, rows] of Object.entries({
    source_document: input.sourceDocuments,
    raw_capture: input.rawCaptures,
    normalized_revision: input.normalizedRevisions,
    provision_rendition: input.provisionRenditions,
    chunk: input.chunks,
    sparse_posting: input.sparsePostings,
    dense_candidate: input.denseCandidates,
    release_item: input.releaseItems,
    authority_evidence: input.authorityEvidenceRecords,
    applicability_evidence: input.applicabilityEvidenceRecords,
    provenance_record: input.provenanceRecords,
    audit_relationship: input.auditRelationships,
  })) {
    const bySourceId = new Map<string, string>();
    for (const row of rows) {
      const identity = stable(row);
      const existing = bySourceId.get(row.sourceId);
      if (existing !== undefined && existing !== identity) {
        initialMetadataMismatches.push(`${kind}_source_identity:${row.sourceId}`);
      }
      bySourceId.set(row.sourceId, identity);
    }
  }
  const instrumentTokenBySourceIdentity = new Map<string, string>();
  const knownInstrumentTokens = new Set<string>();
  for (const row of input.sourceDocuments) {
    const existing = instrumentTokenBySourceIdentity.get(row.legalInstrumentId);
    if (existing && existing !== row.publisherInstrumentToken) {
      initialMetadataMismatches.push(`legal_instrument_token:${row.legalInstrumentId}`);
    }
    instrumentTokenBySourceIdentity.set(row.legalInstrumentId, row.publisherInstrumentToken);
    knownInstrumentTokens.add(row.publisherInstrumentToken);
  }
  for (const row of input.rawCaptures) {
    if (!instrumentTokenBySourceIdentity.has(row.legalInstrumentId)) {
      initialMetadataMismatches.push(`raw_capture_missing_instrument:${row.captureId}`);
      missingProvenance.push(`raw_capture_to_instrument:${row.captureId}`);
    }
  }
  const captureById = new Map(input.rawCaptures.map((row) => [row.captureId, row]));
  const revisionByInputId = new Map(input.normalizedRevisions.map((row) => [row.textRevisionId, row]));
  const authorityEvidenceByRevision = new Map<string, Inventory["authorityEvidenceRecords"]>();
  for (const row of input.authorityEvidenceRecords) {
    const rows = authorityEvidenceByRevision.get(row.textRevisionId) ?? [];
    rows.push(row);
    authorityEvidenceByRevision.set(row.textRevisionId, rows);
    const capture = captureById.get(row.captureId);
    if (!capture || capture.sha256 !== row.sha256) {
      missingProvenance.push(`authority_evidence_capture:${row.authorityEvidenceId}->${row.captureId}`);
    }
  }
  const isAuthorityEvidenceValidForRevision = (
    revision: Inventory["normalizedRevisions"][number],
    evidence: Inventory["authorityEvidenceRecords"][number],
  ): boolean => {
    const capture = captureById.get(evidence.captureId);
    return evidence.officialExpressionId === revision.officialExpressionId
      && revision.captureIds.includes(evidence.captureId)
      && evidence.textualAuthority === revision.textualAuthority
      && capture?.sha256 === evidence.sha256
      && instrumentTokenBySourceIdentity.get(capture.legalInstrumentId)
        === revision.publisherInstrumentToken;
  };
  for (const row of input.normalizedRevisions) {
    if (!knownInstrumentTokens.has(row.publisherInstrumentToken)) {
      initialMetadataMismatches.push(`normalized_revision_missing_instrument:${row.textRevisionId}`);
    }
    for (const captureId of row.captureIds) {
      const capture = captureById.get(captureId);
      if (!capture || instrumentTokenBySourceIdentity.get(capture.legalInstrumentId)
        !== row.publisherInstrumentToken) {
        missingProvenance.push(`capture_to_revision:${captureId}->${row.textRevisionId}`);
      }
    }
    if (!(authorityEvidenceByRevision.get(row.textRevisionId) ?? [])
      .some((evidence) => isAuthorityEvidenceValidForRevision(row, evidence))) {
      missingProvenance.push(`authority_evidence_revision:${row.officialExpressionId}->${row.textRevisionId}`);
    }
  }
  for (const row of input.authorityEvidenceRecords) {
    const revision = revisionByInputId.get(row.textRevisionId);
    if (!revision) {
      missingProvenance.push(`authority_evidence_revision_orphan:${row.authorityEvidenceId}`);
      continue;
    }
    if (row.officialExpressionId !== revision.officialExpressionId
      || !revision.captureIds.includes(row.captureId)
      || row.textualAuthority !== revision.textualAuthority) {
      initialMetadataMismatches.push(`authority_evidence_fact:${row.authorityEvidenceId}`);
    }
  }
  const revisionByIdentity = new Map(input.normalizedRevisions
    .map((row) => [row.textRevisionId, row]));
  for (const row of input.provisionRenditions) {
    const revision = revisionByIdentity.get(row.textRevisionId);
    if (!revision) missingProvenance.push(`revision_to_rendition:${row.textRevisionId}->${row.provisionRenditionId}`);
    if (instrumentTokenBySourceIdentity.get(row.legalInstrumentId) !== row.publisherInstrumentToken) {
      initialMetadataMismatches.push(`rendition_instrument_identity:${row.provisionRenditionId}`);
    }
    if (revision && (revision.publisherInstrumentToken !== row.publisherInstrumentToken
      || revision.language !== row.language || revision.script !== row.script
      || revision.textualAuthority !== row.textualAuthority)) {
      initialMetadataMismatches.push(`rendition_revision_identity:${row.provisionRenditionId}`);
    }
    if (!input.applicabilityEvidenceRecords.some((evidence) =>
      evidence.provisionRenditionId === row.provisionRenditionId)) {
      missingProvenance.push(`applicability_evidence_rendition:${row.provisionRenditionId}`);
    }
    if (!input.provenanceRecords.some((record) => record.textRevisionId === row.textRevisionId
      && record.provisionRenditionId === row.provisionRenditionId
      && Boolean(revision?.captureIds.includes(record.captureId)))) {
      missingProvenance.push(`provenance_record_rendition:${row.provisionRenditionId}`);
    }
  }
  for (const row of input.applicabilityEvidenceRecords) {
    const rendition = input.provisionRenditions.find((candidate) =>
      candidate.provisionRenditionId === row.provisionRenditionId);
    if (!rendition) {
      missingProvenance.push(`applicability_evidence_orphan:${row.applicabilityEvidenceId}`);
      continue;
    }
    const intervalIdentity = `${row.validFrom}/${row.validTo ?? ""}`;
    if (row.applicabilityIdentity !== intervalIdentity
      || row.applicabilityIdentity !== rendition.applicabilityIdentity) {
      initialMetadataMismatches.push(`applicability_evidence_fact:${row.applicabilityEvidenceId}`);
    }
  }
  for (const row of input.provenanceRecords) {
    const revision = revisionByIdentity.get(row.textRevisionId);
    const rendition = input.provisionRenditions.find((candidate) =>
      candidate.provisionRenditionId === row.provisionRenditionId);
    if (!revision || !rendition || rendition.textRevisionId !== row.textRevisionId
      || !revision.captureIds.includes(row.captureId)) {
      missingProvenance.push(`provenance_record_invalid:${row.provenanceRecordId}`);
    }
  }
  const revisionNatural = new Map<string, z.infer<typeof revisionSchema>>();
  const revisionBySourceId = new Map<string, TextRevisionId>();
  for (const row of sorted(input.normalizedRevisions)) {
    const natural = [row.publisherInstrumentToken, row.language, row.script,
      row.textualAuthority, row.publisherRevisionToken].join("|");
    const existing = revisionNatural.get(natural);
    if (existing && existing.sha256 !== row.sha256) {
      initialHashMismatches.push(`normalized_revision:${natural}`);
      revisionBySourceId.set(row.textRevisionId,
        textRevisionIdSchema.parse(`revision:${await digest(`${natural}|${row.sourceId}`)}`));
      continue;
    }
    if (existing && (existing.language !== row.language || existing.script !== row.script
      || existing.textualAuthority !== row.textualAuthority)) {
      initialMetadataMismatches.push(`normalized_revision:${natural}`);
      revisionBySourceId.set(row.textRevisionId,
        textRevisionIdSchema.parse(`revision:${await digest(`${natural}|${row.sourceId}`)}`));
      continue;
    }
    if (!existing) revisionNatural.set(natural, row);
    revisionBySourceId.set(row.textRevisionId,
      textRevisionIdSchema.parse(`revision:${await digest(natural)}`));
  }

  const conceptContext = new Map<string, {
    legalInstrumentId: string;
    publisherInstrumentToken: string;
    publisherConceptToken: string;
  }>();
  const conceptBySourceId = new Map<string, ProvisionConceptId>();
  for (const row of sorted(input.provisionRenditions)) {
    const existing = conceptContext.get(row.provisionConceptId);
    if (existing && (existing.legalInstrumentId !== row.legalInstrumentId
      || existing.publisherInstrumentToken !== row.publisherInstrumentToken
      || existing.publisherConceptToken !== row.publisherConceptToken)) {
      initialMetadataMismatches.push(`provision_concept_instrument:${row.provisionConceptId}`);
    } else if (!existing) {
      conceptContext.set(row.provisionConceptId, {
        legalInstrumentId: row.legalInstrumentId,
        publisherInstrumentToken: row.publisherInstrumentToken,
        publisherConceptToken: row.publisherConceptToken,
      });
    }
    conceptBySourceId.set(row.provisionConceptId, provisionConceptIdSchema.parse(
      `concept:${await digest(`${row.publisherInstrumentToken}|${row.publisherConceptToken}`)}`,
    ));
  }
  for (const edge of input.lineageEdges) {
    if (!conceptBySourceId.has(edge.predecessorConceptId)
      || (edge.successorConceptId !== null && !conceptBySourceId.has(edge.successorConceptId))) {
      missingProvenance.push(`lineage_concept:${edge.id}`);
    }
  }

  const renditionNatural = new Map<string, z.infer<typeof renditionSchema>>();
  const renditionBySourceId = new Map<string, ProvisionRenditionId>();
  const renditionFingerprint = new Map<string, string>();
  for (const row of sorted(input.provisionRenditions)) {
    const revisionId = revisionBySourceId.get(row.textRevisionId);
    if (!revisionId) {
      initialMetadataMismatches.push(`rendition_missing_revision:${row.provisionRenditionId}`);
      continue;
    }
    const conceptId = conceptBySourceId.get(row.provisionConceptId);
    if (!conceptId) {
      initialMetadataMismatches.push(`rendition_missing_concept:${row.provisionRenditionId}`);
      continue;
    }
    const natural = [row.publisherInstrumentToken, conceptId, row.publisherProvisionToken,
      revisionId, row.language,
      row.script, row.textualAuthority, row.applicabilityIdentity].join("|");
    const existing = renditionNatural.get(natural);
    let canonical = provisionRenditionIdSchema.parse(`rendition:${await digest(natural)}`);
    if (existing && existing.sha256 !== row.sha256) {
      initialHashMismatches.push(`provision_rendition:${natural}`);
      canonical = provisionRenditionIdSchema.parse(`rendition:${await digest(`${natural}|${row.sourceId}`)}`);
    } else if (existing && existing.semanticFingerprint !== row.semanticFingerprint) {
      initialMetadataMismatches.push(`provision_rendition_semantic_fingerprint:${natural}`);
    } else if (!existing) renditionNatural.set(natural, row);
    renditionBySourceId.set(row.provisionRenditionId, canonical);
    if (!renditionFingerprint.has(canonical)) {
      renditionFingerprint.set(canonical, row.semanticFingerprint);
    }
  }

  const chunkNatural = new Map<string, {
    canonical: CanonicalChunk;
    natural: string;
  }>();
  const chunkBySourceId = new Map<string, CanonicalChunkId>();
  for (const row of sorted(input.chunks)) {
    const renditionId = renditionBySourceId.get(row.provisionRenditionId);
    if (!renditionId) {
      initialMetadataMismatches.push(`chunk_missing_rendition:${row.chunkId}`);
      missingProvenance.push(`rendition_to_chunk:${row.provisionRenditionId}->${row.chunkId}`);
      continue;
    }
    if (!input.auditRelationships.some((edge) => edge.fromId === row.provisionRenditionId
      && edge.toId === row.chunkId)) {
      missingProvenance.push(`audit_relationship_chunk:${row.provisionRenditionId}->${row.chunkId}`);
    }
    const natural = `${renditionId}|${row.ordinal}`;
    const existing = chunkNatural.get(natural);
    let canonicalId = canonicalChunkIdSchema.parse(`chunk:${await digest(natural)}`);
    const canonicalRenditionId = provisionRenditionIdSchema.parse(renditionId);
    if (existing && existing.canonical.sha256 !== row.sha256) {
      initialHashMismatches.push(`chunk:${natural}`);
      canonicalId = canonicalChunkIdSchema.parse(`chunk:${await digest(`${natural}|${row.sourceId}`)}`);
      chunkNatural.set(`${natural}|${row.sourceId}`, {
        natural,
        canonical: {
          id: canonicalId,
          provisionRenditionId: canonicalRenditionId,
          sourceIds: [row.sourceId],
          sourceChunkIds: [row.chunkId],
          sha256: row.sha256,
          byteCount: row.byteCount,
          capabilities: [...new Set(row.capabilities)].sort(),
        },
      });
    } else if (existing) {
      if (existing.canonical.byteCount !== row.byteCount) {
        initialMetadataMismatches.push(`chunk_byte_count:${natural}`);
      }
      existing.canonical.sourceIds.push(row.sourceId);
      existing.canonical.sourceChunkIds.push(row.chunkId);
      existing.canonical.capabilities = [...new Set([
        ...existing.canonical.capabilities,
        ...row.capabilities,
      ])].sort();
    } else {
      chunkNatural.set(natural, {
        natural,
        canonical: {
          id: canonicalId,
          provisionRenditionId: canonicalRenditionId,
          sourceIds: [row.sourceId],
          sourceChunkIds: [row.chunkId],
          sha256: row.sha256,
          byteCount: row.byteCount,
          capabilities: [...new Set(row.capabilities)].sort(),
        },
      });
    }
    chunkBySourceId.set(row.chunkId, canonicalId);
  }
  for (const row of input.auditRelationships) {
    const chunk = input.chunks.find((candidate) => candidate.chunkId === row.toId);
    if (!chunk || chunk.provisionRenditionId !== row.fromId) {
      missingProvenance.push(`audit_relationship_invalid:${row.auditRelationshipId}`);
    }
  }
  const chunks = [...chunkNatural.values()].map(({ canonical }) => canonical)
    .sort((left, right) => left.id.localeCompare(right.id));
  const authoritySupportedRevisionIds = new Set(input.normalizedRevisions
    .filter((revision) => {
      const evidence = authorityEvidenceByRevision.get(revision.textRevisionId) ?? [];
      return revision.textualAuthority !== "unknown" && evidence.length > 0
        && evidence.every((row) => isAuthorityEvidenceValidForRevision(revision, row));
    })
    .map((revision) => revision.textRevisionId));
  const projectionSupportedRenditionIds = new Set(input.provisionRenditions
    .filter((rendition) => {
      const revision = revisionByIdentity.get(rendition.textRevisionId);
      return rendition.textualAuthority !== "unknown"
        && revision?.textualAuthority === rendition.textualAuthority
        && authoritySupportedRevisionIds.has(rendition.textRevisionId);
    })
    .map((rendition) => rendition.provisionRenditionId));
  const projectionEligibleChunkIds = new Set(input.chunks
    .filter((chunk) => chunk.capabilities.includes(input.capability)
      && projectionSupportedRenditionIds.has(chunk.provisionRenditionId))
    .flatMap((chunk) => {
      const canonicalId = chunkBySourceId.get(chunk.chunkId);
      return canonicalId ? [canonicalId] : [];
    }));

  const fingerprints = new Map<string, Set<string>>();
  for (const [canonical, fingerprint] of renditionFingerprint) {
    const group = fingerprints.get(fingerprint) ?? new Set<string>();
    group.add(canonical);
    fingerprints.set(fingerprint, group);
  }
  const reviews = new Map(input.duplicateReviews.map((review) => [review.semanticFingerprint, review]));
  const duplicateCandidates = [...fingerprints.entries()]
    .filter(([, identities]) => identities.size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([semanticFingerprint, identities]) => {
      const review = reviews.get(semanticFingerprint);
      return {
        semanticFingerprint,
        canonicalIdentities: [...identities].sort(),
        reviewState: review ? "reviewed" as const : "unresolved" as const,
        decision: review?.decision ?? null,
        evidenceUrl: review?.evidenceUrl ?? null,
        reviewedBy: review?.reviewedBy ?? null,
        reviewedAt: review?.reviewedAt ?? null,
      };
    });

  const instrumentCount = new Set(input.sourceDocuments
    .map((row) => row.publisherInstrumentToken)).size;
  const rawBodyCount = new Set(input.rawCaptures.map((row) => row.sha256)).size;
  const sourceUrls = [...new Set([
    ...input.sourceDocuments.flatMap((row) => [row.sourceUrl,
      ...(row.redirectedTo ? [row.redirectedTo] : [])]),
    ...input.authorityEvidenceRecords.map((row) => row.evidenceUrl),
    ...input.applicabilityEvidenceRecords.map((row) => row.evidenceUrl),
    ...input.provenanceRecords.map((row) => row.evidenceUrl),
    ...input.auditRelationships.map((row) => row.evidenceUrl),
  ])].sort();
  const captureIds = [...new Set(input.rawCaptures.map((row) => row.captureId))].sort();
  const bodyAliases = sorted(input.rawCaptures).map((row) => ({
    sourceId: row.sourceId,
    captureId: row.captureId,
    legalInstrumentId: row.legalInstrumentId,
    sourceUrl: row.sourceUrl,
    capturedAt: row.capturedAt,
    sha256: row.sha256,
    canonicalLocator: `corpus/content/sha256/${row.sha256.slice(0, 2)}/${row.sha256}`,
  }));
  const canonicalAliases = {
    normalizedRevisions: sorted(input.normalizedRevisions).map((row) => ({
      sourceId: row.sourceId,
      sourceIdentity: row.textRevisionId,
      canonicalIdentity: revisionBySourceId.get(row.textRevisionId)!,
    })),
    provisionConcepts: [...conceptBySourceId.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceIdentity, canonicalIdentity]) => ({
        sourceId: `concept:${sourceIdentity}`,
        sourceIdentity: provisionConceptIdSchema.parse(sourceIdentity),
        canonicalIdentity,
      })),
    provisionRenditions: sorted(input.provisionRenditions).flatMap((row) => {
      const canonicalIdentity = renditionBySourceId.get(row.provisionRenditionId);
      return canonicalIdentity ? [{
        sourceId: row.sourceId,
        sourceIdentity: row.provisionRenditionId,
        canonicalIdentity,
      }] : [];
    }),
    chunks: sorted(input.chunks).flatMap((row) => {
      const canonicalIdentity = chunkBySourceId.get(row.chunkId);
      return canonicalIdentity ? [{
        sourceId: row.sourceId,
        sourceIdentity: row.chunkId,
        canonicalIdentity,
      }] : [];
    }),
  };
  const canonicalRenditions = new Set(renditionBySourceId.values()).size;
  const sparseIdentities = input.sparsePostings.map((row) =>
    `${chunkBySourceId.get(row.chunkId) ?? row.chunkId}|${row.termHash}`);
  const denseIdentities = input.denseCandidates.map((row) =>
    `${chunkBySourceId.get(row.chunkId) ?? row.chunkId}|${row.projection}`);
  const releaseIdentities = input.releaseItems.map((row) =>
    [chunkBySourceId.get(row.chunkId) ?? row.chunkId, row.releaseId, row.capability,
      renditionBySourceId.get(row.provisionRenditionId) ?? row.provisionRenditionId,
      row.itemKey, row.shardId, row.r2Key, row.byteCount, row.sha256].join("|"));
  return {
    revisionBySourceId,
    conceptBySourceId,
    renditionBySourceId,
    chunkBySourceId,
    chunks,
    projectionEligibleChunkIds,
    sourceCounts: {
      sourceDocuments: input.sourceDocuments.length,
      rawCaptures: input.rawCaptures.length,
      normalizedRevisions: input.normalizedRevisions.length,
      provisionConcepts: conceptBySourceId.size,
      provisionRenditions: input.provisionRenditions.length,
      chunks: input.chunks.length,
      sparsePostings: input.sparsePostings.length,
      denseCandidates: input.denseCandidates.length,
      releaseItems: input.releaseItems.length,
      lineageEdges: input.lineageEdges.length,
      authorityEvidenceRecords: input.authorityEvidenceRecords.length,
      applicabilityEvidenceRecords: input.applicabilityEvidenceRecords.length,
      provenanceRecords: input.provenanceRecords.length,
      auditRelationships: input.auditRelationships.length,
    },
    canonicalCounts: {
      legalInstruments: instrumentCount,
      rawCaptures: new Set(input.rawCaptures.map((row) => row.captureId)).size,
      immutableBodies: rawBodyCount,
      normalizedRevisions: new Set(revisionBySourceId.values()).size,
      provisionConcepts: new Set(conceptBySourceId.values()).size,
      provisionRenditions: canonicalRenditions,
      chunks: chunks.length,
      sparsePostings: projectionEligibleChunkIds.size,
      denseCandidates: projectionEligibleChunkIds.size,
      releaseItems: projectionEligibleChunkIds.size,
      lineageEdges: input.lineageEdges.length,
      authorityEvidenceRecords: new Set(input.authorityEvidenceRecords
        .map((row) => row.authorityEvidenceId)).size,
      applicabilityEvidenceRecords: new Set(input.applicabilityEvidenceRecords
        .map((row) => row.applicabilityEvidenceId)).size,
      provenanceRecords: new Set(input.provenanceRecords.map((row) => row.provenanceRecordId)).size,
      auditRelationships: new Set(input.auditRelationships.map((row) => row.auditRelationshipId)).size,
    },
    exactDuplicatesAliased: {
      sourceDocuments: input.sourceDocuments.length - instrumentCount,
      immutableBodies: input.rawCaptures.length - rawBodyCount,
      normalizedRevisions: input.normalizedRevisions.length - new Set(revisionBySourceId.values()).size,
      provisionConcepts: conceptBySourceId.size - new Set(conceptBySourceId.values()).size,
      provisionRenditions: input.provisionRenditions.length - canonicalRenditions,
      chunks: input.chunks.length - chunks.length,
      sparsePostings: sparseIdentities.length - new Set(sparseIdentities).size,
      denseCandidates: denseIdentities.length - new Set(denseIdentities).size,
      releaseItems: releaseIdentities.length - new Set(releaseIdentities).size,
      authorityEvidenceRecords: input.authorityEvidenceRecords.length - new Set(input.authorityEvidenceRecords
        .map((row) => row.authorityEvidenceId)).size,
      applicabilityEvidenceRecords: input.applicabilityEvidenceRecords.length - new Set(input.applicabilityEvidenceRecords
        .map((row) => row.applicabilityEvidenceId)).size,
      provenanceRecords: input.provenanceRecords.length - new Set(input.provenanceRecords
        .map((row) => row.provenanceRecordId)).size,
      auditRelationships: input.auditRelationships.length - new Set(input.auditRelationships
        .map((row) => row.auditRelationshipId)).size,
    },
    preservedVariants: {
      languages: new Set(input.normalizedRevisions.map((row) => row.language)).size,
      scripts: new Set(input.normalizedRevisions.map((row) => row.script)).size,
      textualAuthorities: new Set(input.normalizedRevisions.map((row) => row.textualAuthority)).size,
      publisherRevisions: revisionNatural.size,
      legalInstruments: instrumentCount,
      provisionConcepts: new Set(conceptBySourceId.values()).size,
    },
    provenance: {
      sourceUrls,
      captureIds,
      captureToRevision: input.normalizedRevisions.flatMap((row) => row.captureIds.map((captureId) =>
        `${captureId}->${row.textRevisionId}`)).sort(),
      revisionToRendition: input.provisionRenditions.map((row) =>
        `${row.textRevisionId}->${row.provisionRenditionId}`).sort(),
      renditionToChunk: input.chunks.map((row) =>
        `${row.provisionRenditionId}->${row.chunkId}`).sort(),
      chunkToSparsePosting: input.sparsePostings.map((row) =>
        `${row.chunkId}->${row.sourceId}`).sort(),
      chunkToDenseCandidate: input.denseCandidates.map((row) =>
        `${row.chunkId}->${row.sourceId}`).sort(),
      chunkToReleaseItem: input.releaseItems.map((row) =>
        `${row.chunkId}->${row.sourceId}`).sort(),
      authorityEvidence: input.authorityEvidenceRecords.map((row) =>
        `${row.authorityEvidenceId}:${row.officialExpressionId}:${row.textRevisionId}:${row.captureId}:${row.textualAuthority}`).sort(),
      applicabilityEvidence: input.applicabilityEvidenceRecords.map((row) =>
        `${row.applicabilityEvidenceId}:${row.provisionRenditionId}`).sort(),
      provenanceRecords: input.provenanceRecords.map((row) =>
        `${row.provenanceRecordId}:${row.captureId}->${row.textRevisionId}->${row.provisionRenditionId}`).sort(),
      auditRelationships: input.auditRelationships.map((row) =>
        `${row.auditRelationshipId}:${row.fromId}->${row.toId}:${row.relationship}`).sort(),
    },
    bodyAliases,
    canonicalAliases,
    duplicateCandidates,
    lineageEdges: input.lineageEdges.map((edge) => ({
      ...edge,
      predecessorConceptId: conceptBySourceId.get(edge.predecessorConceptId)
        ?? edge.predecessorConceptId,
      successorConceptId: edge.successorConceptId === null ? null
        : conceptBySourceId.get(edge.successorConceptId) ?? edge.successorConceptId,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    initialHashMismatches,
    initialMetadataMismatches,
    missingProvenance,
  };
}

async function expectedProjections(input: Inventory, canonical: Canonicalized): Promise<{
  canonicalObjects: ExpectedCanonicalObject[];
  sparsePostings: ExpectedSparse[];
  denseCandidates: ExpectedDense[];
  releaseItems: ExpectedItem[];
  shardCounts: Record<string, number>;
}> {
  const canonicalObjects = new Map<string, ExpectedCanonicalObject>();
  for (const row of sorted(input.sourceDocuments)) {
    const canonicalIdentity = `instrument:${await digest(row.publisherInstrumentToken)}`;
    canonicalObjects.set(`legal_instrument:${canonicalIdentity}`, {
      kind: "legal_instrument",
      canonicalIdentity,
      sha256: null,
      metadataSha256: await digest(stable({
        publisherInstrumentToken: row.publisherInstrumentToken,
      })),
    });
  }
  for (const alias of canonical.canonicalAliases.provisionConcepts) {
    const rendition = input.provisionRenditions.find((row) =>
      row.provisionConceptId === alias.sourceIdentity)!;
    canonicalObjects.set(`provision_concept:${alias.canonicalIdentity}`, {
      kind: "provision_concept",
      canonicalIdentity: alias.canonicalIdentity,
      sha256: null,
      metadataSha256: await digest(stable({
        publisherInstrumentToken: rendition.publisherInstrumentToken,
        publisherConceptToken: rendition.publisherConceptToken,
      })),
    });
  }
  for (const row of sorted(input.authorityEvidenceRecords)) {
    canonicalObjects.set(`authority_evidence:${row.authorityEvidenceId}`, {
      kind: "authority_evidence",
      canonicalIdentity: row.authorityEvidenceId,
      sha256: row.sha256,
      metadataSha256: await digest(stable({
        officialExpressionId: row.officialExpressionId,
        captureId: row.captureId,
        textRevisionId: canonical.revisionBySourceId.get(row.textRevisionId),
        textualAuthority: row.textualAuthority,
        evidenceUrl: row.evidenceUrl,
        recordedAt: row.recordedAt,
      })),
    });
  }
  for (const row of sorted(input.applicabilityEvidenceRecords)) {
    canonicalObjects.set(`applicability_evidence:${row.applicabilityEvidenceId}`, {
      kind: "applicability_evidence",
      canonicalIdentity: row.applicabilityEvidenceId,
      sha256: null,
      metadataSha256: await digest(stable({
        provisionRenditionId: canonical.renditionBySourceId.get(row.provisionRenditionId),
        applicabilityIdentity: row.applicabilityIdentity,
        evidenceUrl: row.evidenceUrl,
        validFrom: row.validFrom,
        validTo: row.validTo,
        recordedAt: row.recordedAt,
      })),
    });
  }
  for (const row of sorted(input.provenanceRecords)) {
    canonicalObjects.set(`provenance_record:${row.provenanceRecordId}`, {
      kind: "provenance_record",
      canonicalIdentity: row.provenanceRecordId,
      sha256: null,
      metadataSha256: await digest(stable({
        captureId: row.captureId,
        textRevisionId: canonical.revisionBySourceId.get(row.textRevisionId),
        provisionRenditionId: canonical.renditionBySourceId.get(row.provisionRenditionId),
        evidenceUrl: row.evidenceUrl,
        recordedAt: row.recordedAt,
      })),
    });
  }
  for (const row of sorted(input.auditRelationships)) {
    canonicalObjects.set(`audit_relationship:${row.auditRelationshipId}`, {
      kind: "audit_relationship",
      canonicalIdentity: row.auditRelationshipId,
      sha256: null,
      metadataSha256: await digest(stable({
        fromKind: row.fromKind,
        fromId: canonical.renditionBySourceId.get(row.fromId),
        toKind: row.toKind,
        toId: canonical.chunkBySourceId.get(row.toId),
        relationship: row.relationship,
        evidenceUrl: row.evidenceUrl,
        recordedAt: row.recordedAt,
      })),
    });
  }
  for (const row of sorted(input.rawCaptures)) {
    canonicalObjects.set(`capture_record:${row.captureId}`, {
      kind: "capture_record",
      canonicalIdentity: row.captureId,
      sha256: row.sha256,
      metadataSha256: await digest(stable({
        legalInstrumentId: row.legalInstrumentId,
        sourceUrl: row.sourceUrl,
        capturedAt: row.capturedAt,
      })),
    });
    const canonicalIdentity = `corpus/content/sha256/${row.sha256.slice(0, 2)}/${row.sha256}`;
    canonicalObjects.set(`immutable_body:${canonicalIdentity}`, {
      kind: "immutable_body",
      canonicalIdentity,
      sha256: row.sha256,
      metadataSha256: await digest("raw_capture:v1"),
    });
  }
  for (const row of sorted(input.normalizedRevisions)) {
    const canonicalIdentity = canonical.revisionBySourceId.get(row.textRevisionId);
    if (!canonicalIdentity) continue;
    const key = `normalized_revision:${canonicalIdentity}`;
    if (!canonicalObjects.has(key)) canonicalObjects.set(key, {
      kind: "normalized_revision",
      canonicalIdentity,
      sha256: row.sha256,
      metadataSha256: await digest(stable({
        publisherInstrumentToken: row.publisherInstrumentToken,
        publisherRevisionToken: row.publisherRevisionToken,
        language: row.language,
        script: row.script,
        textualAuthority: row.textualAuthority,
      })),
    });
  }
  for (const row of sorted(input.provisionRenditions)) {
    const canonicalIdentity = canonical.renditionBySourceId.get(row.provisionRenditionId);
    if (!canonicalIdentity) continue;
    const key = `provision_rendition:${canonicalIdentity}`;
    if (!canonicalObjects.has(key)) canonicalObjects.set(key, {
      kind: "provision_rendition",
      canonicalIdentity,
      sha256: row.sha256,
      metadataSha256: await digest(stable({
        publisherInstrumentToken: row.publisherInstrumentToken,
        publisherConceptToken: row.publisherConceptToken,
        publisherProvisionToken: row.publisherProvisionToken,
        provisionConceptId: canonical.conceptBySourceId.get(row.provisionConceptId),
        textRevisionId: canonical.revisionBySourceId.get(row.textRevisionId),
        language: row.language,
        script: row.script,
        textualAuthority: row.textualAuthority,
        applicabilityIdentity: row.applicabilityIdentity,
        semanticFingerprint: row.semanticFingerprint,
      })),
    });
  }
  for (const row of sorted(input.chunks)) {
    const canonicalIdentity = canonical.chunkBySourceId.get(row.chunkId);
    if (!canonicalIdentity) continue;
    const key = `chunk:${canonicalIdentity}`;
    if (!canonicalObjects.has(key)) canonicalObjects.set(key, {
      kind: "chunk",
      canonicalIdentity,
      sha256: row.sha256,
      metadataSha256: await digest(stable({
        provisionRenditionId: canonical.renditionBySourceId.get(row.provisionRenditionId),
        ordinal: row.ordinal,
        capabilities: [...new Set(row.capabilities)].sort(),
      })),
    });
  }
  const eligible = canonical.chunks.filter((chunk) =>
    canonical.projectionEligibleChunkIds.has(chunk.id));
  const rows = await Promise.all(eligible.map(async (chunk) => {
    const bucket = Number.parseInt((await digest(chunk.id)).slice(0, 8), 16) % input.shardCount;
    const shardId = String(bucket).padStart(2, "0");
    return {
      sparse: {
        sourceId: `expected:sparse:${chunk.id}`,
        chunkId: chunk.id,
        termHash: chunk.sha256,
      },
      dense: {
        sourceId: `expected:dense:${chunk.id}`,
        chunkId: chunk.id,
        projection: input.capability,
        providerId: `canonical:${chunk.id}`,
      },
      item: {
        sourceId: `expected:release:${chunk.id}`,
        itemKey: `search-releases/${input.releaseId}/${input.capability}/${shardId}/${chunk.id}.md`,
        releaseId: input.releaseId,
        capability: input.capability,
        chunkId: chunk.id,
        provisionRenditionId: chunk.provisionRenditionId,
        shardId,
        r2Key: `search-releases/${input.releaseId}/${input.capability}/${shardId}/${chunk.id}.md`,
        byteCount: chunk.byteCount,
        sha256: chunk.sha256,
      },
    };
  }));
  const releaseItems = rows.map(({ item }) => item).sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  const shardCounts: Record<string, number> = {};
  for (const item of releaseItems) shardCounts[item.shardId] = (shardCounts[item.shardId] ?? 0) + 1;
  return {
    canonicalObjects: [...canonicalObjects.values()].sort((left, right) =>
      left.kind.localeCompare(right.kind)
      || left.canonicalIdentity.localeCompare(right.canonicalIdentity)),
    sparsePostings: rows.map(({ sparse }) => sparse).sort((a, b) => a.chunkId.localeCompare(b.chunkId)),
    denseCandidates: rows.map(({ dense }) => dense).sort((a, b) => a.chunkId.localeCompare(b.chunkId)),
    releaseItems,
    shardCounts,
  };
}

function actualChunkId(canonical: Canonicalized, idValue: CanonicalChunkId): CanonicalChunkId {
  return canonical.chunkBySourceId.get(idValue) ?? idValue;
}

export async function prepareCorpusMigrationProjections(
  untrustedInventory: CorpusMigrationInventory,
): Promise<MigrationReconciliationReport["expected"]> {
  const input = inventorySchema.parse(untrustedInventory);
  const canonical = await canonicalize(input);
  const expected = await expectedProjections(input, canonical);
  return {
    canonicalObjects: expected.canonicalObjects,
    sparsePostings: expected.sparsePostings,
    denseCandidates: expected.denseCandidates,
    releaseItems: expected.releaseItems,
  };
}

export async function reconcileCorpusMigration(
  dependencies: { db: D1Database },
  untrustedInventory: CorpusMigrationInventory,
  options: {
    failAfterPhase?: "canonicalized";
  } = {},
): Promise<MigrationReconciliationReport> {
  const input = inventorySchema.parse(untrustedInventory);
  const inputSha256 = await digest(stable(input));
  const existing = await dependencies.db.prepare(`SELECT input_sha256 AS inputSha256,
      report_json AS reportJson FROM legal_migration_reconciliation_reports WHERE run_id=?`)
    .bind(input.runId).first<{ inputSha256: string; reportJson: string }>();
  if (existing) {
    if (existing.inputSha256 !== inputSha256) {
      throw new MigrationReconciliationError("MIGRATION_RECONCILIATION_IDENTITY_CONFLICT");
    }
    return migrationReconciliationReportSchema.parse(
      JSON.parse(existing.reportJson) as unknown,
    );
  }
  const priorCheckpoint = await dependencies.db.prepare(`SELECT input_sha256 AS inputSha256
    FROM legal_migration_reconciliation_checkpoints WHERE run_id=? AND phase='canonicalized'`)
    .bind(input.runId).first<{ inputSha256: string }>();
  if (priorCheckpoint && priorCheckpoint.inputSha256 !== inputSha256) {
    throw new MigrationReconciliationError("MIGRATION_RECONCILIATION_IDENTITY_CONFLICT");
  }
  const canonical = await canonicalize(input);
  const completedAt = new Date().toISOString();
  await dependencies.db.prepare(`INSERT OR IGNORE INTO legal_migration_reconciliation_checkpoints
    (run_id,phase,input_sha256,completed_at) VALUES (?,'canonicalized',?,?)`).bind(
    input.runId,
    inputSha256,
    completedAt,
  ).run();
  if (options.failAfterPhase === "canonicalized") {
    throw new MigrationReconciliationError("MIGRATION_RECONCILIATION_INTERRUPTED");
  }
  const expected = await expectedProjections(input, canonical);
  const actualSparse = input.targetSparsePostings;
  const actualDense = input.targetDenseCandidates;
  const actualItems = input.targetReleaseItems;
  const missingObjects: string[] = [];
  const extraObjects: string[] = [];
  const hashMismatches = [...canonical.initialHashMismatches];
  const metadataMismatches = [...canonical.initialMetadataMismatches];
  const missingProvenance = [...canonical.missingProvenance];
  const crossReleaseContamination: string[] = [];
  const nonDisjointShardMembership: string[] = [];
  const duplicateProjectionMembership: string[] = [];

  const expectedCanonicalObjects = new Map(expected.canonicalObjects.map((row) => [
    `${row.kind}|${row.canonicalIdentity}`,
    row,
  ]));
  const actualCanonicalCounts = new Map<string, number>();
  for (const row of input.targetCanonicalObjects) {
    const key = `${row.kind}|${row.canonicalIdentity}`;
    actualCanonicalCounts.set(key, (actualCanonicalCounts.get(key) ?? 0) + 1);
    const wanted = expectedCanonicalObjects.get(key);
    if (!wanted) {
      extraObjects.push(`canonical:${key}`);
      continue;
    }
    if (row.sha256 !== wanted.sha256) hashMismatches.push(`canonical:${key}`);
    if (row.metadataSha256 !== wanted.metadataSha256) metadataMismatches.push(`canonical:${key}`);
  }
  for (const key of expectedCanonicalObjects.keys()) {
    const count = actualCanonicalCounts.get(key) ?? 0;
    if (count === 0) missingObjects.push(`canonical:${key}`);
    if (count > 1) duplicateProjectionMembership.push(`canonical:${key}`);
  }

  const compareKeys = (
    kind: string,
    expectedKeys: Set<string>,
    actualKeys: string[],
    tolerateExactSourceDuplicates = false,
  ) => {
    const counts = new Map<string, number>();
    for (const key of actualKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const key of expectedKeys) if (!counts.has(key)) missingObjects.push(`${kind}:${key}`);
    for (const [key, count] of counts) {
      if (!expectedKeys.has(key)) extraObjects.push(`${kind}:${key}`);
      if (expectedKeys.has(key) && count > 1 && !tolerateExactSourceDuplicates) {
        duplicateProjectionMembership.push(`${kind}:${key}`);
      }
    }
  };
  compareKeys("sparse", new Set(expected.sparsePostings.map((row) => `${row.chunkId}|${row.termHash}`)),
    actualSparse.map((row) => `${actualChunkId(canonical, row.chunkId)}|${row.termHash}`));
  compareKeys("dense", new Set(expected.denseCandidates.map((row) => `${row.chunkId}|${row.projection}`)),
    actualDense.map((row) => `${actualChunkId(canonical, row.chunkId)}|${row.projection}`));
  compareKeys("source_sparse",
    new Set(expected.sparsePostings.map((row) => `${row.chunkId}|${row.termHash}`)),
    input.sparsePostings.map((row) => `${actualChunkId(canonical, row.chunkId)}|${row.termHash}`),
    true);
  compareKeys("source_dense",
    new Set(expected.denseCandidates.map((row) => `${row.chunkId}|${row.projection}`)),
    input.denseCandidates.map((row) => `${actualChunkId(canonical, row.chunkId)}|${row.projection}`),
    true);

  const expectedByChunk = new Map(expected.releaseItems.map((row) => [row.chunkId, row]));
  const inspectReleaseItems = (
    kind: "release" | "source_release",
    items: Inventory["releaseItems"],
    tolerateExactSourceDuplicates: boolean,
  ) => {
    const seenMembership = new Map<string, number>();
    for (const item of items) {
      const chunkId = actualChunkId(canonical, item.chunkId);
      const wanted = expectedByChunk.get(chunkId);
      seenMembership.set(chunkId, (seenMembership.get(chunkId) ?? 0) + 1);
      if (!wanted) {
        extraObjects.push(`${kind}:${chunkId}`);
        missingProvenance.push(`${kind}_chunk:${item.chunkId}->${item.sourceId}`);
        continue;
      }
      if (item.releaseId !== input.releaseId || item.capability !== input.capability) {
        crossReleaseContamination.push(`${kind}:${item.sourceId}`);
      }
      const renditionId = canonical.renditionBySourceId.get(item.provisionRenditionId)
        ?? item.provisionRenditionId;
      if (renditionId !== wanted.provisionRenditionId) {
        metadataMismatches.push(`${kind}_rendition:${item.sourceId}`);
      }
      if (item.shardId !== wanted.shardId) {
        nonDisjointShardMembership.push(`${kind}:${item.sourceId}`);
      }
      if (item.sha256 !== wanted.sha256) hashMismatches.push(`${kind}:${item.sourceId}`);
      if (item.itemKey !== wanted.itemKey || item.r2Key !== wanted.r2Key
        || item.byteCount !== wanted.byteCount) {
        metadataMismatches.push(`${kind}_metadata:${item.sourceId}`);
      }
    }
    for (const [chunkId] of expectedByChunk) {
      const count = seenMembership.get(chunkId) ?? 0;
      if (count === 0) missingObjects.push(`${kind}:${chunkId}`);
      if (count > 1 && !tolerateExactSourceDuplicates) {
        nonDisjointShardMembership.push(`${kind}:duplicate:${chunkId}`);
        duplicateProjectionMembership.push(`${kind}:${chunkId}`);
      }
    }
  };
  inspectReleaseItems("release", actualItems, false);
  inspectReleaseItems("source_release", input.releaseItems, true);
  const knownChunks = new Set<string>(canonical.chunks.map((chunk) => chunk.id));
  for (const [kind, rows] of [
    ["source_sparse", input.sparsePostings],
    ["source_dense", input.denseCandidates],
    ["target_sparse", actualSparse],
    ["target_dense", actualDense],
  ] as const) {
    for (const row of rows) {
      if (!knownChunks.has(actualChunkId(canonical, row.chunkId))) {
        missingProvenance.push(`${kind}_chunk:${row.chunkId}->${row.sourceId}`);
      }
    }
  }
  const unresolvedDuplicateCandidates = canonical.duplicateCandidates
    .filter((candidate) => candidate.reviewState === "unresolved");
  const reconciliation = {
    missingObjects: [...new Set(missingObjects)].sort(),
    extraObjects: [...new Set(extraObjects)].sort(),
    hashMismatches: [...new Set(hashMismatches)].sort(),
    metadataMismatches: [...new Set(metadataMismatches)].sort(),
    missingProvenance: [...new Set(missingProvenance)].sort(),
    crossReleaseContamination: [...new Set(crossReleaseContamination)].sort(),
    nonDisjointShardMembership: [...new Set(nonDisjointShardMembership)].sort(),
    duplicateProjectionMembership: [...new Set(duplicateProjectionMembership)].sort(),
  };
  const blocked = Object.values(reconciliation).some((items) => items.length > 0)
    || unresolvedDuplicateCandidates.length > 0;
  const core = {
    runId: input.runId,
    environment: input.environment,
    releaseId: input.releaseId,
    capability: input.capability,
    status: blocked ? "blocked" as const : "clean" as const,
    inputSha256,
    sourceCounts: canonical.sourceCounts,
    canonicalCounts: canonical.canonicalCounts,
    actualTargetCounts: {
      canonicalObjects: input.targetCanonicalObjects.length,
      sparsePostings: actualSparse.length,
      denseCandidates: actualDense.length,
      releaseItems: actualItems.length,
    },
    exactDuplicatesAliased: canonical.exactDuplicatesAliased,
    preservedVariants: canonical.preservedVariants,
    provenance: canonical.provenance,
    bodyAliases: canonical.bodyAliases,
    canonicalAliases: canonical.canonicalAliases,
    duplicateCandidates: canonical.duplicateCandidates,
    unresolvedDuplicateCandidates,
    lineageEdges: canonical.lineageEdges,
    reconciliation,
    shards: {
      shardCount: input.shardCount,
      perShardItemCounts: expected.shardCounts,
      itemCount: expected.releaseItems.length,
      completeDisjointUnion: reconciliation.missingObjects.length === 0
        && reconciliation.extraObjects.length === 0
        && reconciliation.crossReleaseContamination.length === 0
        && reconciliation.nonDisjointShardMembership.length === 0
        && reconciliation.duplicateProjectionMembership.length === 0,
    },
    expected: {
      canonicalObjects: expected.canonicalObjects,
      sparsePostings: expected.sparsePostings,
      denseCandidates: expected.denseCandidates,
      releaseItems: expected.releaseItems,
    },
    restart: {
      idempotent: true as const,
      resumedAfterPartialFailure: priorCheckpoint !== null,
    },
  };
  const reportSha256 = await digest(stable(core));
  const report = migrationReconciliationReportSchema.parse({ ...core, reportSha256 });
  const duplicateStatements = canonical.duplicateCandidates.map((candidate) =>
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_duplicate_candidates
      (id,run_id,semantic_fingerprint,canonical_identities_json,review_state,decision,
        evidence_url,reviewed_by,reviewed_at,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      `duplicate:${input.runId}:${candidate.semanticFingerprint}`,
      input.runId,
      candidate.semanticFingerprint,
      JSON.stringify(candidate.canonicalIdentities),
      candidate.reviewState,
      candidate.decision,
      candidate.evidenceUrl,
      candidate.reviewedBy,
      candidate.reviewedAt,
      completedAt,
    ));
  await dependencies.db.batch([
    ...duplicateStatements,
    dependencies.db.prepare(`INSERT INTO legal_migration_reconciliation_reports
      (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      input.runId,
      input.environment,
      input.releaseId,
      input.capability,
      inputSha256,
      reportSha256,
      report.status,
      JSON.stringify(report),
      completedAt,
    ),
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_migration_reconciliation_checkpoints
      (run_id,phase,input_sha256,completed_at) VALUES (?,'reconciled',?,?)`).bind(
      input.runId,
      inputSha256,
      completedAt,
    ),
  ]);
  return report;
}
