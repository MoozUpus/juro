import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_PROMPT_VERSIONS,
  aiPromptRegistry,
  aiPromptReleaseHistory,
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

test("prompt release history is source-backed and resolves every current version", () => {
  assert.deepEqual(aiPromptReleaseHistory.map(({ key, version, status, sourceCommit }) => ({ key, version, status, sourceCommit })), [
    { key: "legalChat", version: "juro-legal-chat-v2-conversation", status: "current", sourceCommit: "7e7bac1485f35ccbee6e03784cd314c668d878d2" },
    { key: "guestLegalChat", version: "juro-guest-legal-chat-v1", status: "current", sourceCommit: "2c4754d30d24289d0da5fd2fd5e732d1a4c7a805" },
    { key: "documentAnalysis", version: "juro-document-analysis-v1", status: "current", sourceCommit: "2456742373ef045328e4d9df09ac6c6ef95bc03a" },
    { key: "legalChat", version: "juro-legal-chat-v1", status: "superseded", sourceCommit: "fc21def3d62afd37f2852e7a98e24d5473c6d2c3" },
  ]);
  assert.deepEqual(
    aiPromptReleaseHistory.filter((entry) => entry.status === "current").map(({ key, version }) => ({ key, version })),
    aiPromptRegistry.map(({ key, version }) => ({ key, version })),
  );
  assert.equal(aiPromptReleaseHistory.every((entry) => /^[0-9a-f]{40}$/.test(entry.sourceCommit)), true);
  assert.equal(aiPromptReleaseHistory.every((entry) => Number.isFinite(Date.parse(entry.introducedAt))), true);
  const superseded = aiPromptReleaseHistory.find((entry) => entry.status === "superseded");
  assert.equal(superseded && "supersededBy" in superseded ? superseded.supersededBy : null, AI_PROMPT_VERSIONS.legalChat);
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
  assert.match(admin, /aiPromptReleaseHistory\.map/);
  assert.match(admin, /data-prompt-key=/);
  assert.match(admin, /data-prompt-release=/);
  assert.match(admin, /github\.com\/MoozUpus\/juro\/commit/);
  for (const path of ["admin/costs", "admin/ai-quality", "admin/feature-flags", "admin/system-status"]) {
    assert.match(admin, new RegExp(path));
  }
  assert.match(admin, /Активный A\/B-тест не настроен/);
  assert.match(admin, /Faol A\/B-test sozlanmagan/);
  assert.match(admin, /История релизов prompt/);
  assert.match(admin, /Prompt relizlari tarixi/);
  assert.doesNotMatch(admin, /Ты — AI-юрист JURO/);
});
