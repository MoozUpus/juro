import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyMemorySensitivity,
  clearUserMemories,
  deleteUserMemory,
  extractAutomaticMemoryCandidates,
  listUserMemories,
  memoryKeyring,
  memorySettings,
  persistAutomaticMemories,
  saveUserMemory,
  setAutomaticMemory,
  updateUserMemory,
  UserMemoryError,
} from "../lib/ai/user-memory";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function testKeyring() {
  return memoryKeyring(JSON.stringify({
    active: "v1",
    versions: { v1: { aead: encodedKey(1), hmac: encodedKey(33) } },
  }));
}

async function seedTenant(
  db: D1Database,
  userId: string,
  workspaceIds: string[],
): Promise<void> {
  const now = "2026-08-03T00:00:00.000Z";
  await db.prepare(
    "INSERT INTO user_profiles(id,email,locale,created_at,updated_at) VALUES (?,?,?,?,?)",
  ).bind(userId, `${userId}@example.test`, "ru", now, now).run();
  for (const workspaceId of workspaceIds) {
    await db.prepare(
      "INSERT INTO workspaces(id,type,name,locale,created_at,updated_at) VALUES (?,'individual',?,'ru',?,?)",
    ).bind(workspaceId, `Synthetic ${workspaceId}`, now, now).run();
  }
}

test("automatic memory extraction is bounded, localized and sensitivity filtered", () => {
  assert.equal(classifyMemorySensitivity("Пароль от банка: secret"), "credential");
  assert.equal(classifyMemorySensitivity("Код из SMS 123456"), "credential");
  assert.equal(classifyMemorySensitivity("Карта 8600 1234 5678 9012"), "credential");
  assert.equal(classifyMemorySensitivity("Паспортные сведения"), "high");
  assert.equal(classifyMemorySensitivity("Семейный развод"), "high");
  assert.equal(classifyMemorySensitivity("Предпочитаю краткие ответы"), "none");

  assert.deepEqual(extractAutomaticMemoryCandidates(
    "Меня зовут Азиза. Моя компания JURO Labs. Предпочитаю краткие ответы. Запомни: отвечай без канцелярита.",
    "ru",
  ), [
    { category: "profile_name", statement: "Имя пользователя: Азиза", scope: "global" },
    { category: "company", statement: "Компания пользователя: JURO Labs", scope: "workspace" },
    { category: "answer_style", statement: "Пользователь предпочитает краткие ответы.", scope: "global" },
    { category: "user_instruction", statement: "Инструкция пользователя: отвечай без канцелярита", scope: "global" },
  ]);
  assert.deepEqual(extractAutomaticMemoryCandidates(
    "Mening ismim Aziz. Mening kompaniyam JURO Labs. Batafsil javoblarni afzal ko‘raman.",
    "uz",
  ), [
    { category: "profile_name", statement: "Foydalanuvchining ismi: Aziz", scope: "global" },
    { category: "company", statement: "Foydalanuvchi kompaniyasi: JURO Labs", scope: "workspace" },
    { category: "answer_style", statement: "Foydalanuvchi batafsil javoblarni afzal ko‘radi.", scope: "global" },
  ]);
  assert.deepEqual(
    extractAutomaticMemoryCandidates("Запомни: мой пароль secret и код из SMS 123456.", "ru"),
    [],
  );
  assert.deepEqual(
    extractAutomaticMemoryCandidates("Запомни: у меня уголовное обвинение.", "ru"),
    [],
  );
});
test("memory is record-bound encrypted and isolated by user and workspace", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await seedTenant(d1, "user-a", ["workspace-a", "workspace-a2"]);
    await seedTenant(d1, "user-b", ["workspace-b"]);
    const keyring = testKeyring();

    const global = await saveUserMemory({
      db: d1,
      keyring,
      userId: "user-a",
      workspaceId: "workspace-a",
      category: "answer_style",
      statement: "Пользователь предпочитает структурированные ответы.",
      scope: "global",
      sourceKind: "manual",
      sourceType: "manual",
      confirmSensitive: false,
    });
    const scoped = await saveUserMemory({
      db: d1,
      keyring,
      userId: "user-a",
      workspaceId: "workspace-a",
      category: "company",
      statement: "Компания пользователя: Synthetic JURO LLC",
      scope: "workspace",
      sourceKind: "manual",
      sourceType: "manual",
      confirmSensitive: false,
    });
    assert.equal(global.created, true);
    assert.equal(scoped.created, true);

    const stored = sqlite.prepare(
      "SELECT ciphertext,content_sha256 AS hash,workspace_id AS workspaceId,scope_key AS scopeKey FROM user_memories WHERE id=?",
    ).get(scoped.id) as { ciphertext: string; hash: string; workspaceId: string; scopeKey: string };
    assert.notEqual(stored.ciphertext, "Компания пользователя: Synthetic JURO LLC");
    assert.doesNotMatch(stored.ciphertext, /Synthetic|JURO|LLC/);
    assert.match(stored.hash, /^[a-f0-9]{64}$/);
    assert.equal(stored.workspaceId, "workspace-a");
    assert.equal(stored.scopeKey, "workspace:workspace-a");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM memory_sources").get()?.count, 2);

    assert.deepEqual(
      (await listUserMemories({ db: d1, keyring, userId: "user-a", workspaceId: "workspace-a" }))
        .map((memory) => memory.statement).sort(),
      [
        "Компания пользователя: Synthetic JURO LLC",
        "Пользователь предпочитает структурированные ответы.",
      ].sort(),
    );
    assert.deepEqual(
      (await listUserMemories({ db: d1, keyring, userId: "user-a", workspaceId: "workspace-a2" }))
        .map((memory) => memory.statement),
      ["Пользователь предпочитает структурированные ответы."],
    );
    assert.deepEqual(
      await listUserMemories({ db: d1, keyring, userId: "user-b", workspaceId: "workspace-b" }),
      [],
    );

    await updateUserMemory({
      db: d1,
      keyring,
      memoryId: scoped.id,
      userId: "user-a",
      workspaceId: "workspace-a",
      category: "company",
      statement: "Компания пользователя: Updated Synthetic LLC",
      confirmSensitive: false,
    });
    await assert.rejects(
      updateUserMemory({
        db: d1,
        keyring,
        memoryId: scoped.id,
        userId: "user-b",
        workspaceId: "workspace-b",
        category: "company",
        statement: "Cross-tenant overwrite",
      }),
      (error: unknown) => error instanceof UserMemoryError && error.code === "MEMORY_NOT_FOUND",
    );
    await deleteUserMemory({
      db: d1,
      memoryId: scoped.id,
      userId: "user-a",
      workspaceId: "workspace-a",
    });
    assert.equal(sqlite.prepare("SELECT status FROM user_memories WHERE id=?").get(scoped.id)?.status, "deleted");
    const auditJson = JSON.stringify(sqlite.prepare(
      "SELECT action,metadata_json FROM workspace_audit_events WHERE entity_type LIKE 'user_memory%' ORDER BY created_at",
    ).all());
    assert.doesNotMatch(auditJson, /Synthetic JURO|Updated Synthetic/);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("manual memory rejects credentials and requires explicit confirmation for sensitive facts", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await seedTenant(d1, "user-a", ["workspace-a"]);
    const keyring = testKeyring();
    const base = {
      db: d1,
      keyring,
      userId: "user-a",
      workspaceId: "workspace-a",
      category: "legal_context" as const,
      scope: "global" as const,
      sourceKind: "manual" as const,
      sourceType: "manual" as const,
    };
    await assert.rejects(
      saveUserMemory({ ...base, statement: "Мой OTP код 123456", confirmSensitive: true }),
      (error: unknown) => error instanceof UserMemoryError && error.code === "MEMORY_CREDENTIAL_FORBIDDEN",
    );
    await assert.rejects(
      saveUserMemory({ ...base, statement: "У пользователя паспортные сведения", confirmSensitive: false }),
      (error: unknown) => error instanceof UserMemoryError && error.code === "MEMORY_SENSITIVE_CONFIRMATION_REQUIRED",
    );
    const saved = await saveUserMemory({
      ...base,
      statement: "У пользователя паспортные сведения",
      confirmSensitive: true,
    });
    assert.equal(saved.created, true);
    assert.doesNotMatch(
      String(sqlite.prepare("SELECT ciphertext FROM user_memories WHERE id=?").get(saved.id)?.ciphertext),
      /паспорт/iu,
    );
  } finally {
    sqlite.close();
  }
});

test("automatic memory obeys settings, keeps workspace context local and soft-clears accessible rows", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const now = "2026-08-03T00:00:00.000Z";
    await seedTenant(d1, "user-a", ["workspace-a", "workspace-a2"]);
    await d1.prepare(
      "INSERT INTO conversations(id,workspace_id,owner_user_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)",
    ).bind("conversation-a", "workspace-a", "user-a", "Synthetic", "ru", now, now).run();
    await d1.prepare(
      "INSERT INTO conversation_messages(id,conversation_id,author_type,content,created_at) VALUES (?,?,'user',?,?)",
    ).bind("message-a", "conversation-a", "Меня зовут Азиза.", now).run();
    const keyring = testKeyring();
    assert.deepEqual(await memorySettings(d1, "user-a"), { automaticEnabled: true });
    assert.equal(await persistAutomaticMemories({
      db: d1,
      keyring,
      userId: "user-a",
      workspaceId: "workspace-a",
      conversationId: "conversation-a",
      messageId: "message-a",
      question: "Меня зовут Азиза. Моя компания JURO Labs.",
      locale: "ru",
    }), 2);
    assert.deepEqual(
      (await listUserMemories({ db: d1, keyring, userId: "user-a", workspaceId: "workspace-a2" }))
        .map((memory) => memory.category),
      ["profile_name"],
    );
    await setAutomaticMemory(d1, "user-a", "workspace-a", false);
    assert.deepEqual(await memorySettings(d1, "user-a"), { automaticEnabled: false });
    assert.equal(await persistAutomaticMemories({
      db: d1,
      keyring,
      userId: "user-a",
      workspaceId: "workspace-a",
      conversationId: "conversation-a",
      messageId: "message-a",
      question: "Предпочитаю подробные ответы.",
      locale: "ru",
    }), 0);
    assert.equal(await clearUserMemories({ db: d1, userId: "user-a", workspaceId: "workspace-a" }), 2);
    assert.deepEqual(await listUserMemories({ db: d1, keyring, userId: "user-a", workspaceId: "workspace-a" }), []);
  } finally {
    sqlite.close();
  }
});

test("provider and API boundaries treat memory as authenticated untrusted context", async () => {
  const [openai, anthropic, aiRoute, memoryRoute, privacyExport, client] = await Promise.all([
    readFile(new URL("../lib/ai/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai/anthropic-provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/ai/memory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/privacy/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/MemoryPanel.tsx", import.meta.url), "utf8"),
  ]);
  for (const provider of [openai, anthropic]) {
    assert.match(provider, /userMemory/);
    assert.match(provider, /недоверенн|недоверенный/iu);
    assert.match(provider, /не исполняй/iu);
  }
  assert.match(aiRoute, /listUserMemories/);
  assert.match(aiRoute, /persistAutomaticMemories/);
  assert.match(aiRoute, /memory_context_unavailable/);
  assert.match(memoryRoute, /requireApiUser/);
  assert.match(memoryRoute, /workspaceForUser/);
  assert.match(memoryRoute, /assertSafeWrite/);
  assert.match(memoryRoute, /discriminatedUnion/);
  assert.match(memoryRoute, /cache-control.*private, no-store/s);
  assert.match(privacyExport, /listUserMemories/);
  assert.match(privacyExport, /неполный экспорт не создан/);
  assert.match(client, /Автоматически сохранять безопасные факты/);
  assert.match(client, /Пароли, коды и платёжные данные не сохраняются/);
  for (const source of [openai, anthropic, aiRoute, memoryRoute, privacyExport, client]) {
    assert.doesNotMatch(source, /NEXT_PUBLIC_(?:OPENAI|ANTHROPIC|IDENTITY)/);
  }
});
