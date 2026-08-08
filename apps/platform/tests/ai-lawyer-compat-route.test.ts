import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  businessAiLawyerCompatibilityRoute,
  personalAiLawyerCompatibilityRoute,
} from "../app/ai-lawyer-compat";

test("personal ai-lawyer compatibility routes preserve locale and canonical account type", async () => {
  const caseId = "22222222-2222-4222-8222-222222222222";
  for (const path of [undefined, ["new"]]) {
    const response = await personalAiLawyerCompatibilityRoute(
      new Request(`https://app.juro.uz/ru/individual/ai-lawyer/new?caseId=${caseId}&ignored=secret`),
      Promise.resolve({ locale: "ru", accountType: "individual", path }),
    );
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://app.juro.uz/ru/individual/ai-chat?caseId=${caseId}`);
  }
  const chatId = "11111111-1111-4111-8111-111111111111";
  const chat = await personalAiLawyerCompatibilityRoute(
    new Request(`https://app.juro.uz/uz/lawyer/ai-lawyer/chat/${chatId}`),
    Promise.resolve({ locale: "uz", accountType: "lawyer", path: ["chat", chatId] }),
  );
  assert.equal(chat.status, 308);
  assert.equal(chat.headers.get("location"), `https://app.juro.uz/uz/lawyer/ai-chat?conversationId=${chatId}`);

  const voice = await personalAiLawyerCompatibilityRoute(
    new Request("https://app.juro.uz/ru/entrepreneur/ai-lawyer/voice"),
    Promise.resolve({ locale: "ru", accountType: "entrepreneur", path: ["voice"] }),
  );
  assert.equal(voice.status, 308);
  assert.equal(voice.headers.get("location"), "https://app.juro.uz/ru/entrepreneur/ai-chat?mode=voice");
});

test("business compatibility route keeps the exact workspace and rejects malformed paths", async () => {
  const caseId = "33333333-3333-4333-8333-333333333333";
  const response = await businessAiLawyerCompatibilityRoute(
    new Request(`https://app.juro.uz/ru/business/workspace-1/ai-lawyer/new?caseId=${caseId}&ignored=secret`),
    Promise.resolve({ locale: "ru", workspaceId: "workspace-1", path: ["new"] }),
  );
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), `https://app.juro.uz/ru/business/workspace-1/ai-chat?caseId=${caseId}`);

  const voice = await businessAiLawyerCompatibilityRoute(
    new Request("https://app.juro.uz/uz/business/workspace-1/ai-lawyer/voice"),
    Promise.resolve({ locale: "uz", workspaceId: "workspace-1", path: ["voice"] }),
  );
  assert.equal(voice.status, 308);
  assert.equal(voice.headers.get("location"), "https://app.juro.uz/uz/business/workspace-1/ai-chat?mode=voice");

  for (const invalid of [
    personalAiLawyerCompatibilityRoute(
      new Request("https://app.juro.uz/en/individual/ai-lawyer/new"),
      Promise.resolve({ locale: "en", accountType: "individual", path: ["new"] }),
    ),
    personalAiLawyerCompatibilityRoute(
      new Request("https://app.juro.uz/ru/business/ai-lawyer/new"),
      Promise.resolve({ locale: "ru", accountType: "business", path: ["new"] }),
    ),
    businessAiLawyerCompatibilityRoute(
      new Request("https://app.juro.uz/ru/business/x/ai-lawyer/new"),
      Promise.resolve({ locale: "ru", workspaceId: "x", path: ["new"] }),
    ),
    personalAiLawyerCompatibilityRoute(
      new Request("https://app.juro.uz/ru/individual/ai-lawyer/chat/not-a-uuid"),
      Promise.resolve({ locale: "ru", accountType: "individual", path: ["chat", "not-a-uuid"] }),
    ),
    personalAiLawyerCompatibilityRoute(
      new Request("https://app.juro.uz/ru/individual/ai-lawyer/delete"),
      Promise.resolve({ locale: "ru", accountType: "individual", path: ["delete"] }),
    ),
  ]) {
    assert.equal((await invalid).status, 404);
  }
});

test("vinext receives explicit compatibility routes instead of an optional catch-all", () => {
  const explicitRoutes = [
    "../app/[locale]/[accountType]/ai-lawyer/route.ts",
    "../app/[locale]/[accountType]/ai-lawyer/new/route.ts",
    "../app/[locale]/[accountType]/ai-lawyer/chat/[chatId]/route.ts",
    "../app/[locale]/[accountType]/ai-lawyer/voice/route.ts",
    "../app/[locale]/business/[workspaceId]/ai-lawyer/route.ts",
    "../app/[locale]/business/[workspaceId]/ai-lawyer/new/route.ts",
    "../app/[locale]/business/[workspaceId]/ai-lawyer/chat/[chatId]/route.ts",
    "../app/[locale]/business/[workspaceId]/ai-lawyer/voice/route.ts",
  ];

  for (const route of explicitRoutes) {
    assert.equal(existsSync(new URL(route, import.meta.url)), true, route);
  }

  assert.equal(
    existsSync(
      new URL(
        "../app/[locale]/[accountType]/ai-lawyer/[[...path]]/route.ts",
        import.meta.url,
      ),
    ),
    false,
  );
});
