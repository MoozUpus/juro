import PizZip from "pizzip";

import {
  detectDocumentLanguage,
  extractDocument,
} from "../document-comparison/extract";
import {
  ComparisonProcessingError,
  type ExtractedDocument,
  type ExtractedSection,
} from "../document-comparison/types";
import { verifyArchiveBytes } from "./archive-inspector";

const ZIP_MIME_TYPE = "application/zip";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PACKAGE_PAGES = 500;
const MAX_INLINE_MEMBER_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_PACKAGE_BYTES = 50 * 1024 * 1024;

const memberMimeTypes = new Map([
  ["pdf", "application/pdf"],
  ["docx", DOCX_MIME_TYPE],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
]);

export class PackageExtractionError extends Error {
  readonly code = "PACKAGE_CAPACITY_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "PackageExtractionError";
  }
}

export async function extractAnalysisDocument(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ExtractedDocument> {
  if (input.mimeType !== ZIP_MIME_TYPE) return extractDocument(input);

  await verifyArchiveBytes(input.bytes, input.mimeType);
  let zip: PizZip;
  try {
    zip = new PizZip(input.bytes);
  } catch {
    throw new ComparisonProcessingError("CORRUPT_FILE", "ZIP-пакет повреждён или не может быть прочитан.");
  }

  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const documents: ExtractedDocument[] = [];
  let totalPages = 0;
  let totalMemberBytes = 0;

  for (const name of names) {
    const member = zip.file(name);
    const extension = name.split(".").at(-1)?.toLocaleLowerCase() ?? "";
    const mimeType = memberMimeTypes.get(extension);
    if (!member || !mimeType) {
      throw new ComparisonProcessingError("UNSUPPORTED_FILE", "ZIP-пакет содержит неподдерживаемый файл.");
    }
    if (mimeType.startsWith("image/")) {
      throw new ComparisonProcessingError(
        "OCR_REQUIRED",
        "ZIP-пакет содержит скан. Его нельзя анализировать до распознавания каждого файла отдельно.",
      );
    }
    const bytes = member.asUint8Array();
    totalMemberBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_INLINE_MEMBER_BYTES || totalMemberBytes > MAX_INLINE_PACKAGE_BYTES) {
      throw new PackageExtractionError("ZIP-пакет превышает лимит встроенного безопасного извлечения.");
    }
    const extracted = await extractDocument({
      bytes,
      fileName: name,
      mimeType,
      sizeBytes: bytes.byteLength,
    });
    totalPages += extracted.pageCount ?? 0;
    if (totalPages > MAX_PACKAGE_PAGES) {
      throw new ComparisonProcessingError(
        "PAGE_LIMIT_EXCEEDED",
        `ZIP-пакет содержит более ${MAX_PACKAGE_PAGES} распознанных страниц.`,
      );
    }
    documents.push(extracted);
  }

  const text = documents
    .map((document) => `===== ФАЙЛ: ${JSON.stringify(document.fileName)} =====\n\n${document.text}`)
    .join("\n\n");
  const sections: ExtractedSection[] = [];
  for (const [documentIndex, document] of documents.entries()) {
    for (const section of document.sections) {
      sections.push({
        ...section,
        id: `package-${documentIndex + 1}-${section.id}`,
        index: sections.length,
        heading: section.heading ? `${document.fileName} — ${section.heading}` : document.fileName,
      });
    }
  }

  const warnings = documents
    .map((document) => document.warningCode)
    .filter((warning): warning is string => Boolean(warning));
  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    pageCount: totalPages || null,
    detectedLanguage: detectDocumentLanguage(text),
    textQuality: documents.some((document) => document.textQuality === "limited") ? "limited" : "good",
    warningCode: ["PACKAGE_MULTI_DOCUMENT", ...warnings].join(","),
    text,
    sections,
  };
}
