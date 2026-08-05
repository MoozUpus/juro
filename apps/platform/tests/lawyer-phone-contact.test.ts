import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityProtectionContext } from "../lib/auth/identity-protection";
import {
  LawyerPhoneContactError,
  revealLawyerRequestPhone,
} from "../lib/platform/lawyer-phone-contact";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-06T04:00:00.000Z";

test("active grant participants reveal only the counterpart phone and append safe audit metadata", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const identity = createIdentityProtectionContext("legacy", undefined);
    assert.deepEqual(await revealLawyerRequestPhone({
      db: d1,
      identity,
      requestId: "request-a",
      userId: "owner-a",
      activeWorkspaceId: "workspace-owner",
    }), {
      display: "+998 (90) 222-33-44",
      href: "tel:+998902223344",
      counterpartRole: "lawyer",
    });
    assert.deepEqual(await revealLawyerRequestPhone({
      db: d1,
      identity,
      requestId: "request-a",
      userId: "lawyer-a",
      activeWorkspaceId: "workspace-lawyer",
    }), {
      display: "+998 (90) 111-22-33",
      href: "tel:+998901112233",
      counterpartRole: "owner",
    });
    const audit = sqlite.prepare(
      `SELECT actor_user_id AS actorUserId,action,metadata_json AS metadataJson
       FROM workspace_audit_events
       WHERE entity_type='lawyer_request_contact'
       ORDER BY created_at,id`,
    ).all() as Array<{ actorUserId: string; action: string; metadataJson: string }>;
    assert.equal(audit.length, 2);
    assert.deepEqual(audit.map(({ actorUserId, action }) => ({ actorUserId, action })), [
      { actorUserId: "owner-a", action: "lawyer_phone_contact_revealed" },
      { actorUserId: "lawyer-a", action: "lawyer_phone_contact_revealed" },
    ]);
    assert.doesNotMatch(JSON.stringify(audit), /\+998|111|222/u);
    assert.deepEqual(JSON.parse(audit[0]!.metadataJson), {
      actorRole: "owner",
      counterpartRole: "lawyer",
    });
  } finally {
    sqlite.close();
  }
});

test("revoked, expired, cross-workspace and nonparticipant requests reveal nothing", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const identity = createIdentityProtectionContext("legacy", undefined);
    const denied = async (userId: string, activeWorkspaceId: string) => assert.rejects(
      revealLawyerRequestPhone({ db: d1, identity, requestId: "request-a", userId, activeWorkspaceId }),
      (error: unknown) => error instanceof LawyerPhoneContactError
        && error.code === "REQUEST_UNAVAILABLE"
        && error.status === 404,
    );
    await denied("outsider-a", "workspace-owner");
    await denied("owner-a", "workspace-outsider");
    sqlite.prepare("UPDATE lawyer_access_grants SET revoked_at=? WHERE id='grant-a'").run(now);
    await denied("owner-a", "workspace-owner");
    sqlite.prepare("UPDATE lawyer_access_grants SET revoked_at=NULL,expires_at='2020-01-01T00:00:00.000Z' WHERE id='grant-a'").run();
    await denied("lawyer-a", "workspace-lawyer");
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS total FROM workspace_audit_events WHERE entity_type='lawyer_request_contact'").get() as { total: number }).total,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("both owner and lawyer phone-sharing consents are required", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const identity = createIdentityProtectionContext("legacy", undefined);
    const reveal = () => revealLawyerRequestPhone({
      db: d1,
      identity,
      requestId: "request-a",
      userId: "owner-a",
      activeWorkspaceId: "workspace-owner",
    });
    sqlite.prepare("UPDATE consents SET revoked_at=? WHERE id='lawyer-phone-consent-a'").run(now);
    await assert.rejects(reveal(), (error: unknown) => error instanceof LawyerPhoneContactError && error.code === "REQUEST_UNAVAILABLE");
    sqlite.prepare("UPDATE consents SET revoked_at=NULL WHERE id='lawyer-phone-consent-a'").run();
    sqlite.prepare("UPDATE consents SET revoked_at=? WHERE id='owner-phone-consent-a'").run(now);
    await assert.rejects(reveal(), (error: unknown) => error instanceof LawyerPhoneContactError && error.code === "REQUEST_UNAVAILABLE");
  } finally {
    sqlite.close();
  }
});

test("a missing or non-dialable counterpart phone fails closed", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const identity = createIdentityProtectionContext("legacy", undefined);
    sqlite.prepare("UPDATE user_profiles SET phone=NULL WHERE id='lawyer-a'").run();
    await assert.rejects(
      revealLawyerRequestPhone({
        db: d1,
        identity,
        requestId: "request-a",
        userId: "owner-a",
        activeWorkspaceId: "workspace-owner",
      }),
      (error: unknown) => error instanceof LawyerPhoneContactError
        && error.code === "PHONE_UNAVAILABLE"
        && error.status === 409,
    );
    sqlite.prepare("UPDATE user_profiles SET phone='internal-extension' WHERE id='lawyer-a'").run();
    await assert.rejects(
      revealLawyerRequestPhone({
        db: d1,
        identity,
        requestId: "request-a",
        userId: "owner-a",
        activeWorkspaceId: "workspace-owner",
      }),
      (error: unknown) => error instanceof LawyerPhoneContactError
        && error.code === "PHONE_UNAVAILABLE",
    );
  } finally {
    sqlite.close();
  }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  for (const [id, email, phone] of [
    ["owner-a", "owner@example.invalid", "+998 (90) 111-22-33"],
    ["lawyer-a", "lawyer@example.invalid", "+998 (90) 222-33-44"],
    ["outsider-a", "outsider@example.invalid", "+998 (90) 333-44-55"],
  ]) {
    sqlite.prepare("INSERT INTO user_profiles(id,email,phone,created_at,updated_at) VALUES (?,?,?,?,?)")
      .run(id, email, phone, now, now);
  }
  for (const [id, name] of [
    ["workspace-owner", "Owner"],
    ["workspace-lawyer", "Lawyer"],
    ["workspace-outsider", "Outsider"],
  ]) {
    sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,'individual',?,?,?)")
      .run(id, name, now, now);
  }
  sqlite.prepare(`INSERT INTO cases
    (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,current_revision,created_at,updated_at)
    VALUES ('case-a','workspace-owner','owner-a','individual','ru','Case A','contracts','open',1,?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO lawyer_profiles
    (id,user_id,display_name,specialties_json,languages_json,status,public_approved_at,created_at,updated_at)
    VALUES ('profile-a','lawyer-a','Lawyer A','[]','["ru"]','public_approved',?,?,?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO lawyer_requests
    (id,workspace_id,case_id,requester_user_id,lawyer_profile_id,status,anonymized_summary,requested_scope_json,created_at,updated_at)
    VALUES ('request-a','workspace-owner','case-a','owner-a','profile-a','access_granted','Summary','{}',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO lawyer_access_grants
    (id,lawyer_request_id,case_id,lawyer_user_id,granted_by_user_id,created_at)
    VALUES ('grant-a','request-a','case-a','lawyer-a','owner-a',?)`).run(now);
  sqlite.prepare(`INSERT INTO consents
    (id,user_id,workspace_id,type,version,scope_json,granted_at)
    VALUES ('owner-phone-consent-a','owner-a','workspace-owner','lawyer_case_access','2026-08-06',?,?)`)
    .run(JSON.stringify({ requestId: "request-a", reciprocalPhoneDisclosure: true }), now);
  sqlite.prepare(`INSERT INTO consents
    (id,user_id,workspace_id,type,version,scope_json,granted_at)
    VALUES ('lawyer-phone-consent-a','lawyer-a','workspace-owner','lawyer_phone_contact_sharing','2026-08-06',?,?)`)
    .run(JSON.stringify({ requestId: "request-a", reciprocalPhoneDisclosure: true }), now);
}
