import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  reconcileStaleLexMetadataMonitorRuns,
  runLexMetadataMonitor,
} from "../lib/legal/metadata-monitor";

class Statement {
  constructor(private readonly db: D1, private readonly sql: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.db, this.sql, values); }
  private valuesForSqlite() {
    return this.values.map((value) => {
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
      throw new TypeError("Unsupported test value");
    });
  }
  async run<T = unknown>() {
    const result = this.db.sqlite.prepare(this.sql).run(...this.valuesForSqlite());
    return { results: [] as T[], success: true as const, meta: { changes: Number(result.changes) } };
  }
  async first<T = unknown>() {
    return (this.db.sqlite.prepare(this.sql).get(...this.valuesForSqlite()) as T | undefined) ?? null;
  }
  async all<T = unknown>() {
    return { results: this.db.sqlite.prepare(this.sql).all(...this.valuesForSqlite()) as T[], success: true as const, meta: { changes: 0 } };
  }
}

class D1 {
  readonly batchSizes: number[] = [];
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this, sql); }
  async batch(statements: Statement[]) {
    this.batchSizes.push(statements.length);
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE source_sync_runs (
      id text PRIMARY KEY,environment text NOT NULL,source_kind text NOT NULL,run_type text NOT NULL,
      status text NOT NULL,lock_key text NOT NULL,discovered_count integer NOT NULL,fetched_count integer NOT NULL,
      changed_count integer NOT NULL,verified_count integer NOT NULL,error_count integer NOT NULL,
      started_at text NOT NULL,finished_at text,error_summary text,created_at text NOT NULL,updated_at text NOT NULL
    );
    CREATE TABLE source_sync_errors (
      id text PRIMARY KEY,run_id text NOT NULL,source_url text,external_id text,error_code text NOT NULL,
      retryable integer NOT NULL,safe_summary text NOT NULL,occurred_at text NOT NULL
    );
    CREATE TABLE monitoring_preferences (workspace_id text,user_id text,locale text,channels_json text);
    CREATE TABLE notifications (id text PRIMARY KEY,workspace_id text,user_id text,document_id text,type text,title text,body text,read_at text,created_at text);
  `);
  sqlite.exec(`
    CREATE TABLE legal_monitoring_metadata (
      id text PRIMARY KEY,canonical_url text NOT NULL UNIQUE,canonical_id text,locale text NOT NULL,act_title text NOT NULL,
      revision_date text,effective_at text,fingerprint text NOT NULL,http_status integer NOT NULL,first_seen_at text NOT NULL,
      last_seen_at text NOT NULL,last_checked_at text NOT NULL,last_error_code text,created_at text NOT NULL,updated_at text NOT NULL
    );
    CREATE TABLE legal_monitoring_change_events (
      id text PRIMARY KEY,metadata_id text NOT NULL,canonical_url text NOT NULL,act_title text NOT NULL,
      change_type text NOT NULL,fingerprint text NOT NULL,detected_at text NOT NULL,created_at text NOT NULL,
      UNIQUE(metadata_id,fingerprint)
    );
  `);
  return sqlite;
}

test("Lex monitor stores only RSS metadata and never reaches the retired legal corpus", async () => {
  const sqlite = createDb();
  const db = new D1(sqlite);
  const calls: string[] = [];
  const responses = [
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } }),
    new Response("<rss><channel><item><title>Регистрация бизнеса</title><pubDate>Tue, 11 Aug 2026 10:00:00 GMT</pubDate><link>/ru/docs/8372154</link></item></channel></rss>", { headers: { "content-type": "application/rss+xml" } }),
  ];
  const summary = await runLexMetadataMonitor({
    APP_ENV: "staging",
    DB: db as unknown as D1Database,
    LEGAL_LEX_METADATA_MONITOR_ENABLED: "true",
    LEGAL_LEX_RSS_DISCOVERY_ENABLED: "true",
  }, {
    now: new Date("2026-08-12T12:00:00.000Z"),
    maxDocuments: 1,
    wait: async () => undefined,
    fetchImpl: async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const response = responses.shift();
      if (!response) throw new Error("Unexpected source request");
      return response;
    },
  });
  assert.deepEqual(summary, {
    status: "success",
    runId: summary.runId,
    discovered: 1,
    processed: 1,
    changed: 0,
    errors: 0,
  });
  assert.match(summary.runId ?? "", /^lexmeta_metadata_monitor_/);
  assert.deepEqual(calls, ["https://lex.uz/robots.txt", "https://lex.uz/ru/rss"]);
  assert.deepEqual({ ...sqlite.prepare(
    "SELECT canonical_url AS url,canonical_id AS id,act_title AS title,http_status AS status FROM legal_monitoring_metadata",
  ).get() as Record<string, unknown> }, {
    url: "https://lex.uz/ru/docs/8372154",
    id: "8372154",
    title: "Регистрация бизнеса",
    status: 200,
  });
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM legal_monitoring_change_events").get() as { count: number }).count, 1);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='legal_sources'").get() as { count: number }).count, 0);
  sqlite.close();
});

test("Lex monitor ignores RSS delivery-date churn and emits one idempotent title-change notification", async () => {
  const sqlite = createDb();
  const db = new D1(sqlite);
  sqlite.prepare(
    "INSERT INTO monitoring_preferences (workspace_id,user_id,locale,channels_json) VALUES ('workspace','user','ru','[\"in_app\"]')",
  ).run();

  async function run(title: string, pubDate: string, now: string) {
    let call = 0;
    return runLexMetadataMonitor({
      APP_ENV: "staging",
      DB: db as unknown as D1Database,
      LEGAL_LEX_METADATA_MONITOR_ENABLED: "true",
      LEGAL_LEX_RSS_DISCOVERY_ENABLED: "true",
    }, {
      now: new Date(now),
      maxDocuments: 1,
      wait: async () => undefined,
      fetchImpl: async () => {
        call += 1;
        if (call === 1) return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
        return new Response(
          `<rss><channel><item><title>${title}</title><pubDate>${pubDate}</pubDate><link>/ru/docs/8372154</link></item></channel></rss>`,
          { headers: { "content-type": "application/rss+xml" } },
        );
      },
    });
  }

  assert.equal((await run("Регистрация бизнеса", "Tue, 11 Aug 2026 10:00:00 GMT", "2026-08-12T12:00:00.000Z")).status, "success");
  assert.equal((await run("Регистрация бизнеса", "Wed, 12 Aug 2026 10:00:00 GMT", "2026-08-13T12:00:00.000Z")).changed, 0);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM notifications").get() as { count: number }).count, 0);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM legal_monitoring_change_events").get() as { count: number }).count, 1);

  assert.equal((await run("Регистрация бизнеса — обновлено", "Thu, 13 Aug 2026 10:00:00 GMT", "2026-08-14T12:00:00.000Z")).changed, 1);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM notifications").get() as { count: number }).count, 1);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM legal_monitoring_change_events").get() as { count: number }).count, 2);

  assert.equal((await run("Регистрация бизнеса — обновлено", "Fri, 14 Aug 2026 10:00:00 GMT", "2026-08-15T12:00:00.000Z")).changed, 0);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM notifications").get() as { count: number }).count, 1);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM legal_monitoring_change_events").get() as { count: number }).count, 2);
  sqlite.close();
});

test("Lex monitor batches a full balanced feed below the legacy subrequest ceiling", async () => {
  const sqlite = createDb();
  const db = new D1(sqlite);

  function rss(locale: "ru" | "uz", day: number) {
    const items = Array.from({ length: 20 }, (_, index) => {
      const id = locale === "ru" ? 8_372_000 + index : -(8_373_000 + index);
      return `<item><title>${locale.toUpperCase()} акт ${index}</title><pubDate>Thu, ${day} Aug 2026 10:00:00 GMT</pubDate><link>/${locale}/docs/${id}</link></item>`;
    }).join("");
    return `<rss><channel>${items}</channel></rss>`;
  }

  async function run(day: number, now: string) {
    const responses = [
      new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } }),
      new Response(rss("ru", day), { headers: { "content-type": "application/rss+xml" } }),
      new Response(rss("uz", day), { headers: { "content-type": "application/rss+xml" } }),
    ];
    return runLexMetadataMonitor({
      APP_ENV: "staging",
      DB: db as unknown as D1Database,
      LEGAL_LEX_METADATA_MONITOR_ENABLED: "true",
      LEGAL_LEX_RSS_DISCOVERY_ENABLED: "true",
    }, {
      now: new Date(now),
      maxDocuments: 40,
      wait: async () => undefined,
      fetchImpl: async () => {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected source request");
        return response;
      },
    });
  }

  const first = await run(13, "2026-08-13T12:00:00.000Z");
  assert.deepEqual({ status: first.status, processed: first.processed, changed: first.changed }, {
    status: "success",
    processed: 40,
    changed: 0,
  });
  assert.equal(db.batchSizes.at(-1), 9);

  const second = await run(14, "2026-08-14T12:00:00.000Z");
  assert.deepEqual({ status: second.status, processed: second.processed, changed: second.changed }, {
    status: "success",
    processed: 40,
    changed: 0,
  });
  assert.equal(db.batchSizes.at(-1), 5);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM legal_monitoring_change_events").get() as { count: number }).count, 40);
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM notifications").get() as { count: number }).count, 0);
  sqlite.close();
});

test("Lex monitor reconciliation records stale operational runs without reviving a corpus job", async () => {
  const sqlite = createDb();
  const db = new D1(sqlite);
  sqlite.prepare(`INSERT INTO source_sync_runs
    (id,environment,source_kind,run_type,status,lock_key,discovered_count,fetched_count,changed_count,verified_count,error_count,started_at,finished_at,error_summary,created_at,updated_at)
    VALUES ('stale','staging','lex','metadata_monitor','running','staging:lex:metadata_monitor',0,0,0,0,0,'2026-08-12T10:00:00.000Z',NULL,NULL,'2026-08-12T10:00:00.000Z','2026-08-12T10:00:00.000Z')`).run();
  assert.equal(await reconcileStaleLexMetadataMonitorRuns({ APP_ENV: "staging", DB: db as unknown as D1Database }, {
    now: new Date("2026-08-12T12:00:00.000Z"),
    staleAfterMs: 20 * 60 * 1_000,
  }), 1);
  assert.deepEqual({ ...sqlite.prepare("SELECT status,error_summary AS errorSummary FROM source_sync_runs WHERE id='stale'").get() as Record<string, unknown> }, {
    status: "failed",
    errorSummary: "LEX_METADATA_MONITOR_STALE",
  });
  sqlite.close();
});
