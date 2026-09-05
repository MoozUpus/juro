import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { buildCustomTrustedTitleInventory, resolveCustomTrustedLegalTitles }
  from "../lib/legal-corpus/custom-search-trusted-titles";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE legal_search_releases (id TEXT PRIMARY KEY);
    CREATE TABLE legal_custom_search_runtime_components (search_release_id TEXT PRIMARY KEY);
    INSERT INTO legal_search_releases VALUES ('custom-release');
    INSERT INTO legal_custom_search_runtime_components VALUES ('custom-release');`);
  sqlite.exec(readFileSync(new URL("../legal-drizzle/0026_custom_search_trusted_titles.sql", import.meta.url), "utf8"));
  const db = { prepare(sql: string) { return { bind(...values: string[]) {
    return { async all() { return { results: sqlite.prepare(sql).all(...values) }; } };
  } }; } } as unknown as D1Database;
  return { sqlite, db };
}

test("trusted-title inventory normalizes source titles and seals release-scoped membership", async () => {
  const inventory = await buildCustomTrustedTitleInventory("custom-release", [" Labor Code ", "Cafe\u0301", "Café"]);
  assert.deepEqual(inventory.titles, ["Café", "Labor Code"]);
  assert.equal(inventory.sha256, createHash("sha256").update(
    '{"schemaVersion":"custom-search-trusted-titles-v1","releaseId":"custom-release","titles":["Café","Labor Code"]}',
  ).digest("hex"));
  const { sqlite, db } = fixture();
  try {
    for (const title of inventory.titles) {
      sqlite.prepare("INSERT INTO legal_custom_search_trusted_titles VALUES (?,?)").run("custom-release", title);
    }
    assert.throws(() => sqlite.prepare("INSERT INTO legal_custom_search_title_inventories VALUES (?,?,?,?)")
      .run("custom-release", 1, inventory.sha256, "2026-09-06T00:00:00.000Z"), /TITLE_COUNT_MISMATCH/u);
    sqlite.prepare("INSERT INTO legal_custom_search_title_inventories VALUES (?,?,?,?)")
      .run("custom-release", 2, inventory.sha256, "2026-09-06T00:00:00.000Z");
    assert.deepEqual(await resolveCustomTrustedLegalTitles(db, "custom-release"), ["Café", "Labor Code"]);
    assert.throws(() => sqlite.prepare(
      "INSERT OR REPLACE INTO legal_custom_search_title_inventories VALUES (?,?,?,?)",
    ).run("custom-release", 2, "b".repeat(64), "2026-09-07T00:00:00.000Z"), /TITLES_IMMUTABLE/u);
    assert.deepEqual({ ...sqlite.prepare(`SELECT inventory_sha256,created_at
      FROM legal_custom_search_title_inventories WHERE search_release_id=?`).get("custom-release") },
    { inventory_sha256: inventory.sha256, created_at: "2026-09-06T00:00:00.000Z" });
    for (const sql of [
      "INSERT INTO legal_custom_search_trusted_titles VALUES ('custom-release','Other Code')",
      "UPDATE legal_custom_search_trusted_titles SET title='Other Code'",
      "DELETE FROM legal_custom_search_trusted_titles",
      "UPDATE legal_custom_search_title_inventories SET title_count=3",
      "DELETE FROM legal_custom_search_title_inventories",
    ]) assert.throws(() => sqlite.exec(sql), /TITLES_IMMUTABLE/u);
  } finally { sqlite.close(); }
});

test("custom title trust rejects missing inventories and mismatched release digests", async () => {
  const { sqlite, db } = fixture();
  try {
    await assert.rejects(() => resolveCustomTrustedLegalTitles(db, "custom-release"), /INVENTORY_UNAVAILABLE/u);
    const otherRelease = await buildCustomTrustedTitleInventory("other-release", ["Labor Code"]);
    sqlite.prepare("INSERT INTO legal_custom_search_trusted_titles VALUES (?,?)").run("custom-release", "Labor Code");
    sqlite.prepare("INSERT INTO legal_custom_search_title_inventories VALUES (?,?,?,?)")
      .run("custom-release", 1, otherRelease.sha256, "2026-09-06T00:00:00.000Z");
    await assert.rejects(() => resolveCustomTrustedLegalTitles(db, "custom-release"), /INVENTORY_MISMATCH/u);
    assert.equal(await resolveCustomTrustedLegalTitles(db, "legacy-release"), null);
  } finally { sqlite.close(); }
});
