import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

test("0064 is additive and keeps guest legal content encrypted and short-lived", () => {
  const sql = readFileSync(new URL("../drizzle/0064_guest_ai_sessions.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
  assert.match(sql, /CREATE TABLE `guest_ai_sessions`/);
  assert.match(sql, /CREATE TABLE `guest_ai_runs`/);
  assert.match(sql, /request_ciphertext/);
  assert.match(sql, /result_ciphertext/);
  assert.doesNotMatch(sql, /`(?:question|answer|content)`\s+text/i);
  assert.match(sql, /ON DELETE cascade/);
  assert.match(sql, /answer_count.+BETWEEN 0 AND 1/);
});

test("0064 enforces one answer, bounded requests, encrypted fields, and cascade purge", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const sql = readFileSync(new URL("../drizzle/0064_guest_ai_sessions.sql", import.meta.url), "utf8");
    for (const statement of statements(sql)) db.exec(statement);
    const now = "2026-08-03T00:00:00.000Z";
    const expiry = "2026-08-04T00:00:00.000Z";
    db.prepare(`INSERT INTO guest_ai_sessions(
      id,token_hmac,token_key_version,ip_hmac,locale,state,request_count,
      answer_count,expires_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,'available',0,0,?,?,?)`).run(
      "session-1", "token-hmac", "v1", "ip-hmac", "ru", expiry, now, now,
    );
    assert.throws(
      () => db.prepare("UPDATE guest_ai_sessions SET answer_count=2 WHERE id='session-1'").run(),
      /CHECK constraint/,
    );
    db.prepare(`INSERT INTO guest_ai_runs(
      id,session_id,idempotency_key,request_hash,correlation_id,provider,model,
      status,request_ciphertext,request_iv,request_key_version,
      legal_database_as_of,instruction_hash,source_version_hash,expires_at,
      started_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,'processing',?,?,?,?,?,?,?,?,?,?)`).run(
      "run-1", "session-1", "guest-request-1", "a".repeat(64), "correlation-1",
      "openai", "synthetic", "encrypted-question", "iv", "v1", now,
      "b".repeat(64), "c".repeat(64), expiry, now, now, now,
    );
    db.prepare("DELETE FROM guest_ai_sessions WHERE id='session-1'").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM guest_ai_runs").get()?.count, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
