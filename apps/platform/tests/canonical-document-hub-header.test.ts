import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("canonical document hubs use the embedded toolbar without resolving auth twice", async () => {
  const [documentsPage, client, accountRoute, businessRoute] = await Promise.all([
    readFile(new URL("app/_document-builder/documents/page.tsx", root), "utf8"),
    readFile(new URL("app/_document-builder/documents/DocumentsClient.tsx", root), "utf8"),
    readFile(new URL("app/[locale]/[accountType]/documents/page.tsx", root), "utf8"),
    readFile(new URL("app/[locale]/business/[workspaceId]/documents/page.tsx", root), "utf8"),
  ]);

  assert.match(documentsPage, /user: suppliedUser/);
  assert.match(documentsPage, /suppliedUser \?\? await requireChatGPTUser\(returnTo\)/);
  assert.match(documentsPage, /<DocumentsClient[\s\S]*embedded=\{embedded\}/);
  assert.match(client, /variant=\{embedded \? "embedded" : "standalone"\}/);

  const header = await readFile(new URL("app/_document-builder/_components/BuilderHeader.tsx", root), "utf8");
  assert.match(header, /\{!embedded && <nav aria-label=/);
  assert.match(header, /\{embedded \? <div className="dbt-embedded-title">/);

  for (const route of [accountRoute, businessRoute]) {
    assert.match(route, /const user = await requireChatGPTUser\(returnTo\)/);
    assert.match(route, /<DocumentsPage embedded returnTo=\{returnTo\} user=\{user\}\/>/);
  }
});
