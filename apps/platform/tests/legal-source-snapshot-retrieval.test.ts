import assert from "node:assert/strict";
import test from "node:test";

import { createSourceSnapshotPassageResolver } from "../lib/legal-corpus/source-snapshot-retrieval";
import { serializeNeutralSourceSnapshotChunk } from "../lib/legal-corpus/source-snapshot";

async function sha256(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return Buffer.from(await crypto.subtle.digest("SHA-256", owned.buffer)).toString("hex");
}

test("Source Snapshot hydration returns a neutral citation without textual-authority claims", async () => {
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
    sourceProvisionSha256: "a".repeat(64),
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
    }; } },
    bucket: { async get() { read = true; return null; } },
  });
  await assert.rejects(resolve("release:1", "chunk:1:0"), /SOURCE_SNAPSHOT_CANDIDATE_INELIGIBLE/u);
  assert.equal(read, false);
});
