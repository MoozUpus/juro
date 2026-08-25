import { readFile } from "node:fs/promises";

import {
  evaluateFederatedLegalCorpusReleaseEvidence,
  federatedLegalCorpusReleaseEvidenceSchema,
} from "../lib/legal-corpus/federated-release-gate";

const flagIndex = process.argv.indexOf("--evidence");
const evidencePath = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;

if (!evidencePath) {
  console.error(
    "Usage: npx tsx scripts/validate-legal-corpus-federated-release.ts "
      + "--evidence <federated-release-evidence.json>",
  );
  process.exitCode = 2;
} else {
  try {
    const parsed: unknown = JSON.parse(await readFile(evidencePath, "utf8"));
    const evidence = federatedLegalCorpusReleaseEvidenceSchema.parse(parsed);
    const verdict = evaluateFederatedLegalCorpusReleaseEvidence(evidence);
    console.log(JSON.stringify({
      schemaVersion: evidence.schemaVersion,
      environment: evidence.baseEvidence.environment,
      applicationCommit: evidence.baseEvidence.applicationCommit,
      corpusSnapshotSha256: evidence.baseEvidence.corpusSnapshotSha256,
      ...verdict,
    }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      code: "FEDERATED_LEGAL_CORPUS_RELEASE_EVIDENCE_INVALID",
      detail: error instanceof Error ? error.message : "unknown",
    }));
    process.exitCode = 2;
  }
}
