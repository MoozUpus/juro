import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DocumentCaseLinkError,
  changeDocumentCaseLink,
  documentCaseLinkInputSchema,
} from "../lib/document-builder/document-case-link";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T13:00:00.000Z";
const caseA = "11111111-1111-4111-8111-111111111111";
const caseA2 = "22222222-2222-4222-8222-222222222222";
const caseB = "33333333-3333-4333-8333-333333333333";
const documentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("document case-link input accepts only a UUID or explicit null", () => {
  assert.equal(documentCaseLinkInputSchema.safeParse({ caseId: caseA }).success, true);
  assert.equal(documentCaseLinkInputSchema.safeParse({ caseId: null }).success, true);
  assert.equal(documentCaseLinkInputSchema.safeParse({ caseId: "not-a-case" }).success, false);
  assert.equal(documentCaseLinkInputSchema.safeParse({}).success, false);
  assert.equal(documentCaseLinkInputSchema.safeParse({ caseId: caseA, workspaceId: "workspace-b" }).success, false);
});

test("document links are tenant-bound, idempotent, auditable and append-only", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", documentA, [caseA, caseA2], caseA);
    seedTenant(sqlite, "user-b", "workspace-b", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", [caseB]);

    const moved = await changeDocumentCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA,
      caseId: caseA2, idempotencyKey: "document-case-link-first-0001",
    });
    assert.deepEqual(moved, { documentId: documentA, caseId: caseA2, revision: 1, replay: false, changed: true });
    assert.deepEqual({ ...projection(sqlite) }, { caseId: caseA2, revision: 1, linkedBy: "user-a", planStepId: null });
    assert.equal(eventCount(sqlite, "document_unlinked", caseA), 1);
    assert.equal(eventCount(sqlite, "document_linked", caseA2), 1);
    assert.equal(auditCount(sqlite), 1);

    const replay = await changeDocumentCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA,
      caseId: caseA2, idempotencyKey: "document-case-link-first-0001",
    });
    assert.equal(replay.replay, true);
    assert.equal(eventCount(sqlite, "document_linked", caseA2), 1);
    assert.equal(auditCount(sqlite), 1);
    await assert.rejects(
      changeDocumentCaseLink({
        db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA,
        caseId: null, idempotencyKey: "document-case-link-first-0001",
      }),
      (error: unknown) => error instanceof DocumentCaseLinkError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      changeDocumentCaseLink({
        db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA,
        caseId: caseB, idempotencyKey: "document-case-link-foreign-001",
      }),
      (error: unknown) => error instanceof DocumentCaseLinkError && error.code === "CASE_UNAVAILABLE",
    );
    await assert.rejects(
      changeDocumentCaseLink({
        db: d1, workspaceId: "workspace-b", userId: "user-b", documentId: documentA,
        caseId: caseB, idempotencyKey: "document-case-link-idor-00001",
      }),
      (error: unknown) => error instanceof DocumentCaseLinkError && error.code === "DOCUMENT_UNAVAILABLE",
    );

    const unlinked = await changeDocumentCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA,
      caseId: null, idempotencyKey: "document-case-unlink-second-0002",
    });
    assert.equal(unlinked.revision, 2);
    assert.deepEqual({ ...projection(sqlite) }, { caseId: null, revision: 2, linkedBy: "user-a", planStepId: null });
    assert.equal(eventCount(sqlite, "document_unlinked", caseA2), 1);

    assert.throws(
      () => sqlite.prepare("UPDATE documents SET case_id=? WHERE id=?").run(caseA, documentA),
      /documents_case_projection_guard/,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE document_case_link_events SET request_hash=? WHERE document_id=?").run("f".repeat(64), documentA),
      /document_case_link_event_immutable/,
    );
    assert.throws(
      () => sqlite.prepare(`INSERT INTO document_case_link_events
        (id,document_id,workspace_id,owner_user_id,actor_user_id,from_case_id,to_case_id,mutation_version,idempotency_key,request_hash,created_at)
        VALUES ('cross-tenant',?,'workspace-a','user-a','user-a',NULL,?,3,'document-case-cross-tenant-003',?,?)`).run(
        documentA, caseB, "d".repeat(64), now,
      ),
      /document_case_link_source_mismatch/,
    );
  } finally {
    sqlite.close();
  }
});

test("a stale competing document-link writer cannot overwrite the winning projection", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", documentA, [caseA, caseA2]);
    await changeDocumentCaseLink({ db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA, caseId: caseA, idempotencyKey: "document-case-race-writer-a" });
    assert.throws(
      () => sqlite.prepare(`INSERT INTO document_case_link_events
        (id,document_id,workspace_id,owner_user_id,actor_user_id,from_case_id,to_case_id,mutation_version,idempotency_key,request_hash,created_at)
        VALUES ('stale-writer',?,'workspace-a','user-a','user-a',NULL,?,1,'document-case-race-writer-b',?,?)`).run(
        documentA, caseA2, "e".repeat(64), now,
      ),
      /document_case_link_source_mismatch/,
    );
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM document_case_link_events WHERE document_id=?").get(documentA) as { count: number }).count, 1);
    assert.equal(projection(sqlite).revision, 1);
  } finally {
    sqlite.close();
  }
});

test("document case-link evidence does not obstruct an authorized account cascade", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a", documentA, [caseA]);
    await changeDocumentCaseLink({
      db: d1, workspaceId: "workspace-a", userId: "user-a", documentId: documentA,
      caseId: caseA, idempotencyKey: "document-case-account-purge-01",
    });
    sqlite.prepare("DELETE FROM user_profiles WHERE id='user-a'").run();
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM documents WHERE id=?").get(documentA) as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM document_case_link_events WHERE document_id=?").get(documentA) as { count: number }).count, 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("document case-link route and list UI enforce server tenant scope and accessible direct control", async () => {
  const [route, listRoute, client, copy, activity] = await Promise.all([
    readFile(new URL("../app/api/document-builder/documents/[id]/case/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/document-builder/documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_document-builder/documents/DocumentsClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/platform/builder-workspace-copy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/CaseWorkspaceClient.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /workspaceForUser\(user\)/);
  assert.match(route, /documentCaseLinkInputSchema\.safeParse/);
  assert.match(route, /request\.headers\.get\("idempotency-key"\)/);
  assert.doesNotMatch(route, /workspaceId:\s*parsed\.data|ownerUserId:\s*parsed\.data/);
  assert.match(listRoute, /CASE WHEN d\.owner_user_id = \? THEN d\.case_id ELSE NULL END AS caseId/);
  assert.match(listRoute, /FROM cases WHERE workspace_id=\? AND archived_at IS NULL/);
  assert.match(client, /api\/document-builder\/documents\/\$\{document\.id\}\/case/);
  assert.match(client, /idempotency-key/);
  assert.match(client, /aria-busy/);
  assert.match(client, /aria-live="polite"/);
  assert.match(copy, /caseLinked:/);
  assert.match(copy, /caseUnlinked:/);
  assert.match(activity, /document_linked/);
  assert.match(activity, /document_unlinked/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
});

function seedTenant(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  userId: string,
  workspaceId: string,
  documentId: string,
  caseIds: string[],
  initialCaseId: string | null = null,
) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)").run(userId, `${userId}@example.test`, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(workspaceId, "individual", workspaceId, now, now);
  for (const id of caseIds) {
    sqlite.prepare(`INSERT INTO cases
      (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,current_revision,created_at,updated_at)
      VALUES (?,?,?,'individual','ru',?,'contracts','open',1,?,?)`).run(id, workspaceId, userId, `Case ${id.slice(0, 4)}`, now, now);
  }
  let planStepId: string | null = null;
  if (initialCaseId) {
    const planId = `${workspaceId}-plan`;
    planStepId = `${workspaceId}-plan-step`;
    sqlite.prepare("INSERT INTO action_plans(id,case_id,created_by_user_id,title,status,progress_percent,current_revision,created_at,updated_at) VALUES (?,?,?,'Plan','in_progress',0,1,?,?)")
      .run(planId, initialCaseId, userId, now, now);
    sqlite.prepare("INSERT INTO action_plan_steps(id,plan_id,ordinal,title,status,deadline_type,revision,created_at,updated_at) VALUES (?,?,1,'Step','not_started','calendar_days',1,?,?)")
      .run(planStepId, planId, now, now);
  }
  const templateId = `${workspaceId}-template`;
  sqlite.prepare("INSERT INTO document_templates(id,key,category,active,created_at,updated_at) VALUES (?,?,?,1,?,?)")
    .run(templateId, templateId, "contracts", now, now);
  sqlite.prepare(`INSERT INTO documents
    (id,workspace_id,owner_user_id,template_id,language,participant_mode,title,category,status,case_id,plan_step_id,created_at,updated_at)
    VALUES (?,?,?,?,'ru','self','Document','contracts','Черновик',?,?,?,?)`).run(
    documentId, workspaceId, userId, templateId, initialCaseId, planStepId, now, now,
  );
}

function projection(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): { caseId: string | null; revision: number; linkedBy: string | null; planStepId: string | null } {
  return sqlite.prepare("SELECT case_id AS caseId,case_link_revision AS revision,case_linked_by_user_id AS linkedBy,plan_step_id AS planStepId FROM documents WHERE id=?").get(documentA) as { caseId: string | null; revision: number; linkedBy: string | null; planStepId: string | null };
}

function eventCount(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], eventType: string, caseId: string): number {
  return (sqlite.prepare("SELECT count(*) AS count FROM case_events WHERE event_type=? AND case_id=?").get(eventType, caseId) as { count: number }).count;
}

function auditCount(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): number {
  return (sqlite.prepare("SELECT count(*) AS count FROM workspace_audit_events WHERE entity_type='document'").get() as { count: number }).count;
}
