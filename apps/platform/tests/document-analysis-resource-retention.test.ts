import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  purgeExpiredDocumentAnalysisUploads,
  requestDocumentAnalysisDeletion,
  type DocumentAnalysisRetentionEnv,
} from "../lib/document-analysis/resource-retention";

const NOW = "2026-09-01T12:00:00.000Z";

test("owner deletion removes every analysis object before cascading D1 content and allocation metadata", async () => {
  const fixture = retentionFixture();
  try {
    seedAnalysis(fixture.sqlite, {
      id: "analysis-owner",
      fileId: "file-owner",
      status: "completed",
      key: "quarantine-v2/workspace-a/analysis-owner/file-owner",
      abandonedAfter: "2026-08-31T00:00:00.000Z",
    });
    fixture.sqlite.prepare("INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?,?,?,?)").run(
      "allocation-owner", "document-analysis-upload:workspace-a:user-a", "a".repeat(64), "completed",
      "analysis-owner", "2026-08-31T00:00:00.000Z", NOW, NOW, NOW,
    );
    fixture.sqlite.prepare("INSERT INTO file_extractions VALUES (?,?,?)").run("extraction-owner", "analysis-owner", "analysis/analysis-owner/extracted.md");
    fixture.sqlite.prepare("INSERT INTO analysis_document_versions VALUES (?,?,?)").run("version-owner", "analysis-owner", "analysis/analysis-owner/version.md");
    fixture.sqlite.prepare("INSERT INTO analysis_version_object_writes VALUES (?,?,?,?)").run("write-owner", "analysis-owner", "analysis/analysis-owner/pending.md", "attached");
    fixture.sqlite.prepare("INSERT INTO analysis_exports VALUES (?,?,?,?,?)").run("export-owner", "analysis-owner", "analysis/analysis-owner/export.json", "completed", "retention-export-owner");
    fixture.sqlite.prepare("INSERT INTO analysis_report_exports VALUES (?,?,?,?,?)").run("report-owner", "analysis-owner", "analysis/analysis-owner/report.pdf", "completed", "retention-report-owner");
    fixture.quarantine.objects.add("quarantine-v2/workspace-a/analysis-owner/file-owner");
    for (const key of [
      "analysis/analysis-owner/extracted.md",
      "analysis/analysis-owner/version.md",
      "analysis/analysis-owner/pending.md",
      "analysis/analysis-owner/export.json",
      "analysis/analysis-owner/report.pdf",
    ]) fixture.primary.objects.add(key);

    assert.deepEqual(await requestDocumentAnalysisDeletion(fixture.env, {
      analysisId: "analysis-owner",
      workspaceId: "workspace-a",
      userId: "user-a",
      now: NOW,
    }), { status: "purged" });
    assert.equal(fixture.primary.objects.size, 0);
    assert.equal(fixture.quarantine.objects.size, 0);
    assert.equal(count(fixture.sqlite, "document_analyses"), 0);
    assert.equal(count(fixture.sqlite, "document_files"), 0);
    assert.equal(count(fixture.sqlite, "idempotency_keys"), 0);
    const audit = fixture.sqlite.prepare("SELECT action,metadata_json AS metadataJson FROM workspace_audit_events").get() as { action: string; metadataJson: string };
    assert.equal(audit.action, "analysis_content_purged");
    assert.deepEqual(JSON.parse(audit.metadataJson), { reason: "owner_request", objectCount: 6, vectorCount: 0 });
  } finally {
    fixture.sqlite.close();
  }
});

test("R2 failure leaves a content-hidden retry tombstone and the scheduled retry finishes idempotently", async () => {
  const fixture = retentionFixture();
  try {
    seedAnalysis(fixture.sqlite, {
      id: "analysis-retry",
      fileId: "file-retry",
      status: "completed",
      key: "safe/workspace-a/analysis-retry/file-retry",
      abandonedAfter: "2026-08-31T00:00:00.000Z",
    });
    fixture.primary.objects.add("safe/workspace-a/analysis-retry/file-retry");
    fixture.primary.failDelete = true;
    assert.deepEqual(await requestDocumentAnalysisDeletion(fixture.env, {
      analysisId: "analysis-retry",
      workspaceId: "workspace-a",
      userId: "user-a",
      now: NOW,
    }), { status: "retrying" });
    const pending = fixture.sqlite.prepare(`SELECT status,deletion_requested_at AS deletedAt,
      purge_attempt_count AS attempts,last_purge_error AS error,summary_json AS summary
      FROM document_analyses WHERE id='analysis-retry'`).get() as {
        status: string; deletedAt: string; attempts: number; error: string; summary: string | null;
      };
    assert.deepEqual({ ...pending }, {
      status: "deletion_pending",
      deletedAt: NOW,
      attempts: 1,
      error: "R2_DELETE_FAILED",
      summary: null,
    });

    fixture.primary.failDelete = false;
    assert.deepEqual(await purgeExpiredDocumentAnalysisUploads({ env: fixture.env, now: NOW }), {
      eligible: 1,
      purged: 1,
      retrying: 0,
      idempotencyPurged: 0,
    });
    assert.equal(fixture.primary.objects.size, 0);
    assert.equal(count(fixture.sqlite, "document_analyses"), 0);
  } finally {
    fixture.sqlite.close();
  }
});

test("owner deletion cannot take over an upload writer that acquires the lease after eligibility is read", async () => {
  const fixture = retentionFixture();
  try {
    seedAnalysis(fixture.sqlite, {
      id: "analysis-upload-race",
      fileId: "file-upload-race",
      status: "initiated",
      key: "quarantine-v2/workspace-a/analysis-upload-race/file-upload-race",
      abandonedAfter: "2026-09-02T00:00:00.000Z",
    });
    fixture.quarantine.objects.add("quarantine-v2/workspace-a/analysis-upload-race/file-upload-race");
    let writerClaimed = false;
    fixture.env.DB = sqliteD1(fixture.sqlite, (sql) => {
      if (!writerClaimed && sql.includes("SELECT analysis.id AS analysisId")) {
        writerClaimed = true;
        fixture.sqlite.prepare("UPDATE document_analyses SET status='uploading',updated_at=? WHERE id=?")
          .run(NOW, "analysis-upload-race");
      }
    });

    await assert.rejects(
      requestDocumentAnalysisDeletion(fixture.env, {
        analysisId: "analysis-upload-race",
        workspaceId: "workspace-a",
        userId: "user-a",
        now: NOW,
      }),
      (error: unknown) => error instanceof Error
        && "code" in error
        && error.code === "ANALYSIS_IN_USE"
        && "status" in error
        && error.status === 409,
    );
    assert.deepEqual({ ...fixture.sqlite.prepare(`SELECT status,deletion_requested_at AS deletionRequestedAt
      FROM document_analyses WHERE id='analysis-upload-race'`).get() }, {
      status: "uploading",
      deletionRequestedAt: null,
    });
    assert.equal(fixture.quarantine.objects.has("quarantine-v2/workspace-a/analysis-upload-race/file-upload-race"), true);
  } finally {
    fixture.sqlite.close();
  }
});

test("scheduled retention purges only abandoned interactive allocations and excludes completed and owner-corpus evidence", async () => {
  const fixture = retentionFixture();
  try {
    seedAnalysis(fixture.sqlite, { id: "analysis-abandoned", fileId: "file-abandoned", status: "initiated", key: "quarantine-v2/workspace-a/abandoned", abandonedAfter: "2026-08-31T00:00:00.000Z" });
    seedAnalysis(fixture.sqlite, { id: "analysis-completed", fileId: "file-completed", status: "completed", key: "safe/workspace-a/completed", abandonedAfter: "2026-08-31T00:00:00.000Z" });
    seedAnalysis(fixture.sqlite, { id: "analysis-owner-corpus", fileId: "file-owner-corpus", status: "initiated", key: "quarantine-v2/workspace-a/owner-corpus", abandonedAfter: "2026-08-31T00:00:00.000Z" });
    fixture.sqlite.prepare("INSERT INTO legal_corpus_owner_upload_requests VALUES (?,?)").run("analysis-owner-corpus", "file-owner-corpus");
    fixture.quarantine.objects.add("quarantine-v2/workspace-a/abandoned");
    fixture.quarantine.objects.add("quarantine-v2/workspace-a/owner-corpus");
    fixture.primary.objects.add("safe/workspace-a/completed");
    fixture.sqlite.prepare("INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?,?,?,?)").run(
      "completed-expired", "document-analysis-upload:workspace-a:user-a", "c".repeat(64), "completed",
      "analysis-completed", "2026-08-31T00:00:00.000Z", NOW, NOW, NOW,
    );
    fixture.sqlite.prepare("INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?,?,?,?)").run(
      "active-future", "document-analysis-upload:workspace-a:user-a", "d".repeat(64), "completed",
      "analysis-owner-corpus", "2026-09-02T00:00:00.000Z", NOW, NOW, NOW,
    );
    fixture.sqlite.prepare("INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?,?,?,?)").run(
      "orphan-expired", "document-analysis-upload:workspace-a:user-a", "e".repeat(64), "completed",
      "missing-analysis", "2026-08-31T00:00:00.000Z", NOW, NOW, NOW,
    );

    assert.deepEqual(await purgeExpiredDocumentAnalysisUploads({ env: fixture.env, now: NOW }), {
      eligible: 1,
      purged: 1,
      retrying: 0,
      idempotencyPurged: 1,
    });
    assert.equal(countWhere(fixture.sqlite, "document_analyses", "id='analysis-abandoned'"), 0);
    assert.equal(countWhere(fixture.sqlite, "document_analyses", "id='analysis-completed'"), 1);
    assert.equal(countWhere(fixture.sqlite, "document_analyses", "id='analysis-owner-corpus'"), 1);
    assert.equal(countWhere(fixture.sqlite, "idempotency_keys", "key='completed-expired'"), 1);
    assert.equal(countWhere(fixture.sqlite, "idempotency_keys", "key='active-future'"), 1);
    assert.equal(countWhere(fixture.sqlite, "idempotency_keys", "key='orphan-expired'"), 0);
    assert.equal(fixture.primary.objects.has("safe/workspace-a/completed"), true);
    assert.equal(fixture.quarantine.objects.has("quarantine-v2/workspace-a/owner-corpus"), true);
  } finally {
    fixture.sqlite.close();
  }
});

test("an expired upload lease gets a recovery window before scheduled purge", async () => {
  const fixture = retentionFixture();
  try {
    seedAnalysis(fixture.sqlite, {
      id: "analysis-stale-upload",
      fileId: "file-stale-upload",
      status: "uploading",
      key: "quarantine-v2/workspace-a/analysis-stale-upload/file-stale-upload",
      abandonedAfter: "2026-08-31T00:00:00.000Z",
    });
    fixture.sqlite.prepare("UPDATE document_analyses SET updated_at=? WHERE id=?")
      .run("2026-09-01T10:00:00.000Z", "analysis-stale-upload");
    fixture.quarantine.objects.add("quarantine-v2/workspace-a/analysis-stale-upload/file-stale-upload");

    assert.deepEqual(await purgeExpiredDocumentAnalysisUploads({ env: fixture.env, now: NOW }), {
      eligible: 0,
      purged: 0,
      retrying: 0,
      idempotencyPurged: 0,
    });
    assert.deepEqual({ ...fixture.sqlite.prepare(`SELECT status,error_code AS errorCode,
      abandoned_after AS abandonedAfter FROM document_analyses WHERE id='analysis-stale-upload'`).get() }, {
      status: "upload_failed",
      errorCode: "UPLOAD_LEASE_EXPIRED",
      abandonedAfter: "2026-09-01T13:00:00.000Z",
    });
    assert.equal(fixture.quarantine.objects.has("quarantine-v2/workspace-a/analysis-stale-upload/file-stale-upload"), true);

    assert.deepEqual(await purgeExpiredDocumentAnalysisUploads({
      env: fixture.env,
      now: "2026-09-01T14:00:00.000Z",
    }), {
      eligible: 1,
      purged: 1,
      retrying: 0,
      idempotencyPurged: 0,
    });
    assert.equal(fixture.quarantine.objects.size, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test("deletion waits for an active export writer and then purges its completed object", async () => {
  const fixture = retentionFixture();
  try {
    seedAnalysis(fixture.sqlite, {
      id: "analysis-active-export",
      fileId: "file-active-export",
      status: "completed",
      key: "safe/workspace-a/active-export/source.pdf",
      abandonedAfter: "2026-08-31T00:00:00.000Z",
    });
    fixture.sqlite.prepare("INSERT INTO analysis_exports VALUES (?,?,?,?,?)")
      .run("export-active", "analysis-active-export", null, "processing", "retention-export-active");
    fixture.primary.objects.add("safe/workspace-a/active-export/source.pdf");

    assert.deepEqual(await requestDocumentAnalysisDeletion(fixture.env, {
      analysisId: "analysis-active-export",
      workspaceId: "workspace-a",
      userId: "user-a",
      now: NOW,
    }), { status: "retrying" });
    assert.equal(countWhere(fixture.sqlite, "document_analyses", "id='analysis-active-export'"), 1);
    assert.equal(fixture.primary.objects.has("safe/workspace-a/active-export/source.pdf"), true);

    fixture.sqlite.prepare("UPDATE analysis_exports SET status='completed',r2_key=? WHERE id='export-active'")
      .run("exports/workspace-a/analysis-active-export/export-active.json");
    fixture.primary.objects.add("exports/workspace-a/analysis-active-export/export-active.json");
    assert.deepEqual(await purgeExpiredDocumentAnalysisUploads({ env: fixture.env, now: NOW }), {
      eligible: 1,
      purged: 1,
      retrying: 0,
      idempotencyPurged: 0,
    });
    assert.equal(fixture.primary.objects.size, 0);
  } finally {
    fixture.sqlite.close();
  }
});

function retentionFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id TEXT PRIMARY KEY);
    CREATE TABLE user_profiles(id TEXT PRIMARY KEY);
    INSERT INTO workspaces VALUES ('workspace-a');
    INSERT INTO user_profiles VALUES ('user-a');
    CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY,scope TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,result_ref TEXT,expires_at TEXT NOT NULL,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE document_files (id TEXT PRIMARY KEY,workspace_id TEXT,document_id TEXT,owner_user_id TEXT NOT NULL,kind TEXT NOT NULL,r2_key TEXT NOT NULL UNIQUE,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE document_analyses (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,uploaded_file_id TEXT NOT NULL UNIQUE,case_id TEXT,case_link_revision INTEGER NOT NULL DEFAULT 0,case_linked_by_user_id TEXT,status TEXT NOT NULL,summary_json TEXT,result_sha256 TEXT,error_code TEXT,consent_version TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(uploaded_file_id) REFERENCES document_files(id));
    CREATE TABLE builder_document_analysis_handoffs (analysis_id TEXT);
    CREATE TABLE legal_corpus_owner_upload_requests (analysis_id TEXT,file_id TEXT);
    CREATE TABLE document_comparisons (version_one_file_id TEXT,version_two_file_id TEXT);
    CREATE TABLE workspace_audit_events (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,actor_user_id TEXT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE file_extractions (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,r2_key TEXT,FOREIGN KEY(analysis_id) REFERENCES document_analyses(id) ON DELETE CASCADE);
    CREATE TABLE analysis_document_versions (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,r2_key TEXT NOT NULL,FOREIGN KEY(analysis_id) REFERENCES document_analyses(id) ON DELETE CASCADE);
    CREATE TABLE analysis_version_object_writes (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,r2_key TEXT NOT NULL,status TEXT NOT NULL,FOREIGN KEY(analysis_id) REFERENCES document_analyses(id) ON DELETE CASCADE);
    CREATE TABLE analysis_exports (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,r2_key TEXT,status TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,FOREIGN KEY(analysis_id) REFERENCES document_analyses(id) ON DELETE CASCADE);
    CREATE TABLE analysis_report_exports (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,r2_key TEXT,status TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,FOREIGN KEY(analysis_id) REFERENCES document_analyses(id) ON DELETE CASCADE);
    CREATE TABLE user_document_index_jobs (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,workspace_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,status TEXT,mutation_id TEXT,deleted_at TEXT,updated_at TEXT);
    CREATE TABLE user_document_vector_chunks (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,vector_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,status TEXT,mutation_id TEXT,deleted_at TEXT);
  `);
  const migration = readFileSync(new URL("../drizzle/0148_document_analysis_resource_guardrails.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) sqlite.exec(statement);
  const primary = new MemoryR2();
  const quarantine = new MemoryR2();
  const DB = sqliteD1(sqlite);
  const env: DocumentAnalysisRetentionEnv = {
    DB,
    BUCKET: primary as unknown as R2Bucket,
    QUARANTINE_BUCKET: quarantine as unknown as R2Bucket,
  };
  return { sqlite, primary, quarantine, env };
}

function seedAnalysis(sqlite: DatabaseSync, input: { id: string; fileId: string; status: string; key: string; abandonedAfter: string }) {
  sqlite.prepare(`INSERT INTO document_files
    (id,workspace_id,document_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,archived_at,created_at,updated_at)
    VALUES (?,'workspace-a',NULL,'user-a','analysis_upload_pending',?,'contract.pdf','application/pdf',1024,?,NULL,?,?)`)
    .run(input.fileId, input.key, "a".repeat(64), NOW, NOW);
  sqlite.prepare(`INSERT INTO document_analyses
    (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,error_code,consent_version,resource_scope,abandoned_after,created_at,updated_at)
    VALUES (?,'workspace-a','user-a',?,?,'{"summary":"private"}',NULL,'2026-07-30','interactive_analysis',?,?,?)`)
    .run(input.id, input.fileId, input.status, input.abandonedAfter, NOW, NOW);
}

function count(sqlite: DatabaseSync, table: string): number {
  return (sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function countWhere(sqlite: DatabaseSync, table: string, where: string): number {
  return (sqlite.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${where}`).get() as { count: number }).count;
}

class MemoryR2 {
  readonly objects = new Set<string>();
  failDelete = false;
  async delete(keys: string | string[]) {
    if (this.failDelete) throw new Error("R2_DELETE_FAILED");
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }
}

class TestStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
    private readonly afterFirst?: (sql: string) => void,
  ) {}
  bind(...values: unknown[]) { return new TestStatement(this.sqlite, this.sql, values, this.afterFirst); }
  first<T>(): T | null {
    const result = (this.sqlite.prepare(this.sql).get(...this.bindings()) as T | undefined) ?? null;
    this.afterFirst?.(this.sql);
    return result;
  }
  all<T>() { return { results: this.sqlite.prepare(this.sql).all(...this.bindings()) as T[] }; }
  run() {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings());
    return { results: [], success: true as const, meta: { changes: Number(result.changes) } };
  }
  private bindings() { return this.values as Array<null | number | bigint | string>; }
}

function sqliteD1(sqlite: DatabaseSync, afterFirst?: (sql: string) => void): D1Database {
  return {
    prepare(sql: string) { return new TestStatement(sqlite, sql, [], afterFirst); },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => (statement as unknown as TestStatement).run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}
