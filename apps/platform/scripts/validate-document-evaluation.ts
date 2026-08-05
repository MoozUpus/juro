import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  validateResultsAgainstArtifactManifest,
  verifyDocumentArtifactManifest,
  type DocumentArtifactManifest,
} from "../evaluation/document-evaluation-artifacts";
import {
  documentEvaluationCorpus,
  validateDocumentEvaluationResults,
  type DocumentEvaluationResult,
} from "../evaluation/document-evaluation-corpus";
import {
  DOCUMENT_EVALUATION_CORPUS_VERSION,
  verifyDocumentEvaluationPersistedEvidence,
} from "../evaluation/document-evaluation-contract";

const evidencePosition = process.argv.indexOf("--evidence");
const evidencePath = evidencePosition >= 0 ? process.argv[evidencePosition + 1] : undefined;
const artifactsPosition = process.argv.indexOf("--artifacts");
const artifactsPath = artifactsPosition >= 0 ? process.argv[artifactsPosition + 1] : undefined;
if (!evidencePath || !artifactsPath) {
  console.error("Usage: npm run evaluate:documents:validate -- --evidence <persisted-evidence.json> --artifacts <artifact-manifest.json>");
  process.exitCode = 2;
} else {
  try {
    const evidenceParsed: unknown = JSON.parse(await readFile(evidencePath, "utf8"));
    const evidenceVerdict = await verifyDocumentEvaluationPersistedEvidence(evidenceParsed);
    if (!evidenceVerdict.valid || !evidenceVerdict.evidence) {
      throw new TypeError(evidenceVerdict.failures.join(",") || "DOCUMENT_EVALUATION_EVIDENCE_INVALID");
    }
    const evidence = evidenceVerdict.evidence;
    if (evidence.corpusVersion !== DOCUMENT_EVALUATION_CORPUS_VERSION) {
      throw new TypeError("DOCUMENT_EVALUATION_CORPUS_VERSION_MISMATCH");
    }
    const artifactBytes = await readFile(artifactsPath);
    const artifactManifestSha256 = createHash("sha256").update(artifactBytes).digest("hex");
    if (artifactManifestSha256 !== evidence.artifactManifestSha256) {
      throw new TypeError("DOCUMENT_EVALUATION_ARTIFACT_MANIFEST_HASH_MISMATCH");
    }
    const artifactManifest = JSON.parse(artifactBytes.toString("utf8")) as DocumentArtifactManifest;
    const results: DocumentEvaluationResult[] = evidence.records.map((record) => ({
      evidenceSchemaVersion: 1,
      packageId: record.packageId!,
      artifactSha256: record.artifactSha256!,
      artifactBytes: record.artifactBytes!,
      runEnvironment: "staging",
      fileId: record.fileId!,
      analysisId: record.analysisId!,
      scanStatus: "safe",
      scanProvider: record.scanProvider!,
      analysisStatus: "completed",
      provider: record.provider!,
      providerModel: record.providerModel!,
      providerResponseId: record.providerResponseId!,
      completedAt: record.completedAt!,
      actualFormat: record.actualFormat!,
      actualDocumentType: record.actualDocumentType!,
      criticalRisksDetected: record.criticalRisksDetected!,
      datesAndSumsVerified: record.datesAndSumsVerified ?? undefined,
      ocrCharacterAccuracy: record.ocrCharacterAccuracyBps === null
        ? undefined
        : record.ocrCharacterAccuracyBps / 10_000,
      userSideDetected: record.userSideDetected ?? undefined,
      userSideConfirmed: record.userSideConfirmed ?? undefined,
      comparisonPeerId: record.comparisonPeerPackageId ?? undefined,
      comparisonId: record.comparisonId ?? undefined,
      comparisonReviewed: record.comparisonReviewed ?? undefined,
      promptInjectionResisted: record.promptInjectionResisted ?? undefined,
      humanReviewerId: record.actorUserId,
      humanReviewedAt: record.createdAt,
      humanReviewDisposition: record.disposition!,
    }));
    const verdict = validateDocumentEvaluationResults(results, documentEvaluationCorpus);
    const artifactDirectory = dirname(resolve(artifactsPath));
    const artifactFailures = [
      ...await verifyDocumentArtifactManifest(artifactDirectory, artifactManifest),
      ...validateResultsAgainstArtifactManifest(results, artifactManifest),
    ];
    const passed = verdict.passed && artifactFailures.length === 0;
    console.log(JSON.stringify({
      corpusSize: documentEvaluationCorpus.length,
      resultCount: results.length,
      evidenceRunId: evidence.evaluationRunId,
      evidenceApplicationCommit: evidence.applicationCommit,
      evidenceDigest: evidence.evidenceDigest,
      passed,
      failures: [...verdict.failures, ...artifactFailures],
      metrics: verdict.metrics,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ code: "RESULTS_FILE_INVALID", detail: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 2;
  }
}
