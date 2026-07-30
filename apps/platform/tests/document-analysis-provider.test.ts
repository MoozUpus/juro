import assert from "node:assert/strict";
import test from "node:test";
import {
  documentAnalysisResultSchema,
  documentAnalysisJsonSchema,
  enforceDocumentAnalysisSourceBoundary,
  enforceDocumentExcerptBoundary,
  parseDocumentAnalysisResult,
} from "../lib/document-analysis/schema";

const base = {
  documentType: "Договор оказания услуг",
  summary: "Документ регулирует оказание услуг и оплату.",
  language: "ru" as const,
  outputLanguage: "ru" as const,
  jurisdiction: "UZ" as const,
  mode: "quick" as const,
  userSide: null,
  legalComplianceStatus: "unverified" as const,
  parties: [],
  amounts: [],
  dates: [],
  obligations: [],
  deadlines: [],
  risks: [{
    severity: "medium" as const,
    riskType: "document_internal" as const,
    title: "Неясный срок",
    clause: null,
    page: null,
    exactExcerpt: "срок определяется дополнительно",
    problem: "Срок не определён.",
    consequence: "Исполнение трудно контролировать.",
    legalBasisSourceIds: [],
    recommendation: "Указать точный срок.",
    proposedWording: null,
    confidence: "high" as const,
  }],
  missingClauses: [],
  contradictions: [],
  questions: [],
  recommendations: ["Уточнить срок."],
  overallQuality: { score: 70, explanation: "Структура понятна, но срок не определён." },
  sources: [],
  legalDatabaseAsOf: "unavailable",
  extractionWarnings: [],
};

test("document analysis output is strict, bounded and JSON-schema backed", () => {
  assert.deepEqual(parseDocumentAnalysisResult(base), base);
  assert.equal(documentAnalysisJsonSchema.type, "object");
  assert.equal(documentAnalysisResultSchema.safeParse({ ...base, hidden: true }).success, false);
});

test("document analysis cannot claim legal compliance without a verified source", () => {
  assert.deepEqual(enforceDocumentAnalysisSourceBoundary(base, new Set()), base);
  assert.throws(
    () => enforceDocumentAnalysisSourceBoundary({ ...base, legalComplianceStatus: "verified" }, new Set()),
    /VERIFIED_SOURCE/,
  );
  assert.throws(
    () => enforceDocumentAnalysisSourceBoundary({
      ...base,
      risks: [{ ...base.risks[0], riskType: "legal_compliance", legalBasisSourceIds: ["fake"] }],
    }, new Set()),
    /AI_SOURCE_NOT_ALLOWED:fake/,
  );
});

test("document analysis rejects provider-invented source ids", () => {
  assert.throws(
    () => enforceDocumentAnalysisSourceBoundary({
      ...base,
      sources: [{ sourceId: "fake", actTitle: "Fake", actIdentifier: null, article: null, excerpt: null, originalUrl: "https://lex.uz/fake", verifiedAt: "never" }],
    }, new Set(["verified"])),
    /AI_SOURCE_NOT_ALLOWED:fake/,
  );
});

test("document analysis rejects excerpts not present in the uploaded document", () => {
  assert.equal(
    enforceDocumentExcerptBoundary(base, "Текст: срок определяется дополнительно."),
    base,
  );
  assert.throws(
    () => enforceDocumentExcerptBoundary(base, "Другой текст без цитаты."),
    /AI_DOCUMENT_EXCERPT_NOT_FOUND/,
  );
});
