import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

test("0067 is expand-only and adds auditable deadline evidence", () => {
  const sql = readFileSync(new URL("../drizzle/0067_deadline_calculation_evidence.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
  for (const column of [
    "deadline_source_date",
    "deadline_days_count",
    "deadline_include_source_date",
    "deadline_roll_rule",
    "holiday_calendar_version",
    "safe_due_at",
    "calculation_method",
    "deadline_legal_basis",
    "deadline_evidence_json",
    "deadline_confidence",
  ]) assert.match(sql, new RegExp(column));
  assert.match(sql, /unverified.+preliminary.+source_verified/);
});

test("0067 preserves existing rows and rejects invalid evidence bounds", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE action_plan_steps(id text primary key, due_at text, deadline_type text not null default 'calendar_days');
      CREATE TABLE tasks(id text primary key, source_date text, due_at text, safe_due_at text, calculation_method text, deadline_type text not null default 'calendar_days', legal_basis text);
      INSERT INTO action_plan_steps(id,due_at) VALUES ('step','2026-08-20');
      INSERT INTO tasks(id,due_at) VALUES ('task','2026-08-20');
    `);
    const sql = readFileSync(new URL("../drizzle/0067_deadline_calculation_evidence.sql", import.meta.url), "utf8");
    for (const statement of statements(sql)) db.exec(statement);

    const step = db.prepare("SELECT due_at AS dueAt,deadline_confidence AS confidence FROM action_plan_steps WHERE id='step'").get() as { dueAt: string; confidence: string };
    assert.equal(step.dueAt, "2026-08-20");
    assert.equal(step.confidence, "unverified");
    assert.throws(() => db.prepare("UPDATE action_plan_steps SET deadline_days_count=3651 WHERE id='step'").run(), /CHECK constraint/);
    assert.throws(() => db.prepare("UPDATE tasks SET deadline_include_source_date=2 WHERE id='task'").run(), /CHECK constraint/);
    assert.throws(() => db.prepare("UPDATE tasks SET deadline_confidence='verified_by_ai' WHERE id='task'").run(), /CHECK constraint/);
  } finally {
    db.close();
  }
});
