import type { RenderedParagraph } from "../document-builder/types";

export type CorrectedExportVariant = "corrected_clean" | "corrected_redline";

export type AppliedRevisionForExport = {
  id: string;
  originalText: string;
  proposedText: string;
  riskLevel: string;
  riskTitle: string;
  clause: string | null;
  page: number | null;
  recommendation: string | null;
  legalBasisSourceIds: string[];
};

export function correctedVersionParagraphs(input: {
  text: string;
  version: number;
  sourceFileName: string;
  generatedAt: string;
  language: "ru" | "uz";
  variant: CorrectedExportVariant;
  revisions: AppliedRevisionForExport[];
}): RenderedParagraph[] {
  const ru = input.language === "ru";
  const title = input.variant === "corrected_redline"
    ? (ru ? "JURO — версия с отметками изменений" : "JURO — o‘zgarishlar belgilangan nusxa")
    : (ru ? "JURO — исправленная версия" : "JURO — tuzatilgan nusxa");
  const paragraphs: RenderedParagraph[] = [
    paragraph("title", title, "export-title", true),
    paragraph("subtitle", ru ? `Нормализованная версия ${input.version}` : `${input.version}-normallashtirilgan nusxa`, "export-version"),
    paragraph("body", `${ru ? "Исходный файл" : "Asl fayl"}: ${input.sourceFileName}`, "export-source"),
    paragraph("body", `${ru ? "Создано" : "Yaratilgan"}: ${input.generatedAt}`, "export-date"),
    paragraph("body", ru
      ? "Документ создан из извлечённого нормализованного текста. Исходное форматирование PDF/DOCX не воспроизводится."
      : "Hujjat ajratilgan normallashtirilgan matndan yaratildi. Asl PDF/DOCX formatlanishi qayta tiklanmaydi.", "export-disclaimer"),
  ];

  if (input.variant === "corrected_redline") {
    paragraphs.push(paragraph("heading", ru ? "Применённые изменения" : "Qo‘llangan o‘zgarishlar", "changes-heading", true));
    for (const [index, revision] of input.revisions.entries()) {
      const location = [revision.clause, revision.page ? `${ru ? "стр." : "sah."} ${revision.page}` : null].filter(Boolean).join(" · ");
      paragraphs.push(paragraph("subtitle", `${index + 1}. ${revision.riskTitle}${location ? ` · ${location}` : ""}`, `change-${index}-title`));
      paragraphs.push({ ...paragraph("body", `${ru ? "Удалено" : "Olib tashlandi"}: ${revision.originalText}`, `change-${index}-deleted`), reviewMark: "deleted" });
      paragraphs.push({ ...paragraph("body", `${ru ? "Добавлено" : "Qo‘shildi"}: ${revision.proposedText}`, `change-${index}-inserted`), reviewMark: "inserted" });
      if (revision.recommendation) paragraphs.push(paragraph("body", `${ru ? "Обоснование" : "Asos"}: ${revision.recommendation}`, `change-${index}-reason`));
      if (revision.legalBasisSourceIds.length) paragraphs.push(paragraph("body", `${ru ? "Связанные источники" : "Bog‘langan manbalar"}: ${revision.legalBasisSourceIds.join(", ")}`, `change-${index}-sources`));
    }
  }

  paragraphs.push(paragraph("heading", ru ? "Исправленный нормализованный текст" : "Tuzatilgan normallashtirilgan matn", "corrected-heading", true));
  paragraphs.push(...markdownParagraphs(input.text));
  return paragraphs;
}

function markdownParagraphs(text: string): RenderedParagraph[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output: RenderedParagraph[] = [];
  let body: string[] = [];
  const flush = () => {
    const value = body.join(" ").trim();
    if (value) output.push(paragraph("body", value, `corrected-${output.length}`));
    body = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flush(); output.push(paragraph("heading", heading[2]!, `corrected-${output.length}`, true)); continue; }
    const list = /^(?:[-*+] |\d+[.)]\s+)(.+)$/.exec(line);
    if (list) { flush(); output.push(paragraph("list", list[1]!, `corrected-${output.length}`)); continue; }
    body.push(line);
  }
  flush();
  return output.length ? output : [paragraph("body", "—", "corrected-empty")];
}

function paragraph(kind: RenderedParagraph["kind"], text: string, id: string, keepWithNext = false): RenderedParagraph {
  return { id, kind, text, ...(keepWithNext ? { keepWithNext: true } : {}) };
}
