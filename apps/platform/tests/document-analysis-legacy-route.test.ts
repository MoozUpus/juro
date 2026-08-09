import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("document-analysis routes preserve the canonical document-review surface", async () => {
  const [personal, business, legacy] = await Promise.all([
    source("app/[locale]/[accountType]/document-analysis/route.ts"),
    source("app/[locale]/business/[workspaceId]/document-analysis/route.ts"),
    source("app/[locale]/business/document-analysis/route.ts"),
  ]);

  assert.match(personal, /isLocale\(locale\).*isAccountType\(accountType\)/s);
  assert.match(personal, /new URL\(request\.url\)/);
  assert.match(personal, /getChatGPTUser/);
  assert.match(personal, /returnTo/);
  assert.match(personal, /document-review/);
  assert.match(business, /isWorkspaceId\(workspaceId\)/);
  assert.match(business, /new URL\(request\.url\)/);
  assert.match(business, /getChatGPTUser/);
  assert.match(business, /returnTo/);
  assert.match(business, /document-review/);
  assert.match(legacy, /workspaceForUser/);
  assert.match(legacy, /getChatGPTUser/);
  assert.match(legacy, /returnTo/);
  for (const route of [personal, business, legacy]) {
    assert.match(route, /FORWARDED_QUERY_KEYS/);
    assert.match(route, /"analysisId"/);
    assert.match(route, /"caseId"/);
    assert.match(route, /Response\.redirect/);
    assert.doesNotMatch(route, /mock|TODO|setTimeout/);
  }
});
