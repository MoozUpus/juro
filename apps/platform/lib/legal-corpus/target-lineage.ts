import { z } from "zod";

import {
  legalIdentifierSchema,
  lexDocumentUrlSchema,
  officialExpressionIdSchema,
  provisionConceptIdSchema,
  utcInstantSchema,
} from "./target-domain-schemas";
const transitionSchema = z.enum([
  "unchanged",
  "modified",
  "renumbered",
  "moved",
  "split",
  "merged",
  "repealed",
]);
const reviewSchema = z.object({
  reviewState: z.enum(["pending", "accepted", "rejected"]),
  reviewedBy: z.string().trim().min(1).max(160).nullable(),
  reviewedAt: utcInstantSchema.nullable(),
}).strict().superRefine((value, context) => {
  const reviewed = value.reviewedBy !== null && value.reviewedAt !== null;
  if ((value.reviewState === "pending" && reviewed)
    || (value.reviewState !== "pending" && !reviewed)) {
    context.addIssue({ code: "custom", message: "Review evidence state is inconsistent" });
  }
});
const lineageInputSchema = z.object({
  id: legalIdentifierSchema,
  predecessorConceptId: provisionConceptIdSchema,
  successorConceptId: provisionConceptIdSchema.nullable(),
  transition: transitionSchema,
  evidenceUrl: lexDocumentUrlSchema,
  reviewState: reviewSchema.shape.reviewState,
  reviewedBy: reviewSchema.shape.reviewedBy,
  reviewedAt: reviewSchema.shape.reviewedAt,
  recordedAt: utcInstantSchema,
}).strict().superRefine((value, context) => {
  const review = reviewSchema.safeParse({
    reviewState: value.reviewState,
    reviewedBy: value.reviewedBy,
    reviewedAt: value.reviewedAt,
  });
  if (!review.success) context.addIssue({ code: "custom", message: "Invalid review state" });
  if ((value.transition === "repealed") !== (value.successorConceptId === null)) {
    context.addIssue({ code: "custom", message: "Only repeal has no successor" });
  }
});

const provisionLineageSchema = z.object({
  id: legalIdentifierSchema,
  predecessorConceptId: provisionConceptIdSchema,
  successorConceptId: provisionConceptIdSchema.nullable(),
  transition: transitionSchema,
  evidenceUrl: lexDocumentUrlSchema,
  reviewState: z.literal("accepted"),
}).strict();

export type ProvisionLineage = z.infer<typeof provisionLineageSchema>;
export function parseProvisionLineages(value: unknown): ProvisionLineage[] {
  return z.array(provisionLineageSchema).parse(value);
}

export class LegalLineageError extends Error {
  constructor(readonly code: "LEGAL_LINEAGE_IDENTITY_CONFLICT") {
    super(code);
    this.name = "LegalLineageError";
  }
}

export async function recordProvisionLineage(
  dependencies: { db: D1Database },
  untrustedInput: z.input<typeof lineageInputSchema>,
): Promise<void> {
  const input = lineageInputSchema.parse(untrustedInput);
  await dependencies.db.prepare(`INSERT OR IGNORE INTO legal_provision_lineage_edges
    (id,predecessor_concept_id,successor_concept_id,transition,evidence_url,review_state,
      reviewed_by,reviewed_at,recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
    input.id,
    input.predecessorConceptId,
    input.successorConceptId,
    input.transition,
    input.evidenceUrl,
    input.reviewState,
    input.reviewedBy,
    input.reviewedAt,
    input.recordedAt,
  ).run();
  const row = await dependencies.db.prepare(`SELECT predecessor_concept_id AS predecessorConceptId,
      successor_concept_id AS successorConceptId,transition,evidence_url AS evidenceUrl,
      review_state AS reviewState,reviewed_by AS reviewedBy,reviewed_at AS reviewedAt,
      recorded_at AS recordedAt
    FROM legal_provision_lineage_edges WHERE id=?`).bind(input.id).first<Record<string, string | null>>();
  const expected = {
    predecessorConceptId: input.predecessorConceptId,
    successorConceptId: input.successorConceptId,
    transition: input.transition,
    evidenceUrl: input.evidenceUrl,
    reviewState: input.reviewState,
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt,
    recordedAt: input.recordedAt,
  };
  if (!row || JSON.stringify(row) !== JSON.stringify(expected)) {
    throw new LegalLineageError("LEGAL_LINEAGE_IDENTITY_CONFLICT");
  }
}

export async function resolveProvisionLineage(
  dependencies: { db: D1Database },
  untrustedLeftConceptIds: string[],
  untrustedRightConceptIds: string[],
): Promise<ProvisionLineage[]> {
  const left = [...new Set(z.array(provisionConceptIdSchema).max(12).parse(untrustedLeftConceptIds))].sort();
  const right = [...new Set(z.array(provisionConceptIdSchema).max(12).parse(untrustedRightConceptIds))].sort();
  if (left.length === 0 || right.length === 0) return [];
  const leftSlots = left.map(() => "?").join(",");
  const rightSlots = right.map(() => "?").join(",");
  const result = await dependencies.db.prepare(`SELECT id,
      predecessor_concept_id AS predecessorConceptId,
      successor_concept_id AS successorConceptId,transition,evidence_url AS evidenceUrl,
      review_state AS reviewState
    FROM legal_provision_lineage_edges
    WHERE review_state='accepted' AND (
      (predecessor_concept_id IN (${leftSlots}) AND successor_concept_id IN (${rightSlots}))
      OR (predecessor_concept_id IN (${rightSlots}) AND successor_concept_id IN (${leftSlots}))
      OR (transition='repealed' AND predecessor_concept_id IN (${leftSlots}))
      OR (transition='repealed' AND predecessor_concept_id IN (${rightSlots}))
    ) ORDER BY id`).bind(...left, ...right, ...right, ...left, ...left, ...right)
    .all<Record<string, unknown>>();
  return parseProvisionLineages(result.results);
}

const equivalenceInputSchema = z.object({
  id: legalIdentifierSchema,
  leftExpressionId: officialExpressionIdSchema,
  rightExpressionId: officialExpressionIdSchema,
  equivalenceKind: z.enum(["official_translation", "cross_script", "publisher_equivalent"]),
  evidenceUrl: lexDocumentUrlSchema,
  reviewState: reviewSchema.shape.reviewState,
  reviewedBy: reviewSchema.shape.reviewedBy,
  reviewedAt: reviewSchema.shape.reviewedAt,
  recordedAt: utcInstantSchema,
}).strict();

export async function recordOfficialExpressionEquivalence(
  dependencies: { db: D1Database },
  untrustedInput: z.input<typeof equivalenceInputSchema>,
): Promise<void> {
  const parsed = equivalenceInputSchema.parse(untrustedInput);
  reviewSchema.parse({
    reviewState: parsed.reviewState,
    reviewedBy: parsed.reviewedBy,
    reviewedAt: parsed.reviewedAt,
  });
  const [left, right] = [parsed.leftExpressionId, parsed.rightExpressionId].sort();
  if (!left || !right || left === right) throw new LegalLineageError("LEGAL_LINEAGE_IDENTITY_CONFLICT");
  await dependencies.db.prepare(`INSERT OR IGNORE INTO legal_official_expression_equivalences
    (id,left_expression_id,right_expression_id,equivalence_kind,evidence_url,review_state,
      reviewed_by,reviewed_at,recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
    parsed.id,
    left,
    right,
    parsed.equivalenceKind,
    parsed.evidenceUrl,
    parsed.reviewState,
    parsed.reviewedBy,
    parsed.reviewedAt,
    parsed.recordedAt,
  ).run();
  const row = await dependencies.db.prepare(`SELECT id,left_expression_id AS leftExpressionId,
      right_expression_id AS rightExpressionId,equivalence_kind AS equivalenceKind,
      evidence_url AS evidenceUrl,review_state AS reviewState,reviewed_by AS reviewedBy,
      reviewed_at AS reviewedAt,recorded_at AS recordedAt
    FROM legal_official_expression_equivalences
    WHERE id=? OR (left_expression_id=? AND right_expression_id=?
      AND equivalence_kind=? AND evidence_url=?)`).bind(
    parsed.id,
    left,
    right,
    parsed.equivalenceKind,
    parsed.evidenceUrl,
  ).first<Record<string, string | null>>();
  const expected = {
    id: parsed.id,
    leftExpressionId: left,
    rightExpressionId: right,
    equivalenceKind: parsed.equivalenceKind,
    evidenceUrl: parsed.evidenceUrl,
    reviewState: parsed.reviewState,
    reviewedBy: parsed.reviewedBy,
    reviewedAt: parsed.reviewedAt,
    recordedAt: parsed.recordedAt,
  };
  if (!row || JSON.stringify(row) !== JSON.stringify(expected)) {
    throw new LegalLineageError("LEGAL_LINEAGE_IDENTITY_CONFLICT");
  }
}
