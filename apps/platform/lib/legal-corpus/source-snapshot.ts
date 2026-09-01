import { z } from "zod";

import {
  legalEnvironmentSchema,
  legalLanguageSchema,
  searchReleaseIdSchema,
  sha256Schema,
  utcInstantSchema,
} from "./target-domain-schemas";

const identifierSchema = z.string().min(1).max(300);
const sourceUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && ["lex.uz", "www.lex.uz"].includes(url.hostname);
}, "Allowed official publisher URL required");

const sourceDocumentInputSchema = z.object({
  publisher: z.literal("lex.uz"),
  publisherDocumentToken: identifierSchema,
  languageTag: legalLanguageSchema,
  sourceUrl: sourceUrlSchema,
  legacyInstrumentId: identifierSchema.nullable(),
  legacyExpressionId: identifierSchema.nullable(),
}).strict();

const sourceSnapshotInputSchema = z.object({
  publisherDocumentToken: identifierSchema,
  publisherRevisionToken: z.string().min(1).max(200),
  languageTag: legalLanguageSchema,
  captureId: identifierSchema,
  capturedAt: utcInstantSchema,
  rawLocatorId: identifierSchema,
  rawR2Key: z.string().min(1).max(700),
  rawByteCount: z.number().int().positive(),
  rawSha256: sha256Schema,
  normalizedLocatorId: identifierSchema,
  normalizedR2Key: z.string().min(1).max(700),
  normalizedByteCount: z.number().int().positive(),
  normalizedSha256: sha256Schema,
  legacyTextRevisionId: identifierSchema,
  legacyTextualAuthority: z.enum(["controlling", "official_translation", "unknown"]),
}).strict();

const sourceSnapshotProvisionInputSchema = z.object({
  publisherDocumentToken: identifierSchema,
  legacyTextRevisionId: identifierSchema,
  legacyProvisionRenditionId: identifierSchema,
  sourcePositionToken: z.string().min(1).max(300),
  articleNumber: z.string().min(1).max(300),
  articleTitle: z.string().max(2_000).nullable(),
  sequence: z.number().int().nonnegative(),
  documentType: z.string().min(1).max(300),
  provisionText: z.string().trim().min(1),
  provisionLocatorId: identifierSchema,
  provisionR2Key: z.string().min(1).max(700),
  provisionByteCount: z.number().int().positive(),
  provisionSha256: sha256Schema,
  sourceNormalizedSha256: sha256Schema,
  sourceUrl: sourceUrlSchema,
  temporalState: z.enum(["current_supported", "unknown", "historical_only", "disputed"]),
  currentPointerVerified: z.boolean(),
  privacyClass: z.enum(["public_official_source", "private", "unknown"]),
  quarantined: z.boolean(),
  canonicalizationConflict: z.boolean(),
  legacyTextualAuthority: z.enum(["controlling", "official_translation", "unknown"]),
}).strict();

const quarantineInputSchema = z.object({
  publisherDocumentToken: identifierSchema,
  sourceVersionToken: identifierSchema,
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/u),
}).strict();

const aliasInputSchema = z.object({
  aliasIdentity: identifierSchema,
  canonicalIdentity: identifierSchema,
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/u),
}).strict();

const deferredInventoryInputSchema = z.object({
  kind: z.enum(["cutoff_deferred", "post_cutoff", "unresolved", "source_missing"]),
  count: z.number().int().nonnegative(),
  inventorySha256: sha256Schema,
}).strict();

const buildInputSchema = z.object({
  environment: legalEnvironmentSchema,
  cutoffAt: utcInstantSchema,
  releaseId: searchReleaseIdSchema,
  shardCount: z.number().int().min(1).max(99),
  configurationIdentity: identifierSchema,
  sourceDocuments: z.array(sourceDocumentInputSchema).min(1),
  snapshots: z.array(sourceSnapshotInputSchema),
  provisions: z.array(sourceSnapshotProvisionInputSchema),
  quarantines: z.array(quarantineInputSchema),
  aliases: z.array(aliasInputSchema),
  deferredInventories: z.array(deferredInventoryInputSchema),
}).strict();

export type SourceSnapshotBuildInput = z.input<typeof buildInputSchema>;

type PersistedRow = { identity: string; serialized: string };
type PersistedObject = { key: string; bytes: Uint8Array };

export type SourceSnapshotBuildStore = {
  completedIdentity(phase: string): Promise<string | null>;
  persistPhase(phase: string, identity: string): Promise<void>;
  persistRows(rows: readonly PersistedRow[]): Promise<void>;
  persistObjects(objects: readonly PersistedObject[]): Promise<void>;
};

export class SourceSnapshotBuildInterruptedError extends Error {
  constructor(readonly phase: "inventory" | "projections") {
    super(`SOURCE_SNAPSHOT_BUILD_INTERRUPTED:${phase}`);
    this.name = "SourceSnapshotBuildInterruptedError";
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${stable(value)}\n`);
}

export type NeutralSourceSnapshotChunk = {
  sourceDocumentId: string;
  sourceSnapshotId: string;
  snapshotProvisionId: string;
  canonicalChunkId: string;
  publisher: "lex.uz";
  publisherDocumentToken: string;
  publisherRevisionToken: string;
  languageTag: z.infer<typeof legalLanguageSchema>;
  sourceUrl: string;
  capturedAt: string;
  documentType: string;
  articleNumber: string;
  articleTitle: string | null;
  sequence: number;
  provisionText: string;
  sourceProvisionSha256: string;
  sourceNormalizedSha256: string;
};

export function serializeNeutralSourceSnapshotChunk(input: NeutralSourceSnapshotChunk): Uint8Array {
  return bytes({ schemaVersion: 1, ...input });
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const encoded = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function identity(prefix: string, value: string): Promise<string> {
  return `${prefix}:${await sha256(value)}`;
}

type RetrievalReasonCode =
  | "OFFICIAL_SOURCE_IDENTITY_UNSUPPORTED"
  | "D1_R2_INTEGRITY_UNVERIFIED"
  | "EXTRACTION_UNSUPPORTED"
  | "SNAPSHOT_IDENTITY_UNSTABLE"
  | "CURRENT_POINTER_UNVERIFIED"
  | "CURRENT_TEMPORAL_STATE_UNKNOWN"
  | "PRIVACY_CLASS_UNSUPPORTED"
  | "QUARANTINED"
  | "CANONICALIZATION_CONFLICT";

function eligibilityReasons(
  provision: z.infer<typeof sourceSnapshotProvisionInputSchema>,
  snapshotPresent: boolean,
): RetrievalReasonCode[] {
  const reasons: RetrievalReasonCode[] = [];
  const source = new URL(provision.sourceUrl);
  if (!["lex.uz", "www.lex.uz"].includes(source.hostname)) {
    reasons.push("OFFICIAL_SOURCE_IDENTITY_UNSUPPORTED");
  }
  if (provision.provisionByteCount < 1
    || !sha256Schema.safeParse(provision.provisionSha256).success
    || !sha256Schema.safeParse(provision.sourceNormalizedSha256).success) {
    reasons.push("D1_R2_INTEGRITY_UNVERIFIED");
  }
  if (!provision.provisionText.trim()) reasons.push("EXTRACTION_UNSUPPORTED");
  if (!snapshotPresent) reasons.push("SNAPSHOT_IDENTITY_UNSTABLE");
  if (!provision.currentPointerVerified) reasons.push("CURRENT_POINTER_UNVERIFIED");
  if (provision.temporalState !== "current_supported") {
    reasons.push("CURRENT_TEMPORAL_STATE_UNKNOWN");
  }
  if (provision.privacyClass !== "public_official_source") {
    reasons.push("PRIVACY_CLASS_UNSUPPORTED");
  }
  if (provision.quarantined) reasons.push("QUARANTINED");
  if (provision.canonicalizationConflict) reasons.push("CANONICALIZATION_CONFLICT");
  return reasons;
}

export type SourceSnapshotProjectionPlan = Awaited<ReturnType<typeof buildSourceSnapshotProjectionPlan>>;

export async function buildSourceSnapshotProjectionPlan(untrustedInput: SourceSnapshotBuildInput) {
  const input = buildInputSchema.parse(untrustedInput);
  const sourceDocuments = await Promise.all([...input.sourceDocuments]
    .sort((left, right) => left.publisherDocumentToken.localeCompare(right.publisherDocumentToken))
    .map(async (document) => ({
      id: await identity("source-document", [document.publisher, document.publisherDocumentToken,
        document.languageTag, document.sourceUrl].join("|")),
      ...document,
    })));
  const sourceDocumentByToken = new Map(sourceDocuments
    .map((document) => [document.publisherDocumentToken, document]));

  const sourceSnapshots = await Promise.all([...input.snapshots]
    .sort((left, right) => left.legacyTextRevisionId.localeCompare(right.legacyTextRevisionId))
    .map(async (snapshot) => {
      const sourceDocument = sourceDocumentByToken.get(snapshot.publisherDocumentToken);
      if (!sourceDocument) throw new Error("SOURCE_SNAPSHOT_DOCUMENT_MISSING");
      return {
        id: await identity("source-snapshot", [sourceDocument.id, snapshot.publisherRevisionToken,
          snapshot.languageTag, snapshot.captureId, snapshot.rawSha256,
          snapshot.normalizedSha256].join("|")),
        sourceDocumentId: sourceDocument.id,
        ...snapshot,
      };
    }));
  const snapshotByRevision = new Map(sourceSnapshots
    .map((snapshot) => [snapshot.legacyTextRevisionId, snapshot]));

  const snapshotProvisions = await Promise.all([...input.provisions]
    .sort((left, right) => left.legacyProvisionRenditionId.localeCompare(right.legacyProvisionRenditionId))
    .map(async (provision) => {
      const snapshot = snapshotByRevision.get(provision.legacyTextRevisionId);
      const id = await identity("snapshot-provision", [snapshot?.id ?? "missing",
        provision.sourcePositionToken, provision.provisionSha256].join("|"));
      return { id, sourceSnapshotId: snapshot?.id ?? null, ...provision };
    }));

  const eligibility = snapshotProvisions.map((provision) => {
    const reasonCodes = eligibilityReasons(provision, provision.sourceSnapshotId !== null);
    return {
      snapshotProvisionId: provision.id,
      capability: "current" as const,
      status: reasonCodes.length === 0 ? "eligible" as const : "ineligible" as const,
      reasonCodes,
      evaluatedAt: input.cutoffAt,
    };
  });
  const eligibleIds = new Set(eligibility
    .filter((row) => row.status === "eligible")
    .map((row) => row.snapshotProvisionId));

  const chunkRows = await Promise.all(snapshotProvisions
    .filter((provision) => eligibleIds.has(provision.id))
    .map(async (provision) => {
      const snapshot = sourceSnapshots.find((candidate) => candidate.id === provision.sourceSnapshotId)!;
      const document = sourceDocuments.find((candidate) => candidate.id === snapshot.sourceDocumentId)!;
      const canonicalChunkId = await identity("chunk", `${provision.id}|0`);
      const shard = String(Number.parseInt((await sha256(canonicalChunkId)).slice(0, 8), 16)
        % input.shardCount).padStart(2, "0");
      const artifact = serializeNeutralSourceSnapshotChunk({
        sourceDocumentId: document.id,
        sourceSnapshotId: snapshot.id,
        snapshotProvisionId: provision.id,
        canonicalChunkId,
        publisher: document.publisher,
        publisherDocumentToken: document.publisherDocumentToken,
        publisherRevisionToken: snapshot.publisherRevisionToken,
        languageTag: document.languageTag,
        sourceUrl: provision.sourceUrl,
        capturedAt: snapshot.capturedAt,
        documentType: provision.documentType,
        articleNumber: provision.articleNumber,
        articleTitle: provision.articleTitle,
        sequence: provision.sequence,
        provisionText: provision.provisionText,
        sourceProvisionSha256: provision.provisionSha256,
        sourceNormalizedSha256: provision.sourceNormalizedSha256,
      });
      const artifactSha256 = await sha256(artifact);
      const key = `search-releases/${input.releaseId}/current/${shard}/${canonicalChunkId}.json`;
      return {
        canonicalChunk: {
          id: canonicalChunkId,
          snapshotProvisionId: provision.id,
          ordinal: 0,
          byteCount: artifact.byteLength,
          sha256: artifactSha256,
        },
        sparsePosting: { canonicalChunkId, postingInventorySha256: provision.provisionSha256 },
        denseCandidate: {
          canonicalChunkId,
          embeddingModel: "openai/text-embedding-3-large",
          dimensions: 1_536,
          providerCandidateId: `canonical:${canonicalChunkId}`,
        },
        releaseItem: {
          releaseId: input.releaseId,
          canonicalChunkId,
          snapshotProvisionId: provision.id,
          legacyProvisionRenditionId: provision.legacyProvisionRenditionId,
          shardId: shard,
          itemKey: key,
          r2Key: key,
          byteCount: artifact.byteLength,
          sha256: artifactSha256,
          language: document.languageTag,
          documentType: provision.documentType,
        },
        artifact: { key, bytes: artifact },
      };
    }));
  chunkRows.sort((left, right) => left.canonicalChunk.id.localeCompare(right.canonicalChunk.id));

  const canonicalChunks = chunkRows.map((row) => row.canonicalChunk);
  const sparsePostings = chunkRows.map((row) => row.sparsePosting);
  const denseCandidates = chunkRows.map((row) => row.denseCandidate);
  const releaseItems = chunkRows.map((row) => row.releaseItem);
  const chunkArtifacts = chunkRows.map((row) => row.artifact);
  const shardItemCounts = Object.fromEntries(Array.from({ length: input.shardCount }, (_, index) => [
    String(index).padStart(2, "0"),
    releaseItems.filter((item) => item.shardId === String(index).padStart(2, "0")).length,
  ]));
  const exclusions: Record<string, number> = {};
  for (const row of eligibility) for (const reason of row.reasonCodes) {
    exclusions[reason] = (exclusions[reason] ?? 0) + 1;
  }
  for (const row of input.quarantines) {
    exclusions[row.reasonCode] = (exclusions[row.reasonCode] ?? 0) + 1;
  }
  const counts = {
    sourceDocuments: sourceDocuments.length,
    sourceSnapshots: sourceSnapshots.length,
    snapshotProvisions: snapshotProvisions.length,
    currentPointers: sourceSnapshots.length,
    eligibleCurrentProvisions: eligibleIds.size,
    excludedCurrentProvisions: snapshotProvisions.length - eligibleIds.size,
    quarantines: input.quarantines.length,
    aliases: input.aliases.length,
    canonicalChunks: canonicalChunks.length,
    sparsePostings: sparsePostings.length,
    denseCandidates: denseCandidates.length,
    releaseItems: releaseItems.length,
  };
  const inventoryBody = {
    schemaVersion: 1,
    environment: input.environment,
    cutoffAt: input.cutoffAt,
    counts,
    exclusions: Object.fromEntries(Object.entries(exclusions).sort(([left], [right]) => left.localeCompare(right))),
    deferredInventories: [...input.deferredInventories].sort((left, right) => left.kind.localeCompare(right.kind)),
    sourceDocumentIds: sourceDocuments.map((row) => row.id),
    sourceSnapshotIds: sourceSnapshots.map((row) => row.id),
    snapshotProvisionIds: snapshotProvisions.map((row) => row.id),
  };
  const inventory = { ...inventoryBody, identity: await sha256(stable(inventoryBody)) };
  const releaseBody = {
    schemaVersion: 1,
    environment: input.environment,
    capability: "current" as const,
    releaseId: input.releaseId,
    configurationIdentity: input.configurationIdentity,
    inventoryIdentity: inventory.identity,
    itemCount: releaseItems.length,
    shardCount: input.shardCount,
    shardItemCounts,
    completeDisjointUnion: new Set(releaseItems.map((item) => item.canonicalChunkId)).size
      === releaseItems.length
      && Object.values(shardItemCounts).reduce((sum, count) => sum + count, 0) === releaseItems.length,
    items: releaseItems,
  };
  const release = { ...releaseBody, identity: await sha256(stable(releaseBody)) };
  const manifest = {
    key: `search-releases/${input.releaseId}/manifest.json`,
    bytes: bytes({ ...release, status: "sealed" }),
  };
  const rows: PersistedRow[] = [
    ...sourceDocuments.map((row) => ({ identity: `source_document:${row.id}`, serialized: stable(row) })),
    ...sourceSnapshots.map((row) => ({ identity: `source_snapshot:${row.id}`, serialized: stable(row) })),
    ...snapshotProvisions.map((row) => ({ identity: `snapshot_provision:${row.id}`, serialized: stable(row) })),
    ...eligibility.map((row) => ({ identity: `retrieval_eligibility:${row.snapshotProvisionId}:current`, serialized: stable(row) })),
    ...canonicalChunks.map((row) => ({ identity: `canonical_chunk:${row.id}`, serialized: stable(row) })),
    ...sparsePostings.map((row) => ({ identity: `sparse:${row.canonicalChunkId}`, serialized: stable(row) })),
    ...denseCandidates.map((row) => ({ identity: `dense:${row.canonicalChunkId}`, serialized: stable(row) })),
    ...releaseItems.map((row) => ({ identity: `release_item:${row.releaseId}:${row.canonicalChunkId}`, serialized: stable(row) })),
  ];
  return {
    sourceDocuments,
    sourceSnapshots,
    snapshotProvisions,
    eligibility,
    canonicalChunks,
    sparsePostings,
    denseCandidates,
    releaseItems,
    chunkArtifacts,
    inventory,
    release,
    manifest,
    persistedRows: rows,
  };
}

export async function executeSourceSnapshotProjectionPlan(
  store: SourceSnapshotBuildStore,
  plan: SourceSnapshotProjectionPlan,
  options: { failAfterPhase?: "inventory" | "projections" } = {},
) {
  const phases = [
    { name: "inventory" as const, identity: plan.inventory.identity,
      rows: plan.persistedRows.filter((row) => !/^(?:canonical_chunk|sparse|dense|release_item):/u.test(row.identity)),
      objects: [] as PersistedObject[] },
    { name: "projections" as const, identity: await sha256(stable({
      chunks: plan.canonicalChunks,
      sparse: plan.sparsePostings,
      dense: plan.denseCandidates,
      releaseItems: plan.releaseItems,
    })), rows: plan.persistedRows.filter((row) => /^(?:canonical_chunk|sparse|dense|release_item):/u.test(row.identity)),
    objects: plan.chunkArtifacts },
    { name: "release" as const, identity: plan.release.identity, rows: [] as PersistedRow[],
      objects: [plan.manifest] },
  ];
  let resumedAfterPartialFailure = false;
  for (const phase of phases) {
    const completed = await store.completedIdentity(phase.name);
    if (completed !== null) {
      if (completed !== phase.identity) throw new Error("SOURCE_SNAPSHOT_BUILD_IDENTITY_CONFLICT");
      resumedAfterPartialFailure = true;
      continue;
    }
    await store.persistRows(phase.rows);
    await store.persistObjects(phase.objects);
    await store.persistPhase(phase.name, phase.identity);
    if (options.failAfterPhase === phase.name) throw new SourceSnapshotBuildInterruptedError(phase.name);
  }
  return {
    inventoryIdentity: plan.inventory.identity,
    releaseIdentity: plan.release.identity,
    itemCount: plan.releaseItems.length,
    completeDisjointUnion: plan.release.completeDisjointUnion,
    resumedAfterPartialFailure,
  };
}
