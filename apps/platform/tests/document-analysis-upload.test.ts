import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  documentAnalysisUploadForUser,
  DOCUMENT_ANALYSIS_INLINE_ZIP_BYTE_LIMIT,
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

function uploadDatabase() {
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
    CREATE TABLE consents (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,workspace_id TEXT,type TEXT NOT NULL,version TEXT NOT NULL,scope_json TEXT NOT NULL,granted_at TEXT NOT NULL);
    CREATE TABLE workspace_audit_events (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,actor_user_id TEXT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
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
