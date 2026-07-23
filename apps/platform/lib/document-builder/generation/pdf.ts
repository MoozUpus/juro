import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { RenderedParagraph } from "../types";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 56.7;
const TOP = 56.7;
const FOOTER_HEIGHT = 43;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraphStyle(paragraph: RenderedParagraph): { size: number; lineHeight: number; before: number; after: number; bold: boolean; align: "left" | "center" | "justify"; indent: number } {
  if (paragraph.kind === "title") return { size: 14, lineHeight: 18, before: 0, after: 5, bold: true, align: "center", indent: 0 };
  if (paragraph.kind === "subtitle") return { size: 11.5, lineHeight: 15, before: 0, after: 8, bold: true, align: "center", indent: 0 };
  if (paragraph.kind === "heading") return { size: 11.5, lineHeight: 15, before: 10, after: 6, bold: true, align: "center", indent: 0 };
  if (paragraph.kind === "list") return { size: 10.5, lineHeight: 14.2, before: 0, after: 4, bold: false, align: "justify", indent: 18 };
  if (paragraph.kind === "signature") return { size: 10.5, lineHeight: 14.2, before: 2, after: 4, bold: false, align: "left", indent: 0 };
  if (paragraph.kind === "spacer") return { size: 10.5, lineHeight: 12, before: 0, after: 10, bold: false, align: "left", indent: 0 };
  return { size: 10.5, lineHeight: 14.2, before: 0, after: 5, bold: false, align: "justify", indent: 0 };
}

function drawJustifiedLine(page: PDFPage, line: string, x: number, y: number, width: number, font: PDFFont, size: number, justify: boolean): void {
  const words = line.split(" ");
  if (!justify || words.length < 2) {
    page.drawText(line, { x, y, size, font, color: rgb(0.08, 0.1, 0.12) });
    return;
  }
  const wordsWidth = words.reduce((total, word) => total + font.widthOfTextAtSize(word, size), 0);
  const space = (width - wordsWidth) / (words.length - 1);
  let cursor = x;
  for (const word of words) {
    page.drawText(word, { x: cursor, y, size, font, color: rgb(0.08, 0.1, 0.12) });
    cursor += font.widthOfTextAtSize(word, size) + space;
  }
}

function drawFooter(page: PDFPage, index: number, total: number, font: PDFFont, mark: PDFImage): void {
  const y = 22;
  page.drawLine({ start: { x: MARGIN_X, y: y + 17 }, end: { x: A4_WIDTH - MARGIN_X, y: y + 17 }, thickness: 0.4, color: rgb(0.78, 0.72, 0.62) });
  page.drawImage(mark, { x: MARGIN_X, y: y - 1, width: 13, height: 13 });
  page.drawText("Создано в JURO", { x: MARGIN_X + 18, y: y + 1, size: 7.4, font, color: rgb(0.32, 0.36, 0.4) });
  const numberText = `Страница ${index + 1} из ${total}`;
  page.drawText(numberText, { x: A4_WIDTH - MARGIN_X - font.widthOfTextAtSize(numberText, 7.4), y: y + 1, size: 7.4, font, color: rgb(0.32, 0.36, 0.4) });
}

export async function generatePdf(
  paragraphs: RenderedParagraph[],
  regularBytes: ArrayBuffer,
  boldBytes: ArrayBuffer,
  markBytes: ArrayBuffer,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const mark = await pdf.embedPng(markBytes);
  pdf.setTitle("JURO — Расписка в получении денежных средств");
  pdf.setCreator("JURO");
  pdf.setProducer("JURO Document Builder");

  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - TOP;
  const contentWidth = A4_WIDTH - MARGIN_X * 2;
  for (const paragraph of paragraphs) {
    const style = paragraphStyle(paragraph);
    const font = style.bold ? bold : regular;
    const text = paragraph.kind === "list" ? `• ${paragraph.text}` : paragraph.text;
    const availableWidth = contentWidth - style.indent;
    const lines = wrapText(text, font, style.size, availableWidth);
    const required = style.before + lines.length * style.lineHeight + style.after + (paragraph.keepWithNext ? 20 : 0);
    if (y - required < FOOTER_HEIGHT) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - TOP;
    }
    y -= style.before;
    lines.forEach((line, lineIndex) => {
      const lineWidth = font.widthOfTextAtSize(line, style.size);
      const x = style.align === "center" ? (A4_WIDTH - lineWidth) / 2 : MARGIN_X + style.indent;
      const isLast = lineIndex === lines.length - 1;
      drawJustifiedLine(page, line, x, y - style.lineHeight, availableWidth, font, style.size, style.align === "justify" && !isLast && line.length > 35);
      y -= style.lineHeight;
    });
    y -= style.after;
  }

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => drawFooter(pdfPage, index, pages.length, regular, mark));
  const bytes = await pdf.save({ useObjectStreams: false });
  if (bytes.byteLength < 1_000 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new Error("Generated PDF is invalid");
  }
  return bytes;
}
