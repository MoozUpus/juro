import assert from "node:assert/strict";
import test from "node:test";
import { BULK_YURXIZMAT_CANDIDATES, DOCUMENT_CATEGORIES, DOCUMENT_REGISTRY, getDocumentByCode, getDocumentsByCategory, validateDocumentRegistry } from "../lib/document-builder/registry";
import { calculateQuestionnaireProgress, createQuestionnaireAnswers, renderConfiguredDocument, setAnswer, validateQuestionnaire } from "../lib/document-builder/registry/engine";
import { YURXIZMAT_PUBLIC_CATALOG } from "../lib/document-builder/registry/yurxizmat-public-catalog";

test("registry preserves existing entries and registers the complete public YurXizmat catalog", () => {
  assert.equal(YURXIZMAT_PUBLIC_CATALOG.length, 478);
  assert.equal(BULK_YURXIZMAT_CANDIDATES.length, 462);
  assert.equal(DOCUMENT_REGISTRY.length, 623);
  const result = validateDocumentRegistry();
  assert.equal(result.valid, true);
  assert.deepEqual(result.duplicateCodes, []);
  assert.deepEqual(result.duplicateRoutes, []);
  assert.deepEqual(result.invalidCodes, []);
  assert.deepEqual(result.missingRuTitles, []);
  assert.equal(new Set(DOCUMENT_REGISTRY.map((document) => document.code)).size, 623);
  assert.ok(DOCUMENT_REGISTRY.every((document) => /^\d{7}$/.test(document.code)));
});

test("every registry entry belongs to a category and every category has a route", () => {
  for (const category of DOCUMENT_CATEGORIES) {
    const documents = getDocumentsByCategory(category.slug);
    assert.ok(documents.length > 0, `category ${category.slug} should not be empty`);
    assert.ok(documents.every((document) => document.categorySlug === category.slug));
  }
});

test("all registered documents are available as editable projects while review status remains visible", () => {
  const published = DOCUMENT_REGISTRY.filter((document) => document.status === "published");
  assert.equal(published.length, 623);
  assert.equal(DOCUMENT_REGISTRY.filter((document) => document.status === "review").length, 0);
  const verified = published.filter((document) => document.editorialStatus === "Published");
  assert.deepEqual(verified.map((document) => document.code).sort(), ["0101001", "0201001", "0601001", "0602001"]);
  assert.equal(published.filter((document) => document.editorialStatus === "Translation Review").length, 172);
  assert.ok(DOCUMENT_REGISTRY.filter((document) => document.editorialStatus === "Legal Review").length >= 4);
  assert.ok(published.every((document) => document.titleRu && document.titleUz));
  assert.ok(published.every((document) => document.questionnaire.length >= 4));
  assert.ok(published.every((document) => document.generationSchema.paragraphs.length >= 8));
  assert.ok(published.every((document) => !document.titleUz.startsWith("Yuridik hujjat loyihasi №")), "every Uzbek title must have an explicit translation");
  assert.ok(DOCUMENT_REGISTRY.every((document) => document.titleRu.trim() && document.titleUz.trim()));
  assert.ok(BULK_YURXIZMAT_CANDIDATES.every((document) => document.sourceReferences?.some((source) => source.source === "yurxizmat" && source.url)));
});

test("every configured registry entry renders RU and UZ projects without unresolved variables", () => {
  for (const definition of DOCUMENT_REGISTRY) {
    let answers = createQuestionnaireAnswers(definition);
    for (const step of definition.questionnaire) {
      for (const field of step.fields) {
        if (field.type === "checkbox") answers = setAnswer(answers, field.id, true);
        else if (field.type === "repeatable-group" || field.type === "table" || field.type === "witnesses") {
          const row = Object.fromEntries((field.fields ?? []).map((child) => [child.id, child.type === "date" ? "2026-07-24" : child.options?.[0]?.value ?? "Test"]));
          answers = setAnswer(answers, field.id, [row]);
        } else if (field.type === "date") answers = setAnswer(answers, field.id, "2026-07-24");
        else if (field.type === "money" || field.type === "number" || field.type === "percent") answers = setAnswer(answers, field.id, 1000);
        else answers = setAnswer(answers, field.id, field.options?.[0]?.value ?? "Test");
      }
    }
    for (const language of ["ru", "uz"] as const) {
      const rendered = renderConfiguredDocument(definition, answers, language);
      assert.ok(rendered.paragraphs.length >= 8, `${definition.code} ${language}`);
      assert.doesNotMatch(rendered.plainText, /\{\{/, `${definition.code} ${language}`);
      assert.ok(rendered.title.trim(), `${definition.code} ${language}`);
    }
  }
});

test("every template declares collaboration policy and receipt keeps its specialized route", () => {
  assert.ok(DOCUMENT_REGISTRY.every((document) => document.collaboration.enabled));
  assert.ok(DOCUMENT_REGISTRY.every((document) => (document.collaboration.maximumParties ?? 1) >= document.collaboration.minimumParties));
  const receipt = getDocumentByCode("0602001");
  assert.ok(receipt);
  assert.equal(receipt.specialBuilder, "receipt");
  assert.equal(receipt.collaboration.minimumParties, 2);
  assert.equal(receipt.collaboration.maximumParties, 3);
});

test("divorce questionnaire preserves answers across RU and UZ rendering", () => {
  const definition = getDocumentByCode("0101001");
  assert.ok(definition);
  let answers = createQuestionnaireAnswers(definition);
  answers = setAnswer(answers, "court.name", "Ташкентский межрайонный суд по гражданским делам");
  answers = setAnswer(answers, "claimant.fullName", "Каримова Дилноза Азизовна");
  answers = setAnswer(answers, "claimant.address", "г. Ташкент");
  answers = setAnswer(answers, "respondent.fullName", "Каримов Азиз Акмалович");
  answers = setAnswer(answers, "respondent.address", "г. Ташкент");
  answers = setAnswer(answers, "marriage.registrationDate", "2020-02-12");
  answers = setAnswer(answers, "marriage.registryOffice", "Отдел ЗАГС Мирзо-Улугбекского района");
  answers = setAnswer(answers, "marriage.reason", "Совместная жизнь не сложилась");
  answers = setAnswer(answers, "marriage.reconciliationPossible", "no");
  answers = setAnswer(answers, "marriage.respondentAgrees", "yes");
  answers = setAnswer(answers, "children.hasJointMinorChildren", "no");
  answers = setAnswer(answers, "claim.propertyDispute", "no");
  answers = setAnswer(answers, "claim.attachments", "Копия свидетельства о браке");
  answers = setAnswer(answers, "confirmation.accepted", true);
  const ru = renderConfiguredDocument(definition, answers, "ru");
  const uz = renderConfiguredDocument(definition, answers, "uz");
  assert.match(ru.plainText, /ИСКОВОЕ ЗАЯВЛЕНИЕ/);
  assert.match(uz.plainText, /DA’VO ARIZASI/);
  assert.match(ru.plainText, /Каримова Дилноза/);
  assert.match(uz.plainText, /Каримова Дилноза/);
  assert.doesNotMatch(ru.plainText, /\{\{/);
  assert.doesNotMatch(uz.plainText, /\{\{/);
});

test("conditional child section and required validation respond to answers", () => {
  const definition = getDocumentByCode("0101001");
  assert.ok(definition);
  let answers = createQuestionnaireAnswers(definition);
  const initialErrors = validateQuestionnaire(definition, answers);
  assert.ok(initialErrors["court.name"]);
  answers = setAnswer(answers, "children.hasJointMinorChildren", "yes");
  const withChildrenErrors = validateQuestionnaire(definition, answers);
  assert.ok(withChildrenErrors["children.items"]);
  answers = setAnswer(answers, "children.items", [{ fullName: "Каримов Али Азизович", birthDate: "2021-01-10", residesWith: "claimant" }]);
  const rendered = renderConfiguredDocument(definition, answers, "ru");
  assert.match(rendered.plainText, /Каримов Али Азизович/);
});

test("salary and loan pilots calculate progress and render without placeholders", () => {
  for (const code of ["0201001", "0601001"]) {
    const definition = getDocumentByCode(code);
    assert.ok(definition);
    let answers = createQuestionnaireAnswers(definition);
    assert.equal(calculateQuestionnaireProgress(definition, answers), 0);
    for (const step of definition.questionnaire) {
      for (const field of step.fields) {
        if (!field.required) continue;
        if (field.type === "checkbox") answers = setAnswer(answers, field.id, true);
        else if (field.type === "repeatable-group") answers = setAnswer(answers, field.id, [{ fullName: "Test" }]);
        else answers = setAnswer(answers, field.id, field.options?.[0]?.value ?? "Test");
      }
    }
    assert.ok(calculateQuestionnaireProgress(definition, answers) > 80);
    for (const language of ["ru", "uz"] as const) {
      const rendered = renderConfiguredDocument(definition, answers, language);
      assert.ok(rendered.paragraphs.length >= 8);
      assert.doesNotMatch(rendered.plainText, /\{\{/);
    }
  }
});
