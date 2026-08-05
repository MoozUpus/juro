import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BuilderAnalysisError,
  startBuilderDocumentAnalysis,
} from "../lib/document-analysis/builder-analysis";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-05T12:00:00.000Z";

class FakeR2Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; sha256: string }>();
  putCalls = 0;
  failPut = false;

  async head(key: string) {
    const value = this.objects.get(key);
    return value ? this.metadata(key, value) : null;
  }

  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    this.putCalls += 1;
    if (this.failPut) throw new Error("synthetic R2 write failure");
    if (options?.onlyIf instanceof Headers && options.onlyIf.get("if-none-match") === "*" && this.objects.has(key)) return null;
    if (!(value instanceof Uint8Array)) throw new TypeError("Expected Uint8Array snapshot.");
    const bytes = value.slice();
    const sha256 = await sha256Hex(bytes);
    assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 };
    this.objects.set(key, stored);
    return this.metadata(key, stored);
  }

  private metadata(key: string, value: { bytes: Uint8Array; sha256: string }) {
    return {
      key,
      version: "synthetic",
      size: value.bytes.byteLength,
      etag: value.sha256,
      httpEtag: `"${value.sha256}"`,
      uploaded: new Date(now),
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
      customMetadata: {},
      range: undefined,
      checksums: { sha256: hexArrayBuffer(value.sha256) },
      storageClass: "Standard",
      ssecKeyMd5: undefined,
      writeHttpMetadata() {},
    };
  }
}

test("builder analysis persists an immutable R2 snapshot, queues once and replays idempotently", async () => {
  const { sqlite, d1 } = seed();
  const bucket = new FakeR2Bucket();
  const input = {
    db: d1,
    bucket: bucket as unknown as R2Bucket,
    workspaceId: "workspace-a",
    userId: "user-a",
    documentId: "document-a",
    mode: "quick" as const,
    locale: "ru" as const,
    idempotencyKey: "builder-analysis-test-0001",
  };
  try {
    const created = await startBuilderDocumentAnalysis(input);
    assert.equal(created.replayed, false);
    assert.equal(created.status, "queued");
    assert.equal(bucket.putCalls, 1);
    assert.equal(bucket.objects.size, 1);
    const handoff = sqlite.prepare(
      "SELECT status,attempt_count AS attemptCount,last_error_code AS errorCode,idempotency_key_sha256 AS keyHash FROM builder_document_analysis_handoffs",
    ).get() as { status: string; attemptCount: number; errorCode: string | null; keyHash: string };
    assert.deepEqual({ ...handoff, keyHash: handoff.keyHash.length }, { status: "ready", attemptCount: 0, errorCode: null, keyHash: 64 });
    assert.equal((sqlite.prepare("SELECT kind FROM document_files WHERE id=?").get(created.fileId) as { kind: string }).kind, "analysis_safe");
    assert.equal((sqlite.prepare("SELECT status FROM document_analyses WHERE id=?").get(created.analysisId) as { status: string }).status, "ready");
    assert.equal((sqlite.prepare("SELECT count(*) AS total FROM job_outbox WHERE subject_id=? AND status='pending'").get(created.analysisId) as { total: number }).total, 1);

    const replay = await startBuilderDocumentAnalysis(input);
    assert.deepEqual(replay, { ...created, replayed: true });
    assert.equal(bucket.putCalls, 1);
    assert.equal((sqlite.prepare("SELECT count(*) AS total FROM builder_document_analysis_handoffs").get() as { total: number }).total, 1);

    sqlite.prepare("UPDATE documents SET revision=2 WHERE id='document-a'").run();
    sqlite.prepare("UPDATE document_current_content SET final_content='A changed synthetic legal document with enough content.' WHERE document_id='document-a'").run();
    await assert.rejects(
      startBuilderDocumentAnalysis(input),
      (error: unknown) => error instanceof BuilderAnalysisError && error.code === "BUILDER_ANALYSIS_IDEMPOTENCY_CONFLICT",
    );
  } finally { sqlite.close(); }
});

test("builder analysis enforces tenant ownership and paid depth", async () => {
  const { sqlite, d1 } = seed();
  const bucket = new FakeR2Bucket();
  try {
    await assert.rejects(
      startBuilderDocumentAnalysis({
        db: d1, bucket: bucket as unknown as R2Bucket, workspaceId: "workspace-b", userId: "user-b",
        documentId: "document-a", mode: "quick", locale: "ru", idempotencyKey: "builder-analysis-foreign-0001",
      }),
      (error: unknown) => error instanceof BuilderAnalysisError && error.code === "BUILDER_ANALYSIS_NOT_FOUND",
    );
    await assert.rejects(
      startBuilderDocumentAnalysis({
        db: d1, bucket: bucket as unknown as R2Bucket, workspaceId: "workspace-a", userId: "user-a",
        documentId: "document-a", mode: "full", locale: "ru", idempotencyKey: "builder-analysis-plan-0001",
      }),
      (error: unknown) => error instanceof BuilderAnalysisError && error.code === "BUILDER_ANALYSIS_PLAN_LIMIT",
    );
    sqlite.prepare(
      "INSERT INTO subscriptions(id,workspace_id,provider,plan_code,status,current_period_ends_at,created_at,updated_at) VALUES ('sub-a','workspace-a','manual','individual','active','2027-01-01T00:00:00.000Z',?,?)",
    ).run(now, now);
    const paid = await startBuilderDocumentAnalysis({
      db: d1, bucket: bucket as unknown as R2Bucket, workspaceId: "workspace-a", userId: "user-a",
      documentId: "document-a", mode: "expert", locale: "uz", idempotencyKey: "builder-analysis-paid-0001",
    });
    assert.equal(paid.status, "queued");
  } finally { sqlite.close(); }
});

test("R2 failure is fail-closed and retryable with the same request key", async () => {
  const { sqlite, d1 } = seed();
  const bucket = new FakeR2Bucket();
  bucket.failPut = true;
  const input = {
    db: d1, bucket: bucket as unknown as R2Bucket, workspaceId: "workspace-a", userId: "user-a",
    documentId: "document-a", mode: "quick" as const, locale: "ru" as const, idempotencyKey: "builder-analysis-r2-retry-0001",
  };
  try {
    await assert.rejects(
      startBuilderDocumentAnalysis(input),
      (error: unknown) => error instanceof BuilderAnalysisError && error.code === "BUILDER_ANALYSIS_STORAGE_FAILED",
    );
    assert.deepEqual({ ...(sqlite.prepare("SELECT status,attempt_count AS attempts,last_error_code AS code FROM builder_document_analysis_handoffs").get() as object) }, {
      status: "pending", attempts: 1, code: "R2_SNAPSHOT_WRITE_FAILED",
    });
    assert.equal((sqlite.prepare("SELECT count(*) AS total FROM job_outbox").get() as { total: number }).total, 0);
    bucket.failPut = false;
    const retry = await startBuilderDocumentAnalysis(input);
    assert.equal(retry.replayed, true);
    assert.equal((sqlite.prepare("SELECT count(*) AS total FROM job_outbox").get() as { total: number }).total, 1);
  } finally { sqlite.close(); }
});

test("builder analysis route and UI retain security, idempotency and compatibility contracts", async () => {
  const root = new URL("../", import.meta.url);
  const [route, launcher, builder, legacy] = await Promise.all([
    readFile(new URL("app/api/document-builder/documents/[id]/analysis/route.ts", root), "utf8"),
    readFile(new URL("app/_document-builder/_components/BuilderAnalysisLauncher.tsx", root), "utf8"),
    readFile(new URL("app/_document-builder/_components/ConfigurableDocumentBuilder.tsx", root), "utf8"),
    readFile(new URL("app/api/document-builder/ai-review/route.ts", root), "utf8"),
  ]);
  assert.match(route, /assertSafeWrite/);
  assert.match(route, /requireApiUser/);
  assert.match(route, /requireOwner/);
  assert.match(route, /assertOperationalFeatureEnabled/);
  assert.match(route, /idempotency-key/);
  assert.match(launcher, /busyRef/);
  assert.match(launcher, /crypto\.randomUUID/);
  assert.match(launcher, /aria-live="polite"/);
  assert.match(builder, /await save\(id\)/);
  assert.match(builder, /save\(\)\.catch/);
  assert.match(legacy, /deterministicReview/);
});

function seed() {
  const fixture = sqliteD1Fixture();
  const { sqlite } = fixture;
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','a@example.invalid',?,?),('user-b','b@example.invalid',?,?)")
    .run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?),('workspace-b','individual','B',?,?)")
    .run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-a','workspace-a','user-a','owner','active',?,?,?),('member-b','workspace-b','user-b','owner','active',?,?,?)")
    .run(now, now, now, now, now, now);
  sqlite.prepare("INSERT INTO document_templates(id,key,category,active,created_at,updated_at) VALUES ('template-a','template-a','contracts',1,?,?)")
    .run(now, now);
  sqlite.prepare(
    `INSERT INTO documents
     (id,workspace_id,owner_user_id,template_id,template_code,template_version,language,participant_mode,title,category,status,revision,created_at,updated_at)
     VALUES ('document-a','workspace-a','user-a','template-a','template-a',1,'ru','configurable','Synthetic contract','contracts','Черновик',1,?,?)`,
  ).run(now, now);
  sqlite.prepare(
    "INSERT INTO document_current_content(document_id,auto_content,final_content,manually_edited,updated_at) VALUES ('document-a','Synthetic legal document content long enough for analysis.','Synthetic legal document content long enough for analysis.',0,?)",
  ).run(now);
  return fixture;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexArrayBuffer(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes.buffer;
}
