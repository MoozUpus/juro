import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const migration = readFileSync(new URL("../drizzle/0095_builder_document_analysis_handoffs.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

test("migration 0095 is additive, D1-compatible and stores no document text or raw idempotency key", () => {
  const entry = journal.entries.find((item) => item.tag === "0095_builder_document_analysis_handoffs");
  assert.deepEqual(entry, {
    idx: 95,
    version: "6",
    when: entry?.when,
    tag: "0095_builder_document_analysis_handoffs",
    breakpoints: true,
  });
  assert.match(migration, /CREATE TABLE `builder_document_analysis_handoffs`/u);
  assert.match(migration, /idempotency_key_sha256/u);
  assert.match(migration, /builder_analysis_handoff_insert_guard/u);
  assert.match(migration, /builder_analysis_handoff_transition_guard/u);
  assert.match(migration, /ON DELETE cascade/u);
  assert.doesNotMatch(migration, /`idempotency_key`/u);
  assert.doesNotMatch(migration.split("--> statement-breakpoint", 1)[0], /`(?:final_content|document_text|raw_text)`/u);
  const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
  assert.ok(statements.every((statement) => /^(?:--[^\n]*\n)*(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX|CREATE TRIGGER)/u.test(statement)));
});

test("all migrations through 0095 apply with a guarded handoff lifecycle and no foreign-key violations", () => {
  const { sqlite } = sqliteD1Fixture();
  const now = "2026-08-05T12:00:00.000Z";
  const hash = "a".repeat(64);
  try {
    seedBuilderDocument(sqlite, now);
    sqlite.prepare(
      `INSERT INTO document_files
       (id,workspace_id,document_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
       VALUES ('file-a','workspace-a','document-a','user-a','analysis_snapshot_pending','snapshots/a','draft.md','text/markdown; charset=utf-8',64,?,?,?)`,
    ).run(hash, now, now);
    sqlite.prepare(
      `INSERT INTO document_analyses
       (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,consent_version,created_at,updated_at)
       VALUES ('analysis-a','workspace-a','user-a','file-a','initiated','{}','2026-08-05',?,?)`,
    ).run(now, now);
    sqlite.prepare(
      `INSERT INTO builder_document_analysis_handoffs
       (id,workspace_id,user_id,document_id,document_revision,document_content_sha256,file_id,analysis_id,mode,locale,idempotency_key_sha256,status,attempt_count,created_at,updated_at)
       VALUES ('handoff-a','workspace-a','user-a','document-a',1,?,'file-a','analysis-a','quick','ru',?,'pending',0,?,?)`,
    ).run(hash, "b".repeat(64), now, now);

    assert.throws(
      () => sqlite.prepare("UPDATE builder_document_analysis_handoffs SET workspace_id='workspace-b' WHERE id='handoff-a'").run(),
      /BUILDER_ANALYSIS_HANDOFF_(?:IMMUTABLE|TRANSITION_INVALID)/u,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE builder_document_analysis_handoffs SET status='ready' WHERE id='handoff-a'").run(),
      /BUILDER_ANALYSIS_HANDOFF_TRANSITION_INVALID/u,
    );
    sqlite.prepare("UPDATE builder_document_analysis_handoffs SET attempt_count=1,last_error_code='R2_FAILED',updated_at=? WHERE id='handoff-a'").run(now);
    sqlite.prepare("UPDATE document_files SET kind='analysis_safe' WHERE id='file-a'").run();
    sqlite.prepare("UPDATE document_analyses SET status='ready' WHERE id='analysis-a'").run();
    sqlite.prepare(
      `INSERT INTO job_outbox
       (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,correlation_id,enqueued_at,available_at,status,dispatch_attempts,created_at,updated_at)
       VALUES ('job-a','DOCUMENT_ANALYSIS_QUEUE','document.analyze',1,'job-a-key','analysis-a','workspace-a','corr-a',?,?,'pending',0,?,?)`,
    ).run(now, now, now, now);
    sqlite.prepare("UPDATE builder_document_analysis_handoffs SET status='ready',last_error_code=NULL,updated_at=? WHERE id='handoff-a'").run(now);
    assert.equal((sqlite.prepare("SELECT status FROM builder_document_analysis_handoffs WHERE id='handoff-a'").get() as { status: string }).status, "ready");
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    const columns = sqlite.prepare("PRAGMA table_info(builder_document_analysis_handoffs)").all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === "idempotency_key_sha256"));
    assert.ok(!columns.some((column) => column.name === "idempotency_key"));
  } finally { sqlite.close(); }
});

function seedBuilderDocument(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], now: string) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','a@example.invalid',?,?),('user-b','b@example.invalid',?,?)")
    .run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?),('workspace-b','individual','B',?,?)")
    .run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-a','workspace-a','user-a','owner','active',?,?,?),('member-b','workspace-b','user-b','owner','active',?,?,?)")
    .run(now, now, now, now, now, now);
  sqlite.prepare("INSERT INTO document_templates(id,key,category,active,created_at,updated_at) VALUES ('template-a','template-a','contracts',1,?,?)")
    .run(now, now);
  sqlite.prepare(
    `INSERT INTO documents
     (id,workspace_id,owner_user_id,template_id,template_code,template_version,language,participant_mode,title,category,status,revision,created_at,updated_at)
     VALUES ('document-a','workspace-a','user-a','template-a','template-a',1,'ru','configurable','Draft','contracts','Черновик',1,?,?)`,
  ).run(now, now);
  sqlite.prepare("INSERT INTO document_current_content(document_id,auto_content,final_content,manually_edited,updated_at) VALUES ('document-a','Synthetic legal document content long enough.','Synthetic legal document content long enough.',0,?)")
    .run(now);
}
