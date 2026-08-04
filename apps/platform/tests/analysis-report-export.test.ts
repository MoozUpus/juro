import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import type { DocumentAnalysisResult } from "../lib/document-analysis/schema";
import { AnalysisExportError } from "../lib/document-analysis/exporter";
import {
  deleteAnalysisReportExport,
  executeAnalysisReportExportJob,
  reportExportForDownload,
  requestAnalysisReportExport,
  verifyReportObject,
} from "../lib/document-analysis/report-exporter";
import { handleQueue, type JobEnvelope, type PlatformJobEnv } from "../worker/platform-jobs";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-07-31T00:00:00.000Z";
const result: DocumentAnalysisResult = {
  documentType: "Договор оказания услуг",
  summary: "Синтетический документ регулирует услуги.",
  language: "ru",
  outputLanguage: "ru",
  jurisdiction: "UZ",
  mode: "full",
  userSide: "Заказчик",
  legalComplianceStatus: "unverified",
  parties: [{ name: "Сторона А", role: "Заказчик", isUserSide: true }],
  amounts: ["1 000 000 сум"],
  dates: ["31 июля 2026 года"],
  obligations: [{ party: "Исполнитель", obligation: "Оказать услуги", clause: "2.1", deadline: "10 дней" }],
  deadlines: [{ title: "Срок исполнения", value: "10 дней", clause: "2.1", consequence: "Просрочка" }],
  risks: [{
    severity: "medium",
    riskType: "document_internal",
    title: "Неясный срок",
    clause: "2.1",
    page: 1,
    exactExcerpt: "срок определяется дополнительно",
    problem: "Срок не определён.",
    consequence: "Исполнение трудно контролировать.",
    legalBasisSourceIds: [],
    recommendation: "Указать точный срок.",
    proposedWording: "Срок составляет 10 календарных дней.",
    confidence: "high",
  }],
  missingClauses: [],
  contradictions: [],
  questions: ["Когда начинается исполнение?"],
  recommendations: ["Согласовать дату начала."],
  overallQuality: { score: 70, explanation: "Нужен точный срок." },
  sources: [],
  legalDatabaseAsOf: "2026-07-31",
  extractionWarnings: [],
};

class FakeR2Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; sha256: string }>();

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
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      async text() { return new TextDecoder().decode(bytes); },
      async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
      async blob() { return new Blob([bytes]); },
    };
  }

  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    if (options?.onlyIf?.get("if-none-match") === "*" && this.objects.has(key)) return null;
    if (!(value instanceof Uint8Array)) throw new TypeError("Expected Uint8Array.");
    const bytes = value.slice();
    const sha256 = await sha256Hex(bytes);
    assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 };
    this.objects.set(key, stored);
    return this.metadata(key, stored);
  }

  async delete(key: string) { this.objects.delete(key); }

  private metadata(key: string, value: { bytes: Uint8Array; sha256: string }) {
    return {
      key,
      version: "synthetic",
      size: value.bytes.byteLength,
      etag: value.sha256,
      httpEtag: `"${value.sha256}"`,
      uploaded: new Date(now),
      httpMetadata: {},
      customMetadata: {},
      range: undefined,
      checksums: { sha256: hexArrayBuffer(value.sha256) },
      storageClass: "Standard",
      ssecKeyMd5: undefined,
      writeHttpMetadata() {},
    };
  }
}

class FakeAssets {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname.replace(/^\//, "");
    const allowed = new Set([
      "document-templates/DejaVuSans-JURO.ttf",
      "document-templates/DejaVuSans-Bold-JURO.ttf",
      "document-templates/juro-mark-footer.png",
      "document-templates/receipt-ru.docx",
      "document-templates/receipt-uz-cyrl.docx",
    ]);
    if (!allowed.has(path)) return new Response(null, { status: 404 });
    const bytes = await readFile(new URL(`../public/${path}`, import.meta.url));
    return new Response(bytes);
  }
}

for (const format of ["pdf", "docx"] as const) {
  test(`analysis ${format.toUpperCase()} report is tenant-scoped, private, verified and deletable`, async () => {
    const { sqlite, d1 } = sqliteD1Fixture();
    const bucket = new FakeR2Bucket();
    try {
      seed(sqlite);
      const input = {
        db: d1,
        analysisId: "analysis-report-a",
        workspaceId: "workspace-report-a",
        userId: "user-report-a",
        format,
        idempotencyKey: `analysis-report-${format}-0001`,
      };
      const created = await requestAnalysisReportExport(input);
      assert.equal(created.replay, false);
      assert.equal((await requestAnalysisReportExport(input)).replay, true);
      await assert.rejects(
        requestAnalysisReportExport({ ...input, workspaceId: "workspace-report-b", userId: "user-report-b" }),
        (error: unknown) => error instanceof AnalysisExportError && error.code === "ANALYSIS_EXPORT_NOT_READY",
      );

      await executeAnalysisReportExportJob(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket, ASSETS: new FakeAssets() as unknown as Fetcher },
        created.record.id,
        input.workspaceId,
      );
      const own = await reportExportForDownload(d1, {
        exportId: created.record.id,
        workspaceId: input.workspaceId,
        userId: input.userId,
      });
      const object = await verifyReportObject(bucket as unknown as R2Bucket, own);
      const bytes = new Uint8Array(await object.arrayBuffer());
      assert.ok(bytes.byteLength > 1_000);
      if (format === "pdf") {
        assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
      } else {
        assert.equal(bytes[0], 0x50);
        assert.equal(bytes[1], 0x4b);
        const documentXml = strFromU8(unzipSync(bytes)["word/document.xml"]);
        assert.match(documentXml, /ОТЧЁТ ОБ АНАЛИЗЕ ДОКУМЕНТА/);
      }
      await assert.rejects(
        reportExportForDownload(d1, { exportId: own.id, workspaceId: "workspace-report-b", userId: "user-report-b" }),
        (error: unknown) => error instanceof AnalysisExportError && error.code === "ANALYSIS_EXPORT_NOT_FOUND",
      );
      assert.deepEqual(await deleteAnalysisReportExport(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket },
        { exportId: own.id, workspaceId: input.workspaceId, userId: input.userId },
      ), { status: "deleted", exportId: own.id });
      assert.equal(bucket.objects.size, 0);
      assert.deepEqual(await deleteAnalysisReportExport(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket },
        { exportId: own.id, workspaceId: input.workspaceId, userId: input.userId },
      ), { status: "already_deleted", exportId: own.id });
    } finally {
      sqlite.close();
    }
  });
}

test("document export queue routes report jobs through the real PDF generator", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seed(sqlite);
    const requested = await requestAnalysisReportExport({
      db: d1,
      analysisId: "analysis-report-a",
      workspaceId: "workspace-report-a",
      userId: "user-report-a",
      format: "pdf",
      idempotencyKey: "analysis-report-queue-0001",
    });
    const envelope: JobEnvelope = {
      schemaVersion: 1,
      jobId: "job-analysis-report-0001",
      kind: "document.export",
      idempotencyKey: "job-analysis-report-idem-0001",
      subjectId: requested.record.id,
      workspaceId: "workspace-report-a",
      correlationId: "corr-analysis-report-0001",
      enqueuedAt: now,
    };
    let acknowledgements = 0;
    let retries = 0;
    const message = {
      id: "message-analysis-report-0001",
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
      ASSETS: new FakeAssets() as unknown as Fetcher,
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
    assert.equal((sqlite.prepare("SELECT status FROM analysis_report_exports WHERE id=?").get(requested.record.id) as { status: string }).status, "completed");
    const stored = [...bucket.objects.values()][0];
    assert.equal(new TextDecoder().decode(stored.bytes.slice(0, 4)), "%PDF");
  } finally {
    sqlite.close();
  }
});

test("corrected clean and redline DOCX/PDF exports are version-bound, verified and explicit", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seed(sqlite);
    const correctedText = "# Договор оказания услуг\n\nСрок составляет 10 календарных дней.";
    const correctedBytes = new TextEncoder().encode(correctedText);
    const correctedSha = await sha256Hex(correctedBytes);
    seedCorrectedVersion(sqlite, correctedSha, correctedBytes.byteLength);
    await bucket.put("analysis-versions/workspace-report-a/analysis-report-a/2-corrected.md", correctedBytes, { sha256: correctedSha });

    for (const variant of ["corrected_clean", "corrected_redline"] as const) {
      for (const format of ["docx", "pdf"] as const) {
        const requested = await requestAnalysisReportExport({
          db: d1, analysisId: "analysis-report-a", workspaceId: "workspace-report-a", userId: "user-report-a",
          format, variant, sourceVersionId: "analysis-version-corrected-a",
          idempotencyKey: `corrected-${variant}-${format}-0001`,
        });
        assert.equal(requested.record.variant, variant);
        assert.equal(requested.record.sourceVersionId, "analysis-version-corrected-a");
        await executeAnalysisReportExportJob(
          { DB: d1, BUCKET: bucket as unknown as R2Bucket, ASSETS: new FakeAssets() as unknown as Fetcher },
          requested.record.id,
          "workspace-report-a",
        );
        const own = await reportExportForDownload(d1, { exportId: requested.record.id, workspaceId: "workspace-report-a", userId: "user-report-a" });
        const object = await verifyReportObject(bucket as unknown as R2Bucket, own);
        const bytes = new Uint8Array(await object.arrayBuffer());
        assert.ok(bytes.byteLength > 1_000);
        if (format === "docx") {
          const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
          assert.match(xml, /Срок составляет 10 календарных дней/);
          if (variant === "corrected_redline") {
            assert.match(xml, /Удалено: срок определяется дополнительно/);
            assert.match(xml, /Добавлено: Срок составляет 10 календарных дней/);
            assert.match(xml, /w:strike/);
            assert.match(xml, /w:u w:val="single"/);
          } else {
            assert.doesNotMatch(xml, /Удалено:/);
          }
        } else {
          assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
        }
      }
    }
    await assert.rejects(
      requestAnalysisReportExport({
        db: d1, analysisId: "analysis-report-a", workspaceId: "workspace-report-b", userId: "user-report-b",
        format: "pdf", variant: "corrected_clean", sourceVersionId: "analysis-version-corrected-a",
        idempotencyKey: "corrected-cross-tenant-0001",
      }),
      (error: unknown) => error instanceof AnalysisExportError && error.code === "ANALYSIS_EXPORT_NOT_READY",
    );
  } finally {
    sqlite.close();
  }
});

test("analysis report migration rejects source mismatch and incomplete completion", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    seed(sqlite);
    assert.throws(() => sqlite.prepare(
      `INSERT INTO analysis_report_exports
       (id,analysis_id,workspace_id,owner_user_id,format,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('bad-report','analysis-report-a','workspace-report-b','user-report-b','pdf','queued','bad.pdf','application/pdf','bad-report-key-0001',?,?)`,
    ).run(now, now), /analysis_report_export_source_mismatch/);
    sqlite.prepare(
      `INSERT INTO analysis_report_exports
       (id,analysis_id,workspace_id,owner_user_id,format,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('report-a','analysis-report-a','workspace-report-a','user-report-a','pdf','queued','report.pdf','application/pdf','report-key-0001',?,?)`,
    ).run(now, now);
    assert.throws(
      () => sqlite.prepare("UPDATE analysis_report_exports SET variant='corrected_clean' WHERE id='report-a'").run(),
      /analysis_report_export_variant_immutable/,
    );
    assert.throws(() => sqlite.prepare(
      `INSERT INTO analysis_report_exports
       (id,analysis_id,workspace_id,owner_user_id,format,variant,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('bad-variant','analysis-report-a','workspace-report-a','user-report-a','pdf','unknown','queued','bad.pdf','application/pdf','bad-variant-key-0001',?,?)`,
    ).run(now, now), /analysis_report_export_variant_mismatch/);
    sqlite.prepare("UPDATE analysis_report_exports SET status='processing' WHERE id='report-a'").run();
    assert.throws(
      () => sqlite.prepare("UPDATE analysis_report_exports SET status='completed' WHERE id='report-a'").run(),
      /analysis_report_export_completion_invalid/,
    );
  } finally {
    sqlite.close();
  }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare(
    "INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?),(?,?,?,?)",
  ).run(
    "user-report-a", "report-a@example.test", now, now,
    "user-report-b", "report-b@example.test", now, now,
  );
  sqlite.prepare(
    "INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?),(?,?,?,?,?)",
  ).run(
    "workspace-report-a", "individual", "A", now, now,
    "workspace-report-b", "individual", "B", now, now,
  );
  sqlite.prepare(
    `INSERT INTO document_files
     (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
     VALUES ('file-report-a','workspace-report-a','user-report-a','safe','safe/workspace-report-a/file','contract.pdf','application/pdf',16,?,?,?)`,
  ).run("0".repeat(64), now, now);
  sqlite.prepare(
    `INSERT INTO document_analyses
     (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,error_code,consent_version,created_at,updated_at)
     VALUES ('analysis-report-a','workspace-report-a','user-report-a','file-report-a','completed',?,NULL,'2026-07-31',?,?)`,
  ).run(JSON.stringify({ result }), now, now);
}

function seedCorrectedVersion(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], correctedSha: string, correctedSize: number) {
  sqlite.prepare(
    `INSERT INTO document_risks
     (id,analysis_id,level,title,description,excerpt,confidence_percent,created_at,risk_type,clause,page,recommendation,proposed_wording,legal_basis_source_ids_json)
     VALUES ('risk-report-a','analysis-report-a','medium','Неясный срок','Срок не определён.','срок определяется дополнительно',90,?,'document_internal','2.1',1,'Указать точный срок.','Срок составляет 10 календарных дней.','[]')`,
  ).run(now);
  sqlite.prepare(
    `INSERT INTO analysis_document_versions
     (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,file_name,mime_type,size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at)
     VALUES ('analysis-source-report-a','analysis-report-a','workspace-report-a','user-report-a',1,NULL,'extracted','analysis-versions/workspace-report-a/analysis-report-a/1-source.md','contract-v1.md','text/markdown; charset=utf-8',32,?,NULL,NULL,'[]',NULL,?)`,
  ).run("1".repeat(64), now);
  sqlite.prepare(
    `INSERT INTO suggested_revisions
     (id,analysis_id,risk_id,source_version_id,workspace_id,owner_user_id,original_text,proposed_text,status,decided_by_user_id,decided_at,applied_version_id,created_at,updated_at)
     VALUES ('revision-report-a','analysis-report-a','risk-report-a','analysis-source-report-a','workspace-report-a','user-report-a','срок определяется дополнительно','Срок составляет 10 календарных дней.','accepted','user-report-a',?,NULL,?,?)`,
  ).run(now, now, now);
  sqlite.prepare(
    `INSERT INTO analysis_document_versions
     (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,file_name,mime_type,size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at)
     VALUES ('analysis-version-corrected-a','analysis-report-a','workspace-report-a','user-report-a',2,'analysis-source-report-a','corrected','analysis-versions/workspace-report-a/analysis-report-a/2-corrected.md','contract-v2.md','text/markdown; charset=utf-8',?,?, 'corrected-version-idempotency-0001',?,'["revision-report-a"]','user-report-a',?)`,
  ).run(correctedSize, correctedSha, "2".repeat(64), now);
  sqlite.prepare(
    `UPDATE suggested_revisions SET status='applied',applied_version_id='analysis-version-corrected-a',updated_at=?
     WHERE id='revision-report-a'`,
  ).run(now);
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexArrayBuffer(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes.buffer;
}
