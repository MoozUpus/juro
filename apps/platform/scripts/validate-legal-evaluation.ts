import { readFile } from "node:fs/promises";
import {
  legalEvaluationCorpus,
  validateLegalEvaluationResults,
  type LegalEvaluationResult,
} from "../evaluation/legal-evaluation-corpus";

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
    const verdict = validateLegalEvaluationResults(results, legalEvaluationCorpus);
    console.log(JSON.stringify({
      corpusSize: legalEvaluationCorpus.length,
      resultCount: results.length,
      ...verdict,
    }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  }
}
