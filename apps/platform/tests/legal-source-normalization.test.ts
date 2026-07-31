import assert from "node:assert/strict";
import test from "node:test";
import {
  createLegalSourceFetchRequest,
  executeLegalSourceFetchRequest,
  type LegalSourceAcquisitionEnv,
} from "../lib/legal/source-acquisition";
import {
  LegalSourceNormalizationError,
  executeLegalSourceNormalization,
} from "../lib/legal/source-normalization";
import { normalizedLegalSourceSnapshotSchema } from "../lib/legal/source-parser";
import {
  expectedQueueName,
  handleQueue,
  type JobEnvelope,
  type PlatformJobEnv,
} from "../worker/platform-jobs";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

type StoredObject = {
  bytes: Uint8Array;
  customMetadata?: Record<string, string>;
};

class FakeR2Bucket {
  readonly objects = new Map<string, StoredObject>();
  putCalls = 0;

  async head(key: string): Promise<{ key: string; size: number } | null> {
    const object = this.objects.get(key);
    return object ? { key, size: object.bytes.byteLength } : null;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    const bytes = object.bytes.slice();
    return {
      key,
      version: "test",
      size: bytes.byteLength,
      etag: "test",
      httpEtag: '"test"',
      uploaded: new Date("2026-07-28T00:00:00.000Z"),
      checksums: { toJSON: () => ({}) },
      httpMetadata: {},
      customMetadata: object.customMetadata,
      range: undefined,
      storageClass: "Standard",
      ssecKeyMd5: undefined,
      bodyUsed: false,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      arrayBuffer: async () => bytes.slice().buffer,
      bytes: async () => bytes.slice(),
      text: async () => new TextDecoder().decode(bytes),
      json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
      blob: async () => new Blob([bytes]),
      writeHttpMetadata() {},
    } as R2ObjectBody;
  }

  async put(
    key: string,
    value: unknown,
    options?: R2PutOptions,
  ): Promise<{ key: string }> {
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
    this.objects.set(key, {
      bytes,
      customMetadata: options?.customMetadata,
    });
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

function robots(): Response {
  return new Response("User-agent: *\nAllow: /\n", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function legalDocument(title: string): string {
  return `<html><head><title>${title}</title></head><body><main>
    <h1>${title}</h1>
    <p>${"Настоящая норма определяет порядок действий, права и обязанности участников. ".repeat(4)}</p>
    <h2>Статья 1</h2>
    <p>${"Уполномоченный орган проверяет документы и применяет действующее законодательство. ".repeat(4)}</p>
  </main></body></html>`;
}

function adviceDocument(title: string): string {
  return `<html lang="uz"><head><title>${title}</title></head><body><main>
    <aside>${"Boshqa xizmatlar. ".repeat(40)}</aside>
    <div class="page-document-content">
      <h1>${title}</h1>
      <p>${"Ushbu tavsiya huquqiy vaziyatni tushuntiradi va tekshirilishi lozim bo‘lgan amaliy qadamlarni ko‘rsatadi. ".repeat(4)}</p>
      <h2>Harakatlar tartibi</h2>
      <p>${"Hujjatlar, sanalar va amaldagi norma rasmiy manba bo‘yicha alohida tekshiriladi. ".repeat(4)}</p>
    </div></main></body></html>`;
}

async function acquire(
  env: LegalSourceAcquisitionEnv,
  url: string,
  idempotencyKey: string,
  body: string,
): Promise<{ versionId: string; rawObjectKey: string }> {
  const request = await createLegalSourceFetchRequest(env, {
    url,
    idempotencyKey,
  });
  const result = await executeLegalSourceFetchRequest(env, request.id, {
    fetchImpl: sourceFetch([robots(), html(body)]),
    now: () => new Date("2026-07-28T01:00:00.000Z"),
    wait: async () => undefined,
  });
  return { versionId: result.versionId, rawObjectKey: result.rawObjectKey };
}

test("normalization persists deterministic untrusted JSON and never creates trusted chunks", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const acquired = await acquire(
      env,
      "https://lex.uz/ru/docs/-81",
      "normalize_lex_81",
      legalDocument("Закон Республики Узбекистан"),
    );
    assert.deepEqual(
      sqlite.prepare(`
        SELECT job_type FROM job_outbox ORDER BY created_at, job_type
      `).all().map((row) => (row as { job_type: string }).job_type),
      ["legal.parse", "legal.sync"],
    );

    const first = await executeLegalSourceNormalization(env, acquired.versionId, {
      now: () => new Date("2026-07-28T01:01:00.000Z"),
    });
    const second = await executeLegalSourceNormalization(env, acquired.versionId, {
      now: () => new Date("2026-07-28T01:02:00.000Z"),
    });
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.deepEqual(second, { ...first, changed: false });
    assert.match(first.parsedObjectKey, /^legal-sources\/parsed\/lex\/ru\//);
    assert.match(first.parsedContentSha256, /^[0-9a-f]{64}$/);
    assert.ok(first.blockCount >= 4);

    const parsedObject = bucket.objects.get(first.parsedObjectKey);
    assert.ok(parsedObject);
    const snapshot = normalizedLegalSourceSnapshotSchema.parse(
      JSON.parse(new TextDecoder().decode(parsedObject.bytes)),
    );
    assert.equal(snapshot.source.canonicalId, "-81");
    assert.equal(snapshot.source.rawContentSha256.length, 64);
    assert.equal(snapshot.documentTitle, "Закон Республики Узбекистан");
    assert.equal(
      parsedObject.customMetadata?.parsedContentSha256,
      first.parsedContentSha256,
    );

    const counts = sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM legal_source_sections) AS sections,
        (SELECT COUNT(*) FROM legal_source_chunks) AS chunks,
        (SELECT COUNT(*) FROM legal_sources WHERE verification_state='verified') AS verified_sources,
        (SELECT COUNT(*) FROM legal_source_versions WHERE status='verified') AS verified_versions
    `).get() as Record<string, number>;
    assert.deepEqual({ ...counts }, {
      sections: 0,
      chunks: 0,
      verified_sources: 0,
      verified_versions: 0,
    });
  } finally {
    sqlite.close();
  }
});

test("Advice normalization persists only the exact document container as untrusted evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket, "true");
  try {
    const acquired = await acquire(
      env,
      "https://advice.uz/oz/documents/624",
      "normalize_advice_624",
      adviceDocument("Mehnat shartnomasini bekor qilish"),
    );
    const result = await executeLegalSourceNormalization(
      env,
      acquired.versionId,
      { now: () => new Date("2026-07-31T01:01:00.000Z") },
    );

    assert.match(result.parsedObjectKey, /^legal-sources\/parsed\/advice\/uz\//);
    const parsedObject = bucket.objects.get(result.parsedObjectKey);
    assert.ok(parsedObject);
    const snapshot = normalizedLegalSourceSnapshotSchema.parse(
      JSON.parse(new TextDecoder().decode(parsedObject.bytes)),
    );
    assert.equal(snapshot.source.sourceKind, "advice");
    assert.equal(snapshot.source.locale, "uz");
    assert.equal(snapshot.source.canonicalId, "624");
    assert.equal(snapshot.source.canonicalUrl, "https://advice.uz/oz/documents/624");
    assert.equal(snapshot.primarySelector, "advice-document");
    assert.equal(snapshot.documentTitle, "Mehnat shartnomasini bekor qilish");
    assert.equal(snapshot.plainText.includes("Boshqa xizmatlar"), false);
    const scenario = sqlite.prepare(`
      SELECT scenario.canonical_id,scenario.locale,scenario.status,version.title,
        version.summary_text AS summaryText,version.status AS versionStatus
      FROM advice_scenarios AS scenario
      INNER JOIN scenario_versions AS version ON version.scenario_id=scenario.id
      WHERE version.legal_source_version_id=?
    `).get(acquired.versionId) as Record<string, string>;
    assert.deepEqual({ ...scenario }, {
      canonical_id: "624",
      locale: "uz",
      status: "pending_review",
      title: "Mehnat shartnomasini bekor qilish",
      summaryText: snapshot.plainText,
      versionStatus: "pending_review",
    });

    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT
          (SELECT COUNT(*) FROM legal_source_sections) AS sections,
          (SELECT COUNT(*) FROM legal_source_chunks) AS chunks,
          (SELECT COUNT(*) FROM legal_sources WHERE verification_state='verified') AS verified_sources,
          (SELECT COUNT(*) FROM legal_source_versions WHERE status='verified') AS verified_versions
      `).get() as Record<string, number> },
      {
        sections: 0,
        chunks: 0,
        verified_sources: 0,
        verified_versions: 0,
      },
    );
  } finally {
    sqlite.close();
  }
});

test("normalization rejects raw evidence mismatch without persisting a parsed key", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const acquired = await acquire(
      env,
      "https://lex.uz/uz/docs/-82",
      "normalize_lex_82",
      legalDocument("O‘zbekiston Respublikasi Qonuni"),
    );
    const raw = bucket.objects.get(acquired.rawObjectKey);
    assert.ok(raw);
    raw.bytes = new TextEncoder().encode(legalDocument("O‘zgartirilgan matn"));

    await assert.rejects(
      () => executeLegalSourceNormalization(env, acquired.versionId),
      (error: unknown) =>
        error instanceof LegalSourceNormalizationError
        && error.code === "LEGAL_SOURCE_RAW_HASH_MISMATCH"
        && error.retryable === false,
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT parsed_object_key FROM legal_source_versions WHERE id = ?
        `).get(acquired.versionId) as { parsed_object_key: string | null }
      ).parsed_object_key,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("normalization replay rejects a modified parsed snapshot", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const acquired = await acquire(
      env,
      "https://lex.uz/ru/docs/-85",
      "normalize_lex_85",
      legalDocument("Норма для проверки replay"),
    );
    const first = await executeLegalSourceNormalization(env, acquired.versionId);
    const parsed = bucket.objects.get(first.parsedObjectKey);
    assert.ok(parsed);
    parsed.bytes = new TextEncoder().encode("{\"tampered\":true}");

    await assert.rejects(
      () => executeLegalSourceNormalization(env, acquired.versionId),
      (error: unknown) =>
        error instanceof LegalSourceNormalizationError
        && error.code === "LEGAL_SOURCE_NORMALIZED_HASH_MISMATCH"
        && error.retryable === false,
    );
  } finally {
    sqlite.close();
  }
});

test("normalization rejects a conflicting pre-existing parsed object before D1 persistence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const acquired = await acquire(
      env,
      "https://lex.uz/ru/docs/-86",
      "normalize_lex_86",
      legalDocument("Норма для проверки content-addressed collision"),
    );
    const originalMetadata = (
      sqlite.prepare(`
        SELECT metadata_json FROM legal_source_versions WHERE id = ?
      `).get(acquired.versionId) as { metadata_json: string }
    ).metadata_json;
    const first = await executeLegalSourceNormalization(env, acquired.versionId);
    sqlite.prepare(`
      UPDATE legal_source_versions
      SET parsed_object_key = NULL, metadata_json = ?
      WHERE id = ?
    `).run(originalMetadata, acquired.versionId);
    const parsed = bucket.objects.get(first.parsedObjectKey);
    assert.ok(parsed);
    parsed.bytes = new TextEncoder().encode("{\"conflicting\":true}");

    await assert.rejects(
      () => executeLegalSourceNormalization(env, acquired.versionId),
      (error: unknown) =>
        error instanceof LegalSourceNormalizationError
        && error.code === "LEGAL_SOURCE_NORMALIZED_HASH_MISMATCH"
        && error.retryable === false,
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT parsed_object_key FROM legal_source_versions WHERE id = ?
        `).get(acquired.versionId) as { parsed_object_key: string | null }
      ).parsed_object_key,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("unrecognized structure creates a review item but no normalized success", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = envFixture(d1, bucket);
  try {
    const acquired = await acquire(
      env,
      "https://lex.uz/ru/docs/-83",
      "normalize_lex_83",
      "<html><body><main><p>Недостаточно текста.</p></main></body></html>",
    );
    await assert.rejects(
      () => executeLegalSourceNormalization(env, acquired.versionId, {
        now: () => new Date("2026-07-28T01:03:00.000Z"),
      }),
      (error: unknown) =>
        error instanceof LegalSourceNormalizationError
        && error.code === "LEGAL_SOURCE_NORMALIZATION_FAILED"
        && error.retryable === false,
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT reason_code, confidence, status
        FROM legal_review_queue
        WHERE version_id = ? AND reason_code = 'normalization_failed'
      `).get(acquired.versionId) as Record<string, unknown> },
      {
        reason_code: "normalization_failed",
        confidence: "low",
        status: "pending",
      },
    );
  } finally {
    sqlite.close();
  }
});

test("the legal.parse queue handler normalizes a persisted source version", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const acquisitionEnv = envFixture(d1, bucket);
  try {
    const acquired = await acquire(
      acquisitionEnv,
      "https://lex.uz/ru/docs/-84",
      "queue_normalize_lex_84",
      legalDocument("Гражданско-правовая норма"),
    );
    const envelope: JobEnvelope = {
      schemaVersion: 1,
      jobId: "queue_job_legal_parse_84",
      kind: "legal.parse",
      idempotencyKey: "queue_idem_legal_parse_84",
      subjectId: acquired.versionId,
      workspaceId: null,
      correlationId: "queue_corr_legal_parse_84",
      enqueuedAt: "2026-07-28T01:04:00.000Z",
    };
    const state = { ack: 0, retries: [] as number[] };
    const message = {
      id: "queue_message_legal_parse_84",
      timestamp: new Date("2026-07-28T01:04:00.000Z"),
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

    await handleQueue({
      queue: expectedQueueName("legal.parse", "development"),
      messages: [message],
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll() {},
      retryAll() {},
    }, env);

    assert.equal(state.ack, 1);
    assert.deepEqual(state.retries, []);
    assert.match(
      (
        sqlite.prepare(`
          SELECT parsed_object_key FROM legal_source_versions WHERE id = ?
        `).get(acquired.versionId) as { parsed_object_key: string }
      ).parsed_object_key,
      /^legal-sources\/parsed\/lex\/ru\//,
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status, error_code FROM job_runs WHERE idempotency_key = ?
      `).get(envelope.idempotencyKey) as Record<string, unknown> },
      { status: "completed", error_code: null },
    );
  } finally {
    sqlite.close();
  }
});
