import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  TICKET29_CURRENT_LOCATOR_SQL,
  TICKET29_TARGET_LOCATOR_SQL,
} from "../lib/legal-corpus/complete-corpus-materialization";
import { assertTicket29BodyFreeSchema } from "../scripts/ticket29-isolated-artifact-paths";

test("Ticket 29 target lookups seek by requested identity instead of scanning retained evidence", async () => {
  const sql = await readFile(new URL(
    "../legal-drizzle/0024_ticket29_target_lookup_indexes.sql", import.meta.url,
  ), "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE legal_evidence_locators (
      id TEXT PRIMARY KEY, object_kind TEXT NOT NULL, r2_key TEXT NOT NULL,
      media_type TEXT NOT NULL, byte_count INTEGER NOT NULL, sha256 TEXT NOT NULL,
      source_normalized_sha256 TEXT);
    CREATE TABLE legal_search_release_items (
      search_release_id TEXT NOT NULL, provision_rendition_id TEXT NOT NULL);
    CREATE INDEX legal_search_release_item_provision_idx
      ON legal_search_release_items(search_release_id, provision_rendition_id);
    CREATE TABLE legal_provision_renditions (id TEXT PRIMARY KEY, locator_id TEXT NOT NULL);`);
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const requested = JSON.stringify([{ sourceId: "source", legacyCurrentRenditionId: "rendition",
    rawSha256: "a".repeat(64), normalizedSha256: "b".repeat(64) }]);
  const locatorPlan = database.prepare(`EXPLAIN QUERY PLAN ${TICKET29_TARGET_LOCATOR_SQL}`)
    .all(requested, requested) as Array<{ detail: string }>;
  const currentPlan = database.prepare(`EXPLAIN QUERY PLAN ${TICKET29_CURRENT_LOCATOR_SQL}`)
    .all(requested, "release") as Array<{ detail: string }>;
  assert.equal(locatorPlan.some(({ detail }) =>
    detail === "SCAN locator" || detail.startsWith("SCAN legal_evidence_locators")), false);
  assert.equal(locatorPlan.filter(({ detail }) => detail.startsWith("SEARCH locator USING ")
    && detail.endsWith(
      "legal_evidence_locator_kind_sha_idx (object_kind=? AND sha256=?)",
    )).length, 2);
  assert.equal(currentPlan.some(({ detail }) =>
    detail === "SCAN item" || detail.startsWith("SCAN legal_search_release_items")), false);
  assert.equal(currentPlan.some(({ detail }) =>
    detail.includes("legal_search_release_item_provision_idx")
      && detail.includes("search_release_id=? AND provision_rendition_id=?")), true);
  database.close();
});

test("Ticket 29 migration stores body-free immutable identities and locators", async () => {
  const sql = await readFile(new URL("../legal-drizzle/0023_complete_corpus_materialization.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_records`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_objects`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_manifests`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_attempt_pages`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_aliases`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_lineage_refs`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_quarantines`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_qualifications`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_snapshots`/u);
  assert.match(sql, /CREATE TABLE `legal_complete_corpus_control_attempts`/u);
  assert.match(sql, /legal_complete_corpus_records_no_update/u);
  assert.match(sql, /legal_complete_corpus_objects_no_update/u);
  assert.match(sql, /legal_complete_corpus_manifests_no_update/u);
  assert.match(sql, /legal_complete_corpus_attempt_pages_no_update/u);
  assert.match(sql, /legal_complete_corpus_aliases_no_update/u);
  assert.match(sql, /legal_complete_corpus_lineage_refs_no_update/u);
  assert.match(sql, /legal_complete_corpus_snapshots_no_update/u);
  assert.match(sql, /legal_complete_corpus_control_attempts_no_update/u);
  assert.doesNotMatch(sql, /`(?:text|body|posting|term|position|vector|embedding)`/u);
  assert.match(sql, /UNIQUE \(`run_id`,`legal_identity_sha256`\)/u);
  assert.match(sql, /UNIQUE \(`run_id`,`object_kind`,`sha256`\)/u);
  assert.match(sql, /UNIQUE \(`run_id`,`owner_kind`,`owner_id`,`alias_kind`\)/u);
  assert.doesNotMatch(sql, /UNIQUE \(`run_id`,`owner_kind`,`owner_id`,`alias_kind`,`alias_sha256`\)/u);
  assert.match(sql, /`plan_r2_key` text NOT NULL/u);
  assert.match(sql, /legal_complete_corpus_records_building_insert/u);
  assert.match(sql, /LEGAL_COMPLETE_CORPUS_RUN_SEALED/u);
  assert.match(sql, /legal_complete_corpus_qualifications_materialized_insert/u);
  assert.match(sql, /`quarantined` integer NOT NULL/u);
  assert.match(sql, /`provision_object_sha256` text NOT NULL/u);
  assert.match(sql, /`legacy_target_publisher_revision_token` text NOT NULL/u);
  assert.match(sql, /`created_byte_count` integer NOT NULL/u);
  assert.match(sql, /`reused_byte_count` integer NOT NULL/u);
  assert.match(sql, /`materialization_disposition` text NOT NULL/u);
  assert.match(sql, /`source_normalized_sha256` text/u);
  assert.match(sql, /'quarantines'/u);
  assert.match(sql, /`row_sha256` text NOT NULL/u);
});

test("Ticket 29 worker pins the authorized Cloudflare account", async () => {
  const config = await readFile(new URL("../wrangler.legal-complete-corpus.jsonc", import.meta.url), "utf8");
  assert.match(config, /"account_id": "e22babd36b65c99b69adf3de50df5227"/u);
  assert.match(config, /"max_concurrency": 25/u);
  assert.doesNotMatch(config, /OPENAI|provider|embedding|QDRANT|VECTORIZE/iu);
});

test("Ticket 29 empty-version identities come from cutoff-hashed source objects", async () => {
  const generator = await readFile(new URL(
    "../scripts/generate-ticket29-source-object-manifest.mts", import.meta.url,
  ), "utf8");
  assert.doesNotMatch(generator, /legal_corpus_variants|legal_corpus_documents/u);
  assert.match(generator, /normalizedLegalSourceSnapshotSchema\.parse/u);
  assert.match(generator, /discoverLexLanguageVariants\(rawHtml, current\)/u);
  assert.match(generator, /rawContentSha256 !== raw\.sha256/u);
});

test("Ticket 29 migration enforces natural alias uniqueness and seals child tables", async () => {
  const sql = await readFile(new URL("../legal-drizzle/0023_complete_corpus_materialization.sql", import.meta.url), "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const bodyFreeColumns = database.prepare(`SELECT m.name AS tableName,p.name AS columnName
    FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table'
      AND m.name LIKE 'legal_complete_corpus_%' ORDER BY m.name,p.cid`).all() as Array<{
    tableName: string; columnName: string;
  }>;
  assert.doesNotThrow(() => assertTicket29BodyFreeSchema(bodyFreeColumns));
  assert.throws(() => assertTicket29BodyFreeSchema([
    ...bodyFreeColumns,
    { tableName: "legal_complete_corpus_records", columnName: "provision_text" },
  ]), /TICKET29_EXPORTED_D1_SCHEMA_MISMATCH/u);
  const hash = "a".repeat(64);
  database.prepare(`INSERT INTO legal_complete_corpus_runs
    (id,schema_version,source_cutoff,source_bookmark,source_inventory_sha256,
     source_canonical_sha256,source_alias_sha256,source_r2_object_manifest_sha256,
     source_r2_alias_manifest_sha256,source_empty_version_manifest_sha256,status,
     expected_record_count,materialized_record_count,created_at,updated_at)
    VALUES (?,'complete-corpus-materialization-v1',?,?,?,?,?,?,?,?, 'building',2,0,?,?)`)
    .run("run", "2026-08-31T00:00:00.000Z", "bookmark", hash, hash, hash, hash, hash, hash,
      "2026-09-04T00:00:00.000Z", "2026-09-04T00:00:00.000Z");
  const alias = database.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_aliases
    (run_id,owner_kind,owner_id,target_identity,alias_kind,alias_sha256,alias_value,row_sha256,created_at)
    VALUES ('run','source_version','version','revision','raw_capture',?,?,?,?)`);
  alias.run(hash, "source/a", hash, "2026-09-04T00:00:00.000Z");
  alias.run("b".repeat(64), "source/b", "b".repeat(64), "2026-09-04T00:00:00.000Z");
  assert.equal((database.prepare("SELECT count(*) AS count FROM legal_complete_corpus_aliases")
    .get() as { count: number }).count, 1);
  database.prepare(`INSERT INTO legal_complete_corpus_objects
    (run_id,object_kind,sha256,r2_key,byte_count,materialization_disposition,media_type,
     schema_version,normalization_version,source_normalized_sha256,descriptor_sha256,created_at)
    VALUES ('run','normalized_revision',?,'normalized-key',1,'created','application/json',
     'complete-corpus-evidence-v1','legal-corpus-normalized-v1',?,?,?)`)
    .run(hash, hash, hash, "2026-09-04T00:00:00.000Z");
  const objectRow = database.prepare(`SELECT materialization_disposition AS disposition,
      source_normalized_sha256 AS sourceNormalizedSha256 FROM legal_complete_corpus_objects`)
    .get() as { disposition: string; sourceNormalizedSha256: string };
  assert.equal(objectRow.disposition, "created");
  assert.equal(objectRow.sourceNormalizedSha256, hash);
  database.prepare(`INSERT INTO legal_complete_corpus_control_attempts
    (run_id,attempt_id,stage,lane,record_count,created_object_count,reused_object_count,
     created_byte_count,reused_byte_count,root_sha256,completed_at)
    VALUES ('run','ticket29:first','plan','1',2,1,0,1,0,?,?)`)
    .run(hash, "2026-09-04T00:00:00.000Z");
  database.prepare("UPDATE legal_complete_corpus_runs SET materialized_record_count=1 WHERE id='run'").run();
  database.prepare("UPDATE legal_complete_corpus_runs SET materialized_record_count=2 WHERE id='run'").run();
  assert.throws(() => database.prepare(
    "UPDATE legal_complete_corpus_runs SET materialized_record_count=1 WHERE id='run'",
  ).run(), /LEGAL_COMPLETE_CORPUS_RUN_IDENTITY_IMMUTABLE/u);
  database.prepare("UPDATE legal_complete_corpus_runs SET status='materialized' WHERE id='run'").run();
  assert.throws(() => database.prepare(`INSERT INTO legal_complete_corpus_control_attempts
    (run_id,attempt_id,stage,lane,record_count,created_object_count,reused_object_count,
     created_byte_count,reused_byte_count,root_sha256,completed_at)
    VALUES ('run','ticket29:second','plan','1',2,0,1,0,1,?,?)`)
    .run(hash, "2026-09-04T00:00:00.000Z"), /LEGAL_COMPLETE_CORPUS_RUN_SEALED/u);
  assert.throws(() => database.prepare(`INSERT INTO legal_complete_corpus_objects
    (run_id,object_kind,sha256,r2_key,byte_count,materialization_disposition,media_type,schema_version,normalization_version,
     descriptor_sha256,created_at) VALUES ('run','manifest',?,'key',0,'created','application/json',
     'complete-corpus-evidence-v1','legal-corpus-normalized-v1',?,?)`)
    .run(hash, hash, "2026-09-04T00:00:00.000Z"), /LEGAL_COMPLETE_CORPUS_RUN_SEALED/u);
  database.prepare(`INSERT INTO legal_complete_corpus_qualifications
    (run_id,report_r2_key,report_sha256,report_byte_count,report_write_disposition,database_export_sha256,
     database_export_byte_count,evidence_object_count,evidence_byte_count,evidence_root_sha256,qualified_at)
    VALUES ('run','report',?,1,'created',?,1,0,0,?,?)`).run(hash, hash, hash,
      "2026-09-04T00:00:00.000Z");
  database.prepare("UPDATE legal_complete_corpus_runs SET status='complete' WHERE id='run'").run();
  assert.throws(() => database.prepare(
    "UPDATE legal_complete_corpus_runs SET status='building' WHERE id='run'",
  ).run(), /LEGAL_COMPLETE_CORPUS_STATUS_REGRESSION/u);
  assert.throws(() => database.prepare(
    "UPDATE legal_complete_corpus_runs SET source_cutoff='2026-09-01T00:00:00.000Z' WHERE id='run'",
  ).run(), /LEGAL_COMPLETE_CORPUS_RUN_IDENTITY_IMMUTABLE/u);
  assert.throws(() => database.prepare(`INSERT INTO legal_complete_corpus_qualifications
    (run_id,report_r2_key,report_sha256,report_byte_count,report_write_disposition,database_export_sha256,
     database_export_byte_count,evidence_object_count,evidence_byte_count,evidence_root_sha256,qualified_at)
    VALUES ('run','other',?,1,'created',?,1,0,0,?,?)`).run(hash, hash, hash,
    "2026-09-04T00:00:00.000Z"), /QUALIFICATION_REQUIRES_MATERIALIZED_RUN/u);
  database.close();
});
