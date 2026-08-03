import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DOCUMENT_REGISTRY } from "../lib/document-builder/registry";
import {
  AiSuggestedDocumentError,
  resolveAiSuggestedDocument,
} from "../lib/ai/suggested-document";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "user_ai_document";
const WORKSPACE_ID = "ws_ai_document";
const CONVERSATION_ID = "conversation_ai_document";
const ASSISTANT_MESSAGE_ID = "121f218d-30a1-49f7-8602-5f1b04ccd63b";
const NOW = "2026-08-03T09:00:00.000Z";
const TEMPLATE = DOCUMENT_REGISTRY.find((item) => item.status === "published");
if (!TEMPLATE) throw new Error("A published builder template is required for this test");
const PUBLISHED_TEMPLATE: NonNullable<typeof TEMPLATE> = TEMPLATE;

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function structuredAnswer(templateCode: string | null = PUBLISHED_TEMPLATE.code) {
  return {
    responseKind: "answer" as const,
    summary: "Подготовка документа",
    answer: "Сохранённый структурированный ответ JURO.",
    language: "ru" as const, jurisdiction: "UZ" as const,
    answerMode: "detailed" as const, reasoningMode: "deep" as const,
    clarificationQuestions: [], confirmedFindings: [], assumptions: [], risks: [], sources: [], requiredDocuments: [], actionPlan: [], deadlines: [], successOutlook: null,
    urgency: "normal" as const,
    suggestedDocument: { templateCode, title: "Непроверенное название модели", reason: "Нужен проект документа." },
    suggestLawyer: false, legalDatabaseAsOf: NOW,
  };
}

function seed(templateCode?: string | null) {
  const fixture = sqliteD1Fixture();
  fixture.sqlite.prepare("INSERT INTO workspaces (id,type,name,full_name,short_name,locale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(WORKSPACE_ID, "individual", "AI document", null, null, "ru", NOW, NOW);
  fixture.sqlite.prepare("INSERT INTO user_profiles (id,email,full_name,locale,account_type,default_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(USER_ID, "ai-document@example.invalid", "AI Document User", "ru", "individual", WORKSPACE_ID, NOW, NOW);
  fixture.sqlite.prepare("INSERT INTO conversations (id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(CONVERSATION_ID, WORKSPACE_ID, USER_ID, null, "Документ", "ru", "active", NOW, NOW);
  fixture.sqlite.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)")
    .run(ASSISTANT_MESSAGE_ID, CONVERSATION_ID, "assistant", "Ответ", JSON.stringify(structuredAnswer(templateCode)), NOW);
  return fixture;
}

test("AI document handoff resolves only a published template from a tenant-owned persisted answer", async () => {
  const { sqlite, d1 } = seed();
  try {
    const result = await resolveAiSuggestedDocument({ db: d1, workspaceId: WORKSPACE_ID, userId: USER_ID, assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru" });
    assert.deepEqual(result, { templateCode: PUBLISHED_TEMPLATE.code, categorySlug: PUBLISHED_TEMPLATE.categorySlug, title: PUBLISHED_TEMPLATE.titleRu, reason: "Нужен проект документа." });
  } finally { sqlite.close(); }
});

test("AI document handoff rejects foreign workspaces and unavailable model template codes", async () => {
  const foreign = seed();
  try {
    await assert.rejects(
      () => resolveAiSuggestedDocument({ db: foreign.d1, workspaceId: "ws_foreign", userId: USER_ID, assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru" }),
      (error: unknown) => error instanceof AiSuggestedDocumentError && error.code === "AI_SUGGESTED_DOCUMENT_NOT_FOUND",
    );
  } finally { foreign.sqlite.close(); }
  const unavailable = seed("not-a-published-template");
  try {
    await assert.rejects(
      () => resolveAiSuggestedDocument({ db: unavailable.d1, workspaceId: WORKSPACE_ID, userId: USER_ID, assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru" }),
      (error: unknown) => error instanceof AiSuggestedDocumentError && error.code === "AI_SUGGESTED_DOCUMENT_UNAVAILABLE",
    );
  } finally { unavailable.sqlite.close(); }
});

test("AI document route and client never accept a client-selected template", () => {
  const route = source("app/api/platform/ai/suggested-document/route.ts");
  const service = source("lib/ai/suggested-document.ts");
  const client = source("app/_platform/AiLawyerClient.tsx");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /workspaceForUser\(user\)/);
  assert.match(service, /conversation\.workspace_id=\? AND conversation\.owner_user_id=\?/);
  assert.match(service, /getDocumentByCode\(suggested\.templateCode\)/);
  assert.match(client, /\/api\/platform\/ai\/suggested-document/);
  assert.match(client, /assistantMessageId: answer\.messageId/);
  assert.doesNotMatch(client, /templateCode: answer\.result\.suggestedDocument/);
});
