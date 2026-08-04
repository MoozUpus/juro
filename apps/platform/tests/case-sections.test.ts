import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CASE_SECTIONS, isCaseSection } from "../lib/platform/routing";

test("case section vocabulary exposes every canonical case route and rejects arbitrary paths", () => {
  assert.deepEqual(CASE_SECTIONS, [
    "overview",
    "chat",
    "documents",
    "analyses",
    "plan",
    "calendar",
    "sources",
    "participants",
    "lawyer",
    "activity",
    "access",
  ]);
  for (const section of CASE_SECTIONS) assert.equal(isCaseSection(section), true);
  for (const invalid of ["admin", "settings", "../access", "", "document-builder-test"]) {
    assert.equal(isCaseSection(invalid), false);
  }
});

test("personal, business and legacy case sections share one validated workspace surface", async () => {
  const [personal, business, legacy] = await Promise.all([
    readFile(new URL("../app/[locale]/[accountType]/cases/[caseId]/[section]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/business/[workspaceId]/cases/[caseId]/[section]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/business/cases/[caseId]/[section]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(personal, /isCaseSection\(section\)/);
  assert.match(personal, /requireChatGPTUser/);
  assert.match(personal, /CaseWorkspaceClient locale=\{locale\} caseId=\{caseId\} section=\{section\}/);
  assert.match(business, /isWorkspaceId\(workspaceId\)/);
  assert.match(business, /platformBasePath\(locale, "business", workspaceId\)/);
  assert.match(business, /CaseWorkspaceClient locale=\{locale\} caseId=\{caseId\} section=\{section\}/);
  assert.match(legacy, /redirectLegacyBusinessRoute\(locale, \["cases", caseId, section\]\)/);
});

test("case workspace aggregation scopes every private domain before returning records", async () => {
  const route = await readFile(
    new URL("../app/api/platform/cases/[caseId]/workspace/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /workspaceForUser\(user\)/);
  assert.match(route, /cases WHERE id=\? AND workspace_id=\?/);
  assert.match(route, /FROM documents WHERE workspace_id=\? AND case_id=\?/);
  assert.match(route, /FROM conversations[\s\S]*workspace_id=\? AND owner_user_id=\? AND case_id=\?/);
  assert.match(route, /FROM document_comparisons[\s\S]*workspace_id=\? AND owner_user_id=\? AND case_id=\?/);
  assert.match(route, /FROM document_analyses[\s\S]*a\.workspace_id=\? AND a\.owner_user_id=\? AND a\.case_id=\?/);
  assert.match(route, /c\.workspace_id=\? AND c\.owner_user_id=\? AND c\.case_id=\?/);
  assert.match(route, /m\.workspace_id=\? AND m\.status='active'/);
  assert.match(route, /r\.workspace_id=\? AND r\.requester_user_id=\? AND r\.case_id=\?/);
  assert.match(route, /cache-control": "private, no-store/);
});

test("case section UI uses URL navigation, real endpoints and allowlisted official sources", async () => {
  const client = await readFile(
    new URL("../app/_platform/CaseWorkspaceClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(client, /CASE_SECTIONS\.map/);
  assert.match(client, /aria-current=\{section === name \? "page"/);
  assert.match(client, /api\/platform\/cases\?caseId=/);
  assert.match(client, /api\/platform\/cases\/\$\{encodeURIComponent\(caseId\)\}\/workspace/);
  assert.match(client, /ai-lawyer\/new\?caseId=/);
  assert.match(client, /document-review\?caseId=/);
  assert.match(client, /analysisId=/);
  assert.match(client, /documents\/comparisons/);
  assert.match(client, /url\.hostname === "lex\.uz"/);
  assert.match(client, /url\.hostname === "advice\.uz"/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
});
