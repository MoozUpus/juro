import { z } from "zod";

import {
  acceptsPrivateServiceRequest,
  privateServiceJson,
} from "./private-service-boundary";

export const LEGAL_TARGET_READINESS_PATH = "/internal/legal-corpus/target/readiness";

const SERVICE_BINDING_MARKER = "legal-target-storage-v1";
const environmentSchema = z.enum(["development", "staging", "production"]);
const controlRowSchema = z.object({
  environment: environmentSchema,
  migrationState: z.enum(["initialized", "migrating", "ready", "blocked"]),
  evidenceBucketName: z.string().regex(/^juro-legal-evidence-(?:development|staging|production)$/u),
}).strict();
const bucketControlSchema = z.object({
  environment: environmentSchema,
  bucketName: z.string().regex(/^juro-legal-evidence-(?:development|staging|production)$/u),
  schemaVersion: z.literal("1"),
}).strict();
const readinessSchema = z.object({
  environment: environmentSchema,
  database: z.literal("ready"),
  evidenceBucket: z.literal("ready"),
  migrationState: controlRowSchema.shape.migrationState,
}).strict();

export type LegalTargetReadiness = z.infer<typeof readinessSchema>;
type LegalTargetDatabaseReader = {
  prepare(query: string): {
    first(): Promise<unknown>;
  };
};
type LegalTargetBucketReader = {
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
};
export type LegalTargetReadinessEnv = Pick<LegalCorpusDevelopmentEnv, "APP_ENV">
  & Partial<Pick<LegalCorpusDevelopmentEnv, "LEGAL_EVIDENCE_BUCKET_NAME">>
  & {
    LEGAL_DB?: LegalTargetDatabaseReader;
    LEGAL_EVIDENCE_BUCKET?: LegalTargetBucketReader;
  };

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
  if (!env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET || !env.LEGAL_EVIDENCE_BUCKET_NAME) {
    return privateServiceJson({ code: "LEGAL_TARGET_STORAGE_UNBOUND" }, 503);
  }

  try {
    const [rawControl, bucketObject] = await Promise.all([
      env.LEGAL_DB.prepare(`SELECT environment,migration_state AS migrationState,
        evidence_bucket_name AS evidenceBucketName
        FROM legal_target_control WHERE control_key='environment'`).first(),
      env.LEGAL_EVIDENCE_BUCKET.head(`control/environments/${environment.data}.json`),
    ]);
    const control = controlRowSchema.parse(rawControl);
    const bucketControl = bucketControlSchema.parse(bucketObject?.customMetadata ?? null);
    if (
      control.environment !== environment.data
      || control.evidenceBucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME
      || bucketControl.environment !== environment.data
      || bucketControl.bucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME
    ) {
      return privateServiceJson({ code: "LEGAL_TARGET_ENVIRONMENT_MISMATCH" }, 503);
    }
    return privateServiceJson({
      environment: environment.data,
      database: "ready",
      evidenceBucket: "ready",
      migrationState: control.migrationState,
    } satisfies LegalTargetReadiness);
  } catch {
    return privateServiceJson({ code: "LEGAL_TARGET_STORAGE_UNAVAILABLE" }, 503);
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
      if (!response.ok) throw new TypeError("LEGAL_TARGET_STORAGE_UNAVAILABLE");
      return readinessSchema.parse(await response.json());
    },
  };
}
