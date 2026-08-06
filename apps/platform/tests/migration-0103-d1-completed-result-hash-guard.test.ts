import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("0103 preserves strict lowercase result hashes without D1-incompatible GLOB expansion", async () => {
  const migration = await readFile(new URL("../drizzle/0103_d1_completed_result_hash_guard.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /zeroblob\(32\)/u);
  assert.match(migration, /length\(NEW\.`result_sha256`\)<>64/u);
  assert.match(migration, /NEW\.`result_sha256` GLOB '\*\[\^0-9a-f\]\*'/u);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE results(value TEXT NOT NULL CHECK (length(value)=64 AND value NOT GLOB '*[^0-9a-f]*'))");
    sqlite.prepare("INSERT INTO results(value) VALUES (?)").run("a".repeat(64));
    assert.throws(() => sqlite.prepare("INSERT INTO results(value) VALUES (?)").run("A".repeat(64)), /CHECK constraint failed/u);
    assert.throws(() => sqlite.prepare("INSERT INTO results(value) VALUES (?)").run("a".repeat(63)), /CHECK constraint failed/u);
  } finally {
    sqlite.close();
  }
});
