import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  comparisonExportErrorMessage,
  comparisonProcessingErrorMessage,
  comparisonRouteErrorMessage,
  type ComparisonRouteErrorCode,
} from "../lib/document-comparison/localization";

const comparisonRouteCodes: ComparisonRouteErrorCode[] = [
  "COMPARISON_NOT_FOUND",
  "COMPARISON_UNAVAILABLE",
  "COMPARISON_ALREADY_PROCESSING",
  "COMPARISON_CHANGE_NOT_FOUND",
  "COMPARISON_CASE_UNAVAILABLE",
  "COMPARISON_UNSUPPORTED_CHANGE",
  "COMPARISON_VERSION_NOT_FOUND",
  "COMPARISON_FILE_UNAVAILABLE",
];

const comparisonProcessingCodes = [
  "CORRUPT_FILE",
  "FILE_SCAN_REQUIRED",
  "PASSWORD_PROTECTED",
  "NO_READABLE_TEXT",
  "OCR_REQUIRED",
  "PAGE_LIMIT_EXCEEDED",
  "PROCESSING_TIMEOUT",
  "UNSUPPORTED_FILE",
  "COMPARISON_PROCESSING_FAILED",
] as const;

const comparisonExportCodes = [
  "ANALYSIS_EXPORT_NOT_FOUND",
  "ANALYSIS_EXPORT_NOT_READY",
  "ANALYSIS_EXPORT_INVALID_SOURCE",
  "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT",
  "ANALYSIS_EXPORT_OBJECT_FAILED",
  "ANALYSIS_EXPORT_NOT_TERMINAL",
  "ANALYSIS_EXPORT_DELETE_FAILED",
  "ANALYSIS_EXPORT_CAPACITY_UNAVAILABLE",
  "ANALYSIS_EXPORT_FORMAT_INVALID",
] as const;

test("comparison route, processing and export failures have explicit Uzbek and English copy", () => {
  for (const locale of ["uz", "en"] as const) {
    const messages = [
      ...comparisonRouteCodes.map((code) => comparisonRouteErrorMessage(code, locale)),
      ...comparisonProcessingCodes.map((code) => comparisonProcessingErrorMessage(code, locale)),
      ...comparisonExportCodes.map((code) => comparisonExportErrorMessage(code, locale)),
    ];
    assert.equal(messages.every((message) => message.trim().length > 0), true);
    assert.doesNotMatch(messages.join("\n"), /[\u0400-\u04ff]/u);
  }
});

test("comparison route adapters select request locale and never expose exception prose", async () => {
  const sources = await Promise.all([
    readFile(new URL("../app/api/platform/document-comparisons/[comparisonId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-comparisons/[comparisonId]/process/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-comparisons/[comparisonId]/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-comparisons/[comparisonId]/files/[version]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-comparisons/exports/[exportId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-comparisons/exports/[exportId]/file/route.ts", import.meta.url), "utf8"),
  ]);

  for (const source of sources) {
    assert.match(source, /authLocaleFromRequest/u);
    assert.doesNotMatch(source, /error\s*:\s*error\.message/u);
  }
});

test("comparison clients explicitly send locale for API errors and download links", async () => {
  const [comparisonList, comparisonResult] = await Promise.all([
    readFile(new URL("../app/_platform/DocumentComparisonClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/ComparisonResultClient.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(comparisonList, /"x-juro-locale": locale/u);
  assert.match(comparisonResult, /"x-juro-locale": locale/u);
  assert.match(comparisonResult, /\/file\?locale=\$\{locale\}/u);
  assert.match(comparisonResult, /\/files\/\$\{index === 0 \? "one" : "two"\}\?locale=\$\{locale\}/u);
});
