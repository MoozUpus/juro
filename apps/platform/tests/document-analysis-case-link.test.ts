import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AnalysisCaseLinkError,
  analysisCaseLinkInputSchema,
  changeAnalysisCaseLink,
} from "../lib/document-analysis/analysis-case-link";
import {
  hashUploadIntent,
  initializeDocumentAnalysisUpload,
  type DocumentAnalysisUploadIntent,
} from "../lib/document-analysis/upload-pipeline";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T12:00:00.000Z";
const caseA = "11111111-1111-4111-8111-111111111111";
const caseA2 = "22222222-2222-4222-8222-222222222222";
const caseB = "33333333-3333-4333-8333-333333333333";
const analysisA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("analysis case-link input accepts only a UUID or explicit null", () => {
  assert.equal(analysisCaseLinkInputSchema.safeParse({ caseId: caseA }).success, true);
  assert.equal(analysisCaseLinkInputSchema.safeParse({ caseId: null }).success, true);
  assert.equal(analysisCaseLinkInputSchema.safeParse({ caseId: "not-a-case" }).success, false);
  assert.equal(analysisCaseLinkInputSchema.safeParse({}).success, false);
  assert.equal(analysisCaseLinkInputSchema.safeParse({ caseId: caseA, workspaceId: "workspace-b" }).success, false);
});

test("analysis links are tenant-bound, idempotent, auditable and append-only", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", analysisA, "file-a", [caseA, caseA2]);
    seedTenant(sqlite, "user-b", "workspace-b", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "file-b", [caseB]);

    const first = await changeAnalysisCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
      caseId: caseA, idempotencyKey: "analysis-case-link-first-0001",
    });
    assert.deepEqual(first, { analysisId: analysisA, caseId: caseA, revision: 1, replay: false, changed: true });
    assert.deepEqual({ ...projection(sqlite) }, { caseId: caseA, revision: 1, linkedBy: "user-a" });
    assert.equal(eventCount(sqlite, "analysis_linked", caseA), 1);
    assert.equal(auditCount(sqlite), 1);

    const replay = await changeAnalysisCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
      caseId: caseA, idempotencyKey: "analysis-case-link-first-0001",
    });
    assert.equal(replay.replay, true);
    assert.equal(eventCount(sqlite, "analysis_linked", caseA), 1);
    assert.equal(auditCount(sqlite), 1);
    await assert.rejects(
      changeAnalysisCaseLink({
        db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
        caseId: caseA2, idempotencyKey: "analysis-case-link-first-0001",
      }),
      (error: unknown) => error instanceof AnalysisCaseLinkError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      changeAnalysisCaseLink({
        db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
        caseId: caseB, idempotencyKey: "analysis-case-link-foreign-001",
      }),
      (error: unknown) => error instanceof AnalysisCaseLinkError && error.code === "CASE_UNAVAILABLE",
    );

    const moved = await changeAnalysisCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
      caseId: caseA2, idempotencyKey: "analysis-case-link-second-0002",
    });
    assert.equal(moved.revision, 2);
    assert.deepEqual({ ...projection(sqlite) }, { caseId: caseA2, revision: 2, linkedBy: "user-a" });
    assert.equal(eventCount(sqlite, "analysis_unlinked", caseA), 1);
    assert.equal(eventCount(sqlite, "analysis_linked", caseA2), 1);

    const unlinked = await changeAnalysisCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
      caseId: null, idempotencyKey: "analysis-case-unlink-third-0003",
    });
    assert.equal(unlinked.revision, 3);
    assert.deepEqual({ ...projection(sqlite) }, { caseId: null, revision: 3, linkedBy: "user-a" });
    assert.equal(eventCount(sqlite, "analysis_unlinked", caseA2), 1);

    assert.throws(
      () => sqlite.prepare("UPDATE document_analyses SET case_id=? WHERE id=?").run(caseA, analysisA),
      /document_analysis_case_projection_guard/,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE analysis_case_link_events SET request_hash=? WHERE analysis_id=?").run("f".repeat(64), analysisA),
      /analysis_case_link_event_immutable/,
    );
    assert.throws(
      () => sqlite.prepare(`INSERT INTO analysis_case_link_events
        (id,analysis_id,workspace_id,owner_user_id,actor_user_id,from_case_id,to_case_id,mutation_version,idempotency_key,request_hash,created_at)
        VALUES ('cross-tenant',?,?,'user-a','user-a',NULL,?,4,'analysis-case-cross-tenant-04',?,?)`).run(
        analysisA, "workspace-a", caseB, "d".repeat(64), now,
      ),
      /analysis_case_link_source_mismatch/,
    );
  } finally {
    sqlite.close();
  }
});

test("a stale competing link writer cannot overwrite the winning projection", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", analysisA, "file-a", [caseA, caseA2]);
    await changeAnalysisCaseLink({ db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA, caseId: caseA, idempotencyKey: "analysis-case-race-writer-a" });
    assert.throws(
      () => sqlite.prepare(`INSERT INTO analysis_case_link_events
        (id,analysis_id,workspace_id,owner_user_id,actor_user_id,from_case_id,to_case_id,mutation_version,idempotency_key,request_hash,created_at)
        VALUES ('stale-writer',?,'workspace-a','user-a','user-a',NULL,?,1,'analysis-case-race-writer-b',?,?)`).run(
        analysisA, caseA2, "e".repeat(64), now,
      ),
      /analysis_case_link_source_mismatch/,
    );
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_case_link_events WHERE analysis_id=?").get(analysisA) as { count: number }).count, 1);
    assert.equal(projection(sqlite).revision, 1);
  } finally {
    sqlite.close();
  }
});

test("secure upload can atomically start inside an owned case", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedIdentity(sqlite, "user-a", "workspace-a");
    seedCase(sqlite, caseA, "workspace-a", "user-a");
    const intent: DocumentAnalysisUploadIntent = {
      fileName: "contract.pdf", mimeType: "application/pdf", sizeBytes: 128,
      sha256: "a".repeat(64), locale: "ru", mode: "quick", caseId: caseA, consent: true,
    };
    const result = await initializeDocumentAnalysisUpload({
      db: d1, workspaceId: "workspace-a", userId: "user-a",
      idempotencyKey: "analysis-upload-with-case-0001", requestHash: await hashUploadIntent(intent), intent,
    });
    assert.equal(result.record.caseId, caseA);
    const row = sqlite.prepare("SELECT case_id AS caseId,case_link_revision AS revision FROM document_analyses WHERE id=?").get(result.record.analysisId) as { caseId: string; revision: number };
    assert.deepEqual({ ...row }, { caseId: caseA, revision: 1 });
    assert.equal(eventCount(sqlite, "analysis_linked", caseA), 1);
    assert.equal(auditCount(sqlite), 2, "upload plus case-link audit are both retained");
  } finally {
    sqlite.close();
  }
});

test("case-link evidence does not obstruct an authorized account cascade", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", analysisA, "file-a", [caseA]);
    await changeAnalysisCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", analysisId: analysisA,
      caseId: caseA, idempotencyKey: "analysis-case-account-purge-01",
    });
    sqlite.prepare("DELETE FROM user_profiles WHERE id='user-a'").run();
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM document_analyses WHERE id=?").get(analysisA) as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM analysis_case_link_events WHERE analysis_id=?").get(analysisA) as { count: number }).count, 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("case-link route and clients require auth, CSRF, strict input and server-resolved tenants", async () => {
  const [route, uploadRoute, reviewRoute, reviewClient, uploadClient] = await Promise.all([
    readFile(new URL("../app/api/platform/document-analysis/[analysisId]/case/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-analysis/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/document-review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/DocumentReviewClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/document-analysis/client-upload.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /workspaceForUser\(user\)/);
  assert.match(route, /analysisCaseLinkInputSchema\.safeParse/);
  assert.match(route, /request\.headers\.get\("idempotency-key"\)/);
  assert.doesNotMatch(route, /workspaceId:\s*parsed\.data|ownerUserId:\s*parsed\.data/);
  assert.match(uploadRoute, /cases WHERE id=\? AND workspace_id=\? AND archived_at IS NULL/);
  assert.match(reviewRoute, /a\.case_id AS caseId/);
  assert.match(reviewRoute, /FROM cases WHERE workspace_id=\? AND archived_at IS NULL/);
  assert.match(reviewClient, /initialCaseId=\{searchParams\.get\("caseId"\)\}/);
  assert.match(reviewClient, /idempotency-key/);
  assert.match(uploadClient, /caseId: caseId \|\| null/);
  assert.doesNotMatch(reviewClient, /dangerouslySetInnerHTML/);
});

function seedTenant(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  userId: string,
  workspaceId: string,
  analysisId: string,
  fileId: string,
  caseIds: string[],
) {
  seedIdentity(sqlite, userId, workspaceId);
  for (const id of caseIds) seedCase(sqlite, id, workspaceId, userId);
  sqlite.prepare(`INSERT INTO document_files
    (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
    VALUES (?,?,?,'analysis_safe',?,'contract.pdf','application/pdf',128,?,?,?)`).run(
    fileId, workspaceId, userId, `safe/${workspaceId}/${analysisId}/${fileId}`, "a".repeat(64), now, now,
  );
  sqlite.prepare(`INSERT INTO document_analyses
    (id,workspace_id,owner_user_id,uploaded_file_id,status,consent_version,created_at,updated_at)
    VALUES (?,?,?,?,'completed','2026-08-04',?,?)`).run(analysisId, workspaceId, userId, fileId, now, now);
}

function seedIdentity(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], userId: string, workspaceId: string) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)").run(userId, `${userId}@example.test`, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(workspaceId, "individual", workspaceId, now, now);
}

function seedCase(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], id: string, workspaceId: string, userId: string) {
  sqlite.prepare(`INSERT INTO cases
    (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,current_revision,created_at,updated_at)
    VALUES (?,?,?,'individual','ru',?,'contracts','open',1,?,?)`).run(id, workspaceId, userId, `Case ${id.slice(0, 4)}`, now, now);
}

function projection(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): { caseId: string | null; revision: number; linkedBy: string | null } {
  return sqlite.prepare("SELECT case_id AS caseId,case_link_revision AS revision,case_linked_by_user_id AS linkedBy FROM document_analyses WHERE id=?").get(analysisA) as { caseId: string | null; revision: number; linkedBy: string | null };
}

function eventCount(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], eventType: string, caseId: string): number {
  return (sqlite.prepare("SELECT count(*) AS count FROM case_events WHERE event_type=? AND case_id=?").get(eventType, caseId) as { count: number }).count;
}

function auditCount(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): number {
  return (sqlite.prepare("SELECT count(*) AS count FROM workspace_audit_events WHERE entity_type='document_analysis'").get() as { count: number }).count;
}
