import assert from "node:assert/strict";
import test from "node:test";

import { acceptedHistoricalPlanItems, readAcceptedHistoricalMetadata }
  from "../lib/legal-corpus/accepted-current-inputs";
import { customCurrentSha256, materializeCustomCurrentItem }
  from "../lib/legal-corpus/custom-current-build";
import { buildRetrievalChunks, serializeCustomEmbeddingInput }
  from "../lib/legal-corpus/custom-hybrid-index";

const digest = (character: string) => character.repeat(64);

function source(overrides: Record<string, unknown> = {}) {
  return {
    legacyRenditionId: "rendition:history:1",
    sourceId: "source:history:1",
    legalIdentitySha256: digest("a"),
    contentSha256: digest("b"),
    snapshotProvisionId: `audit:${digest("a")}`,
    language: "ru",
    validFrom: "1992-12-08T00:00:00.000Z",
    validTo: "1993-01-01T00:00:00.000Z",
    provision: { key: "complete/provision/1", sha256: digest("c"), sizeBytes: 30, envelope: false },
    normalized: { key: "complete/normalized/1", sha256: digest("d"), sizeBytes: 40 },
    chunks: [{ ordinal: 0, officialTextSha256: digest("e"), inputSha256: digest("f"), inputTokens: 25 }],
    ...overrides,
  };
}

test("historical accepted pages preserve audit identities and finite applicability", () => {
  const items = acceptedHistoricalPlanItems({ schemaVersion: 1, start: 1_000_000,
    items: [source()] });
  assert.deepEqual(items.map(item => ({ ordinal: item.sourceOrdinal,
    snapshotProvisionId: item.snapshotProvisionId, validFrom: item.validFrom,
    validTo: item.validTo, documentType: item.documentType,
    acceptedKeys: Object.keys(item.accepted).sort() })), [{
    ordinal: 1_000_000,
    snapshotProvisionId: `audit:${digest("a")}`,
    validFrom: "1992-12-08T00:00:00.000Z",
    validTo: "1993-01-01T00:00:00.000Z",
    documentType: "unknown",
    acceptedKeys: ["chunks", "contentSha256", "legacyRenditionId", "legalIdentitySha256",
      "normalized", "provision", "sourceId"],
  }]);
});

test("historical accepted pages reject temporal gaps and unbound audit identities", () => {
  assert.throws(() => acceptedHistoricalPlanItems({ schemaVersion: 1, start: 0,
    items: [source({ validFrom: null })] }));
  assert.throws(() => acceptedHistoricalPlanItems({ schemaVersion: 1, start: 0,
    items: [source({ snapshotProvisionId: "snapshot:mutable" })] }));
});

test("historical planner output satisfies the strict shared materializer contract", async () => {
  const officialText = "Audited historical provision.";
  const evidenceBytes = new TextEncoder().encode(officialText);
  const metadata = { documentTitle: "Accepted historical title", articleNumber: "1",
    articleTitle: null, hierarchy: ["Part one"] };
  const chunks = await buildRetrievalChunks({ snapshotProvisionId: `audit:${digest("a")}`,
    sourceDocumentTitle: metadata.documentTitle, documentType: "unknown",
    articleNumber: metadata.articleNumber, articleTitle: null, hierarchy: metadata.hierarchy,
    language: "ru", script: "Cyrl", officialText, validFromEpoch: 724_204_800,
    validToEpoch: 725_846_400 }, { targetTokens: 512 });
  const acceptedChunks = await Promise.all(chunks.map(async chunk => ({ ordinal: chunk.ordinal,
    officialTextSha256: await customCurrentSha256(chunk.officialText),
    inputSha256: await customCurrentSha256(serializeCustomEmbeddingInput(chunk)),
    inputTokens: chunk.embeddingTokenCount })));
  const [planItem] = acceptedHistoricalPlanItems({ schemaVersion: 1, start: 0,
    items: [source({ contentSha256: await customCurrentSha256(officialText),
      provision: { key: "complete/provision/1", sha256: await customCurrentSha256(evidenceBytes),
        sizeBytes: evidenceBytes.byteLength, envelope: false }, chunks: acceptedChunks })] });
  const materialized = await materializeCustomCurrentItem({
    releaseId: "release:staging:history:custom-v1:2026-09-06",
    segmentId: "history-base-v1", planItem: planItem!, evidenceBytes,
    acceptedMetadata: metadata,
  });
  assert.equal(materialized.chunks.length, 1);
  assert.equal(materialized.chunks[0]?.snapshotProvisionId, `audit:${digest("a")}`);
  assert.equal(materialized.documentFieldLengths[0]?.segmentId, "history-base-v1");
});

test("historical metadata batches one immutable source query and uses the accepted title map", async () => {
  let calls = 0;
  const db = { prepare(sql: string) { assert.match(sql, /WHERE id IN \(\?,\?\)/u); return {
    bind(...ids: string[]) { assert.deepEqual(ids, ["source:history:1", "source:history:2"]); return {
      async all() { calls++; return { results: [
        { id: ids[0], articleNumber: " 1 ", articleNumberNormalized: null, articleTitle: "A",
          part: "Part", chapter: null, section: "Section", sequence: 1 },
        { id: ids[1], articleNumber: null, articleNumberNormalized: null, articleTitle: null,
          part: null, chapter: null, section: null, sequence: 2 },
      ] }; },
    }; },
  }; } } as unknown as D1Database;
  const sources = [source(), source({ legacyRenditionId: "rendition:history:2",
    sourceId: "source:history:2", legalIdentitySha256: digest("1"),
    snapshotProvisionId: `audit:${digest("1")}`, normalized: {
      key: "complete/normalized/2", sha256: digest("2"), sizeBytes: 50,
    } })];
  const metadata = await readAcceptedHistoricalMetadata(sources as never,
    new Map([[digest("d"), "Accepted title"], [digest("2"), "Second title"]]), db);
  assert.equal(calls, 1);
  assert.deepEqual(metadata.get("source:history:1"), { documentTitle: "Accepted title",
    articleNumber: "1", articleTitle: "A", hierarchy: ["Part", "Section"] });
  assert.equal(metadata.get("source:history:2")?.articleNumber, "unnumbered-2");
  await assert.rejects(() => readAcceptedHistoricalMetadata(sources as never, new Map(), db),
    /CUSTOM_HISTORY_METADATA_SOURCE_INVALID/u);
});
