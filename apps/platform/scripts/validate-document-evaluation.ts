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

const position = process.argv.indexOf("--results");
const path = position >= 0 ? process.argv[position + 1] : undefined;
const artifactsPosition = process.argv.indexOf("--artifacts");
const artifactsPath = artifactsPosition >= 0 ? process.argv[artifactsPosition + 1] : undefined;
if (!path || !artifactsPath) {
  console.error("Usage: npm run evaluate:documents:validate -- --results <reviewed-results.json> --artifacts <artifact-manifest.json>");
  process.exitCode = 2;
} else {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const artifactManifest = JSON.parse(await readFile(artifactsPath, "utf8")) as DocumentArtifactManifest;
    if (!Array.isArray(parsed)) throw new TypeError("RESULTS_NOT_ARRAY");
    const verdict = validateDocumentEvaluationResults(parsed as DocumentEvaluationResult[], documentEvaluationCorpus);
    const artifactDirectory = dirname(resolve(artifactsPath));
    const artifactFailures = [
      ...await verifyDocumentArtifactManifest(artifactDirectory, artifactManifest),
      ...validateResultsAgainstArtifactManifest(parsed as DocumentEvaluationResult[], artifactManifest),
    ];
    const passed = verdict.passed && artifactFailures.length === 0;
    console.log(JSON.stringify({
      corpusSize: documentEvaluationCorpus.length,
      resultCount: parsed.length,
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
