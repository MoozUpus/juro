import { z } from "zod";

import {
  candidateConfigurationIdSchema,
  candidateInstanceIdSchema,
  candidateShardIdSchema,
  legalEnvironmentSchema,
  legalIdentifierSchema,
  providerProjectIdSchema,
  searchReleaseIdSchema,
  sha256Schema,
  utcInstantSchema,
} from "./target-domain-schemas";

const endpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current") }).strict(),
  z.object({ kind: z.literal("timestamp"), instant: utcInstantSchema }).strict(),
]);
const formulationSchema = z.object({
  id: legalIdentifierSchema,
  text: z.string().trim().min(1).max(900),
  legalTitleSpans: z.array(z.string().trim().min(3).max(300)).max(12).optional(),
  privateNameSpans: z.array(z.string().trim().min(1).max(300)).max(24),
  readingIds: z.array(legalIdentifierSchema).min(1),
  requirementIds: z.array(legalIdentifierSchema).min(1),
}).strict();
const interpretationSchema = z.object({
  id: legalIdentifierSchema,
  formulations: z.array(formulationSchema).min(1).max(6),
}).strict();
export const AI_SEARCH_METADATA_SCHEMA = [
  "language",
  "document_type",
  "valid_from",
  "valid_to",
] as const;
export const AI_SEARCH_TYPED_METADATA_SCHEMA = [
  { field_name: "language", data_type: "text" },
  { field_name: "document_type", data_type: "text" },
  { field_name: "valid_from", data_type: "datetime" },
  { field_name: "valid_to", data_type: "datetime" },
] as const;
const providerItemMetadataSchema = z.object({
  language: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  document_type: z.string().min(1).max(300),
  valid_from: utcInstantSchema,
  valid_to: utcInstantSchema.nullable(),
}).strict();

export const candidateConfigurationSchema = z.object({
  identity: candidateConfigurationIdSchema,
  embeddingModel: z.literal("openai/text-embedding-3-large"),
  dimensions: z.literal(1_536),
  keywordTokenizer: z.enum(["porter", "trigram"]),
  metadataSchema: z.tuple([
    z.literal("language"),
    z.literal("document_type"),
    z.literal("valid_from"),
    z.literal("valid_to"),
  ]),
  gatewayIdentity: legalIdentifierSchema,
  providerProjectIdentity: providerProjectIdSchema,
  gatewayPayloadLogging: z.boolean(),
  gatewayCaching: z.boolean(),
  similarityCaching: z.boolean(),
}).strict();
export const pinnedCandidateConfigurationSchema = candidateConfigurationSchema.extend({
  gatewayPayloadLogging: z.literal(false),
  gatewayCaching: z.literal(false),
  similarityCaching: z.literal(false),
}).strict();
const pinnedReleaseSchema = z.object({
  id: searchReleaseIdSchema,
  environment: legalEnvironmentSchema,
  capability: z.enum(["current", "history"]),
  instances: z.array(z.object({
    id: candidateInstanceIdSchema,
    shardId: candidateShardIdSchema,
  }).strict()).min(1),
  configuration: pinnedCandidateConfigurationSchema,
}).strict().superRefine((value, context) => {
  const instanceIds = value.instances.map((instance) => instance.id);
  const shardIds = value.instances.map((instance) => instance.shardId);
  if (new Set(instanceIds).size !== instanceIds.length) {
    context.addIssue({ code: "custom", message: "Candidate instance identities must be unique" });
  }
  if (new Set(shardIds).size !== shardIds.length) {
    context.addIssue({ code: "custom", message: "Candidate shard identities must be unique" });
  }
});

export type QuestionInterpretation = z.infer<typeof interpretationSchema>;
export type TemporalEndpoint = z.infer<typeof endpointSchema>;
export type CandidateConfiguration = z.infer<typeof candidateConfigurationSchema>;
export type PinnedCandidateConfiguration = z.infer<typeof pinnedCandidateConfigurationSchema>;
export type PinnedCandidateRelease = z.infer<typeof pinnedReleaseSchema>;

export function parsePinnedCandidateRelease(value: unknown): PinnedCandidateRelease {
  return pinnedReleaseSchema.parse(value);
}

export function toPinnedCandidateConfiguration(value: unknown): PinnedCandidateConfiguration {
  const record = z.record(z.string(), z.unknown()).parse(value);
  return pinnedCandidateConfigurationSchema.parse({
    identity: record.identity,
    embeddingModel: record.embeddingModel,
    dimensions: record.dimensions,
    keywordTokenizer: record.keywordTokenizer,
    metadataSchema: record.metadataSchema,
    gatewayIdentity: record.gatewayIdentity,
    providerProjectIdentity: record.providerProjectIdentity,
    gatewayPayloadLogging: record.gatewayPayloadLogging,
    gatewayCaching: record.gatewayCaching,
    similarityCaching: record.similarityCaching,
  });
}

export const candidateSchema = z.object({
  itemKey: z.string().min(1).max(700),
  instanceId: candidateInstanceIdSchema,
  shardId: candidateShardIdSchema,
  formulationId: legalIdentifierSchema,
  readingIds: z.array(legalIdentifierSchema).min(1),
  requirementIds: z.array(legalIdentifierSchema).min(1),
  vectorRank: z.number().int().positive(),
  vectorScore: z.number().finite(),
  keywordRank: z.number().int().positive(),
  keywordScore: z.number().finite(),
  fusionScore: z.number().finite(),
  providerMetadata: providerItemMetadataSchema.optional(),
}).strict();
const packetErrorSchema = z.object({
  code: z.enum([
    "AI_SEARCH_CONFIGURATION_DRIFT",
    "AI_SEARCH_MISSING_INSTANCE",
    "AI_SEARCH_PARTIAL_RESPONSE",
    "AI_SEARCH_UNKNOWN_INSTANCE",
    "AI_SEARCH_WRONG_RELEASE",
    "CANDIDATE_PROVIDER_UNAVAILABLE",
    "PRIVACY_TRANSFORM_REJECTED",
  ]),
  instanceId: candidateInstanceIdSchema.optional(),
}).strict();
const packetSchema = z.object({
  availability: z.enum(["available", "unavailable"]),
  releaseId: searchReleaseIdSchema,
  endpoint: endpointSchema,
  requiredInstanceIds: z.array(candidateInstanceIdSchema).min(1),
  candidates: z.array(candidateSchema).max(300),
  partialErrors: z.array(packetErrorSchema),
}).strict();

export type CandidatePacket = z.infer<typeof packetSchema>;
export function parseCandidatePacket(value: unknown): CandidatePacket {
  return packetSchema.parse(value);
}
export interface LegalCandidateIndex {
  retrieve(
    interpretation: QuestionInterpretation,
    endpoint: TemporalEndpoint,
    searchRelease: PinnedCandidateRelease,
    context?: { currentAt: string },
  ): Promise<CandidatePacket>;
}

type NormalizedCandidateInput = Omit<z.input<typeof candidateSchema>,
  "formulationId" | "readingIds" | "requirementIds">;

function unavailable(
  release: PinnedCandidateRelease,
  endpoint: TemporalEndpoint,
  errors: z.input<typeof packetErrorSchema>[],
): CandidatePacket {
  return packetSchema.parse({
    availability: "unavailable",
    releaseId: release.id,
    endpoint,
    requiredInstanceIds: release.instances.map((instance) => instance.id),
    candidates: [],
    partialErrors: errors,
  });
}

function normalizeCandidates(input: Array<NormalizedCandidateInput & {
  formulation: QuestionInterpretation["formulations"][number];
}>): CandidatePacket["candidates"] {
  const byKey = new Map<string, z.infer<typeof candidateSchema>>();
  for (const raw of input) {
    const candidate = candidateSchema.parse({
      itemKey: raw.itemKey,
      instanceId: raw.instanceId,
      shardId: raw.shardId,
      formulationId: raw.formulation.id,
      readingIds: [...new Set(raw.formulation.readingIds)].sort(),
      requirementIds: [...new Set(raw.formulation.requirementIds)].sort(),
      vectorRank: raw.vectorRank,
      vectorScore: raw.vectorScore,
      keywordRank: raw.keywordRank,
      keywordScore: raw.keywordScore,
      fusionScore: raw.fusionScore,
      ...(raw.providerMetadata ? { providerMetadata: raw.providerMetadata } : {}),
    });
    const existing = byKey.get(candidate.itemKey);
    if (!existing || candidate.fusionScore > existing.fusionScore) {
      byKey.set(candidate.itemKey, existing ? {
        ...candidate,
        readingIds: [...new Set([...existing.readingIds, ...candidate.readingIds])].sort(),
        requirementIds: [...new Set([
          ...existing.requirementIds,
          ...candidate.requirementIds,
        ])].sort(),
      } : candidate);
    } else if (candidate.fusionScore === existing.fusionScore) {
      byKey.set(candidate.itemKey, {
        ...existing,
        readingIds: [...new Set([...existing.readingIds, ...candidate.readingIds])].sort(),
        requirementIds: [...new Set([
          ...existing.requirementIds,
          ...candidate.requirementIds,
        ])].sort(),
      });
    }
  }
  return [...byKey.values()].sort((left, right) =>
    right.fusionScore - left.fusionScore || left.itemKey.localeCompare(right.itemKey));
}

export function createCallbackCandidateIndex(
  retrieve: (
    formulation: QuestionInterpretation["formulations"][number],
    endpoint: TemporalEndpoint,
    release: PinnedCandidateRelease,
  ) => Promise<NormalizedCandidateInput[]>,
): LegalCandidateIndex {
  return {
    async retrieve(rawInterpretation, rawEndpoint, rawRelease) {
      const interpretation = interpretationSchema.parse(rawInterpretation);
      const endpoint = endpointSchema.parse(rawEndpoint);
      const release = pinnedReleaseSchema.parse(rawRelease);
      try {
        const results = await Promise.all(interpretation.formulations.map(async (formulation) =>
          (await retrieve(formulation, endpoint, release)).map((candidate) => ({
            ...candidate,
            formulation,
          }))));
        return packetSchema.parse({
          availability: "available",
          releaseId: release.id,
          endpoint,
          requiredInstanceIds: release.instances.map((instance) => instance.id),
          candidates: normalizeCandidates(results.flat()),
          partialErrors: [],
        });
      } catch {
        return unavailable(release, endpoint, [{ code: "CANDIDATE_PROVIDER_UNAVAILABLE" }]);
      }
    },
  };
}

export const createInMemoryCandidateIndex = createCallbackCandidateIndex;
export const createQdrantCandidateIndex = createCallbackCandidateIndex;

type AiSearchHit = Omit<NormalizedCandidateInput, "instanceId" | "shardId"> & {
  instanceId: string;
  shardId: string;
  candidateText?: string;
};
export type AiSearchProvider = {
  attest(instanceId: string, releaseId?: string): Promise<CandidateConfiguration>;
  search(input: {
    releaseId?: string;
    currentAt?: string;
    instanceIds: string[];
    query: string;
    endpoint: TemporalEndpoint;
    maxResults: 50;
    vectorThreshold: 0;
  }): Promise<{
    hits: AiSearchHit[];
    errors: Array<{ code: string; instanceId?: string }>;
    searchedInstanceIds: string[];
    tokenUsage?: number;
  }>;
};

type CloudflareAiSearchProviderOptions = {
  namespaceIdentity: string;
  sourceBucketName: string;
  sourcePrefix: string;
  shardByInstance: Readonly<Record<string, string>>;
  configuration: PinnedCandidateConfiguration;
  attestManagement(instanceId: string): Promise<{
    instanceId: string;
    configuration: PinnedCandidateConfiguration;
    evidenceSha256: string;
    observedAt: string;
  }>;
};

function providerMetadataSchema(info: AiSearchInstanceInfo): Array<{
  field_name: string;
  data_type: string;
}> {
  return (info.custom_metadata ?? []).map((field) => ({
    field_name: field.field_name,
    data_type: field.data_type,
  })).sort((left, right) => left.field_name.localeCompare(right.field_name));
}

function providerSourcePrefix(info: AiSearchInstanceInfo): string | null {
  const sourceParams = info.source_params;
  if (!sourceParams || typeof sourceParams !== "object") return null;
  const prefix = (sourceParams as Record<string, unknown>).prefix;
  return typeof prefix === "string" ? prefix : null;
}

function providerPublicEndpointDisabled(info: AiSearchInstanceInfo): boolean {
  const params = info.public_endpoint_params;
  if (!params || typeof params !== "object") return false;
  const values = params as Record<string, unknown>;
  const customDomains = values.custom_domains;
  return values.enabled === false
    && (customDomains === undefined || (Array.isArray(customDomains) && customDomains.length === 0));
}

/**
 * Adapts the native Workers AI Search namespace binding to the provider-neutral
 * candidate contract. Configuration is attested from the provider immediately
 * before every governed retrieval; candidate excerpts never leave this seam.
 */
export function createCloudflareAiSearchProvider(
  namespace: AiSearchNamespace,
  rawOptions: CloudflareAiSearchProviderOptions,
): AiSearchProvider {
  const options = {
    namespaceIdentity: legalIdentifierSchema.parse(rawOptions.namespaceIdentity),
    sourceBucketName: z.string().min(3).max(200).parse(rawOptions.sourceBucketName),
    sourcePrefix: z.string().min(1).max(500).parse(rawOptions.sourcePrefix),
    shardByInstance: z.record(candidateInstanceIdSchema, candidateShardIdSchema)
      .parse(rawOptions.shardByInstance),
    configuration: pinnedCandidateConfigurationSchema.parse(rawOptions.configuration),
    attestManagement: rawOptions.attestManagement,
  };
  const expectedMetadata = [...AI_SEARCH_TYPED_METADATA_SCHEMA]
    .sort((left, right) => left.field_name.localeCompare(right.field_name));
  return {
    async attest(instanceId) {
      const parsedInstanceId = candidateInstanceIdSchema.parse(instanceId);
      const [info, management] = await Promise.all([
        namespace.get(parsedInstanceId).info(),
        options.attestManagement(parsedInstanceId),
      ]);
      const managementConfiguration = pinnedCandidateConfigurationSchema
        .parse(management.configuration);
      const matches = info.id === instanceId
        && info.namespace === options.namespaceIdentity
        && info.type === "r2"
        && info.source === options.sourceBucketName
        && info.paused === true
        && info.embedding_model === options.configuration.embeddingModel
        && info.ai_gateway_id === options.configuration.gatewayIdentity
        && info.rewrite_query === false
        && info.reranking === false
        && info.index_method?.vector === true
        && info.index_method?.keyword === true
        && info.fusion_method === "rrf"
        && info.indexing_options?.keyword_tokenizer === options.configuration.keywordTokenizer
        && info.retrieval_options?.keyword_match_mode === "or"
        && info.max_num_results === 50
        && info.score_threshold === 0
        && info.cache === false
        && info.chunk === true
        && info.chunk_size === 4_096
        && info.chunk_overlap === 0
        && providerPublicEndpointDisabled(info)
        && info.sync_interval === 86_400
        && providerSourcePrefix(info) === options.sourcePrefix
        && JSON.stringify(providerMetadataSchema(info)) === JSON.stringify(expectedMetadata)
        && management.instanceId === parsedInstanceId
        && sha256Schema.safeParse(management.evidenceSha256).success
        && utcInstantSchema.safeParse(management.observedAt).success
        && (typeof info.modified_at !== "string"
          || (Number.isFinite(Date.parse(info.modified_at))
            && Date.parse(management.observedAt) >= Date.parse(info.modified_at)))
        && JSON.stringify(managementConfiguration) === JSON.stringify(options.configuration);
      if (!matches) throw new TypeError("AI_SEARCH_CONFIGURATION_DRIFT");
      return managementConfiguration;
    },
    async search(input) {
      if (input.endpoint.kind !== "current") {
        throw new TypeError("AI_SEARCH_CURRENT_RELEASE_ENDPOINT_REQUIRED");
      }
      const instanceIds = input.instanceIds.map((id) => candidateInstanceIdSchema.parse(id));
      const response = await namespace.search({
        query: input.query,
        ai_search_options: {
          instance_ids: instanceIds,
          retrieval: {
            retrieval_type: "hybrid",
            fusion_method: "rrf",
            max_num_results: input.maxResults,
            match_threshold: input.vectorThreshold,
            context_expansion: 0,
            metadata_only: true,
            return_on_failure: false,
          },
          query_rewrite: { enabled: false },
          reranking: { enabled: false },
          cache: { enabled: false },
        },
      });
      const errors = (response.errors ?? []).map((error) => ({
        code: "AI_SEARCH_INSTANCE_UNAVAILABLE",
        instanceId: error.instance_id,
      }));
      const hits = response.chunks.map((chunk) => {
        const details = chunk.scoring_details;
        if (!details
          || !Number.isInteger(details.vector_rank) || details.vector_rank! < 1
          || !Number.isFinite(details.vector_score)
          || !Number.isInteger(details.keyword_rank) || details.keyword_rank! < 1
          || !Number.isFinite(details.keyword_score)
          || !Number.isFinite(chunk.score)) {
          throw new TypeError("AI_SEARCH_HYBRID_SCORING_DETAILS_REQUIRED");
        }
        const instanceId = candidateInstanceIdSchema.parse(chunk.instance_id);
        const shardId = options.shardByInstance[instanceId];
        if (!shardId) throw new TypeError("AI_SEARCH_INSTANCE_SHARD_MAPPING_REQUIRED");
        const metadata = providerItemMetadataSchema.parse({
          ...chunk.item.metadata,
          valid_to: chunk.item.metadata?.valid_to ?? null,
        });
        return {
          itemKey: z.string().min(1).max(700).parse(chunk.item.key),
          instanceId,
          shardId,
          vectorRank: details.vector_rank!,
          vectorScore: details.vector_score!,
          keywordRank: details.keyword_rank!,
          keywordScore: details.keyword_score!,
          fusionScore: chunk.score,
          providerMetadata: metadata,
        };
      });
      return {
        hits,
        errors,
        searchedInstanceIds: errors.length === 0 ? instanceIds : [
          ...new Set(hits.map((hit) => hit.instanceId)),
        ],
      };
    },
  };
}

const providerStatusSchema = z.enum(["ok", "unavailable", "rejected"]);
const safeErrorClassSchema = z.enum([
  "configuration_drift",
  "integrity_failure",
  "privacy_rejected",
  "provider_unavailable",
]).nullable();
const candidateTelemetrySchema = z.object({
  releaseId: searchReleaseIdSchema,
  correlationHash: z.string().length(64).regex(/^[a-f0-9]+$/u),
  formulationCount: z.number().int().nonnegative(),
  instanceCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  tokenUsage: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  providerStatus: providerStatusSchema,
  safeErrorClass: safeErrorClassSchema,
}).strict();

export type CandidateTelemetryEvent = z.infer<typeof candidateTelemetrySchema>;
type CandidateIndexOptions = {
  attestPrivateNames: (input: {
    text: string;
    formulationSha256: string;
    legalTitleSpans: readonly string[];
  }) => Promise<unknown>;
  emitTelemetry?: (event: CandidateTelemetryEvent) => void;
  now?: () => number;
  resolveTrustedLegalTitles?: (release: PinnedCandidateRelease) => Promise<readonly string[]>;
};
const privateNameAttestationSchema = z.object({
  classifierVersion: z.literal("juro-local-pii-v1"),
  formulationSha256: sha256Schema,
  status: z.enum(["complete", "uncertain"]),
  privateNameSpans: z.array(z.string().trim().min(1).max(300)).max(24),
}).strict();

const untransformableSecretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
] as const;

const removablePrivatePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /(?<!\d)\+?998(?:[\s()-]*\d){9}(?!\d)/gu,
  /(?:JSHSHIR|PINFL|ПИНФЛ)\s*[:№#-]?\s*\d{14}\b/giu,
  /(?:karta|card|карта)\s*[:№#-]?\s*(?:\d[ -]?){13,19}\b/giu,
  /(?:case|document|account|дело|документ|сч[её]т|ish|hujjat|hisob)\s*(?:no\.?|number|№|#|raqami)?\s*[:№#-]?\s*[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9._/-]{2,}\b/giu,
  /(?:password|passcode|пароль|код доступа|maxfiy so['’]?z)\s*[:=-]\s*\S+/giu,
  /(?:address|адрес|manzil)\s*:\s*[\s\S]*?(?=[.!?]\s+(?:I|My|Меня|Я|Men|Meni)(?:\s|$)|$)/giu,
  /(?:irrelevant story|несущественная история|ahamiyatsiz hikoya)\s*:\s*[^.!?]*(?:[.!?]|$)/giu,
  /(?:my name is|меня зовут|m[ea]ning ismim)\s+[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,3}[.!?]?/giu,
  /(?<!\p{L})(?:на\s+)?(?:улиц[аеуы]?|ул\.?|street|st\.?|ko['’]?chasi|кўчаси)\s+[\p{L}\d .,'’\/-]{1,120}?(?=[.!?]|$)/giu,
] as const;

const unlabelledProperNamePattern = /(?<!\p{L})\p{Lu}\p{Ll}{1,}(?:\s+\p{Lu}\p{Ll}{1,}){1,7}(?!\p{L})/gu;
type PrivacyTransform =
  | { accepted: true; text: string }
  | { accepted: false };

function boundedLiteralPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "gu");
}

function transformProviderQuery(
  value: string,
  declaredLegalTitles: readonly string[],
  declaredPrivateNames: readonly string[],
  trustedLegalTitles: ReadonlySet<string>,
): PrivacyTransform {
  if (untransformableSecretPatterns.some((pattern) => pattern.test(value))) {
    return { accepted: false };
  }
  let transformed = value.normalize("NFC");
  const protectedTitles = [...new Set(declaredLegalTitles.map((title) => title.normalize("NFC")))];
  const privateNames = [...new Set(declaredPrivateNames.map((name) => name.normalize("NFC")))];
  if (protectedTitles.some((title) => !trustedLegalTitles.has(title)
    || !transformed.includes(title))) return { accepted: false };
  if (privateNames.some((name) => !boundedLiteralPattern(name).test(transformed)
    || protectedTitles.some((title) => title.includes(name) || name.includes(title)))) {
    return { accepted: false };
  }
  const placeholders = new Map<string, string>();
  for (const [index, title] of protectedTitles.entries()) {
    const placeholder = `JURO_LEGAL_TITLE_${index}_TOKEN`;
    transformed = transformed.replaceAll(title, placeholder);
    placeholders.set(placeholder, title);
  }
  for (const name of privateNames) {
    transformed = transformed.replace(boundedLiteralPattern(name), " ");
  }
  for (const pattern of removablePrivatePatterns) {
    transformed = transformed.replace(pattern, " ");
  }
  transformed = transformed.replace(unlabelledProperNamePattern, " ");
  for (const [placeholder, title] of placeholders) transformed = transformed.replaceAll(placeholder, title);
  transformed = transformed.replace(/\s+/gu, " ").trim();
  return transformed.length > 0 ? { accepted: true, text: transformed } : { accepted: false };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEmit(
  emit: CandidateIndexOptions["emitTelemetry"],
  event: CandidateTelemetryEvent,
): void {
  try {
    emit?.(candidateTelemetrySchema.parse(event));
  } catch {
    // Candidate retrieval and privacy enforcement never depend on telemetry availability.
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

export function createAiSearchCandidateIndex(
  provider: AiSearchProvider,
  options: CandidateIndexOptions,
): LegalCandidateIndex {
  return {
    async retrieve(rawInterpretation, rawEndpoint, rawRelease, context) {
      const interpretation = interpretationSchema.parse(rawInterpretation);
      const endpoint = endpointSchema.parse(rawEndpoint);
      const release = pinnedReleaseSchema.parse(rawRelease);
      const startedAt = (options.now ?? Date.now)();
      const requiredInstanceIds = release.instances.map((instance) => instance.id);
      const shardByInstance = new Map(release.instances.map((instance) => [
        instance.id,
        instance.shardId,
      ]));
      const correlationHash = await sha256Hex([
        "juro.legal-candidate-index.v1",
        release.environment,
        release.id,
        interpretation.id,
      ].join("\n"));
      let observedTokenUsage = 0;
      const emitOutcome = (
        providerStatus: CandidateTelemetryEvent["providerStatus"],
        safeErrorClass: CandidateTelemetryEvent["safeErrorClass"],
        candidateCount = 0,
      ): void => safeEmit(options.emitTelemetry, {
        releaseId: release.id,
        correlationHash,
        formulationCount: interpretation.formulations.length,
        instanceCount: requiredInstanceIds.length,
        candidateCount,
        tokenUsage: observedTokenUsage,
        latencyMs: Math.max(0, Math.round((options.now ?? Date.now)() - startedAt)),
        providerStatus,
        safeErrorClass,
      });
      const formulationIds = interpretation.formulations.map((formulation) => formulation.id);
      if (new Set(formulationIds).size !== formulationIds.length) {
        emitOutcome("rejected", "privacy_rejected");
        return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
      }
      if (interpretation.formulations.some((formulation) =>
        untransformableSecretPatterns.some((pattern) => pattern.test(formulation.text)))) {
        emitOutcome("rejected", "privacy_rejected");
        return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
      }
      let trustedLegalTitles: ReadonlySet<string> = new Set();
      if (interpretation.formulations.some((formulation) =>
        (formulation.legalTitleSpans?.length ?? 0) > 0)) {
        try {
          trustedLegalTitles = new Set((await options.resolveTrustedLegalTitles?.(release) ?? [])
            .map((title) => title.normalize("NFC")));
        } catch {
          emitOutcome("unavailable", "privacy_rejected");
          return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
        }
      }
      const titleSafeFormulations = interpretation.formulations.filter((formulation) => {
        const text = formulation.text.normalize("NFC");
        return (formulation.legalTitleSpans ?? []).every((title) => {
          const normalizedTitle = title.normalize("NFC");
          return trustedLegalTitles.has(normalizedTitle) && text.includes(normalizedTitle);
        });
      });
      if (titleSafeFormulations.length !== interpretation.formulations.length) {
        const coveredReadings = new Set(titleSafeFormulations.flatMap((formulation) =>
          formulation.readingIds));
        const coveredRequirements = new Set(titleSafeFormulations.flatMap((formulation) =>
          formulation.requirementIds));
        const requiredReadings = new Set(interpretation.formulations.flatMap((formulation) =>
          formulation.readingIds));
        const requiredRequirements = new Set(interpretation.formulations.flatMap((formulation) =>
          formulation.requirementIds));
        const allCoverageRetained = [...requiredReadings].every((id) => coveredReadings.has(id))
          && [...requiredRequirements].every((id) => coveredRequirements.has(id));
        if (!allCoverageRetained) {
          emitOutcome("rejected", "privacy_rejected");
          return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
        }
      }
      const attestedPrivateNames = new Map<string, readonly string[]>();
      try {
        for (const formulation of titleSafeFormulations) {
          const text = formulation.text.normalize("NFC");
          const formulationSha256 = await sha256Hex([
            "juro.private-name-classification.v1",
            text,
          ].join("\n"));
          const attestation = privateNameAttestationSchema.parse(
            await options.attestPrivateNames({
              text,
              formulationSha256,
              legalTitleSpans: formulation.legalTitleSpans ?? [],
            }),
          );
          if (attestation.status !== "complete"
            || attestation.formulationSha256 !== formulationSha256) {
            emitOutcome("unavailable", "privacy_rejected");
            return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
          }
          attestedPrivateNames.set(formulation.id, attestation.privateNameSpans);
        }
      } catch {
        emitOutcome("unavailable", "privacy_rejected");
        return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
      }
      const transformedFormulations = new Map<string, string>();
      for (const formulation of titleSafeFormulations) {
        const declaredTitles = formulation.legalTitleSpans ?? [];
        const transformed = transformProviderQuery(
          formulation.text,
          declaredTitles,
          [...formulation.privateNameSpans,
            ...(attestedPrivateNames.get(formulation.id) ?? [])],
          trustedLegalTitles,
        );
        if (!transformed.accepted) {
          emitOutcome("rejected", "privacy_rejected");
          return unavailable(release, endpoint, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
        }
        transformedFormulations.set(formulation.id, transformed.text);
      }
      try {
        const attestations = await Promise.all(requiredInstanceIds.map(async (instanceId) => ({
          instanceId,
          configuration: candidateConfigurationSchema.parse(await provider.attest(instanceId, release.id)),
        })));
        const drift = attestations.find(({ configuration }) =>
          JSON.stringify(configuration) !== JSON.stringify(release.configuration));
        if (drift) {
          emitOutcome("unavailable", "configuration_drift");
          return unavailable(release, endpoint, [{
            code: "AI_SEARCH_CONFIGURATION_DRIFT",
            instanceId: drift.instanceId,
          }]);
        }

        const waves = chunks(requiredInstanceIds, 10);
        const searches = await Promise.all(titleSafeFormulations.flatMap((formulation) =>
          waves.map(async (instanceIds) => ({
            formulation,
            instanceIds,
            response: await provider.search({
              releaseId: release.id,
              currentAt: context?.currentAt ?? new Date(startedAt).toISOString(),
              instanceIds,
              query: transformedFormulations.get(formulation.id)!,
              endpoint,
              maxResults: 50,
              vectorThreshold: 0,
            }).then((response) => {
              observedTokenUsage += response.tokenUsage ?? 0;
              return response;
            }),
          }))));
        const normalized: Array<NormalizedCandidateInput & {
          formulation: QuestionInterpretation["formulations"][number];
        }> = [];
        for (const search of searches) {
          if (search.response.errors.length > 0) {
            emitOutcome("unavailable", "provider_unavailable");
            return unavailable(release, endpoint, search.response.errors.map((error) => {
              const instanceId = candidateInstanceIdSchema.safeParse(error.instanceId);
              return {
                code: "AI_SEARCH_PARTIAL_RESPONSE" as const,
                ...(instanceId.success ? { instanceId: instanceId.data } : {}),
              };
            }));
          }
          const searched = search.response.searchedInstanceIds;
          if (!Array.isArray(searched) || searched.length !== new Set(searched).size) {
            emitOutcome("unavailable", "integrity_failure");
            return unavailable(release, endpoint, [{ code: "AI_SEARCH_PARTIAL_RESPONSE" }]);
          }
          const requested = new Set<string>(search.instanceIds);
          const unknown = searched.find((instanceId) => !requested.has(instanceId));
          if (unknown) {
            const unknownId = candidateInstanceIdSchema.safeParse(unknown);
            emitOutcome("unavailable", "integrity_failure");
            return unavailable(release, endpoint, [{
              code: "AI_SEARCH_UNKNOWN_INSTANCE",
              ...(unknownId.success ? { instanceId: unknownId.data } : {}),
            }]);
          }
          const searchedIds = new Set<string>(searched);
          const missing = search.instanceIds.find((instanceId) => !searchedIds.has(instanceId));
          if (missing) {
            emitOutcome("unavailable", "integrity_failure");
            return unavailable(release, endpoint, [{
              code: "AI_SEARCH_MISSING_INSTANCE",
              instanceId: missing,
            }]);
          }
          for (const hit of search.response.hits.slice(0, 50)) {
            const hitInstanceId = candidateInstanceIdSchema.safeParse(hit.instanceId);
            const shardId = hitInstanceId.success ? shardByInstance.get(hitInstanceId.data) : undefined;
            if (!hitInstanceId.success || !shardId || !requested.has(hit.instanceId)) {
              emitOutcome("unavailable", "integrity_failure");
              return unavailable(release, endpoint, [{
                code: "AI_SEARCH_UNKNOWN_INSTANCE",
                ...(hitInstanceId.success ? { instanceId: hitInstanceId.data } : {}),
              }]);
            }
            if (
              hit.shardId !== shardId
              || !hit.itemKey.startsWith(`search-releases/${release.id}/`)
            ) {
              emitOutcome("unavailable", "integrity_failure");
              return unavailable(release, endpoint, [{
                code: "AI_SEARCH_WRONG_RELEASE",
                instanceId: hitInstanceId.data,
              }]);
            }
            normalized.push({
              itemKey: hit.itemKey,
              instanceId: hitInstanceId.data,
              shardId,
              vectorRank: hit.vectorRank,
              vectorScore: hit.vectorScore,
              keywordRank: hit.keywordRank,
              keywordScore: hit.keywordScore,
              fusionScore: waves.length > 1
                ? 1 / (60 + hit.vectorRank) + 1 / (60 + hit.keywordRank)
                : hit.fusionScore,
              ...(hit.providerMetadata ? { providerMetadata: hit.providerMetadata } : {}),
              formulation: search.formulation,
            });
          }
        }
        const packet = packetSchema.parse({
          availability: "available",
          releaseId: release.id,
          endpoint,
          requiredInstanceIds,
          candidates: normalizeCandidates(normalized),
          partialErrors: [],
        });
        emitOutcome("ok", null, packet.candidates.length);
        return packet;
      } catch {
        emitOutcome("unavailable", "provider_unavailable");
        return unavailable(release, endpoint, [{ code: "CANDIDATE_PROVIDER_UNAVAILABLE" }]);
      }
    },
  };
}

export async function runCandidateShadow(input: {
  active: LegalCandidateIndex;
  shadow: LegalCandidateIndex;
  interpretation: QuestionInterpretation;
  endpoint: TemporalEndpoint;
  release: PinnedCandidateRelease;
  observe: (packet: CandidatePacket) => void;
}): Promise<CandidatePacket> {
  const shadow = input.shadow.retrieve(input.interpretation, input.endpoint, input.release)
    .then(input.observe)
    .catch(() => input.observe(unavailable(input.release, input.endpoint, [{
      code: "CANDIDATE_PROVIDER_UNAVAILABLE",
    }])));
  void shadow;
  return input.active.retrieve(input.interpretation, input.endpoint, input.release);
}
