import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  DocumentAnalysisProcessingError,
  executeDocumentAnalysisJob,
} from "../lib/document-analysis/processor";
import type { DocumentAnalysisResult } from "../lib/document-analysis/schema";

const result: DocumentAnalysisResult = {
  documentType: "Договор оказания услуг",
  summary: "Синтетический документ регулирует услуги.",
  language: "ru",
  outputLanguage: "ru",
  jurisdiction: "UZ",
  mode: "quick",
  userSide: null,
  legalComplianceStatus: "unverified",
  parties: [{ name: "Сторона А", role: "Заказчик", isUserSide: true }],
  amounts: [],
  dates: [],
  obligations: [],
  deadlines: [],
  risks: [{
    severity: "medium",
    riskType: "document_internal",
    title: "Неясный срок",
    clause: null,
    page: null,
    exactExcerpt: "срок определяется дополнительно",
    problem: "Срок не определён.",
    consequence: "Исполнение трудно контролировать.",
    legalBasisSourceIds: [],
    recommendation: "Указать точный срок.",
    proposedWording: "Установить срок в 10 календарных дней.",
    confidence: "high",
  }],
  missingClauses: [],
  contradictions: [],
  questions: [],
  recommendations: [],
  overallQuality: { score: 70, explanation: "Нужен точный срок." },
  sources: [],
  legalDatabaseAsOf: "unavailable",
  extractionWarnings: [],
};

test("document consumer refuses quarantined files before any R2 or AI read", async () => {
  const fixture = await databaseFixture("quarantined", "analysis_quarantined");
  let r2Reads = 0;
  let aiCalls = 0;
  await assert.rejects(
    executeDocumentAnalysisJob({
      DB: fixture.db,
      BUCKET: { async get() { r2Reads += 1; return null; } } as unknown as R2Bucket,
    }, "analysis-a", "workspace-a", {
      analyze: async () => { aiCalls += 1; throw new Error("must not run"); },
    }),
    (error: unknown) => error instanceof DocumentAnalysisProcessingError
      && error.code === "DOCUMENT_ANALYSIS_FILE_UNSAFE",
  );
  assert.equal(r2Reads, 0);
  assert.equal(aiCalls, 0);
  fixture.sqlite.close();
});

test("safe document analysis persists normalized result, usage, audit and is idempotent", async () => {
  const fixture = await databaseFixture("ready", "analysis_safe");
  const bytes = new TextEncoder().encode("Сторона А. срок определяется дополнительно");
  const sha256 = await sha256Hex(bytes);
  fixture.sqlite.prepare("UPDATE document_files SET size_bytes=?,sha256=? WHERE id='file-a'").run(bytes.byteLength, sha256);
  let aiCalls = 0;
  const env = {
    DB: fixture.db,
    BUCKET: {
      async get(key: string) {
        assert.equal(key, "safe/workspace-a/analysis-a/file-a");
        return { async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
      },
    } as unknown as R2Bucket,
  };
  const dependencies = {
    extract: async () => ({
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
      pageCount: 1,
      detectedLanguage: "ru" as const,
      textQuality: "good" as const,
      warningCode: null,
      text: new TextDecoder().decode(bytes),
      sections: [],
    }),
    retrieve: async () => ({
      sources: [],
      evidence: [],
      freshness: {
        status: "unavailable" as const,
        asOf: "unavailable",
        ageDays: null,
        maxAgeDays: 7,
      },
      legalDatabaseAsOf: "unavailable",
      retrievalMode: "lexical" as const,
      semanticStatus: "unavailable" as const,
    }),
    analyze: async () => {
      aiCalls += 1;
      return {
        data: result,
        provider: "anthropic" as const,
        model: "claude-sonnet-4-6",
        providerResponseId: "synthetic-provider-id",
        attempts: 1,
        latencyMs: 12,
        usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 },
        fallbackFromProvider: null,
      };
    },
  };
  assert.equal((await executeDocumentAnalysisJob(env, "analysis-a", "workspace-a", dependencies)).status, "completed");
  assert.equal((await executeDocumentAnalysisJob(env, "analysis-a", "workspace-a", dependencies)).status, "already_completed");
  assert.equal(aiCalls, 1);
  const analysis = fixture.sqlite.prepare("SELECT status,error_code AS errorCode FROM document_analyses WHERE id='analysis-a'")
    .get() as { status: string; errorCode: string | null };
  assert.equal(analysis.status, "completed");
  assert.equal(analysis.errorCode, null);

  assert.equal((fixture.sqlite.prepare("SELECT count(*) AS count FROM document_risks").get() as { count: number }).count, 1);
  assert.equal((fixture.sqlite.prepare("SELECT feature,status FROM ai_usage_ledger").get() as { feature: string; status: string }).feature, "document_analysis");
  const persistedRisk = fixture.sqlite.prepare("SELECT risk_type AS riskType,recommendation,proposed_wording AS proposedWording,legal_basis_source_ids_json AS sourceIds FROM document_risks").get() as { riskType: string; recommendation: string; proposedWording: string; sourceIds: string };
  assert.equal(persistedRisk.riskType, "document_internal");
  assert.equal(persistedRisk.recommendation, "Указать точный срок.");
  assert.equal(persistedRisk.proposedWording, "Установить срок в 10 календарных дней.");
  assert.equal(persistedRisk.sourceIds, "[]");
  assert.equal((fixture.sqlite.prepare("SELECT action FROM workspace_audit_events").get() as { action: string }).action, "analysis_completed");
  fixture.sqlite.close();
});

async function databaseFixture(status: string, fileKind: string) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id TEXT PRIMARY KEY);
    CREATE TABLE user_profiles(id TEXT PRIMARY KEY);
    INSERT INTO workspaces VALUES ('workspace-a'),('workspace-b');
    INSERT INTO user_profiles VALUES ('user-a');
    CREATE TABLE document_files (id TEXT PRIMARY KEY,workspace_id TEXT,owner_user_id TEXT NOT NULL,kind TEXT NOT NULL,r2_key TEXT NOT NULL UNIQUE,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE document_analyses (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,uploaded_file_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL,summary_json TEXT,error_code TEXT,consent_version TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE file_extractions (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL UNIQUE,file_id TEXT NOT NULL,workspace_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,status TEXT NOT NULL,method TEXT NOT NULL,provider TEXT NOT NULL,model TEXT,source_sha256 TEXT NOT NULL,r2_key TEXT,text_sha256 TEXT,size_bytes INTEGER,token_estimate INTEGER,detected_mime_type TEXT,detected_language TEXT,text_quality TEXT,warnings_json TEXT NOT NULL DEFAULT '[]',error_code TEXT,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE job_outbox (id TEXT PRIMARY KEY,queue_binding TEXT NOT NULL,job_type TEXT NOT NULL,schema_version INTEGER NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,subject_id TEXT NOT NULL,workspace_id TEXT,correlation_id TEXT NOT NULL,enqueued_at TEXT NOT NULL,available_at TEXT NOT NULL,status TEXT NOT NULL,dispatch_attempts INTEGER NOT NULL,lease_owner TEXT,lease_expires_at TEXT,next_attempt_at TEXT,dispatched_at TEXT,error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE document_risks (id TEXT PRIMARY KEY,analysis_id TEXT NOT NULL,level TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,excerpt TEXT,confidence_percent INTEGER,risk_type TEXT NOT NULL DEFAULT 'document_internal',clause TEXT,page INTEGER,recommendation TEXT,proposed_wording TEXT,legal_basis_source_ids_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL);
    CREATE TABLE ai_runs (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT,request_message_id TEXT,response_message_id TEXT,idempotency_key TEXT NOT NULL,correlation_id TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,provider_response_id TEXT,fallback_from_provider TEXT,answer_mode TEXT NOT NULL,reasoning_mode TEXT NOT NULL,status TEXT NOT NULL,legal_database_as_of TEXT NOT NULL,instruction_hash TEXT NOT NULL,source_version_hash TEXT NOT NULL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,cached_input_tokens INTEGER NOT NULL DEFAULT 0,estimated_cost_microusd INTEGER,attempt_count INTEGER NOT NULL DEFAULT 0,latency_ms INTEGER,error_code TEXT,started_at TEXT NOT NULL,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,user_id,idempotency_key));
    CREATE TABLE ai_usage_ledger (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,ai_run_id TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL,feature TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,units INTEGER NOT NULL,status TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,cached_input_tokens INTEGER NOT NULL,estimated_cost_microusd INTEGER,released_at TEXT,consumed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,user_id,idempotency_key));
    CREATE TABLE workspace_audit_events (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,actor_user_id TEXT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO document_files VALUES ('file-a','workspace-a','user-a','${fileKind}','safe/workspace-a/analysis-a/file-a','contract.pdf','application/pdf',1,'${"0".repeat(64)}',NULL,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z');
    INSERT INTO document_analyses VALUES ('analysis-a','workspace-a','user-a','file-a','${status}','{"mode":"quick","locale":"ru"}',NULL,'2026-07-30','2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z');
  `);
  return { sqlite, db: sqliteD1(sqlite) };
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

async function sha256Hex(value: Uint8Array): Promise<string> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
