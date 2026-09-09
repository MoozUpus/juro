import { z } from "zod";

import {
  legalIdentifierSchema,
  legalLanguageSchema,
  lexDocumentUrlSchema,
  provisionRenditionIdSchema,
  searchReleaseIdSchema,
  textRevisionIdSchema,
  utcInstantSchema,
} from "./target-domain-schemas";
const intervalSchema = z.object({
  validFrom: utcInstantSchema,
  validTo: utcInstantSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.validTo !== null && value.validFrom >= value.validTo) {
    context.addIssue({ code: "custom", message: "Half-open interval must be non-empty" });
  }
});
const applicabilitySchema = intervalSchema.and(z.object({
  evidenceUrl: lexDocumentUrlSchema,
  evidenceKind: z.enum([
    "commencement_clause",
    "amendment_act",
    "repeal_act",
    "official_timeline",
  ]),
}).strict());
const gapSchema = z.object({
  kind: z.enum(["unknown", "ambiguous", "disputed"]),
  validFrom: utcInstantSchema.nullable(),
  validTo: utcInstantSchema.nullable(),
  evidenceUrl: lexDocumentUrlSchema,
  reason: z.string().trim().min(10).max(2_000),
}).strict().superRefine((value, context) => {
  if (value.validFrom && value.validTo && value.validFrom >= value.validTo) {
    context.addIssue({ code: "custom", message: "Temporal gap interval must be non-empty" });
  }
});
const temporalEvidenceSchema = z.object({
  id: legalIdentifierSchema,
  textRevisionId: textRevisionIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  editorialValidFrom: utcInstantSchema,
  editorialValidTo: utcInstantSchema.nullable(),
  applicability: applicabilitySchema.optional(),
  applicabilityGap: gapSchema.optional(),
  currentPointer: z.object({
    evidenceUrl: lexDocumentUrlSchema,
    verifiedAt: utcInstantSchema,
  }).strict().optional(),
  recordedAt: utcInstantSchema,
}).strict().superRefine((value, context) => {
  if (value.editorialValidTo !== null && value.editorialValidFrom >= value.editorialValidTo) {
    context.addIssue({ code: "custom", message: "Editorial validity interval must be non-empty" });
  }
  if ((value.applicability ? 1 : 0) + (value.applicabilityGap ? 1 : 0) !== 1) {
    context.addIssue({ code: "custom", message: "Exactly one applicability fact or gap is required" });
  }
});

type TemporalEvidenceInput = z.input<typeof temporalEvidenceSchema>;

export class LegalTemporalError extends Error {
  constructor(readonly code:
    | "LEGAL_TEMPORAL_IDENTITY_CONFLICT"
    | "SEARCH_RELEASE_METADATA_MISMATCH") {
    super(code);
    this.name = "LegalTemporalError";
  }
}

export async function recordProvisionTemporalEvidence(
  dependencies: { db: D1Database },
  untrustedInput: TemporalEvidenceInput,
): Promise<void> {
  const input = temporalEvidenceSchema.parse(untrustedInput);
  const statements: D1PreparedStatement[] = [
    dependencies.db.prepare(`INSERT OR IGNORE INTO legal_text_revision_validity
      (text_revision_id,valid_from,valid_to,recorded_at) VALUES (?,?,?,?)`).bind(
      input.textRevisionId,
      input.editorialValidFrom,
      input.editorialValidTo,
      input.recordedAt,
    ),
  ];
  if (input.applicability) {
    statements.push(
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_applicability_periods
        (id,provision_rendition_id,valid_from,valid_to,evidence_url,evidence_kind,status,recorded_at)
        VALUES (?,?,?,?,?,?,'verified',?)`).bind(
        input.id,
        input.provisionRenditionId,
        input.applicability.validFrom,
        input.applicability.validTo,
        input.applicability.evidenceUrl,
        input.applicability.evidenceKind,
        input.recordedAt,
      ),
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_official_eligibility
        (id,subject_type,subject_id,capability,status,reason_codes_json,evaluated_at)
        VALUES (?,?,?,?,?,?,?)`).bind(
        `eligibility:${input.provisionRenditionId}:as_of`,
        "provision_rendition",
        input.provisionRenditionId,
        "as_of",
        "eligible",
        "[]",
        input.recordedAt,
      ),
    );
  } else if (input.applicabilityGap) {
    statements.push(
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_temporal_coverage_gaps
        (id,provision_rendition_id,gap_kind,valid_from,valid_to,evidence_url,reason,status,recorded_at)
        VALUES (?,?,?,?,?,?,?,'open',?)`).bind(
        input.id,
        input.provisionRenditionId,
        input.applicabilityGap.kind,
        input.applicabilityGap.validFrom,
        input.applicabilityGap.validTo,
        input.applicabilityGap.evidenceUrl,
        input.applicabilityGap.reason,
        input.recordedAt,
      ),
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_official_eligibility
        (id,subject_type,subject_id,capability,status,reason_codes_json,evaluated_at)
        VALUES (?,?,?,?,?,?,?)`).bind(
        `eligibility:${input.provisionRenditionId}:as_of`,
        "provision_rendition",
        input.provisionRenditionId,
        "as_of",
        "gap",
        JSON.stringify([`TEMPORAL_${input.applicabilityGap.kind.toUpperCase()}`]),
        input.recordedAt,
      ),
    );
  }
  if (input.currentPointer) {
    statements.push(
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_current_provision_pointers
        (provision_rendition_id,evidence_url,verified_at,recorded_at) VALUES (?,?,?,?)`).bind(
        input.provisionRenditionId,
        input.currentPointer.evidenceUrl,
        input.currentPointer.verifiedAt,
        input.recordedAt,
      ),
      dependencies.db.prepare(`INSERT OR IGNORE INTO legal_official_eligibility
        (id,subject_type,subject_id,capability,status,reason_codes_json,evaluated_at)
        SELECT ?,'provision_rendition',rendition.id,'current','eligible','[]',?
        FROM legal_provision_renditions rendition
        JOIN legal_text_revisions revision ON revision.id=rendition.text_revision_id
        WHERE rendition.id=? AND revision.textual_authority<>'unknown'`).bind(
        `eligibility:${input.provisionRenditionId}:current`,
        input.recordedAt,
        input.provisionRenditionId,
      ),
    );
  }
  await dependencies.db.batch(statements);

  const editorial = await dependencies.db.prepare(`SELECT valid_from AS validFrom,
      valid_to AS validTo,recorded_at AS recordedAt FROM legal_text_revision_validity
    WHERE text_revision_id=?`).bind(input.textRevisionId).first<{
      validFrom: string;
      validTo: string | null;
      recordedAt: string;
    }>();
  if (
    !editorial
    || editorial.validFrom !== input.editorialValidFrom
    || editorial.validTo !== input.editorialValidTo
    || editorial.recordedAt !== input.recordedAt
  ) throw new LegalTemporalError("LEGAL_TEMPORAL_IDENTITY_CONFLICT");

  const fact = input.applicability
    ? await dependencies.db.prepare(`SELECT provision_rendition_id AS provisionRenditionId,
        valid_from AS validFrom,valid_to AS validTo,evidence_url AS evidenceUrl,
        evidence_kind AS evidenceKind,recorded_at AS recordedAt
      FROM legal_applicability_periods WHERE id=?`).bind(input.id).first<Record<string, string | null>>()
    : await dependencies.db.prepare(`SELECT provision_rendition_id AS provisionRenditionId,
        gap_kind AS kind,valid_from AS validFrom,valid_to AS validTo,evidence_url AS evidenceUrl,
        reason,recorded_at AS recordedAt
      FROM legal_temporal_coverage_gaps WHERE id=?`).bind(input.id).first<Record<string, string | null>>();
  const expected = input.applicability ? {
    provisionRenditionId: input.provisionRenditionId,
    validFrom: input.applicability.validFrom,
    validTo: input.applicability.validTo,
    evidenceUrl: input.applicability.evidenceUrl,
    evidenceKind: input.applicability.evidenceKind,
    recordedAt: input.recordedAt,
  } : {
    provisionRenditionId: input.provisionRenditionId,
    kind: input.applicabilityGap!.kind,
    validFrom: input.applicabilityGap!.validFrom,
    validTo: input.applicabilityGap!.validTo,
    evidenceUrl: input.applicabilityGap!.evidenceUrl,
    reason: input.applicabilityGap!.reason,
    recordedAt: input.recordedAt,
  };
  if (!fact || JSON.stringify(fact) !== JSON.stringify(expected)) {
    throw new LegalTemporalError("LEGAL_TEMPORAL_IDENTITY_CONFLICT");
  }

  const asOfEligibility = await dependencies.db.prepare(`SELECT status,
      reason_codes_json AS reasonCodes,evaluated_at AS evaluatedAt
    FROM legal_official_eligibility
    WHERE subject_type='provision_rendition' AND subject_id=? AND capability='as_of'`)
    .bind(input.provisionRenditionId).first<{
      status: string;
      reasonCodes: string;
      evaluatedAt: string;
    }>();
  const expectedAsOfEligibility = input.applicability ? {
    status: "eligible",
    reasonCodes: "[]",
    evaluatedAt: input.recordedAt,
  } : {
    status: "gap",
    reasonCodes: JSON.stringify([`TEMPORAL_${input.applicabilityGap!.kind.toUpperCase()}`]),
    evaluatedAt: input.recordedAt,
  };
  if (!asOfEligibility
    || JSON.stringify(asOfEligibility) !== JSON.stringify(expectedAsOfEligibility)) {
    throw new LegalTemporalError("LEGAL_TEMPORAL_IDENTITY_CONFLICT");
  }

  const currentPointer = await dependencies.db.prepare(`SELECT evidence_url AS evidenceUrl,
      verified_at AS verifiedAt,recorded_at AS recordedAt
    FROM legal_current_provision_pointers WHERE provision_rendition_id=?`)
    .bind(input.provisionRenditionId).first<{
      evidenceUrl: string;
      verifiedAt: string;
      recordedAt: string;
    }>();
  const currentEligibility = await dependencies.db.prepare(`SELECT status,
      reason_codes_json AS reasonCodes,evaluated_at AS evaluatedAt
    FROM legal_official_eligibility
    WHERE subject_type='provision_rendition' AND subject_id=? AND capability='current'`)
    .bind(input.provisionRenditionId).first<{
      status: string;
      reasonCodes: string;
      evaluatedAt: string;
    }>();
  const expectedPointer = input.currentPointer ? {
    evidenceUrl: input.currentPointer.evidenceUrl,
    verifiedAt: input.currentPointer.verifiedAt,
    recordedAt: input.recordedAt,
  } : null;
  const expectedCurrentEligibility = input.currentPointer ? {
    status: "eligible",
    reasonCodes: "[]",
    evaluatedAt: input.recordedAt,
  } : null;
  if (JSON.stringify(currentPointer ?? null) !== JSON.stringify(expectedPointer)
    || JSON.stringify(currentEligibility ?? null) !== JSON.stringify(expectedCurrentEligibility)) {
    throw new LegalTemporalError("LEGAL_TEMPORAL_IDENTITY_CONFLICT");
  }
}

const providerMetadataSchema = z.object({
  itemKey: z.string().min(1).max(700),
  language: legalLanguageSchema,
  documentType: z.string().trim().min(1).max(160),
  validFrom: utcInstantSchema,
  validTo: utcInstantSchema.nullable(),
}).strict();

export async function assertSearchReleaseMetadataParity(
  dependencies: { db: D1Database },
  searchReleaseId: string,
  untrustedProviderMetadata: z.input<typeof providerMetadataSchema>[],
) {
  const releaseId = searchReleaseIdSchema.parse(searchReleaseId);
  const provider = z.array(providerMetadataSchema).parse(untrustedProviderMetadata);
  const expected = await dependencies.db.prepare(`SELECT item_key AS itemKey,language,
      document_type AS documentType,valid_from AS validFrom,valid_to AS validTo
    FROM legal_search_release_items WHERE search_release_id=? ORDER BY item_key`).bind(releaseId).all<{
      itemKey: string;
      language: string | null;
      documentType: string | null;
      validFrom: string | null;
      validTo: string | null;
    }>();
  const normalizedProvider = [...provider].sort((left, right) => left.itemKey.localeCompare(right.itemKey));
  const mismatches: string[] = [];
  const expectedByKey = new Map(expected.results.map((item) => [item.itemKey, item]));
  const providerByKey = new Map(normalizedProvider.map((item) => [item.itemKey, item]));
  for (const item of expected.results) {
    const actual = providerByKey.get(item.itemKey);
    if (!actual || actual.language !== item.language || actual.documentType !== item.documentType
      || actual.validFrom !== item.validFrom || actual.validTo !== item.validTo) {
      mismatches.push(item.itemKey);
    }
  }
  for (const item of normalizedProvider) {
    if (!expectedByKey.has(item.itemKey)) mismatches.push(item.itemKey);
  }
  const report = {
    expectedCount: expected.results.length,
    providerCount: provider.length,
    mismatches: [...new Set(mismatches)].sort(),
  };
  if (report.expectedCount !== report.providerCount || report.mismatches.length > 0) {
    throw new LegalTemporalError("SEARCH_RELEASE_METADATA_MISMATCH");
  }
  return report;
}
