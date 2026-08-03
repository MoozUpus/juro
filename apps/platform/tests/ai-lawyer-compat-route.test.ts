import assert from "node:assert/strict";
import test from "node:test";

import {
  businessAiLawyerCompatibilityRoute,
  personalAiLawyerCompatibilityRoute,
} from "../app/ai-lawyer-compat";

test("personal ai-lawyer compatibility routes preserve locale and canonical account type", async () => {
  for (const path of [undefined, ["new"]]) {
    const response = await personalAiLawyerCompatibilityRoute(
      new Request("https://staging.app.juro.uz/ru/individual/ai-lawyer/new?ignored=secret"),
      Promise.resolve({ locale: "ru", accountType: "individual", path }),
    );
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://staging.app.juro.uz/ru/individual/ai-chat");
  }
  const chatId = "11111111-1111-4111-8111-111111111111";
  const chat = await personalAiLawyerCompatibilityRoute(
    new Request(`https://staging.app.juro.uz/uz/lawyer/ai-lawyer/chat/${chatId}`),
    Promise.resolve({ locale: "uz", accountType: "lawyer", path: ["chat", chatId] }),
  );
  assert.equal(chat.status, 308);
  assert.equal(chat.headers.get("location"), `https://staging.app.juro.uz/uz/lawyer/ai-chat?conversationId=${chatId}`);
});

test("business compatibility route keeps the exact workspace and rejects malformed paths", async () => {
  const response = await businessAiLawyerCompatibilityRoute(
    new Request("https://staging.app.juro.uz/ru/business/workspace-1/ai-lawyer/new"),
    Promise.resolve({ locale: "ru", workspaceId: "workspace-1", path: ["new"] }),
  );
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://staging.app.juro.uz/ru/business/workspace-1/ai-chat");

  for (const invalid of [
    personalAiLawyerCompatibilityRoute(
      new Request("https://staging.app.juro.uz/en/individual/ai-lawyer/new"),
      Promise.resolve({ locale: "en", accountType: "individual", path: ["new"] }),
    ),
    personalAiLawyerCompatibilityRoute(
      new Request("https://staging.app.juro.uz/ru/business/ai-lawyer/new"),
      Promise.resolve({ locale: "ru", accountType: "business", path: ["new"] }),
    ),
    businessAiLawyerCompatibilityRoute(
      new Request("https://staging.app.juro.uz/ru/business/x/ai-lawyer/new"),
      Promise.resolve({ locale: "ru", workspaceId: "x", path: ["new"] }),
    ),
    personalAiLawyerCompatibilityRoute(
      new Request("https://staging.app.juro.uz/ru/individual/ai-lawyer/chat/not-a-uuid"),
      Promise.resolve({ locale: "ru", accountType: "individual", path: ["chat", "not-a-uuid"] }),
    ),
    personalAiLawyerCompatibilityRoute(
      new Request("https://staging.app.juro.uz/ru/individual/ai-lawyer/delete"),
      Promise.resolve({ locale: "ru", accountType: "individual", path: ["delete"] }),
    ),
  ]) {
    assert.equal((await invalid).status, 404);
  }
});
