import { readFile } from "node:fs/promises";
import {
  documentEvaluationCorpus,
  validateDocumentEvaluationResults,
  type DocumentEvaluationResult,
} from "../evaluation/document-evaluation-corpus";

const position = process.argv.indexOf("--results");
const path = position >= 0 ? process.argv[position + 1] : undefined;
if (!path) {
  console.error("Usage: npx tsx scripts/validate-document-evaluation.ts --results <reviewed-results.json>");
  process.exitCode = 2;
} else {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed)) throw new TypeError("RESULTS_NOT_ARRAY");
    const verdict = validateDocumentEvaluationResults(parsed as DocumentEvaluationResult[], documentEvaluationCorpus);
    console.log(JSON.stringify({ corpusSize: documentEvaluationCorpus.length, resultCount: parsed.length, ...verdict }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ code: "RESULTS_FILE_INVALID", detail: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 2;
  }
}
