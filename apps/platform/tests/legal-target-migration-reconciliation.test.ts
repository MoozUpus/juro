import assert from "node:assert/strict";
import test from "node:test";

import {
  MigrationReconciliationError,
  prepareCorpusMigrationProjections,
  reconcileCorpusMigration,
  type CorpusMigrationInventory,
} from "../lib/legal-corpus/target-migration";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const hash = (character: string) => character.repeat(64);

function representativeInventory(): CorpusMigrationInventory {
  return {
    runId: "reconciliation-current-v1",
    environment: "development",
    releaseId: "release-current-reconciled-v1",
    capability: "current",
    shardCount: 2,
    sourceDocuments: [
      { sourceId: "doc-a", legalInstrumentId: "instrument-a", publisherInstrumentToken: "lex-document-100", sourceUrl: "https://lex.uz/docs/100" },
      { sourceId: "doc-a-route", legalInstrumentId: "instrument-a", publisherInstrumentToken: "lex-document-100", sourceUrl: "https://lex.uz/ru/docs/100", redirectedTo: "https://lex.uz/docs/100" },
      { sourceId: "doc-b", legalInstrumentId: "instrument-b", publisherInstrumentToken: "lex-document-200", sourceUrl: "https://lex.uz/docs/200" },
    ],
    rawCaptures: [
      { sourceId: "raw-a-1", captureId: "capture-a-1", legalInstrumentId: "instrument-a", sourceUrl: "https://lex.uz/docs/100", capturedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
      { sourceId: "raw-a-1-retry", captureId: "capture-a-1-retry", legalInstrumentId: "instrument-a", sourceUrl: "https://lex.uz/ru/docs/100", capturedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
      { sourceId: "raw-b-1", captureId: "capture-b-1", legalInstrumentId: "instrument-b", sourceUrl: "https://lex.uz/docs/200", capturedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
    ],
    normalizedRevisions: [
      { sourceId: "revision-a-1", textRevisionId: "revision-a-1", officialExpressionId: "expression-a-uz", publisherInstrumentToken: "lex-document-100", publisherRevisionToken: "2026-01-01-1", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", captureIds: ["capture-a-1"], sha256: hash("b") },
      { sourceId: "revision-a-1-retry", textRevisionId: "revision-a-1-retry", officialExpressionId: "expression-a-uz", publisherInstrumentToken: "lex-document-100", publisherRevisionToken: "2026-01-01-1", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", captureIds: ["capture-a-1-retry"], sha256: hash("b") },
      { sourceId: "revision-a-2", textRevisionId: "revision-a-2", officialExpressionId: "expression-a-uz", publisherInstrumentToken: "lex-document-100", publisherRevisionToken: "2026-01-01-2", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", captureIds: ["capture-a-1"], sha256: hash("c") },
      { sourceId: "revision-a-ru", textRevisionId: "revision-a-ru", officialExpressionId: "expression-a-ru", publisherInstrumentToken: "lex-document-100", publisherRevisionToken: "2026-01-01-1", language: "ru", script: "Cyrl", textualAuthority: "official_translation", captureIds: ["capture-a-1-retry"], sha256: hash("b") },
      { sourceId: "revision-b-1", textRevisionId: "revision-b-1", officialExpressionId: "expression-b-uz", publisherInstrumentToken: "lex-document-200", publisherRevisionToken: "2026-01-01-1", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", captureIds: ["capture-b-1"], sha256: hash("b") },
    ],
    provisionRenditions: [
      { sourceId: "rendition-a-old", provisionRenditionId: "rendition-a-old", provisionConceptId: "concept-a-old", textRevisionId: "revision-a-1", legalInstrumentId: "instrument-a", publisherInstrumentToken: "lex-document-100", publisherConceptToken: "concept-token-a-old", publisherProvisionToken: "article-old", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", applicabilityIdentity: "2026-01-01T00:00:00.000Z/2026-02-01T00:00:00.000Z", sha256: hash("d"), semanticFingerprint: `legal-semantic-v1:${hash("9")}` },
      { sourceId: "rendition-a-old-retry", provisionRenditionId: "rendition-a-old-retry", provisionConceptId: "concept-a-old", textRevisionId: "revision-a-1-retry", legalInstrumentId: "instrument-a", publisherInstrumentToken: "lex-document-100", publisherConceptToken: "concept-token-a-old", publisherProvisionToken: "article-old", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", applicabilityIdentity: "2026-01-01T00:00:00.000Z/2026-02-01T00:00:00.000Z", sha256: hash("d"), semanticFingerprint: `legal-semantic-v1:${hash("9")}` },
      { sourceId: "rendition-a-new", provisionRenditionId: "rendition-a-new", provisionConceptId: "concept-a-new", textRevisionId: "revision-a-2", legalInstrumentId: "instrument-a", publisherInstrumentToken: "lex-document-100", publisherConceptToken: "concept-token-a-new", publisherProvisionToken: "article-new", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", applicabilityIdentity: "2026-02-01T00:00:00.000Z/", sha256: hash("e"), semanticFingerprint: `legal-semantic-v1:${hash("9")}` },
      { sourceId: "rendition-a-ru", provisionRenditionId: "rendition-a-ru", provisionConceptId: "concept-a-old", textRevisionId: "revision-a-ru", legalInstrumentId: "instrument-a", publisherInstrumentToken: "lex-document-100", publisherConceptToken: "concept-token-a-old", publisherProvisionToken: "article-old", language: "ru", script: "Cyrl", textualAuthority: "official_translation", applicabilityIdentity: "2026-01-01T00:00:00.000Z/", sha256: hash("d"), semanticFingerprint: `legal-semantic-v1:${hash("9")}` },
      { sourceId: "rendition-b", provisionRenditionId: "rendition-b", provisionConceptId: "concept-b", textRevisionId: "revision-b-1", legalInstrumentId: "instrument-b", publisherInstrumentToken: "lex-document-200", publisherConceptToken: "concept-token-b", publisherProvisionToken: "article-b", language: "uz-Latn", script: "Latn", textualAuthority: "controlling", applicabilityIdentity: "2026-01-01T00:00:00.000Z/", sha256: hash("d"), semanticFingerprint: `legal-semantic-v1:${hash("9")}` },
    ],
    chunks: [
      { sourceId: "chunk-a", chunkId: "chunk-a", provisionRenditionId: "rendition-a-old", ordinal: 0, sha256: hash("f"), byteCount: 101, capabilities: ["current", "history"] },
      { sourceId: "chunk-a-retry", chunkId: "chunk-a-retry", provisionRenditionId: "rendition-a-old-retry", ordinal: 0, sha256: hash("f"), byteCount: 101, capabilities: ["current", "history"] },
      { sourceId: "chunk-new", chunkId: "chunk-new", provisionRenditionId: "rendition-a-new", ordinal: 0, sha256: hash("1"), byteCount: 102, capabilities: ["current", "history"] },
      { sourceId: "chunk-ru", chunkId: "chunk-ru", provisionRenditionId: "rendition-a-ru", ordinal: 0, sha256: hash("2"), byteCount: 103, capabilities: ["current", "history"] },
      { sourceId: "chunk-b", chunkId: "chunk-b", provisionRenditionId: "rendition-b", ordinal: 0, sha256: hash("3"), byteCount: 104, capabilities: ["current"] },
    ],
    sparsePostings: [
      { sourceId: "sparse-a", chunkId: "chunk-a", termHash: hash("f") },
      { sourceId: "sparse-a-retry", chunkId: "chunk-a-retry", termHash: hash("f") },
      { sourceId: "sparse-new", chunkId: "chunk-new", termHash: hash("1") },
      { sourceId: "sparse-ru", chunkId: "chunk-ru", termHash: hash("2") },
      { sourceId: "sparse-b", chunkId: "chunk-b", termHash: hash("3") },
    ],
    denseCandidates: [
      { sourceId: "dense-a", chunkId: "chunk-a", projection: "current", providerId: "legacy-a" },
      { sourceId: "dense-a-retry", chunkId: "chunk-a-retry", projection: "current", providerId: "legacy-a-retry" },
      { sourceId: "dense-new", chunkId: "chunk-new", projection: "current", providerId: "legacy-new" },
      { sourceId: "dense-ru", chunkId: "chunk-ru", projection: "current", providerId: "legacy-ru" },
      { sourceId: "dense-b", chunkId: "chunk-b", projection: "current", providerId: "legacy-b" },
    ],
    releaseItems: [
      { sourceId: "release-a", itemKey: "legacy/a", releaseId: "release-current-reconciled-v1", capability: "current", chunkId: "chunk-a", provisionRenditionId: "rendition-a-old", shardId: "00", r2Key: "legacy/a", byteCount: 101, sha256: hash("f") },
      { sourceId: "release-a-retry", itemKey: "legacy/a-retry", releaseId: "release-current-reconciled-v1", capability: "current", chunkId: "chunk-a-retry", provisionRenditionId: "rendition-a-old-retry", shardId: "01", r2Key: "legacy/a-retry", byteCount: 101, sha256: hash("f") },
      { sourceId: "release-new", itemKey: "legacy/new", releaseId: "release-current-reconciled-v1", capability: "current", chunkId: "chunk-new", provisionRenditionId: "rendition-a-new", shardId: "00", r2Key: "legacy/new", byteCount: 102, sha256: hash("1") },
      { sourceId: "release-ru", itemKey: "legacy/ru", releaseId: "release-current-reconciled-v1", capability: "current", chunkId: "chunk-ru", provisionRenditionId: "rendition-a-ru", shardId: "00", r2Key: "legacy/ru", byteCount: 103, sha256: hash("2") },
      { sourceId: "release-b", itemKey: "legacy/b", releaseId: "release-current-reconciled-v1", capability: "current", chunkId: "chunk-b", provisionRenditionId: "rendition-b", shardId: "00", r2Key: "legacy/b", byteCount: 104, sha256: hash("3") },
    ],
    targetSparsePostings: [],
    targetDenseCandidates: [],
    targetReleaseItems: [],
    targetCanonicalObjects: [],
    authorityEvidenceRecords: [
      { sourceId: "authority-a-1", authorityEvidenceId: "authority-a-1", officialExpressionId: "expression-a-uz", captureId: "capture-a-1", textRevisionId: "revision-a-1", textualAuthority: "controlling", evidenceUrl: "https://lex.uz/docs/100", recordedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
      { sourceId: "authority-a-1-retry", authorityEvidenceId: "authority-a-1-retry", officialExpressionId: "expression-a-uz", captureId: "capture-a-1-retry", textRevisionId: "revision-a-1-retry", textualAuthority: "controlling", evidenceUrl: "https://lex.uz/ru/docs/100", recordedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
      { sourceId: "authority-a-2", authorityEvidenceId: "authority-a-2", officialExpressionId: "expression-a-uz", captureId: "capture-a-1", textRevisionId: "revision-a-2", textualAuthority: "controlling", evidenceUrl: "https://lex.uz/docs/100", recordedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
      { sourceId: "authority-a-ru", authorityEvidenceId: "authority-a-ru", officialExpressionId: "expression-a-ru", captureId: "capture-a-1-retry", textRevisionId: "revision-a-ru", textualAuthority: "official_translation", evidenceUrl: "https://lex.uz/ru/docs/100", recordedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
      { sourceId: "authority-b-1", authorityEvidenceId: "authority-b-1", officialExpressionId: "expression-b-uz", captureId: "capture-b-1", textRevisionId: "revision-b-1", textualAuthority: "controlling", evidenceUrl: "https://lex.uz/docs/200", recordedAt: "2026-01-01T08:00:00.000Z", sha256: hash("a") },
    ],
    applicabilityEvidenceRecords: [
      { sourceId: "applicability-a-old", applicabilityEvidenceId: "applicability-a-old", provisionRenditionId: "rendition-a-old", applicabilityIdentity: "2026-01-01T00:00:00.000Z/2026-02-01T00:00:00.000Z", evidenceUrl: "https://lex.uz/docs/100", validFrom: "2026-01-01T00:00:00.000Z", validTo: "2026-02-01T00:00:00.000Z", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "applicability-a-old-retry", applicabilityEvidenceId: "applicability-a-old-retry", provisionRenditionId: "rendition-a-old-retry", applicabilityIdentity: "2026-01-01T00:00:00.000Z/2026-02-01T00:00:00.000Z", evidenceUrl: "https://lex.uz/ru/docs/100", validFrom: "2026-01-01T00:00:00.000Z", validTo: "2026-02-01T00:00:00.000Z", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "applicability-a-new", applicabilityEvidenceId: "applicability-a-new", provisionRenditionId: "rendition-a-new", applicabilityIdentity: "2026-02-01T00:00:00.000Z/", evidenceUrl: "https://lex.uz/docs/100", validFrom: "2026-02-01T00:00:00.000Z", validTo: null, recordedAt: "2026-02-01T08:00:00.000Z" },
      { sourceId: "applicability-a-ru", applicabilityEvidenceId: "applicability-a-ru", provisionRenditionId: "rendition-a-ru", applicabilityIdentity: "2026-01-01T00:00:00.000Z/", evidenceUrl: "https://lex.uz/ru/docs/100", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "applicability-b", applicabilityEvidenceId: "applicability-b", provisionRenditionId: "rendition-b", applicabilityIdentity: "2026-01-01T00:00:00.000Z/", evidenceUrl: "https://lex.uz/docs/200", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, recordedAt: "2026-01-01T08:00:00.000Z" },
    ],
    provenanceRecords: [
      { sourceId: "provenance-a-old", provenanceRecordId: "provenance-a-old", captureId: "capture-a-1", textRevisionId: "revision-a-1", provisionRenditionId: "rendition-a-old", evidenceUrl: "https://lex.uz/docs/100", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "provenance-a-old-retry", provenanceRecordId: "provenance-a-old-retry", captureId: "capture-a-1-retry", textRevisionId: "revision-a-1-retry", provisionRenditionId: "rendition-a-old-retry", evidenceUrl: "https://lex.uz/ru/docs/100", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "provenance-a-new", provenanceRecordId: "provenance-a-new", captureId: "capture-a-1", textRevisionId: "revision-a-2", provisionRenditionId: "rendition-a-new", evidenceUrl: "https://lex.uz/docs/100", recordedAt: "2026-02-01T08:00:00.000Z" },
      { sourceId: "provenance-a-ru", provenanceRecordId: "provenance-a-ru", captureId: "capture-a-1-retry", textRevisionId: "revision-a-ru", provisionRenditionId: "rendition-a-ru", evidenceUrl: "https://lex.uz/ru/docs/100", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "provenance-b", provenanceRecordId: "provenance-b", captureId: "capture-b-1", textRevisionId: "revision-b-1", provisionRenditionId: "rendition-b", evidenceUrl: "https://lex.uz/docs/200", recordedAt: "2026-01-01T08:00:00.000Z" },
    ],
    auditRelationships: [
      { sourceId: "audit-chunk-a", auditRelationshipId: "audit-chunk-a", fromKind: "provision_rendition", fromId: "rendition-a-old", toKind: "chunk", toId: "chunk-a", relationship: "derived_chunk", evidenceUrl: "https://lex.uz/docs/100", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "audit-chunk-a-retry", auditRelationshipId: "audit-chunk-a-retry", fromKind: "provision_rendition", fromId: "rendition-a-old-retry", toKind: "chunk", toId: "chunk-a-retry", relationship: "derived_chunk", evidenceUrl: "https://lex.uz/ru/docs/100", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "audit-chunk-new", auditRelationshipId: "audit-chunk-new", fromKind: "provision_rendition", fromId: "rendition-a-new", toKind: "chunk", toId: "chunk-new", relationship: "derived_chunk", evidenceUrl: "https://lex.uz/docs/100", recordedAt: "2026-02-01T08:00:00.000Z" },
      { sourceId: "audit-chunk-ru", auditRelationshipId: "audit-chunk-ru", fromKind: "provision_rendition", fromId: "rendition-a-ru", toKind: "chunk", toId: "chunk-ru", relationship: "derived_chunk", evidenceUrl: "https://lex.uz/ru/docs/100", recordedAt: "2026-01-01T08:00:00.000Z" },
      { sourceId: "audit-chunk-b", auditRelationshipId: "audit-chunk-b", fromKind: "provision_rendition", fromId: "rendition-b", toKind: "chunk", toId: "chunk-b", relationship: "derived_chunk", evidenceUrl: "https://lex.uz/docs/200", recordedAt: "2026-01-01T08:00:00.000Z" },
    ],
    duplicateReviews: [{
      semanticFingerprint: `legal-semantic-v1:${hash("9")}`,
      decision: "preserve_distinct",
      evidenceUrl: "https://lex.uz/docs/100",
      reviewedBy: "legal-data-reviewer",
      reviewedAt: "2026-08-30T00:00:00.000Z",
    }],
    lineageEdges: [
      { id: "split-a", predecessorConceptId: "concept-a-old", successorConceptId: "concept-a-new", transition: "split", evidenceUrl: "https://lex.uz/docs/100", reviewState: "accepted" },
      { id: "merge-a", predecessorConceptId: "concept-a-old", successorConceptId: "concept-a-new", transition: "merged", evidenceUrl: "https://lex.uz/docs/100", reviewState: "accepted" },
    ],
  };
}

async function withPreparedTarget(inventory: CorpusMigrationInventory) {
  const expected = await prepareCorpusMigrationProjections(inventory);
  inventory.sparsePostings = [
    ...expected.sparsePostings,
    { ...expected.sparsePostings[0]!, sourceId: "source-sparse-exact-retry" },
  ];
  inventory.denseCandidates = [
    ...expected.denseCandidates,
    { ...expected.denseCandidates[0]!, sourceId: "source-dense-exact-retry" },
  ];
  inventory.releaseItems = [
    ...expected.releaseItems,
    { ...expected.releaseItems[0]!, sourceId: "source-release-exact-retry" },
  ];
  inventory.targetSparsePostings = expected.sparsePostings;
  inventory.targetDenseCandidates = expected.denseCandidates;
  inventory.targetReleaseItems = expected.releaseItems;
  inventory.targetCanonicalObjects = expected.canonicalObjects;
  return inventory;
}

test("canonical reconciliation aliases only exact repeats and immutable bodies while preserving legal variants", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const inventory = await withPreparedTarget(representativeInventory());
    const prepared = await reconcileCorpusMigration({ db: d1 }, inventory);
    assert.equal(prepared.status, "clean");
    assert.deepEqual(prepared.sourceCounts, {
      sourceDocuments: 3, rawCaptures: 3, normalizedRevisions: 5,
      provisionConcepts: 3, provisionRenditions: 5, chunks: 5, sparsePostings: 5,
      denseCandidates: 5, releaseItems: 5, lineageEdges: 2,
      authorityEvidenceRecords: 5, applicabilityEvidenceRecords: 5,
      provenanceRecords: 5, auditRelationships: 5,
    });
    assert.deepEqual(prepared.canonicalCounts, {
      legalInstruments: 2,
      rawCaptures: 3,
      immutableBodies: 1,
      normalizedRevisions: 4,
      provisionConcepts: 3,
      provisionRenditions: 4,
      chunks: 4,
      sparsePostings: 4,
      denseCandidates: 4,
      releaseItems: 4,
      lineageEdges: 2,
      authorityEvidenceRecords: 5,
      applicabilityEvidenceRecords: 5,
      provenanceRecords: 5,
      auditRelationships: 5,
    });
    assert.deepEqual(prepared.actualTargetCounts, {
      canonicalObjects: prepared.expected.canonicalObjects.length,
      sparsePostings: 4,
      denseCandidates: 4,
      releaseItems: 4,
    });
    assert.equal(prepared.exactDuplicatesAliased.normalizedRevisions, 1);
    assert.equal(prepared.exactDuplicatesAliased.provisionRenditions, 1);
    assert.equal(prepared.exactDuplicatesAliased.chunks, 1);
    assert.equal(prepared.exactDuplicatesAliased.immutableBodies, 2);
    assert.equal(prepared.exactDuplicatesAliased.sparsePostings, 1);
    assert.equal(prepared.exactDuplicatesAliased.denseCandidates, 1);
    assert.equal(prepared.exactDuplicatesAliased.releaseItems, 1);
    assert.equal(prepared.preservedVariants.languages, 2);
    assert.equal(prepared.preservedVariants.textualAuthorities, 2);
    assert.equal(prepared.preservedVariants.publisherRevisions, 4);
    assert.equal(prepared.preservedVariants.legalInstruments, 2);
    assert.equal(prepared.duplicateCandidates.length > 0, true,
      "near duplicates across legal contexts are persisted rather than collapsed");
    assert.equal(prepared.unresolvedDuplicateCandidates.length, 0,
      "explicit reviewed-distinct evidence resolves ambiguity without collapsing variants");
    assert.equal(prepared.provenance.sourceUrls.length, 3);
    assert.equal(prepared.provenance.captureIds.length, 3);
    assert.equal(prepared.provenance.authorityEvidence.length, 5);
    assert.equal(prepared.provenance.applicabilityEvidence.length, 5);
    assert.equal(prepared.provenance.provenanceRecords.length, 5);
    assert.equal(prepared.provenance.auditRelationships.length, 5);
    assert.equal(prepared.bodyAliases.length, 3);
    assert.equal(new Set(prepared.bodyAliases.map((alias) => alias.canonicalLocator)).size, 1,
      "byte-identical captures share one content-addressed body locator");
    assert.deepEqual(
      prepared.bodyAliases.map(({ captureId, sourceUrl }) => ({ captureId, sourceUrl })),
      [
        { captureId: "capture-a-1", sourceUrl: "https://lex.uz/docs/100" },
        { captureId: "capture-a-1-retry", sourceUrl: "https://lex.uz/ru/docs/100" },
        { captureId: "capture-b-1", sourceUrl: "https://lex.uz/docs/200" },
      ],
      "content deduplication retains each cross-instrument capture and source relationship",
    );
    assert.equal(prepared.canonicalAliases.normalizedRevisions.length, 5);
    assert.equal(new Set(prepared.canonicalAliases.normalizedRevisions
      .map((alias) => alias.canonicalIdentity)).size, 4);
    assert.deepEqual(prepared.reconciliation, {
      missingObjects: [], extraObjects: [], hashMismatches: [], metadataMismatches: [],
      missingProvenance: [], crossReleaseContamination: [], nonDisjointShardMembership: [],
      duplicateProjectionMembership: [],
    });
    assert.equal(prepared.shards.completeDisjointUnion, true);
    assert.equal(prepared.shards.itemCount, 4);
    assert.equal(prepared.lineageEdges.length, 2, "split/merge lineage must not be deduplicated by wording");
  } finally {
    sqlite.close();
  }
});

test("projection multiplicity cannot be hidden by set reconciliation", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const source = representativeInventory();
    const expected = await prepareCorpusMigrationProjections(source);
    const duplicated = await withPreparedTarget(representativeInventory());
    duplicated.runId = "reconciliation-current-duplicate-projections-v1";
    duplicated.targetCanonicalObjects = expected.canonicalObjects;
    duplicated.targetSparsePostings = [
      ...expected.sparsePostings,
      { ...expected.sparsePostings[0]!, sourceId: "duplicate-sparse-row" },
    ];
    duplicated.targetDenseCandidates = [
      ...expected.denseCandidates,
      { ...expected.denseCandidates[0]!, sourceId: "duplicate-dense-row" },
    ];
    duplicated.targetReleaseItems = [
      ...expected.releaseItems,
      { ...expected.releaseItems[0]!, sourceId: "duplicate-release-row" },
    ];
    const report = await reconcileCorpusMigration({ db: d1 }, duplicated);
    assert.equal(report.status, "blocked");
    assert.equal(report.reconciliation.duplicateProjectionMembership.length, 3);
    assert.equal(report.exactDuplicatesAliased.sparsePostings, 1);
    assert.equal(report.exactDuplicatesAliased.denseCandidates, 1);
    assert.equal(report.exactDuplicatesAliased.releaseItems, 1);
    assert.equal(report.shards.completeDisjointUnion, false);
  } finally {
    sqlite.close();
  }
});

test("reconciliation blocks a wrong shard, cross-release item, or hash mismatch", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const inventory = representativeInventory();
    const expected = await prepareCorpusMigrationProjections(inventory);
    const bad = await withPreparedTarget(representativeInventory());
    bad.runId = "reconciliation-current-bad-v1";
    bad.targetCanonicalObjects = expected.canonicalObjects;
    bad.targetSparsePostings = expected.sparsePostings;
    bad.targetDenseCandidates = expected.denseCandidates;
    bad.targetReleaseItems = expected.releaseItems.map((item, index) => index === 0 ? {
      ...item,
      releaseId: "release-other",
      provisionRenditionId: expected.releaseItems[1]!.provisionRenditionId,
      shardId: item.shardId === "00" ? "01" : "00",
      sha256: hash("9"),
    } : item);
    const report = await reconcileCorpusMigration({ db: d1 }, bad);
    assert.equal(report.status, "blocked");
    assert.equal(report.reconciliation.crossReleaseContamination.length, 1);
    assert.equal(report.reconciliation.nonDisjointShardMembership.length, 1);
    assert.equal(report.reconciliation.hashMismatches.length, 1);
    assert.equal(report.reconciliation.metadataMismatches.some((item) =>
      item.startsWith("release_rendition:")), true);

    const ambiguous = await withPreparedTarget(representativeInventory());
    ambiguous.runId = "reconciliation-current-ambiguous-v1";
    ambiguous.duplicateReviews = [];
    const ambiguousReport = await reconcileCorpusMigration({ db: d1 }, ambiguous);
    assert.equal(ambiguousReport.status, "blocked");
    assert.equal(ambiguousReport.unresolvedDuplicateCandidates.length > 0, true);
  } finally {
    sqlite.close();
  }
});

test("source projections and provenance are reconciled independently from a clean target", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const sourceDefect = await withPreparedTarget(representativeInventory());
    sourceDefect.runId = "reconciliation-source-defect-v1";
    const bOnly = representativeInventory();
    bOnly.chunks = bOnly.chunks.filter((row) => row.chunkId === "chunk-b");
    const bChunkId = (await prepareCorpusMigrationProjections(bOnly)).sparsePostings[0]!.chunkId;
    const missingChunkId = sourceDefect.sparsePostings.find((row) =>
      row.chunkId !== bChunkId)!.chunkId;
    sourceDefect.sparsePostings = sourceDefect.sparsePostings.filter((row) =>
      row.chunkId !== missingChunkId);
    sourceDefect.sparsePostings.push({
      sourceId: "source-sparse-orphan",
      chunkId: "orphan-chunk",
      termHash: hash("9"),
    });
    const wrongShardIndex = sourceDefect.releaseItems.findIndex((row) =>
      row.chunkId !== bChunkId);
    const wrongShardItem = sourceDefect.releaseItems[wrongShardIndex]!;
    sourceDefect.releaseItems[wrongShardIndex] = {
      ...wrongShardItem,
      shardId: wrongShardItem.shardId === "00" ? "01" : "00",
    };
    sourceDefect.normalizedRevisions[0] = {
      ...sourceDefect.normalizedRevisions[0]!,
      captureIds: ["missing-capture"],
    };
    sourceDefect.authorityEvidenceRecords = sourceDefect.authorityEvidenceRecords.filter((row) =>
      row.officialExpressionId !== "expression-b-uz");
    sourceDefect.applicabilityEvidenceRecords = sourceDefect.applicabilityEvidenceRecords.filter((row) =>
      row.provisionRenditionId !== "rendition-b");
    sourceDefect.provenanceRecords = sourceDefect.provenanceRecords.filter((row) =>
      row.provisionRenditionId !== "rendition-b");
    sourceDefect.auditRelationships = sourceDefect.auditRelationships.filter((row) =>
      row.toId !== "chunk-b");
    const report = await reconcileCorpusMigration({ db: d1 }, sourceDefect);
    assert.equal(report.status, "blocked");
    assert.equal(report.reconciliation.missingObjects.some((item) =>
      item.startsWith("source_sparse:")), true);
    assert.equal(report.reconciliation.extraObjects.some((item) =>
      item.startsWith("source_sparse:")), true);
    assert.equal(report.reconciliation.nonDisjointShardMembership.some((item) =>
      item.startsWith("source_release:")), true);
    assert.equal(report.reconciliation.missingProvenance.some((item) =>
      item.includes("missing-capture")), true);
    assert.equal(report.reconciliation.missingProvenance.some((item) =>
      item.startsWith("authority_evidence_revision")), false);
    for (const prefix of ["applicability_evidence_rendition", "provenance_record_rendition",
      "audit_relationship_chunk"]) {
      assert.equal(report.reconciliation.missingProvenance.some((item) =>
        item.startsWith(prefix)), true, prefix);
    }
  } finally {
    sqlite.close();
  }
});

test("contradictory authority and applicability attestations block reconciliation", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const inventory = await withPreparedTarget(representativeInventory());
    inventory.runId = "reconciliation-contradictory-attestations-v1";
    inventory.authorityEvidenceRecords[0] = {
      ...inventory.authorityEvidenceRecords[0]!,
      textualAuthority: "official_translation",
    };
    inventory.authorityEvidenceRecords.push({
      ...inventory.authorityEvidenceRecords[1]!,
      sourceId: "authority-extra-misbinding",
      authorityEvidenceId: "authority-extra-misbinding",
      textRevisionId: "revision-b-1",
    });
    inventory.applicabilityEvidenceRecords[0] = {
      ...inventory.applicabilityEvidenceRecords[0]!,
      applicabilityIdentity: "2026-01-01T00:00:00.000Z/",
    };

    const report = await reconcileCorpusMigration({ db: d1 }, inventory);
    assert.equal(report.status, "blocked");
    assert.equal(report.reconciliation.metadataMismatches.some((item) =>
      item.startsWith("authority_evidence_fact:")), true);
    assert.equal(report.reconciliation.metadataMismatches.some((item) =>
      item.startsWith("applicability_evidence_fact:")), true);
  } finally {
    sqlite.close();
  }
});

test("distinct Provision Concepts cannot collapse even when every rendition field and byte is identical", async () => {
  const inventory = representativeInventory();
  inventory.provisionRenditions.push({
    ...inventory.provisionRenditions[0]!,
    sourceId: "rendition-distinct-concept",
    provisionRenditionId: "rendition-distinct-concept",
    provisionConceptId: "concept-distinct-same-wording",
    publisherConceptToken: "concept-token-distinct-same-wording",
  });

  const prepared = await prepareCorpusMigrationProjections(inventory);
  assert.equal(prepared.canonicalObjects.filter((row) =>
    row.kind === "provision_concept").length, 4);
  assert.equal(prepared.canonicalObjects.filter((row) =>
    row.kind === "provision_rendition").length, 5);
});

test("every rendition requires a versioned attested semantic fingerprint", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const inventory = representativeInventory();
    delete (inventory.provisionRenditions[0] as Partial<
      CorpusMigrationInventory["provisionRenditions"][number]
    >).semanticFingerprint;
    await assert.rejects(
      () => reconcileCorpusMigration({ db: d1 }, inventory),
      /semanticFingerprint/u,
    );
  } finally {
    sqlite.close();
  }
});

test("projection preparation keeps technically eligible current chunks whose textual authority is unknown", async () => {
  const inventory = representativeInventory();
  inventory.normalizedRevisions[4] = {
    ...inventory.normalizedRevisions[4]!,
    textualAuthority: "unknown",
  };
  inventory.provisionRenditions[4] = {
    ...inventory.provisionRenditions[4]!,
    textualAuthority: "unknown",
  };
  inventory.authorityEvidenceRecords[4] = {
    ...inventory.authorityEvidenceRecords[4]!,
    textualAuthority: "unknown",
  };

  const prepared = await prepareCorpusMigrationProjections(inventory);
  assert.equal(prepared.releaseItems.length, 4);
  assert.equal(prepared.sparsePostings.length, 4);
  assert.equal(prepared.denseCandidates.length, 4);
});

test("projection preparation excludes chunks whose authority evidence hash is invalid", async () => {
  const inventory = representativeInventory();
  inventory.authorityEvidenceRecords[4] = {
    ...inventory.authorityEvidenceRecords[4]!,
    sha256: hash("9"),
  };

  const prepared = await prepareCorpusMigrationProjections(inventory);
  assert.equal(prepared.releaseItems.length, 3);
  assert.equal(prepared.sparsePostings.length, 3);
  assert.equal(prepared.denseCandidates.length, 3);
});

test("projection preparation excludes chunks whose authority evidence is contradictory", async () => {
  const inventory = representativeInventory();
  inventory.authorityEvidenceRecords.push({
    ...inventory.authorityEvidenceRecords[4]!,
    sourceId: "authority-b-conflict",
    authorityEvidenceId: "authority-b-conflict",
    textualAuthority: "official_translation",
  });

  const prepared = await prepareCorpusMigrationProjections(inventory);
  assert.equal(prepared.releaseItems.length, 3);
  assert.equal(prepared.sparsePostings.length, 3);
  assert.equal(prepared.denseCandidates.length, 3);
});

test("adding exact retry aliases cannot change canonical legal metadata hashes", async () => {
  const baseline = await prepareCorpusMigrationProjections(representativeInventory());
  const retried = representativeInventory();
  retried.normalizedRevisions.push({
    ...retried.normalizedRevisions[0]!,
    sourceId: "000-exact-revision-retry",
    textRevisionId: "revision-a-1-second-retry",
    captureIds: ["capture-a-1-retry"],
  });
  retried.provisionRenditions.push({
    ...retried.provisionRenditions[0]!,
    sourceId: "000-exact-rendition-retry",
    provisionRenditionId: "rendition-a-old-second-retry",
    provisionConceptId: "concept-a-old-route-alias",
    textRevisionId: "revision-a-1-second-retry",
  });

  const afterRetry = await prepareCorpusMigrationProjections(retried);
  const canonicalLegalMetadata = (rows: typeof baseline.canonicalObjects) => rows
    .filter((row) => ["normalized_revision", "provision_concept", "provision_rendition"]
      .includes(row.kind))
    .map((row) => ({
      kind: row.kind,
      canonicalIdentity: row.canonicalIdentity,
      sha256: row.sha256,
      metadataSha256: row.metadataSha256,
    }));
  assert.deepEqual(canonicalLegalMetadata(afterRetry.canonicalObjects),
    canonicalLegalMetadata(baseline.canonicalObjects));
});

test("conflicting semantic fingerprints on exact rendition aliases block reconciliation", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const inventory = representativeInventory();
    inventory.runId = "reconciliation-conflicting-fingerprint-v1";
    inventory.provisionRenditions[1] = {
      ...inventory.provisionRenditions[1]!,
      semanticFingerprint: `legal-semantic-v1:${hash("8")}`,
    };
    const prepared = await withPreparedTarget(inventory);
    const report = await reconcileCorpusMigration({ db: d1 }, prepared);
    assert.equal(report.status, "blocked");
    assert.equal(report.reconciliation.metadataMismatches.some((item) =>
      item.startsWith("provision_rendition_semantic_fingerprint:")), true);
  } finally {
    sqlite.close();
  }
});

test("reconciliation is deterministic, idempotent, persisted, and resumes after a partial failure", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const inventory = await withPreparedTarget(representativeInventory());
    await assert.rejects(
      () => reconcileCorpusMigration({ db: d1 }, inventory, {
        failAfterPhase: "canonicalized",
      }),
      (error: unknown) => error instanceof MigrationReconciliationError
        && error.code === "MIGRATION_RECONCILIATION_INTERRUPTED",
    );
    const resumed = await reconcileCorpusMigration({ db: d1 }, inventory);
    const repeated = await reconcileCorpusMigration({ db: d1 }, inventory);
    assert.equal(resumed.status, "clean");
    assert.equal(resumed.inputSha256, repeated.inputSha256);
    assert.equal(resumed.reportSha256, repeated.reportSha256);
    assert.equal(resumed.restart.idempotent, true);
    assert.equal(resumed.restart.resumedAfterPartialFailure, true);
    assert.equal((sqlite.prepare(`SELECT count(*) AS count FROM legal_migration_reconciliation_reports
      WHERE run_id=?`).get(inventory.runId) as { count: number }).count, 1);
  } finally {
    sqlite.close();
  }
});
