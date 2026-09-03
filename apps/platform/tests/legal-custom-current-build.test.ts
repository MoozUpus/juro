import assert from "node:assert/strict";
import test from "node:test";

import {
  customCurrentSha256,
  materializeCustomCurrentItem,
  partitionCustomBm25IntermediateRecords,
  serializeCustomCurrentArtifact,
} from "../lib/legal-corpus/custom-current-build";

const releaseId = "release:staging:current:custom-v1:2026-09-03";
const provision = {
  schemaVersion: 1,
  provisionRenditionId: "rendition:1",
  publisherInstrumentToken: "123",
  publisherProvisionToken: "article-1",
  languageTag: "ru",
  actTitle: "Трудовой кодекс",
  documentType: "Кодекс",
  articleNumber: "Статья 1",
  articleTitle: "Общие положения",
  provisionSequence: 1,
  provisionText: "Трудовые права защищаются законом.",
  sourceUrl: "https://lex.uz/docs/123",
  capturedAt: "2026-08-31T00:00:00.000Z",
  sourceNormalizedSha256: "b".repeat(64),
};

test("qualified evidence materializes deterministic chunk, dense and sparse inputs", async () => {
  const bytes = serializeCustomCurrentArtifact(provision);
  const planItem = {
    sourceOrdinal: 42,
    snapshotProvisionId: "snapshot-provision:1",
    provisionRenditionId: "rendition:1",
    evidenceR2Key: "corpus/provisions/revision/rendition.json",
    evidenceByteCount: bytes.byteLength,
    evidenceSha256: await customCurrentSha256(bytes),
    language: "ru" as const,
    documentType: "Кодекс",
    validFrom: "2020-01-01T00:00:00.000Z",
    validTo: null,
  };
  const first = await materializeCustomCurrentItem({ releaseId, planItem, evidenceBytes: bytes });
  const repeated = await materializeCustomCurrentItem({ releaseId, planItem, evidenceBytes: bytes });
  assert.deepEqual(repeated, first);
  assert.equal(first.chunks.length, 1);
  assert.equal(first.denseItems.length, first.chunks.length);
  assert.equal(first.documentFieldLengths[0]?.itemOrdinal, 42_000);
  assert.ok(first.sparseRecords.length > 0);
  assert.ok(first.sparseRecords.every((record) => !JSON.stringify(record).includes("Труд")));
  assert.deepEqual(Object.keys(first.denseItems[0]!.metadata).sort(), [
    "document_type", "item_key", "language", "release_id", "snapshot_provision_id",
    "valid_from_epoch", "valid_to_epoch",
  ]);
  assert.equal(first.denseItems[0]!.metadata.valid_to_epoch, 253_402_300_799);
  const partitions = partitionCustomBm25IntermediateRecords(first.sparseRecords);
  assert.deepEqual(Object.keys(partitions), "0123456789abcdef".split(""));
  assert.equal(Object.values(partitions).flat().length, first.sparseRecords.length);
  for (const [nibble, records] of Object.entries(partitions)) {
    assert.ok(records.every((record) => record.termHash.startsWith(nibble)));
  }
});

test("materialization rejects evidence byte, identity and metadata drift", async () => {
  const bytes = serializeCustomCurrentArtifact(provision);
  const base = {
    sourceOrdinal: 0,
    snapshotProvisionId: "snapshot-provision:1",
    provisionRenditionId: "rendition:1",
    evidenceR2Key: "corpus/provisions/revision/rendition.json",
    evidenceByteCount: bytes.byteLength,
    evidenceSha256: await customCurrentSha256(bytes),
    language: "ru" as const,
    documentType: "Кодекс",
    validFrom: "2020-01-01T00:00:00.000Z",
    validTo: null,
  };
  await assert.rejects(materializeCustomCurrentItem({
    releaseId, planItem: { ...base, evidenceSha256: "0".repeat(64) }, evidenceBytes: bytes,
  }), /CUSTOM_CURRENT_EVIDENCE_INTEGRITY_FAILED/u);
  await assert.rejects(materializeCustomCurrentItem({
    releaseId, planItem: { ...base, language: "en" }, evidenceBytes: bytes,
  }), /CUSTOM_CURRENT_EVIDENCE_IDENTITY_FAILED/u);
});
