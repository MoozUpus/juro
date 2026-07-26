import type { RenderedParagraph } from "../document-builder/types";
import type { ComparisonAccessRow } from "./storage";
import type { ComparisonChange, ComparisonSummary } from "./types";

type ReportSource = {
  id: string;
  actTitle?: string;
  actIdentifier?: string | null;
  officialUrl?: string;
  revisionDate?: string | null;
  lastCheckedAt?: string;
};

export function comparisonReportParagraphs(input: {
  comparison: ComparisonAccessRow;
  summary: ComparisonSummary | null;
  changes: ComparisonChange[];
  sources: ReportSource[];
}): RenderedParagraph[] {
  const ru = input.comparison.locale !== "uz";
  const paragraphs: RenderedParagraph[] = [];
  const push = (
    text: string,
    kind: RenderedParagraph["kind"] = "body",
    keepWithNext = false,
  ) => paragraphs.push({ id: `comparison-report-${paragraphs.length + 1}`, text, kind, keepWithNext });
  const summary = input.summary;
  const sourceMap = new Map(input.sources.map((source) => [source.id, source]));

  push(ru ? "ОТЧЁТ О СРАВНЕНИИ ДОКУМЕНТОВ" : "HUJJATLARNI TAQQOSLASH HISOBOTI", "title");
  push(
    `${ru ? "Исходная версия" : "Dastlabki versiya"}: ${input.comparison.versionOneName}\n`
      + `${ru ? "Новая редакция" : "Yangi tahrir"}: ${input.comparison.versionTwoName}`,
    "subtitle",
  );
  push(`${ru ? "Дата формирования" : "Yaratilgan sana"}: ${new Intl.DateTimeFormat(
    ru ? "ru-RU" : "uz-UZ",
    { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tashkent" },
  ).format(new Date())}`);

  push(ru ? "КРАТКОЕ РЕЗЮМЕ" : "QISQA XULOSA", "heading", true);
  if (summary) {
    push(`${ru ? "Всего изменений" : "Jami o‘zgarishlar"}: ${summary.totalChanges}.`);
    push(`${ru ? "Существенных изменений" : "Muhim o‘zgarishlar"}: ${summary.materialChanges}.`);
    push(`${ru ? "Добавлено / удалено / изменено" : "Qo‘shilgan / olib tashlangan / o‘zgartirilgan"}: ${summary.added} / ${summary.removed} / ${summary.changed}.`);
    push(`${ru ? "Сходство документов" : "Hujjatlar o‘xshashligi"}: ${summary.similarityPercent}%.`);
    push(`${ru ? "Общий уровень риска" : "Umumiy xavf darajasi"}: ${summary.overallRisk}.`);
    if (summary.aiStatus !== "completed" && summary.aiStatus !== "not_required") {
      push(
        ru
          ? "Юридическая AI-оценка не была полностью выполнена. Детерминированный redline сохранён; выводы требуют проверки юриста."
          : "Yuridik AI-baholash to‘liq bajarilmadi. Deterministik redline saqlandi; xulosalar yurist tekshiruvini talab qiladi.",
        "body",
      );
    }
  }

  push(ru ? "СУЩЕСТВЕННЫЕ ИЗМЕНЕНИЯ" : "MUHIM O‘ZGARISHLAR", "heading", true);
  const materialChanges = input.changes.filter((change) =>
    change.changeType !== "unchanged" && change.changeType !== "formatting",
  );
  if (!materialChanges.length) {
    push(ru ? "Существенных изменений не обнаружено." : "Muhim o‘zgarishlar topilmadi.");
  }
  for (const change of materialChanges) {
    const label = change.afterLabel || change.beforeLabel || String(change.ordinal);
    push(`${label}. ${change.summary}`, "heading", true);
    if (change.beforeText) push(`${ru ? "Было" : "Oldin"}: ${change.beforeText}`);
    if (change.afterText) push(`${ru ? "Стало" : "Keyin"}: ${change.afterText}`);
    push(`${ru ? "Юридическое значение" : "Yuridik ahamiyat"}: ${change.legalEffect}`);
    push(`${ru ? "Влияние" : "Ta’sir"}: ${change.affectedParty}; ${ru ? "риск" : "xavf"} — ${change.riskLevel}.`);
    push(`${ru ? "Рекомендация" : "Tavsiya"}: ${change.recommendation}`);
    if (change.sourceIds.length) {
      for (const sourceId of change.sourceIds) {
        const source = sourceMap.get(sourceId);
        if (!source) continue;
        push(
          `${ru ? "Источник" : "Manba"}: ${source.actTitle || sourceId}`
            + `${source.actIdentifier ? ` (${source.actIdentifier})` : ""}`
            + `${source.revisionDate ? ` · ${source.revisionDate}` : ""}`
            + `${source.officialUrl ? ` · ${source.officialUrl}` : ""}`,
          "list",
        );
      }
    } else {
      push(ru ? "Источник временно не проверен." : "Manba vaqtincha tekshirilmagan.", "list");
    }
  }

  push(ru ? "ДИСКЛЕЙМЕР JURO" : "JURO OGOHLANTIRISHI", "heading", true);
  push(
    ru
      ? "Отчёт создан автоматизированно и не заменяет индивидуальную юридическую консультацию. Перед подписанием или изменением существенного документа проверьте выводы и официальные источники."
      : "Hisobot avtomatlashtirilgan tarzda yaratilgan va individual yuridik maslahat o‘rnini bosmaydi. Muhim hujjatni imzolash yoki o‘zgartirishdan oldin xulosalar va rasmiy manbalarni tekshiring.",
  );
  return paragraphs;
}
