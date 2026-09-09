import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, link, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StringDecoder } from "node:string_decoder";
import { pathToFileURL } from "node:url";

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

export async function streamDataSql(database, dataPath, {
  batchBytes = 8 * 1024 * 1024,
  highWaterMark = 1024 * 1024,
} = {}) {
  assert.ok(Number.isSafeInteger(batchBytes) && batchBytes > 0);
  assert.ok(Number.isSafeInteger(highWaterMark) && highWaterMark > 0);
  const hash = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  let statement = "";
  let quote = null;
  let quoteMayClose = false;
  let statementCount = 0;
  let batchCount = 0;
  let batch = [];
  let batchSize = 0;

  const flushBatch = () => {
    if (batch.length === 0) return;
    database.exec(batch.join("\n"));
    batch = [];
    batchSize = 0;
    batchCount += 1;
  };
  const acceptStatement = (value) => {
    const command = value.trim();
    if (!command) return;
    if (statementCount === 0) {
      assert.equal(
        command,
        "PRAGMA defer_foreign_keys=TRUE;",
        "Unexpected data export preamble.",
      );
    }
    assert.doesNotMatch(command, /^CREATE\b/iu, "Data export contains schema.");
    const commandBytes = Buffer.byteLength(command);
    if (batch.length > 0 && batchSize + commandBytes > batchBytes) flushBatch();
    batch.push(command);
    batchSize += commandBytes + 1;
    statementCount += 1;
  };
  const consume = (value) => {
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (quoteMayClose) {
        const closingQuote = quote === "[" ? "]" : quote;
        if (character === closingQuote) {
          statement += character;
          quoteMayClose = false;
          continue;
        }
        quote = null;
        quoteMayClose = false;
      }
      statement += character;
      if (quote) {
        const closingQuote = quote === "[" ? "]" : quote;
        if (character === closingQuote) quoteMayClose = true;
        continue;
      }
      if (character === "'" || character === '"' || character === "`" || character === "[") {
        quote = character;
      } else if (character === ";") {
        acceptStatement(statement);
        statement = "";
      }
    }
  };

  const input = createReadStream(dataPath, { highWaterMark });
  for await (const chunk of input) {
    hash.update(chunk);
    consume(decoder.write(chunk));
  }
  consume(decoder.end());
  if (quoteMayClose) {
    quote = null;
    quoteMayClose = false;
  }
  assert.equal(quote, null, "Data export ends inside a quoted value.");
  assert.equal(statement.trim(), "", "Data export contains an unterminated statement.");
  assert.ok(statementCount > 0, "Data export contains no statements.");
  flushBatch();
  return { sha256: hash.digest("hex"), statementCount, batchCount };
}

async function main(argv) {
  const options = parseArgs(argv);
  const schemaPath = resolve(options.schema);
  const dataPath = resolve(options.data);
  const outputPath = resolve(options.output);
  try {
    await access(outputPath);
    throw new Error(`Refusing to overwrite existing restore target: ${outputPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const schemaSql = await readFile(schemaPath, "utf8");
  const schemaCommands = splitSchemaCommands(schemaSql);
  const tableCommands = schemaCommands.filter((command) =>
    command.startsWith("CREATE TABLE")
  );
  const secondaryCommands = schemaCommands.filter((command) =>
    !command.startsWith("CREATE TABLE")
  );
  await mkdir(dirname(outputPath), { recursive: true });
  const stagingPath = `${outputPath}.incomplete-${randomUUID()}`;
  const reservation = await open(stagingPath, "wx");
  await reservation.close();
  const db = new DatabaseSync(stagingPath);
  let restoreSummary;
  try {
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("BEGIN IMMEDIATE");
    for (const command of tableCommands) db.exec(command);
    db.exec("COMMIT");

    db.exec("BEGIN IMMEDIATE");
    const dataResult = await streamDataSql(db, dataPath);
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
    restoreSummary = {
      ok: true,
      output: outputPath,
      schemaSha256: sha256(schemaSql),
      dataSha256: dataResult.sha256,
      dataStatements: dataResult.statementCount,
      dataBatches: dataResult.batchCount,
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
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw new Error(
      `${error.message}\nIncomplete restore preserved at: ${stagingPath}`,
      { cause: error },
    );
  } finally {
    db.close();
  }
  try {
    await link(stagingPath, outputPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Refusing to overwrite existing restore target: ${outputPath}\n` +
        `Completed restore preserved at: ${stagingPath}`,
        { cause: error },
      );
    }
    throw error;
  }
  await unlink(stagingPath);
  const outputStat = await stat(outputPath);
  console.log(JSON.stringify({
    ...restoreSummary,
    outputBytes: outputStat.size,
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (import.meta.url === invokedPath) await main(process.argv.slice(2));
