import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptedProductionCurrentPlanItems,
  readAcceptedProductionCurrentMetadata,
} from "../lib/legal-corpus/accepted-current-inputs";
import { customCurrentSha256 } from "../lib/legal-corpus/custom-current-build";

const digest = (value: string) => value.repeat(64);
const accepted = {
  legacyRenditionId: "rendition:fixture",
  sourceId: "source:fixture",
  legalIdentitySha256: digest("a"),
  contentSha256: digest("b"),
  provision: { key: "corpus/provision.json", sha256: digest("c"), sizeBytes: 123, envelope: true },
  normalized: { key: "corpus/normalized.json", sha256: digest("d"), sizeBytes: 45 },
  chunks: [{ ordinal: 0, officialTextSha256: digest("e"), inputSha256: digest("f"), inputTokens: 12 }],
};

test("production metadata joins an accepted page without a staging database binding", () => {
  const metadata = { schemaVersion: 1, kind: "production-current-body-free-metadata-page",
    sourceRootSha256: digest("1"), acceptedInputManifestSha256: digest("2"),
    sourcePlanManifestSha256: digest("3"), start: 0,
    items: [{ sourceOrdinal: 0, sourceId: accepted.sourceId,
      snapshotProvisionId: "snapshot-provision:fixture", provisionRenditionId: accepted.legacyRenditionId,
      language: "en", validFrom: "2026-01-01T00:00:00.000Z", validTo: null,
      articleNumber: "1", articleTitle: "Scope", hierarchy: ["Part I"] }] };
  const page = { schemaVersion: 1, start: 0, items: [accepted] };
  assert.deepEqual(acceptedProductionCurrentPlanItems(metadata, page), [{
    planItem: { sourceOrdinal: 0, snapshotProvisionId: "snapshot-provision:fixture",
      provisionRenditionId: accepted.legacyRenditionId, evidenceR2Key: accepted.provision.key,
      evidenceByteCount: accepted.provision.sizeBytes, evidenceSha256: accepted.provision.sha256,
      language: "en", documentType: "unknown", validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null, accepted },
    acceptedMetadata: { articleNumber: "1", articleTitle: "Scope", hierarchy: ["Part I"] },
  }]);
  assert.throws(() => acceptedProductionCurrentPlanItems(metadata,
    { ...page, items: [{ ...accepted, sourceId: "source:changed" }] }), /PRODUCTION_METADATA_PAGE_MISMATCH/u);
});

test("production metadata reads only the accepted normalized title and preserves body-free article fields", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ documentTitle: "Accepted title", plainText: "not returned" }));
  const source = { ...accepted, normalized: { ...accepted.normalized,
    sha256: await customCurrentSha256(bytes), sizeBytes: bytes.byteLength } };
  const bucket = { get: async (key: string) => key === source.normalized.key
    ? { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } : null } as unknown as R2Bucket;
  assert.deepEqual(await readAcceptedProductionCurrentMetadata(source, bucket,
    { articleNumber: "1", articleTitle: null, hierarchy: ["Chapter A"] }), {
    documentTitle: "Accepted title", articleNumber: "1", articleTitle: null, hierarchy: ["Chapter A"],
  });
});
