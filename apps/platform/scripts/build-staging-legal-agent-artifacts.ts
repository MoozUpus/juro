import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  legalEvaluationCorpus,
} from "../evaluation/legal-evaluation-corpus";
import { readLegalEvaluationArtifactManifest } from "../evaluation/legal-evaluation-artifacts";
import {
  STAGING_LEGAL_AGENT_ATTESTATION,
  STAGING_LEGAL_AGENT_EVIDENCE_VERSION,
  STAGING_LEGAL_AGENT_RESULTS_VERSION,
  stagingLegalAgentPersistedEvidenceSchema,
  stagingLegalAgentResultsEnvelopeSchema,
  stagingLegalArtifactSha256,
  stagingLegalTextSha256,
  verifyStagingLegalAgentEvidence,
  verifyStagingLegalAgentResults,
  type StagingLegalAgentEvidenceRecord,
} from "../evaluation/staging-legal-evaluation-agent-artifacts";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const rawRecordSchema = z.object({
  attemptId: z.string(),
  evaluationRunId: z.string(),
  scenarioId: z.string(),
  attemptNumber: z.number().int(),
  promptSha256: hashSchema,
  responseSha256: hashSchema,
  workerVersionId: z.string().uuid(),
  workerVersionCreatedAt: z.string().datetime({ offset: true }),
  attemptStartedAt: z.string().datetime({ offset: true }),
  attemptCompletedAt: z.string().datetime({ offset: true }),
  aiRunId: z.string(),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string(),
  instructionHash: hashSchema,
  legalDatabaseAsOf: z.string(),
  sourceVersionHash: hashSchema,
  runCompletedAt: z.string().datetime({ offset: true }),
  question: z.string(),
  answer: z.string(),
  structuredJson: z.string(),
  reviewId: z.string().uuid(),
  reviewerKind: z.literal("openai_codex"),
  reviewerId: z.literal("openai-codex"),
  reviewerTaskId: z.string(),
  attestation: z.literal(STAGING_LEGAL_AGENT_ATTESTATION),
  classification: z.enum([
    "correct", "partially_incorrect", "incorrect", "unsafe",
    "outdated_source", "broken_citation", "insufficient_context", "language_issue",
  ]),
  languageQuality: z.number().int(),
  observedBehaviorsJson: z.string(),
  metricsJson: z.string(),
  notes: z.string(),
  questionSha256: hashSchema,
  answerSha256: hashSchema,
  previousHash: hashSchema,
  eventHash: hashSchema,
  reviewedAt: z.string().datetime({ offset: true }),
}).strict();

const rawRecordsSchema = z.array(rawRecordSchema).length(314);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function orderReviewChain(records: z.infer<typeof rawRecordsSchema>) {
  const eventHashes = new Set(records.map((record) => record.eventHash));
  const starts = records.filter((record) => !eventHashes.has(record.previousHash));
  if (starts.length !== 1) throw new TypeError("AGENT_REVIEW_CHAIN_START_INVALID");
  const childByPrevious = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    if (childByPrevious.has(record.previousHash)) throw new TypeError("AGENT_REVIEW_CHAIN_FORK");
    childByPrevious.set(record.previousHash, record);
  }
  const ordered: (typeof records)[number][] = [];
  let current: (typeof records)[number] | undefined = starts[0];
  while (current) {
    ordered.push(current);
    current = childByPrevious.get(current.eventHash);
  }
  if (ordered.length !== records.length) throw new TypeError("AGENT_REVIEW_CHAIN_INCOMPLETE");
  return ordered;
}

const packet = argument("--packet");
const sourcePath = argument("--source");
const outputDirectory = argument("--output");
const gitCommit = argument("--git-commit");
const databaseId = argument("--database-id");
if (!packet || !sourcePath || !outputDirectory || !gitCommit || !databaseId) {
  console.error("Usage: npx tsx scripts/build-staging-legal-agent-artifacts.ts --packet <directory> --source <raw-d1-records.json> --output <directory> --git-commit <sha> --database-id <uuid> [--working-tree-dirty]");
  process.exitCode = 2;
} else {
  const manifest = await readLegalEvaluationArtifactManifest(packet);
  const records = rawRecordsSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")) as unknown);
  const scenarioById = new Map(legalEvaluationCorpus.map((scenario) => [scenario.id, scenario]));
  const evaluationRunIds = new Set(records.map((record) => record.evaluationRunId));
  if (evaluationRunIds.size !== 1) throw new TypeError("AGENT_EVALUATION_RUN_ID_MISMATCH");
  const evaluationRunId = records[0]!.evaluationRunId;
  const generatedAt = new Date().toISOString();

  const reviewedResults = records.map((record) => {
    const scenario = scenarioById.get(record.scenarioId);
    if (!scenario || record.question !== scenario.prompt) {
      throw new TypeError(`AGENT_SCENARIO_PROMPT_MISMATCH:${record.scenarioId}`);
    }
    const questionHash = stagingLegalTextSha256(record.question);
    const answerHash = stagingLegalTextSha256(record.answer);
    if (
      questionHash !== record.promptSha256
      || questionHash !== record.questionSha256
      || answerHash !== record.answerSha256
      || stagingLegalArtifactSha256({ answer: record.answer, structuredJson: record.structuredJson }) !== record.responseSha256
    ) throw new TypeError(`AGENT_RECORD_HASH_MISMATCH:${record.scenarioId}`);
    const structured = z.object({
      confirmedFindings: z.array(z.unknown()),
      responseKind: z.enum(["answer", "clarification_required", "out_of_scope"]),
      language: z.enum(["ru", "uz"]),
      jurisdiction: z.literal("UZ"),
      sources: z.array(z.object({
        sourceId: z.string(),
        originalUrl: z.string().url(),
        actTitle: z.string(),
        actIdentifier: z.string(),
        article: z.string().nullable(),
        status: z.string(),
        verifiedAt: z.string().datetime({ offset: true }),
      }).passthrough()),
    }).passthrough().parse(JSON.parse(record.structuredJson) as unknown);
    return {
      scenarioId: record.scenarioId,
      attemptId: record.attemptId,
      attemptNumber: record.attemptNumber,
      aiRunId: record.aiRunId,
      provider: record.provider,
      model: record.model,
      instructionHash: record.instructionHash,
      legalDatabaseVersion: record.legalDatabaseAsOf,
      sourceVersionHash: record.sourceVersionHash,
      runCompletedAt: record.runCompletedAt,
      attemptStartedAt: record.attemptStartedAt,
      attemptCompletedAt: record.attemptCompletedAt,
      completionMs: Date.parse(record.attemptCompletedAt) - Date.parse(record.attemptStartedAt),
      workerVersionId: record.workerVersionId,
      workerVersionCreatedAt: record.workerVersionCreatedAt,
      responseSha256: record.responseSha256,
      structuredOutputSha256: stagingLegalTextSha256(record.structuredJson),
      answerLanguage: structured.language,
      jurisdiction: structured.jurisdiction,
      responseKind: structured.responseKind,
      confirmedFindingCount: structured.confirmedFindings.length,
      storedSources: structured.sources.map((source) => ({
        sourceId: source.sourceId,
        originalUrl: source.originalUrl,
        actTitle: source.actTitle,
        actIdentifier: source.actIdentifier,
        article: source.article,
        status: source.status,
        verifiedAt: source.verifiedAt,
      })),
      reviewerKind: record.reviewerKind,
      reviewerId: record.reviewerId,
      reviewerTaskId: record.reviewerTaskId,
      attestation: record.attestation,
      classification: record.classification,
      reviewedLanguageQuality: record.languageQuality,
      observedBehaviors: JSON.parse(record.observedBehaviorsJson) as unknown,
      metrics: JSON.parse(record.metricsJson) as unknown,
      reviewNotes: record.notes,
      reviewedAt: record.reviewedAt,
      questionSha256: record.questionSha256,
      answerSha256: record.answerSha256,
      reviewEvidenceHash: record.eventHash,
    };
  }).sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));

  const resultsEnvelope = stagingLegalAgentResultsEnvelopeSchema.parse({
    schemaVersion: STAGING_LEGAL_AGENT_RESULTS_VERSION,
    artifactType: "staging_agent_reviewed_legal_evaluation",
    corpusVersion: manifest.corpusVersion,
    corpusSha256: manifest.scenariosSha256,
    corpusSize: manifest.corpusSize,
    environment: "staging",
    databaseId,
    sourceRevision: {
      gitCommit,
      workingTreeDirty: process.argv.includes("--working-tree-dirty"),
    },
    evaluationRunId,
    generatedAt,
    deployedWorkerVersionIds: [...new Set(records.map((record) => record.workerVersionId))].sort(),
    reviewAttestation: STAGING_LEGAL_AGENT_ATTESTATION,
    releaseGate: "agent_review_only_human_legal_approval_pending",
    results: reviewedResults,
  });
  const resultFailures = verifyStagingLegalAgentResults(resultsEnvelope);
  if (resultFailures.length > 0) throw new TypeError(resultFailures.join(","));

  const ordered = orderReviewChain(records);
  const evidenceRecords: StagingLegalAgentEvidenceRecord[] = ordered.map((record) => ({
    evaluationRunId: record.evaluationRunId,
    scenarioId: record.scenarioId,
    scenarioPromptSha256: record.promptSha256,
    attemptId: record.attemptId,
    attemptNumber: record.attemptNumber,
    aiRunId: record.aiRunId,
    runStatus: "completed",
    provider: record.provider,
    model: record.model,
    instructionHash: record.instructionHash,
    legalDatabaseAsOf: record.legalDatabaseAsOf,
    sourceVersionHash: record.sourceVersionHash,
    runCompletedAt: record.runCompletedAt,
    attemptStartedAt: record.attemptStartedAt,
    attemptCompletedAt: record.attemptCompletedAt,
    responseSha256: record.responseSha256,
    structuredOutputSha256: stagingLegalTextSha256(record.structuredJson),
    workerVersionId: record.workerVersionId,
    workerVersionCreatedAt: record.workerVersionCreatedAt,
    reviewId: record.reviewId,
    reviewerKind: record.reviewerKind,
    reviewerId: record.reviewerId,
    reviewerTaskId: record.reviewerTaskId,
    attestation: record.attestation,
    classification: record.classification,
    languageQuality: record.languageQuality,
    observedBehaviors: JSON.parse(record.observedBehaviorsJson) as never,
    metrics: JSON.parse(record.metricsJson) as never,
    observedBehaviorsJson: record.observedBehaviorsJson,
    metricsJson: record.metricsJson,
    notes: record.notes,
    questionSha256: record.questionSha256,
    answerSha256: record.answerSha256,
    previousHash: record.previousHash,
    eventHash: record.eventHash,
    reviewedAt: record.reviewedAt,
  }));
  const exportedAt = new Date().toISOString();
  const evidenceUnsigned = {
    schemaVersion: STAGING_LEGAL_AGENT_EVIDENCE_VERSION,
    artifactType: "staging_persisted_agent_review_evidence" as const,
    corpusVersion: manifest.corpusVersion,
    corpusSha256: manifest.scenariosSha256,
    environment: "staging" as const,
    databaseId,
    evaluationRunId,
    resultsGeneratedAt: generatedAt,
    resultsEnvelopeSha256: stagingLegalArtifactSha256(resultsEnvelope),
    exportedAt,
    reviewChain: {
      reviewerId: "openai-codex" as const,
      priorReviewChainHash: evidenceRecords[0]!.previousHash,
      headEventHash: evidenceRecords.at(-1)!.eventHash,
      recordCount: 314 as const,
    },
    records: evidenceRecords,
  };
  const evidence = stagingLegalAgentPersistedEvidenceSchema.parse({
    ...evidenceUnsigned,
    exportDigest: stagingLegalArtifactSha256(evidenceUnsigned),
  });
  const evidenceFailures = verifyStagingLegalAgentEvidence(evidence, resultsEnvelope);
  if (evidenceFailures.length > 0) throw new TypeError(evidenceFailures.join(","));

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(outputDirectory, "reviewed-results.json"), `${JSON.stringify(resultsEnvelope, null, 2)}\n`, "utf8"),
    writeFile(join(outputDirectory, "staging-persisted-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify({
    evaluationRunId,
    results: resultsEnvelope.results.length,
    evidence: evidence.records.length,
    workerVersionIds: resultsEnvelope.deployedWorkerVersionIds,
    outputDirectory,
  }, null, 2));
}
