import PizZip from "pizzip";
import type { RenderedParagraph } from "../types";

export type DocxGenerationOptions = {
  documentLanguage?: "ru-RU" | "uz-Latn-UZ" | "en-GB";
  title?: string;
  subject?: string;
  keywords?: string;
  footer?: {
    createdLabel: string;
    pageLabel: string;
    totalLabel: string;
  };
};

const xmlEscape = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function paragraphXml(paragraph: RenderedParagraph, index: number, documentLanguage: string): string {
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
  const review = paragraph.reviewMark === "deleted"
    ? '<w:color w:val="9D2B21"/><w:strike/><w:shd w:val="clear" w:color="auto" w:fill="FCE8E6"/>'
    : paragraph.reviewMark === "inserted"
      ? '<w:color w:val="17653A"/><w:u w:val="single"/><w:shd w:val="clear" w:color="auto" w:fill="E8F5EC"/>'
      : "";
  const preserve = /^\s|\s$/.test(listText) ? ' xml:space="preserve"' : "";
  return `<w:p w14:paraId="${(index + 1).toString(16).padStart(8, "0").toUpperCase()}">
    <w:pPr>${keep}<w:widowControl/><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>${indentation}<w:jc w:val="${justification}"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold}<w:lang w:val="${documentLanguage}" w:eastAsia="${documentLanguage}" w:bidi="${documentLanguage}"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold}${review}<w:lang w:val="${documentLanguage}" w:eastAsia="${documentLanguage}" w:bidi="${documentLanguage}"/></w:rPr><w:t${preserve}>${xmlEscape(listText)}</w:t></w:r>
  </w:p>`;
}

export function generateDocx(
  templateBytes: ArrayBuffer,
  paragraphs: RenderedParagraph[],
  options: DocxGenerationOptions = {},
): Uint8Array {
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
  const documentLanguage = options.documentLanguage ?? "ru-RU";
  const contentXml = paragraphs.map((paragraph, index) => paragraphXml(paragraph, index, documentLanguage)).join("");
  const nextXml = `${documentXml.slice(0, bodyStart + "<w:body>".length)}${contentXml}${sectionXml}</w:body>${documentXml.slice(bodyEnd + "</w:body>".length)}`;
  if (/\{\{[^}]+\}\}/.test(nextXml)) throw new Error("Unresolved template placeholder in DOCX");
  zip.file("word/document.xml", nextXml);

  if (options.footer) {
    const footerFile = zip.file("word/footer1.xml");
    if (footerFile) {
      const footerXml = footerFile.asText()
        .replace("  Создано в JURO  ·  Страница ", `  ${xmlEscape(options.footer.createdLabel)}  ·  ${xmlEscape(options.footer.pageLabel)} `)
        .replace(" из ", ` ${xmlEscape(options.footer.totalLabel)} `);
      zip.file("word/footer1.xml", footerXml);
    }
  }

  const coreFile = zip.file("docProps/core.xml");
  if (coreFile && (options.title || options.subject || options.keywords)) {
    let coreXml = coreFile.asText();
    if (options.title) coreXml = replaceCoreProperty(coreXml, "dc:title", options.title);
    if (options.subject) coreXml = replaceCoreProperty(coreXml, "dc:subject", options.subject);
    if (options.keywords) coreXml = replaceCoreProperty(coreXml, "cp:keywords", options.keywords);
    zip.file("docProps/core.xml", coreXml);
  }
  const generated = zip.generate({ type: "uint8array", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (generated.byteLength < 1_000 || generated[0] !== 0x50 || generated[1] !== 0x4b) {
    throw new Error("Generated DOCX is not a valid OOXML archive");
  }
  return generated;
}

function replaceCoreProperty(xml: string, element: string, value: string): string {
  return xml.replace(new RegExp(`<${element}>[\\s\\S]*?<\\/${element}>`), `<${element}>${xmlEscape(value)}</${element}>`);
}
