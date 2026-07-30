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
      throw new Error("Usage: node scripts/verify-d1-export-restore.mjs --schema <schema.sql> --data <data.sql> --output <restore.sqlite>");
    }
    result[name.slice(2)] = value;
  }
  for (const required of ["schema", "data", "output"]) {
    if (!result[required]) throw new Error(`Missing --${required}`);
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitSchemaCommands(schemaSql) {
  const matches = [...schemaSql.matchAll(
    /^CREATE (?:(?:UNIQUE )?INDEX|TABLE|TRIGGER)\b/gm,
  )];
  assert.ok(matches.length > 0, "Schema export contains no CREATE statements.");
  const prefix = schemaSql.slice(0, matches[0].index).trim();
  assert.match(
    prefix,
    /^PRAGMA defer_foreign_keys=TRUE;$/,
    "Unexpected schema export preamble.",
  );
  return matches.map((match, index) => {
    const end = matches[index + 1]?.index ?? schemaSql.length;
    const command = schemaSql.slice(match.index, end).trim();
    assert.ok(command.endsWith(";"), "Schema command is not terminated.");
    return command;
  });
}

function quotedIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

const options = parseArgs(process.argv.slice(2));
const schemaPath = resolve(options.schema);
const dataPath = resolve(options.data);
const outputPath = resolve(options.output);
try {
  await access(outputPath);
  throw new Error(`Refusing to overwrite existing restore target: ${outputPath}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const [schemaSql, dataSql] = await Promise.all([
  readFile(schemaPath, "utf8"),
  readFile(dataPath, "utf8"),
]);
assert.match(
  dataSql.trimStart(),
  /^PRAGMA defer_foreign_keys=TRUE;/,
  "Unexpected data export preamble.",
);
assert.doesNotMatch(dataSql, /^CREATE /m, "Data export contains schema.");
const schemaCommands = splitSchemaCommands(schemaSql);
const tableCommands = schemaCommands.filter((command) =>
  command.startsWith("CREATE TABLE")
);
const secondaryCommands = schemaCommands.filter((command) =>
  !command.startsWith("CREATE TABLE")
);
await mkdir(dirname(outputPath), { recursive: true });
const db = new DatabaseSync(outputPath);
try {
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec("BEGIN IMMEDIATE");
  for (const command of tableCommands) db.exec(command);
  db.exec("COMMIT");

  db.exec("BEGIN IMMEDIATE");
  db.exec(dataSql);
  db.exec("COMMIT");

  db.exec("BEGIN IMMEDIATE");
  for (const command of secondaryCommands) db.exec(command);
  db.exec("COMMIT");
  db.exec("PRAGMA foreign_keys=ON");

  const quickCheck = db.prepare("PRAGMA quick_check").all();
  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  assert.equal(quickCheck.length, 1);
  assert.equal(quickCheck[0]?.quick_check, "ok");
  assert.deepEqual(foreignKeyViolations, []);

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(({ name }) => name);
  const indexes = db.prepare(`
    SELECT count(*) AS count FROM sqlite_master
    WHERE type='index' AND name NOT LIKE 'sqlite_%'
  `).get().count;
  const triggers = db.prepare(`
    SELECT count(*) AS count FROM sqlite_master
    WHERE type='trigger'
  `).get().count;
  const representativeTables = [
    "d1_migrations",
    "user_profiles",
    "workspaces",
    "workspace_members",
    "documents",
    "auth_sessions",
    "legal_sources",
    "legal_source_versions",
    "legal_source_publications",
    "legal_review_queue",
  ];
  const rowCounts = Object.fromEntries(
    representativeTables
      .filter((name) => tables.includes(name))
      .map((name) => [
        name,
        db.prepare(`SELECT count(*) AS count FROM ${quotedIdentifier(name)}`)
          .get().count,
      ]),
  );
  const outputStat = await stat(outputPath);
  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    outputBytes: outputStat.size,
    schemaSha256: sha256(schemaSql),
    dataSha256: sha256(dataSql),
    schemaCommands: schemaCommands.length,
    tableCommands: tableCommands.length,
    secondaryCommands: secondaryCommands.length,
    tableCount: tables.length,
    applicationTableCount: tables.filter((name) => name !== "d1_migrations")
      .length,
    indexCount: indexes,
    triggerCount: triggers,
    migrationCount: rowCounts.d1_migrations,
    rowCounts,
    quickCheck: "ok",
    foreignKeyViolations: 0,
  }, null, 2));
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {}
  throw error;
} finally {
  db.close();
}
