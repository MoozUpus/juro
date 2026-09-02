import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createSourceSnapshotLegalReadTools,
  createD1SourceSnapshotRetrievalCatalog,
  createSourceSnapshotPassageResolver,
} from "../lib/legal-corpus/source-snapshot-retrieval";
import {
  parseCandidatePacket,
  parsePinnedCandidateRelease,
} from "../lib/legal-corpus/legal-candidate-index";
import { serializeNeutralSourceSnapshotChunk } from "../lib/legal-corpus/source-snapshot";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

async function sha256(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return Buffer.from(await crypto.subtle.digest("SHA-256", owned.buffer)).toString("hex");
}

test("Source Snapshot hydration returns a neutral citation without textual-authority claims", async () => {
  const textDigest = await sha256(new TextEncoder().encode("Проверенный текст."));
  const bytes = serializeNeutralSourceSnapshotChunk({
    sourceDocumentId: "source-document:1",
    sourceSnapshotId: "source-snapshot:1",
    snapshotProvisionId: "snapshot-provision:1",
    canonicalChunkId: "chunk:1:0",
    publisher: "lex.uz",
    publisherDocumentToken: "lexuz-family:1:ru",
    publisherRevisionToken: "revision-1",
    languageTag: "ru",
    sourceUrl: "https://lex.uz/ru/docs/1",
    capturedAt: "2026-08-31T06:26:27.225Z",
    documentType: "Закон",
    articleNumber: "1",
    articleTitle: null,
    sequence: 0,
    provisionText: "Проверенный текст.",
    sourceProvisionSha256: textDigest,
    sourceNormalizedSha256: "b".repeat(64),
  });
  const digest = await sha256(bytes);
  const resolve = createSourceSnapshotPassageResolver({
    catalog: {
      async resolveCandidate() {
        return {
          releaseId: "release:1",
          canonicalChunkId: "chunk:1:0",
          snapshotProvisionId: "snapshot-provision:1",
          eligibilityStatus: "eligible" as const,
          r2Key: "release/chunk.json",
          byteCount: bytes.byteLength,
          sha256: digest,
          language: "ru",
          documentType: "Закон",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null,
        };
      },
    },
    bucket: {
      async get() {
        const owned = new Uint8Array(bytes.byteLength);
        owned.set(bytes);
        return { size: bytes.byteLength, async arrayBuffer() { return owned.buffer; } };
      },
    },
  });

  const passage = await resolve("release:1", "chunk:1:0");
  assert.equal(passage?.provisionText, "Проверенный текст.");
  assert.deepEqual(passage?.citation, {
    publisher: "lex.uz",
    sourceUrl: "https://lex.uz/ru/docs/1",
    languageTag: "ru",
    publisherDocumentToken: "lexuz-family:1:ru",
    publisherRevisionToken: "revision-1",
    capturedAt: "2026-08-31T06:26:27.225Z",
  });
  assert.doesNotMatch(JSON.stringify(passage), /controlling|official.translation|textual.authority/iu);
});

test("Source Snapshot hydration rejects ineligible rows before R2", async () => {
  let read = false;
  const resolve = createSourceSnapshotPassageResolver({
    catalog: { async resolveCandidate() { return {
      releaseId: "release:1", canonicalChunkId: "chunk:1:0",
      snapshotProvisionId: "snapshot-provision:1", eligibilityStatus: "ineligible" as const,
      r2Key: "release/chunk.json", byteCount: 1, sha256: "a".repeat(64),
      language: "ru", documentType: "Закон",
      validFrom: "2026-01-01T00:00:00.000Z", validTo: null,
    }; } },
    bucket: { async get() { read = true; return null; } },
  });
  await assert.rejects(resolve("release:1", "chunk:1:0"), /SOURCE_SNAPSHOT_CANDIDATE_INELIGIBLE/u);
  assert.equal(read, false);
});

test("Source Snapshot item hydration rejects provider metadata drift before R2", async () => {
  let read = false;
  const resolve = createSourceSnapshotPassageResolver({
    catalog: {
      async resolveCandidate() { return null; },
      async resolveItemKey() { return {
        releaseId: "release:1", canonicalChunkId: "chunk:1:0",
        snapshotProvisionId: "snapshot-provision:1", eligibilityStatus: "eligible" as const,
        r2Key: "release/chunk.json", byteCount: 1, sha256: "a".repeat(64),
        language: "ru" as const, documentType: "Закон",
        validFrom: "2026-01-01T00:00:00.000Z", validTo: null,
      }; },
    },
    bucket: { async get() { read = true; return null; } },
  });
  await assert.rejects(resolve.itemKey("release:1", "release/chunk.json", {
    language: "ru", document_type: "Закон",
    valid_from: "2026-01-02T00:00:00.000Z", valid_to: null,
  }), /SOURCE_SNAPSHOT_PROVIDER_METADATA_MISMATCH/u);
  assert.equal(read, false);
});

test("Source Snapshot replay driver terminates lanes for an already-completed run", async () => {
  const driver = await readFile(new URL("../scripts/run-source-snapshot-build.mjs", import.meta.url), "utf8");
  assert.match(driver,
    /if \(!results\[index\]\.laneComplete && !results\[index\]\.complete\) laneQueue\.push\(active\[index\]\);/u);
});

test("Source Snapshot catalog ignores preserved eligibility from an unqualified build", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    sqlite.exec("PRAGMA foreign_keys=OFF");
    sqlite.prepare(`INSERT INTO legal_search_releases
      (id,environment,capability,corpus_snapshot_id,status,item_count,retrieval_policy_version,
       configuration_identity,sealed_at,created_at)
      VALUES ('release:test','staging','current','snapshot:test','draft',1,'policy:test',?,NULL,?)`)
      .run("a".repeat(64), "2026-09-02T00:00:00.000Z");
    sqlite.prepare(`INSERT INTO legal_canonical_chunks
      (id,snapshot_provision_id,ordinal,r2_key,byte_count,sha256,schema_version,created_at)
      VALUES ('chunk:test','provision:test',0,'search-releases/test/chunk.json',1,?,1,?)`)
      .run("b".repeat(64), "2026-09-02T00:00:00.000Z");
    sqlite.exec(`INSERT INTO legal_source_snapshot_release_members
      (search_release_id,canonical_chunk_id,snapshot_provision_id,shard_id)
      VALUES ('release:test','chunk:test','provision:test','00')`);
    sqlite.prepare(`INSERT INTO legal_search_release_items
      (search_release_id,provision_rendition_id,canonical_chunk_id,item_key,r2_key,
       byte_count,sha256,language,document_type,valid_from,valid_to)
      VALUES ('release:test','rendition:test','chunk:test','search-releases/test/chunk.json',
        'search-releases/test/chunk.json',1,?,'ru','Закон',?,NULL)`)
      .run("b".repeat(64), "2026-01-01T00:00:00.000Z");
    const insertBuild = (id: string) => {
      sqlite.prepare(`INSERT INTO legal_source_snapshot_builds
        (id,environment,cutoff_at,release_id,configuration_identity,shard_count,status,phase,
         processed_count,eligible_count,excluded_count,created_at,updated_at)
        VALUES (?,'staging',?,'release:test',?,1,'sealed','complete',1,1,0,?,?)`)
        .run(id, "2026-09-02T00:00:00.000Z", "c".repeat(64),
          "2026-09-02T00:00:00.000Z", "2026-09-02T00:00:00.000Z");
    };
    const insertEligibility = (id: string, buildId: string, status: string) => {
      sqlite.prepare(`INSERT INTO legal_retrieval_eligibility
        (id,build_id,snapshot_provision_id,capability,status,reason_codes_json,
         official_source_verified,d1_r2_integrity_verified,extraction_verified,identity_stable,
         current_pointer_verified,temporal_state_supported,privacy_verified,quarantine_clear,
         canonicalization_clear,evaluated_at)
        VALUES (?,?,'provision:test','current',?,'[]',1,1,1,1,1,1,1,1,1,?)`)
        .run(id, buildId, status, "2026-09-02T00:00:00.000Z");
    };
    insertBuild("build:legacy");
    insertEligibility("eligibility:legacy", "build:legacy", "eligible");
    const catalog = createD1SourceSnapshotRetrievalCatalog(d1);
    assert.equal(await catalog.resolveCandidate("release:test", "chunk:test"), null);

    insertBuild("build:qualified");
    insertEligibility("eligibility:qualified", "build:qualified", "eligible");
    sqlite.prepare(`INSERT INTO legal_source_snapshot_qualifications
      (build_id,release_id,recovery_sql_sha256,recovery_sqlite_sha256,validation_sha256,
       standards_review_sha256,spec_review_sha256,qualification_sha256,qualified_at)
      VALUES ('build:qualified','release:test',?,?,?,?,?,?,?)`)
      .run(...Array(6).fill("d".repeat(64)), "2026-09-02T00:00:00.000Z");
    sqlite.exec("PRAGMA foreign_keys=ON");

    const candidate = await catalog.resolveCandidate("release:test", "chunk:test");
    assert.equal(candidate?.eligibilityStatus, "eligible");
  } finally {
    sqlite.close();
  }
});

test("Source Snapshot legal read tools rank through the pinned candidate index and hydrate exact R2 evidence", async () => {
  const textDigest = await sha256(new TextEncoder().encode("Проверенный текст нормы."));
  const bytes = serializeNeutralSourceSnapshotChunk({
    sourceDocumentId: "source-document:1",
    sourceSnapshotId: "source-snapshot:1",
    snapshotProvisionId: "snapshot-provision:1",
    canonicalChunkId: "chunk:1:0",
    publisher: "lex.uz",
    publisherDocumentToken: "lexuz-family:1:ru",
    publisherRevisionToken: "revision-1",
    languageTag: "ru",
    sourceUrl: "https://lex.uz/ru/docs/1",
    capturedAt: "2026-08-31T06:26:27.225Z",
    documentType: "Закон",
    articleNumber: "1",
    articleTitle: "Общие положения",
    sequence: 0,
    provisionText: "Проверенный текст нормы.",
    sourceProvisionSha256: textDigest,
    sourceNormalizedSha256: "b".repeat(64),
  });
  const digest = await sha256(bytes);
  const itemKey = "search-releases/release-current-v1/current/00/chunk:1:0.json";
  const release = parsePinnedCandidateRelease({
    id: "release-current-v1",
    environment: "staging",
    capability: "current",
    instances: [{ id: "current-porter-00", shardId: "00" }],
    configuration: {
      identity: "ai-search-staging-v1",
      embeddingModel: "openai/text-embedding-3-large",
      dimensions: 1_536,
      keywordTokenizer: "porter",
      metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
      gatewayIdentity: "juro-ai-search-staging",
      providerProjectIdentity: "juro-openai-staging",
      gatewayPayloadLogging: false,
      gatewayCaching: false,
      similarityCaching: false,
    },
  });
  const tools = createSourceSnapshotLegalReadTools({
    release,
    async interpretQuery({ query }) {
      return {
        id: "interpretation-primary",
        formulations: [{ id: "formulation-primary", text: query, privateNameSpans: [],
          readingIds: ["reading-primary"], requirementIds: ["requirement-primary"] }],
      };
    },
    candidateIndex: {
      async retrieve(interpretation, endpoint, pinned) {
        assert.equal(interpretation.formulations[0]?.text, "трудовой договор");
        assert.deepEqual(endpoint, { kind: "current" });
        assert.equal(pinned.id, release.id);
        return parseCandidatePacket({
          availability: "available",
          releaseId: release.id,
          endpoint,
          requiredInstanceIds: ["current-porter-00"],
          candidates: [{
            itemKey,
            instanceId: "current-porter-00",
            shardId: "00",
            formulationId: interpretation.formulations[0]!.id,
            readingIds: ["reading-primary"],
            requirementIds: ["requirement-primary"],
            vectorRank: 1,
            vectorScore: 0.91,
            keywordRank: 2,
            keywordScore: 0.7,
            fusionScore: 0.82,
            providerMetadata: {
              language: "ru", document_type: "Закон",
              valid_from: "2026-01-01T00:00:00.000Z", valid_to: null,
            },
          }],
          partialErrors: [],
        });
      },
    },
    catalog: {
      async resolveCandidate() { return null; },
      async resolveItemKey(releaseId, candidateItemKey) {
        assert.equal(releaseId, release.id);
        assert.equal(candidateItemKey, itemKey);
        return {
          releaseId,
          canonicalChunkId: "chunk:1:0",
          snapshotProvisionId: "snapshot-provision:1",
          eligibilityStatus: "eligible" as const,
          r2Key: itemKey,
          byteCount: bytes.byteLength,
          sha256: digest,
          language: "ru",
          documentType: "Закон",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null,
        };
      },
    },
    bucket: {
      async get(key) {
        assert.equal(key, itemKey);
        const owned = new Uint8Array(bytes.byteLength);
        owned.set(bytes);
        return { size: bytes.byteLength, async arrayBuffer() { return owned.buffer; } };
      },
    },
  });

  const results = await tools.findLegalSources({ query: "трудовой договор", locale: "ru" });
  assert.deepEqual(results, [{
    chunkId: "chunk:1:0",
    provisionId: "snapshot-provision:1",
    documentId: "source-document:1",
    documentTitle: "Закон · lexuz-family:1:ru",
    documentType: "Закон",
    documentNumber: "lexuz-family:1:ru",
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION",
    articleNumber: "1",
    articleTitle: "Общие положения",
    exactQuote: "Проверенный текст нормы.",
    sourceUrl: "https://lex.uz/ru/docs/1",
    language: "ru",
    status: "active",
    validFrom: null,
    validTo: null,
    versionDate: "revision-1",
    fetchedAt: "2026-08-31T06:26:27.225Z",
    contentHash: textDigest,
    provider: "lex_uz",
    sparseRank: 2,
    denseRank: 1,
    semanticScore: 0.91,
    fusionScore: 0.82,
    windowHydrated: false,
    candidateExcerptOnly: false,
  }]);
  assert.deepEqual(await tools.readLegalProvisions({ anchorChunkId: "chunk:1:0" }), [{
    id: "chunk:1:0",
    article: "1. Общие положения",
    paragraph: null,
    text: "Проверенный текст нормы.",
    textSha256: textDigest,
    quality: "high",
    provisionSequence: 0,
  }]);
  await assert.rejects(tools.readLegalProvisions({
    anchorChunkId: "chunk:1:0", before: 1,
  }), /SOURCE_SNAPSHOT_PROVISION_WINDOW_UNSUPPORTED/u);
  assert.doesNotMatch(JSON.stringify(results), /controlling|textualAuthority/iu);
});
