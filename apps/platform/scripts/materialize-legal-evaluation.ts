import { resolve } from "node:path";

import {
  materializeLegalEvaluationArtifacts,
  verifyLegalEvaluationArtifactManifest,
} from "../evaluation/legal-evaluation-artifacts";

const outputPosition = process.argv.indexOf("--output");
const requestedOutput = outputPosition >= 0
  ? process.argv[outputPosition + 1]
  : ".tmp/legal-evaluation-corpus";

if (!requestedOutput || requestedOutput.startsWith("-")) {
  console.error("Usage: npm run evaluate:legal:materialize -- --output <directory>");
  process.exitCode = 2;
} else {
  const outputDirectory = resolve(process.cwd(), requestedOutput);
  try {
    const manifest = await materializeLegalEvaluationArtifacts(outputDirectory);
    const failures = await verifyLegalEvaluationArtifactManifest(outputDirectory, manifest);
    console.log(JSON.stringify({
      ok: failures.length === 0,
      outputDirectory,
      ...manifest,
      failures,
    }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      code: "LEGAL_CORPUS_MATERIALIZATION_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
    }));
    process.exitCode = 2;
  }
}
