import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import {
  legalEvaluationCorpus,
  legalEvaluationResultsSchema,
  type LegalEvaluationResult,
  type LegalEvaluationScenario,
} from "./legal-evaluation-corpus";

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

const reviewInstructions = `# JURO legal evaluation review packet

This packet contains synthetic questions only. It contains no model answer,
legal conclusion, source, score or ground truth.

For every scenario, run the real staging AI flow and create one independently
reviewed result matching the strict schema enforced by:

    npm run evaluate:legal:validate -- --packet <packet-directory> --results <reviewed-results.json>

Do not mark a source as existing from memory or hostname shape. Public
Lex/Advice links are replayed live by the validator. Internal-material citations
require separate staging-DB evidence. Record a real reviewer identifier and do
not reuse this packet as proof of legal correctness.

The reviewed-results file must be a strict staging envelope bound to this
packet's corpus version and SHA-256. Every result must identify its persisted
AI run, actual provider/model, instruction hash, legal-database version,
completion time, reviewer, review time and a review-evidence hash reference.
The referenced review evidence must be retained separately; a hash value alone
does not prove that human review occurred or that the conclusion is correct.
`;

export async function materializeLegalEvaluationArtifacts(
  outputDirectory: string,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): Promise<LegalEvaluationArtifactManifest> {
  await mkdir(outputDirectory, { recursive: true });
  const scenarioBytes = new TextEncoder().encode(`${JSON.stringify(scenarios, null, 2)}\n`);
  const instructionBytes = new TextEncoder().encode(reviewInstructions);
  await writeFile(join(outputDirectory, "scenarios.json"), scenarioBytes);
  await writeFile(join(outputDirectory, "review-instructions.md"), instructionBytes);
  const manifest: LegalEvaluationArtifactManifest = {
    schemaVersion: LEGAL_EVALUATION_MANIFEST_VERSION,
    corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION,
    corpusSize: scenarios.length,
    russianScenarioCount: scenarios.filter(({ locale }) => locale === "ru").length,
    uzbekScenarioCount: scenarios.filter(({ locale }) => locale === "uz").length,
    ambiguousScenarioCount: scenarios.filter(({ tags }) => tags.includes("ambiguous")).length,
    legalAreaCount: new Set(scenarios.map(({ area }) => area)).size,
    scenariosRelativePath: "scenarios.json",
    scenariosSha256: sha256(scenarioBytes),
    instructionsRelativePath: "review-instructions.md",
    instructionsSha256: sha256(instructionBytes),
  };
  await writeFile(
    join(outputDirectory, "artifact-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export async function verifyLegalEvaluationArtifactManifest(
  outputDirectory: string,
  manifest: LegalEvaluationArtifactManifest,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): Promise<string[]> {
  const failures: string[] = [];
  try {
    const persistedManifest = await readFile(
      join(outputDirectory, "artifact-manifest.json"),
      "utf8",
    );
    const expectedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    if (persistedManifest !== expectedManifest) {
      failures.push("LEGAL_ARTIFACT_MANIFEST_INTEGRITY_MISMATCH");
    }
  } catch {
    failures.push("LEGAL_ARTIFACT_MANIFEST_MISSING");
  }
  if (manifest.schemaVersion !== LEGAL_EVALUATION_MANIFEST_VERSION) {
    failures.push("LEGAL_ARTIFACT_MANIFEST_SCHEMA_UNSUPPORTED");
  }
  if (manifest.corpusVersion !== LEGAL_EVALUATION_CORPUS_VERSION) {
    failures.push("LEGAL_ARTIFACT_CORPUS_VERSION_MISMATCH");
  }
  if (
    manifest.corpusSize !== scenarios.length
    || manifest.russianScenarioCount !== scenarios.filter(({ locale }) => locale === "ru").length
    || manifest.uzbekScenarioCount !== scenarios.filter(({ locale }) => locale === "uz").length
    || manifest.ambiguousScenarioCount !== scenarios.filter(({ tags }) => tags.includes("ambiguous")).length
    || manifest.legalAreaCount !== new Set(scenarios.map(({ area }) => area)).size
  ) failures.push("LEGAL_ARTIFACT_CORPUS_COUNTS_MISMATCH");

  if (
    manifest.scenariosRelativePath !== "scenarios.json"
    || manifest.instructionsRelativePath !== "review-instructions.md"
  ) failures.push("LEGAL_ARTIFACT_PATH_INVALID");

  try {
    const bytes = new Uint8Array(await readFile(join(outputDirectory, "scenarios.json")));
    if (sha256(bytes) !== manifest.scenariosSha256) {
      failures.push("LEGAL_ARTIFACT_SCENARIOS_INTEGRITY_MISMATCH");
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (JSON.stringify(parsed) !== JSON.stringify(scenarios)) {
      failures.push("LEGAL_ARTIFACT_SCENARIOS_CONTENT_MISMATCH");
    }
  } catch {
    failures.push("LEGAL_ARTIFACT_SCENARIOS_MISSING");
  }

  try {
    const bytes = new Uint8Array(await readFile(join(outputDirectory, "review-instructions.md")));
    if (sha256(bytes) !== manifest.instructionsSha256) {
      failures.push("LEGAL_ARTIFACT_INSTRUCTIONS_INTEGRITY_MISMATCH");
    }
  } catch {
    failures.push("LEGAL_ARTIFACT_INSTRUCTIONS_MISSING");
  }
  return failures;
}

export async function readLegalEvaluationArtifactManifest(
  outputDirectory: string,
): Promise<LegalEvaluationArtifactManifest> {
  const parsed: unknown = JSON.parse(await readFile(
    join(outputDirectory, "artifact-manifest.json"),
    "utf8",
  ));
  return legalEvaluationArtifactManifestSchema.parse(parsed);
}

export function verifyLegalEvaluationResultsEnvelope(
  envelope: LegalEvaluationResultsEnvelope,
  manifest: LegalEvaluationArtifactManifest,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): string[] {
  const failures: string[] = [];
  if (envelope.corpusVersion !== manifest.corpusVersion) {
    failures.push("LEGAL_RESULTS_CORPUS_VERSION_MISMATCH");
  }
  if (envelope.corpusSha256 !== manifest.scenariosSha256) {
    failures.push("LEGAL_RESULTS_CORPUS_HASH_MISMATCH");
  }
  if (envelope.results.length !== scenarios.length) {
    failures.push("LEGAL_RESULTS_CORPUS_SIZE_MISMATCH");
  }
  return failures;
}

export function createLegalEvaluationResultsEnvelope(input: {
  manifest: LegalEvaluationArtifactManifest;
  applicationCommit: string;
  evaluationRunId: string;
  generatedAt: string;
  results: readonly LegalEvaluationResult[];
}): LegalEvaluationResultsEnvelope {
  return legalEvaluationResultsEnvelopeSchema.parse({
    schemaVersion: LEGAL_EVALUATION_RESULTS_ENVELOPE_VERSION,
    corpusVersion: input.manifest.corpusVersion,
    corpusSha256: input.manifest.scenariosSha256,
    environment: "staging",
    applicationCommit: input.applicationCommit,
    evaluationRunId: input.evaluationRunId,
    generatedAt: input.generatedAt,
    results: input.results,
  });
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
