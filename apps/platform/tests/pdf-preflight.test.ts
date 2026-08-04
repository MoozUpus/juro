import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

import { inspectPdfPageCount, PdfPreflightError } from "../lib/document-analysis/pdf-preflight";

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) pdf.addPage([300, 400]);
  return pdf.save();
}

test("PDF preflight returns the structural page count without OCR", async () => {
  assert.equal(await inspectPdfPageCount(await pdfWithPages(2)), 2);
});

test("PDF preflight rejects a document above the supplied analysis limit", async () => {
  await assert.rejects(
    inspectPdfPageCount(await pdfWithPages(3), 2),
    (error: unknown) => error instanceof PdfPreflightError && error.code === "PDF_PAGE_LIMIT_EXCEEDED",
  );
});

test("PDF preflight rejects corrupt input before provider access", async () => {
  await assert.rejects(
    inspectPdfPageCount(new TextEncoder().encode("%PDF-1.7 not a document")),
    (error: unknown) => error instanceof PdfPreflightError && error.code === "PDF_CORRUPT",
  );
});

test("OCR worker and RU/UZ UI preserve typed PDF preflight states", async () => {
  const [worker, ui] = await Promise.all([
    readFile(new URL("../worker/platform-jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/DocumentReviewClient.tsx", import.meta.url), "utf8"),
  ]);
  for (const code of ["OCR_PAGE_LIMIT_EXCEEDED", "OCR_PDF_CORRUPT", "OCR_PDF_PASSWORD_PROTECTED", "OCR_PDF_PREFLIGHT_TIMEOUT"]) {
    assert.match(worker, new RegExp(code));
    assert.match(ui, new RegExp(code));
  }
  assert.match(ui, /Слишком много страниц/);
  assert.match(ui, /Sahifalar soni limitdan oshdi/);
});
