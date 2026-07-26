import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

type JournalEntry = {
  idx: number;
  tag: string;
};

const drizzleRoot = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", drizzleRoot), "utf8"),
) as { entries: JournalEntry[] };
const phaseOneEntry = journal.entries.find(({ idx }) => idx === 11);

assert.ok(phaseOneEntry, "Drizzle journal must contain migration 0011");

function migrationSql(entry: JournalEntry): string {
  return readFileSync(new URL(`${entry.tag}.sql`, drizzleRoot), "utf8");
}

function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function applyMigration(db: DatabaseSync, entry: JournalEntry): void {
  for (const statement of statements(migrationSql(entry))) {
    db.exec(statement);
  }
}

function tableDefinitions(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string; sql: string }>;
  return new Map(rows.map(({ name, sql }) => [name, sql]));
}

const expectedTables = [
  "backup_runs",
  "cleanup_runs",
  "idempotency_keys",
  "job_outbox",
  "job_runs",
  "scheduled_locks",
  "scheduled_runs",
] as const;

test("0011 is additive and declares the durable foundation indexes", () => {
  const sql = migrationSql(phaseOneEntry);
  const migrationStatements = statements(sql);

  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX)\b/i,
      `unexpected non-additive statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }

  for (const indexName of [
    "idempotency_keys_expiry_idx",
    "job_outbox_idempotency_uidx",
    "job_outbox_status_idx",
    "job_outbox_lease_idx",
    "job_outbox_workspace_idx",
    "job_runs_idempotency_uidx",
    "job_runs_message_uidx",
    "job_runs_status_idx",
    "job_runs_lease_idx",
    "job_runs_workspace_idx",
    "scheduled_locks_expiry_idx",
    "scheduled_runs_idempotency_uidx",
  ]) {
    assert.match(sql, new RegExp(`\\\`${indexName}\\\``));
  }
});

test("0011 journal entry and schema snapshot agree", () => {
  assert.equal(phaseOneEntry.idx, 11);
  assert.match(phaseOneEntry.tag, /^0011_/);
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0011_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };

  for (const table of expectedTables) {
    assert.ok(snapshot.tables[table], `${table} missing from snapshot`);
  }
  assert.ok(
    snapshot.tables.job_outbox.indexes.job_outbox_lease_idx,
    "outbox lease index missing from snapshot",
  );
  assert.ok(
    snapshot.tables.job_runs.indexes.job_runs_idempotency_uidx,
    "job idempotency index missing from snapshot",
  );
});

test("all migrations apply cleanly with foreign-key integrity", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) {
      applyMigration(db, entry);
    }
    assert.deepEqual(
      db.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
    const tables = tableDefinitions(db);
    for (const table of expectedTables) {
      assert.ok(tables.has(table));
    }
  } finally {
    db.close();
  }
});

test("0011 preserves existing schema and workspace data", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx < 11)) {
      applyMigration(db, entry);
    }

    db.prepare(`
      INSERT INTO workspaces (
        id, type, name, locale, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "ws_phase1_sentinel",
      "business",
      "Phase 1 sentinel",
      "ru",
      "2026-07-26T00:00:00.000Z",
      "2026-07-26T00:00:00.000Z",
    );

    const before = tableDefinitions(db);
    applyMigration(db, phaseOneEntry);
    const after = tableDefinitions(db);

    assert.equal(after.size - before.size, expectedTables.length);
    for (const [name, definition] of before) {
      assert.equal(after.get(name), definition, `${name} definition changed`);
    }
    assert.equal(
      (
        db.prepare(
          "SELECT name FROM workspaces WHERE id = ?",
        ).get("ws_phase1_sentinel") as { name: string }
      ).name,
      "Phase 1 sentinel",
    );
    assert.deepEqual(
      db.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  } finally {
    db.close();
  }
});
