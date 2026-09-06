import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBusinessWorkspaceInDatabase,
  createBusinessWorkspaceInputSchema,
  WorkspaceCreationConflictError,
} from "../lib/platform/workspace-creation";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-30T06:00:00.000Z";

function fixtureWithUsers() {
  const fixture = sqliteD1Fixture();
  const insert = fixture.sqlite.prepare(
    `INSERT INTO user_profiles
     (id,email,full_name,locale,account_type,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  );
  insert.run("workspace-owner", "owner@example.invalid", "Owner", "ru", "individual", NOW, NOW);
  insert.run("workspace-other", "other@example.invalid", "Other", "uz", "entrepreneur", NOW, NOW);
  return fixture;
}

function input(overrides: Record<string, unknown> = {}) {
  return createBusinessWorkspaceInputSchema.parse({
    action: "create",
    requestId: REQUEST_ID,
    fullName: "Общество с ограниченной ответственностью JURO Labs",
    shortName: "JURO Labs",
    locale: "ru",
    ...overrides,
  });
}

test("business workspace input is strict, Unicode-safe, and whitespace-normalized", () => {
  const parsed = input({ fullName: "  JURO   Yuridik   Texnologiyalar  ", shortName: "  JURO   Tech " });
  assert.equal(parsed.fullName, "JURO Yuridik Texnologiyalar");
  assert.equal(parsed.shortName, "JURO Tech");
  assert.equal(createBusinessWorkspaceInputSchema.safeParse({ ...parsed, extra: true }).success, false);
  assert.equal(createBusinessWorkspaceInputSchema.safeParse({ ...parsed, fullName: "JURO\u0000 Labs" }).success, false);
});

test("business workspace creation atomically grants owner access, activates, and audits", async () => {
  const { sqlite, d1 } = fixtureWithUsers();
  const created = await createBusinessWorkspaceInDatabase(d1, "workspace-owner", input(), NOW);
  assert.equal(created.created, true);
  assert.equal(created.id, "ws_11111111111141118111111111111111");
  assert.equal(created.role, "owner");
  const workspaceRow = sqlite.prepare(
    `SELECT type,name,full_name AS fullName,short_name AS shortName,
      created_by_user_id AS createdBy,creation_request_id AS requestId
     FROM workspaces WHERE id=?`,
  ).get(created.id) as Record<string, unknown>;
  assert.deepEqual(
    { ...workspaceRow },
    {
      type: "business",
      name: "JURO Labs",
      fullName: "Общество с ограниченной ответственностью JURO Labs",
      shortName: "JURO Labs",
      createdBy: "workspace-owner",
      requestId: REQUEST_ID,
    },
  );
  const memberRow = sqlite.prepare(
    "SELECT user_id AS userId,role,status FROM workspace_members WHERE workspace_id=?",
  ).get(created.id) as Record<string, unknown>;
  assert.deepEqual(
    { ...memberRow },
    { userId: "workspace-owner", role: "owner", status: "active" },
  );
  assert.equal(
    (sqlite.prepare("SELECT default_workspace_id AS id FROM user_profiles WHERE id='workspace-owner'").get() as { id: string }).id,
    created.id,
  );
  const audit = sqlite.prepare(
    "SELECT action,metadata_json AS metadata FROM workspace_audit_events WHERE workspace_id=?",
  ).get(created.id) as { action: string; metadata: string };
  assert.equal(audit.action, "business_workspace_created");
  assert.deepEqual(JSON.parse(audit.metadata), { source: "settings", workspaceType: "business" });
  sqlite.close();
});

test("business workspace creation preserves an English locale", async () => {
  const { sqlite, d1 } = fixtureWithUsers();
  try {
    const created = await createBusinessWorkspaceInDatabase(
      d1,
      "workspace-owner",
      input({
        requestId: "22222222-2222-4222-8222-222222222222",
        fullName: "JURO International LLC",
        shortName: "JURO International",
        locale: "en",
      }),
      NOW,
    );
    assert.deepEqual(
      {
        ...sqlite.prepare(
          "SELECT locale,full_name AS fullName FROM workspaces WHERE id=?",
        ).get(created.id),
      },
      { locale: "en", fullName: "JURO International LLC" },
    );
  } finally {
    sqlite.close();
  }
});

test("business workspace retry is idempotent and rejects mismatched or cross-user replay", async () => {
  const { sqlite, d1 } = fixtureWithUsers();
  const first = await createBusinessWorkspaceInDatabase(d1, "workspace-owner", input(), NOW);
  const replay = await createBusinessWorkspaceInDatabase(d1, "workspace-owner", input(), NOW);
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal((sqlite.prepare("SELECT count(*) AS total FROM workspaces WHERE creation_request_id=?").get(REQUEST_ID) as { total: number }).total, 1);
  assert.equal((sqlite.prepare("SELECT count(*) AS total FROM workspace_audit_events WHERE workspace_id=?").get(first.id) as { total: number }).total, 1);
  await assert.rejects(
    createBusinessWorkspaceInDatabase(d1, "workspace-owner", input({ shortName: "Changed" }), NOW),
    WorkspaceCreationConflictError,
  );
  await assert.rejects(
    createBusinessWorkspaceInDatabase(d1, "workspace-other", input(), NOW),
    WorkspaceCreationConflictError,
  );
  assert.equal((sqlite.prepare("SELECT count(*) AS total FROM workspace_members WHERE workspace_id=?").get(first.id) as { total: number }).total, 1);
  assert.equal((sqlite.prepare("SELECT default_workspace_id AS id FROM user_profiles WHERE id='workspace-other'").get() as { id: string | null }).id, null);
  sqlite.close();
});

test("business workspace creation rolls back every write when immutable audit fails", async () => {
  const { sqlite, d1 } = fixtureWithUsers();
  sqlite.exec(`CREATE TRIGGER reject_workspace_creation_audit
    BEFORE INSERT ON workspace_audit_events
    WHEN NEW.action='business_workspace_created'
    BEGIN SELECT RAISE(ABORT,'AUDIT_WRITE_FAILED'); END;`);
  await assert.rejects(
    createBusinessWorkspaceInDatabase(d1, "workspace-owner", input(), NOW),
    /AUDIT_WRITE_FAILED/,
  );
  assert.equal((sqlite.prepare("SELECT count(*) AS total FROM workspaces WHERE creation_request_id=?").get(REQUEST_ID) as { total: number }).total, 0);
  assert.equal((sqlite.prepare("SELECT count(*) AS total FROM workspace_members WHERE user_id='workspace-owner'").get() as { total: number }).total, 0);
  assert.equal((sqlite.prepare("SELECT default_workspace_id AS id FROM user_profiles WHERE id='workspace-owner'").get() as { id: string | null }).id, null);
  sqlite.close();
});

test("migration guards business identity while preserving legacy personal workspaces", () => {
  const { sqlite } = fixtureWithUsers();
  assert.throws(() => sqlite.prepare(
    "INSERT INTO workspaces (id,type,name,locale,created_at,updated_at) VALUES ('bad-business','business','Bad','ru',?,?)",
  ).run(NOW, NOW), /WORKSPACE_BUSINESS_IDENTITY_REQUIRED/);
  sqlite.prepare(
    "INSERT INTO workspaces (id,type,name,locale,created_at,updated_at) VALUES ('personal-ok','individual','Personal','ru',?,?)",
  ).run(NOW, NOW);
  assert.equal((sqlite.prepare("SELECT count(*) AS total FROM workspaces WHERE id='personal-ok'").get() as { total: number }).total, 1);
  sqlite.close();
});

test("settings UI and API expose the real localized creation flow", async () => {
  const [settings, route, profileRoute] = await Promise.all([
    readFile(new URL("../app/_platform/ProfileSettingsClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/workspaces/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/profile/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(settings, /Новое бизнес-пространство/);
  assert.match(settings, /Yangi biznes makoni/);
  assert.match(settings, /crypto\.randomUUID\(\)/);
  assert.match(settings, /aria-describedby="business-workspace-description"/);
  assert.match(route, /createBusinessWorkspaceInDatabase/);
  assert.match(route, /platformPath\(locale, "business", "dashboard", workspace\.id\)/);
  assert.match(profileRoute, /full_name=CASE WHEN type='business'/);
  assert.doesNotMatch(profileRoute, /short_name=CASE WHEN type='business'/);
});
