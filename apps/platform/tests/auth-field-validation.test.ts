import assert from "node:assert/strict";
import test from "node:test";
import {
  consentFieldError,
  emailFieldError,
  firstNameFieldError,
} from "../app/_auth/auth-field-validation";

test("auth field validation accepts usable localized-form values", () => {
  assert.equal(emailFieldError(" person@example.com "), null);
  assert.equal(emailFieldError(""), "email_required");
  assert.equal(emailFieldError("person@example"), "email_invalid");
  assert.equal(emailFieldError(`${"a".repeat(245)}@example.com`), "email_invalid");

  assert.equal(firstNameFieldError("  Dilnoza  "), null);
  assert.equal(firstNameFieldError("   "), "first_name_required");
  assert.equal(consentFieldError(true), null);
  assert.equal(consentFieldError(false), "consent_required");
});
