import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

test("0066 is additive, tenant-scoped, encrypted, and retention-bounded", () => {
  const sql = readFileSync(new URL("../drizzle/0066_voice_recordings.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
  assert.match(sql, /CREATE TABLE `voice_recordings`/);
  assert.match(sql, /workspace_id/);
  assert.match(sql, /user_id/);
  assert.match(sql, /transcript_ciphertext/);
  assert.doesNotMatch(sql, /`transcript`\s+text/i);
  assert.match(sql, /size_bytes.+26214400/);
  assert.match(sql, /duration_ms.+300000/);
  assert.match(sql, /voice_recordings_retention_idx/);
});

test("0066 rejects oversized, overlong, plaintext-incomplete, and cross-FK records", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("CREATE TABLE workspaces(id text primary key); CREATE TABLE user_profiles(id text primary key); CREATE TABLE conversations(id text primary key); CREATE TABLE cases(id text primary key); CREATE TABLE conversation_messages(id text primary key);");
    db.exec("INSERT INTO workspaces VALUES ('w'); INSERT INTO user_profiles VALUES ('u')");
    const sql = readFileSync(new URL("../drizzle/0066_voice_recordings.sql", import.meta.url), "utf8");
    for (const statement of statements(sql)) db.exec(statement);
    const insert = db.prepare(`INSERT INTO voice_recordings(
      id,workspace_id,user_id,idempotency_key,request_hash,object_key,quarantine_key,
      mime_type,size_bytes,duration_ms,sha256,locale,status,expires_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const base = ["id","w","u","request-key","a".repeat(64),"voice/w/id/original.webm","voice/w/id/upload.webm","audio/webm",8,10_000,"b".repeat(64),"ru","initiated","2026-09-03T00:00:00.000Z","2026-08-04T00:00:00.000Z","2026-08-04T00:00:00.000Z"];
    insert.run(...base);
    assert.throws(() => insert.run(...base.map((value, index) => index === 0 ? "oversized" : index === 8 ? 26214401 : value)), /CHECK constraint/);
    assert.throws(() => insert.run(...base.map((value, index) => index === 0 ? "overlong" : index === 9 ? 300001 : value)), /CHECK constraint/);
    assert.throws(() => db.prepare("UPDATE voice_recordings SET status='transcribed' WHERE id='id'").run(), /CHECK constraint/);
    assert.throws(() => insert.run(...base.map((value, index) => {
      if (index === 0) return "foreign";
      if (index === 1) return "other-workspace";
      if (index === 3) return "foreign-request-key";
      if (index === 5) return "voice/w/foreign/original.webm";
      if (index === 6) return "voice/w/foreign/upload.webm";
      return value;
    })), /FOREIGN KEY constraint/);
  } finally {
    db.close();
  }
});
