import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createMonitoringTaskFromChange,
  listMonitoringTaskCases,
  MonitoringTaskError,
} from "../lib/platform/monitoring-tasks";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const investorSeed = readFileSync(
  new URL("../scripts/investor-demo-seed.sql", import.meta.url),
  "utf8",
);
const NOW = "2026-08-22T12:00:00.000Z";
const CLIENT_ID = "10000000-0000-4000-8000-000000000001";
const LAWYER_ID = "10000000-0000-4000-8000-000000000002";
const ADMIN_ID = "10000000-0000-4000-8000-000000000003";
const CLIENT_WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const LAWYER_WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";
const ADMIN_WORKSPACE_ID = "20000000-0000-4000-8000-000000000003";
const CASE_ID = "40000000-0000-4000-8000-000000000001";
const REQUEST_ID = "90000000-0000-4000-8000-000000000001";
const UPDATE_ID = "monitoring-change-test-001";

function seedMonitoringEvent(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare(
    `INSERT INTO legal_monitoring_metadata
      (id,canonical_url,canonical_id,locale,act_title,revision_date,effective_at,
       fingerprint,http_status,first_seen_at,last_seen_at,last_checked_at,
       last_error_code,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "monitoring-meta-test-001",
    "https://lex.uz/ru/docs/-7777777",
    "7777777",
    "ru",
    "SYNTHETIC TEST — официальный metadata источник",
    "2026-08-22",
    null,
    "fingerprint-meta-test-001",
    200,
    NOW,
    NOW,
    NOW,
    null,
    NOW,
    NOW,
  );
  sqlite.prepare(
    `INSERT INTO legal_monitoring_change_events
      (id,metadata_id,canonical_url,act_title,change_type,fingerprint,detected_at,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    UPDATE_ID,
    "monitoring-meta-test-001",
    "https://lex.uz/ru/docs/-7777777",
    "SYNTHETIC TEST — официальный metadata источник",
    "metadata_changed",
    "fingerprint-change-test-001",
    NOW,
    NOW,
  );
}

test("monitoring task cases include only the actor workspace and active lawyer grants", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    sqlite.exec(investorSeed);
    const clientCases = await listMonitoringTaskCases(d1, CLIENT_ID, CLIENT_WORKSPACE_ID, NOW);
    assert.deepEqual(clientCases.map((item) => [item.id, item.accessKind]), [[CASE_ID, "workspace"]]);

    const lawyerCases = await listMonitoringTaskCases(d1, LAWYER_ID, LAWYER_WORKSPACE_ID, NOW);
    assert.deepEqual(lawyerCases.map((item) => [item.id, item.requestId, item.accessKind]), [[CASE_ID, REQUEST_ID, "lawyer_grant"]]);

    const adminCases = await listMonitoringTaskCases(d1, ADMIN_ID, ADMIN_WORKSPACE_ID, NOW);
    assert.deepEqual(adminCases, []);
  } finally {
    sqlite.close();
  }
});

test("a client monitoring task is source-linked, audited and idempotent", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    sqlite.exec(investorSeed);
    seedMonitoringEvent(sqlite);
    const input = {
      userId: CLIENT_ID,
      workspaceId: CLIENT_WORKSPACE_ID,
      updateId: UPDATE_ID,
      caseId: CASE_ID,
      title: "Проверить влияние изменения на проект договора",
      dueDate: "2026-08-30",
      locale: "ru" as const,
      now: NOW,
    };
    const created = await createMonitoringTaskFromChange(d1, input);
    assert.equal(created.created, true);
    assert.equal(created.caseId, CASE_ID);
    assert.equal(created.requestId, null);

    const task = sqlite.prepare(
      "SELECT legal_basis AS legalBasis,source_date AS sourceDate,due_at AS dueAt,status FROM tasks WHERE id=?",
    ).get(created.taskId) as { legalBasis: string; sourceDate: string; dueAt: string; status: string };
    assert.deepEqual({ ...task }, {
      legalBasis: "https://lex.uz/ru/docs/-7777777",
      sourceDate: NOW,
      dueAt: "2026-08-30T04:00:00.000Z",
      status: "planned",
    });
    const evidence = sqlite.prepare(
      "SELECT official_url AS officialUrl,snapshot_json AS snapshotJson FROM monitoring_task_sources WHERE task_id=?",
    ).get(created.taskId) as { officialUrl: string; snapshotJson: string };
    assert.equal(evidence.officialUrl, "https://lex.uz/ru/docs/-7777777");
    assert.equal(JSON.parse(evidence.snapshotJson).changeEventId, UPDATE_ID);
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM workspace_audit_events WHERE entity_id=? AND action='monitoring_task_created'").get(created.taskId) as { count: number }).count), 1);
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM case_events WHERE case_id=? AND event_type='monitoring_task_created'").get(CASE_ID) as { count: number }).count), 1);

    const retried = await createMonitoringTaskFromChange(d1, input);
    assert.equal(retried.created, false);
    assert.equal(retried.taskId, created.taskId);
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM monitoring_task_sources WHERE case_id=? AND change_event_id=? AND created_by_user_id=?").get(CASE_ID, UPDATE_ID, CLIENT_ID) as { count: number }).count), 1);

    assert.throws(
      () => sqlite.prepare("UPDATE monitoring_task_sources SET source_title='changed' WHERE task_id=?").run(created.taskId),
      /MONITORING_TASK_SOURCE_IMMUTABLE/,
    );
  } finally {
    sqlite.close();
  }
});

test("a lawyer can create a sourced task only through an active case grant", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    sqlite.exec(investorSeed);
    seedMonitoringEvent(sqlite);
    const created = await createMonitoringTaskFromChange(d1, {
      userId: LAWYER_ID,
      workspaceId: LAWYER_WORKSPACE_ID,
      updateId: UPDATE_ID,
      caseId: CASE_ID,
      requestId: REQUEST_ID,
      title: "Проверить изменение вместе с Client Demo",
      locale: "ru",
      now: NOW,
    });
    assert.equal(created.created, true);
    assert.equal(created.requestId, REQUEST_ID);
    const task = sqlite.prepare("SELECT workspace_id AS workspaceId,owner_user_id AS ownerUserId FROM tasks WHERE id=?").get(created.taskId) as { workspaceId: string; ownerUserId: string };
    assert.deepEqual({ ...task }, { workspaceId: CLIENT_WORKSPACE_ID, ownerUserId: LAWYER_ID });
    const notification = sqlite.prepare(
      "SELECT target_type AS targetType,target_id AS targetId FROM notifications WHERE user_id=? AND type='monitoring_task_created'",
    ).get(CLIENT_ID) as { targetType: string; targetId: string };
    assert.deepEqual({ ...notification }, { targetType: "case_task", targetId: CASE_ID });

    sqlite.prepare("UPDATE lawyer_access_grants SET revoked_at=? WHERE lawyer_request_id=?").run(NOW, REQUEST_ID);
    await assert.rejects(
      createMonitoringTaskFromChange(d1, {
        userId: LAWYER_ID,
        workspaceId: LAWYER_WORKSPACE_ID,
        updateId: UPDATE_ID,
        caseId: CASE_ID,
        requestId: REQUEST_ID,
        title: "Повтор после отзыва",
        locale: "ru",
        now: "2026-08-22T12:01:00.000Z",
      }),
      (error: unknown) => error instanceof MonitoringTaskError && error.code === "CASE_UNAVAILABLE",
    );
  } finally {
    sqlite.close();
  }
});

test("monitoring UI posts the concrete change instead of linking to an empty action plan", () => {
  const client = readFileSync(new URL("../app/_platform/MonitoringClient.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/platform/monitoring/tasks/route.ts", import.meta.url), "utf8");
  const notifications = readFileSync(new URL("../app/_document-builder/notifications/NotificationsClient.tsx", import.meta.url), "utf8");
  const clientCase = readFileSync(new URL("../app/_platform/CaseWorkspaceClient.tsx", import.meta.url), "utf8");
  const lawyerWorkspace = readFileSync(new URL("../app/_platform/LawyerWorkspaceClient.tsx", import.meta.url), "utf8");
  const lawyerApi = readFileSync(new URL("../app/api/platform/lawyer-workspace/route.ts", import.meta.url), "utf8");
  assert.match(client, /fetch\("\/api\/platform\/monitoring\/tasks"/);
  assert.doesNotMatch(client, /href=\{`\$\{base\}\/action-plan`\}>\{t\.createTask\}/);
  assert.match(client, /monitoring-task-empty/);
  assert.match(route, /createMonitoringTaskFromChange/);
  assert.match(route, /assertSafeWrite/);
  assert.match(notifications, /case "case_task"/);
  assert.match(clientCase, /Официальный источник Lex\.uz/);
  assert.match(clientCase, /officialLexHref\(task\.legalBasis\)/);
  assert.match(clientCase, /!url\.username[\s\S]*!url\.password[\s\S]*!url\.port/);
  assert.match(lawyerWorkspace, /officialLexTaskHref\(task\.legalBasis\)/);
  assert.match(lawyerWorkspace, /!url\.username[\s\S]*!url\.password[\s\S]*!url\.port/);
  assert.match(lawyerApi, /t\.legal_basis AS legalBasis/);
});
