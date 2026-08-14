import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function insertTerminalJob(
  sqlite: DatabaseSync,
  input: { id: string; errorCode: string },
): void {
  const correlationId = `${input.id}:correlation`;
  const idempotencyKey = `${input.id}:idempotency`;
  sqlite.prepare(`
    INSERT INTO job_runs (
      id,queue_name,job_type,subject_id,workspace_id,correlation_id,
      idempotency_key,error_code,attempt,status,lease_expires_at
    ) VALUES (?,'staging-document-export','document.export','export:claim-race',NULL,?,?,?,3,'dead_lettered',NULL)
  `).run(input.id, correlationId, idempotencyKey, input.errorCode);
  sqlite.prepare(`
    INSERT INTO job_outbox (
      id,idempotency_key,status,job_type,subject_id,workspace_id,
      correlation_id,dispatched_at
    ) VALUES (?,?,'dispatched','document.export','export:claim-race',NULL,?,?)
  `).run(`${input.id}:outbox`, idempotencyKey, correlationId, "2026-08-12T00:00:00.000Z");
}

function insertRedriveEvent(sqlite: DatabaseSync, id: string): void {
  sqlite.prepare(`
    INSERT INTO operational_job_redrive_events (
      id,environment,source_job_id,outbox_id,previous_job_status,
      previous_outbox_status,previous_error_code,previous_attempt,
      previous_dispatched_at,created_at
    ) VALUES (?,'staging',?,?,'dead_lettered','dispatched',?,3,?,?)
  `).run(
    `${id}:event`,
    id,
    `${id}:outbox`,
    (sqlite.prepare("SELECT error_code AS errorCode FROM job_runs WHERE id=?").get(id) as { errorCode: string }).errorCode,
    "2026-08-12T00:00:00.000Z",
    "2026-08-12T00:00:00.000Z",
  );
}

test("0114 replaces only the redrive guard and permits an auditable export claim-race replay", async () => {
  const migration = await readFile(
    new URL("../drizzle/0114_document_export_redrive_parity.sql", import.meta.url),
    "utf8",
  );
  const migrationStatements = statements(migration);
  assert.equal(migrationStatements.length, 2);
  assert.match(migrationStatements[0], /(?:^|\n)DROP TRIGGER IF EXISTS `operational_job_redrive_projection_guard`;$/u);
  assert.match(migrationStatements[1], /^CREATE TRIGGER `operational_job_redrive_projection_guard`/u);
  assert.match(migration, /'DOCUMENT_EXPORT_NOT_READY'/u);
  assert.doesNotMatch(migration, /\b(?:CREATE TABLE|ALTER TABLE|INSERT\s+INTO|UPDATE\s+`|DELETE\s+FROM)\b/iu);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE job_runs (
        id TEXT PRIMARY KEY,queue_name TEXT NOT NULL,job_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,workspace_id TEXT,correlation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,error_code TEXT,attempt INTEGER NOT NULL,
        status TEXT NOT NULL,lease_expires_at TEXT
      );
      CREATE TABLE job_outbox (
        id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL,status TEXT NOT NULL,
        job_type TEXT NOT NULL,subject_id TEXT NOT NULL,workspace_id TEXT,
        correlation_id TEXT NOT NULL,dispatched_at TEXT
      );
      CREATE TABLE operational_job_redrive_events (
        id TEXT PRIMARY KEY,environment TEXT NOT NULL,source_job_id TEXT NOT NULL,
        outbox_id TEXT NOT NULL,previous_job_status TEXT NOT NULL,
        previous_outbox_status TEXT NOT NULL,previous_error_code TEXT,
        previous_attempt INTEGER NOT NULL,previous_dispatched_at TEXT,created_at TEXT NOT NULL
      );
      CREATE TRIGGER operational_job_redrive_projection_guard
      BEFORE INSERT ON operational_job_redrive_events
      BEGIN SELECT RAISE(ABORT, 'STALE_GUARD'); END;
    `);
    for (const statement of migrationStatements) sqlite.exec(statement);

    insertTerminalJob(sqlite, {
      id: "export-claim-race",
      errorCode: "DOCUMENT_EXPORT_NOT_READY",
    });
    insertRedriveEvent(sqlite, "export-claim-race");
    assert.equal(
      (sqlite.prepare("SELECT COUNT(*) AS count FROM operational_job_redrive_events").get() as { count: number }).count,
      1,
    );

    insertTerminalJob(sqlite, {
      id: "export-permanent",
      errorCode: "DOCUMENT_EXPORT_INVALID_SOURCE",
    });
    assert.throws(
      () => insertRedriveEvent(sqlite, "export-permanent"),
      /OPERATIONAL_JOB_REDRIVE_NOT_ALLOWED/u,
    );
  } finally {
    sqlite.close();
  }
});
