import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLegalIntent,
  planLegalResearch,
  redactLegalQuerySensitiveData,
  rewriteLegalFollowUp,
} from "../lib/ai/legal-query-planner";

test("intent routing skips Lex and charging for conversation", () => {
  assert.deepEqual(classifyLegalIntent("Здравствуйте!"), {
    intent: "conversation",
    confidence: "high",
    shouldRetrieveLex: false,
    chargeableOnSuccess: false,
  });
  assert.equal(classifyLegalIntent("Как открыть ООО?").intent, "legal_question");
  assert.equal(classifyLegalIntent("Как открыть ООО?").shouldRetrieveLex, true);
  assert.equal(classifyLegalIntent("Подготовь договор аренды").intent, "document");
  assert.equal(classifyLegalIntent("Рассчитай госпошлину").intent, "calculation");
});

test("follow-up rewrite uses at most recent relevant subject and redacts sensitive data", () => {
  const rewritten = rewriteLegalFollowUp({
    question: "А какие документы нужны? PINFL 12345678901234",
    locale: "ru",
    conversationHistory: [
      { user: "Здравствуйте", assistant: "Здравствуйте!" },
      { user: "Как открыть ООО в Узбекистане?", assistant: "Проверю нормы." },
    ],
  });
  assert.equal(rewritten.rewritten, true);
  assert.match(rewritten.query, /открыть ООО/iu);
  assert.match(rewritten.query, /\[REDACTED\]/u);
  assert.doesNotMatch(rewritten.query, /12345678901234/u);
});

test("follow-up rewrite can recover an older subject from compact conversation context", () => {
  const rewritten = rewriteLegalFollowUp({
    question: "А какие документы нужны?",
    locale: "ru",
    conversationHistory: [],
    conversationSummary: {
      includedTurns: 1,
      omittedTurns: 3,
      turns: [{
        user: "Как зарегистрировать ООО в Узбекистане?",
        assistant: "Проверен общий порядок регистрации.",
        openQuestions: [],
      }],
    },
  });

  assert.equal(rewritten.rewritten, true);
  assert.match(rewritten.query, /зарегистрировать ООО/iu);
});

test("planner expands LLC aliases and prefers direct lookup for an article", () => {
  const ru = planLegalResearch({ question: "Как открыть ООО?", locale: "ru" });
  assert.equal(ru.domain, "business");
  assert.equal(ru.primaryQuery, "общество с ограниченной ответственностью");
  assert.equal(ru.expandedQueries.length <= 2, true);
  assert.equal(ru.needsActionPlan, true);

  const uz = planLegalResearch({ question: "MChJni qanday ochish kerak?", locale: "uz" });
  assert.equal(uz.primaryQuery, "mas'uliyati cheklangan jamiyat");
  assert.equal(uz.needsActionPlan, true);

  const uzFirstPerson = planLegalResearch({ question: "O‘zbekistonda MChJni qanday ochaman?", locale: "uz" });
  assert.equal(uzFirstPerson.needsActionPlan, true);

  const uzArticle = planLegalResearch({
    question: "12-modda MChJ ta’sis hujjatlari haqida nima deydi?",
    locale: "uz",
  });
  assert.equal(uzArticle.articleNumber, "12");
  assert.equal(uzArticle.directLookupPreferred, true);

  const article = planLegalResearch({
    question: "Что устанавливает статья 12 Трудового кодекса?",
    locale: "ru",
  });
  assert.equal(article.articleNumber, "12");
  assert.match(article.actName ?? "", /Трудового кодекса/iu);
  assert.equal(article.directLookupPreferred, true);
});

test("explicit LLC founding agreements remain in the business domain", () => {
  const plan = planLegalResearch({
    question: "Что указывается в учредительном договоре ООО?",
    locale: "ru",
  });
  assert.equal(plan.domain, "business");
  assert.equal(plan.primaryQuery, "общество с ограниченной ответственностью");
});

test("Uzbek jamiyat ustavi wording resolves to the dedicated LLC act", () => {
  const plan = planLegalResearch({
    question: "Jamiyat ustavi uchinchi shaxslar uchun qachon kuchga kiradi?",
    locale: "uz",
  });
  assert.equal(plan.domain, "business");
  assert.equal(plan.primaryQuery, "mas'uliyati cheklangan jamiyat");
});

test("redaction removes passport, phone, card and email identifiers", () => {
  const redacted = redactLegalQuerySensitiveData(
    "AA1234567 +998 90 123 45 67 8600 1234 5678 9012 user@example.com",
  );
  assert.doesNotMatch(redacted, /AA1234567|998 90|8600 1234|user@example\.com/u);
  assert.match(redacted, /\[REDACTED\]/u);
});
