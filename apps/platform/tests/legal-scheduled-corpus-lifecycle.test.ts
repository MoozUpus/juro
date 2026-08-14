import assert from "node:assert/strict";
import test from "node:test";
import {
  executeLegalSourceFetchRequest,
  type LegalSourceAcquisitionEnv,
} from "../lib/legal/source-acquisition";
import {
  enqueueLexPdfNormalizationRecovery,
  recoverStaleScheduledCorpusFetchRequests,
  reconcileScheduledCorpusSyncRuns,
  startScheduledCorpusSync,
} from "../lib/legal/scheduled-corpus-sync";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

class FakeR2Bucket {
  private readonly objects = new Map<string, Uint8Array>();

  async head(key: string): Promise<{ key: string; size: number } | null> {
    const value = this.objects.get(key);
    return value ? { key, size: value.byteLength } : null;
  }

  async put(key: string, value: unknown): Promise<{ key: string }> {
    if (!(value instanceof Uint8Array)) throw new TypeError("Expected bytes.");
    this.objects.set(key, value.slice());
    return { key };
  }
}

function sourceFetch(responses: Response[]): typeof fetch {
  return (async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected synthetic fetch.");
    return response;
  }) as typeof fetch;
}

function documentHtml(id: string): string {
  return `<html><body><main><h1>Норма ${id}</h1><p>${"Проверяемое правило. ".repeat(40)}</p></main></body></html>`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seedActivatedVerifiedSource(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: { canonicalId: string; html: string; now: string },
): Promise<void> {
  const hash = await sha256Hex(input.html);
  const sourceId = `verified-source-${input.canonicalId}`;
  const versionId = `verified-version-${input.canonicalId}`;
  const reviewId = `verified-review-${input.canonicalId}`;
  const publicationId = `verified-publication-${input.canonicalId}`;
  sqlite.prepare(
    "INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('corpus-publisher','publisher@example.test',?,?)",
  ).run(input.now, input.now);
  sqlite.prepare(`
    INSERT INTO legal_sources (
      id,canonical_id,official_url,act_title,act_identifier,locale,source_type,
      status,verification_state,content_sha256,fetched_at,verified_at,
      verified_by_user_id,last_checked_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,'ru','lex','verified','verified',?,?,?,?,?,?,?)
  `).run(
    sourceId,
    input.canonicalId,
    `https://lex.uz/ru/docs/${input.canonicalId}`,
    `Verified ${input.canonicalId}`,
    input.canonicalId,
    hash,
    input.now,
    input.now,
    "corpus-publisher",
    input.now,
    input.now,
    input.now,
  );
  sqlite.prepare(`
    INSERT INTO legal_source_versions (
      id,source_id,language,status,content_sha256,raw_object_key,parsed_object_key,
      fetched_at,verified_at,verified_by_user_id,metadata_json,created_at,updated_at
    ) VALUES (?,?,'ru','verified',?,'fixture/raw','fixture/parsed',?,?,?,'{}',?,?)
  `).run(
    versionId,
    sourceId,
    hash,
    input.now,
    input.now,
    "corpus-publisher",
    input.now,
    input.now,
  );
  // Publication integrity is covered by legal-source-review tests. This fixture
  // isolates scheduled reconciliation of an already activated version.
  sqlite.exec("DROP TRIGGER legal_source_publications_insert_guard");
  sqlite.exec("DROP TRIGGER legal_source_current_activations_insert_guard");
  sqlite.prepare(`
    INSERT INTO legal_review_queue (
      id,source_id,version_id,reason_code,confidence,status,created_at,updated_at
    ) VALUES (?,?,?,'fixture','high','pending',?,?)
  `).run(reviewId, sourceId, versionId, input.now, input.now);
  sqlite.prepare(`
    INSERT INTO legal_source_publications (
      id,review_id,source_id,version_id,review_evidence_sha256,raw_content_sha256,
      parsed_content_sha256,published_by_user_id,publication_evidence_json,
      publication_evidence_sha256,published_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    publicationId,
    reviewId,
    sourceId,
    versionId,
    hash,
    hash,
    hash,
    "corpus-publisher",
    "{}",
    hash,
    input.now,
    input.now,
  );
  sqlite.prepare(`
    INSERT INTO legal_source_current_activations (
      source_id,publication_id,version_id,activated_by_user_id,activated_at,updated_at
    ) VALUES (?,?,?,?,?,?)
  `).run(sourceId, publicationId, versionId, "corpus-publisher", input.now, input.now);
}

test("scheduled corpus requeues one stale crawl-window retry without changing its source request", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = { APP_ENV: "staging", DB: d1 } as Pick<LegalSourceAcquisitionEnv, "APP_ENV" | "DB">;
  const stale = "2026-08-05T19:00:00.000Z";
  const now = new Date("2026-08-05T19:20:00.000Z");
  try {
    sqlite.prepare(`
      INSERT INTO source_sync_runs (
        id,environment,source_kind,run_type,status,lock_key,
        discovered_count,fetched_count,changed_count,verified_count,error_count,
        started_at,finished_at,error_summary,created_at,updated_at
      ) VALUES ('run-stale','staging','lex','scheduled_corpus','running','staging:lex:scheduled_corpus',
        1,0,0,0,0,?,NULL,NULL,?,?)
    `).run(stale, stale, stale);
    sqlite.prepare(`
      INSERT INTO legal_source_fetch_requests (
        id,environment,source_kind,locale,requested_url,canonical_id,idempotency_key,
        status,attempt_count,requested_by_user_id,source_id,version_id,error_code,
        started_at,finished_at,created_at,updated_at
      ) VALUES ('request-stale','staging','lex','ru','https://lex.uz/ru/docs/-123','-123',
        'request-stale-key','retrying',1,NULL,NULL,NULL,'LEGAL_SOURCE_CRAWL_WINDOW_BUSY',
        ?,NULL,?,?)
    `).run(stale, stale, stale);
    sqlite.prepare(`
      INSERT INTO job_outbox (
        id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
        correlation_id,enqueued_at,available_at,status,dispatch_attempts,lease_owner,
        lease_expires_at,next_attempt_at,dispatched_at,error_code,created_at,updated_at
      ) VALUES ('outbox-stale','LEGAL_SOURCES_SYNC_QUEUE','legal.sync',1,'outbox-stale-key',
        'request-stale',NULL,'run-stale',?,?, 'dispatched',1,NULL,NULL,NULL,?,NULL,?,?)
    `).run(stale, stale, stale, stale, stale);
    sqlite.prepare(`
      INSERT INTO job_runs (
        id,queue_name,message_id,job_type,schema_version,idempotency_key,subject_id,
        workspace_id,correlation_id,envelope_hash,status,attempt,lease_owner,
        lease_expires_at,next_attempt_at,error_code,started_at,finished_at,created_at,updated_at
      ) VALUES ('jobrun-stale','staging-legal-sources-sync','message-stale','legal.sync',1,
        'outbox-stale-key','request-stale',NULL,'run-stale','fixture-hash','retrying',5,NULL,
        NULL,?,'LEGAL_SOURCE_SYNC_FAILED',?, ?,?,?)
    `).run(stale, stale, stale, stale, stale);

    assert.equal(await recoverStaleScheduledCorpusFetchRequests(env, { now }), 1);
    const outbox = sqlite.prepare(`
      SELECT status,error_code,lease_owner,lease_expires_at,next_attempt_at
      FROM job_outbox WHERE id='outbox-stale'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...outbox }, {
      status: "pending",
      error_code: "LEGAL_SOURCE_RETRY_RECOVERY",
      lease_owner: null,
      lease_expires_at: null,
      next_attempt_at: null,
    });
    const request = sqlite.prepare(`
      SELECT status,error_code,attempt_count FROM legal_source_fetch_requests WHERE id='request-stale'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...request }, {
      status: "retrying",
      error_code: "LEGAL_SOURCE_CRAWL_WINDOW_BUSY",
      attempt_count: 1,
    });
    assert.equal(await recoverStaleScheduledCorpusFetchRequests(env, { now }), 0);
  } finally {
    sqlite.close();
  }
});

test("scheduled recovery enqueues one distinct PDF fallback parse for a rejected Lex HTML parse", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = { APP_ENV: "staging", DB: d1 } as Pick<LegalSourceAcquisitionEnv, "APP_ENV" | "DB">;
  const now = new Date("2026-08-06T01:00:00.000Z");
  try {
    sqlite.prepare(`
      INSERT INTO legal_sources (
        id,canonical_id,official_url,act_title,act_identifier,locale,source_type,
        status,verification_state,last_checked_at,created_at,updated_at
      ) VALUES ('pdf-source','87','https://lex.uz/ru/docs/87','PDF-backed Lex act','87','ru','lex',
        'pending_review','fetched',?,?,?)
    `).run(now.toISOString(), now.toISOString(), now.toISOString());
    sqlite.prepare(`
      INSERT INTO legal_source_versions (
        id,source_id,language,status,content_sha256,raw_object_key,parsed_object_key,
        fetched_at,metadata_json,created_at,updated_at
      ) VALUES ('pdf-version','pdf-source','ru','pending_review',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'legal-sources/raw/lex/ru/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html',
        NULL,?,'{}',?,?)
    `).run(now.toISOString(), now.toISOString(), now.toISOString());
    sqlite.prepare(`
      INSERT INTO legal_review_queue (
        id,source_id,version_id,reason_code,confidence,status,created_at,updated_at
      ) VALUES ('pdf-normalization-review','pdf-source','pdf-version','normalization_failed','low',
        'pending',?,?)
    `).run(now.toISOString(), now.toISOString());

    assert.equal(await enqueueLexPdfNormalizationRecovery(env, { now }), 1);
    assert.equal(await enqueueLexPdfNormalizationRecovery(env, { now }), 0);
    const outbox = sqlite.prepare(`
      SELECT id,idempotency_key,job_type,subject_id,status FROM job_outbox
      WHERE id LIKE 'lspdfparsejob_%'
    `).get() as Record<string, string>;
    assert.equal(outbox.job_type, "legal.parse");
    assert.equal(outbox.subject_id, "pdf-version");
    assert.equal(outbox.status, "pending");
    assert.match(outbox.idempotency_key, /^legal_parse_pdf_[0-9a-f]{40}$/);
  } finally {
    sqlite.close();
  }
});

test("scheduled corpus keeps a two-source run open until the aggregate reconciliation", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env: LegalSourceAcquisitionEnv & { LEGAL_LEX_INGESTION_ENABLED: string } = {
    APP_ENV: "development",
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    LEGAL_LEX_INGESTION_ENABLED: "true",
  };
  const now = new Date("2026-08-01T19:00:00.000Z");
  try {
    for (const id of ["-101", "-102"]) {
      sqlite.prepare(`
        INSERT INTO legal_sources (
          id,canonical_id,official_url,act_title,act_identifier,locale,
          source_type,status,verification_state,last_checked_at,created_at,updated_at
        ) VALUES (?,?,?,?,?,'ru','lex','draft','draft',?,?,?)
      `).run(
        `seed-${id}`,
        id,
        `https://lex.uz/ru/docs/${id}`,
        `Seed ${id}`,
        id,
        "2026-07-31T00:00:00.000Z",
        now.toISOString(),
        now.toISOString(),
      );
    }

    const started = await startScheduledCorpusSync(env, { now });
    assert.deepEqual(started, { started: 1, busy: 0, empty: 0 });
    const requestRows = sqlite.prepare(`
      SELECT request.id
      FROM legal_source_fetch_requests AS request
      INNER JOIN job_outbox AS outbox ON outbox.subject_id=request.id
      WHERE outbox.correlation_id='lscorpus_lex_20260801'
      ORDER BY request.canonical_id
    `).all() as Array<{ id: string }>;
    assert.equal(requestRows.length, 2);

    for (const request of requestRows) {
      await executeLegalSourceFetchRequest(env, request.id, {
        now: () => now,
        fetchImpl: sourceFetch([
          new Response("User-agent: *\nAllow: /\n", {
            headers: { "content-type": "text/plain; charset=utf-8" },
          }),
          new Response(documentHtml(request.id), {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ]),
      });
    }

    const before = sqlite.prepare(`
      SELECT status FROM source_sync_runs WHERE id='lscorpus_lex_20260801'
    `).get() as { status: string };
    assert.equal(before.status, "running");
    const singleRuns = sqlite.prepare(`
      SELECT count(*) AS count FROM source_sync_runs WHERE run_type='single_source_fetch'
    `).get() as { count: number };
    assert.equal(singleRuns.count, 0);

    assert.equal(await reconcileScheduledCorpusSyncRuns(env, { now }), 1);
    const after = sqlite.prepare(`
      SELECT status,fetched_count,changed_count,verified_count,error_count,error_summary
      FROM source_sync_runs WHERE id='lscorpus_lex_20260801'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...after }, {
      status: "partial",
      fetched_count: 2,
      changed_count: 2,
      verified_count: 0,
      error_count: 0,
      error_summary: "LEGAL_SOURCE_CORPUS_REVIEW_REQUIRED",
    });
  } finally {
    sqlite.close();
  }
});

test("scheduled Lex candidates enter the review-only acquisition pipeline", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env: LegalSourceAcquisitionEnv & { LEGAL_LEX_INGESTION_ENABLED: string; LEGAL_LEX_RSS_DISCOVERY_ENABLED: string } = {
    APP_ENV: "development",
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    LEGAL_LEX_INGESTION_ENABLED: "true",
    LEGAL_LEX_RSS_DISCOVERY_ENABLED: "true",
  };
  const now = new Date("2026-08-02T19:00:00.000Z");
  try {
    const started = await startScheduledCorpusSync(env, {
      now,
      discoverLex: async () => [{
        officialUrl: "https://lex.uz/ru/docs/1744",
        locale: "ru",
        canonicalId: "1744",
      }],
    });
    assert.deepEqual(started, { started: 1, busy: 0, empty: 0 });
    const request = sqlite.prepare(`
      SELECT id FROM legal_source_fetch_requests
      WHERE source_kind='lex' AND canonical_id='1744'
    `).get() as { id: string };
    await executeLegalSourceFetchRequest(env, request.id, {
      now: () => now,
      wait: async () => undefined,
      fetchImpl: sourceFetch([
        new Response("User-agent: *\\nAllow: /\\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
        new Response(documentHtml("1744"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ]),
    });
    assert.equal(await reconcileScheduledCorpusSyncRuns(env, { now }), 1);
    const run = sqlite.prepare(`
      SELECT status,fetched_count,changed_count,verified_count,error_count FROM source_sync_runs
      WHERE id='lscorpus_lex_20260802'
    `).get() as { status: string; fetched_count: number; changed_count: number; verified_count: number; error_count: number };
    assert.equal(run.status, "partial");
    assert.equal(run.fetched_count, 1);
    assert.equal(run.changed_count, 1);
    assert.equal(run.verified_count, 0);
    assert.equal(run.error_count, 0);
    const review = sqlite.prepare(`
      SELECT status FROM legal_review_queue
    `).get() as { status: string };
    assert.equal(review.status, "pending");
  } finally {
    sqlite.close();
  }
});

test("scheduled corpus is successful only when fetched content matches the activated verified version", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env: LegalSourceAcquisitionEnv & { LEGAL_LEX_INGESTION_ENABLED: string } = {
    APP_ENV: "development",
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    LEGAL_LEX_INGESTION_ENABLED: "true",
  };
  const now = new Date("2026-08-03T19:00:00.000Z");
  const html = documentHtml("-201");
  try {
    await seedActivatedVerifiedSource(sqlite, {
      canonicalId: "-201",
      html,
      now: "2026-08-02T10:00:00.000Z",
    });
    assert.deepEqual(await startScheduledCorpusSync(env, { now }), {
      started: 1,
      busy: 0,
      empty: 0,
    });
    const request = sqlite.prepare(`
      SELECT id FROM legal_source_fetch_requests
      WHERE source_kind='lex' AND canonical_id='-201'
    `).get() as { id: string };
    await executeLegalSourceFetchRequest(env, request.id, {
      now: () => now,
      wait: async () => undefined,
      fetchImpl: sourceFetch([
        new Response("User-agent: *\nAllow: /\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
        new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ]),
    });
    assert.equal(await reconcileScheduledCorpusSyncRuns(env, { now }), 1);
    const run = sqlite.prepare(`
      SELECT status,fetched_count,changed_count,verified_count,error_count,error_summary
      FROM source_sync_runs WHERE id='lscorpus_lex_20260803'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...run }, {
      status: "success",
      fetched_count: 1,
      changed_count: 0,
      verified_count: 1,
      error_count: 0,
      error_summary: null,
    });
  } finally {
    sqlite.close();
  }
});

test("scheduled Lex RSS candidates enter the normal immutable review-only acquisition pipeline", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env: LegalSourceAcquisitionEnv & { LEGAL_LEX_INGESTION_ENABLED: string; LEGAL_LEX_RSS_DISCOVERY_ENABLED: string } = {
    APP_ENV: "development",
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    LEGAL_LEX_INGESTION_ENABLED: "true",
    LEGAL_LEX_RSS_DISCOVERY_ENABLED: "true",
  };
  const now = new Date("2026-08-05T19:00:00.000Z");
  let discoveryCalls = 0;
  const discoverLex = async () => {
    discoveryCalls += 1;
    return [{
      officialUrl: "https://lex.uz/ru/docs/8372154",
      locale: "ru" as const,
      canonicalId: "8372154",
    }];
  };
  try {
    const started = await startScheduledCorpusSync(env, {
      now,
      discoverLex,
    });
    assert.deepEqual(started, { started: 1, busy: 0, empty: 0 });
    assert.equal(discoveryCalls, 1);
    const duplicate = await startScheduledCorpusSync(env, { now, discoverLex });
    assert.deepEqual(duplicate, { started: 0, busy: 1, empty: 0 });
    assert.equal(discoveryCalls, 1, "daily run lock must be claimed before remote discovery");
    const request = sqlite.prepare(`
      SELECT id FROM legal_source_fetch_requests
      WHERE source_kind='lex' AND canonical_id='8372154'
    `).get() as { id: string };
    await executeLegalSourceFetchRequest(env, request.id, {
      now: () => now,
      wait: async () => undefined,
      fetchImpl: sourceFetch([
        new Response("User-agent: *\nCrawl-delay: 20\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
        new Response(documentHtml("8372154"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ]),
    });
    assert.equal(await reconcileScheduledCorpusSyncRuns(env, { now }), 1);
    const run = sqlite.prepare(`
      SELECT status,changed_count,verified_count,error_summary
      FROM source_sync_runs WHERE id='lscorpus_lex_20260805'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...run }, {
      status: "partial",
      changed_count: 1,
      verified_count: 0,
      error_summary: "LEGAL_SOURCE_CORPUS_REVIEW_REQUIRED",
    });
    const review = sqlite.prepare(`
      SELECT review.status,source.verification_state,version.status AS version_status
      FROM legal_review_queue review
      INNER JOIN legal_sources source ON source.id=review.source_id
      INNER JOIN legal_source_versions version ON version.id=review.version_id
    `).get() as { status: string; verification_state: string; version_status: string };
    assert.equal(review.status, "pending");
    assert.equal(review.verification_state, "fetched");
    assert.equal(review.version_status, "pending_review");
  } finally {
    sqlite.close();
  }
});

test("a stale Lex corpus run is terminalized so the next run can acquire its lock", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env: LegalSourceAcquisitionEnv & { LEGAL_LEX_INGESTION_ENABLED: string; LEGAL_LEX_RSS_DISCOVERY_ENABLED: string } = {
    APP_ENV: "development",
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    LEGAL_LEX_INGESTION_ENABLED: "true",
    LEGAL_LEX_RSS_DISCOVERY_ENABLED: "true",
  };
  const startedAt = "2026-08-06T19:00:00.000Z";
  const now = new Date("2026-08-07T02:00:00.000Z");
  try {
    sqlite.prepare(`
      INSERT INTO source_sync_runs (
        id,environment,source_kind,run_type,status,lock_key,
        discovered_count,fetched_count,changed_count,verified_count,error_count,
        started_at,finished_at,error_summary,created_at,updated_at
      ) VALUES (?,?, 'lex','scheduled_corpus','running',?,1,0,0,0,0,?,NULL,NULL,?,?)
    `).run(
      "lscorpus_lex_stale_fixture",
      "development",
      "development:lex:scheduled_corpus",
      startedAt,
      startedAt,
      startedAt,
    );

    assert.equal(await reconcileScheduledCorpusSyncRuns(env, {
      now,
      staleAfterMs: 60 * 60 * 1_000,
    }), 1);
    assert.deepEqual({ ...sqlite.prepare(`
      SELECT status,error_count,error_summary,finished_at FROM source_sync_runs
      WHERE id='lscorpus_lex_stale_fixture'
    `).get() as Record<string, unknown> }, {
      status: "failed",
      error_count: 1,
      error_summary: "LEGAL_SOURCE_CORPUS_STALE",
      finished_at: now.toISOString(),
    });

    const restarted = await startScheduledCorpusSync(env, {
      now,
      discoverLex: async () => [{
        officialUrl: "https://lex.uz/ru/docs/714",
        locale: "ru",
        canonicalId: "714",
      }],
    });
    assert.deepEqual(restarted, { started: 1, busy: 0, empty: 0 });
  } finally {
    sqlite.close();
  }
});
