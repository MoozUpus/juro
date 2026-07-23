import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("landing-test route and approved Jurobek asset are present", () => {
  const page = fs.readFileSync("app/landing-test/page.tsx", "utf8");
  const aliasPage = fs.readFileSync("app/lending-test/page.tsx", "utf8");
  const component = fs.readFileSync("app/components/landing-test/LandingTestPage.tsx", "utf8");
  assert.match(page, /LandingTestPage/);
  assert.match(aliasPage, /landing-test\/page/);
  assert.match(component, /jurobek-avatar\.webp/);
  assert.match(component, /landing-mobile-menu/);
  assert.match(component, /Cho‘ntagingizdagi yurist/);
});
