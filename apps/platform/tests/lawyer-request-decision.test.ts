import assert from "node:assert/strict";
import test from "node:test";
import {
  decideLawyerRequest,
  LawyerRequestDecisionError,
} from "../lib/platform/lawyer-request-decision";
import { lawyerRequestDecisionSchema } from "../lib/platform/lawyer-request";
import { activeLawyerWorkspaceParticipant } from "../lib/platform/lawyer-workspace-access";
import { batchBarrier, sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-24T10:00:00.000Z";

test("lawyer request decision input requires a useful information request", () => {
  assert.equal(lawyerRequestDecisionSchema.safeParse({
    decision: "request_information",
    locale: "ru",
  }).success, false);
  assert.equal(lawyerRequestDecisionSchema.safeParse({
    decision: "request_information",
    message: "Уточните срок исполнения обязательства.",
    locale: "ru",
  }).success, true);
  assert.equal(lawyerRequestDecisionSchema.safeParse({
    decision: "accept",
    locale: "uz",
  }).success, true);
});

test("lawyer can request information and then explicitly accept the request", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    sqlite.prepare(
      "UPDATE user_profiles SET default_workspace_id='workspace-outsider-decision' WHERE id='owner-decision'",
    ).run();
    const requested = await decideLawyerRequest({
      db: d1,
      requestId: "request-decision",
      lawyerUserId: "lawyer-decision",
      decision: "request_information",
      message: "Уточните срок исполнения обязательства.",
      now: new Date(now),
    });
    assert.equal(requested.status, "needs_information");
    assert.ok(requested.messageId);
    const message = sqlite.prepare(
      "SELECT author_user_id AS authorUserId,author_role AS authorRole,body FROM lawyer_request_messages WHERE id=?",
    ).get(requested.messageId!) as { authorUserId: string; authorRole: string; body: string };
    assert.equal(message.authorUserId, "lawyer-decision");
    assert.equal(message.authorRole, "lawyer");
    assert.equal(message.body, "Уточните срок исполнения обязательства.");
    assert.equal(requestStatus(sqlite), "needs_information");
    assert.equal(activeGrant(sqlite), 1);
    assert.equal(count(sqlite, "notifications"), 1);
    assert.equal(
      (sqlite.prepare(
        "SELECT workspace_id AS workspaceId FROM notifications LIMIT 1",
      ).get() as { workspaceId: string }).workspaceId,
      "workspace-owner-decision",
    );
    assert.equal(count(sqlite, "workspace_audit_events"), 1);
    assert.equal(count(sqlite, "case_events"), 1);

    const accepted = await decideLawyerRequest({
      db: d1,
      requestId: "request-decision",
      lawyerUserId: "lawyer-decision",
      decision: "accept",
      now: new Date("2026-08-24T10:01:00.000Z"),
    });
    assert.deepEqual(accepted, { status: "accepted", messageId: null });
    assert.equal(requestStatus(sqlite), "accepted");
    assert.equal(activeGrant(sqlite), 1);
    assert.equal(count(sqlite, "lawyer_request_messages"), 1);
    assert.equal(count(sqlite, "notifications"), 2);
    assert.equal(count(sqlite, "workspace_audit_events"), 2);
    assert.equal(count(sqlite, "case_events"), 2);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("declining a request revokes the exact grant and removes lawyer workspace access", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const declined = await decideLawyerRequest({
      db: d1,
      requestId: "request-decision",
      lawyerUserId: "lawyer-decision",
      decision: "decline",
      now: new Date(now),
    });
    assert.deepEqual(declined, { status: "declined", messageId: null });
    assert.equal(requestStatus(sqlite), "declined");
    const grant = sqlite.prepare(
      "SELECT revoked_at AS revokedAt,revoke_reason AS revokeReason FROM lawyer_access_grants WHERE id='grant-decision'",
    ).get() as { revokedAt: string; revokeReason: string };
    assert.equal(grant.revokedAt, now);
    assert.equal(grant.revokeReason, "lawyer_declined");
    assert.equal(
      await activeLawyerWorkspaceParticipant(d1, "lawyer-decision", "request-decision", now),
      null,
    );
    assert.equal(count(sqlite, "notifications"), 1);
    assert.equal(count(sqlite, "lawyer_request_messages"), 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("decision rejects the wrong lawyer, repeated transitions and downstream decline", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await assert.rejects(
      decideLawyerRequest({
        db: d1,
        requestId: "request-decision",
        lawyerUserId: "outsider-decision",
        decision: "accept",
        now: new Date(now),
      }),
      (error: unknown) => error instanceof LawyerRequestDecisionError
        && error.code === "DECISION_UNAVAILABLE",
    );
    sqlite.prepare(`INSERT INTO lawyer_consultations
      (id,lawyer_request_id,lawyer_profile_id,client_user_id,case_id,starts_at,ends_at,timezone,format,status,created_at,updated_at)
      VALUES ('consultation-decision','request-decision','profile-decision','owner-decision','case-decision',
        '2026-08-25T10:00:00.000Z','2026-08-25T10:30:00.000Z','Asia/Tashkent','video','proposed',?,?)`).run(now, now);
    await assert.rejects(
      decideLawyerRequest({
        db: d1,
        requestId: "request-decision",
        lawyerUserId: "lawyer-decision",
        decision: "decline",
        now: new Date(now),
      }),
      (error: unknown) => error instanceof LawyerRequestDecisionError
        && error.code === "DECISION_LOCKED",
    );
    assert.equal(requestStatus(sqlite), "access_granted");
    sqlite.prepare("DELETE FROM lawyer_consultations WHERE id='consultation-decision'").run();
    await decideLawyerRequest({
      db: d1,
      requestId: "request-decision",
      lawyerUserId: "lawyer-decision",
      decision: "accept",
      now: new Date(now),
    });
    await assert.rejects(
      decideLawyerRequest({
        db: d1,
        requestId: "request-decision",
        lawyerUserId: "lawyer-decision",
        decision: "accept",
        now: new Date("2026-08-24T10:01:00.000Z"),
      }),
      (error: unknown) => error instanceof LawyerRequestDecisionError
        && error.code === "DECISION_UNAVAILABLE",
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("a concurrent decision produces exactly one transition and one set of side effects", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const synchronized = batchBarrier(d1, 2);
    const results = await Promise.allSettled([
      decideLawyerRequest({
        db: synchronized,
        requestId: "request-decision",
        lawyerUserId: "lawyer-decision",
        decision: "request_information",
        message: "Уточните дату договора.",
        now: new Date(now),
      }),
      decideLawyerRequest({
        db: synchronized,
        requestId: "request-decision",
        lawyerUserId: "lawyer-decision",
        decision: "request_information",
        message: "Уточните дату договора.",
        now: new Date(now),
      }),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(results.filter((item) => item.status === "rejected").length, 1);
    assert.equal(count(sqlite, "lawyer_request_messages"), 1);
    assert.equal(count(sqlite, "notifications"), 1);
    assert.equal(count(sqlite, "workspace_audit_events"), 1);
    assert.equal(count(sqlite, "case_events"), 1);
    const decision = sqlite.prepare(`SELECT lawyer_decision_claim_id AS claimId,
      lawyer_decision_by_user_id AS lawyerUserId,lawyer_decision_at AS decidedAt
      FROM lawyer_requests WHERE id='request-decision'`).get() as {
      claimId: string;
      lawyerUserId: string;
      decidedAt: string;
    };
    assert.match(decision.claimId, /^[0-9a-f-]{36}$/u);
    assert.equal(decision.lawyerUserId, "lawyer-decision");
    assert.equal(decision.decidedAt, now);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  for (const id of ["owner-decision", "lawyer-decision", "outsider-decision"]) {
    sqlite.prepare(
      "INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)",
    ).run(id, `${id}@example.invalid`, now, now);
  }
  for (const id of ["workspace-owner-decision", "workspace-lawyer-decision", "workspace-outsider-decision"]) {
    sqlite.prepare(
      "INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,'individual',?,?,?)",
    ).run(id, id, now, now);
  }
  sqlite.prepare("UPDATE user_profiles SET default_workspace_id='workspace-owner-decision' WHERE id='owner-decision'").run();
  sqlite.prepare("UPDATE user_profiles SET default_workspace_id='workspace-lawyer-decision' WHERE id='lawyer-decision'").run();
  sqlite.prepare("UPDATE user_profiles SET default_workspace_id='workspace-outsider-decision' WHERE id='outsider-decision'").run();
  sqlite.prepare(`INSERT INTO cases
    (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,current_revision,created_at,updated_at)
    VALUES ('case-decision','workspace-owner-decision','owner-decision','individual','ru','Decision case','contracts','open',1,?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO lawyer_profiles
    (id,user_id,display_name,specialties_json,languages_json,status,marketplace_status,public_approved_at,created_at,updated_at)
    VALUES ('profile-decision','lawyer-decision','Decision Lawyer','[]','["ru"]','public_approved','public_approved',?,?,?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO lawyer_requests
    (id,workspace_id,case_id,requester_user_id,lawyer_profile_id,status,anonymized_summary,requested_scope_json,created_at,updated_at)
    VALUES ('request-decision','workspace-owner-decision','case-decision','owner-decision','profile-decision','access_granted','Anonymized summary','{}',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO lawyer_access_grants
    (id,lawyer_request_id,case_id,lawyer_user_id,granted_by_user_id,created_at)
    VALUES ('grant-decision','request-decision','case-decision','lawyer-decision','owner-decision',?)`).run(now);
}

function requestStatus(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): string | undefined {
  return (sqlite.prepare("SELECT status FROM lawyer_requests WHERE id='request-decision'").get() as {
    status: string;
  } | undefined)?.status;
}

function activeGrant(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): number {
  return Number((sqlite.prepare(
    "SELECT count(*) AS count FROM lawyer_access_grants WHERE id='grant-decision' AND revoked_at IS NULL",
  ).get() as { count: number } | undefined)?.count ?? 0);
}

function count(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], table: string): number {
  return Number((sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
    count: number;
  } | undefined)?.count ?? 0);
}
