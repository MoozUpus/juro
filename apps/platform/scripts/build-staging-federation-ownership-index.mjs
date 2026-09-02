import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DATABASES = [
  ["juro-staging", "bb716a96-b2fb-4823-90d6-6c228fed181a"],
  ["juro-staging-corpus-v2", "62620fb3-3da3-4c76-a8e9-aa60858c1063"],
  ["juro-staging-corpus-shard-1", "e09e0682-0c2e-4458-a8f3-be9de28117e3"],
  ["juro-staging-corpus-shard-2", "36fa1cfe-6d00-47b7-a980-864020028d86"],
  ["juro-staging-corpus-shard-3", "ccf1f18e-66cf-4358-a7aa-f1d725b7653c"],
];
const TARGET_DATABASE = "juro-staging-corpus-shard-4";
const TARGET_DATABASE_ID = "7c6dba67-5561-473f-aaa8-a0f6ed6e9bf2";
const SCRIPT_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const WRANGLER = resolve(SCRIPT_DIR, "../node_modules/wrangler/bin/wrangler.js");
const CONFIG = resolve(SCRIPT_DIR, "../wrangler.legal-corpus-shard.jsonc");
const ASSIGNMENT_RULE = "sha256(canonical_document_id) modulo 4; representative=official/newest";
const SOURCE_PRIORITY = new Map([
  ["OFFICIAL_LEGISLATION", 0],
  ["OFFICIAL_GOVERNMENT_GUIDANCE", 1],
  ["OWNER_TRUSTED_GLOBAL", 2],
  ["SECONDARY_REFERENCE", 3],
]);

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`FEDERATION_OWNERSHIP_WRANGLER_FAILED:${code}:${stderr.slice(0, 500)}`));
    });
  });
}

function parseWranglerJson(raw, scope) {
  const start = raw.indexOf("[");
  if (start < 0) throw new Error(`FEDERATION_OWNERSHIP_JSON_INVALID:${scope}`);
  const parsed = JSON.parse(raw.slice(start));
  const result = parsed[0];
  if (!result?.success || !Array.isArray(result.results)) {
    throw new Error(`FEDERATION_OWNERSHIP_QUERY_FAILED:${scope}`);
  }
  if (Number(result.meta?.rows_written ?? 0) !== 0) {
    throw new Error(`FEDERATION_OWNERSHIP_QUERY_NOT_READ_ONLY:${scope}`);
  }
  return result.results;
}

async function query(database) {
  const sql = "SELECT id AS canonical_document_id,source_class,canonical_url,document_type,document_number,updated_at FROM legal_corpus_documents ORDER BY id";
  const raw = await run(process.execPath, [WRANGLER, "d1", "execute", database, "--remote", "--config", CONFIG, "--env", "staging", "--json", "--command", sql]);
  return parseWranglerJson(raw, database);
}

function partitionFor(id) {
  const digest = createHash("sha256").update(id, "utf8").digest();
  return `juro-staging-corpus-shard-${(digest.readUInt32BE(0) % 4) + 1}`;
}

function representative(rows) {
  return [...rows].sort((left, right) => {
    const priority = (SOURCE_PRIORITY.get(String(left.source_class)) ?? 99)
      - (SOURCE_PRIORITY.get(String(right.source_class)) ?? 99);
    if (priority !== 0) return priority;
    const updated = String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
    if (updated !== 0) return updated;
    return String(left.source_database_name).localeCompare(String(right.source_database_name));
  })[0];
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function digestLines(values) {
  return createHash("sha256").update(`${values.sort().join("\n")}\n`, "utf8").digest("hex");
}

async function executeFile(file) {
  const raw = await run(process.execPath, [WRANGLER, "d1", "execute", TARGET_DATABASE, "--remote", "--config", CONFIG, "--env", "staging", "--file", file]);
  const start = raw.indexOf("[");
  const parsed = JSON.parse(raw.slice(start));
  if (!parsed.every((entry) => entry?.success)) throw new Error("FEDERATION_OWNERSHIP_IMPORT_FAILED");
}

async function verifyTarget(expectedRows, expectedOccurrenceSum, expectedPartitions) {
  const sql = "SELECT (SELECT COUNT(*) FROM legal_corpus_federation_ownership) AS rows,(SELECT COUNT(DISTINCT canonical_document_id) FROM legal_corpus_federation_ownership) AS distinct_ids,(SELECT SUM(source_occurrence_count) FROM legal_corpus_federation_ownership) AS occurrence_sum,(SELECT COUNT(DISTINCT partition_name) FROM legal_corpus_federation_ownership) AS partitions";
  const raw = await run(process.execPath, [WRANGLER, "d1", "execute", TARGET_DATABASE, "--remote", "--config", CONFIG, "--env", "staging", "--json", "--command", sql]);
  const rows = parseWranglerJson(raw, "target-verification");
  const row = rows[0];
  if (Number(row?.rows) !== expectedRows
    || Number(row?.distinct_ids) !== expectedRows
    || Number(row?.occurrence_sum) !== expectedOccurrenceSum
    || Number(row?.partitions) !== expectedPartitions) {
    throw new Error("FEDERATION_OWNERSHIP_TARGET_VERIFICATION_FAILED");
  }
  return {
    ownershipRows: Number(row.rows),
    distinctCanonicalIds: Number(row.distinct_ids),
    partitionCount: Number(row.partitions),
    occurrenceSum: Number(row.occurrence_sum),
  };
}

async function main() {
  const capturedAt = new Date().toISOString();
  const byId = new Map();
  let rawRows = 0;
  for (const [databaseName, databaseId] of DATABASES) {
    const rows = await query(databaseName);
    rawRows += rows.length;
    for (const row of rows) {
      const id = String(row.canonical_document_id ?? "");
      if (!/^lexuz(?:-[A-Za-z0-9]+)?:[A-Za-z0-9:_-]{1,180}$/u.test(id)) {
        throw new Error(`FEDERATION_OWNERSHIP_CANONICAL_ID_INVALID:${databaseName}`);
      }
      const entries = byId.get(id) ?? [];
      entries.push({ ...row, source_database_name: databaseName, source_database_id: databaseId });
      byId.set(id, entries);
    }
  }
  const rows = [...byId.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, entries]) => {
    const row = representative(entries);
    return {
      id,
      partition: partitionFor(id),
      source: row.source_database_name,
      sourceId: row.source_database_id,
      occurrences: entries.length,
      sourceClass: String(row.source_class),
      canonicalUrl: row.canonical_url ?? null,
      documentType: row.document_type ?? null,
      documentNumber: row.document_number ?? null,
      sourceUpdatedAt: row.updated_at ?? null,
    };
  });
  const partitionNames = [...new Set(rows.map((row) => row.partition))].sort();
  if (rows.length === 0 || partitionNames.length !== 4) throw new Error("FEDERATION_OWNERSHIP_PARTITIONS_INCOMPLETE");
  const ownershipDigest = digestLines(rows.map((row) => `${row.partition}|${row.id}`));
  const sourceDigest = digestLines(DATABASES.map(([name, id]) => `${name}|${id}`));
  const runId = `ownership-${capturedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const directory = await mkdtemp(join(tmpdir(), "juro-federation-ownership-"));
  try {
    const statements = [
      // The target is a rebuildable projection. Replacing only this table
      // prevents stale IDs after a future source reconciliation while leaving
      // every source corpus and failure-ledger table untouched.
      "DELETE FROM legal_corpus_federation_ownership;",
      ...rows.map((row) => `INSERT OR REPLACE INTO legal_corpus_federation_ownership (canonical_document_id,partition_name,source_database_name,source_database_id,source_occurrence_count,source_class,canonical_url,document_type,document_number,source_updated_at,assigned_at,assignment_rule) VALUES (${sql(row.id)},${sql(row.partition)},${sql(row.source)},${sql(row.sourceId)},${row.occurrences},${sql(row.sourceClass)},${sql(row.canonicalUrl)},${sql(row.documentType)},${sql(row.documentNumber)},${sql(row.sourceUpdatedAt)},${sql(capturedAt)},${sql(ASSIGNMENT_RULE)});`),
    ];
    statements.push(`INSERT OR REPLACE INTO legal_corpus_federation_ownership_runs (run_id,captured_at,source_set_sha256,partition_manifest_sha256,raw_document_rows,unique_canonical_document_ids,duplicate_document_rows,partition_count,status) VALUES (${sql(runId)},${sql(capturedAt)},${sql(sourceDigest)},${sql(ownershipDigest)},${rawRows},${rows.length},${rawRows - rows.length},${partitionNames.length},'verified');`);
    for (let offset = 0; offset < statements.length; offset += 200) {
      const file = join(directory, `ownership-${offset}.sql`);
      await writeFile(file, `${statements.slice(offset, offset + 200).join("\n")}\n`, "utf8");
      await executeFile(file);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const verification = await verifyTarget(rows.length, rawRows, partitionNames.length);
  const summary = {
    schemaVersion: 1,
    environment: "staging",
    capturedAt,
    targetDatabase: TARGET_DATABASE,
    targetDatabaseId: TARGET_DATABASE_ID,
    runId,
    assignmentRule: ASSIGNMENT_RULE,
    sources: DATABASES.map(([databaseName, databaseId]) => ({ databaseName, databaseId })),
    rawDocumentRows: rawRows,
    uniqueCanonicalDocumentIds: rows.length,
    duplicateDocumentRows: rawRows - rows.length,
    partitionCounts: Object.fromEntries(partitionNames.map((partition) => [partition, rows.filter((row) => row.partition === partition).length])),
    sourceDigest,
    partitionManifestSha256: ownershipDigest,
    verification,
    sourceRowsAreUnchanged: true,
    failureLedgerRowsChanged: 0,
    releaseGate: "closed_until_physical_partition_snapshot_and_restore",
    note: "This is a staging-only identifier ownership index. It proves one logical owner per canonical document in the projection, not physical disjointness of the source D1 tables, chunk parity, legal review, evaluation, or production approval.",
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\\n`);
}

await main();
