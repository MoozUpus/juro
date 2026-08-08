import { resolve } from "node:path";

import {
  materializeDocumentEvaluationArtifacts,
  verifyDocumentArtifactManifest,
} from "../evaluation/document-evaluation-artifacts";

const outputPosition = process.argv.indexOf("--output");
const requestedOutput = outputPosition >= 0 ? process.argv[outputPosition + 1] : ".tmp/document-evaluation-corpus";

if (!requestedOutput || requestedOutput.startsWith("-")) {
  console.error("Usage: npm run evaluate:documents:materialize -- --output <directory>");
  process.exitCode = 2;
} else {
  const outputDirectory = resolve(process.cwd(), requestedOutput);
  try {
    const manifest = await materializeDocumentEvaluationArtifacts(outputDirectory);
    const failures = await verifyDocumentArtifactManifest(outputDirectory, manifest);
    console.log(JSON.stringify({
      ok: failures.length === 0,
      outputDirectory,
      corpusVersion: manifest.corpusVersion,
      corpusSize: manifest.corpusSize,
      comparisonPairCount: manifest.comparisonPairCount,
      distinctArtifactCount: new Set(manifest.artifacts.map((artifact) => artifact.artifactSha256)).size,
      totalArtifactBytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.artifactBytes, 0),
      failures,
    }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      code: "DOCUMENT_CORPUS_MATERIALIZATION_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
    }));
    process.exitCode = 2;
  }
}
