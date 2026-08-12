import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const drizzleRoot = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", drizzleRoot), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };
const migration = journal.entries.find(({ idx }) => idx === 115);

test("0115 terminalizes only unfinishable capacity states and preserves source rows", () => {
  assert.ok(migration);
  assert.equal(migration.tag, "0115_document_analysis_capacity_terminalization");
  const sql = readFileSync(new URL(`${migration.tag}.sql`, drizzleRoot), "utf8");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE document_analyses (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        uploaded_file_id TEXT NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE document_files (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        r2_key TEXT NOT NULL
      );
      CREATE TABLE workspace_audit_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_user_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        action TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO document_files VALUES
        ('file-external','workspace-a','safe/workspace-a/external'),
        ('file-chunked','workspace-a','safe/workspace-a/chunked'),
        ('file-ready','workspace-a','safe/workspace-a/ready');
      INSERT INTO document_analyses VALUES
        ('analysis-external','workspace-a','user-a','file-external','awaiting_external_extraction',NULL,'2026-08-12T00:00:00.000Z'),
        ('analysis-chunked','workspace-a','user-a','file-chunked','awaiting_chunked_analysis','OLD','2026-08-12T00:00:00.000Z'),
        ('analysis-ready','workspace-a','user-a','file-ready','ready',NULL,'2026-08-12T00:00:00.000Z');
    `);
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) db.exec(statement);

    const analyses = db.prepare("SELECT id,status,error_code AS errorCode FROM document_analyses ORDER BY id").all() as Array<{ id: string; status: string; errorCode: string | null }>;
    assert.deepEqual(analyses.map((row) => ({ ...row })), [
      { id: "analysis-chunked", status: "failed", errorCode: "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED" },
      { id: "analysis-external", status: "failed", errorCode: "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED" },
      { id: "analysis-ready", status: "ready", errorCode: null },
    ]);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM document_files").get() as { count: number }).count, 3);
    const events = db.prepare("SELECT entity_id AS entityId,action,metadata_json AS metadataJson FROM workspace_audit_events ORDER BY entity_id").all() as Array<{ entityId: string; action: string; metadataJson: string }>;
    assert.deepEqual(events.map(({ entityId, action }) => ({ entityId, action })), [
      { entityId: "analysis-chunked", action: "analysis_capacity_terminalized" },
      { entityId: "analysis-external", action: "analysis_capacity_terminalized" },
    ]);
    assert.equal(JSON.parse(events[0]!.metadataJson).fromStatus, "awaiting_chunked_analysis");
    assert.equal(JSON.parse(events[1]!.metadataJson).fromStatus, "awaiting_external_extraction");

    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) db.exec(statement);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM workspace_audit_events").get() as { count: number }).count, 2);
  } finally {
    db.close();
  }
});
