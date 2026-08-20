import PizZip from "pizzip";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { extractText, getDocumentProxy } from "unpdf";
import {
  ComparisonProcessingError,
  type ExtractedDocument,
  type ExtractedSection,
} from "./types";

const PDF_PAGE_LIMIT = 250;
const EXTRACTION_TIMEOUT_MS = 25_000;
const MIN_READABLE_CHARACTERS = 24;
const MAX_SECTIONS = 4_000;

const decodeXml = (value: string): string => value
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function semanticText(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase()
    .replace(/^[\s(]*(?:\d+[.\d]*|[a-zа-яёўқғҳ]+)[.)]?\s+/iu, "")
    .replace(/[“”„«»"']/g, "")
    .replace(/[^\p{L}\p{N}%₽$€£₸₴.,:/+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionLabel(value: string): string | null {
  const numbered = value.match(/^\s*((?:\d+)(?:\.\d+)*[.)]?)\s+/u);
  if (numbered) return numbered[1].replace(/[.)]$/, "");
  const article = value.match(/^\s*((?:статья|модда|band|article)\s+\d+(?:\.\d+)*)\b/iu);
  return article?.[1] ?? null;
}

function isHeading(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 180) return false;
  if (/^(?:раздел|глава|статья|приложение|bo['‘’ʻʼ]?lim|bob|modda|ilova|section|chapter|annex)\b/iu.test(text)) return true;
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 4 && text === text.toLocaleUpperCase() && !/[.!?]$/.test(text);
}

export function structureDocument(text: string): ExtractedSection[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n{2,}|(?=\n\s*(?:\d+(?:\.\d+)*(?:[.)])?\s+|(?:раздел|глава|статья|приложение|bo['‘’ʻʼ]?lim|bob|modda|ilova)\b))/iu)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (trimmed.length <= 2_800) return [trimmed];
      return trimmed.split(/(?<=[.!?;])\s+(?=[А-ЯA-ZЎҚҒҲ])/u);
    })
    .filter(Boolean)
    .slice(0, MAX_SECTIONS);

  let currentHeading: string | null = null;
  return paragraphs.map((paragraph, index) => {
    if (isHeading(paragraph)) currentHeading = paragraph;
    const normalizedParagraph = normalizeText(paragraph);
    return {
      id: `section-${index + 1}`,
      index,
      label: sectionLabel(normalizedParagraph),
      heading: isHeading(normalizedParagraph) ? normalizedParagraph : currentHeading,
      text: normalizedParagraph,
      normalizedText: normalizedParagraph.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
      semanticText: semanticText(normalizedParagraph),
    };
  });
}

export function detectDocumentLanguage(text: string): ExtractedDocument["detectedLanguage"] {
  const sample = text.slice(0, 30_000).toLocaleLowerCase();
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) ?? []).length;
  const latin = (sample.match(/[a-z]/g) ?? []).length;
  const uzMarkers = (sample.match(/[ўқғҳ]|(?:o|g)[‘’ʻʼ']|sh|ch|ning\b|uchun\b/g) ?? []).length;
  const ruMarkers = (sample.match(/[ыэъё]|(?:ого|ему|ции|ость|для|или|при)\b/g) ?? []).length;
  if (cyrillic < 8 && latin < 8) return "unknown";
  if (uzMarkers && ruMarkers) return "mixed";
  if (uzMarkers > ruMarkers) return "uz";
  if (cyrillic > latin || ruMarkers) return "ru";
  return "uz";
}

function extractDocxText(bytes: Uint8Array): string {
  try {
    const zip = new PizZip(bytes);
    const document = zip.file("word/document.xml");
    if (!document) throw new Error("word/document.xml is missing");
    return normalizeText(document.asText()
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map(decodeXml)
      .join("\n"));
  } catch (error) {
    throw new ComparisonProcessingError(
      "CORRUPT_FILE",
      error instanceof Error ? `DOCX повреждён: ${error.message}` : "DOCX повреждён.",
    );
  }
}

function decodeUtf8Text(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ComparisonProcessingError("CORRUPT_FILE", `${label} повреждён или не является UTF-8.`);
  }
}

function extractHtmlText(bytes: Uint8Array): string {
  const html = decodeUtf8Text(bytes, "HTML-файл");
  const document = parse(html);
  const blocks = new Set(["address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"]);
  const ignored = new Set(["script", "style", "noscript", "template", "iframe", "object", "embed", "svg"]);
  const parts: string[] = [];
  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if (node.nodeName === "#text") {
      parts.push((node as DefaultTreeAdapterTypes.TextNode).value);
      return;
    }
    if (!("childNodes" in node)) return;
    const tagName = "tagName" in node ? String(node.tagName).toLocaleLowerCase() : "";
    if (ignored.has(tagName)) return;
    if (blocks.has(tagName)) parts.push("\n");
    for (const child of node.childNodes) visit(child);
    if (blocks.has(tagName)) parts.push("\n");
  };
  visit(document);
  return normalizeText(parts.join(" "));
}

function extractJsonText(bytes: Uint8Array): string {
  const source = decodeUtf8Text(bytes, "JSON-файл");
  try {
    return normalizeText(JSON.stringify(JSON.parse(source), null, 2));
  } catch {
    throw new ComparisonProcessingError("CORRUPT_FILE", "JSON-файл содержит недопустимую структуру.");
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ComparisonProcessingError("PROCESSING_TIMEOUT", "Извлечение текста превысило допустимое время.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  try {
    const pdf = await withTimeout(
      getDocumentProxy(bytes, { maxImageSize: 16_777_216 }),
      EXTRACTION_TIMEOUT_MS,
    );
    if (pdf.numPages > PDF_PAGE_LIMIT) {
      await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
      throw new ComparisonProcessingError(
        "PAGE_LIMIT_EXCEEDED",
        `Документ содержит ${pdf.numPages} страниц. Максимум для одного сравнения — ${PDF_PAGE_LIMIT}.`,
      );
    }
    const result = await withTimeout(
      extractText(pdf, { mergePages: true }),
      EXTRACTION_TIMEOUT_MS,
    );
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
    return { text: normalizeText(String(result.text)), pageCount: result.totalPages };
  } catch (error) {
    if (error instanceof ComparisonProcessingError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypted|PasswordException/i.test(message)) {
      throw new ComparisonProcessingError("PASSWORD_PROTECTED", "PDF защищён паролем. Снимите защиту и загрузите файл повторно.");
    }
    throw new ComparisonProcessingError("CORRUPT_FILE", "PDF повреждён или не может быть прочитан.");
  }
}

export async function extractDocument(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ExtractedDocument> {
  let text = "";
  let pageCount: number | null = null;
  if (input.mimeType === "application/pdf") {
    const pdf = await extractPdfText(input.bytes);
    text = pdf.text;
    pageCount = pdf.pageCount;
  } else if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = extractDocxText(input.bytes);
  } else if (input.mimeType === "text/markdown; charset=utf-8") {
    try {
      text = normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes));
    } catch {
      throw new ComparisonProcessingError("CORRUPT_FILE", "Текстовый снимок документа повреждён.");
    }
  } else if (input.mimeType === "text/plain") {
    text = normalizeText(decodeUtf8Text(input.bytes, "Текстовый файл"));
  } else if (input.mimeType === "text/html") {
    text = extractHtmlText(input.bytes);
  } else if (input.mimeType === "application/json") {
    text = extractJsonText(input.bytes);
  } else if (input.mimeType === "image/jpeg" || input.mimeType === "image/png") {
    throw new ComparisonProcessingError(
      "OCR_REQUIRED",
      "Скан не содержит извлекаемого текста. Для сравнения требуется подключённый OCR-провайдер.",
    );
  } else {
    throw new ComparisonProcessingError("UNSUPPORTED_FILE", "Формат файла не поддерживается для сравнения.");
  }

  const readableCharacters = text.replace(/[^\p{L}\p{N}]/gu, "").length;
  if (readableCharacters < MIN_READABLE_CHARACTERS) {
    throw new ComparisonProcessingError(
      "NO_READABLE_TEXT",
      "В документе недостаточно читаемого текста. Проверьте качество скана или загрузите DOCX.",
    );
  }
  const sections = structureDocument(text);
  const textDensity = pageCount ? readableCharacters / pageCount : readableCharacters;
  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    pageCount,
    detectedLanguage: detectDocumentLanguage(text),
    textQuality: pageCount && textDensity < 80 ? "limited" : "good",
    warningCode: pageCount && textDensity < 80 ? "LOW_TEXT_DENSITY" : null,
    text,
    sections,
  };
}
