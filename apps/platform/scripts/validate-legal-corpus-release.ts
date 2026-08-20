import { readFile } from "node:fs/promises";

import {
  evaluateLegalCorpusReleaseEvidence,
  legalCorpusReleaseEvidenceSchema,
} from "../lib/legal-corpus/release-gate";

const flagIndex = process.argv.indexOf("--evidence");
const evidencePath = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;

if (!evidencePath) {
  console.error("Usage: npx tsx scripts/validate-legal-corpus-release.ts --evidence <release-evidence.json>");
  process.exitCode = 2;
} else {
  try {
    const parsed: unknown = JSON.parse(await readFile(evidencePath, "utf8"));
    const evidence = legalCorpusReleaseEvidenceSchema.parse(parsed);
    const verdict = evaluateLegalCorpusReleaseEvidence(evidence);
    console.log(JSON.stringify({
      schemaVersion: evidence.schemaVersion,
      environment: evidence.environment,
      applicationCommit: evidence.applicationCommit,
      corpusSnapshotSha256: evidence.corpusSnapshotSha256,
      ...verdict,
    }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      code: "LEGAL_CORPUS_RELEASE_EVIDENCE_INVALID",
      detail: error instanceof Error ? error.message : "unknown",
    }));
    process.exitCode = 2;
  }
}
