import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authForm = readFileSync(
  new URL("../app/_auth/AuthForm.tsx", import.meta.url),
  "utf8",
);

test("authentication errors stay associated with the control that failed", () => {
  assert.match(authForm, /type AuthErrorTarget = "email" \| "otp" \| "mfa" \| "resend";/);
  assert.equal(
    authForm.match(/aria-invalid=\{errorTarget === "(?:email|otp|mfa)"\}/gu)?.length,
    3,
  );
  assert.equal(
    authForm.match(/aria-errormessage=\{errorTarget === "(?:email|otp|mfa)" \? errorMessageId : undefined\}/gu)?.length,
    3,
  );
  assert.match(authForm, /aria-describedby=\{errorTarget === "otp" \? "otp-hint auth-error" : "otp-hint"\}/);
  assert.match(authForm, /aria-describedby=\{errorTarget === "mfa" \? "mfa-hint auth-error" : "mfa-hint"\}/);
  assert.match(authForm, /sendCode\("resend"\)/);
  assert.match(authForm, /aria-describedby=\{errorTarget === "resend" \? errorMessageId : undefined\}/);
  assert.match(authForm, /id="auth-error" className="auth-error" role="alert" aria-atomic="true"/);
});

test("terminal OTP and MFA challenge failures move the error association to email", () => {
  assert.match(authForm, /showError\(value, returnedToDetails \? "email" : "otp"\)/);
  assert.match(authForm, /showError\(message, "email"\)/);
  assert.match(authForm, /showError\(value, "mfa"\)/);
});
