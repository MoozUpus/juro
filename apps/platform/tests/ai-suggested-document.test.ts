import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DOCUMENT_REGISTRY } from "../lib/document-builder/registry";
import {
  AiSuggestedDocumentError,
  createAiSuggestedDocumentDraft,
  previewAiSuggestedDocument,
  resolveAiSuggestedDocument,
} from "../lib/ai/suggested-document";
import type { UserProfile } from "../lib/document-builder/types";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "user_ai_document";
const WORKSPACE_ID = "ws_ai_document";
const CONVERSATION_ID = "conversation_ai_document";
const ASSISTANT_MESSAGE_ID = "121f218d-30a1-49f7-8602-5f1b04ccd63b";
const NOW = "2026-08-03T09:00:00.000Z";
const TEMPLATE = DOCUMENT_REGISTRY.find((item) => item.status === "published");
if (!TEMPLATE) throw new Error("A published builder template is required for this test");
const PUBLISHED_TEMPLATE: NonNullable<typeof TEMPLATE> = TEMPLATE;
const SELF_PREFIXES = new Set(["applicant", "claimant", "employee", "creditor", "consumer", "requester", "principal", "author"]);
const PREFILL_TEMPLATE = DOCUMENT_REGISTRY.find((item) => item.status === "published" && item.questionnaire.some((step) =>
  step.fields.some((field) => SELF_PREFIXES.has(field.id.split(".")[0] ?? "") && field.id.endsWith(".fullName")),
));
if (!PREFILL_TEMPLATE) throw new Error("A published builder template with an eligible profile field is required");

const USER: UserProfile = {
  id: USER_ID,
  email: "ai-document@example.invalid",
  fullName: "Тестовый Пользователь",
  birthDate: "1990-01-01",
  idDocumentType: null,
  idDocumentNumber: null,
  idIssuedBy: null,
  idIssueDate: null,
  pinfl: null,
  registeredAddress: "Тестовый адрес",
  phone: "+998900000000",
};

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
  fixture.sqlite.prepare("INSERT INTO workspace_members (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("member_ai_document", WORKSPACE_ID, USER_ID, "owner", "active", NOW, NOW, NOW);
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

test("AI document preview and confirmation persist only reviewed tenant-owned values exactly once", async () => {
  const { sqlite, d1 } = seed(PREFILL_TEMPLATE.code);
  try {
    const preview = await previewAiSuggestedDocument({
      db: d1, workspaceId: WORKSPACE_ID, user: USER,
      assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru",
    });
    assert.equal(preview.templateCode, PREFILL_TEMPLATE.code);
    assert.equal(preview.title, PREFILL_TEMPLATE.titleRu);
    assert.ok(preview.candidates.length > 0);
    assert.equal(new Set(preview.candidates.map((candidate) => candidate.fieldId)).size, preview.candidates.length);

    const candidate = preview.candidates.find((item) => item.source === "profile") ?? preview.candidates[0]!;
    const reviewedValue = "Отредактировано пользователем перед созданием";
    const input = {
      db: d1, workspaceId: WORKSPACE_ID, user: USER,
      assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru" as const,
      fields: [{ fieldId: candidate.fieldId, value: reviewedValue }],
      idempotencyKey: "ai-document-test-request-0001",
    };
    const created = await createAiSuggestedDocumentDraft(input);
    assert.equal(created.replayed, false);

    const document = sqlite.prepare("SELECT workspace_id AS workspaceId,owner_user_id AS ownerUserId,template_code AS templateCode,status FROM documents WHERE id=?")
      .get(created.documentId) as { workspaceId: string; ownerUserId: string; templateCode: string; status: string };
    assert.deepEqual({ ...document }, { workspaceId: WORKSPACE_ID, ownerUserId: USER_ID, templateCode: PREFILL_TEMPLATE.code, status: "Черновик" });
    const answers = JSON.parse((sqlite.prepare("SELECT answers_json AS answersJson FROM document_answers WHERE document_id=?")
      .get(created.documentId) as { answersJson: string }).answersJson) as Record<string, unknown>;
    assert.equal(answers[candidate.fieldId], reviewedValue);

    const handoff = sqlite.prepare(`SELECT selected_field_ids_json AS selectedFieldIdsJson,
      selection_sha256 AS selectionSha256,idempotency_key_sha256 AS idempotencyKeySha256
      FROM ai_document_prefill_handoffs WHERE document_id=?`).get(created.documentId) as {
        selectedFieldIdsJson: string; selectionSha256: string; idempotencyKeySha256: string;
      };
    assert.deepEqual(JSON.parse(handoff.selectedFieldIdsJson), [candidate.fieldId]);
    assert.match(handoff.selectionSha256, /^[0-9a-f]{64}$/);
    assert.match(handoff.idempotencyKeySha256, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(handoff.selectedFieldIdsJson, /Отредактировано/u);
    assert.ok(!(sqlite.prepare("PRAGMA table_info(ai_document_prefill_handoffs)").all() as Array<{ name: string }>).some((column) => column.name === "idempotency_key"));

    const replay = await createAiSuggestedDocumentDraft(input);
    assert.deepEqual(replay, { documentId: created.documentId, replayed: true });
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM documents WHERE workspace_id=?").get(WORKSPACE_ID) as { count: number }).count, 1);

    await assert.rejects(
      () => createAiSuggestedDocumentDraft({ ...input, fields: [{ fieldId: candidate.fieldId, value: "Другое значение" }] }),
      (error: unknown) => error instanceof AiSuggestedDocumentError && error.code === "AI_SUGGESTED_DOCUMENT_CONFLICT",
    );

    sqlite.prepare("DELETE FROM documents WHERE id=?").run(created.documentId);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_document_prefill_handoffs WHERE document_id=?").get(created.documentId) as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

test("AI document confirmation rejects fields not offered by the server without creating a draft", async () => {
  const { sqlite, d1 } = seed(PREFILL_TEMPLATE.code);
  try {
    await assert.rejects(
      () => createAiSuggestedDocumentDraft({
        db: d1, workspaceId: WORKSPACE_ID, user: USER,
        assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru",
        fields: [{ fieldId: "attacker.injectedField", value: "untrusted" }],
        idempotencyKey: "ai-document-test-request-0002",
      }),
      (error: unknown) => error instanceof AiSuggestedDocumentError && error.code === "AI_SUGGESTED_DOCUMENT_INVALID",
    );
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM documents WHERE workspace_id=?").get(WORKSPACE_ID) as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

test("AI document confirmation requires a separate consent for selected sensitive values", async () => {
  const { sqlite, d1 } = seed(PREFILL_TEMPLATE.code);
  try {
    const preview = await previewAiSuggestedDocument({ db: d1, workspaceId: WORKSPACE_ID, user: USER, assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru" });
    const sensitive = preview.candidates.find((candidate) => candidate.sensitive);
    if (!sensitive) throw new Error("Expected a sensitive prefill candidate");
    const input = { db: d1, workspaceId: WORKSPACE_ID, user: USER, assistantMessageId: ASSISTANT_MESSAGE_ID, locale: "ru" as const, fields: [{ fieldId: sensitive.fieldId, value: sensitive.value }], idempotencyKey: "ai-document-sensitive-consent-0001" };
    await assert.rejects(
      () => createAiSuggestedDocumentDraft(input),
      (error: unknown) => error instanceof AiSuggestedDocumentError && error.code === "AI_SUGGESTED_DOCUMENT_SENSITIVE_CONSENT_REQUIRED",
    );
    const created = await createAiSuggestedDocumentDraft({ ...input, sensitiveDataConsent: true });
    assert.equal(created.replayed, false);
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
  assert.match(route, /parseJsonRequest\(request, z\.unknown\(\), 64_000\)/);
  assert.match(route, /idempotency-key/);
  assert.match(service, /conversation\.workspace_id=\? AND conversation\.owner_user_id=\?/);
  assert.match(service, /getDocumentByCode\(suggested\.templateCode\)/);
  assert.match(service, /idempotencyKeySha256 = await sha256\(input\.idempotencyKey\)/);
  assert.match(client, /\/api\/platform\/ai\/suggested-document/);
  assert.match(client, /assistantMessageId: documentPrefillMessageId/);
  assert.doesNotMatch(client, /templateCode: answer\.result\.suggestedDocument/);
});
