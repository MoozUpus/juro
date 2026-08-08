import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("0105 uses D1-compatible lowercase hashes for Builder checkpoint data", async () => {
  const migration = await readFile(new URL("../drizzle/0105_d1_builder_version_hash_guards.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /zeroblob\(32\)/u);
  assert.match(migration, /builder_document_versions__0105/u);
  assert.match(migration, /builder_document_version_object_writes__0105/u);
  assert.match(migration, /builder_document_version_restore_events__0105_copy/u);
  assert.match(migration, /builder_document_versions_object_write_guard/u);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE hashes(a TEXT NOT NULL,b TEXT NOT NULL,c TEXT NOT NULL,CHECK(length(a)=64 AND a NOT GLOB '*[^0-9a-f]*' AND length(b)=64 AND b NOT GLOB '*[^0-9a-f]*' AND length(c)=64 AND c NOT GLOB '*[^0-9a-f]*'))");
    sqlite.prepare("INSERT INTO hashes(a,b,c) VALUES (?,?,?)").run("a".repeat(64), "b".repeat(64), "c".repeat(64));
    assert.throws(() => sqlite.prepare("INSERT INTO hashes(a,b,c) VALUES (?,?,?)").run("a".repeat(64), "B".repeat(64), "c".repeat(64)), /CHECK constraint failed/u);
    assert.throws(() => sqlite.prepare("INSERT INTO hashes(a,b,c) VALUES (?,?,?)").run("a".repeat(63), "b".repeat(64), "c".repeat(64)), /CHECK constraint failed/u);
  } finally { sqlite.close(); }
});
