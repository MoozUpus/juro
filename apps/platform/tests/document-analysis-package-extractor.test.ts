import assert from "node:assert/strict";
import test from "node:test";

import PizZip from "pizzip";

import {
  extractAnalysisDocument,
  PackageExtractionError,
} from "../lib/document-analysis/package-extractor";

const zipMime = "application/zip";

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function docxBytes(paragraphs: string[]): Uint8Array {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file("_rels/.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((paragraph) => `<w:p><w:r><w:t>${xmlEscape(paragraph)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
  );
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

function packageBytes(files: Record<string, Uint8Array>, compression: "DEFLATE" | "STORE" = "DEFLATE"): Uint8Array {
  const zip = new PizZip();
  for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes, { binary: true });
  return zip.generate({ type: "uint8array", compression });
}

test("document analysis extracts every text member and preserves deterministic file boundaries", async () => {
  const bytes = packageBytes({
    "01-contract.docx": docxBytes(["ДОГОВОР", "1. Стороны подтверждают оплату для Заказчика при подписании акта."]),
    "02-annex.docx": docxBytes(["ILOVA", "2. Buyurtmachi natijani yozma shaklda qabul qiladi."]),
  });
  const extracted = await extractAnalysisDocument({
    bytes,
    fileName: "case-package.zip",
    mimeType: zipMime,
    sizeBytes: bytes.byteLength,
  });

  assert.equal(extracted.mimeType, zipMime);
  assert.equal(extracted.warningCode, "PACKAGE_MULTI_DOCUMENT");
  assert.equal(extracted.detectedLanguage, "mixed");
  assert.match(extracted.text, /ФАЙЛ: "01-contract\.docx"/);
  assert.match(extracted.text, /ФАЙЛ: "02-annex\.docx"/);
  assert.match(extracted.text, /Стороны подтверждают оплату/);
  assert.match(extracted.text, /Buyurtmachi natijani/);
  assert.ok(extracted.sections.some((section) => section.heading?.startsWith("01-contract.docx")));
  assert.ok(extracted.sections.some((section) => section.heading?.startsWith("02-annex.docx")));
});

test("an oversized expanded member stops before PDF parsing or provider access", async () => {
  const bytes = packageBytes({
    "large.pdf": new Uint8Array(20 * 1024 * 1024 + 1),
  }, "STORE");
  await assert.rejects(
    extractAnalysisDocument({ bytes, fileName: "large.zip", mimeType: zipMime, sizeBytes: bytes.byteLength }),
    (error: unknown) => error instanceof PackageExtractionError && error.code === "PACKAGE_CAPACITY_REQUIRED",
  );
});

test("a package containing an image fails closed instead of sending an opaque ZIP to OCR or AI", async () => {
  const bytes = packageBytes({
    "contract.docx": docxBytes(["ДОГОВОР", "1. Достаточный читаемый текст договора."]),
    "scan.png": Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await assert.rejects(
    extractAnalysisDocument({ bytes, fileName: "mixed.zip", mimeType: zipMime, sizeBytes: bytes.byteLength }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "OCR_REQUIRED",
  );
});
