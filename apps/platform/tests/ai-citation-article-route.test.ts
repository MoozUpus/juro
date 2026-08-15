import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("full article endpoint is private, ownership-scoped and restricted to validated Lex citations", async () => {
  const route = await readFile(
    new URL("../app/api/platform/ai/citations/[messageId]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /workspaceForUser\(user\)/);
  assert.match(route, /conversation\.workspace_id=\? AND conversation\.owner_user_id=\?/);
  assert.match(route, /citation_validation_status='validated'/);
  assert.match(route, /hostname === "lex\.uz" \|\| url\.hostname === "www\.lex\.uz"/);
  assert.match(route, /legal_corpus_variants/);
  assert.match(route, /document\.scope='global'/);
  assert.match(route, /document\.availability_status='ready'/);
  assert.match(route, /MAX_ARTICLE_CHARACTERS = 200_000/);
  assert.match(route, /MAX_ARTICLE_PARTS = 64/);
  assert.match(route, /cache-control": "private, no-store/);
  assert.doesNotMatch(route, /fetch\(/);
  assert.doesNotMatch(route, /dangerouslySetInnerHTML/);
});

test("AI source cards expose a safe full-text modal and official URL separately", async () => {
  const client = await readFile(
    new URL("../app/_platform/AiLawyerClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(client, /function LegalSourceCard/);
  assert.match(client, /role="dialog" aria-modal="true"/);
  assert.match(client, /api\/platform\/ai\/citations\/\$\{encodeURIComponent\(messageId\)\}/);
  assert.match(client, /target="_blank" rel="noreferrer"/);
  assert.match(client, /event\.key === "Escape"/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
});
