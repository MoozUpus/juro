import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  AiBranchInputError,
  listAiBranches,
  parseAiMessageOperation,
  resolveAiBranchInput,
} from "../lib/ai/branch-store";

test("AI message operations reject impossible new/existing conversation combinations", () => {
  assert.equal(parseAiMessageOperation(undefined, false), "new");
  assert.equal(parseAiMessageOperation(undefined, true), "follow_up");
  assert.throws(() => parseAiMessageOperation("new", true), AiBranchInputError);
  assert.throws(() => parseAiMessageOperation("regenerate", false), AiBranchInputError);
  assert.throws(() => parseAiMessageOperation("delete", true), AiBranchInputError);
});

test("edit and regenerate resolve only tenant-owned source messages", async () => {
  const { sqlite, d1 } = await branchDatabase();
  seedInitialBranch(sqlite);

  const edited = await resolveAiBranchInput({
    db: d1,
    workspaceId: "workspace-1",
    userId: "user-1",
    conversationId: "conversation-1",
    requestedOperation: "edit",
    sourceMessageId: "request-1",
    question: "Исправленный вопрос о сроке договора",
  });
  assert.deepEqual(edited, {
    operation: "edit",
    question: "Исправленный вопрос о сроке договора",
    sourceMessageId: "request-1",
    forkedFromMessageId: "request-1",
    parentBranchId: "branch-1",
    versionNumber: 2,
  });

  const regenerated = await resolveAiBranchInput({
    db: d1,
    workspaceId: "workspace-1",
    userId: "user-1",
    conversationId: "conversation-1",
    requestedOperation: "regenerate",
    sourceMessageId: "response-1",
    question: "Эта строка не должна заменить серверный вопрос",
  });
  assert.equal(regenerated.question, "Какой срок действует по договору?");
  assert.equal(regenerated.sourceMessageId, "request-1");
  assert.equal(regenerated.forkedFromMessageId, "response-1");
  assert.equal(regenerated.parentBranchId, "branch-1");
  assert.equal(regenerated.versionNumber, 2);

  await assert.rejects(
    resolveAiBranchInput({
      db: d1,
      workspaceId: "workspace-2",
      userId: "user-2",
      conversationId: "conversation-2",
      requestedOperation: "edit",
      sourceMessageId: "request-1",
      question: "Попытка чтения чужого сообщения",
    }),
    (error: unknown) => error instanceof AiBranchInputError && error.code === "SOURCE_MESSAGE_NOT_FOUND",
  );

  const branches = await listAiBranches({
    db: d1,
    conversationId: "conversation-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  });
  assert.equal(branches.length, 1);
  assert.equal(branches[0]?.question, "Какой срок действует по договору?");
});

test("migration 0039 guards tenant links, hashes, and immutable branch evidence", async () => {
  const { sqlite } = await branchDatabase();
  seedInitialBranch(sqlite);

  assert.throws(() => sqlite.prepare(
    "INSERT INTO message_branches (id,conversation_id,workspace_id,owner_user_id,parent_branch_id,forked_from_message_id,request_message_id,response_message_id,operation,created_at) VALUES (?,?,?,?,NULL,NULL,?,?,?,?)",
  ).run("branch-cross-tenant", "conversation-1", "workspace-2", "user-2", "request-1", "response-1", "edit", "2026-07-31T00:01:00.000Z"), /MESSAGE_BRANCH_TENANT_MISMATCH/);

  assert.throws(() => sqlite.prepare("UPDATE message_branches SET operation='edit' WHERE id='branch-1'").run(), /MESSAGE_BRANCH_IMMUTABLE/);

  sqlite.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?, ?,NULL,?)")
    .run("request-2", "conversation-1", "user", "Новая версия", "2026-07-31T00:02:00.000Z");
  sqlite.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?, ?,?,?)")
    .run("response-2", "conversation-1", "assistant", "Ответ 2", "{}", "2026-07-31T00:02:01.000Z");
  sqlite.prepare(
    "INSERT INTO message_branches (id,conversation_id,workspace_id,owner_user_id,parent_branch_id,forked_from_message_id,request_message_id,response_message_id,operation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run("branch-2", "conversation-1", "workspace-1", "user-1", "branch-1", "request-1", "request-2", "response-2", "edit", "2026-07-31T00:02:02.000Z");

  assert.throws(() => sqlite.prepare(
    "INSERT INTO message_versions (id,conversation_id,branch_id,message_id,source_message_id,created_by_user_id,operation,version_number,content_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run("version-bad-hash", "conversation-1", "branch-2", "request-2", "request-1", "user-1", "edit", 2, "not-a-sha256", "2026-07-31T00:02:03.000Z"), /MESSAGE_VERSION_HASH_INVALID/);

  assert.throws(() => sqlite.prepare("UPDATE message_versions SET version_number=3 WHERE id='version-1'").run(), /MESSAGE_VERSION_IMMUTABLE/);
});

async function branchDatabase(): Promise<{ sqlite: DatabaseSync; d1: D1Database }> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE user_profiles (id TEXT PRIMARY KEY);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id),FOREIGN KEY(owner_user_id) REFERENCES user_profiles(id));
    CREATE TABLE conversation_messages (id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,author_type TEXT NOT NULL,content TEXT NOT NULL,structured_json TEXT,created_at TEXT NOT NULL,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE);
    CREATE TABLE ai_runs (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT,request_message_id TEXT,response_message_id TEXT,status TEXT NOT NULL,completed_at TEXT);
  `);
  const migration = await readFile(new URL("../drizzle/0039_lame_killer_shrike.sql", import.meta.url), "utf8");
  sqlite.exec(migration);
  sqlite.exec(`
    INSERT INTO user_profiles(id) VALUES ('user-1'),('user-2');
    INSERT INTO workspaces(id) VALUES ('workspace-1'),('workspace-2');
    INSERT INTO conversations(id,workspace_id,owner_user_id) VALUES ('conversation-1','workspace-1','user-1'),('conversation-2','workspace-2','user-2');
  `);
  return { sqlite, d1: sqliteD1(sqlite) };
}

function seedInitialBranch(sqlite: DatabaseSync) {
  sqlite.exec(`
    INSERT INTO conversation_messages(id,conversation_id,author_type,content,structured_json,created_at)
      VALUES ('request-1','conversation-1','user','Какой срок действует по договору?',NULL,'2026-07-31T00:00:00.000Z');
    INSERT INTO conversation_messages(id,conversation_id,author_type,content,structured_json,created_at)
      VALUES ('response-1','conversation-1','assistant','Структурированный ответ','{}','2026-07-31T00:00:01.000Z');
    INSERT INTO ai_runs(id,workspace_id,user_id,conversation_id,request_message_id,response_message_id,status,completed_at)
      VALUES ('run-1','workspace-1','user-1','conversation-1','request-1','response-1','completed','2026-07-31T00:00:02.000Z');
    INSERT INTO message_branches(id,conversation_id,workspace_id,owner_user_id,parent_branch_id,forked_from_message_id,request_message_id,response_message_id,operation,created_at)
      VALUES ('branch-1','conversation-1','workspace-1','user-1',NULL,NULL,'request-1','response-1','new','2026-07-31T00:00:03.000Z');
    INSERT INTO message_versions(id,conversation_id,branch_id,message_id,source_message_id,created_by_user_id,operation,version_number,content_sha256,created_at)
      VALUES ('version-1','conversation-1','branch-1','request-1',NULL,'user-1','new',1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-07-31T00:00:04.000Z');
  `);
}

class SqliteStatement {
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new SqliteStatement(this.sqlite, this.sql, values); }
  first<T>(): T | null { return (this.sqlite.prepare(this.sql).get(...this.bindings()) as T | undefined) ?? null; }
  all<T>() { return { results: this.sqlite.prepare(this.sql).all(...this.bindings()) as T[], success: true, meta: {} }; }
  run() { const result = this.sqlite.prepare(this.sql).run(...this.bindings()); return { results: [], success: true, meta: { changes: Number(result.changes) } }; }
  private bindings() { return this.values as Array<null | number | bigint | string>; }
}

function sqliteD1(sqlite: DatabaseSync): D1Database {
  return {
    prepare(sql: string) { return new SqliteStatement(sqlite, sql); },
  } as unknown as D1Database;
}
