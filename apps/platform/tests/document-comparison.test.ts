import assert from "node:assert/strict";
import test from "node:test";

import { PDFDocument, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";

import { compareDocuments } from "../lib/document-comparison/diff";
import { extractDocument, structureDocument } from "../lib/document-comparison/extract";
import type { ExtractedDocument } from "../lib/document-comparison/types";
import {
  sha256Hex,
  validateUploadBytes,
} from "../lib/document-builder/storage/file-validation";

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extracted(text: string, fileName = "contract.docx"): ExtractedDocument {
  return {
    fileName,
    mimeType: docxType,
    sizeBytes: new TextEncoder().encode(text).byteLength,
    pageCount: null,
    detectedLanguage: /[ўқғҳ]|uchun|tomon/iu.test(text) ? "uz" : "ru",
    textQuality: "good",
    warningCode: null,
    text,
    sections: structureDocument(text),
  };
}

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function docxBytes(paragraphs: string[]) {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((paragraph) => `<w:p><w:r><w:t>${xmlEscape(paragraph)}</w:t></w:r></w:p>`).join("")}<w:sectPr/></w:body></w:document>`,
  );
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

test("identical documents produce no material changes and preserve inputs", () => {
  const first = extracted("ДОГОВОР\n\n1. Срок уведомления составляет 30 календарных дней.\n\n2. Цена составляет 10 000 сум.");
  const second = structuredClone(first);
  second.fileName = "contract-v2.docx";
  const snapshot = JSON.stringify([first, second]);
  const result = compareDocuments(first, second, "ru", "2026-07-26T12:00:00.000Z");
  assert.equal(result.summary.totalChanges, 0);
  assert.equal(result.summary.materialChanges, 0);
  assert.equal(result.summary.similarityPercent, 100);
  assert.ok(result.changes.every((change) => change.changeType === "unchanged"));
  assert.equal(JSON.stringify([first, second]), snapshot, "comparison must not mutate source versions");
});

test("one changed word creates a word-level redline", () => {
  const result = compareDocuments(
    extracted("1. Оплата производится после поставки товара."),
    extracted("1. Оплата производится до поставки товара.", "v2.docx"),
    "ru",
  );
  assert.equal(result.summary.changed, 1);
  const change = result.changes[0];
  assert.equal(change.changeType, "changed");
  assert.ok(change.wordDiff.some((part) => part.kind === "removed" && part.value.includes("после")));
  assert.ok(change.wordDiff.some((part) => part.kind === "added" && part.value.includes("до")));
});

test("term and amount changes receive deterministic high-risk summaries", () => {
  const term = compareDocuments(
    extracted("1. Уведомление направляется за 30 календарных дней."),
    extracted("1. Уведомление направляется за 5 календарных дней.", "term-v2.docx"),
    "ru",
  ).changes[0];
  assert.match(term.summary, /30 календарных дней.*5 календарных дней/);
  assert.equal(term.riskLevel, "high");
  assert.equal(term.confidencePercent, 92);

  const amount = compareDocuments(
    extracted("1. Цена договора составляет 10 000 сум."),
    extracted("1. Цена договора составляет 25 000 сум.", "amount-v2.docx"),
    "ru",
  ).changes[0];
  assert.match(amount.summary, /10 000 сум.*25 000 сум/);
  assert.equal(amount.riskLevel, "high");
  assert.equal(amount.confidencePercent, 94);
});

test("added and removed sections are classified independently", () => {
  const added = compareDocuments(
    extracted("1. Предмет договора подробно определяется сторонами."),
    extracted("1. Предмет договора подробно определяется сторонами.\n\n2. Неустойка составляет 1 процент за каждый день.", "added.docx"),
    "ru",
  );
  assert.equal(added.summary.added, 1);
  assert.equal(added.changes.find((change) => change.changeType === "added")?.beforeText, null);

  const removed = compareDocuments(
    extracted("1. Предмет договора подробно определяется сторонами.\n\n2. Неустойка составляет 1 процент за каждый день."),
    extracted("1. Предмет договора подробно определяется сторонами.", "removed.docx"),
    "ru",
  );
  assert.equal(removed.summary.removed, 1);
  assert.equal(removed.changes.find((change) => change.changeType === "removed")?.afterText, null);
});

test("renumbering, movement and formatting-only edits do not masquerade as text changes", () => {
  const renumbered = compareDocuments(
    extracted("1. Сторона уведомляет другую сторону в письменной форме."),
    extracted("3. Сторона уведомляет другую сторону в письменной форме.", "renumbered.docx"),
    "ru",
  );
  assert.equal(renumbered.summary.renumbered, 1);

  const moved = compareDocuments(
    extracted("1. Первый существенный пункт договора.\n\n2. Второй существенный пункт договора.\n\n3. Третий существенный пункт договора."),
    extracted("3. Третий существенный пункт договора.\n\n2. Второй существенный пункт договора.\n\n1. Первый существенный пункт договора.", "moved.docx"),
    "ru",
  );
  assert.ok(moved.summary.moved >= 1);

  const formatting = compareDocuments(
    extracted("1. Услуга «полностью готова»."),
    extracted("1. Услуга \"полностью готова\".", "formatting.docx"),
    "ru",
  );
  assert.equal(formatting.summary.formatting, 1);
  assert.equal(formatting.summary.totalChanges, 1);
  assert.equal(formatting.changes[0].riskEffect, "neutral");
});

test("rewritten clauses and likely unrelated documents remain reviewable", () => {
  const rewritten = compareDocuments(
    extracted("1. Заказчик оплачивает услуги в течение десяти рабочих дней после подписания акта."),
    extracted("1. Исполнитель вправе приостановить доступ без уведомления при любом предполагаемом нарушении.", "rewritten.docx"),
    "ru",
  );
  assert.ok(rewritten.summary.totalChanges >= 1);
  assert.ok(rewritten.summary.likelyDifferentDocuments);
  assert.ok(rewritten.changes.some((change) => materialChange(change.changeType)));
});

test("DOCX extraction supports Russian and Uzbek text, tables and appendices", async () => {
  const bytes = docxBytes([
    "ДОГОВОР ОКАЗАНИЯ УСЛУГ",
    "1. Исполнитель оказывает юридические услуги для Заказчика.",
    "ПРИЛОЖЕНИЕ 1",
    "Таблица: Услуга\tСрок\tСтоимость",
    "2. Natija Buyurtmachi uchun o‘z vaqtida topshiriladi.",
  ]);
  const result = await extractDocument({
    bytes,
    fileName: "bilingual.docx",
    mimeType: docxType,
    sizeBytes: bytes.byteLength,
  });
  assert.ok(result.sections.length >= 3);
  assert.match(result.text, /ПРИЛОЖЕНИЕ 1/);
  assert.match(result.text, /Buyurtmachi uchun/);
  assert.equal(result.detectedLanguage, "mixed");
});

test("Builder Markdown snapshot enters the same structured analysis pipeline", async () => {
  const bytes = new TextEncoder().encode("ДОГОВОР\n\n1. Исполнитель оказывает услуги.\n\n2. Заказчик оплачивает услуги в течение 10 дней.");
  const result = await extractDocument({
    bytes,
    fileName: "contract.snapshot-r2.md",
    mimeType: "text/markdown; charset=utf-8",
    sizeBytes: bytes.byteLength,
  });
  assert.match(result.text, /Заказчик оплачивает/u);
  assert.ok(result.sections.length >= 2);
  assert.equal(result.detectedLanguage, "ru");
});

test("PDF and DOCX use the same structured comparison pipeline", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("1. Payment is due within 30 calendar days after delivery.", {
    x: 50,
    y: 780,
    size: 12,
    font,
  });
  const pdfBytes = await pdf.save();
  const first = await extractDocument({
    bytes: pdfBytes,
    fileName: "terms.pdf",
    mimeType: "application/pdf",
    sizeBytes: pdfBytes.byteLength,
  });
  const secondBytes = docxBytes(["1. Payment is due within 5 calendar days after delivery."]);
  const second = await extractDocument({
    bytes: secondBytes,
    fileName: "terms.docx",
    mimeType: docxType,
    sizeBytes: secondBytes.byteLength,
  });
  const result = compareDocuments(first, second, "ru");
  assert.equal(first.pageCount, 1);
  assert.equal(result.summary.changed, 1);
  assert.match(result.changes[0].summary, /30 calendar days.*5 calendar days|Текст условия изменён/);
});

test("OCR-required, corrupt, empty and spoofed uploads fail honestly", async () => {
  await assert.rejects(
    extractDocument({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      fileName: "scan.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 4,
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "OCR_REQUIRED",
  );
  await assert.rejects(
    extractDocument({
      bytes: new TextEncoder().encode("not a docx"),
      fileName: "broken.docx",
      mimeType: docxType,
      sizeBytes: 10,
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "CORRUPT_FILE",
  );
  const spoofedPdf = new File([new TextEncoder().encode("not a pdf")], "contract.pdf", { type: "application/pdf" });
  assert.equal(
    validateUploadBytes(spoofedPdf, new Uint8Array(await spoofedPdf.arrayBuffer()))?.code,
    "CONTENT_TYPE_MISMATCH",
  );
});

test("large structured documents are compared without quadratic output growth", () => {
  const firstText = Array.from({ length: 140 }, (_, index) =>
    `${index + 1}. Условие номер ${index + 1} применяется к обязательствам соответствующей стороны.`,
  ).join("\n\n");
  const secondText = firstText.replace(
    "120. Условие номер 120 применяется",
    "120. Изменённое условие номер 120 применяется",
  );
  const result = compareDocuments(extracted(firstText), extracted(secondText, "large-v2.docx"), "ru");
  assert.equal(result.changes.length, 140);
  assert.equal(result.summary.changed, 1);
  assert.equal(result.summary.unchanged, 139);
});

test("version hashes are stable and distinguish different source bytes", async () => {
  const first = docxBytes(["1. Первая неизменяемая версия документа."]);
  const second = docxBytes(["1. Вторая неизменяемая версия документа."]);
  const firstHash = await sha256Hex(first);
  assert.match(firstHash, /^[a-f0-9]{64}$/);
  assert.equal(firstHash, await sha256Hex(first));
  assert.notEqual(firstHash, await sha256Hex(second));
});

function materialChange(type: string) {
  return ["added", "removed", "changed"].includes(type);
}
