import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI chat inherits the single persisted platform theme", async () => {
  const [client, css] = await Promise.all([
    readFile(new URL("../app/_platform/AiLawyerClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/ai-lawyer-phase4.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(client, /juro-ai-theme|ai-theme-dark|toggleTheme/u);
  assert.doesNotMatch(client, /Включить тёмную тему|Qorong‘i mavzuni yoqish/u);
  assert.match(css, /html\[data-theme=dark\] \.ai-workspace/u);
  assert.match(css, /color-scheme:\s*dark/u);
  assert.match(css, /html\[data-theme=dark\] \.ai-conversation-list a/u);
  assert.doesNotMatch(css, /\.ai-theme-dark/u);
});
