import PizZip from "pizzip";
import type { RenderedParagraph } from "../types";

const xmlEscape = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function paragraphXml(paragraph: RenderedParagraph, index: number): string {
  if (paragraph.kind === "spacer") {
    return `<w:p w14:paraId="${(index + 1).toString(16).padStart(8, "0").toUpperCase()}"><w:pPr><w:spacing w:after="220"/></w:pPr></w:p>`;
  }
  const isTitle = paragraph.kind === "title";
  const isSubtitle = paragraph.kind === "subtitle";
  const isHeading = paragraph.kind === "heading";
  const isList = paragraph.kind === "list";
  const isSignature = paragraph.kind === "signature";
  const center = isTitle || isSubtitle || isHeading;
  // OOXML stores font size in half-points: 28 = 14 pt, 24 = 12 pt, 22 = 11 pt.
  const size = isTitle ? 28 : isSubtitle || isHeading ? 24 : 22;
  const after = isTitle ? 80 : isSubtitle ? 160 : isHeading ? 140 : 100;
  const before = isHeading ? 180 : 0;
  const indentation = isList ? `<w:ind w:left="420" w:hanging="220"/>` : "";
  const listText = isList ? `• ${paragraph.text}` : paragraph.text;
  const keep = paragraph.keepWithNext || isHeading || isTitle || isSubtitle ? "<w:keepNext/>" : "";
  const justification = center ? "center" : isSignature ? "left" : "both";
  const bold = isTitle || isSubtitle || isHeading ? "<w:b/><w:bCs/>" : "";
  const preserve = /^\s|\s$/.test(listText) ? ' xml:space="preserve"' : "";
  return `<w:p w14:paraId="${(index + 1).toString(16).padStart(8, "0").toUpperCase()}">
    <w:pPr>${keep}<w:widowControl/><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>${indentation}<w:jc w:val="${justification}"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold}<w:lang w:val="ru-RU" w:eastAsia="ru-RU" w:bidi="ru-RU"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold}<w:lang w:val="ru-RU" w:eastAsia="ru-RU" w:bidi="ru-RU"/></w:rPr><w:t${preserve}>${xmlEscape(listText)}</w:t></w:r>
  </w:p>`;
}

export function generateDocx(templateBytes: ArrayBuffer, paragraphs: RenderedParagraph[]): Uint8Array {
  const zip = new PizZip(templateBytes);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("DOCX template has no word/document.xml");
  const documentXml = documentFile.asText();
  const bodyStart = documentXml.indexOf("<w:body>");
  const sectionStart = documentXml.lastIndexOf("<w:sectPr");
  const bodyEnd = documentXml.indexOf("</w:body>");
  if (bodyStart < 0 || sectionStart < 0 || bodyEnd < 0 || sectionStart <= bodyStart) {
    throw new Error("DOCX template body is malformed");
  }
  const sectionXml = documentXml.slice(sectionStart, bodyEnd);
  const contentXml = paragraphs.map(paragraphXml).join("");
  const nextXml = `${documentXml.slice(0, bodyStart + "<w:body>".length)}${contentXml}${sectionXml}</w:body>${documentXml.slice(bodyEnd + "</w:body>".length)}`;
  if (/\{\{[^}]+\}\}/.test(nextXml)) throw new Error("Unresolved template placeholder in DOCX");
  zip.file("word/document.xml", nextXml);
  const generated = zip.generate({ type: "uint8array", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (generated.byteLength < 1_000 || generated[0] !== 0x50 || generated[1] !== 0x4b) {
    throw new Error("Generated DOCX is not a valid OOXML archive");
  }
  return generated;
}
