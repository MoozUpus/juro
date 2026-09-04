import { z } from "zod";

import { stableSourceSnapshotJson } from "./source-snapshot";
import { legalLanguageSchema, legalScriptSchema, sha256Schema } from "./target-domain-schemas";

const encoder = new TextEncoder();

export const TICKET29_TARGET_LOCATOR_SQL = `SELECT locator.object_kind AS objectKind,
    locator.r2_key AS r2Key,locator.media_type AS mediaType,
    locator.byte_count AS byteCount,locator.sha256,
    locator.source_normalized_sha256 AS sourceNormalizedSha256
  FROM json_each(?) request
  CROSS JOIN legal_evidence_locators locator INDEXED BY legal_evidence_locator_kind_sha_idx
  WHERE locator.object_kind='raw_capture'
    AND locator.sha256=json_extract(request.value,'$.rawSha256')
  UNION ALL
  SELECT locator.object_kind AS objectKind,locator.r2_key AS r2Key,
    locator.media_type AS mediaType,locator.byte_count AS byteCount,locator.sha256,
    locator.source_normalized_sha256 AS sourceNormalizedSha256
  FROM json_each(?) request
  CROSS JOIN legal_evidence_locators locator INDEXED BY legal_evidence_locator_kind_sha_idx
  WHERE locator.object_kind='normalized_revision'
    AND locator.sha256=json_extract(request.value,'$.normalizedSha256')
  ORDER BY r2Key`;

export const TICKET29_CURRENT_LOCATOR_SQL = `SELECT
    json_extract(request.value,'$.sourceId') AS sourceId,
    locator.object_kind AS objectKind,locator.r2_key AS r2Key,
    locator.media_type AS mediaType,locator.byte_count AS byteCount,locator.sha256,
    locator.source_normalized_sha256 AS sourceNormalizedSha256
  FROM json_each(?) request
  CROSS JOIN legal_search_release_items item INDEXED BY legal_search_release_item_provision_idx
  JOIN legal_provision_renditions rendition ON rendition.id=item.provision_rendition_id
  JOIN legal_evidence_locators locator ON locator.id=rendition.locator_id
  WHERE item.search_release_id=?
    AND item.provision_rendition_id=json_extract(request.value,'$.legacyCurrentRenditionId')
  ORDER BY sourceId`;

const evidenceKindSchema = z.enum([
  "provision_rendition",
  "raw_capture",
  "normalized_revision",
  "plan",
  "manifest",
  "reconstruction",
  "corpus_snapshot",
  "qualification",
]);

export type Ticket29EvidenceKind = z.infer<typeof evidenceKindSchema>;

export type Ticket29EvidenceDescriptor = {
  key: string;
  kind: Ticket29EvidenceKind;
  mediaType: string;
  sha256: string;
  byteCount: number;
  sourceNormalizedSha256?: string;
};

type Ticket29EvidenceObject = {
  size: number;
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type Ticket29EvidenceBucket = {
  get(key: string): Promise<Ticket29EvidenceObject | null>;
  put(
    key: string,
    value: Uint8Array,
    options: {
      onlyIf: { etagDoesNotMatch: "*" };
      httpMetadata?: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<unknown>;
};

const bodyFreeRecordFields = {
  runId: z.string().min(1).max(200),
  sourceId: z.string().min(1).max(500),
  sourceDocumentId: z.string().min(1).max(500),
  sourceVersionId: z.string().min(1).max(500),
  legalIdentitySha256: sha256Schema,
  materialSha256: sha256Schema,
  contentSha256: sha256Schema,
  rawSourceKey: z.string().min(1).max(1_024).optional(),
  rawSourceKeySha256: sha256Schema,
  normalizedSourceKey: z.string().min(1).max(1_024).optional(),
  normalizedSourceKeySha256: sha256Schema,
  rawObjectKey: z.string().min(1).max(1_024),
  normalizedObjectKey: z.string().min(1).max(1_024),
  provisionObjectKey: z.string().min(1).max(1_024),
  provisionObjectSha256: sha256Schema,
  language: legalLanguageSchema,
  script: legalScriptSchema,
  ordinal: z.number().int().nonnegative(),
  validFrom: z.string().datetime({ offset: true }).nullable(),
  validTo: z.string().datetime({ offset: true }).nullable(),
  currentEligible: z.boolean(),
  historicalEligible: z.boolean(),
  temporalGap: z.boolean(),
  quarantined: z.boolean(),
  instrumentId: z.string().min(1).max(200).optional(),
  officialExpressionId: z.string().min(1).max(200).optional(),
  textRevisionId: z.string().min(1).max(200).optional(),
  provisionConceptId: z.string().min(1).max(200).optional(),
  provisionRenditionId: z.string().min(1).max(200).optional(),
  legacyCurrentRenditionId: z.string().min(1).max(200).optional(),
  publisherRevisionToken: z.string().min(1).max(300).optional(),
  legacyTargetPublisherRevisionToken: z.string().min(1).max(300).optional(),
  sourcePublisherRevisionToken: z.string().min(1).max(300).optional(),
  publisherProvisionToken: z.string().min(1).max(300).optional(),
  applicabilityIdentity: z.string().min(1).max(300).optional(),
  identityStage: z.literal("ticket29-provisional-v1").optional(),
  textualAuthority: z.string().min(1).max(100).optional(),
  provisionSourceUrl: z.string().url().nullable().optional(),
  versionSourceUrl: z.string().url().nullable().optional(),
  previousSourceVersionId: z.string().min(1).max(500).nullable().optional(),
  sourceChangeType: z.string().min(1).max(100).optional(),
  sourceRevisionSha256: sha256Schema.optional(),
  objectMetadataRevisionSha256: sha256Schema.optional(),
};

const bodyFreeRecordSchema = z.object(bodyFreeRecordFields).strict().superRefine((record, context) => {
  if (record.temporalGap === (record.validFrom !== null)) {
    context.addIssue({ code: "custom", message: "TICKET29_APPLICABILITY_MISMATCH" });
  }
  if (record.historicalEligible && record.validFrom === null) {
    context.addIssue({ code: "custom", message: "TICKET29_HISTORY_WITHOUT_VALIDITY" });
  }
});

const requiredIdentityFields = z.object({
  rawSourceKey: z.string().min(1).max(1_024),
  normalizedSourceKey: z.string().min(1).max(1_024),
  instrumentId: z.string().min(1).max(200),
  officialExpressionId: z.string().min(1).max(200),
  textRevisionId: z.string().min(1).max(200),
  provisionConceptId: z.string().min(1).max(200),
  provisionRenditionId: z.string().min(1).max(200),
  legacyCurrentRenditionId: z.string().min(1).max(200),
  publisherRevisionToken: z.string().min(1).max(300),
  legacyTargetPublisherRevisionToken: z.string().min(1).max(300),
  sourcePublisherRevisionToken: z.string().min(1).max(300),
  publisherProvisionToken: z.string().min(1).max(300),
  applicabilityIdentity: z.string().min(1).max(300),
  identityStage: z.literal("ticket29-provisional-v1"),
  textualAuthority: z.string().min(1).max(100),
  provisionSourceUrl: z.string().url().nullable(),
  versionSourceUrl: z.string().url().nullable(),
  previousSourceVersionId: z.string().min(1).max(500).nullable(),
  sourceChangeType: z.string().min(1).max(100),
  sourceRevisionSha256: sha256Schema,
  objectMetadataRevisionSha256: sha256Schema,
});

const completeBodyFreeRecordSchema = bodyFreeRecordSchema.and(requiredIdentityFields);

export type Ticket29BodyFreeRecord = z.input<typeof completeBodyFreeRecordSchema>;
type Ticket29BodyFreeRecordBase = z.output<typeof bodyFreeRecordSchema>;

const materializationInputSchema = z.object({
  runId: bodyFreeRecordFields.runId,
  sourceId: bodyFreeRecordFields.sourceId,
  sourceDocumentId: bodyFreeRecordFields.sourceDocumentId,
  sourceVersionId: bodyFreeRecordFields.sourceVersionId,
  legalIdentitySha256: bodyFreeRecordFields.legalIdentitySha256,
  materialSha256: bodyFreeRecordFields.materialSha256,
  contentSha256: bodyFreeRecordFields.contentSha256,
  rawSourceKey: z.string().min(1).max(1_024),
  rawSourceSha256: sha256Schema,
  normalizedSourceKey: z.string().min(1).max(1_024),
  normalizedSourceSha256: sha256Schema,
  language: bodyFreeRecordFields.language,
  script: bodyFreeRecordFields.script,
  ordinal: bodyFreeRecordFields.ordinal,
  validFrom: bodyFreeRecordFields.validFrom,
  validTo: bodyFreeRecordFields.validTo,
  currentEligible: bodyFreeRecordFields.currentEligible,
  historicalEligible: bodyFreeRecordFields.historicalEligible,
  temporalGap: bodyFreeRecordFields.temporalGap,
}).strict();

export const ticket29QueueMessageSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("materialize-page"),
  runId: z.string().min(1).max(200),
  attemptId: z.string().min(1).max(200),
  planKey: z.string().min(1).max(1_024),
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive().max(16 * 1024 * 1024),
  pageSha256: sha256Schema,
  injectInterruption: z.boolean(),
  proofMode: z.enum(["interrupted", "idempotent"]),
}).strict();

export async function ticket29Sha256(value: string | Uint8Array): Promise<string> {
  const source = typeof value === "string" ? encoder.encode(value) : value;
  const owned = new Uint8Array(source.byteLength);
  owned.set(source);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function ticket29LegacyTargetRenditionId(input: {
  publisherDocumentToken: string;
  language: "en" | "ru" | "uz-Cyrl" | "uz-Latn";
  script: "Cyrl" | "Latn";
  textualAuthority: "unknown";
  publisherProvisionToken: string;
  sourceRevisionSha256: string;
}): Promise<string> {
  const sourceRevisionSha256 = sha256Schema.parse(input.sourceRevisionSha256);
  const instrumentId = `instrument:${await ticket29Sha256(input.publisherDocumentToken)}`;
  const expressionId = `expression:${await ticket29Sha256(
    `${instrumentId}\u0000${input.language}\u0000${input.script}\u0000${input.textualAuthority}`,
  )}`;
  const revisionId = `revision:${await ticket29Sha256(
    `${expressionId}\u0000${sourceRevisionSha256}`,
  )}`;
  const conceptId = `concept:${await ticket29Sha256(
    `${instrumentId}\u0000${input.publisherProvisionToken}`,
  )}`;
  return `rendition:${await ticket29Sha256(`${conceptId}\u0000${revisionId}`)}`;
}

export const TICKET29_FINALIZATION_COUNTS_SQL = `SELECT count(*) AS lanes,
    coalesce(sum(record_count),0) AS records,
    coalesce(sum(current_count),0) AS currentRecords,
    coalesce(sum(history_count),0) AS historicalRecords,
    coalesce(sum(gap_count),0) AS gaps
  FROM legal_complete_corpus_lane_reports
  WHERE run_id=? AND report_kind='manifest'`;

export const TICKET29_SOURCE_PAGE_SIZE = 600;
export const TICKET29_MATERIALIZATION_PAGE_SIZE = 100;
export const TICKET29_EVIDENCE_NAMESPACE = "complete-v2";
export const TICKET29_EVIDENCE_PREFIX = `legal-corpus/${TICKET29_EVIDENCE_NAMESPACE}/`;

export async function ticket29PlanSourcePageInParallel<TSource, TPlan>(
  sourceRows: readonly TSource[],
  plan: (sourceRow: TSource) => Promise<TPlan>,
): Promise<TPlan[]> {
  if (sourceRows.length > TICKET29_SOURCE_PAGE_SIZE) {
    throw new Error("TICKET29_SOURCE_PAGE_LIMIT_EXCEEDED");
  }
  return Promise.all(sourceRows.map((sourceRow) => plan(sourceRow)));
}

export async function ticket29WritePlanPagesInParallel<TPlan, TWritten>(
  planItems: readonly TPlan[],
  write: (page: readonly TPlan[], offset: number) => Promise<TWritten>,
): Promise<TWritten[]> {
  if (planItems.length > TICKET29_SOURCE_PAGE_SIZE) {
    throw new Error("TICKET29_SOURCE_PAGE_LIMIT_EXCEEDED");
  }
  const pages: Array<{ items: readonly TPlan[]; offset: number }> = [];
  for (let offset = 0; offset < planItems.length; offset += TICKET29_MATERIALIZATION_PAGE_SIZE) {
    pages.push({
      items: planItems.slice(offset, offset + TICKET29_MATERIALIZATION_PAGE_SIZE),
      offset,
    });
  }
  return Promise.all(pages.map(({ items, offset }) => write(items, offset)));
}

/** Ticket 12's persisted publisher token; target-migration canonicalizes this exact natural key. */
export function ticket29TargetPublisherRevisionToken(input: {
  versionNumber: number;
  versionContentSha256: string;
}): string {
  if (!Number.isSafeInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new TypeError("TICKET29_TARGET_REVISION_TOKEN_INVALID");
  }
  return `${input.versionNumber}:${sha256Schema.parse(input.versionContentSha256)}`;
}

function evidenceExtension(kind: Ticket29EvidenceKind, mediaType: string): string {
  if (kind === "provision_rendition") return "txt";
  if (kind === "raw_capture") return "bin";
  if (kind === "normalized_revision") return "json";
  if (kind === "plan") return mediaType.includes("jsonl") ? "jsonl" : "json";
  return "json";
}

export function ticket29EvidenceKey(
  rawKind: Ticket29EvidenceKind,
  rawSha256: string,
  mediaType: string,
): string {
  const kind = evidenceKindSchema.parse(rawKind);
  const sha256 = sha256Schema.parse(rawSha256);
  const segment = kind.replaceAll("_", "-");
  const namespace = kind === "qualification" ? "qualification-v1" : TICKET29_EVIDENCE_NAMESPACE;
  return `legal-corpus/${namespace}/${segment}/${sha256}.${evidenceExtension(kind, mediaType)}`;
}

function evidenceMetadata(descriptor: Ticket29EvidenceDescriptor): Record<string, string> {
  return {
    schemaVersion: "complete-corpus-evidence-v1",
    kind: descriptor.kind,
    sha256: descriptor.sha256,
    byteCount: String(descriptor.byteCount),
    mediaType: descriptor.mediaType,
    ...(descriptor.sourceNormalizedSha256
      ? { sourceNormalizedSha256: descriptor.sourceNormalizedSha256 }
      : {}),
  };
}

function stableMetadata(value: Record<string, string> | undefined): string {
  return stableSourceSnapshotJson(value ?? {});
}

async function verifyEvidenceObject(
  object: Ticket29EvidenceObject | null,
  descriptor: Ticket29EvidenceDescriptor,
): Promise<void> {
  if (!object || object.size !== descriptor.byteCount
    || stableMetadata(object.customMetadata) !== stableMetadata(evidenceMetadata(descriptor))) {
    throw new Error("TICKET29_EXISTING_OBJECT_MISMATCH");
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== descriptor.byteCount || await ticket29Sha256(bytes) !== descriptor.sha256) {
    throw new Error("TICKET29_EXISTING_OBJECT_MISMATCH");
  }
}

export async function immutableEvidencePut(
  bucket: Ticket29EvidenceBucket,
  rawDescriptor: Ticket29EvidenceDescriptor,
  bytes: Uint8Array,
): Promise<{ disposition: "created" | "reused"; key: string; byteCount: number; sha256: string }> {
  const descriptor = {
    ...rawDescriptor,
    kind: evidenceKindSchema.parse(rawDescriptor.kind),
    sha256: sha256Schema.parse(rawDescriptor.sha256),
  };
  if (!Number.isSafeInteger(descriptor.byteCount) || descriptor.byteCount < 0
    || bytes.byteLength !== descriptor.byteCount
    || await ticket29Sha256(bytes) !== descriptor.sha256
    || descriptor.key !== ticket29EvidenceKey(descriptor.kind, descriptor.sha256, descriptor.mediaType)) {
    throw new TypeError("TICKET29_OBJECT_INPUT_MISMATCH");
  }
  const metadata = evidenceMetadata(descriptor);
  const existing = await bucket.get(descriptor.key);
  if (existing) {
    await verifyEvidenceObject(existing, descriptor);
    return { disposition: "reused", key: descriptor.key,
      byteCount: descriptor.byteCount, sha256: descriptor.sha256 };
  }
  const created = await bucket.put(descriptor.key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: descriptor.mediaType },
    customMetadata: metadata,
  });
  await verifyEvidenceObject(await bucket.get(descriptor.key), descriptor);
  return {
    disposition: created === null ? "reused" : "created",
    key: descriptor.key,
    byteCount: descriptor.byteCount,
    sha256: descriptor.sha256,
  };
}

export function buildBodyFreeMaterializationRecord(
  rawInput: z.input<typeof materializationInputSchema>,
): Ticket29BodyFreeRecordBase {
  const input = materializationInputSchema.parse(rawInput);
  return bodyFreeRecordSchema.parse({
    runId: input.runId,
    sourceId: input.sourceId,
    sourceDocumentId: input.sourceDocumentId,
    sourceVersionId: input.sourceVersionId,
    legalIdentitySha256: input.legalIdentitySha256,
    materialSha256: input.materialSha256,
    contentSha256: input.contentSha256,
    rawSourceKey: input.rawSourceKey,
    rawSourceKeySha256: input.rawSourceSha256,
    normalizedSourceKey: input.normalizedSourceKey,
    normalizedSourceKeySha256: input.normalizedSourceSha256,
    rawObjectKey: ticket29EvidenceKey("raw_capture", input.rawSourceSha256, "application/octet-stream"),
    normalizedObjectKey: ticket29EvidenceKey(
      "normalized_revision", input.normalizedSourceSha256, "application/json;charset=utf-8",
    ),
    provisionObjectKey: ticket29EvidenceKey(
      "provision_rendition", input.contentSha256, "text/plain;charset=utf-8",
    ),
    provisionObjectSha256: input.contentSha256,
    language: input.language,
    script: input.script,
    ordinal: input.ordinal,
    validFrom: input.validFrom,
    validTo: input.validTo,
    currentEligible: input.currentEligible,
    historicalEligible: input.historicalEligible,
    temporalGap: input.temporalGap,
    quarantined: false,
  });
}

function manifestMember(record: Ticket29BodyFreeRecord): Record<string, unknown> {
  const parsed = completeBodyFreeRecordSchema.parse(record);
  return {
    runId: parsed.runId,
    sourceDocumentId: parsed.sourceDocumentId,
    sourceVersionId: parsed.sourceVersionId,
    legalIdentitySha256: parsed.legalIdentitySha256,
    materialSha256: parsed.materialSha256,
    contentSha256: parsed.contentSha256,
    sourceId: parsed.sourceId,
    rawSourceKey: parsed.rawSourceKey ?? null,
    rawSourceKeySha256: parsed.rawSourceKeySha256,
    normalizedSourceKey: parsed.normalizedSourceKey ?? null,
    normalizedSourceKeySha256: parsed.normalizedSourceKeySha256,
    rawObjectKey: parsed.rawObjectKey,
    normalizedObjectKey: parsed.normalizedObjectKey,
    provisionObjectKey: parsed.provisionObjectKey,
    provisionObjectSha256: parsed.provisionObjectSha256,
    instrumentId: parsed.instrumentId ?? null,
    officialExpressionId: parsed.officialExpressionId ?? null,
    textRevisionId: parsed.textRevisionId ?? null,
    provisionConceptId: parsed.provisionConceptId ?? null,
    provisionRenditionId: parsed.provisionRenditionId ?? null,
    legacyCurrentRenditionId: parsed.legacyCurrentRenditionId ?? null,
    publisherRevisionToken: parsed.publisherRevisionToken ?? null,
    legacyTargetPublisherRevisionToken: parsed.legacyTargetPublisherRevisionToken ?? null,
    sourcePublisherRevisionToken: parsed.sourcePublisherRevisionToken ?? null,
    publisherProvisionToken: parsed.publisherProvisionToken ?? null,
    applicabilityIdentity: parsed.applicabilityIdentity ?? null,
    identityStage: parsed.identityStage ?? null,
    textualAuthority: parsed.textualAuthority ?? null,
    provisionSourceUrl: parsed.provisionSourceUrl ?? null,
    versionSourceUrl: parsed.versionSourceUrl ?? null,
    previousSourceVersionId: parsed.previousSourceVersionId ?? null,
    sourceChangeType: parsed.sourceChangeType ?? null,
    sourceRevisionSha256: parsed.sourceRevisionSha256 ?? null,
    objectMetadataRevisionSha256: parsed.objectMetadataRevisionSha256 ?? null,
    language: parsed.language,
    script: parsed.script,
    ordinal: parsed.ordinal,
    validFrom: parsed.validFrom,
    validTo: parsed.validTo,
    currentEligible: parsed.currentEligible,
    historicalEligible: parsed.historicalEligible,
    temporalGap: parsed.temporalGap,
    quarantined: parsed.quarantined,
  };
}

async function membershipRoot(records: readonly Ticket29BodyFreeRecord[]): Promise<string> {
  const members = records.map(manifestMember)
    .sort((left, right) => stableSourceSnapshotJson(left).localeCompare(stableSourceSnapshotJson(right)));
  return ticket29Sha256(stableSourceSnapshotJson(members));
}

export async function ticket29ManifestRoot(records: readonly Ticket29BodyFreeRecord[]) {
  const parsed = records.map((record) => completeBodyFreeRecordSchema.parse(record));
  const current = parsed.filter((record) => record.currentEligible);
  const history = parsed.filter((record) => record.historicalEligible);
  const gaps = parsed.filter((record) => record.temporalGap);
  const quarantines = parsed.filter((record) => record.quarantined);
  return {
    schemaVersion: 1 as const,
    counts: { union: parsed.length, current: current.length, history: history.length,
      gaps: gaps.length, quarantines: quarantines.length },
    roots: {
      union: await membershipRoot(parsed),
      current: await membershipRoot(current),
      history: await membershipRoot(history),
      gaps: await membershipRoot(gaps),
      quarantines: await membershipRoot(quarantines),
    },
  };
}

export async function reconstructMaterializedCorpus(
  records: readonly Ticket29BodyFreeRecord[],
  loadObject: (key: string) => Promise<Uint8Array | null>,
) {
  const parsed = records.map((record) => completeBodyFreeRecordSchema.parse(record));
  const bodies = new Map<string, string>();
  for (const record of parsed) {
    bodies.set(record.provisionObjectKey, record.provisionObjectSha256);
  }
  let missingObjects = 0;
  let hashMismatches = 0;
  for (const [key, expectedSha256] of bodies) {
    const bytes = await loadObject(key);
    if (!bytes) {
      missingObjects += 1;
    } else if (await ticket29Sha256(bytes) !== expectedSha256) {
      hashMismatches += 1;
    }
  }
  return {
    counts: {
      records: parsed.length,
      distinctBodies: bodies.size,
      current: parsed.filter((record) => record.currentEligible).length,
      history: parsed.filter((record) => record.historicalEligible).length,
      gaps: parsed.filter((record) => record.temporalGap).length,
      quarantines: parsed.filter((record) => record.quarantined).length,
    },
    missingObjects,
    hashMismatches,
    manifest: await ticket29ManifestRoot(parsed),
  };
}

const retainedLocatorSchema = z.object({
  key: z.string().min(1).max(1_024).startsWith("corpus/"),
  kind: z.enum(["raw_capture", "normalized_revision", "provision_rendition"]),
  sha256: sha256Schema,
  byteCount: z.number().int().positive(),
  mediaType: z.string().min(1).max(200),
  sourceNormalizedSha256: sha256Schema.nullable(),
  schemaVersion: z.literal(1),
}).strict();

export type Ticket29RetainedLocator = z.infer<typeof retainedLocatorSchema>;

const planItemSchema = z.object({
  sourceId: z.string().min(1).max(500),
  legalIdentitySha256: sha256Schema,
  materialSha256: sha256Schema,
  contentSha256: sha256Schema,
  rawSourceKey: z.string().min(1).max(1_024),
  rawSourceSha256: sha256Schema,
  normalizedSourceKey: z.string().min(1).max(1_024),
  normalizedSourceSha256: sha256Schema,
  sourceDocumentId: z.string().min(1).max(500),
  sourceVersionId: z.string().min(1).max(500),
  instrumentId: z.string().min(1).max(200),
  officialExpressionId: z.string().min(1).max(200),
  textRevisionId: z.string().min(1).max(200),
  provisionConceptId: z.string().min(1).max(200),
  provisionRenditionId: z.string().min(1).max(200),
  legacyCurrentRenditionId: z.string().min(1).max(200),
  publisherRevisionToken: z.string().min(1).max(300),
  legacyTargetPublisherRevisionToken: z.string().min(1).max(300),
  sourcePublisherRevisionToken: z.string().min(1).max(300),
  publisherProvisionToken: z.string().min(1).max(300),
  applicabilityIdentity: z.string().min(1).max(300),
  identityStage: z.literal("ticket29-provisional-v1"),
  sourceRevisionSha256: sha256Schema,
  objectMetadataRevisionSha256: sha256Schema,
  provisionSourceUrl: z.string().url().nullable(),
  versionSourceUrl: z.string().url().nullable(),
  previousSourceVersionId: z.string().min(1).max(500).nullable(),
  sourceChangeType: z.string().min(1).max(100),
  textualAuthority: z.literal("unknown"),
  language: legalLanguageSchema,
  script: legalScriptSchema,
  ordinal: z.number().int().nonnegative(),
  validFrom: z.string().datetime({ offset: true }).nullable(),
  validTo: z.string().datetime({ offset: true }).nullable(),
  currentEligible: z.boolean(),
  historicalEligible: z.boolean(),
  temporalGap: z.boolean(),
  retainedRawLocator: retainedLocatorSchema.optional(),
  retainedNormalizedLocator: retainedLocatorSchema.optional(),
  retainedProvisionLocator: retainedLocatorSchema.optional(),
}).strict();

export type Ticket29PlanItem = z.infer<typeof planItemSchema>;

export type Ticket29HydratedSource = Ticket29PlanItem & {
  sourceDocumentId: string;
  sourceVersionId: string;
  rawBytes: Uint8Array;
  normalizedBytes: Uint8Array;
  officialBytes: Uint8Array;
  language: z.infer<typeof legalLanguageSchema>;
  script: z.infer<typeof legalScriptSchema>;
  ordinal: number;
  validFrom: string | null;
  validTo: string | null;
  currentEligible: boolean;
  historicalEligible: boolean;
  temporalGap: boolean;
};

type Ticket29PageCommit = {
  runId: string;
  attemptId: string;
  pageSha256: string;
  planOffset: number;
  planLength: number;
  planKey: string;
  receiptSha256: string;
  records: Ticket29BodyFreeRecord[];
  objects: Array<Ticket29EvidenceDescriptor & { writeDisposition: "created" | "reused" }>;
  createdObjectCount: number;
  reusedObjectCount: number;
  createdByteCount: number;
  reusedByteCount: number;
};

type Ticket29PageDependencies = {
  bucket: Ticket29EvidenceBucket;
  loadPlan(message: z.output<typeof ticket29QueueMessageSchema>): Promise<Uint8Array>;
  loadSource(plan: readonly Ticket29PlanItem[]): Promise<readonly Ticket29HydratedSource[]>;
  findReceipt(runId: string, pageSha256: string): Promise<string | null>;
  commitPage(value: Ticket29PageCommit): Promise<void>;
  afterObjectCheckpoint?(checkpoint: { recordCount: number; createdObjectCount: number;
    reusedObjectCount: number; createdByteCount: number; reusedByteCount: number }): Promise<void>;
  withRetainedObjectBytes?(
    locator: Ticket29RetainedLocator,
    verifyBytes: (bytes: Uint8Array) => Promise<void>,
  ): Promise<void>;
};

function parsePlanPage(bytes: Uint8Array): Ticket29PlanItem[] {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim());
  } catch {
    throw new TypeError("TICKET29_PLAN_INVALID");
  }
  return z.array(planItemSchema).min(1).max(1_000).parse(value);
}

/**
 * Materializes one bounded content-free plan page. R2 objects become durable
 * before the atomic D1 receipt, so a retry can verify/reuse them after any
 * interruption without overwriting evidence or duplicating identities.
 */
export async function runTicket29MaterializationPage(
  dependencies: Ticket29PageDependencies,
  rawMessage: z.input<typeof ticket29QueueMessageSchema>,
) {
  const message = ticket29QueueMessageSchema.parse(rawMessage);
  const priorReceipt = await dependencies.findReceipt(message.runId, message.pageSha256);
  if (priorReceipt && message.proofMode !== "idempotent") {
    return { disposition: "duplicate" as const, receiptSha256: priorReceipt,
      records: 0, objects: { created: 0, reused: 0 } };
  }
  const pageBytes = await dependencies.loadPlan(message);
  if (pageBytes.byteLength !== message.length || await ticket29Sha256(pageBytes) !== message.pageSha256) {
    throw new Error("TICKET29_PLAN_READBACK_MISMATCH");
  }
  const plan = parsePlanPage(pageBytes);
  const sources = await dependencies.loadSource(plan);
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  if (sourceById.size !== plan.length || sources.length !== plan.length) {
    throw new Error("TICKET29_SOURCE_PAGE_INCOMPLETE");
  }
  const records: Ticket29BodyFreeRecord[] = [];
  const descriptors = new Map<string, Ticket29EvidenceDescriptor>();
  const bytesByKey = new Map<string, Uint8Array>();
  const retainedKeys = new Set<string>();
  for (const expected of plan) {
    const source = sourceById.get(expected.sourceId);
    const hydratedIdentity = source ? {
      sourceId: source.sourceId,
      legalIdentitySha256: source.legalIdentitySha256,
      materialSha256: source.materialSha256,
      contentSha256: source.contentSha256,
      rawSourceKey: source.rawSourceKey,
      rawSourceSha256: source.rawSourceSha256,
      normalizedSourceKey: source.normalizedSourceKey,
      normalizedSourceSha256: source.normalizedSourceSha256,
      ...Object.fromEntries([
        "sourceDocumentId", "sourceVersionId", "instrumentId", "officialExpressionId",
        "textRevisionId", "provisionConceptId", "provisionRenditionId", "legacyCurrentRenditionId",
        "publisherRevisionToken", "publisherProvisionToken", "applicabilityIdentity",
        "legacyTargetPublisherRevisionToken",
        "sourcePublisherRevisionToken",
        "identityStage",
        "sourceRevisionSha256", "objectMetadataRevisionSha256", "provisionSourceUrl",
        "versionSourceUrl", "previousSourceVersionId", "sourceChangeType", "textualAuthority",
        "language", "script", "ordinal", "validFrom", "validTo", "currentEligible",
        "historicalEligible", "temporalGap",
        "retainedRawLocator", "retainedNormalizedLocator", "retainedProvisionLocator",
      ].filter((key) => key in expected).map((key) => [key, source[key as keyof Ticket29HydratedSource]])),
    } : null;
    if (!source || stableSourceSnapshotJson(planItemSchema.parse(hydratedIdentity))
      !== stableSourceSnapshotJson(expected)) {
      throw new Error("TICKET29_SOURCE_IDENTITY_MISMATCH");
    }
    const [contentSha256, rawSha256, normalizedSha256] = await Promise.all([
      ticket29Sha256(source.officialBytes),
      ticket29Sha256(source.rawBytes),
      ticket29Sha256(source.normalizedBytes),
    ]);
    if (contentSha256 !== expected.contentSha256 || rawSha256 !== expected.rawSourceSha256
      || normalizedSha256 !== expected.normalizedSourceSha256) {
      throw new Error("TICKET29_SOURCE_HASH_MISMATCH");
    }
    const record: Ticket29BodyFreeRecord = {
      ...buildBodyFreeMaterializationRecord({
      runId: message.runId,
      sourceId: source.sourceId,
      sourceDocumentId: source.sourceDocumentId,
      sourceVersionId: source.sourceVersionId,
      legalIdentitySha256: source.legalIdentitySha256,
      materialSha256: source.materialSha256,
      contentSha256: source.contentSha256,
      rawSourceKey: source.rawSourceKey,
      rawSourceSha256: source.rawSourceSha256,
      normalizedSourceKey: source.normalizedSourceKey,
      normalizedSourceSha256: source.normalizedSourceSha256,
      language: source.language,
      script: source.script,
      ordinal: source.ordinal,
      validFrom: source.validFrom,
      validTo: source.validTo,
      currentEligible: source.currentEligible,
      historicalEligible: source.historicalEligible,
      temporalGap: source.temporalGap,
      }),
      rawSourceKey: source.rawSourceKey,
      normalizedSourceKey: source.normalizedSourceKey,
      instrumentId: source.instrumentId,
      officialExpressionId: source.officialExpressionId,
      textRevisionId: source.textRevisionId,
      provisionConceptId: source.provisionConceptId,
      provisionRenditionId: source.provisionRenditionId,
      legacyCurrentRenditionId: source.legacyCurrentRenditionId,
      publisherRevisionToken: source.publisherRevisionToken,
      legacyTargetPublisherRevisionToken: source.legacyTargetPublisherRevisionToken,
      sourcePublisherRevisionToken: source.sourcePublisherRevisionToken,
      publisherProvisionToken: source.publisherProvisionToken,
      applicabilityIdentity: source.applicabilityIdentity,
      identityStage: source.identityStage,
      textualAuthority: source.textualAuthority,
      provisionSourceUrl: source.provisionSourceUrl,
      versionSourceUrl: source.versionSourceUrl,
      previousSourceVersionId: source.previousSourceVersionId,
      sourceChangeType: source.sourceChangeType,
      sourceRevisionSha256: source.sourceRevisionSha256,
      objectMetadataRevisionSha256: source.objectMetadataRevisionSha256,
    };
    const additions: Array<[Ticket29EvidenceDescriptor, Uint8Array | null]> = [
      [{ key: record.rawObjectKey, kind: "raw_capture", mediaType: "application/octet-stream",
        sha256: source.rawSourceSha256, byteCount: source.rawBytes.byteLength }, source.rawBytes],
      [{ key: record.normalizedObjectKey, kind: "normalized_revision",
        mediaType: "application/json;charset=utf-8", sha256: source.normalizedSourceSha256,
        byteCount: source.normalizedBytes.byteLength, sourceNormalizedSha256: source.normalizedSourceSha256 },
      source.normalizedBytes],
      [{ key: record.provisionObjectKey, kind: "provision_rendition",
        mediaType: "text/plain;charset=utf-8", sha256: source.contentSha256,
        byteCount: source.officialBytes.byteLength },
      source.officialBytes],
    ];
    for (const [property, index, expectedKind, expectedSourceSha256] of [
      ["retainedRawLocator", 0, "raw_capture", source.rawSourceSha256],
      ["retainedNormalizedLocator", 1, "normalized_revision", source.normalizedSourceSha256],
      ["retainedProvisionLocator", 2, "provision_rendition", null],
    ] as const) {
      const retained = source[property];
      if (!retained) continue;
      if (!dependencies.withRetainedObjectBytes || retained.kind !== expectedKind
        || (expectedSourceSha256 !== null && retained.sha256 !== expectedSourceSha256)
        || (retained.kind === "provision_rendition"
          && retained.sourceNormalizedSha256 !== source.normalizedSourceSha256)) {
        throw new Error("TICKET29_RETAINED_LOCATOR_MISMATCH");
      }
      let verificationCalls = 0;
      let verificationComplete = false;
      await dependencies.withRetainedObjectBytes(retained, async (retainedBytes) => {
        verificationCalls += 1;
        if (verificationCalls !== 1) throw new Error("TICKET29_RETAINED_OBJECT_UNVERIFIED");
        if (retainedBytes.byteLength !== retained.byteCount
          || await ticket29Sha256(retainedBytes) !== retained.sha256) {
          throw new Error("TICKET29_RETAINED_OBJECT_MISMATCH");
        }
        if (retained.kind === "provision_rendition") {
          let envelope: unknown;
          try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(retainedBytes)); }
          catch { throw new Error("TICKET29_RETAINED_RENDITION_INVALID"); }
          const provisionText = envelope && typeof envelope === "object"
            ? (envelope as Record<string, unknown>).provisionText : null;
          if (typeof provisionText !== "string"
            || await ticket29Sha256(provisionText) !== source.contentSha256) {
            throw new Error("TICKET29_RETAINED_RENDITION_CONTENT_MISMATCH");
          }
        }
        verificationComplete = true;
      });
      if (verificationCalls !== 1 || !verificationComplete) {
        throw new Error("TICKET29_RETAINED_OBJECT_UNVERIFIED");
      }
      additions[index] = [{ key: retained.key, kind: retained.kind, mediaType: retained.mediaType,
        sha256: retained.sha256, byteCount: retained.byteCount,
        ...(retained.sourceNormalizedSha256
          ? { sourceNormalizedSha256: retained.sourceNormalizedSha256 } : {}) }, null];
      retainedKeys.add(retained.key);
    }
    record.rawObjectKey = additions[0]![0].key;
    record.normalizedObjectKey = additions[1]![0].key;
    record.provisionObjectKey = additions[2]![0].key;
    record.provisionObjectSha256 = additions[2]![0].sha256;
    records.push(completeBodyFreeRecordSchema.parse(record));
    for (const [descriptor, bytes] of additions) {
      const prior = descriptors.get(descriptor.key);
      if (prior && stableSourceSnapshotJson(prior) !== stableSourceSnapshotJson(descriptor)) {
        throw new Error("TICKET29_OBJECT_DESCRIPTOR_CONFLICT");
      }
      descriptors.set(descriptor.key, descriptor);
      if (bytes) bytesByKey.set(descriptor.key, bytes);
    }
  }
  let createdObjectCount = 0;
  let reusedObjectCount = 0;
  let createdByteCount = 0;
  let reusedByteCount = 0;
  const writeDispositions = new Map<string, "created" | "reused">();
  for (const descriptor of descriptors.values()) {
    const result = retainedKeys.has(descriptor.key)
      ? { disposition: "reused" as const }
      : await immutableEvidencePut(dependencies.bucket, descriptor, bytesByKey.get(descriptor.key)!);
    writeDispositions.set(descriptor.key, result.disposition);
    if (result.disposition === "created") {
      createdObjectCount += 1;
      createdByteCount += descriptor.byteCount;
    } else {
      reusedObjectCount += 1;
      reusedByteCount += descriptor.byteCount;
    }
  }
  if (message.injectInterruption && dependencies.afterObjectCheckpoint) {
    await dependencies.afterObjectCheckpoint({ recordCount: records.length,
      createdObjectCount, reusedObjectCount, createdByteCount, reusedByteCount });
  }
  const pageManifest = await ticket29ManifestRoot(records);
  const receiptSha256 = await ticket29Sha256(stableSourceSnapshotJson({
    schemaVersion: 1,
    runId: message.runId,
    pageSha256: message.pageSha256,
    planKey: message.planKey,
    recordCount: records.length,
    objectCount: descriptors.size,
    pageManifest,
  }));
  await dependencies.commitPage({
    runId: message.runId,
    attemptId: message.attemptId,
    pageSha256: message.pageSha256,
    planOffset: message.offset,
    planLength: message.length,
    planKey: message.planKey,
    receiptSha256,
    records,
    objects: [...descriptors.values()].map((descriptor) => ({ ...descriptor,
      writeDisposition: writeDispositions.get(descriptor.key)! })),
    createdObjectCount,
    reusedObjectCount,
    createdByteCount,
    reusedByteCount,
  });
  return {
    disposition: "completed" as const,
    receiptSha256,
    records: records.length,
    objects: { created: createdObjectCount, reused: reusedObjectCount,
      createdBytes: createdByteCount, reusedBytes: reusedByteCount },
  };
}

export type Ticket29Accounting = {
  createdObjectCount: number;
  reusedObjectCount: number;
  createdByteCount: number;
  reusedByteCount: number;
};

export function ticket29AccountingTotalsMatch(
  left: Ticket29Accounting,
  right: Ticket29Accounting,
): boolean {
  return left.createdObjectCount + left.reusedObjectCount
      === right.createdObjectCount + right.reusedObjectCount
    && left.createdByteCount + left.reusedByteCount
      === right.createdByteCount + right.reusedByteCount;
}

export type Ticket29ControlReplayRow = Ticket29Accounting & {
  key: string;
  recordCount: number;
  rootSha256: string;
};

export function ticket29ControlReplayMatches(
  firstRows: readonly Ticket29ControlReplayRow[],
  secondRows: readonly Ticket29ControlReplayRow[],
  expectedKeys: readonly string[],
): boolean {
  const first = new Map(firstRows.map((row) => [row.key, row]));
  const second = new Map(secondRows.map((row) => [row.key, row]));
  const expected = [...expectedKeys].sort();
  if (first.size !== firstRows.length || second.size !== secondRows.length
    || JSON.stringify([...first.keys()].sort()) !== JSON.stringify(expected)
    || JSON.stringify([...second.keys()].sort()) !== JSON.stringify(expected)) return false;
  return expected.every((key) => {
    const initial = first.get(key)!;
    const replay = second.get(key)!;
    return replay.recordCount === initial.recordCount
      && replay.rootSha256 === initial.rootSha256
      && replay.createdObjectCount === 0
      && replay.createdByteCount === 0
      && replay.reusedObjectCount === initial.createdObjectCount + initial.reusedObjectCount
      && replay.reusedByteCount === initial.createdByteCount + initial.reusedByteCount;
  });
}

export function ticket29LifecycleDisposition(
  key: string,
): "created" | "reused" {
  if (key.startsWith(TICKET29_EVIDENCE_PREFIX)) return "created";
  if (key.startsWith("corpus/")) return "reused";
  throw new Error("TICKET29_OBJECT_NAMESPACE_INVALID");
}

export function ticket29StageDecision(
  stage: "finalize" | "qualify",
  status: "building" | "materialized" | "complete" | "failed" | string,
): "execute" | "replay" {
  if (stage === "finalize") {
    if (status === "building") return "execute";
    if (status === "materialized" || status === "complete") return "replay";
  } else {
    if (status === "materialized") return "execute";
    if (status === "complete") return "replay";
  }
  throw new Error(`TICKET29_${stage.toUpperCase()}_STATE_INVALID`);
}
