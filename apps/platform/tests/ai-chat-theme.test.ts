import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI chat offers a persisted RU/UZ light and dark theme without changing the global shell", async () => {
  const [client, css] = await Promise.all([
    readFile(new URL("../app/_platform/AiLawyerClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/ai-lawyer-phase4.css", import.meta.url), "utf8"),
  ]);

  assert.match(client, /localStorage\.getItem\("juro-ai-theme"\)/u);
  assert.match(client, /localStorage\.setItem\("juro-ai-theme", next\)/u);
  assert.match(client, /prefers-color-scheme: dark/u);
  assert.match(client, /ai-theme-dark/u);
  assert.match(client, /Включить тёмную тему/u);
  assert.match(client, /Qorong‘i mavzuni yoqish/u);
  assert.match(css, /\.ai-workspace\.ai-theme-dark/u);
  assert.match(css, /color-scheme: dark/u);
  assert.match(css, /\.ai-theme-dark \.ai-conversation-list a/u);
  assert.match(css, /\.ai-theme-dark \.ai-conversation-list strong/u);
  assert.doesNotMatch(client, /document\.documentElement/u);
});
