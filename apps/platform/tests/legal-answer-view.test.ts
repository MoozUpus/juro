import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  LegalAnswerView,
  type LegalAnswerViewResult,
} from "../app/_platform/LegalAnswerView";

function result(overrides: Partial<LegalAnswerViewResult> = {}): LegalAnswerViewResult {
  return {
    responseKind: "answer",
    summary: "Работодатель, как правило, не может прекратить договор в период отпуска.",
    answer: "Работодатель, как правило, не может прекратить договор в период отпуска.",
    clarificationQuestions: [],
    confirmedFindings: [{
      title: "Запрет в период отпуска",
      explanation: "Увольнение по инициативе работодателя запрещено.\n\n- Проверьте основание увольнения.\n- Зафиксируйте даты отпуска.",
      sourceIds: ["labor-code-163"],
    }],
    assumptions: [{ statement: "Инициатива работодателя", impact: "Правило отличается для соглашения сторон." }],
    risks: [{ level: "high", title: "Срок обжалования", explanation: "Не откладывайте проверку срока.", sourceIds: ["labor-code-163"] }],
    sources: [{
      sourceId: "labor-code-163",
      actTitle: "Трудовой кодекс Республики Узбекистан",
      actIdentifier: null,
      article: "163",
      originalUrl: "https://lex.uz/ru/docs/6257288",
      status: "current",
      effectiveDate: null,
      verifiedAt: "2026-08-29T00:00:00.000Z",
      sourceClass: "OFFICIAL_LEGISLATION",
      sourceOrigin: "indexed",
    }],
    requiredDocuments: [{ name: "Приказ об увольнении", reason: "Нужен для проверки основания.", required: true }],
    actionPlan: [{ title: "Получите документы", description: "Запросите заверенную копию приказа.", sourceIds: ["labor-code-163"] }],
    deadlines: [{ title: "Срок обращения", dueDate: null, calculationMethod: "Считается со дня вручения приказа.", confidence: "confirmed", sourceIds: ["labor-code-163"] }],
    urgency: "high",
    suggestedDocument: null,
    legalDatabaseAsOf: "2026-08-29",
    evidenceMode: "official",
    referenceNotes: [{ title: "Практический комментарий", note: "Материал помогает понять контекст.", sourceIds: ["commentary"] }],
    ...overrides,
  };
}

test("Russian Legal Answer uses the product-owned structure and delegates section Markdown", () => {
  const value = result({
    sources: [
      ...result().sources,
      {
        sourceId: "commentary",
        actTitle: "Практический комментарий",
        actIdentifier: null,
        article: null,
        originalUrl: "https://example.org/commentary",
        status: "unconfirmed",
        effectiveDate: null,
        verifiedAt: "2026-08-29T00:00:00.000Z",
        sourceClass: "SECONDARY_REFERENCE",
        sourceOrigin: "web",
      },
    ],
  });
  const html = renderToStaticMarkup(createElement(LegalAnswerView, { result: value, locale: "ru" }));

  const main = html.indexOf(">Главное<");
  const law = html.indexOf(">Что говорит закон<");
  const next = html.indexOf(">Что делать дальше<");
  assert.ok(main >= 0 && law > main && next > law);
  assert.match(html, /Проверьте основание увольнения/u);
  assert.match(html, /ст\. 163 · Трудовой кодекс РУз/u);
  assert.match(html, />Важно учесть</u);
  assert.match(html, />Сроки</u);
  assert.match(html, />Что подготовить</u);
  assert.match(html, />Дополнительные материалы</u);
  assert.doesNotMatch(html, /Подтверждённое правовое основание/u);
});

test("Uzbek Legal Answer uses the approved localized section labels", () => {
  const html = renderToStaticMarkup(createElement(LegalAnswerView, {
    result: result({ assumptions: [], risks: [], deadlines: [], requiredDocuments: [], referenceNotes: [], urgency: "normal" }),
    locale: "uz",
  }));

  assert.match(html, />Asosiysi</u);
  assert.match(html, />Qonunda nima deyilgan</u);
  assert.match(html, />Keyingi qadamlar</u);
  assert.doesNotMatch(html, />Muhim jihatlar</u);
});

test("unsupported conclusions render an Insufficient-Evidence Result instead of empty legal sections", () => {
  const html = renderToStaticMarkup(createElement(LegalAnswerView, {
    result: result({
      responseKind: "clarification_required",
      summary: "Для ответа недостаточно подтверждённых источников.",
      answer: "JURO не сформировал правовой вывод.",
      confirmedFindings: [],
      assumptions: [],
      risks: [],
      sources: [],
      requiredDocuments: [],
      actionPlan: [],
      deadlines: [],
      urgency: "normal",
      evidenceMode: "none",
      referenceNotes: [],
      clarificationQuestions: ["Когда произошло событие?"],
    }),
    locale: "ru",
  }));

  assert.match(html, />Пока нельзя подтвердить ответ</u);
  assert.match(html, />Что удалось проверить</u);
  assert.match(html, />Что нужно уточнить</u);
  assert.doesNotMatch(html, />Что говорит закон</u);
  assert.doesNotMatch(html, />Что делать дальше</u);
});

test("authenticated and guest chat use the same Legal Answer presentation contract", async () => {
  const [authenticated, guest] = await Promise.all([
    readFile(new URL("../app/_platform/AiLawyerClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_guest/GuestAiClient.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(authenticated, /<LegalAnswerView[\s\S]*?result=\{result\}[\s\S]*?locale=\{ru \? "ru" : "uz"\}/u);
  assert.match(guest, /<LegalAnswerView result=\{result\} locale=\{locale\}/u);
  assert.doesNotMatch(authenticated, /function uniqueAnswerDetail/u);
  assert.doesNotMatch(guest, /function paragraphs/u);
});
