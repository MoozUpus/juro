import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(
        "Usage: node scripts/verify-d1-full-export-restore.mjs --input <backup.sql> --output <restore.sqlite>",
      );
    }
    result[name.slice(2)] = value;
  }
  for (const required of ["input", "output"]) {
    if (!result[required]) throw new Error(`Missing --${required}`);
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
const inputPath = resolve(options.input);
const outputPath = resolve(options.output);
try {
  await access(outputPath);
  throw new Error(`Refusing to overwrite existing restore target: ${outputPath}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await mkdir(dirname(outputPath), { recursive: true });
const db = new DatabaseSync(outputPath);
try {
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec("BEGIN IMMEDIATE");

  const inputStat = await stat(inputPath);
  const digest = createHash("sha256");
  const input = createReadStream(inputPath);
  input.on("data", (chunk) => digest.update(chunk));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let statementLines = [];
  let batch = [];
  let batchBytes = 0;
  let hasMigrationLedger = false;
  let hasDataRows = false;
  let statementCount = 0;

  const executeBatch = () => {
    if (batch.length === 0) return;
    db.exec(batch.join("\n"));
    batch = [];
    batchBytes = 0;
  };

  for await (const line of lines) {
    statementLines.push(line);
    const firstLine = statementLines[0]?.trimStart() ?? "";
    const isTrigger = /^CREATE\s+TRIGGER\b/i.test(firstLine);
    const isComplete = isTrigger
      ? /\bEND;\s*$/i.test(line.trim())
      : /;\s*$/.test(line);
    if (!isComplete) continue;

    const statement = statementLines.join("\n");
    statementLines = [];
    hasMigrationLedger ||= /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`"]?d1_migrations[`"]?/i.test(
      statement,
    );
    hasDataRows ||= /^INSERT\s+INTO\b/i.test(statement.trimStart());
    batch.push(statement);
    batchBytes += Buffer.byteLength(statement) + 1;
    statementCount += 1;
    if (batchBytes >= 8 * 1024 * 1024) executeBatch();
  }
  if (statementLines.some((line) => line.trim().length > 0)) {
    throw new Error("Full export ends with an incomplete SQL statement.");
  }
  executeBatch();
  db.exec("COMMIT");

  if (!hasMigrationLedger) {
    throw new Error("Full export does not contain the D1 migration ledger.");
  }
  if (!hasDataRows) {
    throw new Error("Full export contains no data rows.");
  }
  db.exec("PRAGMA foreign_keys=ON");

  const quickCheck = db.prepare("PRAGMA quick_check").all();
  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  assert.equal(quickCheck.length, 1);
  assert.equal(quickCheck[0]?.quick_check, "ok");
  assert.deepEqual(foreignKeyViolations, []);

  const topology = db.prepare(`
    SELECT
      sum(CASE WHEN type = 'table' AND name NOT LIKE 'sqlite_%' THEN 1 ELSE 0 END) AS table_count,
      sum(CASE WHEN type = 'index' AND name NOT LIKE 'sqlite_%' THEN 1 ELSE 0 END) AS index_count,
      sum(CASE WHEN type = 'trigger' THEN 1 ELSE 0 END) AS trigger_count
    FROM sqlite_master
  `).get();
  const migrationCount = db.prepare("SELECT count(*) AS count FROM d1_migrations").get().count;
  const outputStat = await stat(outputPath);

  console.log(JSON.stringify({
    ok: true,
    inputBytes: inputStat.size,
    outputBytes: outputStat.size,
    sha256: digest.digest("hex"),
    statementCount,
    tableCount: topology.table_count,
    indexCount: topology.index_count,
    triggerCount: topology.trigger_count,
    migrationCount,
    quickCheck: "ok",
    foreignKeyViolations: 0,
  }, null, 2));
} finally {
  db.close();
}
