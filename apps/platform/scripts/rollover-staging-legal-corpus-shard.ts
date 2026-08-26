import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SHARD_PATTERN = /^juro-staging-corpus-shard-([1-9][0-9]*)$/u;
const STAGING_ENVIRONMENT = "staging";
const MAX_STATEMENTS_PER_IMPORT = 250;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WRANGLER_ENTRYPOINT = resolve(
  SCRIPT_DIRECTORY,
  "../node_modules/wrangler/bin/wrangler.js",
);

const checkpointColumns = [
  "id", "category_key", "language", "search_url", "status", "page_number",
  "expected_document_count", "discovered_document_count", "next_event_target", "view_state",
  "view_state_generator", "attempt_count", "next_attempt_at", "last_error_code", "started_at",
  "completed_at", "created_at", "updated_at", "source_session_cookie", "source_session_expires_at",
] as const;
const discoveryColumns = [
  "checkpoint_id", "source_url", "provider_source_id", "language", "discovered_at",
] as const;
const jobColumns = [
  "id", "job_type", "status", "provider", "canonical_document_id", "variant_id", "source_url",
  "language", "idempotency_key", "attempt_count", "max_attempts", "next_attempt_at", "last_error_code",
  "correlation_id", "created_at", "updated_at",
] as const;
const failureColumns = [
  "id", "job_id", "canonical_document_id", "source_url", "language", "attempted_at",
  "http_status", "error_code", "safe_message", "retryable", "retry_count", "retry_state",
] as const;

type JsonRecord = Record<string, unknown>;
type ControlRow = {
  state: "active" | "handoff_prepared" | "frozen";
  handoffId: string | null;
  peerDatabaseName: string | null;
};
type Snapshot = {
  checkpoints: JsonRecord[];
  discoveryDocuments: JsonRecord[];
  jobs: JsonRecord[];
  failures: JsonRecord[];
  rateLimits: JsonRecord[];
};
type HandoffManifest = Snapshot & {
  schemaVersion: 1;
  environment: "staging";
  handoffId: string;
  sourceDatabaseName: string;
  targetDatabaseName: string;
};
type HandoffLedgerRow = {
  id: string;
  sourceDatabaseName: string;
  targetDatabaseName: string;
  manifestSha256: string;
  activeJobCount: number;
  documentAffinityJobCount: number;
  createdAt: string;
};
type DeploymentBindingEvidence = {
  deploymentId: string;
  versionId: string;
  createdOn: string;
  databaseId: string;
};

function argumentMap(argv = process.argv.slice(2)): Map<string, string> {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) {
      throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_ARGUMENT_MISSING:${key}`);
    }
    args.set(key.slice(2), value);
    index += 1;
  }
  return args;
}

function required(args: ReadonlyMap<string, string>, name: string): string {
  const value = args.get(name);
  if (!value) throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_ARGUMENT_MISSING:--${name}`);
  return value;
}

export function stagingDatabaseOverrideConfig(
  rawConfig: string,
  databaseName: string,
  databaseId: string,
): string {
  let config: JsonRecord;
  try {
    config = JSON.parse(rawConfig) as JsonRecord;
  } catch {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_CONFIG_JSON_INVALID");
  }
  const environments = config.env;
  const staging = environments && typeof environments === "object" && !Array.isArray(environments)
    ? (environments as JsonRecord).staging
    : null;
  const databases = staging && typeof staging === "object" && !Array.isArray(staging)
    ? (staging as JsonRecord).d1_databases
    : null;
  if (!Array.isArray(databases)) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_CONFIG_STAGING_DB_INVALID");
  }
  const bindings = databases.filter((value): value is JsonRecord => (
    Boolean(value) && typeof value === "object" && !Array.isArray(value)
      && value.binding === "DB"
  ));
  if (bindings.length !== 1) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_CONFIG_STAGING_DB_INVALID");
  }
  bindings[0]!.database_name = databaseName;
  bindings[0]!.database_id = databaseId;
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function nextLegalCorpusShardName(source: string): string {
  const match = source.match(SHARD_PATTERN);
  if (!match) throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_INVALID");
  return `juro-staging-corpus-shard-${Number(match[1]) + 1}`;
}

function assertShardPair(source: string, target: string): void {
  if (!SHARD_PATTERN.test(target)) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_TARGET_INVALID");
  }
  if (nextLegalCorpusShardName(source) !== target) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_SEQUENCE_INVALID");
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(
    typeof value === "string" ? value : canonicalJson(value),
    "utf8",
  ).digest("hex");
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_NUMBER_INVALID");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(
  table: string,
  columns: readonly string[],
  row: JsonRecord,
  overrides: JsonRecord = {},
): string {
  const values = columns.map((column) => sqlValue(
    Object.hasOwn(overrides, column) ? overrides[column] : row[column],
  ));
  return `INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${values.join(",")});`;
}

function runWranglerCommand(
  config: string,
  args: readonly string[],
  errorScope: string,
): string {
  const result = spawnSync(process.execPath, [
    WRANGLER_ENTRYPOINT,
    ...args,
    "--config",
    config,
    "--env",
    STAGING_ENVIRONMENT,
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const detail = result.error?.message
      ?? ([stderr, stdout].filter(Boolean).join(" | ") || `exit_${result.status ?? "unknown"}`);
    throw new Error(`LEGAL_CORPUS_SHARD_ROLLOVER_WRANGLER_FAILED:${errorScope}:${detail}`);
  }
  return result.stdout;
}

function runWranglerTextCommand(
  config: string,
  args: readonly string[],
  errorScope: string,
): string {
  const result = spawnSync(process.execPath, [
    WRANGLER_ENTRYPOINT,
    ...args,
    "--config",
    config,
    "--env",
    STAGING_ENVIRONMENT,
  ], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const detail = result.error?.message
      ?? ([stderr, stdout].filter(Boolean).join(" | ") || `exit_${result.status ?? "unknown"}`);
    throw new Error(`LEGAL_CORPUS_SHARD_ROLLOVER_WRANGLER_FAILED:${errorScope}:${detail}`);
  }
  return result.stdout;
}

function databaseId(config: string, databaseName: string): string {
  const raw = parseJson(runWranglerCommand(
    config,
    ["d1", "list"],
    "d1-list",
  ), "d1-list");
  if (!Array.isArray(raw)) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_DATABASE_LIST_INVALID");
  }
  const matches = raw.filter((value): value is JsonRecord => (
    Boolean(value) && typeof value === "object" && !Array.isArray(value)
      && value.name === databaseName && typeof value.uuid === "string"
  ));
  if (matches.length !== 1) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_DATABASE_LOOKUP_INVALID:${databaseName}`);
  }
  return String(matches[0]!.uuid);
}

async function withDatabaseConfig<T>(
  baseConfig: string,
  databaseName: string,
  callback: (config: string) => Promise<T>,
): Promise<T> {
  const resolvedConfig = resolve(baseConfig);
  const rawConfig = await readFile(resolvedConfig, "utf8");
  const temporaryConfig = join(
    dirname(resolvedConfig),
    `.juro-corpus-rollover-${randomUUID()}.jsonc`,
  );
  await writeFile(
    temporaryConfig,
    stagingDatabaseOverrideConfig(rawConfig, databaseName, databaseId(baseConfig, databaseName)),
    "utf8",
  );
  try {
    return await callback(temporaryConfig);
  } finally {
    await rm(temporaryConfig, { force: true });
  }
}

async function withShardConfigs<T>(
  baseConfig: string,
  source: string,
  target: string,
  callback: (configs: { source: string; target: string }) => Promise<T>,
): Promise<T> {
  return withDatabaseConfig(baseConfig, source, async (sourceConfig) => (
    withDatabaseConfig(baseConfig, target, async (targetConfig) => (
      callback({ source: sourceConfig, target: targetConfig })
    ))
  ));
}

function runWrangler(config: string, database: string, args: string[]): string {
  return runWranglerCommand(config, [
    "d1",
    "execute",
    database,
    "--remote",
    ...args,
  ], database);
}

function parseJson(raw: string, scope: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_WRANGLER_JSON_INVALID:${scope}`);
  }
}

export function parseWranglerImportJson(raw: string, scope: string): unknown {
  const lines = raw.split(/\r?\n/u);
  const payloadStart = lines.findIndex((line) => line.trimStart().startsWith("["));
  if (payloadStart < 0) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_IMPORT_JSON_INVALID:${scope}`);
  }
  try {
    return JSON.parse(lines.slice(payloadStart).join("\n")) as unknown;
  } catch {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_IMPORT_JSON_INVALID:${scope}`);
  }
}

export function isLongRunningImportError(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes("Currently processing a long-running import");
}

function parseWranglerRows(raw: string, database: string): JsonRecord[] {
  const parsed = parseJson(raw, database);
  if (!Array.isArray(parsed) || !parsed[0] || typeof parsed[0] !== "object") {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_WRANGLER_RESULT_INVALID:${database}`);
  }
  const response = parsed[0] as { success?: boolean; results?: unknown };
  if (!response.success || !Array.isArray(response.results)) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_D1_QUERY_FAILED:${database}`);
  }
  return response.results.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object");
}

function deployedDatabaseBinding(
  config: string,
  expectedDatabaseName: string,
): DeploymentBindingEvidence {
  const databaseInfo = parseJson(runWranglerCommand(
    config,
    ["d1", "info", expectedDatabaseName],
    `d1-info:${expectedDatabaseName}`,
  ), `d1-info:${expectedDatabaseName}`) as JsonRecord;
  if (databaseInfo.name !== expectedDatabaseName
    || typeof databaseInfo.uuid !== "string"
    || databaseInfo.uuid.length === 0) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_DATABASE_INFO_INVALID");
  }

  const rawDeployments = parseJson(runWranglerCommand(
    config,
    ["deployments", "list"],
    "deployments-list",
  ), "deployments-list");
  if (!Array.isArray(rawDeployments) || rawDeployments.length === 0) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_DEPLOYMENT_MISSING");
  }
  const deployments = rawDeployments.filter((value): value is JsonRecord => (
    Boolean(value) && typeof value === "object" && typeof value.created_on === "string"
  )).sort((left, right) => String(left.created_on).localeCompare(String(right.created_on)));
  const deployment = deployments.at(-1);
  const versions = deployment?.versions;
  if (!deployment || typeof deployment.id !== "string" || !Array.isArray(versions)
    || versions.length !== 1) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_DEPLOYMENT_AMBIGUOUS");
  }
  const deployedVersion = versions[0] as JsonRecord;
  if (typeof deployedVersion.version_id !== "string"
    || Number(deployedVersion.percentage) !== 100) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_DEPLOYMENT_AMBIGUOUS");
  }
  const version = parseJson(runWranglerCommand(
    config,
    ["versions", "view", deployedVersion.version_id],
    `version-view:${deployedVersion.version_id}`,
  ), `version-view:${deployedVersion.version_id}`) as JsonRecord;
  const resources = version.resources as JsonRecord | undefined;
  const bindings = resources?.bindings;
  if (!Array.isArray(bindings)) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_DEPLOYMENT_BINDINGS_INVALID");
  }
  const databaseBindings = bindings.filter((binding): binding is JsonRecord => (
    Boolean(binding) && typeof binding === "object"
      && binding.type === "d1" && binding.name === "DB"
  ));
  const databaseBinding = databaseBindings[0];
  const databaseId = databaseBinding?.database_id ?? databaseBinding?.id;
  if (databaseBindings.length !== 1 || databaseId !== databaseInfo.uuid) {
    throw new TypeError(
      `LEGAL_CORPUS_SHARD_ROLLOVER_DEPLOYED_BINDING_MISMATCH:${expectedDatabaseName}`,
    );
  }
  return {
    deploymentId: deployment.id,
    versionId: deployedVersion.version_id,
    createdOn: String(deployment.created_on),
    databaseId: databaseInfo.uuid,
  };
}

function query(config: string, database: string, sql: string): JsonRecord[] {
  return parseWranglerRows(runWrangler(config, database, ["--command", sql]), database);
}

async function executeStatements(
  config: string,
  database: string,
  statements: readonly string[],
  temporaryDirectory: string,
  label: string,
): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += MAX_STATEMENTS_PER_IMPORT) {
    const batch = statements.slice(offset, offset + MAX_STATEMENTS_PER_IMPORT);
    const file = join(temporaryDirectory, `${label}-${offset}.sql`);
    await writeFile(file, `${batch.join("\n")}\n`, "utf8");
    for (let attempt = 0; ; attempt += 1) {
      try {
        const raw = runWrangler(config, database, ["--file", file]);
        const parsed = parseWranglerImportJson(raw, `${database}:${label}`);
        if (!Array.isArray(parsed)
          || parsed.some((entry) => !entry || typeof entry !== "object"
            || !(entry as { success?: boolean }).success)) {
          throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_IMPORT_FAILED:${database}:${label}`);
        }
        break;
      } catch (error) {
        if (!isLongRunningImportError(error) || attempt >= 60) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
}

function pageSize(args: ReadonlyMap<string, string>): number {
  const parsed = Number(args.get("page-size") ?? 4_000);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 5_000) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_PAGE_SIZE_INVALID");
  }
  return parsed;
}

function pagedQuery(
  config: string,
  database: string,
  baseSql: string,
  orderBy: string,
  size: number,
): JsonRecord[] {
  const output: JsonRecord[] = [];
  for (let offset = 0; ; offset += size) {
    const rows = query(
      config,
      database,
      `${baseSql} ORDER BY ${orderBy} LIMIT ${size} OFFSET ${offset}`,
    );
    output.push(...rows);
    if (rows.length < size) return output;
  }
}

function control(config: string, database: string): ControlRow {
  const row = query(config, database, `SELECT acquisition_state AS state,
      active_handoff_id AS handoffId,target_database_name AS peerDatabaseName
    FROM legal_corpus_shard_control WHERE singleton_id=1 LIMIT 1`)[0];
  if (!row || !["active", "handoff_prepared", "frozen"].includes(String(row.state))) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_CONTROL_INVALID:${database}`);
  }
  return {
    state: String(row.state) as ControlRow["state"],
    handoffId: typeof row.handoffId === "string" ? row.handoffId : null,
    peerDatabaseName: typeof row.peerDatabaseName === "string" ? row.peerDatabaseName : null,
  };
}

function prepareControl(
  config: string,
  database: string,
  handoffId: string,
  peerDatabaseName: string,
  now: string,
): ControlRow {
  const current = control(config, database);
  if (current.state !== "active") {
    if (current.handoffId !== handoffId || current.peerDatabaseName !== peerDatabaseName) {
      throw new TypeError(`LEGAL_CORPUS_SHARD_CONTROL_CONFLICT:${database}`);
    }
    return current;
  }
  const updated = query(config, database, `UPDATE legal_corpus_shard_control
    SET acquisition_state='handoff_prepared',active_handoff_id=${sqlValue(handoffId)},
      target_database_name=${sqlValue(peerDatabaseName)},updated_at=${sqlValue(now)}
    WHERE singleton_id=1 AND acquisition_state='active'
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_locks
        WHERE name='legal-corpus-worker' AND expires_at>${sqlValue(now)}
      )
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_runs
        WHERE schedule_name='legal-corpus-worker' AND status='running'
      )
      AND NOT EXISTS (
        SELECT 1 FROM legal_corpus_ingestion_jobs WHERE status='running'
      )
    RETURNING acquisition_state AS state,active_handoff_id AS handoffId,
      target_database_name AS peerDatabaseName`);
  if (updated.length !== 1) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_ROLLOVER_BUSY:${database}`);
  }
  return control(config, database);
}

function normalizedJob(row: JsonRecord): JsonRecord {
  const output: JsonRecord = { ...row, variant_id: null };
  for (const column of ["attempt_count", "max_attempts"]) {
    output[column] = Number(output[column]);
  }
  return output;
}

function snapshot(
  config: string,
  database: string,
  size: number,
  handoffId: string | null,
): Snapshot {
  const handoffJoin = handoffId
    ? `INNER JOIN legal_corpus_shard_handoff_jobs handoff_job
        ON handoff_job.job_id=job.id AND handoff_job.handoff_id=${sqlValue(handoffId)}`
    : "";
  const jobWhere = handoffId
    ? ""
    : "WHERE job.status IN ('queued','retrying') AND job.handoff_id IS NULL";
  const jobs = pagedQuery(
    config,
    database,
    `SELECT ${jobColumns.map((column) => `job.${column}`).join(",")}
      FROM legal_corpus_ingestion_jobs job ${handoffJoin} ${jobWhere}`,
    "job.created_at,job.id",
    size,
  ).map(normalizedJob);
  const failureJoin = handoffId
    ? `INNER JOIN legal_corpus_shard_handoff_jobs handoff_job
        ON handoff_job.job_id=failure.job_id AND handoff_job.handoff_id=${sqlValue(handoffId)}`
    : `INNER JOIN legal_corpus_ingestion_jobs job ON job.id=failure.job_id
        AND job.status IN ('queued','retrying') AND job.handoff_id IS NULL`;
  return {
    checkpoints: pagedQuery(
      config,
      database,
      `SELECT ${checkpointColumns.join(",")} FROM legal_corpus_discovery_checkpoints`,
      "id",
      size,
    ),
    discoveryDocuments: pagedQuery(
      config,
      database,
      `SELECT ${discoveryColumns.join(",")} FROM legal_corpus_discovery_documents`,
      "checkpoint_id,source_url",
      size,
    ),
    jobs,
    failures: pagedQuery(
      config,
      database,
      `SELECT ${failureColumns.map((column) => `failure.${column}`).join(",")}
        FROM legal_corpus_failures failure ${failureJoin}`,
      "failure.attempted_at,failure.id",
      size,
    ),
    rateLimits: query(config, database, `SELECT host,crawl_delay_ms,robots_observed_at,
      robots_body,robots_body_observed_at FROM legal_source_host_rate_limits
      WHERE host='lex.uz' ORDER BY host`),
  };
}

function manifest(
  handoffId: string,
  sourceDatabaseName: string,
  targetDatabaseName: string,
  contents: Snapshot,
): HandoffManifest {
  return {
    schemaVersion: 1,
    environment: STAGING_ENVIRONMENT,
    handoffId,
    sourceDatabaseName,
    targetDatabaseName,
    ...contents,
  };
}

function assertNoActiveDocumentAffinityJobs(config: string, database: string): void {
  const count = Number(query(config, database, `SELECT count(*) AS count
    FROM legal_corpus_ingestion_jobs AS job
    INNER JOIN legal_corpus_documents AS document
      ON document.id=job.canonical_document_id
    WHERE job.status IN ('queued','retrying','running') AND job.handoff_id IS NULL`)[0]?.count ?? -1);
  if (count !== 0) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_DOCUMENT_AFFINITY_PENDING:${count}`);
  }
}

function ledger(config: string, database: string, handoffId: string): HandoffLedgerRow | null {
  const row = query(config, database, `SELECT id,source_database_name AS sourceDatabaseName,
      target_database_name AS targetDatabaseName,manifest_sha256 AS manifestSha256,
      active_job_count AS activeJobCount,
      document_affinity_job_count AS documentAffinityJobCount,created_at AS createdAt
    FROM legal_corpus_shard_handoffs WHERE id=${sqlValue(handoffId)} LIMIT 1`)[0];
  if (!row) return null;
  return {
    id: String(row.id),
    sourceDatabaseName: String(row.sourceDatabaseName),
    targetDatabaseName: String(row.targetDatabaseName),
    manifestSha256: String(row.manifestSha256),
    activeJobCount: Number(row.activeJobCount),
    documentAffinityJobCount: Number(row.documentAffinityJobCount),
    createdAt: String(row.createdAt),
  };
}

function ledgerInsertSql(
  value: HandoffManifest,
  manifestSha256: string,
  createdAt: string,
): string {
  return `INSERT OR IGNORE INTO legal_corpus_shard_handoffs
    (id,source_database_name,target_database_name,manifest_sha256,checkpoint_count,
      discovery_document_count,active_job_count,document_affinity_job_count,
      failure_count,created_at)
    VALUES (${sqlValue(value.handoffId)},${sqlValue(value.sourceDatabaseName)},
      ${sqlValue(value.targetDatabaseName)},${sqlValue(manifestSha256)},
      ${value.checkpoints.length},${value.discoveryDocuments.length},${value.jobs.length},
      0,${value.failures.length},${sqlValue(createdAt)});`;
}

function eventSql(
  handoffId: string,
  eventType: "prepared" | "target_seeded" | "committed" | "activated",
  manifestSha256: string,
  createdAt: string,
): string {
  const id = `${handoffId}:${eventType}`;
  const digest = sha256({ handoffId, eventType, manifestSha256 });
  return `INSERT OR IGNORE INTO legal_corpus_shard_handoff_events
    (id,handoff_id,event_type,event_sha256,created_at)
    VALUES (${sqlValue(id)},${sqlValue(handoffId)},${sqlValue(eventType)},
      ${sqlValue(digest)},${sqlValue(createdAt)});`;
}

function assertEventRecorded(
  config: string,
  database: string,
  handoffId: string,
  eventType: "activated",
  manifestSha256: string,
): void {
  const row = query(config, database, `SELECT event_sha256 AS eventSha256
    FROM legal_corpus_shard_handoff_events
    WHERE id=${sqlValue(`${handoffId}:${eventType}`)}
      AND handoff_id=${sqlValue(handoffId)} AND event_type=${sqlValue(eventType)}
    LIMIT 1`)[0];
  if (row?.eventSha256 !== sha256({ handoffId, eventType, manifestSha256 })) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_HANDOFF_EVENT_MISMATCH:${database}:${eventType}`);
  }
}

function handoffJobSql(handoffId: string, job: JsonRecord): string {
  return `INSERT OR IGNORE INTO legal_corpus_shard_handoff_jobs
    (handoff_id,job_id,source_status,source_attempt_count,source_max_attempts,
      source_next_attempt_at,source_last_error_code,source_updated_at,job_sha256)
    VALUES (${sqlValue(handoffId)},${sqlValue(job.id)},${sqlValue(job.status)},
      ${sqlValue(job.attempt_count)},${sqlValue(job.max_attempts)},
      ${sqlValue(job.next_attempt_at)},${sqlValue(job.last_error_code)},
      ${sqlValue(job.updated_at)},${sqlValue(sha256(job))});`;
}

function assertLedger(
  value: HandoffLedgerRow | null,
  expected: HandoffManifest,
  manifestSha256: string,
  database: string,
): void {
  if (!value
    || value.id !== expected.handoffId
    || value.sourceDatabaseName !== expected.sourceDatabaseName
    || value.targetDatabaseName !== expected.targetDatabaseName
    || value.manifestSha256 !== manifestSha256
    || value.activeJobCount !== expected.jobs.length
    || value.documentAffinityJobCount !== 0) {
    throw new TypeError(`LEGAL_CORPUS_SHARD_HANDOFF_LEDGER_MISMATCH:${database}`);
  }
}

function targetEmpty(config: string, target: string): boolean {
  const row = query(config, target, `SELECT
      (SELECT count(*) FROM legal_corpus_documents) AS documents,
      (SELECT count(*) FROM legal_corpus_provisions) AS provisions,
      (SELECT count(*) FROM legal_corpus_chunks) AS chunks,
      (SELECT count(*) FROM legal_corpus_ingestion_jobs) AS jobs,
      (SELECT count(*) FROM legal_corpus_shard_handoffs) AS handoffs`)[0];
  return Boolean(row)
    && [row.documents, row.provisions, row.chunks, row.jobs, row.handoffs]
      .every((value) => Number(value) === 0);
}

async function initialize(args: ReadonlyMap<string, string>): Promise<void> {
  const config = args.get("config") ?? "wrangler.legal-corpus-shard.jsonc";
  const source = required(args, "source");
  const target = required(args, "target");
  assertShardPair(source, target);
  const targetDatabaseId = databaseId(config, target);
  await withDatabaseConfig(config, target, async (targetConfig) => {
    runWranglerTextCommand(
      targetConfig,
      ["d1", "migrations", "apply", target, "--remote"],
      `target-migrations:${target}`,
    );
    const targetControl = control(targetConfig, target);
    const migration = query(targetConfig, target, `SELECT count(*) AS count,
      max(name) AS latest FROM d1_migrations`)[0];
    if (targetControl.state !== "active" || !targetEmpty(targetConfig, target)
      || !migration || Number(migration.count) < 1 || typeof migration.latest !== "string") {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_TARGET_INITIALIZATION_INVALID");
    }
    process.stdout.write(`${JSON.stringify({
      phase: "initialize",
      status: "initialized",
      source,
      target,
      targetDatabaseId,
      migrationsApplied: Number(migration.count),
      latestMigration: migration.latest,
      acquisitionState: targetControl.state,
      next: "wait_for_rollover_threshold_then_prepare",
    })}\n`);
  });
}

async function seedTarget(
  config: string,
  target: string,
  value: HandoffManifest,
  digest: string,
  temporaryDirectory: string,
  now: string,
): Promise<void> {
  const existing = ledger(config, target, value.handoffId);
  if (!existing && !targetEmpty(config, target)) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_TARGET_NOT_EMPTY");
  }
  if (existing) {
    assertLedger(existing, value, digest, target);
  } else {
    await executeStatements(config, target, [ledgerInsertSql(value, digest, now)],
      temporaryDirectory, "target-ledger");
  }
  const statements = [
    ...value.checkpoints.map((row) => insert(
      "legal_corpus_discovery_checkpoints",
      checkpointColumns,
      row,
    )),
    ...value.discoveryDocuments.map((row) => insert(
      "legal_corpus_discovery_documents",
      discoveryColumns,
      row,
    )),
    ...value.jobs.map((row) => insert(
      "legal_corpus_ingestion_jobs",
      jobColumns,
      row,
      { variant_id: null },
    )),
    ...value.jobs.map((job) => handoffJobSql(value.handoffId, job)),
    ...value.failures.map((row) => insert("legal_corpus_failures", failureColumns, row)),
    ...value.rateLimits.map((row) => `INSERT OR REPLACE INTO legal_source_host_rate_limits
      (host,crawl_delay_ms,last_request_at,next_allowed_at,robots_observed_at,updated_at,
        robots_body,robots_body_observed_at)
      VALUES (${sqlValue(row.host)},${sqlValue(Math.max(20_000, Number(row.crawl_delay_ms) || 0))},
        NULL,${sqlValue(now)},${sqlValue(row.robots_observed_at)},${sqlValue(now)},
        ${sqlValue(row.robots_body)},${sqlValue(row.robots_body_observed_at)});`),
  ];
  await executeStatements(config, target, statements, temporaryDirectory, "target-seed");
}

async function commitSource(
  config: string,
  source: string,
  value: HandoffManifest,
  digest: string,
  temporaryDirectory: string,
  now: string,
): Promise<void> {
  const existing = ledger(config, source, value.handoffId);
  if (existing) assertLedger(existing, value, digest, source);
  const statements = [
    ledgerInsertSql(value, digest, now),
    eventSql(value.handoffId, "prepared", digest, now),
    ...value.jobs.map((job) => handoffJobSql(value.handoffId, job)),
    `UPDATE legal_corpus_ingestion_jobs AS job
      SET status='completed',next_attempt_at=NULL,last_error_code='LEGAL_CORPUS_SHARD_HANDOFF',
        handoff_id=${sqlValue(value.handoffId)},
        handoff_target_database_name=${sqlValue(value.targetDatabaseName)},
        handed_off_at=${sqlValue(now)},updated_at=${sqlValue(now)}
      WHERE handoff_id IS NULL AND status IN ('queued','retrying')
        AND EXISTS (
          SELECT 1 FROM legal_corpus_shard_handoff_jobs handoff_job
          WHERE handoff_job.handoff_id=${sqlValue(value.handoffId)}
            AND handoff_job.job_id=job.id
            AND handoff_job.source_status=job.status
            AND handoff_job.source_attempt_count=job.attempt_count
            AND handoff_job.source_max_attempts=job.max_attempts
            AND coalesce(handoff_job.source_next_attempt_at,'')=coalesce(job.next_attempt_at,'')
            AND coalesce(handoff_job.source_last_error_code,'')=coalesce(job.last_error_code,'')
            AND handoff_job.source_updated_at=job.updated_at
        );`,
  ];
  await executeStatements(config, source, statements, temporaryDirectory, "source-commit");
  const tombstones = Number(query(config, source, `SELECT count(*) AS count
    FROM legal_corpus_ingestion_jobs
    WHERE handoff_id=${sqlValue(value.handoffId)} AND status='completed'
      AND last_error_code='LEGAL_CORPUS_SHARD_HANDOFF'`)[0]?.count ?? -1);
  if (tombstones !== value.jobs.length) {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_TOMBSTONE_MISMATCH");
  }
  await executeStatements(config, source, [
    `UPDATE legal_corpus_shard_control
      SET acquisition_state='frozen',updated_at=${sqlValue(now)}
      WHERE singleton_id=1 AND acquisition_state='handoff_prepared'
        AND active_handoff_id=${sqlValue(value.handoffId)}
        AND NOT EXISTS (
          SELECT 1 FROM legal_corpus_ingestion_jobs
          WHERE status IN ('queued','retrying','running') AND handoff_id IS NULL
        );`,
    eventSql(value.handoffId, "committed", digest, now),
  ], temporaryDirectory, "source-freeze");
  if (control(config, source).state !== "frozen") {
    throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_FREEZE_FAILED");
  }
}

async function prepare(args: ReadonlyMap<string, string>): Promise<void> {
  const config = args.get("config") ?? "wrangler.legal-corpus-shard.jsonc";
  const source = required(args, "source");
  const target = required(args, "target");
  assertShardPair(source, target);
  await withShardConfigs(config, source, target, async (configs) => {
    const size = pageSize(args);
    const sourceControl = control(configs.source, source);
    const targetControl = control(configs.target, target);
    const sourceDeployment = sourceControl.state === "frozen"
      ? null
      : deployedDatabaseBinding(configs.source, source);
    const existingIds = [sourceControl.handoffId, targetControl.handoffId]
      .filter((value): value is string => Boolean(value));
    if (new Set(existingIds).size > 1) {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_HANDOFF_ID_CONFLICT");
    }
    const handoffId = existingIds[0] ?? randomUUID();
    const now = new Date().toISOString();
    prepareControl(configs.target, target, handoffId, source, now);
    const preparedSource = prepareControl(configs.source, source, handoffId, target, now);
    if (preparedSource.state === "frozen") {
      const sourceLedger = ledger(configs.source, source, handoffId);
      const targetLedger = ledger(configs.target, target, handoffId);
      if (!sourceLedger || !targetLedger
        || sourceLedger.manifestSha256 !== targetLedger.manifestSha256) {
        throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_COMMITTED_LEDGER_INVALID");
      }
      process.stdout.write(`${JSON.stringify({
        phase: "prepare",
        status: "already_prepared",
        handoffId,
        source,
        target,
        manifestSha256: sourceLedger.manifestSha256,
        activeJobs: sourceLedger.activeJobCount,
        next: "deploy_target_binding_then_activate",
      })}\n`);
      return;
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), "juro-corpus-rollover-"));
    try {
      assertNoActiveDocumentAffinityJobs(configs.source, source);
      const sourceSnapshot = snapshot(configs.source, source, size, null);
      const value = manifest(handoffId, source, target, sourceSnapshot);
      const digest = sha256(value);
      await seedTarget(configs.target, target, value, digest, temporaryDirectory, now);
      const targetSnapshot = snapshot(configs.target, target, size, handoffId);
      const targetDigest = sha256(manifest(handoffId, source, target, targetSnapshot));
      if (targetDigest !== digest) {
        throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_TARGET_VERIFY_FAILED");
      }
      assertLedger(ledger(configs.target, target, handoffId), value, digest, target);
      await executeStatements(configs.target, target, [
        eventSql(handoffId, "target_seeded", digest, now),
      ], temporaryDirectory, "target-event");

      assertNoActiveDocumentAffinityJobs(configs.source, source);
      const sourceRecheck = manifest(
        handoffId,
        source,
        target,
        snapshot(configs.source, source, size, null),
      );
      if (sha256(sourceRecheck) !== digest) {
        throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_CHANGED");
      }
      await commitSource(configs.source, source, value, digest, temporaryDirectory, now);
      process.stdout.write(`${JSON.stringify({
        phase: "prepare",
        status: "prepared",
        handoffId,
        source,
        target,
        manifestSha256: digest,
        checkpoints: value.checkpoints.length,
        discoveryDocuments: value.discoveryDocuments.length,
        activeJobs: value.jobs.length,
        failures: value.failures.length,
        sourceDeployment,
        next: "deploy_target_binding_then_activate",
      })}\n`);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
}

async function activate(args: ReadonlyMap<string, string>): Promise<void> {
  const config = args.get("config") ?? "wrangler.legal-corpus-shard.jsonc";
  const source = required(args, "source");
  const target = required(args, "target");
  const handoffId = required(args, "confirm-handoff-id");
  assertShardPair(source, target);
  await withShardConfigs(config, source, target, async (configs) => {
    const sourceControl = control(configs.source, source);
    const targetControl = control(configs.target, target);
    if (sourceControl.state !== "frozen" || sourceControl.handoffId !== handoffId) {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_NOT_FROZEN");
    }
    const targetIsPrepared = targetControl.state === "handoff_prepared"
      && targetControl.handoffId === handoffId;
    const targetIsAlreadyActive = targetControl.state === "active"
      && targetControl.handoffId === null && targetControl.peerDatabaseName === null;
    if (!targetIsPrepared && !targetIsAlreadyActive) {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_TARGET_NOT_PREPARED");
    }
    const sourceLedger = ledger(configs.source, source, handoffId);
    const targetLedger = ledger(configs.target, target, handoffId);
    if (!sourceLedger || !targetLedger
      || sourceLedger.manifestSha256 !== targetLedger.manifestSha256
      || sourceLedger.activeJobCount !== targetLedger.activeJobCount) {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_ACTIVATION_LEDGER_INVALID");
    }
    const targetDeployment = deployedDatabaseBinding(configs.target, target);
    if (!Number.isFinite(Date.parse(targetDeployment.createdOn))
      || !Number.isFinite(Date.parse(targetLedger.createdAt))
      || Date.parse(targetDeployment.createdOn) <= Date.parse(targetLedger.createdAt)) {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_TARGET_DEPLOYMENT_STALE");
    }
    if (targetIsAlreadyActive) {
      assertEventRecorded(
        configs.target,
        target,
        handoffId,
        "activated",
        targetLedger.manifestSha256,
      );
      const recoveryDirectory = await mkdtemp(join(tmpdir(), "juro-corpus-activate-recovery-"));
      try {
        await executeStatements(configs.source, source, [
          eventSql(handoffId, "activated", sourceLedger.manifestSha256, new Date().toISOString()),
        ], recoveryDirectory, "source-activated-event-recovery");
      } finally {
        await rm(recoveryDirectory, { recursive: true, force: true });
      }
      assertEventRecorded(
        configs.source,
        source,
        handoffId,
        "activated",
        sourceLedger.manifestSha256,
      );
      process.stdout.write(`${JSON.stringify({
        phase: "activate",
        status: "already_active",
        handoffId,
        source,
        target,
        manifestSha256: targetLedger.manifestSha256,
        readyJobs: targetLedger.activeJobCount,
        targetDeployment,
      })}\n`);
      return;
    }
    const targetState = query(configs.target, target, `SELECT
        (SELECT count(*) FROM scheduled_locks
          WHERE name='legal-corpus-worker' AND expires_at>${sqlValue(new Date().toISOString())}) AS liveLocks,
        (SELECT count(*) FROM scheduled_runs
          WHERE schedule_name='legal-corpus-worker' AND status='running') AS liveRuns,
        (SELECT count(*) FROM legal_corpus_ingestion_jobs WHERE status='running') AS runningJobs,
        (SELECT count(*) FROM legal_corpus_ingestion_jobs job
          INNER JOIN legal_corpus_shard_handoff_jobs handoff_job ON handoff_job.job_id=job.id
          WHERE handoff_job.handoff_id=${sqlValue(handoffId)}
            AND job.status IN ('queued','retrying')) AS readyJobs,
        (SELECT count(*) FROM legal_corpus_ingestion_jobs
          WHERE status IN ('queued','retrying')) AS allReadyJobs`)[0];
    if (!targetState
      || Number(targetState.liveLocks) !== 0
      || Number(targetState.liveRuns) !== 0
      || Number(targetState.runningJobs) !== 0
      || Number(targetState.readyJobs) !== targetLedger.activeJobCount
      || Number(targetState.allReadyJobs) !== targetLedger.activeJobCount) {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_ACTIVATION_STATE_INVALID");
    }
    const now = new Date().toISOString();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "juro-corpus-activate-"));
    try {
      await executeStatements(configs.target, target, [
        eventSql(handoffId, "activated", targetLedger.manifestSha256, now),
        `UPDATE legal_corpus_shard_control
          SET acquisition_state='active',active_handoff_id=NULL,target_database_name=NULL,
            updated_at=${sqlValue(now)}
          WHERE singleton_id=1 AND acquisition_state='handoff_prepared'
            AND active_handoff_id=${sqlValue(handoffId)};`,
      ], temporaryDirectory, "target-activate");
      await executeStatements(configs.source, source, [
        eventSql(handoffId, "activated", sourceLedger.manifestSha256, now),
      ], temporaryDirectory, "source-activated-event");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    if (control(configs.target, target).state !== "active") {
      throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_ACTIVATION_FAILED");
    }
    assertEventRecorded(
      configs.target,
      target,
      handoffId,
      "activated",
      targetLedger.manifestSha256,
    );
    assertEventRecorded(
      configs.source,
      source,
      handoffId,
      "activated",
      sourceLedger.manifestSha256,
    );
    process.stdout.write(`${JSON.stringify({
      phase: "activate",
      status: "active",
      handoffId,
      source,
      target,
      manifestSha256: targetLedger.manifestSha256,
      readyJobs: targetLedger.activeJobCount,
      targetDeployment,
    })}\n`);
  });
}

async function main(): Promise<void> {
  const args = argumentMap();
  const phase = required(args, "phase");
  if (phase === "initialize") await initialize(args);
  else if (phase === "prepare") await prepare(args);
  else if (phase === "activate") await activate(args);
  else throw new TypeError("LEGAL_CORPUS_SHARD_ROLLOVER_PHASE_INVALID");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({
      code: "LEGAL_CORPUS_SHARD_ROLLOVER_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
    })}\n`);
    process.exitCode = 2;
  });
}
