import { readFile } from "node:fs/promises";
import {
  legalEvaluationCorpus,
  validateLegalEvaluationResults,
  type LegalEvaluationResult,
} from "../evaluation/legal-evaluation-corpus";
import { verifyPublicCitation } from "../evaluation/legal-citation-live-check";

async function verifyCitationUrls(results: readonly LegalEvaluationResult[]): Promise<Map<string, boolean>> {
  const urls = [...new Set(results.flatMap((result) =>
    Array.isArray(result.citations)
      ? result.citations.filter((citation) => citation.sourceType !== "internal").map((citation) => citation.url)
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
if (!path) {
  console.error("Usage: npx tsx scripts/validate-legal-evaluation.ts --results <reviewed-results.json>");
  process.exitCode = 2;
} else {
  let results: LegalEvaluationResult[];
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed)) throw new TypeError("RESULTS_NOT_ARRAY");
    results = parsed as LegalEvaluationResult[];
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
      ...verdict,
    }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  }
}
