import { z } from "zod";

import {
  candidateSchema,
  type CandidatePacket,
  type LegalCandidateIndex,
  type PinnedCandidateRelease,
  type TemporalEndpoint,
} from "./legal-candidate-index";
import type { ControllingEvidenceResolution } from "./target-evidence";
import {
  acceptsPrivateServiceRequest,
  declaredRequestBodyWithinLimit,
  privateServiceJson,
} from "./private-service-boundary";
import {
  canonicalChunkIdSchema,
  legalEnvironmentSchema,
  legalIdentifierSchema,
  provisionConceptIdSchema,
  provisionRenditionIdSchema,
  sha256Schema,
  textRevisionIdSchema,
  utcInstantSchema,
} from "./target-domain-schemas";

export const TARGET_LEGAL_ANSWER_PATH = "/internal/legal-corpus/target/retrieval/answer";

const SERVICE_BINDING_MARKER = "target-legal-answer-v1";
const questionSchema = z.object({
  id: legalIdentifierSchema,
  question: z.string().trim().min(1).max(4_000),
}).strict();
const requirementSchema = z.object({
  id: legalIdentifierSchema,
  statement: z.string().trim().min(1).max(1_000),
}).strict();
const readingSchema = z.object({
  id: legalIdentifierSchema,
  statement: z.string().trim().min(1).max(1_500),
  requirements: z.array(requirementSchema).min(1).max(20),
}).strict();
const formulationSchema = z.object({
  id: legalIdentifierSchema,
  text: z.string().trim().min(1).max(900),
  legalTitleSpans: z.array(z.string().trim().min(3).max(300)).max(12).optional(),
  privateNameSpans: z.array(z.string().trim().min(1).max(300)).max(24),
  readingIds: z.array(legalIdentifierSchema).min(1),
  requirementIds: z.array(legalIdentifierSchema).min(1),
  kind: z.enum(["exact", "legal_register", "cross_language", "repair"]),
}).strict();
const missingCaseFactSchema = z.object({
  id: legalIdentifierSchema,
  question: z.string().trim().min(1).max(1_000),
  material: z.boolean(),
}).strict();
const temporalEndpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current") }).strict(),
  z.object({ kind: z.literal("timestamp"), instant: utcInstantSchema }).strict(),
]);
const comparisonScopeSchema = z.object({
  left: temporalEndpointSchema,
  right: temporalEndpointSchema,
}).strict();
const interpretationPlanSchema = z.object({
  id: legalIdentifierSchema,
  originalLanguage: z.string().trim().min(2).max(35),
  answerLanguage: z.string().trim().min(2).max(35),
  readings: z.array(readingSchema).min(1).max(12),
  formulations: z.array(formulationSchema).min(1).max(64),
  missingCaseFacts: z.array(missingCaseFactSchema).max(20),
  temporalEndpoint: temporalEndpointSchema.optional(),
  comparison: comparisonScopeSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.temporalEndpoint && value.comparison) {
    context.addIssue({ code: "custom", message: "Choose one endpoint or a comparison" });
  }
});

export type QuestionInterpretationPlan = z.infer<typeof interpretationPlanSchema>;
export function parseQuestionInterpretationPlan(value: unknown): QuestionInterpretationPlan {
  return interpretationPlanSchema.parse(value);
}
const revalidatedCandidateSchema = z.object({
  candidate: candidateSchema,
  canonicalChunkId: canonicalChunkIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  textRevisionId: textRevisionIdSchema,
  provisionConceptId: provisionConceptIdSchema,
  languageFamily: z.enum(["uz", "ru", "en"]),
  textualAuthority: z.enum(["controlling", "official_translation", "unknown"]),
}).strict();
export type RevalidatedCandidate = z.infer<typeof revalidatedCandidateSchema>;
export function parseRevalidatedCandidates(value: unknown): RevalidatedCandidate[] {
  return z.array(revalidatedCandidateSchema).parse(value);
}

const repairDecisionSchema = z.object({
  outcome: z.literal("repair"),
  repairFormulation: formulationSchema,
}).strict();
const rejectedDecisionSchema = z.object({ outcome: z.literal("rejected") }).strict();
const selectedDecisionSchema = z.object({
  outcome: z.literal("selected"),
  mainPoint: z.string().trim().min(1).max(4_000),
  propositions: z.array(z.object({
    requirementId: legalIdentifierSchema,
    statement: z.string().trim().min(1).max(4_000),
  }).strict()).min(1).max(40),
  selections: z.array(z.object({
    itemKey: z.string().min(1).max(700),
    requirementIds: z.array(legalIdentifierSchema).min(1),
  }).strict()).min(1).max(300),
  whatToDoNext: z.array(z.string().trim().min(1).max(2_000)).max(20),
}).strict();
const selectionDecisionSchema = z.discriminatedUnion("outcome", [
  repairDecisionSchema,
  rejectedDecisionSchema,
  selectedDecisionSchema,
]);
export type SelectionDecision = z.infer<typeof selectionDecisionSchema>;
export function parseSelectionDecision(value: unknown): SelectionDecision {
  return selectionDecisionSchema.parse(value);
}

const officialCitationSchema = z.object({
  label: z.string().min(1).max(2_300),
  url: z.string().url(),
}).strict();
const lawStatementSchema = z.object({
  requirementId: legalIdentifierSchema,
  provisionConceptId: provisionConceptIdSchema,
  provisionRenditionId: provisionRenditionIdSchema,
  proposition: z.string().min(1).max(4_000),
  controllingQuotation: z.string().min(1).max(500_000),
  officialCitations: z.array(officialCitationSchema).min(1),
  evidenceSha256: sha256Schema,
  officialTranslation: z.object({
    label: z.literal("Official Translation"),
    quotation: z.string().min(1).max(500_000),
  }).strict().optional(),
}).strict();
const answerSchema = z.object({
  kind: z.enum(["legal_answer", "conditional_answer"]),
  sourceLadder: z.literal("indexed_official_corpus"),
  mainPoint: z.string().min(1).max(4_000),
  whatTheLawSays: z.array(lawStatementSchema).min(1).max(120),
  whatToDoNext: z.array(z.string().min(1).max(2_000)).max(20),
  focusedQuestions: z.array(z.string().min(1).max(1_000)).max(20),
  formulationsUsed: z.number().int().min(1).max(6),
  repairQueriesUsed: z.number().int().min(0).max(1),
  temporalEndpoint: temporalEndpointSchema,
}).strict();
const clarificationSchema = z.object({
  kind: z.literal("clarification_required"),
  sourceLadder: z.literal("indexed_official_corpus"),
  focusedQuestions: z.array(z.string().min(1).max(1_000)).min(1),
  safeErrorCode: z.enum(["FORMULATION_BUDGET_EXCEEDED", "EVIDENCE_CEILING_EXCEEDED"]),
}).strict();
const sourceUnavailableSchema = z.object({
  kind: z.literal("source_unavailability"),
  sourceLadder: z.literal("indexed_official_corpus"),
  nextTier: z.literal("live_official_search"),
  safeErrorCode: z.enum([
    "INDEXED_CANDIDATE_UNAVAILABLE",
    "INDEXED_REVALIDATION_FAILED",
    "INDEXED_EVIDENCE_UNAVAILABLE",
  ]),
}).strict();
const insufficientSchema = z.object({
  kind: z.literal("insufficient_indexed_coverage"),
  sourceLadder: z.literal("indexed_official_corpus"),
  nextTier: z.literal("live_official_search"),
  uncoveredRequirementIds: z.array(legalIdentifierSchema),
}).strict();
const lineageSchema = z.object({
  id: legalIdentifierSchema,
  predecessorConceptId: provisionConceptIdSchema,
  successorConceptId: provisionConceptIdSchema.nullable(),
  transition: z.enum([
    "unchanged",
    "modified",
    "renumbered",
    "moved",
    "split",
    "merged",
    "repealed",
  ]),
  evidenceUrl: z.string().url(),
  reviewState: z.literal("accepted"),
}).strict();
const comparisonAnswerSchema = z.object({
  kind: z.literal("comparison_answer"),
  sourceLadder: z.literal("indexed_official_corpus"),
  temporalScope: comparisonScopeSchema.extend({ kind: z.literal("comparison") }).strict(),
  left: answerSchema,
  right: answerSchema,
  transitions: z.array(lineageSchema).min(1).max(144),
  mainPoint: z.string().min(1).max(8_000),
  endpointFormulationSearches: z.number().int().min(2).max(12),
}).strict();
const retrievalResultSchema = z.discriminatedUnion("kind", [
  answerSchema,
  comparisonAnswerSchema,
  clarificationSchema,
  sourceUnavailableSchema,
  insufficientSchema,
]);

export type TargetLegalAnswerResult = z.infer<typeof retrievalResultSchema>;
export type TargetLegalAnswerRetriever = {
  answer(input: z.input<typeof questionSchema>): Promise<TargetLegalAnswerResult>;
};

type Dependencies = {
  environment: z.infer<typeof legalEnvironmentSchema>;
  interpreter: {
    interpret(question: string): Promise<QuestionInterpretationPlan>;
  };
  releaseResolver: {
    resolve(endpoint: TemporalEndpoint): Promise<PinnedCandidateRelease | null>;
  };
  candidateIndex: LegalCandidateIndex;
  candidateCatalog: {
    revalidate(
      packet: CandidatePacket,
      endpoint: TemporalEndpoint,
      release: PinnedCandidateRelease,
    ): Promise<RevalidatedCandidate[]>;
  };
  evidenceResolver: {
    resolveControlling(
      provisionRenditionId: string,
      endpoint: TemporalEndpoint,
    ): Promise<ControllingEvidenceResolution>;
  };
  provisionSelector: {
    select(input: {
      plan: QuestionInterpretationPlan;
      candidates: RevalidatedCandidate[];
      repairAttempted: boolean;
    }): Promise<SelectionDecision>;
  };
  lineageResolver?: {
    resolve(leftConceptIds: string[], rightConceptIds: string[]): Promise<z.input<typeof lineageSchema>[]>;
  };
};

function requirementInventory(plan: QuestionInterpretationPlan): {
  readingIds: Set<string>;
  requirementIds: Set<string>;
  requirementReading: Map<string, string>;
} | null {
  const readingIds = new Set<string>();
  const requirementIds = new Set<string>();
  const requirementReading = new Map<string, string>();
  for (const reading of plan.readings) {
    if (readingIds.has(reading.id)) return null;
    readingIds.add(reading.id);
    for (const requirement of reading.requirements) {
      if (requirementIds.has(requirement.id)) return null;
      requirementIds.add(requirement.id);
      requirementReading.set(requirement.id, reading.id);
    }
  }
  return { readingIds, requirementIds, requirementReading };
}

function formulationsRespectPlan(
  plan: QuestionInterpretationPlan,
  formulations: readonly z.infer<typeof formulationSchema>[],
): boolean {
  const inventory = requirementInventory(plan);
  if (!inventory) return false;
  const readingCounts = new Map([...inventory.readingIds].map((id) => [id, 0]));
  for (const formulation of formulations) {
    const readingIds = [...new Set(formulation.readingIds)];
    const requirementIds = [...new Set(formulation.requirementIds)];
    if (
      readingIds.some((id) => !inventory.readingIds.has(id))
      || requirementIds.some((id) => !inventory.requirementIds.has(id))
      || requirementIds.some((id) => !readingIds.includes(inventory.requirementReading.get(id)!))
    ) return false;
    const createsSecond = readingIds.some((id) => (readingCounts.get(id) ?? 0) > 0);
    if (createsSecond && [...readingCounts.values()].some((count) => count === 0)) return false;
    readingIds.forEach((id) => readingCounts.set(id, (readingCounts.get(id) ?? 0) + 1));
  }
  return [...readingCounts.values()].every((count) => count > 0);
}

function candidateInterpretation(
  plan: QuestionInterpretationPlan,
  formulations: readonly z.infer<typeof formulationSchema>[],
) {
  return {
    id: plan.id,
    formulations: formulations.map(({
      id, text, legalTitleSpans, privateNameSpans, readingIds, requirementIds,
    }) => ({
      id,
      text,
      legalTitleSpans,
      privateNameSpans,
      readingIds,
      requirementIds,
    })),
  };
}

function insufficient(plan: QuestionInterpretationPlan, covered = new Set<string>()): TargetLegalAnswerResult {
  return insufficientSchema.parse({
    kind: "insufficient_indexed_coverage",
    sourceLadder: "indexed_official_corpus",
    nextTier: "live_official_search",
    uncoveredRequirementIds: plan.readings
      .flatMap((reading) => reading.requirements)
      .map((requirement) => requirement.id)
      .filter((id) => !covered.has(id)),
  });
}

function sourceUnavailable(
  safeErrorCode: z.infer<typeof sourceUnavailableSchema>["safeErrorCode"],
): TargetLegalAnswerResult {
  return sourceUnavailableSchema.parse({
    kind: "source_unavailability",
    sourceLadder: "indexed_official_corpus",
    nextTier: "live_official_search",
    safeErrorCode,
  });
}

function stableCandidateIdentity(entry: RevalidatedCandidate): string {
  return [
    entry.canonicalChunkId,
    entry.provisionRenditionId,
    entry.textRevisionId,
    entry.provisionConceptId,
    entry.languageFamily,
    entry.textualAuthority,
  ].join("\u001f");
}

function mergeCandidateCoverage(
  preferred: RevalidatedCandidate,
  other: RevalidatedCandidate,
): RevalidatedCandidate {
  return {
    ...preferred,
    candidate: {
      ...preferred.candidate,
      readingIds: [...new Set([
        ...preferred.candidate.readingIds,
        ...other.candidate.readingIds,
      ])].sort(),
      requirementIds: [...new Set([
        ...preferred.candidate.requirementIds,
        ...other.candidate.requirementIds,
      ])].sort(),
    },
  };
}

function mergeRevalidatedCandidates(
  packets: readonly RevalidatedCandidate[][],
): RevalidatedCandidate[] | null {
  let entries: RevalidatedCandidate[];
  try {
    entries = parseRevalidatedCandidates(packets.flat());
  } catch {
    return null;
  }
  const merged = new Map<string, RevalidatedCandidate>();
  const identityByItemKey = new Map<string, string>();
  for (const entry of entries) {
    const identity = stableCandidateIdentity(entry);
    const knownIdentity = identityByItemKey.get(entry.candidate.itemKey);
    if (knownIdentity && knownIdentity !== identity) return null;
    identityByItemKey.set(entry.candidate.itemKey, identity);
    const existing = merged.get(identity);
    if (!existing) merged.set(identity, entry);
    else if (entry.candidate.fusionScore > existing.candidate.fusionScore) {
      merged.set(identity, mergeCandidateCoverage(entry, existing));
    } else merged.set(identity, mergeCandidateCoverage(existing, entry));
  }
  return [...merged.values()].sort((left, right) =>
    right.candidate.fusionScore - left.candidate.fusionScore
    || left.candidate.itemKey.localeCompare(right.candidate.itemKey));
}

export function createTargetLegalAnswerRetriever(dependencies: Dependencies): TargetLegalAnswerRetriever {
  const environment = legalEnvironmentSchema.parse(dependencies.environment);
  return {
    async answer(untrustedInput) {
      const request = questionSchema.parse(untrustedInput);
      let plan: QuestionInterpretationPlan;
      try {
        plan = interpretationPlanSchema.parse(await dependencies.interpreter.interpret(request.question));
      } catch {
        return sourceUnavailable("INDEXED_CANDIDATE_UNAVAILABLE");
      }
      if (
        plan.formulations.length > 6
        || !formulationsRespectPlan(plan, plan.formulations)
      ) {
        return clarificationSchema.parse({
          kind: "clarification_required",
          sourceLadder: "indexed_official_corpus",
          focusedQuestions: ["Please narrow the question to the material legal readings that should be checked."],
          safeErrorCode: "FORMULATION_BUDGET_EXCEEDED",
        });
      }
      if (plan.comparison) {
        const { comparison, temporalEndpoint, ...sharedPlan } = plan;
        void temporalEndpoint;
        const runEndpoint = async (endpoint: TemporalEndpoint) => createTargetLegalAnswerRetriever({
          ...dependencies,
          interpreter: {
            interpret: async () => ({ ...sharedPlan, temporalEndpoint: endpoint }),
          },
        }).answer(request);
        const left = await runEndpoint(comparison.left);
        if (left.kind !== "legal_answer" && left.kind !== "conditional_answer") {
          return left;
        }
        const right = await runEndpoint(comparison.right);
        if (right.kind !== "legal_answer" && right.kind !== "conditional_answer") {
          return right;
        }
        if (!dependencies.lineageResolver) {
          return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
        }
        let transitions: z.infer<typeof lineageSchema>[];
        const leftConceptIds = [...new Set(left.whatTheLawSays
          .map((statement) => statement.provisionConceptId))];
        const rightConceptIds = [...new Set(right.whatTheLawSays
          .map((statement) => statement.provisionConceptId))];
        try {
          transitions = z.array(lineageSchema).min(1).max(144).parse(
            await dependencies.lineageResolver.resolve(
              leftConceptIds,
              rightConceptIds,
            ),
          );
          const leftSet = new Set(leftConceptIds);
          const rightSet = new Set(rightConceptIds);
          const selectedConcepts = new Set([...leftConceptIds, ...rightConceptIds]);
          const touched = new Set<string>();
          for (const transition of transitions) {
            const connectsEndpoints = transition.successorConceptId !== null
              && ((leftSet.has(transition.predecessorConceptId)
                && rightSet.has(transition.successorConceptId))
                || (rightSet.has(transition.predecessorConceptId)
                  && leftSet.has(transition.successorConceptId)));
            const isSelectedRepeal = transition.transition === "repealed"
              && transition.successorConceptId === null
              && selectedConcepts.has(transition.predecessorConceptId);
            if (!connectsEndpoints && !isSelectedRepeal) throw new TypeError("UNRELATED_LINEAGE");
            touched.add(transition.predecessorConceptId);
            if (transition.successorConceptId) touched.add(transition.successorConceptId);
          }
          if ([...selectedConcepts].some((conceptId) => !touched.has(conceptId))) {
            throw new TypeError("INCOMPLETE_LINEAGE");
          }
        } catch {
          return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
        }
        return comparisonAnswerSchema.parse({
          kind: "comparison_answer",
          sourceLadder: "indexed_official_corpus",
          temporalScope: { kind: "comparison", ...comparison },
          left,
          right,
          transitions,
          mainPoint: `${left.mainPoint} ${right.mainPoint}`,
          endpointFormulationSearches: left.formulationsUsed + right.formulationsUsed,
        });
      }
      const endpoint = plan.temporalEndpoint ?? { kind: "current" } as const;
      const release = await dependencies.releaseResolver.resolve(endpoint);
      const requiredCapability = endpoint.kind === "current" ? "current" : "history";
      if (!release || release.environment !== environment || release.capability !== requiredCapability) {
        return insufficient(plan);
      }

      const validatedPackets: RevalidatedCandidate[][] = [];
      let initialPacket: CandidatePacket;
      try {
        initialPacket = await dependencies.candidateIndex.retrieve(
          candidateInterpretation(plan, plan.formulations),
          endpoint,
          release,
        );
      } catch {
        return sourceUnavailable("INDEXED_CANDIDATE_UNAVAILABLE");
      }
      if (initialPacket.availability !== "available") {
        return sourceUnavailable("INDEXED_CANDIDATE_UNAVAILABLE");
      }
      try {
        validatedPackets.push(await dependencies.candidateCatalog.revalidate(
          initialPacket,
          endpoint,
          release,
        ));
      } catch {
        return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
      }
      let candidates = mergeRevalidatedCandidates(validatedPackets);
      if (!candidates) {
        return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
      }
      if (candidates.length === 0) return insufficient(plan);

      let decision: SelectionDecision;
      try {
        decision = selectionDecisionSchema.parse(await dependencies.provisionSelector.select({
          plan,
          candidates,
          repairAttempted: false,
        }));
      } catch {
        return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
      }
      let repairQueriesUsed = 0;
      if (decision.outcome === "repair") {
        if (
          plan.formulations.length >= 6
          || decision.repairFormulation.kind !== "repair"
          || !formulationsRespectPlan(plan, [...plan.formulations, decision.repairFormulation])
        ) return insufficient(plan);
        repairQueriesUsed = 1;
        let repairPacket: CandidatePacket;
        try {
          repairPacket = await dependencies.candidateIndex.retrieve(
            candidateInterpretation(plan, [decision.repairFormulation]),
            endpoint,
            release,
          );
          if (repairPacket.availability !== "available") {
            return sourceUnavailable("INDEXED_CANDIDATE_UNAVAILABLE");
          }
          validatedPackets.push(await dependencies.candidateCatalog.revalidate(
            repairPacket,
            endpoint,
            release,
          ));
        } catch {
          return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
        }
        candidates = mergeRevalidatedCandidates(validatedPackets);
        if (!candidates) {
          return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
        }
        try {
          decision = selectionDecisionSchema.parse(await dependencies.provisionSelector.select({
            plan,
            candidates,
            repairAttempted: true,
          }));
        } catch {
          return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
        }
      }
      if (decision.outcome !== "selected") return insufficient(plan);

      const candidateByKey = new Map(candidates.map((entry) => [entry.candidate.itemKey, entry]));
      const selected = decision.selections.flatMap((selection) => {
        const candidate = candidateByKey.get(selection.itemKey);
        return candidate ? [{ candidate, requirementIds: [...new Set(selection.requirementIds)] }] : [];
      });
      const planRequirementIds = new Set(plan.readings.flatMap((reading) =>
        reading.requirements.map((requirement) => requirement.id)));
      if (selected.length !== decision.selections.length
        || selected.some((entry) => entry.requirementIds.some((requirementId) =>
          !planRequirementIds.has(requirementId)
          || !entry.candidate.candidate.requirementIds.includes(requirementId)))) {
        return sourceUnavailable("INDEXED_REVALIDATION_FAILED");
      }
      const uniqueRenditions = [...new Map(selected.map((entry) => [
        entry.candidate.provisionRenditionId,
        entry.candidate.provisionRenditionId,
      ])).values()];
      if (uniqueRenditions.length > 12) {
        return clarificationSchema.parse({
          kind: "clarification_required",
          sourceLadder: "indexed_official_corpus",
          focusedQuestions: ["Please narrow the question so the complete evidence can fit within twelve provisions."],
          safeErrorCode: "EVIDENCE_CEILING_EXCEEDED",
        });
      }
      const requirementIds = planRequirementIds;
      const covered = new Set(selected.flatMap((entry) => entry.requirementIds)
        .filter((id) => requirementIds.has(id)));
      if ([...requirementIds].some((id) => !covered.has(id))) return insufficient(plan, covered);

      let evidenceByRendition: Map<string, ControllingEvidenceResolution>;
      try {
        evidenceByRendition = new Map(await Promise.all(uniqueRenditions.map(async (id) => [
          id,
          await dependencies.evidenceResolver.resolveControlling(id, endpoint),
        ] as const)));
      } catch {
        return sourceUnavailable("INDEXED_EVIDENCE_UNAVAILABLE");
      }
      const propositions = new Map(decision.propositions.map((proposition) => [
        proposition.requirementId,
        proposition.statement,
      ]));
      if ([...requirementIds].some((id) => !propositions.has(id))) return insufficient(plan, covered);
      const whatTheLawSays = selected.flatMap((entry) => {
        const evidence = evidenceByRendition.get(entry.candidate.provisionRenditionId);
        if (!evidence) return [];
        return entry.requirementIds.flatMap((requirementId) => {
          const proposition = propositions.get(requirementId);
          if (!proposition || !requirementIds.has(requirementId)) return [];
          return [{
            requirementId,
            provisionConceptId: evidence.controlling.provisionConceptId,
            provisionRenditionId: evidence.controlling.provisionRenditionId,
            proposition,
            controllingQuotation: evidence.controlling.provisionText,
            officialCitations: [evidence.materialCitation],
            evidenceSha256: evidence.controlling.evidence.sha256,
            ...(evidence.translation ? {
              officialTranslation: {
                label: "Official Translation" as const,
                quotation: evidence.translation.provisionText,
              },
            } : {}),
          }];
        });
      });
      const materialQuestions = plan.missingCaseFacts
        .filter((fact) => fact.material)
        .map((fact) => fact.question);
      return answerSchema.parse({
        kind: materialQuestions.length > 0 ? "conditional_answer" : "legal_answer",
        sourceLadder: "indexed_official_corpus",
        mainPoint: decision.mainPoint,
        whatTheLawSays,
        whatToDoNext: decision.whatToDoNext,
        focusedQuestions: materialQuestions,
        formulationsUsed: plan.formulations.length + repairQueriesUsed,
        repairQueriesUsed,
        temporalEndpoint: endpoint,
      });
    },
  };
}

export async function handleTargetLegalAnswerRequest(
  request: Request,
  input: {
    environment: z.infer<typeof legalEnvironmentSchema>;
    retriever: TargetLegalAnswerRetriever;
  },
): Promise<Response> {
  const environment = legalEnvironmentSchema.safeParse(input.environment);
  if (
    !environment.success
    || !acceptsPrivateServiceRequest(request, {
      environment: environment.data,
      marker: SERVICE_BINDING_MARKER,
      method: "POST",
      path: TARGET_LEGAL_ANSWER_PATH,
      requireJson: true,
    })
  ) return privateServiceJson({ code: "TARGET_LEGAL_ANSWER_PRIVATE_ROUTE_REJECTED" }, 404);
  try {
    if (!declaredRequestBodyWithinLimit(request, 8_192)) {
      throw new TypeError("TARGET_LEGAL_ANSWER_REQUEST_TOO_LARGE");
    }
    return privateServiceJson({
      result: await input.retriever.answer(questionSchema.parse(await request.json())),
    });
  } catch {
    return privateServiceJson({ code: "TARGET_LEGAL_ANSWER_UNAVAILABLE" }, 503);
  }
}

export function createTargetLegalAnswerClient(input: {
  service: Fetcher;
  environment: z.infer<typeof legalEnvironmentSchema>;
}) {
  return {
    async answer(question: z.input<typeof questionSchema>): Promise<TargetLegalAnswerResult> {
      const response = await input.service.fetch(
        `http://legal-corpus.internal${TARGET_LEGAL_ANSWER_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-service-binding": SERVICE_BINDING_MARKER,
            "x-juro-legal-environment": input.environment,
          },
          body: JSON.stringify(questionSchema.parse(question)),
        },
      );
      if (!response.ok) throw new TypeError("TARGET_LEGAL_ANSWER_UNAVAILABLE");
      return z.object({ result: retrievalResultSchema }).strict().parse(await response.json()).result;
    },
  };
}
