import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const captureSource = readFileSync(
  new URL("../scripts/capture-staging-legal-corpus-quality.mjs", import.meta.url),
  "utf8",
);
const snapshotSql = readFileSync(
  new URL("../scripts/legal-corpus-shard-quality-snapshot.sql", import.meta.url),
  "utf8",
);

test("shard quality capture rejects active leases and non-read-only output", () => {
  assert.match(captureSource, /LEGAL_CORPUS_QUALITY_SNAPSHOT_LOCKED/u);
  assert.match(captureSource, /LEGAL_CORPUS_QUALITY_QUERY_NOT_READ_ONLY/u);
  assert.match(captureSource, /rows_written/u);
  assert.match(captureSource, /"DB"/u);
  assert.match(captureSource, /wrangler\.legal-corpus-shard\.jsonc/u);
});

test("shard quality SQL is lock guarded and accepts both sparse formats", () => {
  assert.match(snapshotSql, /FROM scheduled_locks/u);
  assert.match(snapshotSql, /WHERE guard\.locks=0/u);
  assert.match(snapshotSql, /legal_corpus_sparse_terms/u);
  assert.match(snapshotSql, /legal_corpus_sparse_chunk_keys/u);
  assert.match(snapshotSql, /legal_corpus_sparse_postings/u);
  assert.doesNotMatch(
    snapshotSql,
    /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|PRAGMA)\b/iu,
  );
});
