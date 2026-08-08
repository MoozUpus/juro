import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const migration = readFileSync(new URL("../drizzle/0096_builder_document_versions.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }> };
const now = "2026-08-05T14:00:00.000Z";

test("migration 0096 is additive, metadata-only and journaled", () => {
  const entry = journal.entries.find((item) => item.tag === "0096_builder_document_versions");
  assert.deepEqual(entry, { idx: 96, version: "6", when: entry?.when, tag: "0096_builder_document_versions", breakpoints: true });
  assert.match(migration, /CREATE TABLE `builder_document_versions`/u);
  assert.match(migration, /CREATE TABLE `builder_document_version_restore_events`/u);
  assert.match(migration, /builder_document_versions_insert_guard/u);
  assert.match(migration, /builder_document_version_restore_insert_guard/u);
  assert.match(migration, /idempotency_key_sha256/u);
  assert.doesNotMatch(migration, /`(?:answers_json|auto_content|final_content|document_text|raw_text)`/u);
  assert.doesNotMatch(migration, /`idempotency_key`/u);
});

test("0096 guards tenant identity, object lifecycle and append-only restore evidence", () => {
  const { sqlite } = sqliteD1Fixture();
  const hash = "a".repeat(64);
  try {
    seed(sqlite);
    sqlite.prepare(
      `INSERT INTO builder_document_versions
       (id,workspace_id,owner_user_id,document_id,version,document_revision,source,r2_key,size_bytes,sha256,idempotency_key_sha256,status,attempt_count,last_error_code,created_at,updated_at)
       VALUES ('version-a','workspace-a','user-a','document-a',1,1,'user_checkpoint','builder-document-versions/workspace-a/document-a/version-a.json',100,?,?,'pending',0,NULL,?,?)`,
    ).run(hash, "b".repeat(64), now, now);
    assert.throws(() => sqlite.prepare("UPDATE builder_document_versions SET workspace_id='workspace-b' WHERE id='version-a'").run(), /BUILDER_DOCUMENT_VERSION_(?:IMMUTABLE|TRANSITION_INVALID)/u);
    sqlite.prepare("UPDATE builder_document_versions SET status='ready',last_error_code=NULL,updated_at=? WHERE id='version-a'").run(now);
    sqlite.prepare(
      `INSERT INTO builder_document_version_restore_events
       (id,workspace_id,owner_user_id,document_id,source_version_id,from_revision,to_revision,content_sha256,idempotency_key_sha256,created_at)
       VALUES ('restore-a','workspace-a','user-a','document-a','version-a',1,2,?,?,?)`,
    ).run(hash, "c".repeat(64), now);
    assert.throws(() => sqlite.prepare("UPDATE builder_document_version_restore_events SET to_revision=3 WHERE id='restore-a'").run(), /BUILDER_DOCUMENT_RESTORE_IMMUTABLE/u);
    assert.throws(
      () => sqlite.prepare(
        `INSERT INTO builder_document_versions
         (id,workspace_id,owner_user_id,document_id,version,document_revision,source,r2_key,size_bytes,sha256,idempotency_key_sha256,status,attempt_count,last_error_code,created_at,updated_at)
         VALUES ('foreign','workspace-b','user-b','document-a',2,1,'user_checkpoint','builder-document-versions/workspace-b/document-a/foreign.json',100,?,?,'pending',0,NULL,?,?)`,
      ).run(hash, "d".repeat(64), now, now),
      /BUILDER_DOCUMENT_VERSION_CONFLICT/u,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','a@example.invalid',?,?),('user-b','b@example.invalid',?,?)").run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?),('workspace-b','individual','B',?,?)").run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-a','workspace-a','user-a','owner','active',?,?,?),('member-b','workspace-b','user-b','owner','active',?,?,?)").run(now, now, now, now, now, now);
  sqlite.prepare("INSERT INTO document_templates(id,key,category,active,created_at,updated_at) VALUES ('template-a','template-a','contracts',1,?,?)").run(now, now);
  sqlite.prepare(`INSERT INTO documents (id,workspace_id,owner_user_id,template_id,template_code,template_version,language,participant_mode,title,category,status,revision,created_at,updated_at) VALUES ('document-a','workspace-a','user-a','template-a','1234567','1','ru','configurable','Draft','contracts','Черновик',1,?,?)`).run(now, now);
  sqlite.prepare("INSERT INTO document_answers(document_id,answers_json,updated_at) VALUES ('document-a','{}',?)").run(now);
  sqlite.prepare("INSERT INTO document_current_content(document_id,auto_content,final_content,manually_edited,updated_at) VALUES ('document-a','Original text','Original text',0,?)").run(now);
}
