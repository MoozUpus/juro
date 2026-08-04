import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisRevisionError,
  analysisSourceVersionId,
  applySuggestedRevisions,
  decideSuggestedRevision,
  listAnalysisRevisionState,
  storeInitialAnalysisDocumentVersion,
  suggestedRevisionId,
} from "../lib/document-analysis/revisions";
import {
  createAnalysisVersionObjectWrite,
  reconcileAnalysisVersionObjectWrites,
} from "../lib/document-analysis/version-object-write";
import { batchBarrier, sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T09:00:00.000Z";

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
    const bytes = value.bytes.slice();
    return {
      ...this.metadata(key, value),
      body: new Blob([bytes]).stream(),
      bodyUsed: false,
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      async text() { return new TextDecoder().decode(bytes); },
      async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
      async blob() { return new Blob([bytes]); },
    };
  }

  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    this.putCalls += 1;
    if (options?.onlyIf?.get("if-none-match") === "*" && this.objects.has(key)) return null;
    if (!(value instanceof Uint8Array)) throw new TypeError("Expected Uint8Array.");
    const bytes = value.slice();
    const sha256 = await sha256Hex(bytes);
    assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 };
    this.objects.set(key, stored);
    return this.metadata(key, stored);
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }

  private metadata(key: string, value: { bytes: Uint8Array; sha256: string }) {
    return {
      key, version: "synthetic", size: value.bytes.byteLength, etag: value.sha256,
      httpEtag: `"${value.sha256}"`, uploaded: new Date(now),
      httpMetadata: { contentType: "text/markdown; charset=utf-8" }, customMetadata: {},
      range: undefined, checksums: { sha256: hexArrayBuffer(value.sha256) },
      storageClass: "Standard", ssecKeyMd5: undefined, writeHttpMetadata() {},
    };
  }
}

test("analysis revisions are tenant-scoped, reviewable, idempotent and create immutable versions", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", "analysis-a", "file-a");
    seedTenant(sqlite, "user-b", "workspace-b", "analysis-b", "file-b");
    const source = "Срок определяется дополнительно. Оплата производится после подписания акта.";
    const sourceVersion = await storeInitialAnalysisDocumentVersion(
      { DB: d1, BUCKET: bucket as unknown as R2Bucket },
      { analysisId: "analysis-a", workspaceId: "workspace-a", ownerUserId: "user-a", fileName: "contract.pdf", text: source },
    );
    assert.equal(sourceVersion.version, 1);
    sqlite.prepare("UPDATE document_analyses SET status='completed' WHERE id='analysis-a'").run();
    seedRevision(sqlite, {
      analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", riskId: "risk-a",
      originalText: "Срок определяется дополнительно.", proposedText: "Срок исполнения составляет 10 календарных дней.",
    });
    const revisionId = suggestedRevisionId("risk-a");

    const state = await listAnalysisRevisionState(d1, { analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a" });
    assert.equal(state.revisions.length, 1);
    assert.equal(state.revisions[0]?.status, "pending");
    await assert.rejects(
      listAnalysisRevisionState(d1, { analysisId: "analysis-a", workspaceId: "workspace-b", userId: "user-b" }),
      (error: unknown) => error instanceof AnalysisRevisionError && error.code === "ANALYSIS_REVISION_NOT_FOUND",
    );

    const accepted = await decideSuggestedRevision(d1, {
      analysisId: "analysis-a", revisionId, workspaceId: "workspace-a", userId: "user-a", decision: "accepted",
    });
    assert.equal(accepted.revision.status, "accepted");
    assert.equal((await decideSuggestedRevision(d1, {
      analysisId: "analysis-a", revisionId, workspaceId: "workspace-a", userId: "user-a", decision: "accepted",
    })).replay, true);

    const input = {
      analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", mode: "selected" as const,
      revisionIds: [revisionId], idempotencyKey: "analysis-revision-integration-0001",
    };
    const applied = await applySuggestedRevisions({ DB: d1, BUCKET: bucket as unknown as R2Bucket }, input);
    assert.equal(applied.version.version, 2);
    assert.equal(applied.partial, false);
    const correctedKey = (sqlite.prepare(
      "SELECT r2_key AS r2Key FROM analysis_document_versions WHERE id=?",
    ).get(applied.version.id) as { r2Key: string }).r2Key;
    const stored = bucket.objects.get(correctedKey);
    assert.ok(stored);
    assert.equal(
      new TextDecoder().decode(stored.bytes),
      "Срок исполнения составляет 10 календарных дней. Оплата производится после подписания акта.",
    );
    assert.equal((sqlite.prepare("SELECT status FROM suggested_revisions WHERE id=?").get(revisionId) as { status: string }).status, "applied");
    assert.throws(
      () => sqlite.prepare("UPDATE analysis_document_versions SET file_name='changed.md' WHERE id=?").run(applied.version.id),
      /analysis_document_version_immutable/,
    );
    const replay = await applySuggestedRevisions({ DB: d1, BUCKET: bucket as unknown as R2Bucket }, input);
    assert.equal(replay.replay, true);
    assert.equal(replay.version.id, applied.version.id);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_document_versions WHERE analysis_id='analysis-a'").get() as { count: number }).count, 2);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM workspace_audit_events WHERE action='analysis_revisions_applied'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_version_object_writes WHERE status='attached'").get() as { count: number }).count, 2);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_document_versions WHERE object_write_id IS NOT NULL").get() as { count: number }).count, 2);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    sqlite.prepare("DELETE FROM document_analyses WHERE id='analysis-a'").run();
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_document_versions WHERE analysis_id='analysis-a'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM suggested_revisions WHERE analysis_id='analysis-a'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_version_object_writes WHERE analysis_id='analysis-a'").get() as { count: number }).count, 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("stale unattached analysis version objects are fenced, deleted, and audited", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", "analysis-a", "file-a");
    const bytes = new TextEncoder().encode("unattached corrected document");
    const sha256 = await sha256Hex(bytes);
    const write = await createAnalysisVersionObjectWrite(d1, {
      analysisId: "analysis-a",
      workspaceId: "workspace-a",
      ownerUserId: "user-a",
      targetVersion: 2,
      sourceKind: "corrected",
      sizeBytes: bytes.byteLength,
      sha256,
    });
    await bucket.put(write.r2Key, bytes, { sha256 });
    const reconciliationNow = new Date(Date.parse(write.updatedAt) + 60 * 60 * 1_000).toISOString();

    const result = await reconcileAnalysisVersionObjectWrites({
      db: d1,
      bucket: bucket as unknown as R2Bucket,
      now: reconciliationNow,
      graceMs: 60_000,
    });
    assert.deepEqual(result, { eligible: 1, claimed: 1, attached: 0, deleted: 1, retrying: 0 });
    assert.equal(bucket.objects.has(write.r2Key), false);
    const state = sqlite.prepare(
      "SELECT status,attempt_count AS attemptCount,reconciled_at AS reconciledAt FROM analysis_version_object_writes WHERE id=?",
    ).get(write.id) as { status: string; attemptCount: number; reconciledAt: string | null };
    assert.equal(state.status, "deleted");
    assert.equal(state.attemptCount, 1);
    assert.equal(state.reconciledAt, reconciliationNow);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS count FROM workspace_audit_events WHERE entity_id=? AND action='orphan_object_deleted'",
    ).get(write.id) as { count: number }).count, 1);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("concurrent correction writers leave one attached version and a reclaimable orphan", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", "analysis-a", "file-a");
    await storeInitialAnalysisDocumentVersion(
      { DB: d1, BUCKET: bucket as unknown as R2Bucket },
      { analysisId: "analysis-a", workspaceId: "workspace-a", ownerUserId: "user-a", fileName: "contract.pdf", text: "Срок определяется дополнительно." },
    );
    sqlite.prepare("UPDATE document_analyses SET status='completed' WHERE id='analysis-a'").run();
    seedRevision(sqlite, {
      analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", riskId: "risk-a",
      originalText: "Срок определяется дополнительно.", proposedText: "Срок исполнения составляет 10 календарных дней.",
    });
    const revisionId = suggestedRevisionId("risk-a");
    await decideSuggestedRevision(d1, {
      analysisId: "analysis-a", revisionId, workspaceId: "workspace-a", userId: "user-a", decision: "accepted",
    });
    const synchronized = batchBarrier(d1, 2);
    const outcomes = await Promise.allSettled([
      applySuggestedRevisions(
        { DB: synchronized, BUCKET: bucket as unknown as R2Bucket },
        { analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", mode: "selected", revisionIds: [revisionId], idempotencyKey: "analysis-race-writer-one-0001" },
      ),
      applySuggestedRevisions(
        { DB: synchronized, BUCKET: bucket as unknown as R2Bucket },
        { analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", mode: "selected", revisionIds: [revisionId], idempotencyKey: "analysis-race-writer-two-0001" },
      ),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS count FROM analysis_document_versions WHERE analysis_id='analysis-a' AND version=2",
    ).get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS count FROM analysis_version_object_writes WHERE analysis_id='analysis-a' AND status='attached'",
    ).get() as { count: number }).count, 2);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS count FROM analysis_version_object_writes WHERE analysis_id='analysis-a' AND status='pending'",
    ).get() as { count: number }).count, 1);
    assert.equal(bucket.objects.size, 3);

    const latestUpdate = (sqlite.prepare(
      "SELECT max(updated_at) AS updatedAt FROM analysis_version_object_writes WHERE status='pending'",
    ).get() as { updatedAt: string }).updatedAt;
    const result = await reconcileAnalysisVersionObjectWrites({
      db: d1,
      bucket: bucket as unknown as R2Bucket,
      now: new Date(Date.parse(latestUpdate) + 60 * 60 * 1_000).toISOString(),
      graceMs: 60_000,
    });
    assert.equal(result.deleted, 1);
    assert.equal(bucket.objects.size, 2);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS count FROM analysis_version_object_writes WHERE analysis_id='analysis-a' AND status='deleted'",
    ).get() as { count: number }).count, 1);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("ambiguous excerpts fail closed without a corrected version", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", "analysis-a", "file-a");
    await storeInitialAnalysisDocumentVersion(
      { DB: d1, BUCKET: bucket as unknown as R2Bucket },
      { analysisId: "analysis-a", workspaceId: "workspace-a", ownerUserId: "user-a", fileName: "contract.pdf", text: "Штраф начисляется. Штраф начисляется." },
    );
    sqlite.prepare("UPDATE document_analyses SET status='completed' WHERE id='analysis-a'").run();
    seedRevision(sqlite, {
      analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", riskId: "risk-a",
      originalText: "Штраф начисляется.", proposedText: "Штраф составляет 1 процент.",
    });
    await assert.rejects(
      applySuggestedRevisions(
        { DB: d1, BUCKET: bucket as unknown as R2Bucket },
        { analysisId: "analysis-a", workspaceId: "workspace-a", userId: "user-a", mode: "all", revisionIds: [], idempotencyKey: "analysis-revision-ambiguous-0001" },
      ),
      (error: unknown) => error instanceof AnalysisRevisionError && error.code === "ANALYSIS_REVISION_NO_APPLICABLE_CHANGES",
    );
    assert.equal((sqlite.prepare("SELECT status FROM suggested_revisions").get() as { status: string }).status, "ambiguous");
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_document_versions").get() as { count: number }).count, 1);
  } finally {
    sqlite.close();
  }
});

test("0069 and 0073 reject cross-tenant, unreviewed, and mismatched object evidence", async () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", "analysis-a", "file-a");
    seedTenant(sqlite, "user-b", "workspace-b", "analysis-b", "file-b");
    assert.throws(
      () => sqlite.prepare(`INSERT INTO analysis_version_object_writes
        (id,analysis_id,workspace_id,owner_user_id,target_version,source_kind,r2_key,size_bytes,sha256,
         status,version_id,attempt_count,last_error_code,created_at,updated_at,reconciled_at)
        VALUES ('cross-write','analysis-a','workspace-b','user-b',1,'extracted',
          'analysis-versions/workspace-b/analysis-a/cross-write-1-source.md',10,?,'pending',NULL,0,NULL,?,?,NULL)`).run(
        "9".repeat(64), now, now,
      ),
      /analysis_version_object_write_source_mismatch/,
    );
    sqlite.prepare(`INSERT INTO analysis_version_object_writes
      (id,analysis_id,workspace_id,owner_user_id,target_version,source_kind,r2_key,size_bytes,sha256,
       status,version_id,attempt_count,last_error_code,created_at,updated_at,reconciled_at)
      VALUES ('write-b','analysis-b','workspace-b','user-b',1,'extracted',
        'analysis-versions/workspace-b/analysis-b/write-b-1-source.md',10,?,'pending',NULL,0,NULL,?,?,NULL)`).run(
      "8".repeat(64), now, now,
    );
    assert.throws(
      () => sqlite.prepare(
        "UPDATE analysis_version_object_writes SET r2_key='analysis-versions/workspace-b/analysis-b/replaced.md' WHERE id='write-b'",
      ).run(),
      /analysis_version_object_write_(identity_immutable|transition_invalid)/,
    );
    sqlite.prepare(
      "UPDATE analysis_version_object_writes SET status='attaching',updated_at=? WHERE id='write-b'",
    ).run(now);
    assert.throws(
      () => sqlite.prepare(`INSERT INTO analysis_document_versions
        (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,object_write_id,
         file_name,mime_type,size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at)
        VALUES ('bad-object-version','analysis-b','workspace-b','user-b',1,NULL,'extracted',
          'analysis-versions/workspace-b/analysis-b/write-b-1-source.md','write-b','source.md',
          'text/markdown; charset=utf-8',10,?,NULL,NULL,'[]',NULL,?)`).run("7".repeat(64), now),
      /analysis_document_version_object_write_mismatch/,
    );
    sqlite.prepare(`INSERT INTO analysis_document_versions
      (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,file_name,mime_type,
       size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at)
      VALUES (?,?,?,?,1,NULL,'extracted',?,?,'text/markdown; charset=utf-8',10,?,NULL,NULL,'[]',NULL,?)`).run(
      analysisSourceVersionId("analysis-a"), "analysis-a", "workspace-a", "user-a",
      "analysis-versions/workspace-a/analysis-a/1-source.md", "contract.normalized-v1.md", "a".repeat(64), now,
    );
    sqlite.prepare("UPDATE document_analyses SET status='completed' WHERE id='analysis-a'").run();
    sqlite.prepare(`INSERT INTO document_risks
      (id,analysis_id,level,title,description,excerpt,risk_type,recommendation,proposed_wording,legal_basis_source_ids_json,created_at)
      VALUES ('risk-a','analysis-a','medium','Срок','Описание','Срок','document_internal','Уточнить','10 дней','[]',?)`).run(now);
    assert.throws(
      () => sqlite.prepare(`INSERT INTO suggested_revisions
        (id,analysis_id,risk_id,source_version_id,workspace_id,owner_user_id,original_text,proposed_text,status,created_at,updated_at)
        VALUES ('cross','analysis-a','risk-a',?,'workspace-b','user-b','Срок','10 дней','pending',?,?)`).run(analysisSourceVersionId("analysis-a"), now, now),
      /suggested_revision_source_mismatch/,
    );
    assert.throws(
      () => sqlite.prepare(`INSERT INTO analysis_document_versions
        (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,file_name,mime_type,
         size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at)
        VALUES ('bad-v2','analysis-a','workspace-a','user-a',2,?,'corrected','analysis-versions/workspace-a/analysis-a/2-bad.md',
        'contract.normalized-v2.md','text/markdown; charset=utf-8',10,?,'revision-invalid-0001',?,'["missing"]','user-a',?)`).run(
        analysisSourceVersionId("analysis-a"), "b".repeat(64), "c".repeat(64), now,
      ),
      /analysis_document_version_revision_mismatch/,
    );
    sqlite.prepare(`INSERT INTO suggested_revisions
      (id,analysis_id,risk_id,source_version_id,workspace_id,owner_user_id,original_text,proposed_text,status,created_at,updated_at)
      VALUES ('revision-a','analysis-a','risk-a',?,'workspace-a','user-a','Срок','10 дней','pending',?,?)`).run(
      analysisSourceVersionId("analysis-a"), now, now,
    );
    assert.throws(
      () => sqlite.prepare(`INSERT INTO analysis_document_versions
        (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,file_name,mime_type,
         size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,created_by_user_id,created_at)
        VALUES ('duplicate-v2','analysis-a','workspace-a','user-a',2,?,'corrected','analysis-versions/workspace-a/analysis-a/2-duplicate.md',
        'contract.normalized-v2.md','text/markdown; charset=utf-8',10,?,'revision-duplicate-0001',?,'["revision-a","revision-a"]','user-a',?)`).run(
        analysisSourceVersionId("analysis-a"), "d".repeat(64), "e".repeat(64), now,
      ),
      /analysis_document_version_revision_mismatch/,
    );
  } finally {
    sqlite.close();
  }
});

function seedTenant(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  userId: string,
  workspaceId: string,
  analysisId: string,
  fileId: string,
) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)").run(userId, `${userId}@example.test`, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(workspaceId, "individual", workspaceId, now, now);
  sqlite.prepare(`INSERT INTO document_files
    (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
    VALUES (?,?,?,'analysis_safe',?,'contract.pdf','application/pdf',10,?,?,?)`).run(
    fileId, workspaceId, userId, `safe/${workspaceId}/${analysisId}/${fileId}`, "f".repeat(64), now, now,
  );
  sqlite.prepare(`INSERT INTO document_analyses
    (id,workspace_id,owner_user_id,uploaded_file_id,status,consent_version,created_at,updated_at)
    VALUES (?,?,?,?,'processing','2026-08-04',?,?)`).run(analysisId, workspaceId, userId, fileId, now, now);
}

function seedRevision(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: { analysisId: string; workspaceId: string; userId: string; riskId: string; originalText: string; proposedText: string },
) {
  sqlite.prepare(`INSERT INTO document_risks
    (id,analysis_id,level,title,description,excerpt,confidence_percent,risk_type,clause,page,recommendation,
     proposed_wording,legal_basis_source_ids_json,created_at)
    VALUES (?,?,'medium','Неясный срок','Срок требует уточнения',?,90,'document_internal','2.1',1,
      'Указать точный срок',?,'[]',?)`).run(input.riskId, input.analysisId, input.originalText, input.proposedText, now);
  sqlite.prepare(`INSERT INTO suggested_revisions
    (id,analysis_id,risk_id,source_version_id,workspace_id,owner_user_id,original_text,proposed_text,status,
     decided_by_user_id,decided_at,applied_version_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,?,?)`).run(
    suggestedRevisionId(input.riskId), input.analysisId, input.riskId, analysisSourceVersionId(input.analysisId),
    input.workspaceId, input.userId, input.originalText, input.proposedText, now, now,
  );
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16))).buffer;
}
