import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ATTACHED_PLATFORM_QUEUE_BINDINGS,
  JOB_KINDS,
  LEGACY_JOB_KINDS,
  QUEUE_BINDING_BY_KIND,
  expectedQueueName,
  handleQueue,
  jobEnvelopeSchema,
  type JobEnvelope,
  type JobKind,
  type PlatformJobEnv,
} from "../worker/platform-jobs";
import { dispatchOutbox } from "../worker/platform-outbox";
import { handleScheduled } from "../worker/platform-scheduled";

class SqliteD1Statement {
  constructor(
    private readonly owner: SqliteD1,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.owner, this.sql, values);
  }

  private sqliteValues(): Array<null | number | bigint | string> {
    return this.values.map((value) => {
      if (
        value === null ||
        typeof value === "number" ||
        typeof value === "bigint" ||
        typeof value === "string"
      ) {
        return value;
      }
      throw new TypeError("Unsupported synthetic D1 binding value.");
    });
  }

  async run<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: true;
    meta: { changes: number };
  }> {
    if (
      this.owner.stealJobLeaseOnReject &&
      /SET status = 'rejected'/i.test(this.sql)
    ) {
      this.owner.database.prepare(`
        UPDATE job_runs
        SET lease_owner = 'newer-worker',
            lease_expires_at = '2999-01-01T00:00:00.000Z'
        WHERE status = 'running'
      `).run();
    }
    const statement = this.owner.database.prepare(this.sql);
    let results: T[] = [];
    let changes = 0;
    if (/\bRETURNING\b/i.test(this.sql)) {
      results = statement.all(...this.sqliteValues()) as T[];
      changes = Number(
        (
          this.owner.database.prepare(
            "SELECT changes() AS changes",
          ).get() as { changes: number | bigint }
        ).changes,
      );
    } else {
      const result = statement.run(...this.sqliteValues());
      changes = Number(result.changes);
    }
    return { results, success: true, meta: { changes } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.owner.database.prepare(this.sql).get(
      ...this.sqliteValues(),
    ) as T | undefined) ?? null;
  }
}

class SqliteD1 {
  prepareCalls = 0;
  stealJobLeaseOnReject = false;

  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string): SqliteD1Statement {
    this.prepareCalls += 1;
    return new SqliteD1Statement(this, sql);
  }

  async batch<T = unknown>(
    statements: SqliteD1Statement[],
  ): Promise<Array<{
    results: T[];
    success: true;
    meta: { changes: number };
  }>> {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run<T>());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function latestMigrationSql(): string {
  const journal = JSON.parse(
    readFileSync(
      new URL("../drizzle/meta/_journal.json", import.meta.url),
      "utf8",
    ),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const entry = journal.entries.find(({ idx }) => idx === 11);
  assert.ok(entry);
  return readFileSync(
    new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
    "utf8",
  );
}

function createDatabase(): {
  sqlite: DatabaseSync;
  d1: SqliteD1;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id text PRIMARY KEY NOT NULL,
      type text NOT NULL,
      name text NOT NULL,
      locale text DEFAULT 'ru' NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    INSERT INTO workspaces (
      id, type, name, locale, created_at, updated_at
    ) VALUES (
      'ws_test', 'individual', 'Synthetic workspace', 'ru',
      '2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z'
    );
  `);
  for (
    const statement of latestMigrationSql()
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean)
  ) {
    sqlite.exec(statement);
  }
  return { sqlite, d1: new SqliteD1(sqlite) };
}

type QueueSend = {
  binding: string;
  body: unknown;
};

function createEnv(
  d1: SqliteD1,
  options: {
    asyncEnabled?: string;
    cronEnabled?: string;
    schemaVersion?: string;
    analyticsThrows?: boolean;
    failingQueueBindings?: string[];
  } = {},
): {
  env: PlatformJobEnv;
  metrics: unknown[];
  sends: QueueSend[];
} {
  const metrics: unknown[] = [];
  const sends: QueueSend[] = [];
  const failing = new Set(options.failingQueueBindings ?? []);
  const queue = (binding: string) => ({
    async send(body: unknown) {
      if (failing.has(binding)) {
        throw new Error("synthetic queue failure");
      }
      sends.push({ binding, body });
      return {
        metadata: {
          metrics: {
            backlogCount: 0,
            backlogBytes: 0,
          },
        },
      };
    },
  });

  const env = {
    DB: d1,
    APP_ENV: "development",
    ASYNC_RUNTIME_ENABLED: options.asyncEnabled ?? "true",
    CRON_ENABLED: options.cronEnabled ?? "false",
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    JOB_SCHEMA_VERSION: options.schemaVersion ?? "1",
    PLATFORM_ANALYTICS: {
      writeDataPoint(value: unknown) {
        if (options.analyticsThrows) {
          throw new Error("synthetic analytics failure");
        }
        metrics.push(value);
      },
    },
    DOCUMENT_ANALYSIS_QUEUE: queue("DOCUMENT_ANALYSIS_QUEUE"),
    OCR_PROCESSING_QUEUE: queue("OCR_PROCESSING_QUEUE"),
    DOCUMENT_EXPORT_QUEUE: queue("DOCUMENT_EXPORT_QUEUE"),
    EMAIL_NOTIFICATIONS_QUEUE: queue("EMAIL_NOTIFICATIONS_QUEUE"),
    LEGAL_SOURCES_SYNC_QUEUE: queue("LEGAL_SOURCES_SYNC_QUEUE"),
    DATA_RETENTION_CLEANUP_QUEUE: queue("DATA_RETENTION_CLEANUP_QUEUE"),
    NOTIFICATIONS_QUEUE: queue("NOTIFICATIONS_QUEUE"),
  } as unknown as PlatformJobEnv;
  return { env, metrics, sends };
}

type MessageState = {
  acknowledgements: number;
  retries: Array<{ delaySeconds?: number } | undefined>;
};

function mockMessage(
  body: unknown,
  id: string,
  attempts = 1,
): {
  message: Message<unknown>;
  state: MessageState;
} {
  const state: MessageState = {
    acknowledgements: 0,
    retries: [],
  };
  const message = {
    id,
    timestamp: new Date(),
    body,
    attempts,
    ack() {
      state.acknowledgements += 1;
    },
    retry(options?: { delaySeconds?: number }) {
      state.retries.push(options);
    },
  } satisfies Message<unknown>;
  return { message, state };
}

function mockBatch(
  queue: string,
  messages: Message<unknown>[],
): {
  batch: MessageBatch<unknown>;
  retryAll: Array<{ delaySeconds?: number } | undefined>;
} {
  const retryAll: Array<{ delaySeconds?: number } | undefined> = [];
  const batch = {
    queue,
    messages,
    metadata: {
      metrics: {
        backlogCount: messages.length,
        backlogBytes: 0,
      },
    },
    retryAll(options?: { delaySeconds?: number }) {
      retryAll.push(options);
    },
    ackAll() {
      for (const message of messages) {
        message.ack();
      }
    },
  } satisfies MessageBatch<unknown>;
  return { batch, retryAll };
}

function envelope(
  kind: JobKind = "notification.dispatch",
  overrides: Partial<JobEnvelope> = {},
): JobEnvelope {
  const tenantKind = new Set<JobKind>([
    "document.analyze",
    "ocr.process",
    "document.export",
    "email.send",
    "notification.dispatch",
    "malware.scan",
  ]).has(kind);
  return {
    schemaVersion: 1,
    jobId: `job_${kind.replaceAll(".", "_")}`,
    kind,
    idempotencyKey: `idem_${kind.replaceAll(".", "_")}`,
    subjectId: `subject_${kind.replaceAll(".", "_")}`,
    ...(tenantKind ? { workspaceId: "ws_test" } : {}),
    correlationId: `corr_${kind.replaceAll(".", "_")}`,
    enqueuedAt: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

async function runBatch(
  env: PlatformJobEnv,
  queue: string,
  messages: Message<unknown>[],
): Promise<ReturnType<typeof mockBatch>> {
  const mocked = mockBatch(queue, messages);
  await handleQueue(mocked.batch, env);
  return mocked;
}

test("accepts supported identifiers-only envelopes", () => {
  for (const kind of JOB_KINDS) {
    assert.equal(jobEnvelopeSchema.safeParse(envelope(kind)).success, true);
  }
});

test("routes only v2 task kinds and compatibility-blocks legacy kinds", () => {
  assert.deepEqual(
    JOB_KINDS.map((kind) => [
      kind,
      QUEUE_BINDING_BY_KIND[kind],
      expectedQueueName(kind, "staging"),
    ]),
    [
      ["document.analyze", "DOCUMENT_ANALYSIS_QUEUE", "staging-document-analysis"],
      ["ocr.process", "OCR_PROCESSING_QUEUE", "staging-ocr-processing"],
      ["document.export", "DOCUMENT_EXPORT_QUEUE", "staging-document-export"],
      ["email.send", "EMAIL_NOTIFICATIONS_QUEUE", "staging-email-notifications"],
      ["legal.sync", "LEGAL_SOURCES_SYNC_QUEUE", "staging-legal-sources-sync"],
      ["legal.parse", "LEGAL_SOURCES_SYNC_QUEUE", "staging-legal-sources-sync"],
      ["cleanup.run", "DATA_RETENTION_CLEANUP_QUEUE", "staging-data-retention-cleanup"],
      ["notification.dispatch", "NOTIFICATIONS_QUEUE", "staging-notifications"],
      ["malware.scan", "MALWARE_SCAN_QUEUE", "staging-malware-scan"],
    ],
  );
  assert.equal(
    ATTACHED_PLATFORM_QUEUE_BINDINGS.includes("MALWARE_SCAN_QUEUE" as never),
    false,
  );

  for (const legacyKind of LEGACY_JOB_KINDS) {
    assert.equal(
      jobEnvelopeSchema.safeParse({
        ...envelope(),
        kind: legacyKind,
      }).success,
      false,
    );
    assert.equal(Object.hasOwn(QUEUE_BINDING_BY_KIND, legacyKind), false);
    assert.throws(
      () =>
        (expectedQueueName as unknown as (
          kind: string,
          environment: "development",
        ) => string)(legacyKind, "development"),
      /Unsupported job kind/,
    );
  }
});

test("rejects unknown fields, content payloads, bad versions, and missing tenant scope", () => {
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...envelope(),
      payload: { documentText: "must never enter a queue" },
    }).success,
    false,
  );
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...envelope(),
      schemaVersion: 2,
    }).success,
    false,
  );
  const tenant = envelope("document.analyze");
  delete (tenant as Partial<JobEnvelope>).workspaceId;
  assert.equal(jobEnvelopeSchema.safeParse(tenant).success, false);
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...envelope(),
      subjectId: "not allowed!",
    }).success,
    false,
  );
});

test("disabled or incompatible runtimes retry the batch without D1 access", async () => {
  for (const options of [
    { asyncEnabled: "false" },
    { schemaVersion: "2" },
  ]) {
    const { sqlite, d1 } = createDatabase();
    try {
      const { env } = createEnv(d1, options);
      const item = mockMessage(envelope(), `message_${options.asyncEnabled ?? "schema"}`);
      const { retryAll } = await runBatch(
        env,
        expectedQueueName("cleanup.run", "development"),
        [item.message],
      );
      assert.deepEqual(retryAll, [{ delaySeconds: 300 }]);
      assert.equal(d1.prepareCalls, 0);
      assert.equal(item.state.acknowledgements, 0);
    } finally {
      sqlite.close();
    }
  }
});

test("invalid messages are acknowledged without persistence or telemetry", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env, metrics } = createEnv(d1);
    const item = mockMessage({ version: 0, content: "unsafe" }, "invalid");
    await runBatch(
      env,
      expectedQueueName("cleanup.run", "development"),
      [item.message],
    );
    assert.equal(item.state.acknowledgements, 1);
    assert.deepEqual(item.state.retries, []);
    assert.equal(d1.prepareCalls, 0);
    assert.deepEqual(metrics, []);
  } finally {
    sqlite.close();
  }
});

test("unimplemented v2 handlers reject exactly once and redelivery is deduplicated", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env, metrics } = createEnv(d1);
    const body = envelope();
    const first = mockMessage(body, "probe_message_1");
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [first.message],
    );
    assert.equal(first.state.acknowledgements, 1);
    assert.deepEqual(first.state.retries, []);

    const row = sqlite.prepare(`
      SELECT status, lease_owner, error_code
      FROM job_runs
      WHERE idempotency_key = ?
    `).get(body.idempotencyKey) as {
      status: string;
      lease_owner: string | null;
      error_code: string | null;
    };
    assert.equal(row.status, "rejected");
    assert.equal(row.lease_owner, null);
    assert.equal(row.error_code, "JOB_HANDLER_NOT_ENABLED");
    assert.equal(metrics.length, 1);

    const duplicate = mockMessage(body, "probe_message_2", 2);
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [duplicate.message],
    );
    assert.equal(duplicate.state.acknowledgements, 1);
    assert.deepEqual(duplicate.state.retries, []);
    assert.equal(
      (
        sqlite.prepare(
          "SELECT COUNT(*) AS count FROM job_runs",
        ).get() as { count: number }
      ).count,
      1,
    );
    assert.equal(metrics.length, 1);
  } finally {
    sqlite.close();
  }
});

test("idempotency hash conflicts are acknowledged without overwriting the original", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1);
    const original = envelope();
    const first = mockMessage(original, "conflict_1");
    await runBatch(
      env,
      expectedQueueName(original.kind, "development"),
      [first.message],
    );

    const conflictBody = envelope("cleanup.run", {
      jobId: "job_conflict_second",
      idempotencyKey: original.idempotencyKey,
      subjectId: "subject_conflict_second",
    });
    const conflict = mockMessage(conflictBody, "conflict_2");
    await runBatch(
      env,
      expectedQueueName(conflictBody.kind, "development"),
      [conflict.message],
    );
    assert.equal(conflict.state.acknowledgements, 1);
    assert.deepEqual(conflict.state.retries, []);
    const stored = sqlite.prepare(`
      SELECT id, subject_id
      FROM job_runs
      WHERE idempotency_key = ?
    `).get(original.idempotencyKey) as {
      id: string;
      subject_id: string;
    };
    assert.equal(stored.id, original.jobId);
    assert.equal(stored.subject_id, original.subjectId);
  } finally {
    sqlite.close();
  }
});

test("a reused job id with a different idempotency key is a terminal conflict", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1);
    const original = envelope();
    const first = mockMessage(original, "job_id_conflict_1");
    await runBatch(
      env,
      expectedQueueName(original.kind, "development"),
      [first.message],
    );

    const conflicting = envelope("cleanup.run", {
      jobId: original.jobId,
      idempotencyKey: "idem_same_job_different_key",
      correlationId: "corr_same_job_different_key",
    });
    const second = mockMessage(conflicting, "job_id_conflict_2");
    await runBatch(
      env,
      expectedQueueName(conflicting.kind, "development"),
      [second.message],
    );

    assert.equal(second.state.acknowledgements, 1);
    assert.deepEqual(second.state.retries, []);
    assert.equal(
      (
        sqlite.prepare(
          "SELECT COUNT(*) AS count FROM job_runs",
        ).get() as { count: number }
      ).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("active leases retry and expired leases are reclaimed", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1);
    const body = envelope();
    const seed = mockMessage(body, "lease_seed");
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [seed.message],
    );

    sqlite.prepare(`
      UPDATE job_runs
      SET status = 'running',
          lease_owner = 'other-worker',
          lease_expires_at = '2999-01-01T00:00:00.000Z',
          finished_at = NULL
      WHERE idempotency_key = ?
    `).run(body.idempotencyKey);
    const busy = mockMessage(body, "lease_busy", 2);
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [busy.message],
    );
    assert.equal(busy.state.acknowledgements, 0);
    assert.deepEqual(busy.state.retries, [{ delaySeconds: 30 }]);

    sqlite.prepare(`
      UPDATE job_runs
      SET lease_expires_at = '2000-01-01T00:00:00.000Z'
      WHERE idempotency_key = ?
    `).run(body.idempotencyKey);
    const takeover = mockMessage(body, "lease_takeover", 3);
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [takeover.message],
    );
    assert.equal(takeover.state.acknowledgements, 1);
    assert.deepEqual(takeover.state.retries, []);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT status FROM job_runs WHERE idempotency_key = ?
        `).get(body.idempotencyKey) as { status: string }
      ).status,
      "rejected",
    );
  } finally {
    sqlite.close();
  }
});

test("a stale lease owner cannot complete or fail a newer claim", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1);
    d1.stealJobLeaseOnReject = true;
    const body = envelope("cleanup.run", {
      jobId: "job_stale_worker",
      idempotencyKey: "idem_stale_worker",
      subjectId: "subject_stale_worker",
      correlationId: "corr_stale_worker",
    });
    const item = mockMessage(body, "stale_worker");
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [item.message],
    );
    assert.equal(item.state.acknowledgements, 0);
    assert.deepEqual(item.state.retries, [{ delaySeconds: 15 }]);
    const row = sqlite.prepare(`
      SELECT status, lease_owner, error_code
      FROM job_runs
      WHERE idempotency_key = ?
    `).get(body.idempotencyKey) as {
      status: string;
      lease_owner: string;
      error_code: string | null;
    };
    assert.equal(row.status, "running");
    assert.equal(row.lease_owner, "newer-worker");
    assert.equal(row.error_code, null);
  } finally {
    sqlite.close();
  }
});

test("queue mismatches and disabled handlers are recorded as terminal rejections", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1);
    const mismatchedBody = envelope("document.analyze");
    const mismatch = mockMessage(mismatchedBody, "mismatch");
    await runBatch(
      env,
      expectedQueueName("document.export", "development"),
      [mismatch.message],
    );
    assert.equal(mismatch.state.acknowledgements, 1);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT error_code FROM job_runs WHERE idempotency_key = ?
        `).get(mismatchedBody.idempotencyKey) as { error_code: string }
      ).error_code,
      "JOB_QUEUE_MISMATCH",
    );

    const disabledBody = envelope("ocr.process", {
      jobId: "job_ocr_disabled",
      idempotencyKey: "idem_ocr_disabled",
      correlationId: "corr_ocr_disabled",
    });
    const disabled = mockMessage(disabledBody, "disabled_handler");
    await runBatch(
      env,
      expectedQueueName(disabledBody.kind, "development"),
      [disabled.message],
    );
    assert.equal(disabled.state.acknowledgements, 1);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT error_code FROM job_runs WHERE idempotency_key = ?
        `).get(disabledBody.idempotencyKey) as { error_code: string }
      ).error_code,
      "JOB_HANDLER_NOT_ENABLED",
    );
  } finally {
    sqlite.close();
  }
});

test("document analysis queue refuses quarantined tenant rows before R2 or AI access", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    sqlite.exec(`
      CREATE TABLE document_files (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
        kind TEXT NOT NULL, r2_key TEXT NOT NULL, file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT,
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE document_analyses (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
        uploaded_file_id TEXT NOT NULL, status TEXT NOT NULL, summary_json TEXT,
        error_code TEXT, consent_version TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO document_files VALUES (
        'file_unsafe','ws_test','user_test','analysis_quarantined','quarantine/ws_test/file_unsafe',
        'synthetic.pdf','application/pdf',10,'${"0".repeat(64)}',NULL,
        '2026-07-26T00:00:00.000Z','2026-07-26T00:00:00.000Z'
      );
      INSERT INTO document_analyses VALUES (
        'analysis_unsafe','ws_test','user_test','file_unsafe','quarantined',
        '{"mode":"quick","locale":"ru"}','MALWARE_SCANNER_UNAVAILABLE','2026-07-30',
        '2026-07-26T00:00:00.000Z','2026-07-26T00:00:00.000Z'
      );
    `);
    const { env } = createEnv(d1);
    const body = envelope("document.analyze", {
      jobId: "job_document_unsafe",
      idempotencyKey: "idem_document_unsafe",
      subjectId: "analysis_unsafe",
      workspaceId: "ws_test",
      correlationId: "corr_document_unsafe",
    });
    const item = mockMessage(body, "document_unsafe");
    await runBatch(env, expectedQueueName(body.kind, "development"), [item.message]);
    assert.equal(item.state.acknowledgements, 1);
    assert.deepEqual(item.state.retries, []);
    const job = sqlite.prepare(
      "SELECT status,error_code AS errorCode FROM job_runs WHERE idempotency_key=?",
    ).get(body.idempotencyKey) as { status: string; errorCode: string };
    assert.equal(job.status, "rejected");
    assert.equal(job.errorCode, "DOCUMENT_ANALYSIS_FILE_UNSAFE");
    const analysis = sqlite.prepare(
      "SELECT status,error_code AS errorCode FROM document_analyses WHERE id='analysis_unsafe'",
    ).get() as { status: string; errorCode: string };
    assert.equal(analysis.status, "quarantined");
    assert.equal(analysis.errorCode, "MALWARE_SCANNER_UNAVAILABLE");
  } finally {
    sqlite.close();
  }
});

test("invalid and disabled messages remain isolated within a batch", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1);
    const failingBody = envelope();
    const invalid = mockMessage({ unsafe: true }, "mixed_invalid");
    const failing = mockMessage(failingBody, "mixed_failing", 2);
    await runBatch(
      env,
      expectedQueueName(failingBody.kind, "development"),
      [invalid.message, failing.message],
    );
    assert.equal(invalid.state.acknowledgements, 1);
    assert.deepEqual(invalid.state.retries, []);
    assert.equal(failing.state.acknowledgements, 1);
    assert.deepEqual(failing.state.retries, []);
    const row = sqlite.prepare(`
      SELECT status, error_code, next_attempt_at
      FROM job_runs
      WHERE idempotency_key = ?
    `).get(failingBody.idempotencyKey) as {
      status: string;
      error_code: string;
      next_attempt_at: string | null;
    };
    assert.equal(row.status, "rejected");
    assert.equal(row.error_code, "JOB_HANDLER_NOT_ENABLED");
    assert.equal(row.next_attempt_at, null);
  } finally {
    sqlite.close();
  }
});

test("telemetry failures never roll back a durable rejection", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    const { env } = createEnv(d1, { analyticsThrows: true });
    const body = envelope();
    const item = mockMessage(body, "metrics_failure");
    await runBatch(
      env,
      expectedQueueName(body.kind, "development"),
      [item.message],
    );
    assert.equal(item.state.acknowledgements, 1);
    assert.deepEqual(item.state.retries, []);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT status FROM job_runs WHERE idempotency_key = ?
        `).get(body.idempotencyKey) as { status: string }
      ).status,
      "rejected",
    );
  } finally {
    sqlite.close();
  }
});

test("structured logs never contain rejected message content", async () => {
  const { sqlite, d1 } = createDatabase();
  const entries: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values: unknown[]) => entries.push(values.join(" "));
  console.error = (...values: unknown[]) => entries.push(values.join(" "));
  try {
    const { env } = createEnv(d1);
    const marker = "SECRET_DOCUMENT_TEXT_42";
    const item = mockMessage({
      ...envelope(),
      payload: { text: marker },
    }, "secret_log_test");
    await runBatch(
      env,
      expectedQueueName("cleanup.run", "development"),
      [item.message],
    );
    assert.equal(item.state.acknowledgements, 1);
    assert.doesNotMatch(entries.join("\n"), new RegExp(marker));
  } finally {
    console.log = originalLog;
    console.error = originalError;
    sqlite.close();
  }
});

test("scheduled runtime remains inert when disabled and rejects unknown cron", async () => {
  for (const options of [
    { asyncEnabled: "false", cronEnabled: "false" },
    { asyncEnabled: "true", cronEnabled: "false" },
    { asyncEnabled: "true", cronEnabled: "true" },
  ]) {
    const { sqlite, d1 } = createDatabase();
    try {
      const { env } = createEnv(d1, options);
      let noRetryCalls = 0;
      await handleScheduled(
        {
          scheduledTime: Date.UTC(2026, 6, 26),
          cron: "0 0 * * *",
          noRetry() {
            noRetryCalls += 1;
          },
        },
        env,
      );
      assert.equal(noRetryCalls, 1);
      assert.equal(d1.prepareCalls, 0);
    } finally {
      sqlite.close();
    }
  }
});

test("reviewed outbox cron is locked, durable, and idempotent", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    insertOutbox(sqlite);
    const { env, sends } = createEnv(d1, {
      asyncEnabled: "true",
      cronEnabled: "true",
    });
    let noRetryCalls = 0;
    const controller = {
      scheduledTime: Date.UTC(2026, 6, 26, 0, 5),
      cron: "*/5 * * * *",
      noRetry() {
        noRetryCalls += 1;
      },
    } satisfies ScheduledController;
    await handleScheduled(controller, env);
    assert.equal(noRetryCalls, 0);
    assert.equal(sends.length, 1);
    assert.deepEqual(
      { ...sqlite.prepare(
        `SELECT status,error_code AS errorCode
         FROM scheduled_runs WHERE schedule_name='outbox-dispatch'`,
      ).get() },
      { status: "completed", errorCode: null },
    );
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS total FROM scheduled_locks").get() as { total: number }).total,
      0,
    );

    await handleScheduled(controller, env);
    assert.equal(noRetryCalls, 1);
    assert.equal(sends.length, 1);
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS total FROM scheduled_runs").get() as { total: number }).total,
      1,
    );
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS total FROM scheduled_locks").get() as { total: number }).total,
      0,
    );
  } finally {
    sqlite.close();
  }
});
function insertOutbox(
  sqlite: DatabaseSync,
  overrides: Partial<{
    id: string;
    queueBinding: string;
    kind: string;
    idempotencyKey: string;
    subjectId: string;
    workspaceId: string | null;
    correlationId: string;
    status: string;
    leaseOwner: string | null;
    leaseExpiresAt: string | null;
  }> = {},
): void {
  const input = {
    id: "outbox_probe",
    queueBinding: "DATA_RETENTION_CLEANUP_QUEUE",
    kind: "cleanup.run",
    idempotencyKey: "outbox_idem_probe",
    subjectId: "outbox_subject_probe",
    workspaceId: null,
    correlationId: "outbox_corr_probe",
    status: "pending",
    leaseOwner: null,
    leaseExpiresAt: null,
    ...overrides,
  };
  sqlite.prepare(`
    INSERT INTO job_outbox (
      id, queue_binding, job_type, schema_version, idempotency_key,
      subject_id, workspace_id, correlation_id, enqueued_at,
      available_at, status, dispatch_attempts, lease_owner,
      lease_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).run(
    input.id,
    input.queueBinding,
    input.kind,
    input.idempotencyKey,
    input.subjectId,
    input.workspaceId,
    input.correlationId,
    "2026-07-26T00:00:00.000Z",
    "2000-01-01T00:00:00.000Z",
    input.status,
    input.leaseOwner,
    input.leaseExpiresAt,
    "2026-07-26T00:00:00.000Z",
    "2026-07-26T00:00:00.000Z",
  );
}

test("outbox dispatch is leased, identifiers-only, and fenced on success", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    insertOutbox(sqlite);
    const { env, sends } = createEnv(d1);
    const result = await dispatchOutbox(env);
    assert.deepEqual(result, {
      claimed: 1,
      dispatched: 1,
      rejected: 0,
      retrying: 0,
    });
    assert.equal(sends.length, 1);
    assert.equal(sends[0]?.binding, "DATA_RETENTION_CLEANUP_QUEUE");
    assert.deepEqual(
      Object.keys(sends[0]?.body as Record<string, unknown>).sort(),
      [
        "correlationId",
        "enqueuedAt",
        "idempotencyKey",
        "jobId",
        "kind",
        "schemaVersion",
        "subjectId",
        "workspaceId",
      ].sort(),
    );
    const row = sqlite.prepare(`
      SELECT status, lease_owner, dispatched_at
      FROM job_outbox
      WHERE id = 'outbox_probe'
    `).get() as {
      status: string;
      lease_owner: string | null;
      dispatched_at: string | null;
    };
    assert.equal(row.status, "dispatched");
    assert.equal(row.lease_owner, null);
    assert.ok(row.dispatched_at);
  } finally {
    sqlite.close();
  }
});

test("subject-scoped outbox dispatch leaves neighboring work pending", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    insertOutbox(sqlite, {
      id: "outbox_neighbor",
      idempotencyKey: "outbox_idem_neighbor",
      subjectId: "subject_neighbor",
      correlationId: "outbox_corr_neighbor",
    });
    insertOutbox(sqlite, {
      id: "outbox_target",
      idempotencyKey: "outbox_idem_target",
      subjectId: "subject_target",
      correlationId: "outbox_corr_target",
    });
    const { env, sends } = createEnv(d1);
    assert.deepEqual(await dispatchOutbox(env, 1, "subject_target"), {
      claimed: 1,
      dispatched: 1,
      rejected: 0,
      retrying: 0,
    });
    assert.equal(sends.length, 1);
    assert.equal(
      (sends[0]?.body as { subjectId: string }).subjectId,
      "subject_target",
    );
    const states = sqlite.prepare(
      "SELECT subject_id AS subjectId,status FROM job_outbox ORDER BY subject_id",
    ).all();
    assert.equal((states[0] as { status: string }).status, "pending");
    assert.equal((states[1] as { status: string }).status, "dispatched");
    await assert.rejects(
      dispatchOutbox(env, 1, "invalid subject"),
      /Invalid outbox subject identifier/,
    );
  } finally {
    sqlite.close();
  }
});

test("outbox compatibility-blocks legacy job kinds without publishing", async () => {
  for (const legacyKind of LEGACY_JOB_KINDS) {
    const { sqlite, d1 } = createDatabase();
    try {
      insertOutbox(sqlite, {
        id: `outbox_legacy_${legacyKind.replaceAll(".", "_")}`,
        kind: legacyKind,
        idempotencyKey: `outbox_idem_${legacyKind.replaceAll(".", "_")}`,
      });
      const { env, sends } = createEnv(d1);
      assert.deepEqual(await dispatchOutbox(env), {
        claimed: 0,
        dispatched: 0,
        rejected: 0,
        retrying: 0,
      });
      assert.equal(sends.length, 0);
      assert.equal(
        (
          sqlite.prepare(`
            SELECT status FROM job_outbox WHERE job_type = ?
          `).get(legacyKind) as { status: string }
        ).status,
        "rejected",
      );
    } finally {
      sqlite.close();
    }
  }
});

test("malware scan remains an explicit but unattached contract", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    insertOutbox(sqlite, {
      id: "outbox_malware_unattached",
      queueBinding: "MALWARE_SCAN_QUEUE",
      kind: "malware.scan",
      idempotencyKey: "outbox_idem_malware_unattached",
      workspaceId: "ws_test",
    });
    const { env, sends } = createEnv(d1);
    assert.deepEqual(await dispatchOutbox(env), {
      claimed: 1,
      dispatched: 0,
      rejected: 1,
      retrying: 0,
    });
    assert.equal(sends.length, 0);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT status FROM job_outbox WHERE id = 'outbox_malware_unattached'
        `).get() as { status: string }
      ).status,
      "rejected",
    );
  } finally {
    sqlite.close();
  }
});

test("outbox cannot publish while runtime or schema is disabled", async () => {
  for (const options of [
    { asyncEnabled: "false" },
    { schemaVersion: "2" },
  ]) {
    const { sqlite, d1 } = createDatabase();
    try {
      insertOutbox(sqlite);
      const { env, sends } = createEnv(d1, options);
      assert.deepEqual(await dispatchOutbox(env), {
        claimed: 0,
        dispatched: 0,
        rejected: 0,
        retrying: 0,
      });
      assert.equal(d1.prepareCalls, 0);
      assert.equal(sends.length, 0);
      assert.equal(
        (
          sqlite.prepare(`
            SELECT status FROM job_outbox WHERE id = 'outbox_probe'
          `).get() as { status: string }
        ).status,
        "pending",
      );
    } finally {
      sqlite.close();
    }
  }
});

test("outbox rejects queue-kind mismatches and retries send failures", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    insertOutbox(sqlite, {
      id: "outbox_mismatch",
      kind: "document.export",
      idempotencyKey: "outbox_idem_mismatch",
    });
    const { env } = createEnv(d1);
    assert.deepEqual(await dispatchOutbox(env), {
      claimed: 1,
      dispatched: 0,
      rejected: 1,
      retrying: 0,
    });
    assert.equal(
      (
        sqlite.prepare(`
          SELECT status FROM job_outbox WHERE id = 'outbox_mismatch'
        `).get() as { status: string }
      ).status,
      "rejected",
    );

    insertOutbox(sqlite, {
      id: "outbox_retry",
      idempotencyKey: "outbox_idem_retry",
    });
    const failing = createEnv(d1, {
      failingQueueBindings: ["DATA_RETENTION_CLEANUP_QUEUE"],
    });
    assert.deepEqual(await dispatchOutbox(failing.env), {
      claimed: 1,
      dispatched: 0,
      rejected: 0,
      retrying: 1,
    });
    const retry = sqlite.prepare(`
      SELECT status, error_code, next_attempt_at
      FROM job_outbox
      WHERE id = 'outbox_retry'
    `).get() as {
      status: string;
      error_code: string;
      next_attempt_at: string | null;
    };
    assert.equal(retry.status, "retrying");
    assert.equal(retry.error_code, "JOB_OUTBOX_SEND_FAILED");
    assert.ok(retry.next_attempt_at);
  } finally {
    sqlite.close();
  }
});

test("outbox reclaims expired leases but leaves active dispatches alone", async () => {
  const { sqlite, d1 } = createDatabase();
  try {
    insertOutbox(sqlite, {
      id: "outbox_active",
      idempotencyKey: "outbox_idem_active",
      status: "dispatching",
      leaseOwner: "active-worker",
      leaseExpiresAt: "2999-01-01T00:00:00.000Z",
    });
    const { env, sends } = createEnv(d1);
    assert.deepEqual(await dispatchOutbox(env), {
      claimed: 0,
      dispatched: 0,
      rejected: 0,
      retrying: 0,
    });
    assert.equal(sends.length, 0);

    sqlite.prepare(`
      UPDATE job_outbox
      SET lease_expires_at = '2000-01-01T00:00:00.000Z'
      WHERE id = 'outbox_active'
    `).run();
    assert.deepEqual(await dispatchOutbox(env), {
      claimed: 1,
      dispatched: 1,
      rejected: 0,
      retrying: 0,
    });
    assert.equal(sends.length, 1);
  } finally {
    sqlite.close();
  }
});
