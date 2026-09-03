import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCompleteCorpusRecords,
  assertCompleteCorpusCutoffEvidence,
  assertCompleteCorpusR2Readback,
  completeCorpusLegalIdentitySha256,
  completeCorpusPricing,
  completeCorpusPublisherRevisionToken,
  completeCorpusSourceLaneBounds,
  type CompleteCorpusAuditRecord,
} from "../lib/legal-corpus/complete-corpus-audit";

const baseRecord: CompleteCorpusAuditRecord = {
  sourceDatabaseId: "source-a",
  sourceProvisionId: "source-provision-1",
  publisherDocumentToken: "100",
  publisherRevisionToken: "2026-01-01T00:00:00.000Z",
  sourceDocumentTitle: "Employment code",
  documentType: "code",
  articleNumber: "1",
  articleTitle: "Scope",
  hierarchy: ["Part 1"],
  language: "en",
  script: "Latn",
  officialText: "This code applies to employment relationships.",
  officialTextSha256: "dd9ae1f6f1b902e9f42677414d68f77e767b47fdb92557e02a694331e3696dac",
  sequence: 0,
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: null,
  currentEligible: true,
  historicalEligible: true,
  temporalGap: false,
  rawObjectKey: "raw/100/1.html",
  normalizedObjectKey: "normalized/100/1.json",
};

test("complete-corpus source lanes cover numeric publisher tokens without overlap", () => {
  assert.deepEqual(completeCorpusSourceLaneBounds("1"), {
    lower: "lexuz-family:1",
    upper: "lexuz-family:2",
  });
  assert.deepEqual(completeCorpusSourceLaneBounds("9"), {
    lower: "lexuz-family:9",
    upper: "lexuz-family::",
  });
});

test("operational cutoff and R2 readback contracts fail closed on drift", () => {
  const expected = {
    expectedCutoff: "2026-08-31T06:26:27.2253695Z",
    actualCutoff: "2026-08-31T06:26:27.2253695Z",
    expectedBookmark: "bookmark-1",
    actualBookmark: "bookmark-1",
    expectedInventorySha256: "a".repeat(64),
    actualInventorySha256: "a".repeat(64),
  };
  assert.doesNotThrow(() => assertCompleteCorpusCutoffEvidence(expected));
  assert.throws(
    () => assertCompleteCorpusCutoffEvidence({ ...expected, actualBookmark: "bookmark-2" }),
    /COMPLETE_CORPUS_CUTOFF_EVIDENCE_MISMATCH/u,
  );
  assert.doesNotThrow(() => assertCompleteCorpusR2Readback({
    expectedByteCount: 12,
    actualByteCount: 12,
    expectedEtag: "b".repeat(32),
    actualMd5: "b".repeat(32),
  }));
  assert.throws(() => assertCompleteCorpusR2Readback({
    expectedByteCount: 12,
    actualByteCount: 11,
    expectedEtag: "b".repeat(32),
    actualMd5: "b".repeat(32),
  }), /COMPLETE_CORPUS_R2_READBACK_MISMATCH/u);
});

test("operational identities preserve distinct same-day publisher revisions", async () => {
  const firstRevision = completeCorpusPublisherRevisionToken({
    sourceVersionId: "version:2026-01-01:first",
    versionDate: "2026-01-01",
    versionNumber: 4,
  });
  const secondRevision = completeCorpusPublisherRevisionToken({
    sourceVersionId: "version:2026-01-01:second",
    versionDate: "2026-01-01",
    versionNumber: 4,
  });
  assert.notEqual(firstRevision, secondRevision);
  const identity = {
    publisherDocumentToken: "100",
    language: "ru" as const,
    articleNumber: "1",
    sequence: 0,
  };
  assert.notEqual(
    await completeCorpusLegalIdentitySha256({ ...identity, publisherRevisionToken: firstRevision }),
    await completeCorpusLegalIdentitySha256({ ...identity, publisherRevisionToken: secondRevision }),
  );
  assert.deepEqual(completeCorpusPricing(108_159_678, 0.065), {
    usdPerMillionTokens: 0.065,
    rawUsd: 7.03037907,
    authorizationMargin: 0.25,
    withAuthorizationMarginUsd: 8.7879738375,
  });
});

test("complete-corpus audit preserves legal variants while deduplicating exact inputs", async () => {
  const mirrored = { ...baseRecord, sourceDatabaseId: "source-b" };
  const distinctLegalProvision = {
    ...baseRecord,
    sourceProvisionId: "source-provision-2",
    publisherDocumentToken: "200",
    rawObjectKey: "raw/200/1.html",
    normalizedObjectKey: "normalized/200/1.json",
  };
  const first = await auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [distinctLegalProvision, mirrored, baseRecord],
    reusableArtifacts: [],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  });
  const second = await auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [baseRecord, mirrored, distinctLegalProvision],
    reusableArtifacts: [],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  });

  assert.equal(first.sourceRecords, 3);
  assert.equal(first.canonicalLegalRecords, 2);
  assert.equal(first.sourceCaptureAliases, 1);
  assert.equal(first.retrievalChunks, 2);
  assert.equal(first.distinctStructuredInputs, 1);
  assert.equal(first.duplicateStructuredInputs, 1);
  assert.equal(first.uniqueMissingInputs, 1);
  assert.equal(first.manyChunkToInputMappings, 2);
  assert.equal(first.inventorySha256, second.inventorySha256);
  assert.equal(first.inputManifestSha256, second.inputManifestSha256);
  assert.equal(first.mappingManifestSha256, second.mappingManifestSha256);
});

test("complete-corpus audit excludes temporal gaps and counts only verified reuse", async () => {
  const baseline = await auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [baseRecord],
    reusableArtifacts: [],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  });
  const inputSha256 = baseline.inputs[0]!.inputSha256;
  const result = await auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [baseRecord, {
      ...baseRecord,
      sourceProvisionId: "gap",
      sequence: 1,
      articleNumber: "2",
      validFrom: null,
      currentEligible: false,
      historicalEligible: false,
      temporalGap: true,
    }],
    reusableArtifacts: [{
      provider: "openai",
      model: "text-embedding-3-large",
      dimensions: 1_536,
      inputVersion: "legal-embedding-input-v1",
      transformVersion: "float32-l2-v1",
      inputSha256,
      byteCount: 6_144,
      verified: true,
    }],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  });

  assert.equal(result.temporalGaps, 1);
  assert.equal(result.retrievalChunks, 1);
  assert.equal(result.verifiedReusableInputs, 1);
  assert.equal(result.uniqueMissingInputs, 0);
  assert.equal(result.exactMissingTokens, 0);
  assert.equal(result.costs.batch.rawUsd, 0);
  assert.equal(result.costs.standard.withAuthorizationMarginUsd, 0);
});

test("complete-corpus audit rejects conflicting mirrors and unverifiable reuse", async () => {
  await assert.rejects(() => auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [baseRecord, {
      ...baseRecord,
      sourceDatabaseId: "source-b",
      articleTitle: "Conflicting metadata under the same legal identity",
    }],
    reusableArtifacts: [],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  }), /COMPLETE_CORPUS_CANONICAL_CONFLICT/u);

  await assert.rejects(() => auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [baseRecord],
    reusableArtifacts: [{
      provider: "openai",
      model: "text-embedding-3-large",
      dimensions: 1_536,
      inputVersion: "legal-embedding-input-v1",
      transformVersion: "float32-l2-v1",
      inputSha256: "0".repeat(64),
      byteCount: 6_144,
      verified: false,
    }],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  }), /COMPLETE_CORPUS_REUSABLE_ARTIFACT_UNVERIFIED/u);
});

test("complete-corpus audit preserves source article titles above the prototype guard", async () => {
  const articleTitle = "A".repeat(11_545);
  const result = await auditCompleteCorpusRecords({
    cutoff: "2026-02-01T00:00:00.000Z",
    records: [{ ...baseRecord, articleTitle }],
    reusableArtifacts: [],
    batchPriceUsdPerMillionTokens: 0.065,
    standardPriceUsdPerMillionTokens: 0.13,
  });

  assert.equal(result.retrievalChunks, 1);
  assert.ok(result.inputs[0]!.tokens > 0);
  assert.ok(result.inputs[0]!.tokens <= 8_192);
});
