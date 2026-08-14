import { readFile } from "node:fs/promises";

import {
  readLegalEvaluationArtifactManifest,
  verifyLegalEvaluationArtifactManifest,
} from "../evaluation/legal-evaluation-artifacts";
import {
  stagingLegalAgentPersistedEvidenceSchema,
  stagingLegalAgentResultsEnvelopeSchema,
  verifyStagingLegalAgentEvidence,
  verifyStagingLegalAgentResults,
} from "../evaluation/staging-legal-evaluation-agent-artifacts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const packet = argument("--packet");
const resultsPath = argument("--results");
const evidencePath = argument("--evidence");
if (!packet || !resultsPath || !evidencePath) {
  console.error("Usage: npx tsx scripts/validate-staging-legal-evaluation-agent.ts --packet <directory> --results <reviewed-results.json> --evidence <staging-persisted-evidence.json>");
  process.exitCode = 2;
} else {
  try {
    const manifest = await readLegalEvaluationArtifactManifest(packet);
    const packetFailures = await verifyLegalEvaluationArtifactManifest(packet, manifest);
    const results = stagingLegalAgentResultsEnvelopeSchema.parse(
      JSON.parse(await readFile(resultsPath, "utf8")) as unknown,
    );
    const evidence = stagingLegalAgentPersistedEvidenceSchema.parse(
      JSON.parse(await readFile(evidencePath, "utf8")) as unknown,
    );
    const failures = [
      ...packetFailures,
      ...(results.corpusSha256 === manifest.scenariosSha256 ? [] : ["AGENT_RESULTS_CORPUS_HASH_MISMATCH"]),
      ...verifyStagingLegalAgentResults(results),
      ...verifyStagingLegalAgentEvidence(evidence, results),
    ];
    console.log(JSON.stringify({
      passed: failures.length === 0,
      corpusSize: manifest.corpusSize,
      resultCount: results.results.length,
      evidenceCount: evidence.records.length,
      evaluationRunId: results.evaluationRunId,
      workerVersionIds: results.deployedWorkerVersionIds,
      reviewAttestation: results.reviewAttestation,
      releaseGate: results.releaseGate,
      classifications: Object.fromEntries(
        Object.entries(Object.groupBy(results.results, (result) => result.classification))
          .map(([key, value]) => [key, value?.length ?? 0]),
      ),
      failures,
    }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      code: "AGENT_ARTIFACTS_INVALID",
      detail: error instanceof Error ? error.message : "unknown",
    }));
    process.exitCode = 2;
  }
}
