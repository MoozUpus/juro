import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizeAuthReturnPath } from "../lib/platform/auth-locale";

test("auth locale switch rewrites the protected destination locale", () => {
  assert.equal(
    localizeAuthReturnPath("/ru/individual/dashboard", "uz"),
    "/uz/individual/dashboard",
  );
  assert.equal(
    localizeAuthReturnPath("/uz/business/workspace-1/cases?tab=open#case", "ru"),
    "/ru/business/workspace-1/cases?tab=open#case",
  );
});

test("auth locale switch preserves safe non-localized paths and rejects external targets", () => {
  assert.equal(localizeAuthReturnPath("/dashboard?source=auth", "uz"), "/dashboard?source=auth");
  assert.equal(localizeAuthReturnPath("https://evil.example/ru/dashboard", "uz"), null);
  assert.equal(localizeAuthReturnPath("//evil.example/ru/dashboard", "uz"), null);
  assert.equal(localizeAuthReturnPath(undefined, "uz"), null);
});

test("AuthForm localizes both supported return parameter names", () => {
  const source = readFileSync(new URL("../app/_auth/AuthForm.tsx", import.meta.url), "utf8");
  assert.match(source, /for \(const key of \["returnTo", "return_to"\] as const\)/u);
  assert.match(source, /localizeAuthReturnPath\(nextSearchParams\.get\(key\), nextLocale\)/u);
  assert.match(source, /nextSearchParams\.set\(key, localizedReturnTo\)/u);
});
