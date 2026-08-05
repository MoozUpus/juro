import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BuilderAnalysisError,
  startBuilderDocumentAnalysis,
} from "../lib/document-analysis/builder-analysis";
import { storeInitialAnalysisDocumentVersion } from "../lib/document-analysis/revisions";
import {
  beginAnalysisVersionObjectAttachment,
  createAnalysisVersionObjectWrite,
  requireAttachedAnalysisVersionObjectWrite,
} from "../lib/document-analysis/version-object-write";
import { applyProjectedDocumentContentVersion } from "../lib/document-builder/document-versions";
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

  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      ...this.metadata(key, value),
      body: new ReadableStream(), bodyUsed: false,
      arrayBuffer: async () => value.bytes.slice().buffer,
      text: async () => new TextDecoder().decode(value.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(value.bytes)),
      blob: async () => new Blob([value.bytes.slice().buffer as ArrayBuffer]),
    };
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

  async delete(key: string) { this.objects.delete(key); }

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

test("corrected Claude analysis version returns to its unchanged Builder revision as an immutable checkpoint", async () => {
  const documentId = "00000000-0000-4000-8000-000000000095";
  const { sqlite, d1 } = seed(documentId);
  const bucket = new FakeR2Bucket();
  try {
    const handoff = await startBuilderDocumentAnalysis({
      db: d1,
      bucket: bucket as unknown as R2Bucket,
      workspaceId: "workspace-a",
      userId: "user-a",
      documentId,
      mode: "quick",
      locale: "ru",
      idempotencyKey: "builder-analysis-correction-roundtrip-0001",
    });
    sqlite.prepare(
      "UPDATE document_analyses SET status='completed',summary_json='{}',error_code=NULL,result_sha256=?,updated_at=? WHERE id=?",
    ).run("d".repeat(64), now, handoff.analysisId);
    const original = "Synthetic legal document content long enough for analysis.";
    const corrected = "Corrected synthetic legal document content with safer terms.";
    const source = await storeInitialAnalysisDocumentVersion(
      { DB: d1, BUCKET: bucket as unknown as R2Bucket },
      { analysisId: handoff.analysisId, workspaceId: "workspace-a", ownerUserId: "user-a", fileName: "contract.md", text: original },
    );
    const riskId = "roundtrip-risk-a";
    const revisionId = "roundtrip-revision-a";
    sqlite.prepare(
      `INSERT INTO document_risks
       (id,analysis_id,level,title,description,excerpt,risk_type,recommendation,
        proposed_wording,legal_basis_source_ids_json,created_at)
       VALUES (?,?,'medium','Synthetic correction','Synthetic evidence',?,'document_internal',
        'Apply reviewed wording',?,'[]',?)`,
    ).run(riskId, handoff.analysisId, original, corrected, now);
    sqlite.prepare(
      `INSERT INTO suggested_revisions
       (id,analysis_id,risk_id,source_version_id,workspace_id,owner_user_id,
        original_text,proposed_text,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,'pending',?,?)`,
    ).run(revisionId, handoff.analysisId, riskId, source.id, "workspace-a", "user-a", original, corrected, now, now);
    const correctedBytes = new TextEncoder().encode(corrected);
    const correctedSha256 = await sha256Hex(correctedBytes);
    const correctedWrite = await createAnalysisVersionObjectWrite(d1, {
      analysisId: handoff.analysisId,
      workspaceId: "workspace-a",
      ownerUserId: "user-a",
      targetVersion: 2,
      sourceKind: "corrected",
      sizeBytes: correctedBytes.byteLength,
      sha256: correctedSha256,
    });
    await bucket.put(correctedWrite.r2Key, correctedBytes, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      sha256: correctedSha256,
    });
    const correctedVersionId = `analysis-version-${crypto.randomUUID()}`;
    await d1.batch([
      beginAnalysisVersionObjectAttachment(d1, correctedWrite, now),
      d1.prepare(
        `INSERT INTO analysis_document_versions
         (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,
          r2_key,object_write_id,file_name,mime_type,size_bytes,sha256,idempotency_key,
          selection_sha256,revision_ids_json,created_by_user_id,created_at)
         VALUES (?,?,?,?,2,?,'corrected',?,?,?,'text/markdown; charset=utf-8',?,?,?,?,?, ?,?)`,
      ).bind(
        correctedVersionId, handoff.analysisId, "workspace-a", "user-a", source.id,
        correctedWrite.r2Key, correctedWrite.id, "contract.corrected-v2.md",
        correctedBytes.byteLength, correctedSha256, "analysis-corrected-roundtrip-0001",
        "c".repeat(64), JSON.stringify([revisionId]), "user-a", now,
      ),
    ]);
    await requireAttachedAnalysisVersionObjectWrite(d1, correctedWrite.id, correctedVersionId);
    const applied = await applyProjectedDocumentContentVersion({
      db: d1,
      bucket: bucket as unknown as R2Bucket,
      documentId,
      workspaceId: "workspace-a",
      ownerUserId: "user-a",
      actorUserId: "user-a",
      revision: 1,
      source: "analysis_correction",
      sourceEntityId: correctedVersionId,
      idempotencyKey: "builder-analysis-correction-apply-0001",
      finalContent: corrected,
      nextStatus: "Черновик",
      revisionSource: "analysis_correction",
      changes: { analysisId: handoff.analysisId, analysisVersionId: correctedVersionId },
    });
    assert.equal(applied.revision, 2);
    assert.equal(applied.version.source, "analysis_correction");
    assert.equal((sqlite.prepare("SELECT final_content AS content FROM document_current_content WHERE document_id=?").get(documentId) as { content: string }).content, corrected);
    assert.equal((sqlite.prepare("SELECT status FROM builder_document_version_object_writes").get() as { status: string }).status, "attached");
  } finally { sqlite.close(); }
});

test("builder analysis route and UI retain security, idempotency and compatibility contracts", async () => {
  const root = new URL("../", import.meta.url);
  const [route, applyRoute, launcher, builder, reviewUi, legacy] = await Promise.all([
    readFile(new URL("app/api/document-builder/documents/[id]/analysis/route.ts", root), "utf8"),
    readFile(new URL("app/api/platform/document-analysis/[analysisId]/versions/[versionId]/apply-builder/route.ts", root), "utf8"),
    readFile(new URL("app/_document-builder/_components/BuilderAnalysisLauncher.tsx", root), "utf8"),
    readFile(new URL("app/_document-builder/_components/ConfigurableDocumentBuilder.tsx", root), "utf8"),
    readFile(new URL("app/_platform/DocumentReviewClient.tsx", root), "utf8"),
    readFile(new URL("app/api/document-builder/ai-review/route.ts", root), "utf8"),
  ]);
  assert.match(route, /assertSafeWrite/);
  assert.match(route, /requireApiUser/);
  assert.match(route, /requireOwner/);
  assert.match(route, /assertOperationalFeatureEnabled/);
  assert.match(route, /idempotency-key/);
  assert.match(applyRoute, /assertSafeWrite/);
  assert.match(applyRoute, /workspaceForUser/);
  assert.match(applyRoute, /handoff\.status='ready'/);
  assert.match(applyRoute, /applyProjectedDocumentContentVersion/);
  assert.match(applyRoute, /source: "analysis_correction"/);
  assert.match(reviewUi, /applyVersionToBuilder/);
  assert.match(reviewUi, /В конструктор/);
  assert.match(launcher, /busyRef/);
  assert.match(launcher, /crypto\.randomUUID/);
  assert.match(launcher, /aria-live="polite"/);
  assert.match(builder, /await save\(id\)/);
  assert.match(builder, /save\(\)\.catch/);
  assert.match(legacy, /deterministicReview/);
});

function seed(documentId = "document-a") {
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
     VALUES (?,'workspace-a','user-a','template-a','template-a',1,'ru','configurable','Synthetic contract','contracts','Черновик',1,?,?)`,
  ).run(documentId, now, now);
  sqlite.prepare("INSERT INTO document_answers(document_id,answers_json,updated_at) VALUES (?,'{}',?)").run(documentId, now);
  sqlite.prepare(
    "INSERT INTO document_current_content(document_id,auto_content,final_content,manually_edited,updated_at) VALUES (?,'Synthetic legal document content long enough for analysis.','Synthetic legal document content long enough for analysis.',0,?)",
  ).run(documentId, now);
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
