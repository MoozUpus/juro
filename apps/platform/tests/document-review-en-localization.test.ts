import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { documentReviewCopy, reviewText } from "../app/_platform/document-review-localization";
import { compareDocuments } from "../lib/document-comparison/diff";
import { structureDocument } from "../lib/document-comparison/extract";
import type { ExtractedDocument } from "../lib/document-comparison/types";
import { defaultDocumentAnalysisLocale } from "../lib/document-analysis/language";

const root = new URL("../", import.meta.url);
const cyrillic = /[А-Яа-яЁёЎўҚқҒғҲҳ]/u;

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

function extracted(text: string, fileName: string): ExtractedDocument {
  return {
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: new TextEncoder().encode(text).byteLength,
    pageCount: null,
    detectedLanguage: "unknown",
    textQuality: "good",
    warningCode: null,
    text,
    sections: structureDocument(text),
  };
}

test("document review exposes a complete explicit English interface catalogue", () => {
  const values = Object.values(documentReviewCopy.en).map((value) =>
    typeof value === "function" ? value(3, 2) : value,
  );
  assert.doesNotMatch(values.join("\n"), cyrillic);
  assert.equal(reviewText("en", "Русский", "O‘zbekcha", "English"), "English");
  assert.match(documentReviewCopy.en.analysisLanguageHint, /Russian and Uzbek/);
  assert.match(documentReviewCopy.en.outputLanguageNote, /does not translate source clauses/);
});

test("English chrome keeps the supported RU or UZ analysis language explicit", async () => {
  const [review, upload, language] = await Promise.all([
    source("app/_platform/DocumentReviewClient.tsx"),
    source("lib/document-analysis/client-upload.ts"),
    source("lib/document-analysis/language.ts"),
  ]);
  assert.equal(defaultDocumentAnalysisLocale("en"), "ru");
  assert.match(review, /analysisLocale/);
  assert.match(review, /<option value="ru">\{copy\.russian\}<\/option>/);
  assert.match(review, /<option value="uz">\{copy\.uzbek\}<\/option>/);
  assert.match(upload, /locale: analysisLocale/);
  assert.match(upload, /"x-juro-locale": locale/);
  assert.match(language, /en: "ru"/);
  assert.doesNotMatch(review, /const ru = locale === "ru"|\bru \?/);
});

test("deterministic document comparison produces English findings", () => {
  const before = extracted("1. Payment is due within 30 days.\n\n2. The fee is 100 USD.", "before.docx");
  const after = extracted("1. Payment is due within 5 days.\n\n2. The fee is 250 USD.", "after.docx");
  const result = compareDocuments(before, after, "en", "2026-09-05T00:00:00.000Z");
  const findings = result.changes.map((change) => [change.summary, change.legalEffect, change.recommendation].join(" ")).join("\n");
  assert.match(findings, /changed|change|Review/i);
  assert.doesNotMatch(findings, cyrillic);
});

test("comparison creation and processing preserve an explicit English locale", async () => {
  const [createRoute, processRoute, diff, legalAnalysis, types, comparisonClient] = await Promise.all([
    source("app/api/platform/document-comparisons/route.ts"),
    source("app/api/platform/document-comparisons/[comparisonId]/process/route.ts"),
    source("lib/document-comparison/diff.ts"),
    source("lib/document-comparison/legal-analysis.ts"),
    source("lib/document-comparison/types.ts"),
    source("app/_platform/DocumentComparisonClient.tsx"),
  ]);
  assert.match(types, /ComparisonLocale = "ru" \| "uz" \| "en"/);
  assert.match(createRoute, /isLocale\(formLocale\)/);
  assert.match(processRoute, /isLocale\(comparison\.locale\)/);
  assert.match(diff, /Monetary value changed/);
  assert.match(legalAnalysis, /Respond entirely in professional English/);
  assert.match(comparisonClient, /"x-juro-locale": locale/);
  assert.doesNotMatch(`${createRoute}\n${processRoute}\n${diff}`, /locale === "ru"|locale === "uz"|\bru \?/);
});

test("comparison reports and exports use explicit English copy and document metadata", async () => {
  const [report, exporter, docx] = await Promise.all([
    source("lib/document-comparison/report.ts"),
    source("lib/document-comparison/exporter.ts"),
    source("lib/document-builder/generation/docx.ts"),
  ]);
  assert.match(report, /title: "DOCUMENT COMPARISON REPORT"/);
  assert.match(report, /disclaimerHeading: "JURO DISCLAIMER"/);
  assert.match(exporter, /title: "JURO — Document Comparison Report"/);
  assert.match(exporter, /documentLanguage: "en-GB"/);
  assert.match(docx, /options\.footer/);
  assert.match(docx, /replaceCoreProperty/);
  assert.doesNotMatch(`${report}\n${exporter}`, /const ru =|\bru \?/);
});

test("builder analysis localizes API errors by UI locale without widening document language", async () => {
  const [launcher, route, service] = await Promise.all([
    source("app/_document-builder/_components/BuilderAnalysisLauncher.tsx"),
    source("app/api/document-builder/documents/[id]/analysis/route.ts"),
    source("lib/document-analysis/builder-analysis.ts"),
  ]);
  assert.match(launcher, /"x-juro-locale": uiLocale/);
  assert.match(route, /requestLocale\(request\)/);
  assert.match(route, /en: "The document was not found\."/);
  assert.match(service, /locale: z\.enum\(\["ru", "uz"\]\)/);
  assert.doesNotMatch(route, /const ru = locale === "ru"|\bru \?/);
});
