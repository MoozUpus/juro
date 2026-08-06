import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";
import { scheduleUserDocumentIndexStatements } from "../lib/document-analysis/user-document-vectors";

const now = "2026-08-06T05:00:00.000Z";
const hash = "a".repeat(64);

test("0101 is journaled and permits only an already-persisted source-version index intent", async () => {
  const migration = readFileSync(
    new URL("../drizzle/0101_document_index_persisting_schedule.sql", import.meta.url),
    "utf8",
  );
  const journal = JSON.parse(readFileSync(
    new URL("../drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  )) as { entries: Array<{ idx: number; tag: string; breakpoints: boolean }> };
  const entry = journal.entries.find(
    (item) => item.tag === "0101_document_index_persisting_schedule",
  );
  assert.equal(entry?.idx, 101);
  assert.equal(entry?.breakpoints, true);
  assert.match(migration, /analysis\.`status` IN \('persisting','completed'\)/u);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+`?(?:document_analyses|analysis_document_versions)`?/iu);

  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','user-a@example.test',?,?)")
      .run(now, now);
    sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?)")
      .run(now, now);
    sqlite.prepare("INSERT INTO document_files(id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at) VALUES ('file-a','workspace-a','user-a','analysis_safe','safe/workspace-a/analysis-a/file-a','source.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',1,?,?,?)")
      .run(hash, now, now);
    sqlite.prepare("INSERT INTO document_analyses(id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,consent_version,created_at,updated_at) VALUES ('analysis-a','workspace-a','user-a','file-a','persisting','{}','synthetic',?,?)")
      .run(now, now);
    sqlite.prepare("INSERT INTO analysis_document_versions(id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,file_name,mime_type,size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at) VALUES ('version-a','analysis-a','workspace-a','user-a',1,NULL,'extracted','analysis-versions/workspace-a/analysis-a/source.md','source.normalized-v1.md','text/markdown; charset=utf-8',1,?,NULL,NULL,'[]',NULL,?)")
      .run(hash, now);

    await d1.batch(scheduleUserDocumentIndexStatements(d1, {
      analysisId: "analysis-a",
      documentVersionId: "version-a",
      workspaceId: "workspace-a",
      ownerUserId: "user-a",
      sourceHash: hash,
      language: "ru",
      now,
    }));
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM user_document_index_jobs").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM job_outbox WHERE job_type='document.index'").get() as { count: number }).count, 1);
  } finally {
    sqlite.close();
  }
});
