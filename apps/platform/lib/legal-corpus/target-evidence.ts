import { z } from "zod";

import type { TemporalEndpoint } from "./legal-candidate-index";
import {
  acceptsPrivateServiceRequest,
  declaredRequestBodyWithinLimit,
  privateServiceJson,
} from "./private-service-boundary";
import {
  captureIdSchema,
  legalEnvironmentSchema,
  legalInstrumentIdSchema,
  legalLanguageSchema,
  legalScriptSchema,
  lexDocumentUrlSchema,
  officialExpressionIdSchema,
  provisionConceptIdSchema,
  provisionRenditionIdSchema,
  sha256Schema,
  textRevisionIdSchema,
  utcInstantSchema,
} from "./target-domain-schemas";

export const OFFICIAL_EVIDENCE_RESOLVE_PATH = "/internal/legal-corpus/target/evidence/resolve";

const SERVICE_BINDING_MARKER = "official-evidence-v1";
const textualAuthoritySchema = z.enum(["controlling", "official_translation", "unknown"]);
const temporalEndpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current") }).strict(),
  z.object({ kind: z.literal("timestamp"), instant: utcInstantSchema }).strict(),
]);
const authorityEvidenceSchema = z.object({
  kind: z.enum(["publisher_certification", "adoption_record", "official_publication"]),
  sourceUrl: lexDocumentUrlSchema,
  recordedAt: utcInstantSchema,
}).strict();

const importObjectSchema = z.object({
  legalInstrumentId: legalInstrumentIdSchema,
  publisherInstrumentToken: z.string().trim().min(1).max(200),
  officialExpressionId: officialExpressionIdSchema,
  textRevisionId: textRevisionIdSchema,
  provisionConceptId: provisionConceptIdSchema,
  publisherProvisionToken: z.string().trim().min(1).max(200),
  provisionRenditionId: provisionRenditionIdSchema,
  captureId: captureIdSchema,
  publisherRevisionToken: z.string().min(1).max(160),
  languageTag: legalLanguageSchema,
  script: legalScriptSchema,
  textualAuthority: textualAuthoritySchema,
  origin: z.enum(["certified_original", "adopted_original", "official_publisher", "unknown"]),
  publicationStatus: z.enum(["official", "withdrawn", "unknown"]),
  controllingOnConflict: z.boolean(),
  derivedFromExpressionId: officialExpressionIdSchema.nullable(),
  authorityEvidence: authorityEvidenceSchema.nullable(),
  actTitle: z.string().trim().min(1).max(2_000),
  documentType: z.string().trim().min(1).max(160),
  articleNumber: z.string().trim().min(1).max(160),
  articleTitle: z.string().trim().min(1).max(2_000).nullable().optional(),
  provisionSequence: z.number().int().nonnegative(),
  provisionText: z.string().min(1).max(500_000),
  rawCapture: z.string().min(1).max(4_000_000),
  sourceUrl: lexDocumentUrlSchema,
  capturedAt: utcInstantSchema,
}).strict();
const importSchema = importObjectSchema.superRefine((value, context) => {
  if (
    value.textualAuthority === "controlling"
    && (!value.controllingOnConflict || !value.authorityEvidence)
  ) {
    context.addIssue({ code: "custom", message: "Controlling authority evidence required" });
  }
  if (value.textualAuthority !== "controlling" && value.controllingOnConflict) {
    context.addIssue({ code: "custom", message: "Only controlling text controls conflicts" });
  }
  if (
    value.textualAuthority === "official_translation"
    && (value.languageTag === "ru" || value.languageTag === "en")
    && !value.derivedFromExpressionId
  ) {
    context.addIssue({ code: "custom", message: "Translation derivation required" });
  }
});

const provisionObjectSchema = z.object({
  schemaVersion: z.literal(1),
  legalInstrumentId: legalInstrumentIdSchema,
  publisherInstrumentToken: importObjectSchema.shape.publisherInstrumentToken,
  officialExpressionId: officialExpressionIdSchema,
  textRevisionId: textRevisionIdSchema,
  provisionConceptId: provisionConceptIdSchema,
  publisherProvisionToken: importObjectSchema.shape.publisherProvisionToken,
  provisionRenditionId: provisionRenditionIdSchema,
  languageTag: importObjectSchema.shape.languageTag,
  script: legalScriptSchema,
  textualAuthority: textualAuthoritySchema,
  actTitle: importObjectSchema.shape.actTitle,
  documentType: importObjectSchema.shape.documentType,
  articleNumber: importObjectSchema.shape.articleNumber,
  articleTitle: importObjectSchema.shape.articleTitle,
  provisionSequence: importObjectSchema.shape.provisionSequence,
  provisionText: importObjectSchema.shape.provisionText,
  sourceUrl: lexDocumentUrlSchema,
  capturedAt: importObjectSchema.shape.capturedAt,
  sourceNormalizedSha256: sha256Schema,
}).strict();

const resolvedEvidenceSchema = z.object({
  legalInstrumentId: legalInstrumentIdSchema,
  officialExpressionId: officialExpressionIdSchema,
  textRevisionId: textRevisionIdSchema,
  provisionConceptId: provisionConceptIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  languageTag: importObjectSchema.shape.languageTag,
  script: legalScriptSchema,
  textualAuthority: textualAuthoritySchema,
  provisionText: importObjectSchema.shape.provisionText,
  officialCitation: z.object({
    label: z.string().min(1).max(2_300),
    url: lexDocumentUrlSchema,
  }).strict(),
  evidence: z.object({
    provisionRenditionId: provisionRenditionIdSchema,
    r2Key: z.string().min(1).max(700),
    byteCount: z.number().int().positive(),
    sha256: sha256Schema,
    sourceNormalizedSha256: sha256Schema,
    schemaVersion: z.literal(1),
  }).strict(),
}).strict();

export type ResolvedOfficialEvidence = z.infer<typeof resolvedEvidenceSchema>;
export function parseResolvedOfficialEvidence(value: unknown): ResolvedOfficialEvidence {
  return resolvedEvidenceSchema.parse(value);
}
export type LegalEvidenceObject = {
  key: string;
  size: number;
  customMetadata?: Record<string, string>;
  bytes(): Promise<Uint8Array>;
};
type LegalEvidenceHead = Omit<LegalEvidenceObject, "bytes">;
export type LegalEvidenceBucket = {
  head(key: string): Promise<LegalEvidenceHead | null>;
  get(key: string): Promise<LegalEvidenceObject | null>;
  put(
    key: string,
    value: Uint8Array,
    options: {
      onlyIf: { etagDoesNotMatch: "*" };
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
      sha256: ArrayBuffer;
    },
  ): Promise<LegalEvidenceHead | null>;
};

export type OfficialEvidenceEnv = Pick<LegalCorpusDevelopmentEnv, "APP_ENV">
  & {
    LEGAL_DB?: D1Database;
    LEGAL_EVIDENCE_BUCKET?: Pick<LegalEvidenceBucket, "get">;
  };

export class LegalEvidenceError extends Error {
  constructor(readonly code:
    | "IMMUTABLE_EVIDENCE_CONFLICT"
    | "LEGAL_EVIDENCE_IDENTITY_CONFLICT"
    | "SOURCE_UNAVAILABILITY") {
    super(code);
    this.name = "LegalEvidenceError";
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; hex: string }> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return { digest, hex: hex(digest) };
}

function deterministicJson(value: unknown): Uint8Array {
  return utf8(`${JSON.stringify(value)}\n`);
}

type Locator = {
  id: string;
  objectKind: "raw_capture" | "normalized_revision" | "provision_rendition";
  r2Key: string;
  mediaType: string;
  byteCount: number;
  sha256: string;
  sourceNormalizedSha256: string | null;
  ordinal: number;
  schemaVersion: 1;
  createdAt: string;
};

async function readAndVerifyObject(
  bucket: Pick<LegalEvidenceBucket, "get">,
  locator: Pick<Locator, "r2Key" | "byteCount" | "sha256">,
): Promise<Uint8Array> {
  const object = await bucket.get(locator.r2Key);
  if (!object || object.size !== locator.byteCount) {
    throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
  }
  const bytes = await object.bytes();
  const actual = await sha256(bytes);
  if (
    bytes.byteLength !== locator.byteCount
    || actual.hex !== locator.sha256
    || object.customMetadata?.sha256 !== locator.sha256
    || object.customMetadata?.schemaVersion !== "1"
  ) {
    throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
  }
  return bytes;
}

async function immutablePut(input: {
  bucket: LegalEvidenceBucket;
  id: string;
  objectKind: Locator["objectKind"];
  key: string;
  mediaType: string;
  bytes: Uint8Array;
  sourceNormalizedSha256?: string;
  ordinal: number;
  createdAt: string;
}): Promise<Locator> {
  const hashed = await sha256(input.bytes);
  const locator: Locator = {
    id: input.id,
    objectKind: input.objectKind,
    r2Key: input.key,
    mediaType: input.mediaType,
    byteCount: input.bytes.byteLength,
    sha256: hashed.hex,
    sourceNormalizedSha256: input.sourceNormalizedSha256 ?? null,
    ordinal: input.ordinal,
    schemaVersion: 1,
    createdAt: input.createdAt,
  };
  const existing = await input.bucket.head(input.key);
  if (!existing) {
    await input.bucket.put(input.key, input.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: input.mediaType },
      customMetadata: {
        sha256: hashed.hex,
        schemaVersion: "1",
        objectKind: input.objectKind,
      },
      sha256: hashed.digest,
    });
  }
  try {
    const verified = await readAndVerifyObject(input.bucket, locator);
    if (verified.byteLength !== input.bytes.byteLength) {
      throw new LegalEvidenceError("IMMUTABLE_EVIDENCE_CONFLICT");
    }
  } catch (error) {
    if (error instanceof LegalEvidenceError) {
      throw new LegalEvidenceError("IMMUTABLE_EVIDENCE_CONFLICT");
    }
    throw error;
  }
  return locator;
}

async function assertNaturalIdentityAvailability(
  db: D1Database,
  input: z.infer<typeof importSchema>,
): Promise<void> {
  const instrument = await db.prepare(`SELECT id,publisher_instrument_token AS token
    FROM legal_instruments WHERE id=? OR publisher_instrument_token=?`).bind(
    input.legalInstrumentId,
    input.publisherInstrumentToken,
  ).first<{ id: string; token: string }>();
  const expression = await db.prepare(`SELECT id,legal_instrument_id AS legalInstrumentId,
      language_tag AS languageTag,script,textual_authority AS textualAuthority
    FROM legal_official_expressions
    WHERE id=? OR (legal_instrument_id=? AND language_tag=? AND script=? AND textual_authority=?)`).bind(
    input.officialExpressionId,
    input.legalInstrumentId,
    input.languageTag,
    input.script,
    input.textualAuthority,
  ).first<{
    id: string;
    legalInstrumentId: string;
    languageTag: string;
    script: string;
    textualAuthority: string;
  }>();
  const revision = await db.prepare(`SELECT id,official_expression_id AS officialExpressionId,
      publisher_revision_token AS publisherRevisionToken
    FROM legal_text_revisions
    WHERE id=? OR (official_expression_id=? AND publisher_revision_token=?)`).bind(
    input.textRevisionId,
    input.officialExpressionId,
    input.publisherRevisionToken,
  ).first<{ id: string; officialExpressionId: string; publisherRevisionToken: string }>();
  const concept = await db.prepare(`SELECT id,legal_instrument_id AS legalInstrumentId,
      publisher_concept_token AS token FROM legal_provision_concepts
    WHERE id=? OR (legal_instrument_id=? AND publisher_concept_token=?)`).bind(
    input.provisionConceptId,
    input.legalInstrumentId,
    input.publisherProvisionToken,
  ).first<{ id: string; legalInstrumentId: string; token: string }>();
  const rendition = await db.prepare(`SELECT id,provision_concept_id AS provisionConceptId,
      text_revision_id AS textRevisionId FROM legal_provision_renditions
    WHERE id=? OR (provision_concept_id=? AND text_revision_id=?)`).bind(
    input.provisionRenditionId,
    input.provisionConceptId,
    input.textRevisionId,
  ).first<{ id: string; provisionConceptId: string; textRevisionId: string }>();
  if ((instrument && (instrument.id !== input.legalInstrumentId
      || instrument.token !== input.publisherInstrumentToken))
    || (expression && (expression.id !== input.officialExpressionId
      || expression.legalInstrumentId !== input.legalInstrumentId
      || expression.languageTag !== input.languageTag
      || expression.script !== input.script
      || expression.textualAuthority !== input.textualAuthority))
    || (revision && (revision.id !== input.textRevisionId
      || revision.officialExpressionId !== input.officialExpressionId
      || revision.publisherRevisionToken !== input.publisherRevisionToken))
    || (concept && (concept.id !== input.provisionConceptId
      || concept.legalInstrumentId !== input.legalInstrumentId
      || concept.token !== input.publisherProvisionToken))
    || (rendition && (rendition.id !== input.provisionRenditionId
      || rendition.provisionConceptId !== input.provisionConceptId
      || rendition.textRevisionId !== input.textRevisionId))) {
    throw new LegalEvidenceError("LEGAL_EVIDENCE_IDENTITY_CONFLICT");
  }
}

function locatorInsert(db: D1Database, locator: Locator): D1PreparedStatement {
  return db.prepare(`INSERT OR IGNORE INTO legal_evidence_locators
    (id,object_kind,r2_key,media_type,byte_count,sha256,source_normalized_sha256,
      ordinal,schema_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
    locator.id,
    locator.objectKind,
    locator.r2Key,
    locator.mediaType,
    locator.byteCount,
    locator.sha256,
    locator.sourceNormalizedSha256,
    locator.ordinal,
    locator.schemaVersion,
    locator.createdAt,
  );
}

export async function importProvisionRendition(
  dependencies: { db: D1Database; bucket: LegalEvidenceBucket },
  untrustedInput: z.input<typeof importSchema>,
) {
  const input = importSchema.parse(untrustedInput);
  await assertNaturalIdentityAvailability(dependencies.db, input);
  const rawLocator = await immutablePut({
    bucket: dependencies.bucket,
    id: `raw:${input.captureId}`,
    objectKind: "raw_capture",
    key: `corpus/raw/lex/${input.captureId}/source.html`,
    mediaType: "text/html; charset=utf-8",
    bytes: utf8(input.rawCapture),
    ordinal: 0,
    createdAt: input.capturedAt,
  });
  const normalizedBytes = deterministicJson({
    schemaVersion: 1,
    legalInstrumentId: input.legalInstrumentId,
    publisherInstrumentToken: input.publisherInstrumentToken,
    officialExpressionId: input.officialExpressionId,
    textRevisionId: input.textRevisionId,
    publisherProvisionToken: input.publisherProvisionToken,
    publisherRevisionToken: input.publisherRevisionToken,
    languageTag: input.languageTag,
    script: input.script,
    textualAuthority: input.textualAuthority,
    origin: input.origin,
    publicationStatus: input.publicationStatus,
    controllingOnConflict: input.controllingOnConflict,
    derivedFromExpressionId: input.derivedFromExpressionId,
    authorityEvidence: input.authorityEvidence,
    actTitle: input.actTitle,
    documentType: input.documentType,
    sourceUrl: input.sourceUrl,
    capturedAt: input.capturedAt,
    rawCapture: {
      r2Key: rawLocator.r2Key,
      byteCount: rawLocator.byteCount,
      sha256: rawLocator.sha256,
    },
  });
  const normalizedLocator = await immutablePut({
    bucket: dependencies.bucket,
    id: `normalized:${input.textRevisionId}`,
    objectKind: "normalized_revision",
    key: `corpus/normalized/${input.textRevisionId}.json`,
    mediaType: "application/json; charset=utf-8",
    bytes: normalizedBytes,
    ordinal: 0,
    createdAt: input.capturedAt,
  });
  const provisionBytes = deterministicJson({
    schemaVersion: 1,
    legalInstrumentId: input.legalInstrumentId,
    publisherInstrumentToken: input.publisherInstrumentToken,
    officialExpressionId: input.officialExpressionId,
    textRevisionId: input.textRevisionId,
    provisionConceptId: input.provisionConceptId,
    publisherProvisionToken: input.publisherProvisionToken,
    provisionRenditionId: input.provisionRenditionId,
    languageTag: input.languageTag,
    script: input.script,
    textualAuthority: input.textualAuthority,
    actTitle: input.actTitle,
    documentType: input.documentType,
    articleNumber: input.articleNumber,
    articleTitle: input.articleTitle ?? null,
    provisionSequence: input.provisionSequence,
    provisionText: input.provisionText,
    sourceUrl: input.sourceUrl,
    capturedAt: input.capturedAt,
    sourceNormalizedSha256: normalizedLocator.sha256,
  });
  const provisionLocator = await immutablePut({
    bucket: dependencies.bucket,
    id: `provision:${input.provisionRenditionId}`,
    objectKind: "provision_rendition",
    key: `corpus/provisions/${input.textRevisionId}/${input.provisionRenditionId}.json`,
    mediaType: "application/json; charset=utf-8",
    bytes: provisionBytes,
    sourceNormalizedSha256: normalizedLocator.sha256,
    ordinal: input.provisionSequence,
    createdAt: input.capturedAt,
  });

  await dependencies.db.batch([
    locatorInsert(dependencies.db, rawLocator),
    locatorInsert(dependencies.db, normalizedLocator),
    locatorInsert(dependencies.db, provisionLocator),
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_instruments
      (id,publisher_instrument_token,canonical_title,document_type,canonical_url,created_at)
      VALUES (?,?,?,?,?,?)`).bind(
      input.legalInstrumentId, input.publisherInstrumentToken, input.actTitle,
      input.documentType, input.sourceUrl, input.capturedAt,
    ),
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_official_expressions
      (id,legal_instrument_id,language_tag,source_url,created_at,script,textual_authority,
        origin,publication_status,controlling_on_conflict,derived_from_expression_id,
        authority_evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      input.officialExpressionId, input.legalInstrumentId, input.languageTag,
      input.sourceUrl, input.capturedAt, input.script, input.textualAuthority,
      input.origin, input.publicationStatus, input.controllingOnConflict ? 1 : 0,
      input.derivedFromExpressionId, input.authorityEvidence
        ? JSON.stringify(input.authorityEvidence) : null,
    ),
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_text_revisions
      (id,official_expression_id,publisher_revision_token,raw_locator_id,
        normalized_locator_id,captured_at,created_at,script,textual_authority,
        authority_evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      input.textRevisionId, input.officialExpressionId, input.publisherRevisionToken,
      rawLocator.id, normalizedLocator.id, input.capturedAt, input.capturedAt,
      input.script, input.textualAuthority,
      input.authorityEvidence ? JSON.stringify(input.authorityEvidence) : null,
    ),
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_provision_concepts
      (id,legal_instrument_id,publisher_concept_token,created_at) VALUES (?,?,?,?)`).bind(
      input.provisionConceptId, input.legalInstrumentId,
      input.publisherProvisionToken, input.capturedAt,
    ),
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_provision_renditions
      (id,provision_concept_id,text_revision_id,locator_id,article_number,article_title,
        sequence,source_url,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      input.provisionRenditionId, input.provisionConceptId, input.textRevisionId,
      provisionLocator.id, input.articleNumber, input.articleTitle ?? null,
      input.provisionSequence, input.sourceUrl, "active", input.capturedAt,
    ),
    ...(input.textualAuthority === "unknown" ? [
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_official_eligibility
        (id,subject_type,subject_id,capability,status,reason_codes_json,evaluated_at)
        VALUES (?,?,?,?,?,?,?)`).bind(
        `eligibility:${input.provisionRenditionId}:current`, "provision_rendition",
        input.provisionRenditionId, "current", "ineligible",
        '["TEXTUAL_AUTHORITY_UNKNOWN"]', input.capturedAt,
      ),
    ] : []),
  ]);

  const persisted = await dependencies.db.prepare(`SELECT locator.r2_key AS r2Key,
      locator.byte_count AS byteCount,locator.sha256 AS sha256,
      locator.source_normalized_sha256 AS sourceNormalizedSha256
    FROM legal_provision_renditions rendition
    JOIN legal_evidence_locators locator ON locator.id=rendition.locator_id
    WHERE rendition.id=?`).bind(input.provisionRenditionId).first<{
      r2Key: string;
      byteCount: number;
      sha256: string;
      sourceNormalizedSha256: string;
    }>();
  if (
    !persisted
    || persisted.r2Key !== provisionLocator.r2Key
    || persisted.byteCount !== provisionLocator.byteCount
    || persisted.sha256 !== provisionLocator.sha256
    || persisted.sourceNormalizedSha256 !== provisionLocator.sourceNormalizedSha256
  ) throw new LegalEvidenceError("LEGAL_EVIDENCE_IDENTITY_CONFLICT");

  return {
    legalInstrumentId: input.legalInstrumentId,
    officialExpressionId: input.officialExpressionId,
    textRevisionId: input.textRevisionId,
    provisionConceptId: input.provisionConceptId,
    provisionRenditionId: input.provisionRenditionId,
    rawLocator,
    normalizedLocator,
    provisionLocator,
  };
}

type EvidenceRow = {
  legalInstrumentId: string;
  officialExpressionId: string;
  textRevisionId: string;
  provisionConceptId: string;
  provisionRenditionId: string;
  languageTag: string;
  script: string;
  textualAuthority: string;
  actTitle: string;
  articleNumber: string;
  sourceUrl: string;
  provisionKey: string;
  provisionBytes: number;
  provisionSha256: string;
  sourceNormalizedSha256: string;
  normalizedKey: string;
  normalizedBytes: number;
  normalizedSha256: string;
};

export async function resolveProvisionRendition(
  dependencies: { db: D1Database; bucket: Pick<LegalEvidenceBucket, "get"> },
  provisionRenditionId: string,
  untrustedEndpoint?: TemporalEndpoint,
): Promise<ResolvedOfficialEvidence> {
  const id = provisionRenditionIdSchema.parse(provisionRenditionId);
  const endpoint = untrustedEndpoint === undefined
    ? null
    : temporalEndpointSchema.parse(untrustedEndpoint);
  const temporalJoin = endpoint === null ? "" : endpoint.kind === "current" ? `
    JOIN legal_official_eligibility eligibility
      ON eligibility.subject_type='provision_rendition'
      AND eligibility.subject_id=rendition.id AND eligibility.capability='current'
      AND eligibility.status='eligible'
    JOIN legal_current_provision_pointers current_pointer
      ON current_pointer.provision_rendition_id=rendition.id` : `
    JOIN legal_official_eligibility eligibility
      ON eligibility.subject_type='provision_rendition'
      AND eligibility.subject_id=rendition.id AND eligibility.capability='as_of'
      AND eligibility.status='eligible'
    JOIN legal_applicability_periods applicability
      ON applicability.provision_rendition_id=rendition.id
      AND applicability.status='verified'
      AND applicability.valid_from<=?
      AND (applicability.valid_to IS NULL OR ?<applicability.valid_to)`;
  const temporalGuard = endpoint === null || endpoint.kind === "current" ? "" : `
      AND NOT EXISTS (
        SELECT 1 FROM legal_temporal_coverage_gaps temporal_gap
        WHERE temporal_gap.provision_rendition_id=rendition.id
          AND temporal_gap.status='open'
          AND (temporal_gap.valid_from IS NULL OR temporal_gap.valid_from<=?)
          AND (temporal_gap.valid_to IS NULL OR ?<temporal_gap.valid_to)
      )`;
  const statement = dependencies.db.prepare(`SELECT
      instrument.id AS legalInstrumentId,instrument.canonical_title AS actTitle,
      expression.id AS officialExpressionId,expression.language_tag AS languageTag,
      revision.script AS script,revision.textual_authority AS textualAuthority,
      revision.id AS textRevisionId,concept.id AS provisionConceptId,
      rendition.id AS provisionRenditionId,rendition.article_number AS articleNumber,
      rendition.source_url AS sourceUrl,provision_locator.r2_key AS provisionKey,
      provision_locator.byte_count AS provisionBytes,provision_locator.sha256 AS provisionSha256,
      provision_locator.source_normalized_sha256 AS sourceNormalizedSha256,
      normalized_locator.r2_key AS normalizedKey,normalized_locator.byte_count AS normalizedBytes,
      normalized_locator.sha256 AS normalizedSha256
    FROM legal_provision_renditions rendition
    JOIN legal_provision_concepts concept ON concept.id=rendition.provision_concept_id
    JOIN legal_instruments instrument ON instrument.id=concept.legal_instrument_id
    JOIN legal_text_revisions revision ON revision.id=rendition.text_revision_id
    JOIN legal_official_expressions expression ON expression.id=revision.official_expression_id
    JOIN legal_evidence_locators provision_locator ON provision_locator.id=rendition.locator_id
    JOIN legal_evidence_locators normalized_locator ON normalized_locator.id=revision.normalized_locator_id
    ${temporalJoin}
    WHERE rendition.id=?${temporalGuard}`);
  const row = await (endpoint === null || endpoint.kind === "current"
    ? statement.bind(id)
    : statement.bind(endpoint.instant, endpoint.instant, id, endpoint.instant, endpoint.instant))
    .first<EvidenceRow>();
  if (!row) throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
  const [provisionBytes] = await Promise.all([
    readAndVerifyObject(dependencies.bucket, {
      r2Key: row.provisionKey,
      byteCount: Number(row.provisionBytes),
      sha256: row.provisionSha256,
    }),
    readAndVerifyObject(dependencies.bucket, {
      r2Key: row.normalizedKey,
      byteCount: Number(row.normalizedBytes),
      sha256: row.normalizedSha256,
    }),
  ]);
  let provision: z.infer<typeof provisionObjectSchema>;
  try {
    provision = provisionObjectSchema.parse(JSON.parse(new TextDecoder().decode(provisionBytes)) as unknown);
  } catch {
    throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
  }
  if (
    provision.provisionRenditionId !== row.provisionRenditionId
    || provision.textRevisionId !== row.textRevisionId
    || provision.provisionConceptId !== row.provisionConceptId
    || provision.officialExpressionId !== row.officialExpressionId
    || provision.legalInstrumentId !== row.legalInstrumentId
    || provision.sourceNormalizedSha256 !== row.sourceNormalizedSha256
    || provision.sourceNormalizedSha256 !== row.normalizedSha256
    || provision.sourceUrl !== row.sourceUrl
  ) throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");

  return resolvedEvidenceSchema.parse({
    legalInstrumentId: row.legalInstrumentId,
    officialExpressionId: row.officialExpressionId,
    textRevisionId: row.textRevisionId,
    provisionConceptId: row.provisionConceptId,
    provisionRenditionId: row.provisionRenditionId,
    languageTag: row.languageTag,
    script: row.script,
    textualAuthority: row.textualAuthority,
    provisionText: provision.provisionText,
    officialCitation: {
      label: `${row.actTitle} — Article ${row.articleNumber}`,
      url: row.sourceUrl,
    },
    evidence: {
      provisionRenditionId: row.provisionRenditionId,
      r2Key: row.provisionKey,
      byteCount: Number(row.provisionBytes),
      sha256: row.provisionSha256,
      sourceNormalizedSha256: row.sourceNormalizedSha256,
      schemaVersion: 1,
    },
  });
}

const controllingResolutionSchema = z.object({
  controlling: resolvedEvidenceSchema,
  translation: resolvedEvidenceSchema.optional(),
  translationLabel: z.literal("Official Translation").optional(),
  materialCitation: resolvedEvidenceSchema.shape.officialCitation,
}).strict();

export type ControllingEvidenceResolution = z.infer<typeof controllingResolutionSchema>;
export function parseControllingEvidenceResolution(value: unknown): ControllingEvidenceResolution {
  return controllingResolutionSchema.parse(value);
}

export async function resolveControllingEvidence(
  dependencies: { db: D1Database; bucket: Pick<LegalEvidenceBucket, "get"> },
  discoveredProvisionRenditionId: string,
  untrustedEndpoint: TemporalEndpoint = { kind: "current" },
): Promise<ControllingEvidenceResolution> {
  const discoveredId = provisionRenditionIdSchema.parse(discoveredProvisionRenditionId);
  const endpoint = temporalEndpointSchema.parse(untrustedEndpoint);
  const discovered = await dependencies.db.prepare(`SELECT
      rendition.provision_concept_id AS provisionConceptId,
      revision.textual_authority AS textualAuthority
    FROM legal_provision_renditions rendition
    JOIN legal_text_revisions revision ON revision.id=rendition.text_revision_id
    WHERE rendition.id=?`).bind(discoveredId).first<{
      provisionConceptId: string;
      textualAuthority: string;
    }>();
  if (!discovered) throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
  const temporalJoin = endpoint.kind === "current" ? `
    JOIN legal_official_eligibility eligibility
      ON eligibility.subject_type='provision_rendition'
      AND eligibility.subject_id=rendition.id AND eligibility.capability='current'
      AND eligibility.status='eligible'
    JOIN legal_current_provision_pointers current_pointer
      ON current_pointer.provision_rendition_id=rendition.id` : `
    JOIN legal_official_eligibility eligibility
      ON eligibility.subject_type='provision_rendition'
      AND eligibility.subject_id=rendition.id AND eligibility.capability='as_of'
      AND eligibility.status='eligible'
    JOIN legal_applicability_periods applicability
      ON applicability.provision_rendition_id=rendition.id
      AND applicability.status='verified'
      AND applicability.valid_from<=?
      AND (applicability.valid_to IS NULL OR ?<applicability.valid_to)`;
  const temporalGuard = endpoint.kind === "current" ? "" : `
      AND NOT EXISTS (
        SELECT 1 FROM legal_temporal_coverage_gaps temporal_gap
        WHERE temporal_gap.provision_rendition_id=rendition.id
          AND temporal_gap.status='open'
          AND (temporal_gap.valid_from IS NULL OR temporal_gap.valid_from<=?)
          AND (temporal_gap.valid_to IS NULL OR ?<temporal_gap.valid_to)
      )`;
  const candidateStatement = dependencies.db.prepare(`SELECT rendition.id AS provisionRenditionId
    FROM legal_provision_renditions rendition
    JOIN legal_text_revisions revision ON revision.id=rendition.text_revision_id
    JOIN legal_official_expressions expression ON expression.id=revision.official_expression_id
    ${temporalJoin}
    WHERE rendition.provision_concept_id=?
      AND revision.textual_authority='controlling'
      AND revision.authority_evidence_json IS NOT NULL
      AND expression.controlling_on_conflict=1${temporalGuard}
    ORDER BY revision.captured_at DESC,rendition.id`);
  const candidates = await (endpoint.kind === "current"
    ? candidateStatement.bind(discovered.provisionConceptId)
    : candidateStatement.bind(
      endpoint.instant,
      endpoint.instant,
      discovered.provisionConceptId,
      endpoint.instant,
      endpoint.instant,
    )).all<{
      provisionRenditionId: string;
    }>();
  if (candidates.results.length !== 1) {
    throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
  }
  const controlling = await resolveProvisionRendition(
    dependencies,
    candidates.results[0]!.provisionRenditionId,
    endpoint,
  );
  const translation = discovered.textualAuthority === "official_translation"
    ? await resolveProvisionRendition(dependencies, discoveredId, endpoint)
    : undefined;
  return controllingResolutionSchema.parse({
    controlling,
    ...(translation ? { translation, translationLabel: "Official Translation" } : {}),
    materialCitation: controlling.officialCitation,
  });
}

export async function handleOfficialEvidenceRequest(
  request: Request,
  env: OfficialEvidenceEnv,
): Promise<Response> {
  const environment = legalEnvironmentSchema.safeParse(env.APP_ENV);
  if (!environment.success || !acceptsPrivateServiceRequest(request, {
    environment: environment.data,
    marker: SERVICE_BINDING_MARKER,
    method: "POST",
    path: OFFICIAL_EVIDENCE_RESOLVE_PATH,
    requireJson: true,
  })) {
    return privateServiceJson({ code: "OFFICIAL_EVIDENCE_PRIVATE_ROUTE_REJECTED" }, 404);
  }
  if (!env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET) {
    return privateServiceJson({ code: "SOURCE_UNAVAILABILITY" }, 503);
  }
  try {
    if (!declaredRequestBodyWithinLimit(request, 4_096)) {
      throw new TypeError("OFFICIAL_EVIDENCE_REQUEST_TOO_LARGE");
    }
    const body = z.object({
      provisionRenditionId: provisionRenditionIdSchema,
      mode: z.enum(["rendition", "controlling"]).default("rendition"),
      endpoint: temporalEndpointSchema.optional(),
    }).strict()
      .parse(await request.json());
    const dependencies = { db: env.LEGAL_DB, bucket: env.LEGAL_EVIDENCE_BUCKET };
    return privateServiceJson({ result: body.mode === "controlling"
      ? await resolveControllingEvidence(
        dependencies,
        body.provisionRenditionId,
        body.endpoint ?? { kind: "current" },
      )
      : await resolveProvisionRendition(dependencies, body.provisionRenditionId, body.endpoint) });
  } catch {
    return privateServiceJson({ code: "SOURCE_UNAVAILABILITY" }, 503);
  }
}

export function createOfficialEvidenceClient(input: {
  service: Fetcher;
  environment: z.infer<typeof legalEnvironmentSchema>;
}) {
  return {
    async resolve(
      provisionRenditionId: string,
      endpoint?: TemporalEndpoint,
    ): Promise<ResolvedOfficialEvidence> {
      const response = await input.service.fetch(
        `http://legal-corpus.internal${OFFICIAL_EVIDENCE_RESOLVE_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-service-binding": SERVICE_BINDING_MARKER,
            "x-juro-legal-environment": input.environment,
          },
          body: JSON.stringify({ provisionRenditionId, ...(endpoint ? { endpoint } : {}) }),
        },
      );
      if (!response.ok) throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
      try {
        return z.object({ result: resolvedEvidenceSchema }).strict().parse(await response.json()).result;
      } catch {
        throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
      }
    },
    async resolveControlling(
      provisionRenditionId: string,
      endpoint: TemporalEndpoint = { kind: "current" },
    ): Promise<ControllingEvidenceResolution> {
      const response = await input.service.fetch(
        `http://legal-corpus.internal${OFFICIAL_EVIDENCE_RESOLVE_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-service-binding": SERVICE_BINDING_MARKER,
            "x-juro-legal-environment": input.environment,
          },
          body: JSON.stringify({ provisionRenditionId, mode: "controlling", endpoint }),
        },
      );
      if (!response.ok) throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
      try {
        return z.object({ result: controllingResolutionSchema }).strict()
          .parse(await response.json()).result;
      } catch {
        throw new LegalEvidenceError("SOURCE_UNAVAILABILITY");
      }
    },
  };
}
