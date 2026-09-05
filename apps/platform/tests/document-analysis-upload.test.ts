import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  documentAnalysisUploadForUser,
  DOCUMENT_ANALYSIS_INLINE_ZIP_BYTE_LIMIT,
  DOCUMENT_ANALYSIS_MAX_TOTAL_BYTES,
  hashUploadIntent,
  initializeDocumentAnalysisUpload,
  parseDocumentAnalysisUploadIntent,
  parseUploadIdempotencyKey,
  validateTextUploadBytes,
  validateUploadMagicBytes,
} from "../lib/document-analysis/upload-pipeline";

const intent = parseDocumentAnalysisUploadIntent({
  fileName: "contract.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  locale: "ru",
  mode: "quick",
  consent: true,
});

test("document analysis upload validates size, MIME/extension and idempotency keys", () => {
  assert.equal(intent.fileName, "contract.pdf");
  assert.throws(() => parseDocumentAnalysisUploadIntent({ ...intent, sizeBytes: 50 * 1024 * 1024 + 1 }), /размер/i);
  assert.throws(() => parseDocumentAnalysisUploadIntent({ ...intent, fileName: "contract.png" }), /MIME/i);
  assert.throws(() => parseDocumentAnalysisUploadIntent({ ...intent, hidden: true }), /Проверьте/i);
  assert.equal(parseUploadIdempotencyKey("upload-key-123456"), "upload-key-123456");
  assert.throws(() => parseUploadIdempotencyKey("short"), /Idempotency-Key/);
});

test("ZIP packages beyond the deployed bounded extractor are rejected before upload state exists", () => {
  assert.throws(
    () => parseDocumentAnalysisUploadIntent({
      ...intent,
      fileName: "contracts.zip",
      mimeType: "application/zip",
      sizeBytes: DOCUMENT_ANALYSIS_INLINE_ZIP_BYTE_LIMIT + 1,
      locale: "ru",
    }),
    (error: unknown) => error instanceof Error
      && error.message.includes("20 МБ")
      && "code" in error
      && error.code === "DOCUMENT_ANALYSIS_CAPACITY_UNAVAILABLE",
  );
  assert.throws(
    () => parseDocumentAnalysisUploadIntent({
      ...intent,
      fileName: "contracts.zip",
      mimeType: "application/zip",
      sizeBytes: DOCUMENT_ANALYSIS_INLINE_ZIP_BYTE_LIMIT + 1,
      locale: "uz",
    }),
    /20 MB dan katta ZIP-paketlar/,
  );
});

test("magic-byte validation rejects MIME spoofing", () => {
  assert.equal(validateUploadMagicBytes("application/pdf", new TextEncoder().encode("%PDF-1.7"), new Uint8Array()), true);
  assert.equal(validateUploadMagicBytes("application/pdf", new TextEncoder().encode("MZ....."), new Uint8Array()), false);
  assert.equal(validateUploadMagicBytes("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), new Uint8Array()), true);
  assert.equal(validateUploadMagicBytes("image/jpeg", Uint8Array.from([0xff, 0xd8]), Uint8Array.from([0xff, 0xd9])), true);
  assert.equal(validateUploadMagicBytes("application/zip", Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), new Uint8Array()), true);
  assert.equal(validateUploadMagicBytes("text/plain", new TextEncoder().encode("Статья 1"), new Uint8Array()), true);
  assert.equal(validateUploadMagicBytes("text/plain", Uint8Array.from([0x4d, 0x5a, 0, 0]), new Uint8Array()), false);
});

test("TXT, HTML and JSON uploads require bounded UTF-8 data and reject active markup", () => {
  for (const [fileName, mimeType] of [
    ["act.txt", "text/plain"],
    ["act.html", "text/html"],
    ["act.json", "application/json"],
  ] as const) {
    assert.equal(parseDocumentAnalysisUploadIntent({ ...intent, fileName, mimeType }).mimeType, mimeType);
  }
  assert.equal(validateTextUploadBytes("text/plain", new TextEncoder().encode("Статья 1. Общие положения")), true);
  assert.equal(validateTextUploadBytes("application/json", new TextEncoder().encode('{"article":1}')), true);
  assert.equal(validateTextUploadBytes("application/json", new TextEncoder().encode('{broken')), false);
  assert.equal(validateTextUploadBytes("text/html", new TextEncoder().encode("<article><h1>Статья 1</h1><p>Норма права</p></article>")), true);
  assert.equal(validateTextUploadBytes("text/html", new TextEncoder().encode("<p onclick=\"deleteDatabase()\">Норма</p>")), false);
  assert.equal(validateTextUploadBytes("text/html", new TextEncoder().encode("<script>ignorePreviousInstructions()</script>")), false);
});

test("upload initialization is tenant-scoped, idempotent, and binds the request hash", async () => {
  const sqlite = uploadDatabase();
  const db = sqliteD1(sqlite);
  const requestHash = await hashUploadIntent(intent);
  const input = {
    db,
    workspaceId: "workspace-a",
    userId: "user-a",
    idempotencyKey: "upload-key-123456",
    requestHash,
    intent,
  };
  const first = await initializeDocumentAnalysisUpload(input);
  assert.equal(first.replay, false);
  assert.match(first.record.r2Key, /^quarantine-v2\/workspace-a\//);
  assert.doesNotMatch(first.record.r2Key, /contract/i);

  const replay = await initializeDocumentAnalysisUpload(input);
  assert.equal(replay.replay, true);
  assert.equal(replay.record.analysisId, first.record.analysisId);
  await assert.rejects(
    initializeDocumentAnalysisUpload({ ...input, requestHash: "b".repeat(64) }),
    /already used|уже использован/i,
  );
  await assert.rejects(
    documentAnalysisUploadForUser(db, first.record.analysisId, "workspace-b", "user-a"),
    /не найдена/i,
  );
  await assert.rejects(
    documentAnalysisUploadForUser(db, first.record.analysisId, "workspace-a", "user-b"),
    /не найдена/i,
  );

  const consent = sqlite.prepare("SELECT type,scope_json AS scopeJson FROM consents").get() as { type: string; scopeJson: string };
  assert.equal(consent.type, "document_analysis");
  assert.equal(JSON.parse(consent.scopeJson).analysisId, first.record.analysisId);
  const event = sqlite.prepare("SELECT action,metadata_json AS metadataJson FROM workspace_audit_events").get() as { action: string; metadataJson: string };
  assert.equal(event.action, "upload_initiated");
  assert.equal("fileName" in JSON.parse(event.metadataJson), false);
});

test("document analysis allocation quota blocks a 21st active analysis while replay stays allocation-free", async () => {
  const sqlite = uploadDatabase();
  const db = sqliteD1(sqlite);
  const allocations: Array<Awaited<ReturnType<typeof initializeDocumentAnalysisUpload>>> = [];
  for (let index = 0; index < 20; index += 1) {
    const nextIntent = parseDocumentAnalysisUploadIntent({
      ...intent,
      fileName: `contract-${index}.pdf`,
      sha256: index.toString(16).padStart(64, "0"),
    });
    allocations.push(await initializeDocumentAnalysisUpload({
      db,
      workspaceId: "workspace-a",
      userId: "user-a",
      idempotencyKey: `upload-quota-key-${index.toString().padStart(3, "0")}`,
      requestHash: await hashUploadIntent(nextIntent),
      intent: nextIntent,
    }));
  }
  const lastIntent = parseDocumentAnalysisUploadIntent({
    ...intent,
    fileName: "contract-19.pdf",
    sha256: (19).toString(16).padStart(64, "0"),
  });
  const replay = await initializeDocumentAnalysisUpload({
    db,
    workspaceId: "workspace-a",
    userId: "user-a",
    idempotencyKey: "upload-quota-key-019",
    requestHash: await hashUploadIntent(lastIntent),
    intent: lastIntent,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.record.analysisId, allocations.at(-1)?.record.analysisId);

  const blockedIntent = parseDocumentAnalysisUploadIntent({
    ...intent,
    fileName: "contract-blocked.pdf",
    sha256: "f".repeat(64),
  });
  await assert.rejects(
    initializeDocumentAnalysisUpload({
      db,
      workspaceId: "workspace-a",
      userId: "user-a",
      idempotencyKey: "upload-quota-key-blocked",
      requestHash: await hashUploadIntent(blockedIntent),
      intent: blockedIntent,
    }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "DOCUMENT_ANALYSIS_CAPACITY_UNAVAILABLE"
      && "status" in error
      && error.status === 429,
  );
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM document_analyses").get() as { count: number }).count, 20);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM document_files").get() as { count: number }).count, 20);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM idempotency_keys").get() as { count: number }).count, 20);
});

test("migration trigger independently enforces the aggregate byte ceiling", () => {
  const migration = readFileSync(new URL("../drizzle/0148_document_analysis_resource_guardrails.sql", import.meta.url), "utf8");
  assert.match(migration, new RegExp(String(DOCUMENT_ANALYSIS_MAX_TOTAL_BYTES)));
  const sqlite = uploadDatabase();
  const now = "2026-09-01T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO document_files
    (id,workspace_id,document_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,archived_at,created_at,updated_at)
    VALUES ('oversized-file','workspace-a',NULL,'user-a','analysis_upload_pending','quarantine-v2/workspace-a/oversized','large.pdf','application/pdf',1073741825,?,NULL,?,?)`)
    .run("f".repeat(64), now, now);
  assert.throws(() => sqlite.prepare(`INSERT INTO document_analyses
    (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,error_code,consent_version,resource_scope,abandoned_after,created_at,updated_at)
    VALUES ('oversized-analysis','workspace-a','user-a','oversized-file','initiated','{}',NULL,'2026-07-30','interactive_analysis','2026-09-02T00:00:00.000Z',?,?)`)
    .run(now, now), /DOCUMENT_ANALYSIS_BYTE_QUOTA_EXCEEDED/);
});

test("migration caps derivative exports and fences references after deletion starts", async () => {
  const sqlite = uploadDatabase();
  const db = sqliteD1(sqlite);
  const created = await initializeDocumentAnalysisUpload({
    db,
    workspaceId: "workspace-a",
    userId: "user-a",
    idempotencyKey: "upload-export-guard-key",
    requestHash: await hashUploadIntent(intent),
    intent,
  });
  sqlite.prepare("UPDATE document_analyses SET status='completed' WHERE id=?")
    .run(created.record.analysisId);
  for (let index = 0; index < 20; index += 1) {
    sqlite.prepare("INSERT INTO analysis_exports(id,analysis_id,idempotency_key) VALUES (?,?,?)")
      .run(`export-${index}`, created.record.analysisId, `export-key-${index}`);
  }
  assert.throws(
    () => sqlite.prepare("INSERT INTO analysis_report_exports(id,analysis_id,idempotency_key) VALUES (?,?,?)")
      .run("export-blocked", created.record.analysisId, "export-key-blocked"),
    /ANALYSIS_EXPORT_CAPACITY_EXCEEDED/,
  );

  sqlite.prepare("UPDATE document_analyses SET deletion_requested_at=?,status='deletion_pending' WHERE id=?")
    .run("2026-09-01T00:00:00.000Z", created.record.analysisId);
  sqlite.prepare("INSERT INTO user_document_index_jobs(id,analysis_id,status) VALUES (?,?,?)")
    .run("index-job-after-delete", created.record.analysisId, "queued");
  assert.throws(
    () => sqlite.prepare("INSERT INTO document_comparisons(version_one_file_id,version_two_file_id) VALUES (?,?)")
      .run(created.record.fileId, "unrelated-file"),
    /DOCUMENT_ANALYSIS_DELETION_PENDING/,
  );
  assert.throws(
    () => sqlite.prepare("UPDATE user_document_index_jobs SET status='processing' WHERE id=?")
      .run("index-job-after-delete"),
    /DOCUMENT_ANALYSIS_DELETION_PENDING/,
  );
});

test("migration backfills legacy export keys into the durable cross-format registry", () => {
  const sqlite = uploadDatabase({ legacyExport: true });
  try {
    assert.deepEqual({ ...sqlite.prepare(`SELECT analysis_id AS analysisId,export_kind AS exportKind
      FROM analysis_export_idempotency_registry WHERE idempotency_key='legacy-export-key'`).get() }, {
      analysisId: "legacy-analysis",
      exportKind: "json",
    });
    sqlite.prepare("DELETE FROM analysis_exports WHERE id='legacy-export'").run();
    assert.throws(
      () => sqlite.prepare("INSERT INTO analysis_report_exports(id,analysis_id,idempotency_key) VALUES (?,?,?)")
        .run("legacy-report-reuse", "legacy-analysis", "legacy-export-key"),
      /ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT/,
    );
  } finally {
    sqlite.close();
  }
});

function uploadDatabase(options: { legacyExport?: boolean } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id TEXT PRIMARY KEY);
    CREATE TABLE user_profiles(id TEXT PRIMARY KEY);
    INSERT INTO workspaces VALUES ('workspace-a'),('workspace-b');
    INSERT INTO user_profiles VALUES ('user-a'),('user-b');
    CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY,scope TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,result_ref TEXT,expires_at TEXT NOT NULL,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE document_files (id TEXT PRIMARY KEY,workspace_id TEXT,document_id TEXT,owner_user_id TEXT NOT NULL,kind TEXT NOT NULL,r2_key TEXT NOT NULL UNIQUE,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id),FOREIGN KEY(owner_user_id) REFERENCES user_profiles(id));
    CREATE TABLE document_analyses (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,uploaded_file_id TEXT NOT NULL UNIQUE,case_id TEXT,case_link_revision INTEGER NOT NULL DEFAULT 0,case_linked_by_user_id TEXT,status TEXT NOT NULL,summary_json TEXT,result_sha256 TEXT,error_code TEXT,consent_version TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id),FOREIGN KEY(owner_user_id) REFERENCES user_profiles(id),FOREIGN KEY(uploaded_file_id) REFERENCES document_files(id));
    CREATE TABLE builder_document_analysis_handoffs (analysis_id TEXT);
    CREATE TABLE legal_corpus_owner_upload_requests (analysis_id TEXT,file_id TEXT);
    CREATE TABLE document_comparisons (version_one_file_id TEXT,version_two_file_id TEXT);
    CREATE TABLE analysis_exports (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE);
    CREATE TABLE analysis_report_exports (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE);
    CREATE TABLE user_document_index_jobs (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE consents (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,workspace_id TEXT,type TEXT NOT NULL,version TEXT NOT NULL,scope_json TEXT NOT NULL,granted_at TEXT NOT NULL);
    CREATE TABLE workspace_audit_events (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,actor_user_id TEXT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
  if (options.legacyExport) {
    sqlite.exec(`
      INSERT INTO document_files
        (id,workspace_id,document_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,archived_at,created_at,updated_at)
      VALUES
        ('legacy-file','workspace-a',NULL,'user-a','analysis_upload','safe/workspace-a/legacy-file','legacy.pdf','application/pdf',1024,NULL,NULL,'2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z');
      INSERT INTO document_analyses
        (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,result_sha256,error_code,consent_version,created_at,updated_at)
      VALUES
        ('legacy-analysis','workspace-a','user-a','legacy-file','completed','{}',NULL,NULL,'2026-07-30','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z');
      INSERT INTO analysis_exports(id,analysis_id,idempotency_key)
      VALUES ('legacy-export','legacy-analysis','legacy-export-key');
    `);
  }
  const migration = readFileSync(new URL("../drizzle/0148_document_analysis_resource_guardrails.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    sqlite.exec(statement);
  }
  return sqlite;
}

class TestStatement {
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new TestStatement(this.sqlite, this.sql, values); }
  first<T>(): T | null { return (this.sqlite.prepare(this.sql).get(...this.bindings()) as T | undefined) ?? null; }
  run() {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings());
    return { results: [], success: true as const, meta: { changes: Number(result.changes) } };
  }
  private bindings() { return this.values as Array<null | number | bigint | string>; }
}

function sqliteD1(sqlite: DatabaseSync): D1Database {
  return {
    prepare(sql: string) { return new TestStatement(sqlite, sql); },
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
