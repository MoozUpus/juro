import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canRedriveOperationalJob,
  OperationalJobError,
  readOperationalJobsDashboard,
  requestOperationalJobRedrive,
  verifyOperationalJobRedriveHistory,
} from "../lib/operations/job-operations";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-05T12:00:00.000Z");

function seedUser(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('jobs-admin','jobs-admin@example.test',?,?)")
    .run(now.toISOString(), now.toISOString());
}

function seedJob(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: { id: string; status?: string; errorCode?: string; leaseExpiresAt?: string | null },
): void {
  const status = input.status ?? "rejected";
  const errorCode = input.errorCode ?? "LEGAL_SOURCE_SYNC_FAILED";
  const outboxId = `${input.id}:outbox`;
  const idempotencyKey = `${input.id}:idempotency`;
  sqlite.prepare(`
    INSERT INTO job_outbox (
      id,queue_binding,job_type,schema_version,idempotency_key,subject_id,
      workspace_id,correlation_id,enqueued_at,available_at,status,
      dispatch_attempts,lease_owner,lease_expires_at,next_attempt_at,
      dispatched_at,error_code,created_at,updated_at
    ) VALUES (?,'LEGAL_SOURCES_SYNC_QUEUE','legal.sync',1,?,'sync:lex',NULL,?,
      ?,?,'dispatched',1,NULL,NULL,NULL,?,NULL,?,?)
  `).run(
    outboxId,
    idempotencyKey,
    `${input.id}:correlation`,
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
  );
  sqlite.prepare(`
    INSERT INTO job_runs (
      id,queue_name,message_id,job_type,schema_version,idempotency_key,
      subject_id,workspace_id,correlation_id,envelope_hash,status,attempt,
      lease_owner,lease_expires_at,next_attempt_at,error_code,started_at,
      finished_at,created_at,updated_at
    ) VALUES (?,'staging-legal-sources-sync',?,'legal.sync',1,?,'sync:lex',NULL,?,
      ?,?,2,NULL,?,NULL,?,?,?, ?,?)
  `).run(
    input.id,
    `${input.id}:message`,
    idempotencyKey,
    `${input.id}:correlation`,
    "A".repeat(64),
    status,
    input.leaseExpiresAt ?? null,
    errorCode,
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
  );
}

test("0085 safely reopens the same durable envelope and records immutable evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedUser(sqlite);
    seedJob(sqlite, { id: "job-redrive-1" });
    const before = await readOperationalJobsDashboard({ db: d1, environment: "staging", now });
    assert.equal(before.jobs.length, 1);
    assert.equal(before.jobs[0].canRedrive, true);
    assert.equal(JSON.stringify(before.jobs).includes("envelopeHash"), false);
    assert.equal(JSON.stringify(before.jobs).includes("idempotencyKey"), false);
    assert.equal(JSON.stringify(before.jobs).includes("messageId"), false);

    const event = await requestOperationalJobRedrive({
      db: d1,
      environment: "staging",
      actorUserId: "jobs-admin",
      now,
      value: { jobId: "job-redrive-1", reason: "The legal source dependency recovered after the incident." },
    });
    assert.equal(event.version, 1);
    assert.match(event.eventHash, /^[A-F0-9]{64}$/);
    assert.deepEqual(await verifyOperationalJobRedriveHistory(d1, "staging"), { valid: true, checked: 1 });
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,next_attempt_at,finished_at,error_code FROM job_runs WHERE id='job-redrive-1'").get() },
      { status: "retrying", next_attempt_at: now.toISOString(), finished_at: null, error_code: "LEGAL_SOURCE_SYNC_FAILED" },
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,available_at,dispatched_at,error_code FROM job_outbox WHERE id='job-redrive-1:outbox'").get() },
      { status: "pending", available_at: now.toISOString(), dispatched_at: null, error_code: null },
    );
    assert.throws(
      () => sqlite.prepare("UPDATE operational_job_redrive_events SET reason='tampered evidence' WHERE id=?").run(event.id),
      /OPERATIONAL_JOB_REDRIVE_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM operational_job_redrive_events WHERE id=?").run(event.id),
      /OPERATIONAL_JOB_REDRIVE_IMMUTABLE/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("0085 refuses permanent failures, active leases, cross-environment ids and no-op duplicates", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedUser(sqlite);
    seedJob(sqlite, { id: "job-permanent", errorCode: "JOB_QUEUE_MISMATCH" });
    seedJob(sqlite, { id: "job-leased", leaseExpiresAt: "2026-08-05T12:05:00.000Z" });
    assert.equal(canRedriveOperationalJob({ status: "rejected", errorCode: "JOB_QUEUE_MISMATCH", outboxStatus: "dispatched", leaseExpiresAt: null, now }), false);
    for (const jobId of ["job-permanent", "job-leased"]) {
      await assert.rejects(
        requestOperationalJobRedrive({ db: d1, environment: "staging", actorUserId: "jobs-admin", now, value: { jobId, reason: "This request must remain blocked by the server policy." } }),
        (error: unknown) => error instanceof OperationalJobError && error.code === "OPERATIONAL_JOB_REDRIVE_NOT_ALLOWED",
      );
    }
    await assert.rejects(
      requestOperationalJobRedrive({ db: d1, environment: "production", actorUserId: "jobs-admin", now, value: { jobId: "job-permanent", reason: "Cross-environment access must not discover this job." } }),
      (error: unknown) => error instanceof OperationalJobError && error.code === "OPERATIONAL_JOB_NOT_FOUND",
    );
    assert.equal((await readOperationalJobsDashboard({ db: d1, environment: "staging", filters: { status: "completed" } })).jobs.length, 0);
    const countRow = sqlite.prepare("SELECT COUNT(*) AS count FROM operational_job_redrive_events").get() as { count: number } | undefined;
    assert.equal(countRow?.count, 0);
  } finally { sqlite.close(); }
});

test("0114 permits audited redrive for a retryable terminal document-export claim race", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedUser(sqlite);
    const jobId = "document-export-not-ready";
    const outboxId = `${jobId}:outbox`;
    const idempotencyKey = `${jobId}:idempotency`;
    sqlite.prepare(`
      INSERT INTO job_outbox (
        id,queue_binding,job_type,schema_version,idempotency_key,subject_id,
        workspace_id,correlation_id,enqueued_at,available_at,status,
        dispatch_attempts,lease_owner,lease_expires_at,next_attempt_at,
        dispatched_at,error_code,created_at,updated_at
      ) VALUES (?,'DOCUMENT_EXPORT_QUEUE','document.export',1,?,'export:claim-race',NULL,?,
        ?,?,'dispatched',3,NULL,NULL,NULL,?,NULL,?,?)
    `).run(
      outboxId,
      idempotencyKey,
      `${jobId}:correlation`,
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    sqlite.prepare(`
      INSERT INTO job_runs (
        id,queue_name,message_id,job_type,schema_version,idempotency_key,
        subject_id,workspace_id,correlation_id,envelope_hash,status,attempt,
        lease_owner,lease_expires_at,next_attempt_at,error_code,started_at,
        finished_at,created_at,updated_at
      ) VALUES (?,'staging-document-export',?,'document.export',1,?,'export:claim-race',NULL,?,
        ?, 'dead_lettered',3,NULL,NULL,NULL,?, ?,?,?,?)
    `).run(
      jobId,
      `${jobId}:message`,
      idempotencyKey,
      `${jobId}:correlation`,
      "B".repeat(64),
      "DOCUMENT_EXPORT_NOT_READY",
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );

    assert.equal(canRedriveOperationalJob({
      status: "dead_lettered",
      errorCode: "DOCUMENT_EXPORT_NOT_READY",
      outboxStatus: "dispatched",
      leaseExpiresAt: null,
      now,
    }), true);
    const event = await requestOperationalJobRedrive({
      db: d1,
      environment: "staging",
      actorUserId: "jobs-admin",
      now,
      value: { jobId, reason: "The document-export claim race has cleared and needs a safe replay." },
    });
    assert.equal(event.previousErrorCode, "DOCUMENT_EXPORT_NOT_READY");
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,error_code,next_attempt_at FROM job_runs WHERE id=?").get(jobId) },
      { status: "retrying", error_code: "DOCUMENT_EXPORT_NOT_READY", next_attempt_at: now.toISOString() },
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,error_code,available_at FROM job_outbox WHERE id=?").get(outboxId) },
      { status: "pending", error_code: null, available_at: now.toISOString() },
    );
    assert.deepEqual(await verifyOperationalJobRedriveHistory(d1, "staging", jobId), { valid: true, checked: 1 });
  } finally { sqlite.close(); }
});

test("0085 fails closed when redrive history is corrupted", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedUser(sqlite);
    seedJob(sqlite, { id: "job-corrupt" });
    const event = await requestOperationalJobRedrive({
      db: d1, environment: "staging", actorUserId: "jobs-admin", now,
      value: { jobId: "job-corrupt", reason: "Create evidence before the corruption simulation starts." },
    });
    sqlite.exec("DROP TRIGGER operational_job_redrive_no_update");
    sqlite.prepare("UPDATE operational_job_redrive_events SET reason=? WHERE id=?")
      .run("Evidence changed outside the protected operational path.", event.id);
    assert.deepEqual(await verifyOperationalJobRedriveHistory(d1, "staging"), { valid: false, checked: 1 });
    assert.equal((await readOperationalJobsDashboard({ db: d1, environment: "staging", now })).integrity.valid, false);
  } finally { sqlite.close(); }
});

test("jobs console requires fresh operational staff access and avoids content/payload surfaces", () => {
  const api = readFileSync(new URL("../app/api/platform/admin/jobs/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/[locale]/admin/jobs/page.tsx", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../app/_staff/JobOperationsConsole.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/operations/job-operations.ts", import.meta.url), "utf8");
  assert.match(api, /requirePlatformStaffRequest\(request, "staff\.operations\.manage", \{ freshMfaWithinMs: 15 \* 60 \* 1_000 \}\)/);
  assert.match(api, /assertSafeWrite\(request\)/);
  assert.match(page, /requirePlatformStaffAccess\(runtime\.DB, session, "staff\.operations\.manage"/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|transition:\s*all|window\.confirm/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /staff-skip/);
  assert.match(ui, /minLength=\{10\}/);
  assert.doesNotMatch(service, /SELECT\s+\*|payload|content|envelope_hash AS/);
});
