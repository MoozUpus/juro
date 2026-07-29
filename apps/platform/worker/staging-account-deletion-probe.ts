import {
  accountDeletionLifecycleStatement,
  accountDeletionSubjectHash,
  createAccountDeletionLifecycleRecord,
} from "../lib/auth/account-deletion-lifecycle";

const PROBE_ID = /^staging-probe-[a-z0-9-]{8,80}$/;

type StagingDeletionProbeEnv = {
  APP_ENV: string;
  DB: D1Database;
  BUCKET: R2Bucket;
  IDENTITY_KEYRING?: string;
  STAGING_SYNTHETIC_PROBES_ENABLED?: string;
};

export class StagingDeletionProbeError extends Error {
  constructor(
    readonly code:
      | "STAGING_SYNTHETIC_PROBE_DISABLED"
      | "STAGING_SYNTHETIC_PROBE_FAILED",
  ) {
    super(code);
    this.name = "StagingDeletionProbeError";
  }
}

export function isStagingDeletionProbe(requestId: string): boolean {
  return PROBE_ID.test(requestId);
}

export function stagingDeletionProbeObjectKey(requestId: string): string {
  if (!isStagingDeletionProbe(requestId)) {
    throw new TypeError("INVALID_STAGING_DELETION_PROBE_ID");
  }
  return `staging-probes/account-deletion/${requestId}/synthetic.bin`;
}

/**
 * Creates a minimal synthetic account-deletion fixture inside the deployed
 * staging runtime. The real identity keyring never leaves the Worker. The
 * fixture is deliberately unreachable in production and can only be invoked
 * through an opaque cleanup job already written to the protected D1 outbox.
 */
export async function prepareStagingDeletionProbe(
  env: StagingDeletionProbeEnv,
  requestId: string,
  now = new Date().toISOString(),
): Promise<"created" | "already_exists"> {
  if (
    env.APP_ENV !== "staging"
    || env.STAGING_SYNTHETIC_PROBES_ENABLED !== "true"
    || !isStagingDeletionProbe(requestId)
  ) {
    throw new StagingDeletionProbeError("STAGING_SYNTHETIC_PROBE_DISABLED");
  }

  const existing = await env.DB.prepare(
    "SELECT 1 AS present FROM account_deletion_requests WHERE id=? LIMIT 1",
  ).bind(requestId).first<{ present: number }>();
  if (existing) return "already_exists";

  const suffix = requestId.slice("staging-probe-".length);
  const userId = `staging-probe-user-${suffix}`;
  const controlUserId = `staging-probe-control-${suffix}`;
  const workspaceId = `staging-probe-workspace-${suffix}`;
  const fileId = `staging-probe-file-${suffix}`;
  const objectKey = stagingDeletionProbeObjectKey(requestId);
  const subject = await accountDeletionSubjectHash(env.IDENTITY_KEYRING, userId);
  const lifecycleInput = {
    requestId,
    subjectHash: subject.hash,
    subjectKeyVersion: subject.keyVersion,
    eventType: "scheduled" as const,
    deletionMode: "immediate" as const,
    summary: { purpose: "staging-runtime-proof", scheduledPurgeAt: now },
    createdAt: now,
  };
  const lifecycle = await createAccountDeletionLifecycleRecord(
    env.DB,
    lifecycleInput,
  );

  await env.BUCKET.put(
    objectKey,
    new TextEncoder().encode(
      `JURO synthetic staging deletion probe ${requestId}\n`,
    ),
    {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: {
        environment: "staging",
        purpose: "account-deletion-probe",
      },
    },
  );

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_profiles (
           id,email,full_name,locale,lifecycle_status,created_at,updated_at
         ) VALUES (?,?,'Synthetic deletion probe','ru','active',?,?)`,
      ).bind(userId, `deletion-${suffix}@example.test`, now, now),
      env.DB.prepare(
        `INSERT INTO user_profiles (
           id,email,full_name,locale,lifecycle_status,created_at,updated_at
         ) VALUES (?,?,'Synthetic control owner','ru','active',?,?)`,
      ).bind(controlUserId, `control-${suffix}@example.test`, now, now),
      env.DB.prepare(
        `INSERT INTO workspaces (id,type,name,locale,created_at,updated_at)
         VALUES (?,'business','Synthetic deletion probe','ru',?,?)`,
      ).bind(workspaceId, now, now),
      env.DB.prepare(
        `INSERT INTO workspace_members (
           id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
         ) VALUES (?,?,?,'owner','active',?,?,?)`,
      ).bind(
        `staging-probe-member-${suffix}`,
        workspaceId,
        userId,
        now,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO workspace_members (
           id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
         ) VALUES (?,?,?,'owner','active',?,?,?)`,
      ).bind(
        `staging-probe-control-member-${suffix}`,
        workspaceId,
        controlUserId,
        now,
        now,
        now,
      ),
      env.DB.prepare(
        "UPDATE user_profiles SET default_workspace_id=? WHERE id IN (?,?)",
      ).bind(workspaceId, userId, controlUserId),
      env.DB.prepare(
        `INSERT INTO account_deletion_requests (
           id,user_id,status,deletion_mode,subject_hash,subject_key_version,
           verification_method,verified_at,requested_at,scheduled_purge_at
         ) VALUES (?,?,'scheduled','immediate',?,?,'synthetic_staging_probe',?,?,?)`,
      ).bind(requestId, userId, subject.hash, subject.keyVersion, now, now, now),
      accountDeletionLifecycleStatement(env.DB, lifecycleInput, lifecycle),
      env.DB.prepare(
        `INSERT INTO document_files (
           id,workspace_id,document_id,owner_user_id,kind,r2_key,file_name,
           mime_type,size_bytes,created_at,updated_at
         ) VALUES (?,?,NULL,?,'original',?,'synthetic.bin',
           'application/octet-stream',1,?,?)`,
      ).bind(fileId, workspaceId, userId, objectKey, now, now),
    ]);
  } catch {
    await env.BUCKET.delete(objectKey).catch(() => undefined);
    throw new StagingDeletionProbeError("STAGING_SYNTHETIC_PROBE_FAILED");
  }

  return "created";
}