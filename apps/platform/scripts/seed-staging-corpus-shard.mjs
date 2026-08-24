import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
  args.set(key.slice(2), process.argv[++index]);
}

const config = args.get("config") ?? "wrangler.legal-corpus.jsonc";
const source = args.get("source") ?? "juro-staging-corpus-v2";
const target = args.get("target") ?? "juro-staging-corpus-shard-1";
const pageSize = Math.min(5000, Math.max(100, Number(args.get("page-size") ?? 4000)));

if (!/^juro-staging-corpus(?:-v2)?$/u.test(source)) throw new Error("source must be a staging corpus database");
if (!/^juro-staging-corpus-shard-[1-9][0-9]*$/u.test(target)) throw new Error("target must be a staging corpus shard");
if (source === target) throw new Error("source and target must differ");
if (!Number.isInteger(pageSize)) throw new Error("page-size must be an integer");

const wranglerCli = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
if (!existsSync(wranglerCli)) throw new Error(`wrangler CLI not found at ${wranglerCli}`);
function wrangler(database, sql) {
  const result = spawnSync(process.execPath, [
    wranglerCli, "d1", "execute", database, "--remote", "--config", config,
    "--env", "staging", "--command", sql, "--json",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `wrangler failed for ${database}`);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`wrangler returned non-JSON output for ${database}`);
  }
  const response = parsed[0];
  if (!response?.success) throw new Error(`D1 query failed for ${database}`);
  return response.results ?? [];
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, columns, row, overrides = {}) {
  const values = columns.map((column) => sqlValue(
    Object.hasOwn(overrides, column) ? overrides[column] : row[column],
  ));
  return `INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${values.join(",")});`;
}

function queryRows(sql) {
  return wrangler(source, sql);
}

const statements = [];
const checkpointColumns = [
  "id", "category_key", "language", "search_url", "status", "page_number",
  "expected_document_count", "discovered_document_count", "next_event_target", "view_state",
  "view_state_generator", "attempt_count", "next_attempt_at", "last_error_code", "started_at",
  "completed_at", "created_at", "updated_at", "source_session_cookie", "source_session_expires_at",
];
for (const row of queryRows("SELECT * FROM legal_corpus_discovery_checkpoints ORDER BY id")) {
  statements.push(insert("legal_corpus_discovery_checkpoints", checkpointColumns, row));
}

const discoveryColumns = ["checkpoint_id", "source_url", "provider_source_id", "language", "discovered_at"];
for (let offset = 0; ; offset += pageSize) {
  const rows = queryRows(`SELECT checkpoint_id,source_url,provider_source_id,language,discovered_at
    FROM legal_corpus_discovery_documents ORDER BY checkpoint_id,source_url LIMIT ${pageSize} OFFSET ${offset}`);
  for (const row of rows) statements.push(insert("legal_corpus_discovery_documents", discoveryColumns, row));
  if (rows.length < pageSize) break;
}

const jobColumns = [
  "id", "job_type", "status", "provider", "canonical_document_id", "variant_id", "source_url",
  "language", "idempotency_key", "attempt_count", "max_attempts", "next_attempt_at", "last_error_code",
  "correlation_id", "created_at", "updated_at",
];
for (let offset = 0; ; offset += pageSize) {
  const rows = queryRows(`SELECT id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,
      idempotency_key,attempt_count,max_attempts,next_attempt_at,last_error_code,correlation_id,created_at,updated_at
    FROM legal_corpus_ingestion_jobs
    WHERE status IN ('queued','retrying','running')
    ORDER BY created_at,id LIMIT ${pageSize} OFFSET ${offset}`);
  for (const row of rows) {
    statements.push(insert("legal_corpus_ingestion_jobs", jobColumns, row, {
      status: row.status === "running" ? "queued" : row.status,
      variant_id: null,
    }));
  }
  if (rows.length < pageSize) break;
}

const hostRows = queryRows("SELECT host,crawl_delay_ms,robots_observed_at,robots_body,robots_body_observed_at FROM legal_source_host_rate_limits WHERE host='lex.uz'");
for (const row of hostRows) {
  statements.push(`INSERT OR REPLACE INTO legal_source_host_rate_limits
    (host,crawl_delay_ms,last_request_at,next_allowed_at,robots_observed_at,updated_at,robots_body,robots_body_observed_at)
    VALUES (${sqlValue(row.host)},${sqlValue(Math.max(20000, Number(row.crawl_delay_ms) || 0))},NULL,${sqlValue(new Date().toISOString())},${sqlValue(row.robots_observed_at)},${sqlValue(new Date().toISOString())},${sqlValue(row.robots_body)},${sqlValue(row.robots_body_observed_at)});`);
}

const workDir = join(tmpdir(), `juro-corpus-shard-seed-${process.pid}`);
mkdirSync(workDir, { recursive: true });
const sqlFile = join(workDir, "seed.sql");
writeFileSync(sqlFile, `${statements.join("\n")}\n`, "utf8");
try {
  const result = spawnSync(process.execPath, [
    wranglerCli, "d1", "execute", target, "--remote", "--config", config,
    "--env", "staging", "--file", sqlFile, "--json",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || "D1 seed failed");
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch {
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    if (!/successfully|complete|executed/iu.test(combined)) {
      throw new Error(`D1 seed returned non-JSON output: ${combined.slice(-4000)}`);
    }
    parsed = null;
  }
  if (parsed && !parsed[0]?.success) throw new Error("D1 seed was not successful");
  console.log(JSON.stringify({
    source,
    target,
    checkpoints: statements.filter((statement) => statement.startsWith("INSERT OR IGNORE INTO legal_corpus_discovery_checkpoints")).length,
    discoveryDocuments: statements.filter((statement) => statement.startsWith("INSERT OR IGNORE INTO legal_corpus_discovery_documents")).length,
    activeJobs: statements.filter((statement) => statement.startsWith("INSERT OR IGNORE INTO legal_corpus_ingestion_jobs")).length,
    rateLimitRows: hostRows.length,
  }));
} finally {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}
