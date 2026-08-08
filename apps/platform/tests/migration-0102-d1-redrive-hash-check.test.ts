import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("0102 replaces D1-incompatible exact GLOB hashes with a strict simple hash guard", async () => {
  const migration = await readFile(new URL("../drizzle/0102_d1_redrive_hash_check.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /zeroblob\(32\)/u);
  assert.match(migration, /length\(`event_hash`\)=64 AND `event_hash` NOT GLOB '\*\[\^A-F0-9\]\*'/u);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE hashes(value TEXT NOT NULL CHECK (length(value)=64 AND value NOT GLOB '*[^A-F0-9]*'))");
    sqlite.prepare("INSERT INTO hashes(value) VALUES (?)").run("A".repeat(64));
    assert.throws(() => sqlite.prepare("INSERT INTO hashes(value) VALUES (?)").run("A".repeat(63)), /CHECK constraint failed/u);
    assert.throws(() => sqlite.prepare("INSERT INTO hashes(value) VALUES (?)").run(`${"A".repeat(63)}g`), /CHECK constraint failed/u);
  } finally {
    sqlite.close();
  }
});
