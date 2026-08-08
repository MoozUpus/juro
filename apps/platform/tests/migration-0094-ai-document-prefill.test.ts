import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const migration = readFileSync(new URL("../drizzle/0094_ai_document_prefill_handoffs.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

test("migration 0094 is additive, D1-compatible and intentionally cascade-deletable", () => {
  const entry = journal.entries.find((item) => item.tag === "0094_ai_document_prefill_handoffs");
  assert.deepEqual(entry, {
    idx: 94,
    version: "6",
    when: entry?.when,
    tag: "0094_ai_document_prefill_handoffs",
    breakpoints: true,
  });
  assert.match(migration, /CREATE TABLE `ai_document_prefill_handoffs`/);
  assert.match(migration, /idempotency_key_sha256/);
  assert.match(migration, /BEFORE INSERT[\s\S]+WHEN NOT EXISTS/);
  assert.match(migration, /ON DELETE cascade/);
  assert.doesNotMatch(migration, /SELECT CASE/u);
  assert.doesNotMatch(migration, /immutable_delete/u);
  assert.doesNotMatch(migration, /`idempotency_key`/u);
  const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
  assert.ok(statements.every((statement) => /^(?:--[^\n]*\n)*(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX|CREATE TRIGGER)/u.test(statement)));
});

test("all migrations through 0094 apply with no foreign-key violations", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    const columns = sqlite.prepare("PRAGMA table_info(ai_document_prefill_handoffs)").all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === "idempotency_key_sha256"));
    assert.ok(!columns.some((column) => column.name === "idempotency_key"));
  } finally { sqlite.close(); }
});
