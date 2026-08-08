import assert from "node:assert/strict";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("0042 fences OCR extraction tenant identity, lifecycle, and completion evidence", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    const now = "2026-07-31T02:00:00.000Z";
    sqlite.prepare(
      "INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?),(?,?,?,?)",
    ).run("ocr-user-a", "ocr-a@example.test", now, now, "ocr-user-b", "ocr-b@example.test", now, now);
    sqlite.prepare(
      "INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?),(?,?,?,?,?)",
    ).run("ocr-workspace-a", "individual", "A", now, now, "ocr-workspace-b", "individual", "B", now, now);
    sqlite.prepare(
      `INSERT INTO document_files
       (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
       VALUES ('ocr-file-a','ocr-workspace-a','ocr-user-a','analysis_safe','safe/ocr/a',
        'scan.png','image/png',16,?,?,?)`,
    ).run("a".repeat(64), now, now);
    sqlite.prepare(
      `INSERT INTO document_analyses
       (id,workspace_id,owner_user_id,uploaded_file_id,status,consent_version,created_at,updated_at)
       VALUES ('ocr-analysis-a','ocr-workspace-a','ocr-user-a','ocr-file-a','awaiting_ocr','2026-07-31',?,?)`,
    ).run(now, now);
    const insert = sqlite.prepare(
      `INSERT INTO file_extractions
       (id,analysis_id,file_id,workspace_id,owner_user_id,status,method,provider,model,
        source_sha256,warnings_json,created_at,updated_at)
       VALUES (?,?,?,?,?,'queued','workers_ai_markdown','cloudflare_workers_ai','to-markdown',?,'[]',?,?)`,
    );
    insert.run(
      "ocr-extraction-a",
      "ocr-analysis-a",
      "ocr-file-a",
      "ocr-workspace-a",
      "ocr-user-a",
      "a".repeat(64),
      now,
      now,
    );

    assert.throws(
      () => insert.run(
        "ocr-extraction-cross-tenant",
        "ocr-analysis-a",
        "ocr-file-a",
        "ocr-workspace-b",
        "ocr-user-b",
        "a".repeat(64),
        now,
        now,
      ),
      /file_extraction_source_mismatch/,
    );
    assert.throws(
      () => sqlite.prepare(
        "UPDATE file_extractions SET owner_user_id='ocr-user-b' WHERE id='ocr-extraction-a'",
      ).run(),
      /file_extraction_identity_immutable/,
    );

    sqlite.prepare(
      "UPDATE file_extractions SET status='processing' WHERE id='ocr-extraction-a'",
    ).run();
    assert.throws(
      () => sqlite.prepare(
        "UPDATE file_extractions SET status='completed' WHERE id='ocr-extraction-a'",
      ).run(),
      /file_extraction_completion_invalid/,
    );
    sqlite.prepare(
      `UPDATE file_extractions SET status='completed',r2_key='derivatives/ocr/a.json',
       text_sha256=?,size_bytes=128,token_estimate=32,detected_mime_type='image/png',
       detected_language='ru',text_quality='limited',completed_at=?,updated_at=?
       WHERE id='ocr-extraction-a'`,
    ).run("b".repeat(64), now, now);
    assert.throws(
      () => sqlite.prepare(
        `UPDATE file_extractions SET warnings_json='["changed"]' WHERE id='ocr-extraction-a'`,
      ).run(),
      /file_extraction_completed_immutable/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});
