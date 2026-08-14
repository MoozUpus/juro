import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGAL_CORPUS_SYNC_CRON,
  startScheduledCorpusSync,
} from "../lib/legal/scheduled-corpus-sync";
import type { LegalSourceAcquisitionEnv } from "../lib/legal/source-acquisition";

test("midnight corpus schedule records an explicit empty-corpus failure", async () => {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async all() {
              return { results: [] };
            },
            async run() {
              writes.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  const result = await startScheduledCorpusSync(
    {
      APP_ENV: "staging",
      DB: db,
      LEGAL_ADVICE_INGESTION_ENABLED: "false",
      LEGAL_LEX_INGESTION_ENABLED: "true",
    } as unknown as LegalSourceAcquisitionEnv,
    { now: new Date("2026-08-01T19:00:00.000Z") },
  );

  assert.equal(LEGAL_CORPUS_SYNC_CRON, "0 19 * * *");
  assert.deepEqual(result, { started: 0, busy: 0, empty: 1 });
  assert.equal(writes.filter(({ sql }) => sql.includes("INSERT INTO source_sync_runs")).length, 1);
assert.equal(
    writes.filter(({ sql, values }) =>
      sql.includes("error_summary=?") && values.includes("LEGAL_SOURCE_CORPUS_EMPTY")
    ).length,
    1,
  );
});

test("disabled scheduled corpus sync stays inert and creates no legacy queue work", async () => {
  let prepareCalls = 0;
  const db = {
    prepare() {
      prepareCalls += 1;
      throw new Error("disabled sync must not access D1");
    },
  };
  const result = await startScheduledCorpusSync(
    {
      APP_ENV: "staging",
      DB: db,
      LEGAL_ADVICE_INGESTION_ENABLED: "true",
      LEGAL_LEX_INGESTION_ENABLED: "false",
    } as unknown as LegalSourceAcquisitionEnv,
    {
      now: new Date("2026-08-01T19:00:00.000Z"),
      discoverLex: async () => {
        throw new Error("disabled sync must not discover Lex sources");
      },
    },
  );
  assert.deepEqual(result, { started: 0, busy: 0, empty: 0 });
  assert.equal(prepareCalls, 0);
});
