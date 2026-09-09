import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { streamDataSql } from "./verify-d1-export-restore.mjs";

const execFileAsync = promisify(execFile);

test("streams a D1 data export through bounded complete-statement batches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "juro-d1-restore-stream-"));
  const dataPath = join(directory, "data.sql");
  const dataSql = [
    "PRAGMA defer_foreign_keys=TRUE;",
    "INSERT INTO records VALUES (1, 'alpha');",
    "INSERT INTO records VALUES (2, 'Бета');",
    "INSERT INTO records VALUES (3, 'line one;\nline two ''quoted'' value');",
    "",
  ].join("\n");
  await writeFile(dataPath, dataSql, "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = await streamDataSql(database, dataPath, {
      batchBytes: 48,
      highWaterMark: 7,
    });
    database.exec("COMMIT");
    assert.deepEqual(database.prepare("SELECT * FROM records ORDER BY id").all().map((row) => ({ ...row })), [
      { id: 1, value: "alpha" },
      { id: 2, value: "Бета" },
      { id: 3, value: "line one;\nline two 'quoted' value" },
    ]);
    assert.equal(result.sha256, createHash("sha256").update(dataSql).digest("hex"));
    assert.equal(result.statementCount, 4);
    assert.ok(result.batchCount >= 2);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects schema statements in a streamed data export", async () => {
  const directory = await mkdtemp(join(tmpdir(), "juro-d1-restore-stream-"));
  const dataPath = join(directory, "data.sql");
  await writeFile(dataPath, [
    "PRAGMA defer_foreign_keys=TRUE;",
    "CREATE TABLE forbidden (id INTEGER);",
    "",
  ].join("\n"), "utf8");
  const database = new DatabaseSync(":memory:");
  try {
    await assert.rejects(
      streamDataSql(database, dataPath, { batchBytes: 48, highWaterMark: 7 }),
      /Data export contains schema/u,
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed CLI restore never publishes the requested output path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "juro-d1-restore-failure-"));
  const schemaPath = join(directory, "schema.sql");
  const dataPath = join(directory, "data.sql");
  const outputPath = join(directory, "restore.sqlite");
  await writeFile(schemaPath, [
    "PRAGMA defer_foreign_keys=TRUE;",
    "CREATE TABLE records (id INTEGER PRIMARY KEY);",
    "",
  ].join("\n"), "utf8");
  await writeFile(dataPath, [
    "PRAGMA defer_foreign_keys=TRUE;",
    "CREATE TABLE forbidden (id INTEGER);",
    "",
  ].join("\n"), "utf8");
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("./verify-d1-export-restore.mjs", import.meta.url)),
        "--schema",
        schemaPath,
        "--data",
        dataPath,
        "--output",
        outputPath,
      ]),
      /Data export contains schema/u,
    );
    await assert.rejects(access(outputPath), { code: "ENOENT" });
    assert.equal(
      (await readdir(directory)).filter((name) =>
        name.startsWith("restore.sqlite.incomplete-")
      ).length,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
