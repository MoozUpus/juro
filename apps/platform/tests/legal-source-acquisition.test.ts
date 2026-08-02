import assert from "node:assert/strict";
import test from "node:test";
import {
  LegalSourceAcquisitionError,
  createLegalSourceFetchRequest,
  executeLegalSourceFetchRequest,
  type LegalSourceAcquisitionEnv,
} from "../lib/legal/source-acquisition";
import {
  expectedQueueName,
  handleQueue,
  type JobEnvelope,
  type PlatformJobEnv,
} from "../worker/platform-jobs";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

class FakeR2Bucket {
  readonly objects = new Map<string, Uint8Array>();
  putCalls = 0;

  async head(key: string): Promise<{ key: string } | null> {
    return this.objects.has(key) ? { key } : null;
  }

  async put(key: string, value: unknown): Promise<{ key: string }> {
    this.putCalls += 1;
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value.slice();
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value.slice(0));
    } else if (typeof value === "string") {
      bytes = new TextEncoder().encode(value);
    } else {
      throw new TypeError("Unsupported synthetic R2 value.");
    }
    this.objects.set(key, bytes);
    return { key };
  }
}

function envFixture(
  d1: D1Database,
  bucket: FakeR2Bucket,
  advice = "false",
): LegalSourceAcquisitionEnv {
  return {
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    APP_ENV: "development",
    LEGAL_ADVICE_INGESTION_ENABLED: advice,
  };
}

function sourceFetch(responses: Response[]): typeof fetch {
  return (async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected synthetic fetch.");
    return response;
  }) as typeof fetch;
}

function robots(body = "User-agent: *\nAllow: /\n"): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function sourceHtml(body = "<!doctype html><html><body>Act 42</body></html>"):
  Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

test("request creation is atomic, identifiers-only, and idempotent", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const input = {
      url: "https://www.lex.uz/ru/docs/-42/",
      idempotencyKey: "legal_source_test_42",
      correlationId: "legal_source_corr_42",
    };
    const first = await createLegalSourceFetchRequest(env, input, {
      now: () => new Date("2026-07-28T00:00:00.000Z"),
    });
    const second = await createLegalSourceFetchRequest(env, input, {
      now: () => new Date("2026-07-28T00:00:01.000Z"),
    });
    assert.deepEqual(second, first);
    assert.equal(first.canonicalUrl, "https://lex.uz/ru/docs/-42");

    const requestCount = sqlite.prepare(`
      SELECT COUNT(*) AS count FROM legal_source_fetch_requests
    `).get() as { count: number };
    const outbox = sqlite.prepare(`
      SELECT job_type, queue_binding, subject_id, workspace_id, status
      FROM job_outbox
    `).get() as {
      job_type: string;
      queue_binding: string;
      subject_id: string;
      workspace_id: string | null;
      status: string;
    };
    assert.equal(requestCount.count, 1);
    assert.deepEqual({ ...outbox }, {
      job_type: "legal.sync",
      queue_binding: "LEGAL_SOURCES_SYNC_QUEUE",
      subject_id: first.id,
      workspace_id: null,
      status: "pending",
    });

    await assert.rejects(
      () => createLegalSourceFetchRequest(env, {
        ...input,
        url: "https://lex.uz/ru/docs/-43",
      }),
      (error: unknown) =>
        error instanceof LegalSourceAcquisitionError
        && error.code === "LEGAL_SOURCE_REQUEST_CONFLICT",
    );
    const stagingEnv: LegalSourceAcquisitionEnv = {
      ...env,
      APP_ENV: "staging",
    };
    await assert.rejects(
      () => createLegalSourceFetchRequest(stagingEnv, input),
      (error: unknown) =>
        error instanceof LegalSourceAcquisitionError
        && error.code === "LEGAL_SOURCE_REQUEST_CONFLICT",
    );
    assert.equal(
      (
        sqlite.prepare("SELECT COUNT(*) AS count FROM job_outbox").get() as {
          count: number;
        }
      ).count,
      1,
      "an environment-scoped idempotency conflict must not enqueue an orphan job",
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT COUNT(*) AS count FROM legal_source_fetch_requests
        `).get() as { count: number }
      ).count,
      1,
    );

    sqlite.prepare(`
      INSERT INTO user_profiles (id, email, created_at, updated_at)
      VALUES ('requester-42', 'requester-42@example.test', ?, ?)
    `).run("2026-07-28T00:00:00.000Z", "2026-07-28T00:00:00.000Z");
    const actorInput = {
      url: "https://lex.uz/ru/docs/-44",
      idempotencyKey: "legal_source_actor_44",
      requestedByUserId: "requester-42",
    };
    await createLegalSourceFetchRequest(env, actorInput);
    await assert.rejects(
      () => createLegalSourceFetchRequest(env, {
        ...actorInput,
        requestedByUserId: null,
      }),
      (error: unknown) =>
        error instanceof LegalSourceAcquisitionError
        && error.code === "LEGAL_SOURCE_REQUEST_CONFLICT",
    );
  } finally {
    sqlite.close();
  }
});

test("Advice policy gate creates neither request nor outbox row", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = envFixture(d1, new FakeR2Bucket());
  try {
    await assert.rejects(
      () => createLegalSourceFetchRequest(env, {
        url: "https://advice.uz/ru/documents/21",
        idempotencyKey: "advice_disabled_21",
      }),
      (error: unknown) =>
        error instanceof LegalSourceAcquisitionError
        && error.code === "LEGAL_SOURCE_POLICY_DISABLED",
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT
            (SELECT COUNT(*) FROM legal_source_fetch_requests) AS requests,
            (SELECT COUNT(*) FROM job_outbox) AS outbox
        `).get() as { requests: number; outbox: number }
      ).requests,
      0,
    );
    assert.equal(
      (
        sqlite.prepare("SELECT COUNT(*) AS count FROM job_outbox").get() as {
          count: number;
        }
      ).count,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("Crawl-delay uses a fenced D1 window instead of sleeping in the Worker", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = envFixture(d1, new FakeR2Bucket());
  let clock = "2026-08-02T10:00:00.000Z";
  const now = () => new Date(clock);
  try {
    const first = await createLegalSourceFetchRequest(env, {
      url: "https://lex.uz/ru/docs/8282675",
      idempotencyKey: "crawl_window_first",
    }, { now });
    const second = await createLegalSourceFetchRequest(env, {
      url: "https://lex.uz/ru/docs/8282676",
      idempotencyKey: "crawl_window_second",
    }, { now });

    const firstFetch = sourceFetch([
      robots("User-agent: *\nAllow: /\nCrawl-delay: 20\n"),
      sourceHtml(),
    ]);
    await executeLegalSourceFetchRequest(env, first.id, { fetchImpl: firstFetch, now });

    // This separates the existing per-run unique key from the host crawl window.
    // The 20-second crawl window remains active, so the second request must retry.
    clock = "2026-08-02T10:00:01.000Z";

    const blockedFetch = sourceFetch([
      robots("User-agent: *\nAllow: /\nCrawl-delay: 20\n"),
    ]);
    await assert.rejects(
      () => executeLegalSourceFetchRequest(env, second.id, { fetchImpl: blockedFetch, now }),
      (error: unknown) => error instanceof LegalSourceAcquisitionError
        && error.code === "LEGAL_SOURCE_CRAWL_WINDOW_BUSY"
        && error.retryable,
    );
    const state = sqlite.prepare(`
      SELECT status,error_code FROM legal_source_fetch_requests WHERE id=?
    `).get(second.id) as { status: string; error_code: string | null };
    assert.equal(state.status, "retrying");
    assert.equal(state.error_code, "LEGAL_SOURCE_CRAWL_WINDOW_BUSY");
    assert.equal(
      (sqlite.prepare(`SELECT count(*) AS count FROM scheduled_locks
        WHERE name='legal-source-crawl:development:lex.uz'`).get() as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("enabled Advice acquisition persists an unverified Uzbek Latin snapshot request", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket, "true");
  try {
    const request = await createLegalSourceFetchRequest(env, {
      url: "https://www.advice.uz/oz/documents/624/",
      idempotencyKey: "advice_enabled_624",
    });
    const waits: number[] = [];
    const result = await executeLegalSourceFetchRequest(env, request.id, {
      fetchImpl: sourceFetch([robots(), sourceHtml()]),
      wait: async (delayMs) => { waits.push(delayMs); },
      now: () => new Date("2026-07-31T01:00:00.000Z"),
    });

    assert.deepEqual(waits, [1_000]);
    assert.match(result.rawObjectKey, /^legal-sources\/raw\/advice\/uz\//);
    assert.equal(bucket.objects.has(result.rawObjectKey), true);
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT canonical_id, official_url, act_title, locale, source_type,
               status, verification_state, verified_at
        FROM legal_sources WHERE id = ?
      `).get(result.sourceId) as Record<string, unknown> },
      {
        canonical_id: "624",
        official_url: "https://advice.uz/oz/documents/624",
        act_title: "Advice.uz — scenario 624",
        locale: "uz",
        source_type: "advice",
        status: "pending_review",
        verification_state: "fetched",
        verified_at: null,
      },
    );
    assert.deepEqual(
      sqlite.prepare(`
        SELECT job_type FROM job_outbox WHERE subject_id IN (?, ?)
        ORDER BY job_type
      `).all(request.id, result.versionId).map((row) =>
        (row as { job_type: string }).job_type
      ),
      ["legal.parse", "legal.sync"],
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status, confidence, reason_code
        FROM legal_review_queue WHERE version_id = ?
      `).get(result.versionId) as Record<string, unknown> },
      {
        status: "pending",
        confidence: "low",
        reason_code: "new_source_version",
      },
    );
  } finally {
    sqlite.close();
  }
});

test("successful acquisition stores immutable raw bytes but never auto-verifies", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const request = await createLegalSourceFetchRequest(env, {
      url: "https://lex.uz/uz/docs/-42",
      idempotencyKey: "legal_acquire_success_42",
    });
    const result = await executeLegalSourceFetchRequest(env, request.id, {
      fetchImpl: sourceFetch([robots(), sourceHtml()]),
      now: () => new Date("2026-07-28T01:00:00.000Z"),
    });
    assert.equal(result.changed, true);
    assert.match(result.contentSha256, /^[0-9a-f]{64}$/);
    assert.equal(bucket.putCalls, 1);
    assert.equal(bucket.objects.has(result.rawObjectKey), true);

    const source = sqlite.prepare(`
      SELECT status, verification_state, content_sha256, verified_at,
             verified_by_user_id, official_url
      FROM legal_sources WHERE id = ?
    `).get(result.sourceId) as {
      status: string;
      verification_state: string;
      content_sha256: string;
      verified_at: string | null;
      verified_by_user_id: string | null;
      official_url: string;
    };
    assert.deepEqual({ ...source }, {
      status: "pending_review",
      verification_state: "fetched",
      content_sha256: result.contentSha256,
      verified_at: null,
      verified_by_user_id: null,
      official_url: "https://lex.uz/uz/docs/-42",
    });
    const version = sqlite.prepare(`
      SELECT status, raw_object_key, parsed_object_key, verified_at
      FROM legal_source_versions WHERE id = ?
    `).get(result.versionId) as {
      status: string;
      raw_object_key: string;
      parsed_object_key: string | null;
      verified_at: string | null;
    };
    assert.deepEqual({ ...version }, {
      status: "pending_review",
      raw_object_key: result.rawObjectKey,
      parsed_object_key: null,
      verified_at: null,
    });
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status, confidence, reason_code
        FROM legal_review_queue WHERE version_id = ?
      `).get(result.versionId) as Record<string, unknown> },
      {
        status: "pending",
        confidence: "low",
        reason_code: "new_source_version",
      },
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status, source_id, version_id, attempt_count, error_code
        FROM legal_source_fetch_requests WHERE id = ?
      `).get(request.id) as Record<string, unknown> },
      {
        status: "completed",
        source_id: result.sourceId,
        version_id: result.versionId,
        attempt_count: 1,
        error_code: null,
      },
    );

    const replay = await executeLegalSourceFetchRequest(env, request.id, {
      fetchImpl: sourceFetch([]),
    });
    assert.equal(replay.changed, false);
    assert.equal(replay.versionId, result.versionId);
    assert.equal(bucket.putCalls, 1);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT COUNT(*) AS count FROM legal_review_queue
          WHERE version_id = ?
        `).get(result.versionId) as { count: number }
      ).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("fetch failures are recorded safely and never create trusted content", async () => {
  for (const fixture of [
    {
      name: "robots denied",
      responses: [robots("User-agent: *\nDisallow: /\n")],
      code: "LEGAL_SOURCE_ROBOTS_DISALLOWED",
      requestStatus: "failed",
      retryable: 0,
    },
    {
      name: "upstream unavailable",
      responses: [robots(), new Response(null, { status: 503 })],
      code: "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
      requestStatus: "retrying",
      retryable: 1,
    },
  ] as const) {
    const { sqlite, d1 } = sqliteD1Fixture();
    const bucket = new FakeR2Bucket();
    const env = envFixture(d1, bucket);
    try {
      const request = await createLegalSourceFetchRequest(env, {
        url: "https://lex.uz/ru/docs/-55",
        idempotencyKey: `legal_failure_${fixture.retryable}`,
      });
      await assert.rejects(
        () => executeLegalSourceFetchRequest(env, request.id, {
          fetchImpl: sourceFetch([...fixture.responses]),
        }),
        (error: unknown) => {
          assert.ok(error instanceof LegalSourceAcquisitionError, fixture.name);
          assert.equal(error.code, fixture.code);
          return true;
        },
      );
      assert.equal(bucket.putCalls, 0);
      assert.equal(
        (sqlite.prepare(
          "SELECT COUNT(*) AS count FROM legal_sources",
        ).get() as { count: number }).count,
        0,
      );
      assert.deepEqual(
        { ...sqlite.prepare(`
          SELECT status, error_code, source_id, version_id
          FROM legal_source_fetch_requests WHERE id = ?
        `).get(request.id) as Record<string, unknown> },
        {
          status: fixture.requestStatus,
          error_code: fixture.code,
          source_id: null,
          version_id: null,
        },
      );
      assert.deepEqual(
        { ...sqlite.prepare(`
          SELECT error_code, retryable, safe_summary
          FROM source_sync_errors
        `).get() as Record<string, unknown> },
        {
          error_code: fixture.code,
          retryable: fixture.retryable,
          safe_summary: fixture.code,
        },
      );
    } finally {
      sqlite.close();
    }
  }
});

test("the legal.sync queue handler executes the persisted request contract", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const acquisitionEnv = envFixture(d1, bucket);
  const originalFetch = globalThis.fetch;
  try {
    const request = await createLegalSourceFetchRequest(acquisitionEnv, {
      url: "https://lex.uz/ru/docs/-77",
      idempotencyKey: "queue_legal_sync_77",
    });
    const state = { ack: 0, retries: [] as number[] };
    const envelope: JobEnvelope = {
      schemaVersion: 1,
      jobId: "queue_job_legal_sync_77",
      kind: "legal.sync",
      idempotencyKey: "queue_idem_legal_sync_77",
      subjectId: request.id,
      workspaceId: null,
      correlationId: "queue_corr_legal_sync_77",
      enqueuedAt: "2026-07-28T00:00:00.000Z",
    };
    const message = {
      id: "queue_message_legal_sync_77",
      timestamp: new Date("2026-07-28T00:00:00.000Z"),
      attempts: 1,
      body: envelope,
      ack() {
        state.ack += 1;
      },
      retry(options?: { delaySeconds?: number }) {
        state.retries.push(options?.delaySeconds ?? 0);
      },
    } as unknown as Message<unknown>;
    const env = {
      ...acquisitionEnv,
      ASYNC_RUNTIME_ENABLED: "true",
      CRON_ENABLED: "false",
      JOB_SCHEMA_VERSION: "1",
      PLATFORM_ANALYTICS: { writeDataPoint() {} },
    } as unknown as PlatformJobEnv;
    globalThis.fetch = sourceFetch([robots(), sourceHtml()]);

    await handleQueue({
      queue: expectedQueueName("legal.sync", "development"),
      messages: [message],
      metadata: {
        metrics: {
          backlogCount: 0,
          backlogBytes: 0,
        },
      },
      ackAll() {},
      retryAll() {},
    }, env);

    assert.equal(state.ack, 1);
    assert.deepEqual(state.retries, []);
    assert.equal(
      (
        sqlite.prepare(`
          SELECT status FROM legal_source_fetch_requests WHERE id = ?
        `).get(request.id) as { status: string }
      ).status,
      "completed",
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status, error_code FROM job_runs
        WHERE idempotency_key = ?
      `).get(envelope.idempotencyKey) as Record<string, unknown> },
      { status: "completed", error_code: null },
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
