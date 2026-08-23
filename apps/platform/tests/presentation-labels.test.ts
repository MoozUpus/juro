import assert from "node:assert/strict";
import test from "node:test";
import {
  documentCategoryLabel,
  documentStatusLabel,
  platformStatusLabel,
} from "../lib/platform/presentation-labels";

test("presentation labels keep persisted workflow codes out of client and lawyer UI", () => {
  assert.equal(platformStatusLabel("conflict_check_pending", "ru"), "Требуется проверка конфликта");
  assert.equal(platformStatusLabel("awaiting_user_consent", "uz"), "Mijozning qarori kutilmoqda");
  assert.equal(platformStatusLabel("needs_information", "ru"), "Ожидаются сведения клиента");
  assert.equal(platformStatusLabel("declined", "uz"), "So‘rov rad etilgan");
  assert.equal(platformStatusLabel("service_proposal_proposed", "ru"), "Предложение услуги направлено");
  assert.equal(platformStatusLabel("future_internal_value", "ru"), "Статус обновлён");
  assert.equal(documentStatusLabel("Черновик", "uz"), "Qoralama");
  assert.equal(documentStatusLabel("future_document_state", "ru"), "Статус документа обновлён");
  assert.equal(documentCategoryLabel("contracts", "ru"), "Договоры");
  assert.equal(documentCategoryLabel("Договоры", "uz"), "Shartnomalar");
  assert.equal(documentCategoryLabel("future_category", "ru"), "Документ");
});
