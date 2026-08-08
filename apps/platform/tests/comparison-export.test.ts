import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { AnalysisExportError } from "../lib/document-analysis/exporter";
import {
  comparisonExportForDownload,
  deleteComparisonExport,
  executeComparisonExportJob,
  requestComparisonExport,
  verifyComparisonExportObject,
} from "../lib/document-comparison/exporter";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T00:00:00.000Z";

class FakeR2Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; sha256: string }>();
  async head(key: string) { const value = this.objects.get(key); return value ? this.metadata(key, value) : null; }
  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    const bytes = value.bytes.slice();
    return { ...this.metadata(key, value), body: new Blob([bytes]).stream(), bodyUsed: false,
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      async text() { return new TextDecoder().decode(bytes); },
      async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
      async blob() { return new Blob([bytes]); } };
  }
  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    if (options?.onlyIf?.get("if-none-match") === "*" && this.objects.has(key)) return null;
    assert.ok(value instanceof Uint8Array);
    const bytes = value.slice();
    const sha256 = await sha256Hex(bytes);
    assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 };
    this.objects.set(key, stored);
    return this.metadata(key, stored);
  }
  async delete(key: string) { this.objects.delete(key); }
  private metadata(key: string, value: { bytes: Uint8Array; sha256: string }) {
    return { key, version: "synthetic", size: value.bytes.byteLength, etag: value.sha256, httpEtag: `"${value.sha256}"`,
      uploaded: new Date(now), httpMetadata: {}, customMetadata: {}, range: undefined,
      checksums: { sha256: hexArrayBuffer(value.sha256) }, storageClass: "Standard", ssecKeyMd5: undefined, writeHttpMetadata() {} };
  }
}

class FakeAssets {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname.replace(/^\//, "");
    const allowed = new Set([
      "document-templates/DejaVuSans-JURO.ttf", "document-templates/DejaVuSans-Bold-JURO.ttf",
      "document-templates/juro-mark-footer.png", "document-templates/receipt-ru.docx", "document-templates/receipt-uz-cyrl.docx",
    ]);
    if (!allowed.has(path)) return new Response(null, { status: 404 });
    return new Response(await readFile(new URL(`../public/${path}`, import.meta.url)));
  }
}

for (const format of ["pdf", "docx"] as const) {
  test(`comparison ${format.toUpperCase()} export is durable, tenant-scoped, checksum verified and deletable`, async () => {
    const { sqlite, d1 } = sqliteD1Fixture();
    const bucket = new FakeR2Bucket();
    try {
      seed(sqlite);
      const input = { db: d1, comparisonId: "comparison-a", workspaceId: "workspace-a", userId: "user-a", format, idempotencyKey: `comparison-${format}-export-0001` };
      const requested = await requestComparisonExport(input);
      assert.equal(requested.replay, false);
      assert.equal((await requestComparisonExport(input)).replay, true);
      await assert.rejects(
        requestComparisonExport({ ...input, workspaceId: "workspace-b", userId: "user-b", idempotencyKey: `comparison-${format}-cross-tenant-0001` }),
        (error: unknown) => error instanceof AnalysisExportError && error.code === "ANALYSIS_EXPORT_NOT_READY",
      );
      await executeComparisonExportJob(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket, ASSETS: new FakeAssets() as unknown as Fetcher },
        requested.record.id,
        "workspace-a",
      );
      const record = await comparisonExportForDownload(d1, { exportId: requested.record.id, workspaceId: "workspace-a", userId: "user-a" });
      const object = await verifyComparisonExportObject(bucket as unknown as R2Bucket, record);
      const bytes = new Uint8Array(await object.arrayBuffer());
      assert.ok(bytes.byteLength > 1_000);
      if (format === "pdf") {
        assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
      } else {
        const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
        assert.match(xml, /ОТЧЁТ О СРАВНЕНИИ ДОКУМЕНТОВ/);
        assert.match(xml, /Было \(удалено\)/);
        assert.match(xml, /Стало \(добавлено\)/);
        assert.match(xml, /w:strike/);
        assert.match(xml, /w:u w:val="single"/);
      }
      await assert.rejects(
        comparisonExportForDownload(d1, { exportId: record.id, workspaceId: "workspace-b", userId: "user-b" }),
        (error: unknown) => error instanceof AnalysisExportError && error.code === "ANALYSIS_EXPORT_NOT_FOUND",
      );
      assert.deepEqual(await deleteComparisonExport(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket },
        { exportId: record.id, workspaceId: "workspace-a", userId: "user-a" },
      ), { status: "deleted", exportId: record.id });
      assert.equal(bucket.objects.size, 0);
      assert.deepEqual(await deleteComparisonExport(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket },
        { exportId: record.id, workspaceId: "workspace-a", userId: "user-a" },
      ), { status: "already_deleted", exportId: record.id });
    } finally { sqlite.close(); }
  });
}

test("comparison export migration rejects source mismatch and incomplete completion", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    seed(sqlite);
    assert.throws(() => sqlite.prepare(
      `INSERT INTO comparison_exports
       (id,comparison_id,workspace_id,owner_user_id,format,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('bad-export','comparison-a','workspace-b','user-b','pdf','queued','bad.pdf','application/pdf','bad-comparison-export-0001',?,?)`,
    ).run(now, now), /comparison_export_source_mismatch/);
    sqlite.prepare(
      `INSERT INTO comparison_exports
       (id,comparison_id,workspace_id,owner_user_id,format,status,file_name,mime_type,idempotency_key,created_at,updated_at)
       VALUES ('export-a','comparison-a','workspace-a','user-a','pdf','queued','report.pdf','application/pdf','comparison-export-guard-0001',?,?)`,
    ).run(now, now);
    sqlite.prepare("UPDATE comparison_exports SET status='processing' WHERE id='export-a'").run();
    assert.throws(() => sqlite.prepare("UPDATE comparison_exports SET status='completed' WHERE id='export-a'").run(), /comparison_export_completion_invalid/);
    assert.throws(() => sqlite.prepare("UPDATE comparison_exports SET format='docx' WHERE id='export-a'").run(), /comparison_export_identity_immutable/);
  } finally { sqlite.close(); }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?),(?,?,?,?)")
    .run("user-a", "a@example.test", now, now, "user-b", "b@example.test", now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?),(?,?,?,?,?)")
    .run("workspace-a", "individual", "A", now, now, "workspace-b", "individual", "B", now, now);
  sqlite.prepare(
    `INSERT INTO document_files
     (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
     VALUES ('file-one','workspace-a','user-a','analysis_safe','safe/one','original.pdf','application/pdf',1200,?,?,?),
            ('file-two','workspace-a','user-a','analysis_safe','safe/two','updated.pdf','application/pdf',1200,?,?,?)`,
  ).run("1".repeat(64), now, now, "2".repeat(64), now, now);
  const summary = { totalChanges: 1, materialChanges: 1, riskIncreased: 1, riskDecreased: 0, added: 0, removed: 0, changed: 1, moved: 0, renumbered: 0, formatting: 0, unchanged: 0, changedSections: ["Срок"], similarityPercent: 85, likelyDifferentDocuments: false, overallRisk: "medium", aiStatus: "not_required", sourceStatus: "unverified", model: null, generatedAt: now };
  sqlite.prepare(
    `INSERT INTO document_comparisons
     (id,workspace_id,owner_user_id,version_one_file_id,version_two_file_id,status,stage,locale,summary_json,
      similarity_percent,overall_risk,ai_status,created_at,updated_at)
     VALUES ('comparison-a','workspace-a','user-a','file-one','file-two','completed','completed','ru',?,85,'medium','not_required',?,?)`,
  ).run(JSON.stringify(summary), now, now);
  sqlite.prepare(
    `INSERT INTO comparison_changes
     (id,comparison_id,ordinal,change_type,before_label,after_label,before_heading,after_heading,before_text,after_text,
      word_diff_json,summary,legal_effect,affected_party,risk_effect,risk_level,recommendation,source_ids_json,
      confidence_percent,extraction_warning,created_at)
     VALUES ('change-a','comparison-a',1,'changed','2.1','2.1','Срок','Срок','Срок — 5 дней','Срок — 10 дней',
      '[]','Срок увеличен','Изменён срок исполнения','Заказчик','increased','medium','Проверить приемлемость срока','[]',95,0,?)`,
  ).run(now);
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16))).buffer;
}
