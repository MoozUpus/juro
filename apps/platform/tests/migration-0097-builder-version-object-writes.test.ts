import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const migration = readFileSync(new URL("../drizzle/0097_builder_document_version_object_writes.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }> };
const now = "2026-08-05T17:00:00.000Z";

test("migration 0097 is additive, content-free and journaled", () => {
  const entry = journal.entries.find((item) => item.tag === "0097_builder_document_version_object_writes");
  assert.deepEqual(entry, { idx: 97, version: "6", when: entry?.when, tag: "0097_builder_document_version_object_writes", breakpoints: true });
  assert.match(migration, /CREATE TABLE `builder_document_version_object_writes`/u);
  assert.match(migration, /ALTER TABLE `builder_document_versions` ADD COLUMN `object_write_id`/u);
  assert.match(migration, /builder_version_writes_attachment_guard/u);
  assert.match(migration, /builder_document_versions_projected_write_required/u);
  assert.doesNotMatch(migration, /`(?:answers_json|auto_content|final_content|document_text|raw_text)`/u);
  assert.doesNotMatch(migration, /`idempotency_key`/u);
});

test("0097 fences projected version identity and requires attached source evidence", () => {
  const { sqlite } = sqliteD1Fixture();
  const hash = "a".repeat(64);
  try {
    seed(sqlite);
    sqlite.prepare(
      `INSERT INTO builder_document_version_object_writes
       (id,workspace_id,owner_user_id,document_id,target_version,source_revision,target_revision,
        source,source_entity_id,r2_key,size_bytes,sha256,idempotency_key_sha256,status,
        version_id,attempt_count,last_error_code,created_at,updated_at,reconciled_at)
       VALUES ('write-a','workspace-a','user-a','document-a',1,1,2,'suggestion','proposal-a',
        'builder-document-versions/workspace-a/document-a/write-a-2-object.json',100,?,?,'pending',NULL,0,NULL,?,?,NULL)`,
    ).run(hash, "b".repeat(64), now, now);
    assert.throws(
      () => sqlite.prepare("UPDATE builder_document_version_object_writes SET document_id='other' WHERE id='write-a'").run(),
      /BUILDER_VERSION_WRITE_(?:IDENTITY_IMMUTABLE|TRANSITION_INVALID)/u,
    );
    assert.throws(
      () => sqlite.prepare(
        `INSERT INTO builder_document_versions
         (id,workspace_id,owner_user_id,document_id,version,document_revision,source,r2_key,size_bytes,sha256,idempotency_key_sha256,status,attempt_count,last_error_code,created_at,updated_at,object_write_id)
         VALUES ('version-a','workspace-a','user-a','document-a',1,1,'suggestion','builder-document-versions/a.json',100,?,?,'pending',0,NULL,?,?,NULL)`,
      ).run(hash, "c".repeat(64), now, now),
      /BUILDER_VERSION_WRITE_REQUIRED/u,
    );
    sqlite.prepare("UPDATE builder_document_version_object_writes SET status='attaching',last_error_code=NULL,updated_at=? WHERE id='write-a'").run(now);
    sqlite.prepare("UPDATE document_change_proposals SET owner_accepted=1,collaborator_accepted=1,status='applied',updated_at=? WHERE id='proposal-a'").run(now);
    sqlite.prepare("INSERT INTO document_revisions(id,document_id,revision,actor_user_id,source,changes_json,created_at) VALUES ('revision-a','document-a',2,'user-a','suggestion','{}',?)").run(now);
    sqlite.prepare("UPDATE documents SET revision=2,updated_at=? WHERE id='document-a'").run(now);
    sqlite.prepare(
      `INSERT INTO builder_document_versions
       (id,workspace_id,owner_user_id,document_id,version,document_revision,source,r2_key,size_bytes,sha256,idempotency_key_sha256,status,attempt_count,last_error_code,created_at,updated_at,object_write_id)
       VALUES ('version-a','workspace-a','user-a','document-a',1,2,'suggestion',
        'builder-document-versions/workspace-a/document-a/write-a-2-object.json',100,?,?,'pending',0,NULL,?,?,'write-a')`,
    ).run(hash, "b".repeat(64), now, now);
    sqlite.prepare("UPDATE builder_document_versions SET status='ready',last_error_code=NULL,updated_at=? WHERE id='version-a'").run(now);
    assert.deepEqual(
      { ...(sqlite.prepare("SELECT status,version_id AS versionId FROM builder_document_version_object_writes WHERE id='write-a'").get() as object) },
      { status: "attached", versionId: "version-a" },
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','a@example.invalid',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-a','workspace-a','user-a','owner','active',?,?,?)").run(now, now, now);
  sqlite.prepare("INSERT INTO document_templates(id,key,category,active,created_at,updated_at) VALUES ('template-a','template-a','contracts',1,?,?)").run(now, now);
  sqlite.prepare("INSERT INTO documents (id,workspace_id,owner_user_id,template_id,template_code,template_version,language,participant_mode,title,category,status,revision,created_at,updated_at) VALUES ('document-a','workspace-a','user-a','template-a','1234567','1','ru','configurable','Draft','contracts','Черновик',1,?,?)").run(now, now);
  sqlite.prepare("INSERT INTO document_answers(document_id,answers_json,updated_at) VALUES ('document-a','{}',?)").run(now);
  sqlite.prepare("INSERT INTO document_current_content(document_id,auto_content,final_content,manually_edited,updated_at) VALUES ('document-a','Original text','Original text',0,?)").run(now);
  sqlite.prepare("INSERT INTO document_change_proposals(id,document_id,author_user_id,old_text,new_text,owner_accepted,collaborator_accepted,status,created_at,updated_at) VALUES ('proposal-a','document-a','user-a','Original','Updated',1,0,'pending',?,?)").run(now, now);
}
