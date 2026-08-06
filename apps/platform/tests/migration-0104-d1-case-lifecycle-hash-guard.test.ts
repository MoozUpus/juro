import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("0104 uses D1-compatible lowercase hashes without weakening the lifecycle ledger", async () => {
  const migration = await readFile(new URL("../drizzle/0104_d1_case_lifecycle_hash_guard.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /zeroblob\(32\)/u);
  assert.match(migration, /length\(`previous_hash`\)=64 AND `previous_hash` NOT GLOB '\*\[\^0-9a-f\]\*'/u);
  assert.match(migration, /length\(`event_hash`\)=64 AND `event_hash` NOT GLOB '\*\[\^0-9a-f\]\*'/u);
  assert.match(migration, /CREATE TRIGGER `case_lifecycle_insert_guard`/u);
  assert.match(migration, /CREATE TRIGGER `case_lifecycle_apply_projection`/u);
  assert.match(migration, /CREATE TRIGGER `case_lifecycle_events_no_update`/u);
  assert.match(migration, /CREATE TRIGGER `case_lifecycle_events_no_delete`/u);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE hashes(previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL, CHECK (length(previous_hash)=64 AND previous_hash NOT GLOB '*[^0-9a-f]*' AND length(event_hash)=64 AND event_hash NOT GLOB '*[^0-9a-f]*'))");
    sqlite.prepare("INSERT INTO hashes(previous_hash,event_hash) VALUES (?,?)").run("0".repeat(64), "a".repeat(64));
    assert.throws(
      () => sqlite.prepare("INSERT INTO hashes(previous_hash,event_hash) VALUES (?,?)").run("0".repeat(64), "A".repeat(64)),
      /CHECK constraint failed/u,
    );
    assert.throws(
      () => sqlite.prepare("INSERT INTO hashes(previous_hash,event_hash) VALUES (?,?)").run("0".repeat(63), "a".repeat(64)),
      /CHECK constraint failed/u,
    );
  } finally {
    sqlite.close();
  }
});
