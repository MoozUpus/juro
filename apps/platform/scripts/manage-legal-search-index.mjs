import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const IDENTIFIER = /^[A-Za-z0-9:_-]{1,160}$/u;
const COLLECTION = /^[A-Za-z0-9_-]{1,80}$/u;
const MODEL = /^[A-Za-z0-9._:-]{1,120}$/u;
const environment = "staging";
const database = "juro-staging";

function fail(message) { throw new Error(message); }

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`--${name} requires a value`);
  return value;
}

function sqlText(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function runD1(sql) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", database, "--remote", "--json",
      "--config", "wrangler.legal-corpus.jsonc", "--env", environment, "--command", sql],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) fail(result.stderr?.trim() || result.stdout?.trim() || result.error?.message
    || `wrangler exited ${result.status}`);
  try { return JSON.parse(result.stdout); } catch { fail("Wrangler returned non-JSON output"); }
}

function rows(packet) {
  const batches = Array.isArray(packet) ? packet : [packet];
  return batches.flatMap((entry) => entry?.results ?? entry?.result?.[0]?.results ?? []);
}

function status(manifestId) {
  if (!IDENTIFIER.test(manifestId ?? "")) fail("A valid --manifest-id is required");
  return rows(runD1(`SELECT id AS manifestId,environment,qdrant_collection AS qdrantCollection,
    sparse_schema_version AS sparseSchemaVersion,embedding_model AS embeddingModel,
    embedding_schema_version AS embeddingSchemaVersion,reranker_model AS rerankerModel,
    reranker_version AS rerankerVersion,variant_count AS variantCount,chunk_count AS chunkCount,
    indexed_chunk_count AS indexedChunkCount,last_chunk_id AS lastChunkId,status,error_code AS errorCode,
    created_at AS createdAt,updated_at AS updatedAt
    FROM legal_corpus_search_index_builds WHERE id=${sqlText(manifestId)} LIMIT 1`))[0] ?? null;
}

function start() {
  const manifestId = option("manifest-id");
  const qdrantCollection = option("qdrant-collection");
  const sparseSchemaVersion = option("sparse-schema-version", "compressed-v1");
  const embeddingModel = option("embedding-model", "text-embedding-3-large");
  const embeddingSchemaVersion = option("embedding-schema-version", "provision-metadata-v1");
  const rerankerModel = option("reranker-model", "text-embedding-3-large");
  const rerankerVersion = option("reranker-version", "provision-set-v1");
  if (!IDENTIFIER.test(manifestId ?? "") || !COLLECTION.test(qdrantCollection ?? "")
    || !IDENTIFIER.test(sparseSchemaVersion) || !IDENTIFIER.test(embeddingSchemaVersion)
    || !IDENTIFIER.test(rerankerVersion) || !MODEL.test(embeddingModel) || !MODEL.test(rerankerModel)) {
    fail("Invalid build arguments");
  }
  const now = new Date().toISOString();
  const countRow = rows(runD1(`SELECT count(DISTINCT variant.id) AS variantCount,
    count(chunk.id) AS chunkCount
    FROM legal_corpus_variants variant
    INNER JOIN legal_corpus_versions version ON version.id=variant.current_version_id
    INNER JOIN legal_corpus_chunks chunk ON chunk.version_id=version.id
    INNER JOIN legal_corpus_documents document ON document.id=variant.document_id
    WHERE document.availability_status='ready' AND document.scope='global'
      AND document.provider IN ('lex_uz','juro_owner')`))[0];
  const variantCount = Number(countRow?.variantCount ?? 0);
  const chunkCount = Number(countRow?.chunkCount ?? 0);
  if (!Number.isSafeInteger(variantCount) || variantCount < 1
    || !Number.isSafeInteger(chunkCount) || chunkCount < 1) fail("Invalid corpus counts");
  const existing = status(manifestId);
  if (!existing) {
    runD1(`INSERT INTO legal_corpus_search_index_builds
      (id,environment,qdrant_collection,sparse_schema_version,embedding_model,
       embedding_schema_version,reranker_model,reranker_version,variant_count,chunk_count,
       indexed_chunk_count,last_chunk_id,status,error_code,created_at,updated_at)
      VALUES (${sqlText(manifestId)},${sqlText(environment)},${sqlText(qdrantCollection)},
        ${sqlText(sparseSchemaVersion)},${sqlText(embeddingModel)},${sqlText(embeddingSchemaVersion)},
        ${sqlText(rerankerModel)},${sqlText(rerankerVersion)},${variantCount},${chunkCount},
        0,NULL,'building',NULL,${sqlText(now)},${sqlText(now)})`);
  } else if (
    existing.status !== "building" || Number(existing.indexedChunkCount) !== 0
    || existing.qdrantCollection !== qdrantCollection
    || Number(existing.variantCount) !== variantCount || Number(existing.chunkCount) !== chunkCount
  ) {
    fail("Existing build cannot resume snapshot creation");
  }
  runD1(`INSERT INTO legal_corpus_search_index_build_versions (build_id,variant_id,version_id)
    SELECT ${sqlText(manifestId)},variant.id,variant.current_version_id
    FROM legal_corpus_variants variant
    INNER JOIN legal_corpus_chunks chunk ON chunk.version_id=variant.current_version_id
    INNER JOIN legal_corpus_documents document ON document.id=variant.document_id
    WHERE variant.current_version_id IS NOT NULL AND document.availability_status='ready'
      AND document.scope='global' AND document.provider IN ('lex_uz','juro_owner')
    GROUP BY variant.id,variant.current_version_id ORDER BY variant.id
    ON CONFLICT(build_id,variant_id) DO NOTHING`);
  const frozen = rows(runD1(`SELECT count(*) AS variantCount
    FROM legal_corpus_search_index_build_versions build_version
    WHERE build_version.build_id=${sqlText(manifestId)}`))[0];
  if (Number(frozen?.variantCount ?? 0) !== variantCount) {
    runD1(`UPDATE legal_corpus_search_index_builds SET status='failed',
      error_code='LEGAL_SEARCH_BUILD_SNAPSHOT_CHANGED',updated_at=${sqlText(new Date().toISOString())}
      WHERE id=${sqlText(manifestId)} AND status='building'`);
    fail("Corpus changed while the build snapshot was frozen");
  }
  process.stdout.write(`${JSON.stringify({ status: "started", build: status(manifestId) })}\n`);
}

async function activate() {
  const manifestId = option("manifest-id");
  const actor = option("actor", "local-release-tool");
  const reason = option("reason");
  const evidencePath = option("canary-evidence");
  if (!IDENTIFIER.test(manifestId ?? "") || !reason || reason.length < 10 || !evidencePath) {
    fail("Activation requires a valid manifest, reason, and canary evidence");
  }
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  if (evidence?.passed !== true || evidence?.indexVersion !== manifestId) fail("Canary evidence rejected");
  const previous = rows(runD1(`SELECT manifest_id AS manifestId FROM legal_corpus_search_index_activations
    WHERE environment=${sqlText(environment)} ORDER BY created_at DESC,id DESC LIMIT 1`))[0]?.manifestId ?? null;
  const now = new Date().toISOString();
  runD1(`INSERT INTO legal_corpus_search_index_activations
    (id,environment,manifest_id,previous_manifest_id,action,reason,actor,created_at)
    VALUES (${sqlText(randomUUID())},${sqlText(environment)},${sqlText(manifestId)},
      ${previous ? sqlText(previous) : "NULL"},'activate',${sqlText(reason)},${sqlText(actor)},${sqlText(now)})`);
  process.stdout.write(`${JSON.stringify({ status: "activated", manifestId, previousManifestId: previous })}\n`);
}

function rollback() {
  const actor = option("actor", "local-release-tool");
  const reason = option("reason");
  if (!reason || reason.length < 10) fail("Rollback requires --reason with at least 10 characters");
  const latest = rows(runD1(`SELECT manifest_id AS manifestId,previous_manifest_id AS previousManifestId
    FROM legal_corpus_search_index_activations WHERE environment=${sqlText(environment)}
    ORDER BY created_at DESC,id DESC LIMIT 1`))[0];
  if (!latest?.previousManifestId) fail("No rollback target is available");
  const now = new Date().toISOString();
  runD1(`INSERT INTO legal_corpus_search_index_activations
    (id,environment,manifest_id,previous_manifest_id,action,reason,actor,created_at)
    VALUES (${sqlText(randomUUID())},${sqlText(environment)},${sqlText(latest.previousManifestId)},
      ${sqlText(latest.manifestId)},'rollback',${sqlText(reason)},${sqlText(actor)},${sqlText(now)})`);
  process.stdout.write(`${JSON.stringify({ status: "rolled_back", manifestId: latest.previousManifestId })}\n`);
}

const command = process.argv[2];
if (command === "start") start();
else if (command === "status") process.stdout.write(`${JSON.stringify(status(option("manifest-id")))}\n`);
else if (command === "activate") await activate();
else if (command === "rollback") rollback();
else fail("Usage: manage-legal-search-index.mjs <start|status|activate|rollback> [options]");
