import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("document-analysis routes preserve the canonical document-review surface", async () => {
  const [personal, business, legacy] = await Promise.all([
    source("app/[locale]/[accountType]/document-analysis/page.tsx"),
    source("app/[locale]/business/[workspaceId]/document-analysis/page.tsx"),
    source("app/[locale]/business/document-analysis/page.tsx"),
  ]);

  assert.match(personal, /isLocale\(locale\).*isAccountType\(accountType\)/s);
  assert.match(personal, /redirect\(`/);
  assert.match(personal, /document-review/);
  assert.match(business, /isWorkspaceId\(workspaceId\)/);
  assert.match(business, /redirect\(`/);
  assert.match(business, /document-review/);
  assert.match(legacy, /redirectLegacyBusinessRoute\(locale, \["document-review"\]/);
  for (const route of [personal, business, legacy]) {
    assert.match(route, /FORWARDED_QUERY_KEYS/);
    assert.match(route, /"analysisId"/);
    assert.match(route, /"caseId"/);
    assert.doesNotMatch(route, /mock|TODO|setTimeout/);
  }
});
