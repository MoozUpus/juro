import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentAnalysisResult } from "../lib/document-analysis/schema";
import {
  AnalysisExportError,
  executeAnalysisExportJob,
  exportForDownload,
  recordAnalysisExportFailure,
  recordAnalysisExportDownload,
  requestAnalysisExport,
  verifyExportObject,
} from "../lib/document-analysis/exporter";
import { handleQueue, type JobEnvelope, type PlatformJobEnv } from "../worker/platform-jobs";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-07-31T00:00:00.000Z";
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
    proposedWording: null,
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

class FakeR2Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; sha256: string }>();
  putCalls = 0;

  async head(key: string) {
    const value = this.objects.get(key);
    return value ? this.metadata(key, value) : null;
  }

  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    const metadata = this.metadata(key, value);
    const bytes = value.bytes.slice();
    return {
      ...metadata,
      body: new Blob([bytes]).stream(),
      bodyUsed: false,
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
      async text() { return new TextDecoder().decode(bytes); },
      async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
      async blob() { return new Blob([bytes]); },
    };
  }

  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    this.putCalls += 1;
    if (options?.onlyIf instanceof Headers && options.onlyIf.get("if-none-match") === "*" && this.objects.has(key)) {
      return null;
    }
    if (!(value instanceof Uint8Array)) throw new TypeError("Expected Uint8Array export.");
    const bytes = value.slice();
    const sha256 = await sha256Hex(bytes);
    assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 };
    this.objects.set(key, stored);
    return this.metadata(key, stored);
  }

  async tamper(key: string) {
    const value = this.objects.get(key);
    assert.ok(value);
    const bytes = new TextEncoder().encode("tampered");
    this.objects.set(key, { bytes, sha256: await sha256Hex(bytes) });
  }

  private metadata(key: string, value: { bytes: Uint8Array; sha256: string }) {
    return {
      key,
      version: "synthetic",
      size: value.bytes.byteLength,
      etag: value.sha256,
      httpEtag: `\"${value.sha256}\"`,
      uploaded: new Date(now),
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {},
      range: undefined,
      checksums: { sha256: hexArrayBuffer(value.sha256) },
      storageClass: "Standard",
      ssecKeyMd5: undefined,
      writeHttpMetadata() {},
    };
  }
}

test("analysis JSON export is atomic, tenant-scoped, idempotent and integrity checked", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedCompletedAnalysis(sqlite);
    const input = {
      db: d1,
      analysisId: "analysis-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      idempotencyKey: "analysis-export-integration-0001",
    };
    const created = await requestAnalysisExport(input);
    assert.equal(created.replay, false);
    assert.equal(created.record.status, "queued");
    const replay = await requestAnalysisExport(input);
    assert.equal(replay.replay, true);
    assert.equal(replay.record.id, created.record.id);

    const outbox = sqlite.prepare(
      "SELECT queue_binding AS queueBinding,job_type AS jobType,subject_id AS subjectId,status FROM job_outbox",
    ).get() as { queueBinding: string; jobType: string; subjectId: string; status: string };
    assert.deepEqual({ ...outbox }, {
      queueBinding: "DOCUMENT_EXPORT_QUEUE",
      jobType: "document.export",
      subjectId: created.record.id,
      status: "pending",
    });
    assert.equal(auditCount(sqlite, "export_requested"), 1);

    await assert.rejects(
      requestAnalysisExport({ ...input, analysisId: "analysis-other" }),
      (error: unknown) => error instanceof AnalysisExportError
        && error.code === "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      requestAnalysisExport({ ...input, workspaceId: "workspace-b", userId: "user-b" }),
      (error: unknown) => error instanceof AnalysisExportError
        && error.code === "ANALYSIS_EXPORT_NOT_READY",
    );

    const env = { DB: d1, BUCKET: bucket as unknown as R2Bucket };
    assert.deepEqual(await executeAnalysisExportJob(env, created.record.id, "workspace-a"), {
      status: "completed",
      exportId: created.record.id,
    });
    assert.equal(bucket.putCalls, 1);
    assert.deepEqual(await executeAnalysisExportJob(env, created.record.id, "workspace-a"), {
      status: "already_completed",
      exportId: created.record.id,
    });
    assert.equal(bucket.putCalls, 1);
    assert.equal(auditCount(sqlite, "export_completed"), 1);

    const own = await exportForDownload(d1, {
      exportId: created.record.id,
      workspaceId: "workspace-a",
      userId: "user-a",
    });
    const object = await verifyExportObject(bucket as unknown as R2Bucket, own);
    const payload = JSON.parse(await object.text()) as { schemaVersion: number; analysisId: string; result: DocumentAnalysisResult };
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.analysisId, "analysis-a");
    assert.equal(payload.result.jurisdiction, "UZ");
    await recordAnalysisExportDownload(d1, own, "user-a");
    assert.equal(auditCount(sqlite, "export_downloaded"), 1);

    await assert.rejects(
      exportForDownload(d1, { exportId: created.record.id, workspaceId: "workspace-b", userId: "user-b" }),
      (error: unknown) => error instanceof AnalysisExportError
        && error.code === "ANALYSIS_EXPORT_NOT_FOUND",
    );
    await bucket.tamper(own.r2Key!);
    await assert.rejects(
      verifyExportObject(bucket as unknown as R2Bucket, own),
      (error: unknown) => error instanceof AnalysisExportError
        && error.code === "ANALYSIS_EXPORT_OBJECT_FAILED",
    );
  } finally {
    sqlite.close();
  }
});

test("document export queue completes the private R2 artifact and acknowledges exactly once", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedCompletedAnalysis(sqlite);
    const requested = await requestAnalysisExport({
      db: d1,
      analysisId: "analysis-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      idempotencyKey: "analysis-export-queue-0001",
    });
    const envelope: JobEnvelope = {
      schemaVersion: 1,
      jobId: "job-analysis-export-0001",
      kind: "document.export",
      idempotencyKey: "job-analysis-export-idem-0001",
      subjectId: requested.record.id,
      workspaceId: "workspace-a",
      correlationId: "corr-analysis-export-0001",
      enqueuedAt: now,
    };
    let acknowledgements = 0;
    let retries = 0;
    const message = {
      id: "message-analysis-export-0001",
      timestamp: new Date(now),
      body: envelope,
      attempts: 1,
      ack() { acknowledgements += 1; },
      retry() { retries += 1; },
    } satisfies Message<JobEnvelope>;
    const batch = {
      queue: "development-document-export",
      messages: [message],
      metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
      retryAll() { throw new Error("retryAll must not run"); },
      ackAll() { message.ack(); },
    } satisfies MessageBatch<JobEnvelope>;
    const env = {
      DB: d1,
      BUCKET: bucket as unknown as R2Bucket,
      APP_ENV: "development",
      ASYNC_RUNTIME_ENABLED: "true",
      CRON_ENABLED: "false",
      LEGAL_ADVICE_INGESTION_ENABLED: "false",
      ACCOUNT_DELETION_PURGE_ENABLED: "false",
      JOB_SCHEMA_VERSION: "1",
      PLATFORM_ANALYTICS: { writeDataPoint() {} },
    } as unknown as PlatformJobEnv;

    await handleQueue(batch, env);
    assert.equal(acknowledgements, 1);
    assert.equal(retries, 0);
    assert.equal((sqlite.prepare("SELECT status FROM job_runs WHERE id=?").get(envelope.jobId) as { status: string }).status, "completed");
    assert.equal((sqlite.prepare("SELECT status FROM analysis_exports WHERE id=?").get(requested.record.id) as { status: string }).status, "completed");
    assert.equal(bucket.putCalls, 1);
  } finally {
test("invalid normalized analysis fails closed and records safe audit evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedCompletedAnalysis(sqlite);
    sqlite.prepare("UPDATE document_analyses SET summary_json='{}' WHERE id='analysis-a'").run();
    const requested = await requestAnalysisExport({
      db: d1,
      analysisId: "analysis-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      idempotencyKey: "analysis-export-invalid-source-0001",
    });
    let failure: AnalysisExportError | null = null;
    try {
      await executeAnalysisExportJob(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket },
        requested.record.id,
        "workspace-a",
      );
    } catch (error) {
      assert.ok(error instanceof AnalysisExportError);
      failure = error;
    }
    assert.ok(failure);
    assert.equal(failure.code, "ANALYSIS_EXPORT_INVALID_SOURCE");
    await recordAnalysisExportFailure(d1, requested.record.id, "workspace-a", failure);
    const row = sqlite.prepare(
      "SELECT status,error_code AS errorCode,r2_key AS r2Key FROM analysis_exports WHERE id=?",
    ).get(requested.record.id) as { status: string; errorCode: string; r2Key: string | null };
    assert.deepEqual({ ...row }, {
      status: "failed",
      errorCode: "ANALYSIS_EXPORT_INVALID_SOURCE",
      r2Key: null,
    });
    assert.equal(auditCount(sqlite, "export_failed"), 1);
    assert.equal(bucket.putCalls, 0);
  } finally {
    sqlite.close();
  }
});

    sqlite.close();
  }
});

test("analysis export migration rejects tenant mismatch and illegal mutation", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    seedCompletedAnalysis(sqlite);
    assert.throws(() => sqlite.prepare(
      `INSERT INTO analysis_exports
       (id,analysis_id,workspace_id,owner_user_id,format,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('bad-export','analysis-a','workspace-b','user-b','json','queued','bad.json','application/json','bad-export-key-0001',?,?)`,
    ).run(now, now), /analysis_export_source_mismatch/);

    sqlite.prepare(
      `INSERT INTO analysis_exports
       (id,analysis_id,workspace_id,owner_user_id,format,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('export-a','analysis-a','workspace-a','user-a','json','queued','analysis.json','application/json','export-trigger-key-0001',?,?)`,
    ).run(now, now);
    assert.throws(
      () => sqlite.prepare("UPDATE analysis_exports SET workspace_id='workspace-b' WHERE id='export-a'").run(),
      /analysis_export_identity_immutable/,
    );
    sqlite.prepare("UPDATE analysis_exports SET status='processing' WHERE id='export-a'").run();
    assert.throws(
      () => sqlite.prepare("UPDATE analysis_exports SET status='completed' WHERE id='export-a'").run(),
      /analysis_export_completion_invalid/,
    );
  } finally {
    sqlite.close();
  }
});

function seedCompletedAnalysis(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare(
    "INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?),(?,?,?,?)",
  ).run("user-a", "a@example.test", now, now, "user-b", "b@example.test", now, now);
  sqlite.prepare(
    "INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?),(?,?,?,?,?)",
  ).run("workspace-a", "individual", "A", now, now, "workspace-b", "individual", "B", now, now);
  sqlite.prepare(
    `INSERT INTO document_files
     (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
     VALUES ('file-a','workspace-a','user-a','safe','safe/workspace-a/analysis-a/file-a','contract.pdf','application/pdf',16,?, ?,?)`,
  ).run("0".repeat(64), now, now);
  sqlite.prepare(
    `INSERT INTO document_analyses
     (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,error_code,consent_version,created_at,updated_at)
     VALUES ('analysis-a','workspace-a','user-a','file-a','completed',?,NULL,'2026-07-31',?,?)`,
  ).run(JSON.stringify({ result }), now, now);
  sqlite.prepare(
    `INSERT INTO document_risks
     (id,analysis_id,level,title,description,excerpt,confidence_percent,created_at)
     VALUES ('risk-a','analysis-a','medium','Неясный срок','Срок не определён.','срок определяется дополнительно',95,?)`,
  ).run(now);
}

function auditCount(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], action: string): number {
  return Number((sqlite.prepare(
    "SELECT count(*) AS count FROM workspace_audit_events WHERE action=?",
  ).get(action) as { count: number }).count);
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexArrayBuffer(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes.buffer;
}
