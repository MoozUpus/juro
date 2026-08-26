import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const platformDirectory = join(scriptDirectory, "..");
const wranglerPath = join(platformDirectory, "node_modules", "wrangler", "bin", "wrangler.js");
const configPath = join(platformDirectory, "wrangler.legal-corpus-shard.jsonc");
const snapshotSqlPath = join(scriptDirectory, "legal-corpus-shard-quality-snapshot.sql");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const databaseBindings = config.env?.staging?.d1_databases?.filter(
  (binding) => binding?.binding === "DB",
) ?? [];
if (databaseBindings.length !== 1
  || typeof databaseBindings[0].database_name !== "string"
  || typeof databaseBindings[0].database_id !== "string") {
  throw new Error("LEGAL_CORPUS_QUALITY_STAGING_DB_BINDING_INVALID");
}
const databaseBinding = databaseBindings[0];

function executeReadOnly(sql) {
  const result = spawnSync(process.execPath, [
    wranglerPath,
    "d1",
    "execute",
    "DB",
    "--remote",
    "--config",
    configPath,
    "--env",
    "staging",
    "--json",
    "--command",
    sql,
  ], {
    cwd: platformDirectory,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "WRANGLER_D1_EXECUTE_FAILED").trim());
  }

  const payload = JSON.parse(result.stdout);
  const query = payload[0];
  if (!query?.success || Number(query.meta?.rows_written ?? 0) !== 0) {
    throw new Error("LEGAL_CORPUS_QUALITY_QUERY_NOT_READ_ONLY");
  }
  return query;
}

const preflight = executeReadOnly(`WITH latest AS (
  SELECT id,status,error_code,started_at,finished_at
  FROM scheduled_runs ORDER BY started_at DESC LIMIT 1
)
SELECT (SELECT COUNT(*) FROM scheduled_locks) AS lock_count,
  id,status,error_code,started_at,finished_at
FROM latest;`);
const preflightRow = preflight.results?.[0];
if (!preflightRow || Number(preflightRow.lock_count) !== 0 || preflightRow.status === "running") {
  throw new Error(`LEGAL_CORPUS_QUALITY_SNAPSHOT_LOCKED:${preflightRow?.id ?? "unknown"}`);
}

const sql = readFileSync(snapshotSqlPath, "utf8");
if (!/^\s*WITH\s+guard\s+AS\s*\(/iu.test(sql)
  || /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|PRAGMA)\b/iu.test(sql)) {
  throw new Error("LEGAL_CORPUS_QUALITY_SQL_NOT_READ_ONLY");
}
const snapshot = executeReadOnly(sql);
const snapshotRow = snapshot.results?.[0];
if (!snapshotRow || Number(snapshotRow.locks) !== 0) {
  throw new Error("LEGAL_CORPUS_QUALITY_SNAPSHOT_LOST_LOCK_FREE_BOUNDARY");
}

console.log(JSON.stringify({
  capturedAt: new Date().toISOString(),
  database: {
    name: databaseBinding.database_name,
    id: databaseBinding.database_id,
  },
  latestRun: preflightRow,
  snapshot: snapshotRow,
  meta: {
    rowsRead: Number(snapshot.meta?.rows_read ?? 0),
    rowsWritten: Number(snapshot.meta?.rows_written ?? 0),
    sizeAfter: Number(snapshot.meta?.size_after ?? 0),
  },
}, null, 2));
