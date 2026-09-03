import { z } from "zod";

import {
  buildRetrievalChunks,
  CUSTOM_EMBEDDING_DIMENSIONS,
  CUSTOM_EMBEDDING_INPUT_VERSION,
  CUSTOM_EMBEDDING_MODEL,
  CUSTOM_EMBEDDING_TRANSFORM_VERSION,
  CUSTOM_RETRIEVAL_CHUNK_POLICY_VERSION,
  serializeCustomEmbeddingInput,
} from "./custom-hybrid-index";
import { stableSourceSnapshotJson } from "./source-snapshot";
import { legalLanguageSchema, legalScriptSchema } from "./target-domain-schemas";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });

const auditRecordSchema = z.object({
  sourceDatabaseId: z.string().min(1).max(100),
  sourceProvisionId: z.string().min(1).max(300),
  publisherDocumentToken: z.string().min(1).max(300),
  publisherRevisionToken: z.string().min(1).max(300),
  sourceDocumentTitle: z.string().min(1).max(2_000),
  documentType: z.string().min(1).max(300),
  articleNumber: z.string().min(1).max(300),
  articleTitle: z.string().min(1).max(16_000).nullable(),
  hierarchy: z.array(z.string().min(1).max(1_000)).max(24),
  language: legalLanguageSchema,
  script: legalScriptSchema,
  officialText: z.string().min(1),
  officialTextSha256: sha256Schema,
  sequence: z.number().int().nonnegative(),
  validFrom: instantSchema.nullable(),
  validTo: instantSchema.nullable(),
  currentEligible: z.boolean(),
  historicalEligible: z.boolean(),
  temporalGap: z.boolean(),
  rawObjectKey: z.string().min(1).max(1_024),
  normalizedObjectKey: z.string().min(1).max(1_024),
}).strict().superRefine((value, context) => {
  if (value.temporalGap === (value.validFrom !== null)) {
    context.addIssue({ code: "custom", message: "Temporal gap and applicability disagree" });
  }
  if (value.historicalEligible && value.validFrom === null) {
    context.addIssue({ code: "custom", message: "Historical eligibility requires valid_from" });
  }
  if (value.validFrom && value.validTo && value.validTo <= value.validFrom) {
    context.addIssue({ code: "custom", message: "Applicability interval must be half-open" });
  }
});

export type CompleteCorpusAuditRecord = z.input<typeof auditRecordSchema>;

const reusableArtifactSchema = z.object({
  provider: z.literal("openai"),
  model: z.literal(CUSTOM_EMBEDDING_MODEL),
  dimensions: z.literal(CUSTOM_EMBEDDING_DIMENSIONS),
  inputVersion: z.literal(CUSTOM_EMBEDDING_INPUT_VERSION),
  transformVersion: z.literal(CUSTOM_EMBEDDING_TRANSFORM_VERSION),
  inputSha256: sha256Schema,
  byteCount: z.literal(CUSTOM_EMBEDDING_DIMENSIONS * 4),
  verified: z.boolean(),
}).strict();

export type CompleteCorpusReusableArtifact = z.input<typeof reusableArtifactSchema>;

const encoder = new TextEncoder();

export function completeCorpusSourceLaneBounds(lane: string): { lower: string; upper: string } {
  if (!/^[1-9]$/u.test(lane)) throw new TypeError("COMPLETE_CORPUS_SOURCE_LANE_INVALID");
  return {
    lower: `lexuz-family:${lane}`,
    upper: lane === "9" ? "lexuz-family::" : `lexuz-family:${Number(lane) + 1}`,
  };
}

export async function completeCorpusSha256(value: string | Uint8Array): Promise<string> {
  const source = typeof value === "string" ? encoder.encode(value) : value;
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function assertCompleteCorpusCutoffEvidence(input: {
  expectedCutoff: string;
  actualCutoff: string;
  expectedBookmark: string;
  actualBookmark: string;
  expectedInventorySha256: string;
  actualInventorySha256: string;
}): void {
  if (input.actualCutoff !== input.expectedCutoff
    || input.actualBookmark !== input.expectedBookmark
    || input.actualInventorySha256 !== input.expectedInventorySha256
    || !sha256Schema.safeParse(input.actualInventorySha256).success) {
    throw new TypeError("COMPLETE_CORPUS_CUTOFF_EVIDENCE_MISMATCH");
  }
}

export function assertCompleteCorpusR2Readback(input: {
  expectedByteCount: number;
  actualByteCount: number;
  expectedEtag: string;
  actualMd5: string;
}): void {
  if (!Number.isSafeInteger(input.expectedByteCount) || input.expectedByteCount < 1
    || input.actualByteCount !== input.expectedByteCount
    || !/^[a-f0-9]{32}$/u.test(input.expectedEtag)
    || input.actualMd5 !== input.expectedEtag) {
    throw new TypeError("COMPLETE_CORPUS_R2_READBACK_MISMATCH");
  }
}

export function completeCorpusPublisherRevisionToken(input: {
  sourceVersionId: string;
  versionDate: string | null;
  versionNumber: number;
}): string {
  if (!input.sourceVersionId || !Number.isSafeInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new TypeError("COMPLETE_CORPUS_PUBLISHER_REVISION_INVALID");
  }
  return stableSourceSnapshotJson({
    sourceVersionId: input.sourceVersionId,
    versionDate: input.versionDate,
    versionNumber: input.versionNumber,
  });
}

export async function completeCorpusLegalIdentitySha256(input: {
  publisherDocumentToken: string;
  publisherRevisionToken: string;
  language: string;
  articleNumber: string;
  sequence: number;
}): Promise<string> {
  return completeCorpusSha256(stableSourceSnapshotJson(input));
}

function percentile(values: readonly number[], percentage: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentage) - 1)]!;
}

function epoch(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) throw new TypeError("COMPLETE_CORPUS_APPLICABILITY_INVALID");
  return Math.floor(parsed / 1_000);
}

export function completeCorpusPricing(tokens: number, usdPerMillionTokens: number) {
  if (!Number.isSafeInteger(tokens) || tokens < 0
    || !Number.isFinite(usdPerMillionTokens) || usdPerMillionTokens < 0) {
    throw new TypeError("COMPLETE_CORPUS_PRICE_INPUT_INVALID");
  }
  const rawUsd = Number((tokens / 1_000_000 * usdPerMillionTokens).toFixed(12));
  return {
    usdPerMillionTokens,
    rawUsd,
    authorizationMargin: 0.25,
    withAuthorizationMarginUsd: Number((rawUsd * 1.25).toFixed(12)),
  };
}

type CanonicalRecord = {
  legalIdentitySha256: string;
  record: z.output<typeof auditRecordSchema>;
  sourceCount: number;
};

export type CompleteCorpusAudit = Awaited<ReturnType<typeof auditCompleteCorpusRecords>>;

export async function auditCompleteCorpusRecords(input: {
  cutoff: string;
  records: readonly CompleteCorpusAuditRecord[];
  reusableArtifacts: readonly CompleteCorpusReusableArtifact[];
  batchPriceUsdPerMillionTokens: number;
  standardPriceUsdPerMillionTokens: number;
}) {
  const cutoff = instantSchema.parse(input.cutoff);
  const records = input.records.map((record) => auditRecordSchema.parse(record));
  const artifacts = input.reusableArtifacts.map((artifact) => reusableArtifactSchema.parse(artifact));
  if (artifacts.some((artifact) => !artifact.verified)) {
    throw new TypeError("COMPLETE_CORPUS_REUSABLE_ARTIFACT_UNVERIFIED");
  }

  const canonicalRecords = new Map<string, CanonicalRecord>();
  const sourceInventory: Array<Record<string, unknown>> = [];
  for (const record of records) {
    if (await completeCorpusSha256(record.officialText) !== record.officialTextSha256) {
      throw new TypeError("COMPLETE_CORPUS_SOURCE_HASH_MISMATCH");
    }
    const legalIdentity = {
      publisherDocumentToken: record.publisherDocumentToken,
      publisherRevisionToken: record.publisherRevisionToken,
      language: record.language,
      sequence: record.sequence,
      articleNumber: record.articleNumber,
    };
    const legalIdentitySha256 = await completeCorpusLegalIdentitySha256(legalIdentity);
    const materialIdentity = stableSourceSnapshotJson({
      ...legalIdentity,
      articleTitle: record.articleTitle,
      documentType: record.documentType,
      hierarchy: record.hierarchy,
      normalizedObjectKey: record.normalizedObjectKey,
      officialTextSha256: record.officialTextSha256,
      rawObjectKey: record.rawObjectKey,
      sourceDocumentTitle: record.sourceDocumentTitle,
      validFrom: record.validFrom,
      validTo: record.validTo,
    });
    const existing = canonicalRecords.get(legalIdentitySha256);
    if (existing) {
      const existingMaterial = stableSourceSnapshotJson({
        publisherDocumentToken: existing.record.publisherDocumentToken,
        publisherRevisionToken: existing.record.publisherRevisionToken,
        language: existing.record.language,
        sequence: existing.record.sequence,
        articleNumber: existing.record.articleNumber,
        articleTitle: existing.record.articleTitle,
        documentType: existing.record.documentType,
        hierarchy: existing.record.hierarchy,
        normalizedObjectKey: existing.record.normalizedObjectKey,
        officialTextSha256: existing.record.officialTextSha256,
        rawObjectKey: existing.record.rawObjectKey,
        sourceDocumentTitle: existing.record.sourceDocumentTitle,
        validFrom: existing.record.validFrom,
        validTo: existing.record.validTo,
      });
      if (existingMaterial !== materialIdentity || existing.record.officialText !== record.officialText) {
        throw new TypeError("COMPLETE_CORPUS_CANONICAL_CONFLICT");
      }
      existing.sourceCount += 1;
      existing.record.currentEligible ||= record.currentEligible;
      existing.record.historicalEligible ||= record.historicalEligible;
    } else {
      canonicalRecords.set(legalIdentitySha256, { legalIdentitySha256, record, sourceCount: 1 });
    }
    sourceInventory.push({
      legalIdentitySha256,
      sourceDatabaseId: record.sourceDatabaseId,
      sourceProvisionIdentitySha256: await completeCorpusSha256(record.sourceProvisionId),
      officialTextSha256: record.officialTextSha256,
      temporalGap: record.temporalGap,
    });
  }

  const canonical = [...canonicalRecords.values()]
    .sort((left, right) => left.legalIdentitySha256.localeCompare(right.legalIdentitySha256));
  const inputMap = new Map<string, { inputSha256: string; tokens: number; chunkCount: number }>();
  const mappings: Array<{ chunkId: string; inputSha256: string; legalIdentitySha256: string }> = [];
  let retrievalChunks = 0;
  for (const item of canonical) {
    if (item.record.temporalGap) continue;
    const validFromEpoch = epoch(item.record.validFrom);
    if (validFromEpoch === null) throw new TypeError("COMPLETE_CORPUS_APPLICABILITY_REQUIRED");
    const chunks = await buildRetrievalChunks({
      snapshotProvisionId: `audit:${item.legalIdentitySha256}`,
      sourceDocumentTitle: item.record.sourceDocumentTitle,
      documentType: item.record.documentType,
      articleNumber: item.record.articleNumber,
      articleTitle: item.record.articleTitle,
      hierarchy: item.record.hierarchy,
      language: item.record.language,
      script: item.record.script,
      officialText: item.record.officialText,
      validFromEpoch,
      validToEpoch: epoch(item.record.validTo),
    }, { targetTokens: 512 });
    retrievalChunks += chunks.length;
    for (const chunk of chunks) {
      const structuredInput = serializeCustomEmbeddingInput(chunk);
      const inputSha256 = await completeCorpusSha256(structuredInput);
      const existing = inputMap.get(inputSha256);
      if (existing && existing.tokens !== chunk.embeddingTokenCount) {
        throw new TypeError("COMPLETE_CORPUS_INPUT_TOKEN_CONFLICT");
      }
      inputMap.set(inputSha256, {
        inputSha256,
        tokens: chunk.embeddingTokenCount,
        chunkCount: (existing?.chunkCount ?? 0) + 1,
      });
      mappings.push({ chunkId: chunk.id, inputSha256, legalIdentitySha256: item.legalIdentitySha256 });
    }
  }

  const reusableInputs = new Set(artifacts.map((artifact) => artifact.inputSha256));
  const inputs = [...inputMap.values()].sort((left, right) => left.inputSha256.localeCompare(right.inputSha256));
  const missingInputs = inputs.filter((item) => !reusableInputs.has(item.inputSha256));
  const missingTokens = missingInputs.map((item) => item.tokens);
  let minimumMissingTokens = 0;
  let maximumMissingTokens = 0;
  let exactMissingTokens = 0;
  for (const tokenCount of missingTokens) {
    exactMissingTokens += tokenCount;
    if (minimumMissingTokens === 0 || tokenCount < minimumMissingTokens) minimumMissingTokens = tokenCount;
    if (tokenCount > maximumMissingTokens) maximumMissingTokens = tokenCount;
  }
  const sortedSourceInventory = sourceInventory.sort((left, right) =>
    stableSourceSnapshotJson(left).localeCompare(stableSourceSnapshotJson(right)));
  const sortedMappings = mappings.sort((left, right) => left.chunkId.localeCompare(right.chunkId));

  return {
    schemaVersion: 1 as const,
    cutoff,
    contracts: {
      chunkPolicy: CUSTOM_RETRIEVAL_CHUNK_POLICY_VERSION,
      targetTokens: 512 as const,
      overlapTokens: 0 as const,
      provider: "openai" as const,
      model: CUSTOM_EMBEDDING_MODEL,
      dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      inputVersion: CUSTOM_EMBEDDING_INPUT_VERSION,
      transformVersion: CUSTOM_EMBEDDING_TRANSFORM_VERSION,
      tokenizer: "cl100k_base:gpt-tokenizer@4.0.0" as const,
    },
    sourceRecords: records.length,
    canonicalLegalRecords: canonical.length,
    sourceCaptureAliases: records.length - canonical.length,
    currentCanonicalRecords: canonical.filter((item) => item.record.currentEligible).length,
    historicalCanonicalRecords: canonical.filter((item) => item.record.historicalEligible).length,
    temporalGaps: canonical.filter((item) => item.record.temporalGap).length,
    retrievalChunks,
    distinctStructuredInputs: inputs.length,
    duplicateStructuredInputs: retrievalChunks - inputs.length,
    manyChunkToInputMappings: mappings.length,
    verifiedReusableInputs: inputs.filter((item) => reusableInputs.has(item.inputSha256)).length,
    uniqueMissingInputs: missingInputs.length,
    exactMissingTokens,
    tokenDistribution: {
      minimum: minimumMissingTokens,
      p50: percentile(missingTokens, 0.5),
      p95: percentile(missingTokens, 0.95),
      maximum: maximumMissingTokens,
    },
    costs: {
      batch: completeCorpusPricing(exactMissingTokens, input.batchPriceUsdPerMillionTokens),
      standard: completeCorpusPricing(exactMissingTokens, input.standardPriceUsdPerMillionTokens),
    },
    inventorySha256: await completeCorpusSha256(stableSourceSnapshotJson(sortedSourceInventory)),
    canonicalManifestSha256: await completeCorpusSha256(stableSourceSnapshotJson(canonical.map((item) => ({
      legalIdentitySha256: item.legalIdentitySha256,
      officialTextSha256: item.record.officialTextSha256,
      sourceCount: item.sourceCount,
      currentEligible: item.record.currentEligible,
      historicalEligible: item.record.historicalEligible,
      temporalGap: item.record.temporalGap,
    })))),
    inputManifestSha256: await completeCorpusSha256(stableSourceSnapshotJson(inputs)),
    mappingManifestSha256: await completeCorpusSha256(stableSourceSnapshotJson(sortedMappings)),
    inputs,
  };
}
