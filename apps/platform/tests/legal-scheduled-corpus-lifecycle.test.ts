import assert from "node:assert/strict";
import test from "node:test";
import {
  executeLegalSourceFetchRequest,
  type LegalSourceAcquisitionEnv,
} from "../lib/legal/source-acquisition";
import {
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

test("scheduled corpus keeps a two-source run open until the aggregate reconciliation", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env: LegalSourceAcquisitionEnv = {
    APP_ENV: "development",
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
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
    assert.deepEqual(started, { started: 1, busy: 0, empty: 1 });
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
      SELECT status,fetched_count,error_count FROM source_sync_runs WHERE id='lscorpus_lex_20260801'
    `).get() as { status: string; fetched_count: number; error_count: number };
    assert.equal(after.status, "success");
  } finally {
    sqlite.close();
  }
});
