import { z } from "zod";

import { legalEvaluationResultsSchema } from "./legal-evaluation-corpus";

export const LEGAL_EVALUATION_CORPUS_VERSION = "2026-08-05.1";
export const LEGAL_EVALUATION_MANIFEST_VERSION = 1;
export const LEGAL_EVALUATION_RESULTS_ENVELOPE_VERSION = 1;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceIdentifierSchema = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const legalEvaluationArtifactManifestSchema = z.object({
  schemaVersion: z.literal(LEGAL_EVALUATION_MANIFEST_VERSION),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSize: z.number().int().positive().max(10_000),
  russianScenarioCount: z.number().int().nonnegative().max(10_000),
  uzbekScenarioCount: z.number().int().nonnegative().max(10_000),
  ambiguousScenarioCount: z.number().int().nonnegative().max(10_000),
  legalAreaCount: z.number().int().positive().max(100),
  scenariosRelativePath: z.literal("scenarios.json"),
  scenariosSha256: sha256Schema,
  instructionsRelativePath: z.literal("review-instructions.md"),
  instructionsSha256: sha256Schema,
}).strict();

export const legalEvaluationResultsEnvelopeSchema = z.object({
  schemaVersion: z.literal(LEGAL_EVALUATION_RESULTS_ENVELOPE_VERSION),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSha256: sha256Schema,
  environment: z.literal("staging"),
  applicationCommit: z.string().regex(/^[a-f0-9]{40}$/),
  evaluationRunId: evidenceIdentifierSchema,
  generatedAt: z.string().datetime({ offset: true }),
  results: legalEvaluationResultsSchema,
}).strict();

export type LegalEvaluationArtifactManifest = z.infer<typeof legalEvaluationArtifactManifestSchema>;
export type LegalEvaluationResultsEnvelope = z.infer<typeof legalEvaluationResultsEnvelopeSchema>;
