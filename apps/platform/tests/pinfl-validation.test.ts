import assert from "node:assert/strict";
import test from "node:test";

import { configuredAnswersSchema, contactInputSchema } from "../lib/document-builder/validation/schema";

test("PINFL accepts only exactly fourteen ASCII digits when supplied", () => {
  assert.equal(configuredAnswersSchema.safeParse({ "party.pinfl": "12345678901234" }).success, true);
  assert.equal(configuredAnswersSchema.safeParse({ "party.pinfl": "1234567890123" }).success, false);
  assert.equal(configuredAnswersSchema.safeParse({ "party.pinfl": "1234567890123a" }).success, false);
  assert.equal(configuredAnswersSchema.safeParse({ "party.pinfl": "1234 5678 9012 34" }).success, false);

  const contact = {
    label: "Тест",
    fullName: "Тестовый пользователь",
    birthDate: "",
    idDocumentType: "",
    idDocumentNumber: "",
    idIssuedBy: "",
    idIssueDate: "",
    registeredAddress: "",
    phone: "",
  };
  assert.equal(contactInputSchema.safeParse({ ...contact, pinfl: "12345678901234" }).success, true);
  assert.equal(contactInputSchema.safeParse({ ...contact, pinfl: "1234567890123x" }).success, false);
});
