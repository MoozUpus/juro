import assert from "node:assert/strict";
import test from "node:test";

import PizZip from "pizzip";

import {
  extractAnalysisDocument,
  isAnalysisPackageContext,
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
  assert.equal(extracted.packageContext?.primaryMemberId, "package-member-01");
  assert.deepEqual(extracted.packageContext?.members.map(({ id, role }) => ({ id, role })), [
    { id: "package-member-01", role: "primary" },
    { id: "package-member-02", role: "annex" },
  ]);
  assert.ok(extracted.packageContext?.relationships.some((relationship) =>
    relationship.fromMemberId === "package-member-02"
    && relationship.toMemberId === "package-member-01"
    && relationship.kind === "annex_to"
    && relationship.confidence === "high"));
});

test("package context records explicit references and exact duplicate evidence deterministically", async () => {
  const repeated = [
    "АКТ ПРИЁМКИ",
    "Настоящий документ относится к 01-contract.docx и подтверждает исполнение обязательств.",
    "Стороны подтверждают объём, срок и результат оказанных услуг без замечаний.",
  ];
  const bytes = packageBytes({
    "01-contract.docx": docxBytes(["ДОГОВОР", "Основной договор оказания услуг между сторонами."]),
    "02-act.docx": docxBytes(repeated),
    "03-act-copy.docx": docxBytes(repeated),
  });
  const extracted = await extractAnalysisDocument({
    bytes,
    fileName: "related.zip",
    mimeType: zipMime,
    sizeBytes: bytes.byteLength,
  });

  assert.deepEqual(extracted.packageContext?.members.map(({ role }) => role), [
    "primary", "acceptance_act", "acceptance_act",
  ]);
  assert.ok(extracted.packageContext?.relationships.some((relationship) =>
    relationship.fromMemberId === "package-member-02"
    && relationship.toMemberId === "package-member-01"
    && relationship.kind === "references"
    && relationship.evidence.includes("filename_reference")));
  assert.ok(extracted.packageContext?.relationships.some((relationship) =>
    relationship.fromMemberId === "package-member-03"
    && relationship.toMemberId === "package-member-02"
    && relationship.kind === "possible_duplicate"
    && relationship.evidence.includes("normalized_text_match")));
});

test("package context validator rejects self-links and unknown members", () => {
  const member = {
    id: "package-member-01",
    name: "contract.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    role: "primary",
    detectedLanguage: "ru",
    pageCount: 1,
    sectionCount: 1,
  };
  assert.equal(isAnalysisPackageContext({
    schemaVersion: 1,
    primaryMemberId: member.id,
    members: [member],
    relationships: [],
  }), true);
  assert.equal(isAnalysisPackageContext({
    schemaVersion: 1,
    primaryMemberId: member.id,
    members: [member],
    relationships: [{
      fromMemberId: member.id,
      toMemberId: member.id,
      kind: "references",
      confidence: "high",
      evidence: ["filename_reference"],
    }],
  }), false);
  assert.equal(isAnalysisPackageContext({
    schemaVersion: 1,
    primaryMemberId: "package-member-99",
    members: [member],
    relationships: [],
  }), false);
});

test("package context does not invent a primary document for supplement-only packages", async () => {
  const bytes = packageBytes({
    "Приложение 1.docx": docxBytes(["ПРИЛОЖЕНИЕ", "Подробный перечень работ, сроков, этапов и результатов исполнения обязательств сторонами."]),
    "Акт выполненных работ.docx": docxBytes(["АКТ", "Стороны подтверждают выполнение, передачу и приёмку предусмотренных договором работ без замечаний."]),
  });
  const extracted = await extractAnalysisDocument({
    bytes,
    fileName: "supplements.zip",
    mimeType: zipMime,
    sizeBytes: bytes.byteLength,
  });

  assert.equal(extracted.packageContext?.primaryMemberId, null);
  assert.deepEqual(extracted.packageContext?.members.map(({ role }) => role), [
    "acceptance_act", "annex",
  ]);
  assert.deepEqual(extracted.packageContext?.relationships, []);
});

test("a contract filename remains primary when its body mentions an annex", async () => {
  const bytes = packageBytes({
    "Договор услуг.docx": docxBytes(["ДОГОВОР", "Приложение является его неотъемлемой частью и подробно определяет согласованный сторонами объём услуг."]),
    "Приложение 1.docx": docxBytes(["ПРИЛОЖЕНИЕ", "Подробный перечень работ, сроков, этапов и результатов исполнения обязательств сторонами."]),
  });
  const extracted = await extractAnalysisDocument({
    bytes,
    fileName: "contract-with-annex.zip",
    mimeType: zipMime,
    sizeBytes: bytes.byteLength,
  });

  assert.equal(extracted.packageContext?.primaryMemberId, "package-member-01");
  assert.deepEqual(extracted.packageContext?.members.map(({ role }) => role), [
    "primary", "annex",
  ]);
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

test("a package member with a spoofed extension fails before extraction or OCR", async () => {
  const bytes = packageBytes({
    "spoofed.png": new TextEncoder().encode("not a PNG payload"),
  });
  await assert.rejects(
    extractAnalysisDocument({ bytes, fileName: "spoofed.zip", mimeType: zipMime, sizeBytes: bytes.byteLength }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "CORRUPT_FILE",
  );
});
