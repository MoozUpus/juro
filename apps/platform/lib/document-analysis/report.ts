import type { RenderedParagraph } from "../document-builder/types";
import type { DocumentAnalysisResult } from "./schema";

export function analysisReportParagraphs(input: {
  result: DocumentAnalysisResult;
  sourceFileName: string;
  generatedAt: string;
}): RenderedParagraph[] {
  const ru = input.result.outputLanguage === "ru";
  const paragraphs: RenderedParagraph[] = [];
  const push = (
    text: string,
    kind: RenderedParagraph["kind"] = "body",
    keepWithNext = false,
  ) => paragraphs.push({ id: `analysis-report-${paragraphs.length + 1}`, text, kind, keepWithNext });
  const list = (values: string[]) => values.forEach((value) => push(value, "list"));

  push(ru ? "ОТЧЁТ ОБ АНАЛИЗЕ ДОКУМЕНТА" : "HUJJAT TAHLILI HISOBOTI", "title");
  push(`${ru ? "Документ" : "Hujjat"}: ${input.sourceFileName}`, "subtitle");
  push(`${ru ? "Сформировано" : "Yaratilgan"}: ${new Intl.DateTimeFormat(
    ru ? "ru-RU" : "uz-UZ",
    { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tashkent" },
  ).format(new Date(input.generatedAt))}`);
  push(`${ru ? "Тип документа" : "Hujjat turi"}: ${input.result.documentType}.`);
  push(`${ru ? "Режим" : "Rejim"}: ${input.result.mode}. ${ru ? "Юрисдикция" : "Yurisdiksiya"}: ${input.result.jurisdiction}.`);
  if (input.result.userSide) push(`${ru ? "Сторона пользователя" : "Foydalanuvchi tomoni"}: ${input.result.userSide}.`);

  push(ru ? "КРАТКОЕ РЕЗЮМЕ" : "QISQA XULOSA", "heading", true);
  push(input.result.summary);
  push(`${ru ? "Общая оценка качества" : "Umumiy sifat bahosi"}: ${input.result.overallQuality.score}/100. ${input.result.overallQuality.explanation}`);
  push(`${ru ? "Проверка по законодательству" : "Qonunchilik bo‘yicha tekshiruv"}: ${input.result.legalComplianceStatus}.`);

  if (input.result.parties.length) {
    push(ru ? "СТОРОНЫ" : "TOMONLAR", "heading", true);
    list(input.result.parties.map((party) => `${party.name} — ${party.role}${party.isUserSide ? (ru ? " (сторона пользователя)" : " (foydalanuvchi tomoni)") : ""}.`));
  }
  if (input.result.amounts.length || input.result.dates.length) {
    push(ru ? "СУММЫ И ДАТЫ" : "SUMMALAR VA SANALAR", "heading", true);
    list([
      ...input.result.amounts.map((value) => `${ru ? "Сумма" : "Summa"}: ${value}`),
      ...input.result.dates.map((value) => `${ru ? "Дата" : "Sana"}: ${value}`),
    ]);
  }
  if (input.result.obligations.length) {
    push(ru ? "ОБЯЗАТЕЛЬСТВА" : "MAJBURIYATLAR", "heading", true);
    list(input.result.obligations.map((item) => `${item.party}: ${item.obligation}${item.clause ? ` · ${item.clause}` : ""}${item.deadline ? ` · ${item.deadline}` : ""}`));
  }
  if (input.result.deadlines.length) {
    push(ru ? "СРОКИ" : "MUDDATLAR", "heading", true);
    list(input.result.deadlines.map((item) => `${item.title}: ${item.value}${item.clause ? ` · ${item.clause}` : ""}${item.consequence ? ` · ${item.consequence}` : ""}`));
  }

  push(ru ? "РИСКИ" : "XAVFLAR", "heading", true);
  if (!input.result.risks.length) push(ru ? "Структурированные риски не обнаружены." : "Tuzilgan xavflar aniqlanmadi.");
  for (const risk of input.result.risks) {
    push(`[${risk.severity.toUpperCase()}] ${risk.title}`, "heading", true);
    if (risk.clause || risk.page) push(`${ru ? "Место" : "Joy"}: ${[risk.clause, risk.page ? `${ru ? "стр." : "sah."} ${risk.page}` : null].filter(Boolean).join(" · ")}.`);
    if (risk.exactExcerpt) push(`${ru ? "Фрагмент" : "Parcha"}: ${risk.exactExcerpt}`);
    push(`${ru ? "Проблема" : "Muammo"}: ${risk.problem}`);
    push(`${ru ? "Последствие" : "Oqibat"}: ${risk.consequence}`);
    push(`${ru ? "Рекомендация" : "Tavsiya"}: ${risk.recommendation}`);
    if (risk.proposedWording) push(`${ru ? "Предлагаемая редакция" : "Taklif etilgan tahrir"}: ${risk.proposedWording}`);
  }

  if (input.result.missingClauses.length) {
    push(ru ? "НЕДОСТАЮЩИЕ УСЛОВИЯ" : "YETISHMAYDIGAN SHARTLAR", "heading", true);
    for (const clause of input.result.missingClauses) {
      push(clause.title, "heading", true);
      push(clause.reason);
      if (clause.proposedWording) push(`${ru ? "Предлагаемая редакция" : "Taklif etilgan tahrir"}: ${clause.proposedWording}`);
    }
  }
  if (input.result.contradictions.length) {
    push(ru ? "ПРОТИВОРЕЧИЯ" : "ZIDDIYATLAR", "heading", true);
    list(input.result.contradictions);
  }
  if (input.result.recommendations.length) {
    push(ru ? "РЕКОМЕНДАЦИИ" : "TAVSIYALAR", "heading", true);
    list(input.result.recommendations);
  }
  if (input.result.questions.length) {
    push(ru ? "ВОПРОСЫ ДЛЯ УТОЧНЕНИЯ" : "ANIQLASHTIRISH SAVOLLARI", "heading", true);
    list(input.result.questions);
  }
  if (input.result.extractionWarnings.length) {
    push(ru ? "ПРЕДУПРЕЖДЕНИЯ ИЗВЛЕЧЕНИЯ" : "AJRATIB OLISH OGOHLANTIRISHLARI", "heading", true);
    list(input.result.extractionWarnings);
  }

  push(ru ? "ПРОВЕРЕННЫЕ ИСТОЧНИКИ" : "TEKSHIRILGAN MANBALAR", "heading", true);
  if (!input.result.sources.length) push(ru ? "Проверенные нормативные источники не приложены." : "Tekshirilgan normativ manbalar ilova qilinmagan.");
  for (const source of input.result.sources) {
    push(`${source.actTitle}${source.actIdentifier ? ` (${source.actIdentifier})` : ""}${source.article ? ` · ${source.article}` : ""} · ${source.originalUrl}`, "list");
  }
  push(`${ru ? "Правовая база по состоянию на" : "Huquqiy baza holati"}: ${input.result.legalDatabaseAsOf}.`);

  push(ru ? "ОГРАНИЧЕНИЯ" : "CHEKLOVLAR", "heading", true);
  push(ru
    ? "Отчёт создан автоматизированно и не заменяет индивидуальную юридическую консультацию. Перед значимым решением проверьте выводы и официальные источники."
    : "Hisobot avtomatlashtirilgan tarzda yaratilgan va individual yuridik maslahat o‘rnini bosmaydi. Muhim qarordan oldin xulosalar va rasmiy manbalarni tekshiring.");
  return paragraphs;
}
