import assert from "node:assert/strict";
import test from "node:test";
import { recordDependencyHealth } from "../lib/operations/dependency-health";
import {
  reconcileQueueDlqHealth,
  type QueueDlqHealthReconciliationSummary,
} from "../worker/queue-dlq-health-reconciliation";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-12T07:10:00.000Z");

function environment(
  db: D1Database,
  input: {
    documentBacklog?: number;
    ocrBacklog?: number;
    documentMetricsError?: boolean;
  } = {},
) {
  const metrics = (backlog: number, shouldFail = false) => ({
    async metrics() {
      if (shouldFail) throw new Error("synthetic queue metrics unavailable");
      return { backlogCount: backlog, backlogBytes: 0 };
    },
  });
  return {
    APP_ENV: "staging" as const,
    DB: db,
    DOCUMENT_ANALYSIS_DLQ: metrics(input.documentBacklog ?? 0, input.documentMetricsError),
    OCR_PROCESSING_DLQ: metrics(input.ocrBacklog ?? 0),
  };
}

async function latestHealth(
  db: D1Database,
): Promise<{ state: string; safeErrorCode: string | null; evidenceKind: string } | null> {
  const row = await db.prepare(
    `SELECT state,safe_error_code AS safeErrorCode,evidence_kind AS evidenceKind
     FROM dependency_health_checks
     WHERE environment='staging' AND dependency_key='queue_dlq'
     ORDER BY checked_at DESC,id DESC LIMIT 1`,
  ).first<{ state: string; safeErrorCode: string | null; evidenceKind: string }>();
  return row ? { ...row } : null;
}

async function recordFailure(
  db: D1Database,
  checkedAt: Date,
  code: "DLQ_BACKLOG" | "DLQ_INVALID_MESSAGE" | "DLQ_UNMATCHED_MESSAGE" = "DLQ_BACKLOG",
): Promise<void> {
  await recordDependencyHealth({
    db,
    now: checkedAt,
    value: {
      environment: "staging",
      key: "queue_dlq",
      state: "degraded",
      latencyMs: 10,
      safeErrorCode: code,
      evidenceKind: "integration_event",
    },
  });
}

test("records operational DLQ health only after live zero backlog, no dead-lettered ledger work, and quiet time", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordFailure(d1, new Date("2026-08-12T07:00:00.000Z"));
    const result = await reconcileQueueDlqHealth(environment(d1), { now });
    assert.deepEqual(result, {
      state: "operational_recorded",
      documentAnalysisBacklog: 0,
      ocrBacklog: 0,
      durableDeadLettered: 0,
    } satisfies QueueDlqHealthReconciliationSummary);
    assert.deepEqual(await latestHealth(d1), {
      state: "operational",
      safeErrorCode: null,
      evidenceKind: "scheduled_job",
    });
  } finally {
    sqlite.close();
  }
});

test("does not clear a recent DLQ event or a current backlog", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordFailure(d1, new Date("2026-08-12T07:08:00.000Z"));
    const quiet = await reconcileQueueDlqHealth(environment(d1), { now });
    assert.equal(quiet.state, "quiet_window");
    assert.deepEqual(await latestHealth(d1), {
      state: "degraded",
      safeErrorCode: "DLQ_BACKLOG",
      evidenceKind: "integration_event",
    });

    const backlog = await reconcileQueueDlqHealth(
      environment(d1, { documentBacklog: 1 }),
      { now: new Date("2026-08-12T07:20:00.000Z") },
    );
    assert.equal(backlog.state, "backlog_present");
    assert.equal(backlog.documentAnalysisBacklog, 1);
    assert.deepEqual(await latestHealth(d1), {
      state: "degraded",
      safeErrorCode: "DLQ_BACKLOG",
      evidenceKind: "scheduled_job",
    });
  } finally {
    sqlite.close();
  }
});

test("does not clear DLQ health while a durable document/OCR job remains dead-lettered", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    sqlite.prepare(`
      INSERT INTO job_runs (
        id,queue_name,message_id,job_type,schema_version,idempotency_key,
        subject_id,workspace_id,correlation_id,envelope_hash,status,attempt,
        lease_owner,lease_expires_at,next_attempt_at,error_code,started_at,
        finished_at,created_at,updated_at
      ) VALUES (
        'document-dead-lettered','staging-document-analysis','message-1',
        'document.analyze',1,'idempotency-1','analysis-1',NULL,'correlation-1',
        ?, 'dead_lettered',3,NULL,NULL,NULL,'DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE',
        '2026-08-12T07:00:00.000Z','2026-08-12T07:01:00.000Z',
        '2026-08-12T07:00:00.000Z','2026-08-12T07:01:00.000Z'
      )
    `).run("A".repeat(64));
    const result = await reconcileQueueDlqHealth(environment(d1), { now });
    assert.deepEqual(result, {
      state: "durable_work_pending",
      documentAnalysisBacklog: 0,
      ocrBacklog: 0,
      durableDeadLettered: 1,
    } satisfies QueueDlqHealthReconciliationSummary);
    assert.equal((await latestHealth(d1))?.state, "degraded");
  } finally {
    sqlite.close();
  }
});

test("never automatically clears malformed or unmatched DLQ evidence; a later manual verification is explicit", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordFailure(d1, new Date("2026-08-12T07:00:00.000Z"), "DLQ_INVALID_MESSAGE");
    const blocked = await reconcileQueueDlqHealth(environment(d1), { now });
    assert.equal(blocked.state, "invalid_or_unmatched_pending");
    assert.equal((await latestHealth(d1))?.safeErrorCode, "DLQ_INVALID_MESSAGE");

    await recordDependencyHealth({
      db: d1,
      now: new Date("2026-08-12T07:11:00.000Z"),
      value: {
        environment: "staging",
        key: "queue_dlq",
        state: "operational",
        latencyMs: 1,
        evidenceKind: "manual_verification",
      },
    });
    const verified = await reconcileQueueDlqHealth(
      environment(d1),
      { now: new Date("2026-08-12T07:20:00.000Z") },
    );
    assert.ok(["operational_recorded", "operational_not_recorded"].includes(verified.state));
    assert.equal((await latestHealth(d1))?.state, "operational");
  } finally {
    sqlite.close();
  }
});

test("records a degraded verification failure rather than inventing a zero-backlog result", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const result = await reconcileQueueDlqHealth(
      environment(d1, { documentMetricsError: true }),
      { now },
    );
    assert.deepEqual(result, {
      state: "verification_unavailable",
      documentAnalysisBacklog: null,
      ocrBacklog: null,
      durableDeadLettered: null,
    } satisfies QueueDlqHealthReconciliationSummary);
    assert.deepEqual(await latestHealth(d1), {
      state: "degraded",
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      evidenceKind: "scheduled_job",
    });
  } finally {
    sqlite.close();
  }
});
