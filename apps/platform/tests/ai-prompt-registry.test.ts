import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_PROMPT_VERSIONS,
  aiPromptRegistry,
} from "../lib/ai/prompt-registry";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("prompt registry exposes every persisted AI instruction identity exactly once", () => {
  assert.deepEqual(AI_PROMPT_VERSIONS, {
    legalChat: "juro-legal-chat-v2-conversation",
    guestLegalChat: "juro-guest-legal-chat-v1",
    documentAnalysis: "juro-document-analysis-v1",
  });
  assert.deepEqual(aiPromptRegistry.map((entry) => entry.key), [
    "legalChat",
    "guestLegalChat",
    "documentAnalysis",
  ]);
  assert.equal(new Set(aiPromptRegistry.map((entry) => entry.version)).size, aiPromptRegistry.length);
  assert.equal(aiPromptRegistry.every((entry) => entry.releaseGate === "code_review_and_evaluation"), true);
});

test("runtime hashes and Admin prompt visibility share the code-owned registry", () => {
  const platformRoute = source("../app/api/platform/ai/route.ts");
  const guestRoute = source("../app/api/guest/ai/route.ts");
  const documentProcessor = source("../lib/document-analysis/processor.ts");
  const admin = source("../app/_staff/AiSettingsConsole.tsx");

  assert.match(platformRoute, /version: AI_PROMPT_VERSIONS\.legalChat/);
  assert.match(guestRoute, /version: AI_PROMPT_VERSIONS\.guestLegalChat/);
  assert.match(documentProcessor, /version: AI_PROMPT_VERSIONS\.documentAnalysis/);
  assert.doesNotMatch(platformRoute, /const INSTRUCTION_VERSION/);
  assert.doesNotMatch(guestRoute, /const GUEST_INSTRUCTION_VERSION/);

  assert.match(admin, /aiPromptRegistry\.map/);
  assert.match(admin, /data-prompt-key=/);
  for (const path of ["admin/costs", "admin/ai-quality", "admin/feature-flags", "admin/system-status"]) {
    assert.match(admin, new RegExp(path));
  }
  assert.match(admin, /Активный A\/B-тест не настроен/);
  assert.match(admin, /Faol A\/B-test sozlanmagan/);
  assert.doesNotMatch(admin, /Ты — AI-юрист JURO/);
});
