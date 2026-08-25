import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildFederatedLegalCorpusReleaseEvidence } from
  "../lib/legal-corpus/federated-release-evidence-builder";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new TypeError(`FEDERATED_LEGAL_CORPUS_ARGUMENT_MISSING:${name}`);
  return value;
}

function repeatedArguments(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (!value) throw new TypeError(`FEDERATED_LEGAL_CORPUS_ARGUMENT_MISSING:${name}`);
    values.push(value);
  }
  return values;
}

async function main(): Promise<void> {
  const outputPath = resolve(argument("--output"));
  const { evidence, verdict } = await buildFederatedLegalCorpusReleaseEvidence({
    baseEvidencePath: argument("--base-evidence"),
    routingContractPath: argument("--routing-contract"),
    partitionManifestPath: argument("--partition-manifest"),
    snapshotManifestPath: argument("--snapshot-manifest"),
    retrievalVerificationPath: argument("--retrieval-verification"),
    d1CapacityPaths: repeatedArguments("--d1-capacity"),
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputPath,
    applicationCommit: evidence.baseEvidence.applicationCommit,
    corpusSnapshotSha256: evidence.baseEvidence.corpusSnapshotSha256,
    shardCount: evidence.shards.length,
    totalDatabaseBytes: verdict.observed.totalDatabaseBytes,
    maximumShardBytes: verdict.observed.maximumShardBytes,
    passed: verdict.passed,
    failures: verdict.failures,
  })}\n`);
  if (!verdict.passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({
    code: "FEDERATED_LEGAL_CORPUS_RELEASE_BUILD_FAILED",
    detail: error instanceof Error ? error.message : "unknown",
  })}\n`);
  process.exitCode = 2;
});
