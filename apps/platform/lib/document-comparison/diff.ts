import { diffArrays } from "diff";
import {
  type ComparisonChange,
  type ComparisonLocale,
  type ComparisonResult,
  type ComparisonSummary,
  type ExtractedDocument,
  type ExtractedSection,
  type RiskLevel,
  type WordDiffPart,
} from "./types";

const AMOUNT_RE = /\d[\d\s.,]*\s*(?:сум|so['‘’ʻʼ]?m|uzs|usd|eur|руб(?:лей)?|доллар(?:ов)?|%)(?=$|[^\p{L}\p{N}_])/giu;
const TERM_RE = /\d+\s*(?:(?:календарн[\p{L}\p{N}_]*|рабоч[\p{L}\p{N}_]*)\s+)?(?:день|дня|дней|месяц[\p{L}\p{N}_]*|лет|год[\p{L}\p{N}_]*|kun|oy|yil)(?=$|[^\p{L}\p{N}_])/giu;
const DATE_RE = /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/gu;

function tokenSet(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

function similarity(left: string, right: string): number {
  if (left === right) return 1;
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function compact(values: RegExpMatchArray | null): string[] {
  return values ? Array.from(new Set(Array.from(values, (value) => value.replace(/\s+/g, " ").trim()))) : [];
}

function describeChange(before: string, after: string, locale: ComparisonLocale): {
  summary: string;
  legalEffect: string;
  recommendation: string;
  riskLevel: RiskLevel;
  confidencePercent: number;
} {
  const beforeAmounts = compact(before.match(AMOUNT_RE));
  const afterAmounts = compact(after.match(AMOUNT_RE));
  const beforeTerms = compact(before.match(TERM_RE));
  const afterTerms = compact(after.match(TERM_RE));
  const beforeDates = compact(before.match(DATE_RE));
  const afterDates = compact(after.match(DATE_RE));
  const ru = locale === "ru";

  if (beforeAmounts.join("|") !== afterAmounts.join("|") && (beforeAmounts.length || afterAmounts.length)) {
    return {
      summary: ru
        ? `Изменено денежное значение: ${beforeAmounts.join(", ") || "не указано"} → ${afterAmounts.join(", ") || "не указано"}.`
        : `Pul qiymati o‘zgartirilgan: ${beforeAmounts.join(", ") || "ko‘rsatilmagan"} → ${afterAmounts.join(", ") || "ko‘rsatilmagan"}.`,
      legalEffect: ru ? "Изменение суммы или процента может повлиять на объём обязательства." : "Summa yoki foizning o‘zgarishi majburiyat hajmiga ta’sir qilishi mumkin.",
      recommendation: ru ? "Проверьте расчёт, валюту, налоги и порядок оплаты." : "Hisob-kitob, valyuta, soliqlar va to‘lov tartibini tekshiring.",
      riskLevel: "high",
      confidencePercent: 94,
    };
  }
  if (beforeTerms.join("|") !== afterTerms.join("|") && (beforeTerms.length || afterTerms.length)) {
    return {
      summary: ru
        ? `Изменён срок: ${beforeTerms.join(", ") || "не указан"} → ${afterTerms.join(", ") || "не указан"}.`
        : `Muddat o‘zgartirilgan: ${beforeTerms.join(", ") || "ko‘rsatilmagan"} → ${afterTerms.join(", ") || "ko‘rsatilmagan"}.`,
      legalEffect: ru ? "Изменение срока может сократить время на исполнение, уведомление или защиту права." : "Muddat o‘zgarishi bajarish, xabardor qilish yoki huquqni himoya qilish vaqtini qisqartirishi mumkin.",
      recommendation: ru ? "Сопоставьте новый срок с обязанностями обеих сторон и календарём исполнения." : "Yangi muddatni tomonlarning majburiyatlari va bajarish taqvimi bilan solishtiring.",
      riskLevel: "high",
      confidencePercent: 92,
    };
  }
  if (beforeDates.join("|") !== afterDates.join("|") && (beforeDates.length || afterDates.length)) {
    return {
      summary: ru ? "Изменена календарная дата." : "Kalendar sanasi o‘zgartirilgan.",
      legalEffect: ru ? "Дата может влиять на начало, окончание или просрочку обязательства." : "Sana majburiyatning boshlanishi, tugashi yoki kechikishiga ta’sir qilishi mumkin.",
      recommendation: ru ? "Проверьте связанные сроки и переходные условия." : "Bog‘liq muddatlar va o‘tish shartlarini tekshiring.",
      riskLevel: "medium",
      confidencePercent: 90,
    };
  }
  return {
    summary: ru ? "Текст условия изменён." : "Shart matni o‘zgartirilgan.",
    legalEffect: ru ? "Юридическое значение требует проверки в контексте всего документа." : "Yuridik ahamiyat butun hujjat kontekstida tekshirilishi kerak.",
    recommendation: ru ? "Сопоставьте изменение с предметом, ответственностью и правами сторон." : "O‘zgarishni predmet, javobgarlik va tomonlar huquqlari bilan solishtiring.",
    riskLevel: "medium",
    confidencePercent: 68,
  };
}

function wordDiff(before: string | null, after: string | null): WordDiffPart[] {
  if (before === null) return after ? [{ value: after, kind: "added" }] : [];
  if (after === null) return [{ value: before, kind: "removed" }];
  const tokenize = (value: string) => value.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
  return diffArrays(tokenize(before), tokenize(after))
    .map((part) => ({
      value: part.value.join(""),
      kind: part.added ? "added" as const : part.removed ? "removed" as const : "same" as const,
    }))
    .filter((part) => part.value.length > 0);
}

function baseChange(
  before: ExtractedSection | null,
  after: ExtractedSection | null,
  ordinal: number,
  locale: ComparisonLocale,
): ComparisonChange {
  const id = `change-${ordinal}`;
  const ru = locale === "ru";
  if (!before && after) {
    return {
      id, ordinal, changeType: "added", beforeSectionId: null, afterSectionId: after.id,
      beforeLabel: null, afterLabel: after.label, beforeHeading: null, afterHeading: after.heading,
      beforeText: null, afterText: after.text, wordDiff: wordDiff(null, after.text),
      summary: ru ? "Добавлено новое условие." : "Yangi shart qo‘shilgan.",
      legalEffect: ru ? "Последствия нового условия требуют проверки." : "Yangi shart oqibatlari tekshirilishi kerak.",
      affectedParty: ru ? "Не определено" : "Aniqlanmagan", riskEffect: "requires_review",
      riskLevel: "medium", recommendation: ru ? "Проверьте новое условие в контексте прав и обязанностей сторон." : "Yangi shartni tomonlarning huquq va majburiyatlari kontekstida tekshiring.",
      sourceIds: [], confidencePercent: 96, reviewedAt: null, extractionWarning: false,
    };
  }
  if (before && !after) {
    return {
      id, ordinal, changeType: "removed", beforeSectionId: before.id, afterSectionId: null,
      beforeLabel: before.label, afterLabel: null, beforeHeading: before.heading, afterHeading: null,
      beforeText: before.text, afterText: null, wordDiff: wordDiff(before.text, null),
      summary: ru ? "Условие удалено." : "Shart olib tashlangan.",
      legalEffect: ru ? "Удаление может прекратить право, обязанность или защитный механизм." : "Olib tashlash huquq, majburiyat yoki himoya mexanizmini bekor qilishi mumkin.",
      affectedParty: ru ? "Не определено" : "Aniqlanmagan", riskEffect: "requires_review",
      riskLevel: "high", recommendation: ru ? "Убедитесь, что удалённое условие не было существенной защитой." : "Olib tashlangan shart muhim himoya bo‘lmaganini tekshiring.",
      sourceIds: [], confidencePercent: 96, reviewedAt: null, extractionWarning: false,
    };
  }
  if (!before || !after) throw new Error("INVALID_CHANGE_PAIR");

  const sameSemantic = before.semanticText === after.semanticText;
  const sameNormalized = before.normalizedText === after.normalizedText;
  const labelChanged = before.label !== after.label;
  const moved = Math.abs(before.index - after.index) > 1;
  if (sameSemantic && labelChanged) {
    return {
      id, ordinal, changeType: "renumbered", beforeSectionId: before.id, afterSectionId: after.id,
      beforeLabel: before.label, afterLabel: after.label, beforeHeading: before.heading, afterHeading: after.heading,
      beforeText: before.text, afterText: after.text, wordDiff: wordDiff(before.text, after.text),
      summary: ru ? `Пункт перенумерован: ${before.label ?? "—"} → ${after.label ?? "—"}.` : `Band qayta raqamlangan: ${before.label ?? "—"} → ${after.label ?? "—"}.`,
      legalEffect: ru ? "Смысл текста не изменился." : "Matn mazmuni o‘zgarmagan.",
      affectedParty: ru ? "Не влияет" : "Ta’sir qilmaydi", riskEffect: "neutral", riskLevel: "information",
      recommendation: ru ? "Проверьте внутренние ссылки на номер пункта." : "Band raqamiga ichki havolalarni tekshiring.",
      sourceIds: [], confidencePercent: 98, reviewedAt: null, extractionWarning: false,
    };
  }
  if (sameNormalized && moved) {
    return {
      id, ordinal, changeType: "moved", beforeSectionId: before.id, afterSectionId: after.id,
      beforeLabel: before.label, afterLabel: after.label, beforeHeading: before.heading, afterHeading: after.heading,
      beforeText: before.text, afterText: after.text, wordDiff: wordDiff(before.text, after.text),
      summary: ru ? "Пункт перемещён без изменения текста." : "Band matni o‘zgarmasdan ko‘chirilgan.",
      legalEffect: ru ? "Прямого изменения смысла не обнаружено; проверьте контекст нового раздела." : "Bevosita ma’no o‘zgarishi topilmadi; yangi bo‘lim kontekstini tekshiring.",
      affectedParty: ru ? "Не определено" : "Aniqlanmagan", riskEffect: "neutral", riskLevel: "information",
      recommendation: ru ? "Проверьте связи пункта с соседними условиями." : "Bandning qo‘shni shartlar bilan aloqasini tekshiring.",
      sourceIds: [], confidencePercent: 95, reviewedAt: null, extractionWarning: false,
    };
  }
  if (sameSemantic && !sameNormalized) {
    return {
      id, ordinal, changeType: "formatting", beforeSectionId: before.id, afterSectionId: after.id,
      beforeLabel: before.label, afterLabel: after.label, beforeHeading: before.heading, afterHeading: after.heading,
      beforeText: before.text, afterText: after.text, wordDiff: wordDiff(before.text, after.text),
      summary: ru ? "Изменено форматирование без обнаруженного изменения смысла." : "Aniqlangan ma’no o‘zgarishisiz format o‘zgartirilgan.",
      legalEffect: ru ? "Юридически значимое изменение не обнаружено." : "Yuridik ahamiyatli o‘zgarish topilmadi.",
      affectedParty: ru ? "Не влияет" : "Ta’sir qilmaydi", riskEffect: "neutral", riskLevel: "information",
      recommendation: ru ? "Дополнительное действие не требуется." : "Qo‘shimcha harakat talab qilinmaydi.",
      sourceIds: [], confidencePercent: 94, reviewedAt: null, extractionWarning: false,
    };
  }
  if (sameNormalized) {
    return {
      id, ordinal, changeType: "unchanged", beforeSectionId: before.id, afterSectionId: after.id,
      beforeLabel: before.label, afterLabel: after.label, beforeHeading: before.heading, afterHeading: after.heading,
      beforeText: before.text, afterText: after.text, wordDiff: [{ value: after.text, kind: "same" }],
      summary: ru ? "Без изменений." : "O‘zgarishsiz.",
      legalEffect: ru ? "Изменений не обнаружено." : "O‘zgarish topilmadi.",
      affectedParty: ru ? "Не влияет" : "Ta’sir qilmaydi", riskEffect: "neutral", riskLevel: "information",
      recommendation: ru ? "Действие не требуется." : "Harakat talab qilinmaydi.",
      sourceIds: [], confidencePercent: 100, reviewedAt: null, extractionWarning: false,
    };
  }
  const description = describeChange(before.text, after.text, locale);
  return {
    id, ordinal, changeType: "changed", beforeSectionId: before.id, afterSectionId: after.id,
    beforeLabel: before.label, afterLabel: after.label, beforeHeading: before.heading, afterHeading: after.heading,
    beforeText: before.text, afterText: after.text, wordDiff: wordDiff(before.text, after.text),
    summary: description.summary, legalEffect: description.legalEffect,
    affectedParty: ru ? "Не определено" : "Aniqlanmagan", riskEffect: "requires_review",
    riskLevel: description.riskLevel, recommendation: description.recommendation,
    sourceIds: [], confidencePercent: description.confidencePercent, reviewedAt: null, extractionWarning: false,
  };
}

function findMatches(before: ExtractedSection[], after: ExtractedSection[]): Map<number, number> {
  const matches = new Map<number, number>();
  const usedAfter = new Set<number>();

  for (const left of before) {
    if (!left.label) continue;
    const exact = after.find((right) => !usedAfter.has(right.index) && right.label === left.label);
    if (exact) {
      matches.set(left.index, exact.index);
      usedAfter.add(exact.index);
    }
  }
  for (const left of before) {
    if (matches.has(left.index)) continue;
    const exactText = after.find((right) => !usedAfter.has(right.index) && right.semanticText && right.semanticText === left.semanticText);
    if (exactText) {
      matches.set(left.index, exactText.index);
      usedAfter.add(exactText.index);
    }
  }
  for (const left of before) {
    if (matches.has(left.index)) continue;
    let best: { index: number; score: number } | null = null;
    for (const right of after) {
      if (usedAfter.has(right.index)) continue;
      const score = similarity(left.semanticText, right.semanticText);
      const positionPenalty = Math.min(Math.abs(left.index - right.index) / Math.max(before.length, after.length, 1), 0.2);
      const adjusted = score - positionPenalty;
      if (adjusted >= 0.46 && (!best || adjusted > best.score)) best = { index: right.index, score: adjusted };
    }
    if (best) {
      matches.set(left.index, best.index);
      usedAfter.add(best.index);
    }
  }
  return matches;
}

export function summarizeChanges(changes: ComparisonChange[], similarityPercent: number, generatedAt: string): ComparisonSummary {
  const count = (type: ComparisonChange["changeType"]) => changes.filter((change) => change.changeType === type).length;
  const material = changes.filter((change) => change.riskLevel === "high" || change.riskLevel === "medium").length;
  const maxRisk: RiskLevel = changes.some((change) => change.riskLevel === "high")
    ? "high"
    : changes.some((change) => change.riskLevel === "medium")
      ? "medium"
      : changes.some((change) => change.riskLevel === "low")
        ? "low"
        : "information";
  return {
    totalChanges: changes.filter((change) => change.changeType !== "unchanged").length,
    materialChanges: material,
    riskIncreased: changes.filter((change) => change.riskEffect === "increased").length,
    riskDecreased: changes.filter((change) => change.riskEffect === "decreased").length,
    added: count("added"), removed: count("removed"), changed: count("changed"), moved: count("moved"),
    renumbered: count("renumbered"), formatting: count("formatting"), unchanged: count("unchanged"),
    changedSections: Array.from(new Set(changes
      .filter((change) => !["unchanged", "formatting"].includes(change.changeType))
      .map((change) => change.afterHeading || change.beforeHeading)
      .filter((value): value is string => Boolean(value)))).slice(0, 30),
    similarityPercent,
    likelyDifferentDocuments: similarityPercent < 35,
    overallRisk: maxRisk,
    aiStatus: "unavailable",
    sourceStatus: "unverified",
    model: null,
    generatedAt,
  };
}

export function compareDocuments(
  versionOne: ExtractedDocument,
  versionTwo: ExtractedDocument,
  locale: ComparisonLocale,
  generatedAt = new Date().toISOString(),
): ComparisonResult {
  const matches = findMatches(versionOne.sections, versionTwo.sections);
  const usedAfter = new Set(matches.values());
  const pairs: Array<{ before: ExtractedSection | null; after: ExtractedSection | null; order: number }> = [];
  for (const left of versionOne.sections) {
    const rightIndex = matches.get(left.index);
    pairs.push({ before: left, after: rightIndex === undefined ? null : versionTwo.sections[rightIndex], order: rightIndex ?? left.index });
  }
  for (const right of versionTwo.sections) {
    if (!usedAfter.has(right.index)) pairs.push({ before: null, after: right, order: right.index });
  }
  pairs.sort((a, b) => a.order - b.order);
  const changes = pairs.map((pair, index) => baseChange(pair.before, pair.after, index + 1, locale));
  const matchedWeight = changes.reduce((total, change) => {
    if (change.changeType === "unchanged" || change.changeType === "renumbered" || change.changeType === "moved" || change.changeType === "formatting") return total + 1;
    if (change.beforeText && change.afterText) return total + similarity(change.beforeText, change.afterText);
    return total;
  }, 0);
  const similarityPercent = Math.round((matchedWeight / Math.max(versionOne.sections.length, versionTwo.sections.length, 1)) * 100);
  return { versionOne, versionTwo, changes, summary: summarizeChanges(changes, similarityPercent, generatedAt) };
}
