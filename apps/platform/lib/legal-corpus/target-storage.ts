import { z } from "zod";

import {
  acceptsPrivateServiceRequest,
  privateServiceJson,
} from "./private-service-boundary";
import {
  serializeLegalEnvironmentControlObject,
  sha256Schema,
} from "./target-domain-schemas";

export const LEGAL_TARGET_READINESS_PATH = "/internal/legal-corpus/target/readiness";

const SERVICE_BINDING_MARKER = "legal-target-storage-v1";
const SAFE_READINESS_ERROR_CODES = new Set([
  "LEGAL_TARGET_CONFIGURATION_DRIFT",
  "LEGAL_TARGET_DATABASE_UNAVAILABLE",
  "LEGAL_TARGET_EVIDENCE_BUCKET_UNAVAILABLE",
  "LEGAL_TARGET_AI_SEARCH_NAMESPACE_UNAVAILABLE",
  "LEGAL_TARGET_STORAGE_EVIDENCE_INVALID",
]);
const environmentSchema = z.enum(["development", "staging", "production"]);
const evidenceBucketNameSchema = z.string().regex(
  /^juro-legal-evidence-(?:development|staging|production)(?:-[a-z0-9]+)*$/u,
);
const controlRowSchema = z.object({
  environment: environmentSchema,
  migrationState: z.enum(["initialized", "migrating", "ready", "blocked"]),
  evidenceBucketName: evidenceBucketNameSchema,
}).strict();
const bucketControlSchema = z.object({
  environment: environmentSchema,
  bucketName: evidenceBucketNameSchema,
  schemaVersion: z.literal("1"),
  sha256: sha256Schema,
}).strict();
const readinessSchema = z.object({
  environment: environmentSchema,
  database: z.literal("ready"),
  evidenceBucket: z.literal("ready"),
  migrationState: controlRowSchema.shape.migrationState,
  aiSearchNamespace: z.literal("ready"),
  aiSearchInstanceCount: z.number().int().nonnegative(),
  declaredConfigurationIdentity: z.string()
    .regex(/^ai-search-(?:development|staging|production)-v\d+$/u),
  controlPlaneAttestation: z.literal("required"),
}).strict();
const infrastructureConfigurationSchema = z.object({
  namespace: z.string(),
  configurationIdentity: z.string(),
  gatewayIdentity: z.string(),
  providerProjectIdentity: z.string(),
  embeddingModel: z.literal("openai/text-embedding-3-large"),
  dimensions: z.literal("1536"),
  keywordTokenizer: z.literal("porter"),
  metadataSchema: z.literal(
    "language:text,document_type:text,valid_from:datetime,valid_to:datetime",
  ),
  sourcePrefix: z.literal("search-releases/"),
  maximumResults: z.literal("50"),
  maximumInstances: z.literal("10"),
  paused: z.literal("true"),
  gatewayPayloadLogging: z.literal("false"),
  gatewayCache: z.literal("false"),
  similarityCache: z.literal("false"),
}).strict();

export type LegalTargetReadiness = z.infer<typeof readinessSchema>;

async function expectedBucketControlSha256(
  control: z.infer<typeof bucketControlSchema>,
): Promise<string> {
  const body = serializeLegalEnvironmentControlObject({
    environment: control.environment,
    bucketName: control.bucketName,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}
type LegalTargetDatabaseReader = {
  prepare(query: string): {
    first(): Promise<unknown>;
  };
};
type LegalTargetBucketReader = {
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
};
type InfrastructureBindingKey =
  | "LEGAL_AI_SEARCH_NAMESPACE"
  | "LEGAL_AI_SEARCH_NAMESPACE_NAME"
  | "LEGAL_AI_SEARCH_CONFIGURATION_ID"
  | "LEGAL_AI_GATEWAY_ID"
  | "LEGAL_AI_PROVIDER_PROJECT_ID"
  | "LEGAL_AI_SEARCH_EMBEDDING_MODEL"
  | "LEGAL_AI_SEARCH_DIMENSIONS"
  | "LEGAL_AI_SEARCH_KEYWORD_TOKENIZER"
  | "LEGAL_AI_SEARCH_METADATA_SCHEMA"
  | "LEGAL_AI_SEARCH_SOURCE_PREFIX"
  | "LEGAL_AI_SEARCH_MAX_RESULTS"
  | "LEGAL_AI_SEARCH_MAX_INSTANCES_PER_QUERY"
  | "LEGAL_AI_SEARCH_PAUSED"
  | "LEGAL_AI_SEARCH_GATEWAY_PAYLOAD_LOGGING"
  | "LEGAL_AI_SEARCH_GATEWAY_CACHE"
  | "LEGAL_AI_SEARCH_SIMILARITY_CACHE";
export type LegalTargetReadinessEnv = Pick<LegalCorpusDevelopmentEnv, "APP_ENV">
  & Partial<Pick<LegalCorpusDevelopmentEnv, InfrastructureBindingKey>> & {
    LEGAL_EVIDENCE_BUCKET_NAME?: string;
    LEGAL_DB?: LegalTargetDatabaseReader;
    LEGAL_EVIDENCE_BUCKET?: LegalTargetBucketReader;
  };

function assertPinnedInfrastructureConfiguration(
  env: LegalTargetReadinessEnv,
  environment: z.infer<typeof environmentSchema>,
): string {
  const parsedConfiguration = infrastructureConfigurationSchema.safeParse({
    namespace: env.LEGAL_AI_SEARCH_NAMESPACE_NAME,
    configurationIdentity: env.LEGAL_AI_SEARCH_CONFIGURATION_ID,
    gatewayIdentity: env.LEGAL_AI_GATEWAY_ID,
    providerProjectIdentity: env.LEGAL_AI_PROVIDER_PROJECT_ID,
    embeddingModel: env.LEGAL_AI_SEARCH_EMBEDDING_MODEL,
    dimensions: env.LEGAL_AI_SEARCH_DIMENSIONS,
    keywordTokenizer: env.LEGAL_AI_SEARCH_KEYWORD_TOKENIZER,
    metadataSchema: env.LEGAL_AI_SEARCH_METADATA_SCHEMA,
    sourcePrefix: env.LEGAL_AI_SEARCH_SOURCE_PREFIX,
    maximumResults: env.LEGAL_AI_SEARCH_MAX_RESULTS,
    maximumInstances: env.LEGAL_AI_SEARCH_MAX_INSTANCES_PER_QUERY,
    paused: env.LEGAL_AI_SEARCH_PAUSED,
    gatewayPayloadLogging: env.LEGAL_AI_SEARCH_GATEWAY_PAYLOAD_LOGGING,
    gatewayCache: env.LEGAL_AI_SEARCH_GATEWAY_CACHE,
    similarityCache: env.LEGAL_AI_SEARCH_SIMILARITY_CACHE,
  });
  if (!parsedConfiguration.success) throw new TypeError("LEGAL_TARGET_CONFIGURATION_DRIFT");
  const configuration = parsedConfiguration.data;
  if (configuration.namespace !== `juro-legal-${environment}`
    || configuration.configurationIdentity !== `ai-search-${environment}-v1`
    || configuration.gatewayIdentity !== `juro-ai-search-${environment}`
    || configuration.providerProjectIdentity !== `juro-openai-${environment}`) {
    throw new TypeError("LEGAL_TARGET_CONFIGURATION_DRIFT");
  }
  return configuration.configurationIdentity;
}

export async function handleLegalTargetReadinessRequest(
  request: Request,
  env: LegalTargetReadinessEnv,
): Promise<Response> {
  const environment = environmentSchema.safeParse(env.APP_ENV);
  if (!environment.success || !acceptsPrivateServiceRequest(request, {
    environment: environment.data,
    marker: SERVICE_BINDING_MARKER,
    method: "GET",
    path: LEGAL_TARGET_READINESS_PATH,
  })) {
    return privateServiceJson({ code: "LEGAL_TARGET_PRIVATE_ROUTE_REJECTED" }, 404);
  }
  if (!env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET || !env.LEGAL_EVIDENCE_BUCKET_NAME
    || !env.LEGAL_AI_SEARCH_NAMESPACE) {
    return privateServiceJson({ code: "LEGAL_TARGET_STORAGE_UNBOUND" }, 503);
  }

  try {
    const declaredConfigurationIdentity = assertPinnedInfrastructureConfiguration(
      env,
      environment.data,
    );
    const [rawControl, bucketObject, namespaceInstances] = await Promise.all([
      env.LEGAL_DB.prepare(`SELECT environment,migration_state AS migrationState,
        evidence_bucket_name AS evidenceBucketName
        FROM legal_target_control WHERE control_key='environment'`).first()
        .catch(() => { throw new TypeError("LEGAL_TARGET_DATABASE_UNAVAILABLE"); }),
      env.LEGAL_EVIDENCE_BUCKET.head(`control/environments/${environment.data}.json`)
        .catch(() => { throw new TypeError("LEGAL_TARGET_EVIDENCE_BUCKET_UNAVAILABLE"); }),
      env.LEGAL_AI_SEARCH_NAMESPACE.list({ page: 1, per_page: 100 })
        .catch(() => { throw new TypeError("LEGAL_TARGET_AI_SEARCH_NAMESPACE_UNAVAILABLE"); }),
    ]);
    const control = controlRowSchema.safeParse(rawControl);
    const bucketControl = bucketControlSchema.safeParse(bucketObject?.customMetadata ?? null);
    if (!control.success || !bucketControl.success) {
      throw new TypeError("LEGAL_TARGET_STORAGE_EVIDENCE_INVALID");
    }
    if (bucketControl.data.sha256 !== await expectedBucketControlSha256(bucketControl.data)) {
      throw new TypeError("LEGAL_TARGET_STORAGE_EVIDENCE_INVALID");
    }
    if (
      control.data.environment !== environment.data
      || control.data.evidenceBucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME
      || bucketControl.data.environment !== environment.data
      || bucketControl.data.bucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME
      || namespaceInstances.result.some((instance) =>
        instance.namespace !== undefined
        && instance.namespace !== env.LEGAL_AI_SEARCH_NAMESPACE_NAME)
      || (namespaceInstances.result_info !== undefined
        && namespaceInstances.result_info.total_count !== namespaceInstances.result.length)
    ) {
      return privateServiceJson({ code: "LEGAL_TARGET_ENVIRONMENT_MISMATCH" }, 503);
    }
    return privateServiceJson({
      environment: environment.data,
      database: "ready",
      evidenceBucket: "ready",
      migrationState: control.data.migrationState,
      aiSearchNamespace: "ready",
      aiSearchInstanceCount: namespaceInstances.result.length,
      declaredConfigurationIdentity,
      controlPlaneAttestation: "required",
    } satisfies LegalTargetReadiness);
  } catch (error) {
    const errorCode = error instanceof TypeError && SAFE_READINESS_ERROR_CODES.has(error.message)
      ? error.message
      : "LEGAL_TARGET_DEPENDENCY_UNAVAILABLE";
    console.error(JSON.stringify({
      service: "legal-corpus-worker",
      event: "legal_target.readiness_unavailable",
      environment: environment.data,
      errorCode,
    }));
    return privateServiceJson({ code: errorCode }, 503);
  }
}

export function createLegalTargetReadinessClient(input: {
  service: Fetcher;
  environment: z.infer<typeof environmentSchema>;
}) {
  return {
    async readiness(): Promise<LegalTargetReadiness> {
      const response = await input.service.fetch(
        `http://legal-corpus.internal${LEGAL_TARGET_READINESS_PATH}`,
        {
          method: "GET",
          headers: {
            "x-juro-service-binding": SERVICE_BINDING_MARKER,
            "x-juro-legal-environment": input.environment,
          },
        },
      );
      if (!response.ok) {
        const failure = z.object({ code: z.string() }).passthrough()
          .safeParse(await response.json());
        throw new TypeError(failure.success
          ? failure.data.code
          : "LEGAL_TARGET_STORAGE_UNAVAILABLE");
      }
      return readinessSchema.parse(await response.json());
    },
  };
}
