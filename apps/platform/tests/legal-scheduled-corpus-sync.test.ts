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
    { APP_ENV: "staging", DB: db } as unknown as LegalSourceAcquisitionEnv,
    { now: new Date("2026-08-01T19:00:00.000Z") },
  );

  assert.equal(LEGAL_CORPUS_SYNC_CRON, "0 19 * * *");
  assert.deepEqual(result, { started: 0, busy: 0, empty: 2 });
  assert.equal(writes.filter(({ sql }) => sql.includes("INSERT INTO source_sync_runs")).length, 2);
  assert.equal(writes.filter(({ sql }) => sql.includes("LEGAL_SOURCE_CORPUS_EMPTY")).length, 2);
});
