import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

const exportSql = await readFile(inputPath, "utf8");
if (!/CREATE TABLE(?: IF NOT EXISTS)? [`"]?d1_migrations[`"]?/.test(exportSql)) {
  throw new Error("Full export does not contain the D1 migration ledger.");
}
if (!/INSERT INTO/.test(exportSql)) {
  throw new Error("Full export contains no data rows.");
}

await mkdir(dirname(outputPath), { recursive: true });
const db = new DatabaseSync(outputPath);
try {
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec(exportSql);
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
    inputBytes: Buffer.byteLength(exportSql),
    outputBytes: outputStat.size,
    sha256: sha256(exportSql),
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
