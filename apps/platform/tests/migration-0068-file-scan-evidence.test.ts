import assert from "node:assert/strict";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T06:00:00.000Z";

test("0068 fences immutable scan evidence to the quarantined tenant source", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)").run(
      "scan-user", "scan@example.test", now, now,
    );
    sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(
      "scan-workspace", "individual", "Scan", now, now,
    );
    sqlite.prepare(`INSERT INTO document_files
      (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
      VALUES ('scan-file','scan-workspace','scan-user','analysis_quarantined','quarantine-v2/scan',
      'contract.pdf','application/pdf',10,?,?,?)`).run("a".repeat(64), now, now);
    sqlite.prepare(`INSERT INTO document_analyses
      (id,workspace_id,owner_user_id,uploaded_file_id,status,consent_version,created_at,updated_at)
      VALUES ('scan-analysis','scan-workspace','scan-user','scan-file','quarantined','2026-08-04',?,?)`).run(now, now);

    const insert = sqlite.prepare(`INSERT INTO file_scan_results
      (id,analysis_id,file_id,workspace_id,owner_user_id,verdict,provider,engine,engine_version,
       signature_version,provider_scan_id,source_sha256,response_sha256,threats_json,completed_at,created_at)
      VALUES (?,?,?,?,?,'clean','internal-service','clamav','1.4.3','20260804','provider-scan',?,?, '[]',?,?)`);
    assert.throws(
      () => insert.run("cross", "scan-analysis", "scan-file", "scan-workspace", "wrong-user", "a".repeat(64), "b".repeat(64), now, now),
      /file_scan_source_mismatch/,
    );
    insert.run("scan-result", "scan-analysis", "scan-file", "scan-workspace", "scan-user", "a".repeat(64), "b".repeat(64), now, now);
    assert.throws(
      () => sqlite.prepare("UPDATE file_scan_results SET provider='changed' WHERE id='scan-result'").run(),
      /file_scan_result_immutable/,
    );
    assert.throws(
      () => sqlite.prepare(`INSERT INTO file_scan_results
        (id,analysis_id,file_id,workspace_id,owner_user_id,verdict,provider,engine,engine_version,
         signature_version,provider_scan_id,source_sha256,response_sha256,threats_json,completed_at,created_at)
        VALUES ('bad-threats','scan-analysis','scan-file','scan-workspace','scan-user','infected',
        'internal-service','clamav','1','1','scan-2',?,?, '[]',?,?)`).run("a".repeat(64), "b".repeat(64), now, now),
      /file_scan_results_threats_json_check|UNIQUE/,
    );
    sqlite.prepare("DELETE FROM document_analyses WHERE id='scan-analysis'").run();
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM file_scan_results").get() as { count: number }).count, 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});
