import { readFile } from "node:fs/promises";
import {
  legalEvaluationCorpus,
  validateLegalEvaluationResults,
  type LegalEvaluationResult,
} from "../evaluation/legal-evaluation-corpus";
import {
  legalEvaluationResultsEnvelopeSchema,
  readLegalEvaluationArtifactManifest,
  verifyLegalEvaluationArtifactManifest,
  verifyLegalEvaluationResultsEnvelope,
} from "../evaluation/legal-evaluation-artifacts";
import { verifyPublicCitation } from "../evaluation/legal-citation-live-check";
import {
  legalEvaluationPersistedEvidenceSchema,
  verifyLegalEvaluationPersistedEvidence,
} from "../evaluation/legal-evaluation-persisted-evidence";

async function verifyCitationUrls(results: readonly LegalEvaluationResult[]): Promise<Map<string, boolean>> {
  const urls = [...new Set(results.flatMap((result) =>
    Array.isArray(result.citations)
      ? result.citations.map((citation) => citation.url)
      : [],
  ))];
  const verified = new Map<string, boolean>();
  const concurrency = 6;
  for (let offset = 0; offset < urls.length; offset += concurrency) {
    const batch = urls.slice(offset, offset + concurrency);
    const outcomes = await Promise.all(batch.map(async (url) => [url, await verifyPublicCitation(url)] as const));
    for (const [url, exists] of outcomes) verified.set(url, exists);
  }
  return verified;
}

const flagIndex = process.argv.indexOf("--results");
const path = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
const packetFlagIndex = process.argv.indexOf("--packet");
const packetDirectory = packetFlagIndex >= 0 ? process.argv[packetFlagIndex + 1] : undefined;
const evidenceFlagIndex = process.argv.indexOf("--evidence");
const evidencePath = evidenceFlagIndex >= 0 ? process.argv[evidenceFlagIndex + 1] : undefined;
if (!path || !packetDirectory || !evidencePath) {
  console.error("Usage: npx tsx scripts/validate-legal-evaluation.ts --packet <packet-directory> --results <reviewed-results.json> --evidence <staging-persisted-evidence.json>");
  process.exitCode = 2;
} else {
  let results: LegalEvaluationResult[] = [];
  let evaluationRunId = "invalid";
  let applicationCommit = "invalid";
  try {
    const manifest = await readLegalEvaluationArtifactManifest(packetDirectory);
    const packetFailures = await verifyLegalEvaluationArtifactManifest(packetDirectory, manifest);
    if (packetFailures.length > 0) throw new TypeError(packetFailures.join(","));
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const validated = legalEvaluationResultsEnvelopeSchema.safeParse(parsed);
    if (!validated.success) throw new TypeError("RESULTS_SCHEMA_INVALID");
    const bindingFailures = verifyLegalEvaluationResultsEnvelope(validated.data, manifest);
    if (bindingFailures.length > 0) throw new TypeError(bindingFailures.join(","));
    const evidenceParsed: unknown = JSON.parse(await readFile(evidencePath, "utf8"));
    const evidence = legalEvaluationPersistedEvidenceSchema.safeParse(evidenceParsed);
    if (!evidence.success) throw new TypeError("PERSISTED_EVIDENCE_SCHEMA_INVALID");
    const evidenceFailures = await verifyLegalEvaluationPersistedEvidence(
      evidence.data,
      validated.data,
    );
    if (evidenceFailures.length > 0) throw new TypeError(evidenceFailures.join(","));
    results = validated.data.results;
    evaluationRunId = validated.data.evaluationRunId;
    applicationCommit = validated.data.applicationCommit;
  } catch (error) {
    console.error(JSON.stringify({ code: "RESULTS_FILE_INVALID", detail: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 2;
    results = [];
  }
  if (process.exitCode !== 2) {
    const liveVerifiedUrls = await verifyCitationUrls(results);
    const verdict = validateLegalEvaluationResults(results, legalEvaluationCorpus, liveVerifiedUrls);
    console.log(JSON.stringify({
      corpusSize: legalEvaluationCorpus.length,
      resultCount: results.length,
      evaluationRunId,
      applicationCommit,
      ...verdict,
    }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  }
}
