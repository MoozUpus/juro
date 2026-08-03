import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE user_profiles (id TEXT PRIMARY KEY);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    CREATE TABLE conversation_messages (id TEXT PRIMARY KEY);
  `);
  const sql = readFileSync(new URL("../drizzle/0062_nervous_shinko_yamashiro.sql", import.meta.url), "utf8");
  for (const statement of statements(sql)) db.exec(statement);
  db.prepare("INSERT INTO user_profiles(id) VALUES (?)").run("user-1");
  db.prepare("INSERT INTO workspaces(id) VALUES (?)").run("workspace-1");
  db.prepare("INSERT INTO workspaces(id) VALUES (?)").run("workspace-2");
  return db;
}

test("0062 is additive and creates the encrypted memory boundary", () => {
  const sql = readFileSync(new URL("../drizzle/0062_nervous_shinko_yamashiro.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
  for (const table of ["user_memory_settings", "user_memories", "memory_sources"]) {
    assert.match(sql, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(sql, /ciphertext/);
  assert.match(sql, /key_version/);
  assert.match(sql, /content_sha256/);
  assert.match(sql, /user_memories_scope_key_check/);
  assert.match(sql, /ON DELETE cascade/);
});

test("0062 enforces scope, category, source, hash and tenant lifecycle constraints", () => {
  const db = database();
  try {
    const now = "2026-08-03T00:00:00.000Z";
    db.prepare("INSERT INTO user_memory_settings(user_id,automatic_enabled,created_at,updated_at) VALUES (?,?,?,?)")
      .run("user-1", 1, now, now);
    const insert = (id: string, workspaceId: string | null, scope: string, scopeKey: string, category = "company", hash = "a".repeat(64)) => db.prepare(`
      INSERT INTO user_memories(
        id,user_id,workspace_id,scope,scope_key,category,ciphertext,iv,key_version,
        content_sha256,source_kind,status,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,'manual','active',?,?)
    `).run(id, "user-1", workspaceId, scope, scopeKey, category, "encrypted", "iv", "v1", hash, now, now);

    insert("global", null, "global", "global", "answer_style");
    insert("scoped", "workspace-1", "workspace", "workspace:workspace-1");
    db.prepare("INSERT INTO memory_sources(id,memory_id,source_type,created_at) VALUES (?,?,?,?)")
      .run("source-1", "scoped", "manual", now);
    assert.throws(() => insert("bad-scope", null, "workspace", "global"), /CHECK constraint/);
    assert.throws(() => insert("bad-category", null, "global", "global", "medical"), /CHECK constraint/);
    assert.throws(() => insert("bad-hash", null, "global", "global", "company", "short"), /CHECK constraint/);
    assert.throws(
      () => db.prepare("INSERT INTO memory_sources(id,memory_id,source_type,created_at) VALUES (?,?,?,?)")
        .run("source-bad", "scoped", "provider", now),
      /CHECK constraint/,
    );
    assert.throws(() => insert("duplicate", null, "global", "global", "company", "a".repeat(64)), /UNIQUE/);

    const deletionHash = "b".repeat(64);
    insert("deleted-copy-1", "workspace-2", "workspace", "workspace:workspace-2", "company", deletionHash);
    db.prepare("UPDATE user_memories SET status='deleted',deleted_at=? WHERE id='deleted-copy-1'").run(now);
    insert("deleted-copy-2", "workspace-2", "workspace", "workspace:workspace-2", "company", deletionHash);
    db.prepare("UPDATE user_memories SET status='deleted',deleted_at=? WHERE id='deleted-copy-2'").run(now);
    insert("active-copy", "workspace-2", "workspace", "workspace:workspace-2", "company", deletionHash);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_memories WHERE workspace_id='workspace-2' AND status='deleted'").get()?.count, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_memories WHERE workspace_id='workspace-2' AND status='active'").get()?.count, 1);
    db.prepare("DELETE FROM workspaces WHERE id='workspace-2'").run();

    db.prepare("DELETE FROM workspaces WHERE id='workspace-1'").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_memories WHERE id='scoped'").get()?.count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM memory_sources WHERE id='source-1'").get()?.count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_memories WHERE id='global'").get()?.count, 1);
    db.prepare("DELETE FROM user_profiles WHERE id='user-1'").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_memories").get()?.count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_memory_settings").get()?.count, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
