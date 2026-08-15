import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  legalEvaluationHumanEvidenceSchema,
  verifyLegalEvaluationHumanEvidence,
} from "../evaluation/legal-evaluation-human-evidence";
import {
  evaluateLegalCorpusReleaseEvidence,
  legalCorpusBenchmarkEvidenceSchema,
  legalCorpusDashboardEvidenceSchema,
  legalCorpusReleaseEvidenceSchema,
} from "../lib/legal-corpus/release-gate";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new TypeError(`LEGAL_CORPUS_RELEASE_ARGUMENT_MISSING:${name}`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readJson(path: string): Promise<{ raw: string; parsed: unknown }> {
  const raw = await readFile(path, "utf8");
  return { raw, parsed: JSON.parse(raw) as unknown };
}

async function main(): Promise<void> {
  const applicationCommit = argument("--application-commit");
  const corpusSnapshotSha256 = argument("--corpus-snapshot-sha256");
  const dashboardInput = await readJson(argument("--dashboard"));
  const benchmarkInput = await readJson(argument("--benchmark"));
  const humanReviewInput = await readJson(argument("--human-review"));
  const outputPath = resolve(argument("--output"));

  const dashboard = legalCorpusDashboardEvidenceSchema.parse(dashboardInput.parsed);
  const benchmark = legalCorpusBenchmarkEvidenceSchema.parse(benchmarkInput.parsed);
  const humanEvidence = legalEvaluationHumanEvidenceSchema.parse(humanReviewInput.parsed);
  const humanFailures = await verifyLegalEvaluationHumanEvidence(humanEvidence);
  if (humanFailures.length > 0) {
    throw new TypeError(`LEGAL_CORPUS_HUMAN_REVIEW_INVALID:${humanFailures.join(",")}`);
  }
  const correctCount = humanEvidence.records.filter((record) => record.classification === "correct").length;
  if (correctCount !== humanEvidence.recordCount) {
    throw new TypeError("LEGAL_CORPUS_HUMAN_REVIEW_INCOMPLETE");
  }

  const capturedAt = new Date().toISOString();
  const evidence = legalCorpusReleaseEvidenceSchema.parse({
    schemaVersion: 1,
    environment: "staging",
    capturedAt,
    applicationCommit,
    corpusSnapshotSha256,
    humanReview: {
      schemaVersion: humanEvidence.schemaVersion,
      corpusVersion: humanEvidence.corpusVersion,
      corpusSha256: humanEvidence.corpusSha256,
      evaluationRunId: humanEvidence.evaluationRunId,
      attestationId: humanEvidence.attestationId,
      attestationEventHash: humanEvidence.attestationEventHash,
      scopeDigest: humanEvidence.scopeDigest,
      exportDigest: humanEvidence.exportDigest,
      fileSha256: sha256(humanReviewInput.raw),
      recordCount: humanEvidence.recordCount,
      correctCount,
      exportedAt: humanEvidence.exportedAt,
      verified: true,
    },
    dashboard,
    benchmark,
  });
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, new Date(capturedAt));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputPath,
    evaluationRunId: evidence.humanReview.evaluationRunId,
    reviewedScenarioCount: evidence.humanReview.recordCount,
    humanReviewFileSha256: evidence.humanReview.fileSha256,
    passed: verdict.passed,
    failures: verdict.failures,
  })}\n`);
  if (!verdict.passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({
    code: "LEGAL_CORPUS_RELEASE_BUILD_FAILED",
    detail: error instanceof Error ? error.message : "unknown",
  })}\n`);
  process.exitCode = 2;
});
