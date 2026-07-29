import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { workspaceForUserByIdInDatabase } from "../lib/platform/workspace-route-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function seedWorkspaces(): ReturnType<typeof sqliteD1Fixture> {
  const fixture = sqliteD1Fixture();
  const now = "2026-07-29T00:00:00.000Z";
  fixture.sqlite.prepare(
    `INSERT INTO user_profiles
     (id,email,full_name,locale,account_type,default_workspace_id,created_at,updated_at)
     VALUES (?,?,?,?,?,NULL,?,?)`,
  ).run(
    "user_workspace_route",
    "workspace-route@example.invalid",
    "Workspace Route Test",
    "ru",
    "individual",
    now,
    now,
  );
  const insertWorkspace = fixture.sqlite.prepare(
    `INSERT INTO workspaces
     (id,type,name,full_name,short_name,locale,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  insertWorkspace.run("ws_personal_route", "individual", "Personal", null, null, "ru", now, now);
  insertWorkspace.run("ws_business_route", "business", "Business", "Business", "Business", "ru", now, now);
  insertWorkspace.run("ws_foreign_route", "business", "Foreign", "Foreign", "Foreign", "ru", now, now);
  fixture.sqlite.prepare(
    "UPDATE user_profiles SET default_workspace_id=? WHERE id=?",
  ).run("ws_personal_route", "user_workspace_route");
  const insertMember = fixture.sqlite.prepare(
    `INSERT INTO workspace_members
     (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  insertMember.run(
    "member_personal_route",
    "ws_personal_route",
    "user_workspace_route",
    "owner",
    "active",
    now,
    now,
    now,
  );
  insertMember.run(
    "member_business_route",
    "ws_business_route",
    "user_workspace_route",
    "member",
    "active",
    now,
    now,
    now,
  );
  return fixture;
}

test("canonical business route activates only an authorized workspace and audits once", async () => {
  const { sqlite, d1 } = seedWorkspaces();
  const selected = await workspaceForUserByIdInDatabase(
    d1,
    "user_workspace_route",
    "ws_business_route",
    { activate: true, source: "canonical_business_route" },
  );
  assert.deepEqual(selected, {
    id: "ws_business_route",
    name: "Business",
    type: "business",
    role: "member",
  });
  assert.equal(
    (sqlite.prepare(
      "SELECT default_workspace_id AS id FROM user_profiles WHERE id=?",
    ).get("user_workspace_route") as { id: string }).id,
    "ws_business_route",
  );
  const event = sqlite.prepare(
    `SELECT action,metadata_json AS metadataJson
     FROM workspace_audit_events WHERE actor_user_id=?`,
  ).get("user_workspace_route") as { action: string; metadataJson: string };
  assert.equal(event.action, "workspace_selected");
  assert.deepEqual(JSON.parse(event.metadataJson), {
    source: "canonical_business_route",
    previousWorkspaceId: "ws_personal_route",
    targetWorkspaceType: "business",
    role: "member",
  });

  await workspaceForUserByIdInDatabase(
    d1,
    "user_workspace_route",
    "ws_business_route",
    { activate: true, source: "canonical_business_route" },
  );
  const count = sqlite.prepare(
    "SELECT count(*) AS value FROM workspace_audit_events WHERE actor_user_id=?",
  ).get("user_workspace_route") as { value: number };
  assert.equal(count.value, 1);
  sqlite.close();
});

test("canonical business route does not disclose or activate an inaccessible workspace", async () => {
  const { sqlite, d1 } = seedWorkspaces();
  const selected = await workspaceForUserByIdInDatabase(
    d1,
    "user_workspace_route",
    "ws_foreign_route",
    { activate: true, source: "canonical_business_route" },
  );
  assert.equal(selected, null);
  assert.equal(
    (sqlite.prepare(
      "SELECT default_workspace_id AS id FROM user_profiles WHERE id=?",
    ).get("user_workspace_route") as { id: string }).id,
    "ws_personal_route",
  );
  assert.equal(
    (sqlite.prepare(
      "SELECT count(*) AS value FROM workspace_audit_events",
    ).get() as { value: number }).value,
    0,
  );
  sqlite.close();
});

test("canonical business route surface is isolated and workspace-aware", async () => {
  const [layout, shell, context, builderPage, documentPage] = await Promise.all([
    readFile(new URL("../app/[locale]/business/[workspaceId]/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/PlatformShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/PlatformRouteContext.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/business/[workspaceId]/document-builder/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/business/[workspaceId]/documents/[id]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /requestedWorkspaceId=\{workspaceId\}/);
  assert.match(shell, /platformBasePath\(locale, accountType, activeWorkspaceId\)/);
  assert.match(shell, /PlatformRouteProvider basePath=\{base\}/);
  assert.match(context, /PLATFORM_ROUTE_CONTEXT_REQUIRED/);
  assert.match(builderPage, /platformPath\(locale, "business", "document-builder", workspaceId\)/);
  assert.match(documentPage, /platformBasePath\(locale, "business", workspaceId\)/);
});
