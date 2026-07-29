import { sha256 } from "./crypto";
import {
  identityLookupHmac,
  parseIdentityKeyring,
} from "./keyring";

export const ACCOUNT_DELETION_POLICY_VERSION = "account-purge-v1";
export const RECOVERABLE_DELETION_DELAY_MS = 30 * 24 * 60 * 60 * 1_000;

const GENESIS_HASH = "0".repeat(64);

export type AccountDeletionMode = "immediate" | "recoverable_30d";
export type AccountDeletionLifecycleEventType =
  | "scheduled"
  | "cancelled"
  | "purge_started"
  | "blocked"
  | "completed"
  | "failed";

export type AccountDeletionLifecycleInput = {
  id?: string;
  requestId: string;
  subjectHash: string;
  subjectKeyVersion: string;
  eventType: AccountDeletionLifecycleEventType;
  deletionMode: AccountDeletionMode;
  summary?: Record<string, unknown>;
  createdAt: string;
};

export type AccountDeletionLifecycleRecord = {
  id: string;
  previousHash: string;
  eventHash: string;
  summaryJson: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(canonicalize(value ?? {}));
}

export async function accountDeletionSubjectHash(
  rawKeyring: string | null | undefined,
  userId: string,
  keyVersion?: string,
): Promise<{ hash: string; keyVersion: string }> {
  const keyring = parseIdentityKeyring(rawKeyring);
  const keyed = await identityLookupHmac(
    keyring,
    userId,
    "account-deletion-subject-v1",
    keyVersion,
  );
  return {
    hash: await sha256([
      "juro-account-deletion-subject-v1",
      keyed.keyVersion,
      keyed.digest,
    ].join("\n")),
    keyVersion: keyed.keyVersion,
  };
}

async function lifecycleHead(
  db: D1Database,
  requestId: string,
): Promise<string> {
  const row = await db.prepare(
    `SELECT event.event_hash AS eventHash
     FROM account_deletion_lifecycle_events event
     WHERE event.request_id=?
       AND NOT EXISTS (
         SELECT 1
         FROM account_deletion_lifecycle_events child
         WHERE child.request_id=event.request_id
           AND child.previous_hash=event.event_hash
       )
     LIMIT 1`,
  ).bind(requestId).first<{ eventHash: string }>();
  return row?.eventHash ?? GENESIS_HASH;
}

export async function createAccountDeletionLifecycleRecord(
  db: D1Database,
  input: AccountDeletionLifecycleInput,
): Promise<AccountDeletionLifecycleRecord> {
  if (!/^[a-f0-9]{64}$/.test(input.subjectHash)) {
    throw new TypeError("INVALID_DELETION_SUBJECT_HASH");
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(input.subjectKeyVersion)) {
    throw new TypeError("INVALID_DELETION_SUBJECT_KEY_VERSION");
  }
  const id = input.id ?? crypto.randomUUID();
  const previousHash = await lifecycleHead(db, input.requestId);
  const summaryJson = canonicalJson(input.summary);
  const eventHash = await sha256([
    "juro-account-deletion-lifecycle-v1",
    previousHash,
    id,
    input.requestId,
    input.subjectHash,
    input.subjectKeyVersion,
    input.eventType,
    input.deletionMode,
    ACCOUNT_DELETION_POLICY_VERSION,
    summaryJson,
    input.createdAt,
  ].join("\n"));
  return { id, previousHash, eventHash, summaryJson };
}

export function accountDeletionLifecycleStatement(
  db: D1Database,
  input: AccountDeletionLifecycleInput,
  record: AccountDeletionLifecycleRecord,
  guard?: { selectSql: string; bindings: Array<string | number | null> },
): D1PreparedStatement {
  if (
    guard
    && (!/^\s*SELECT\b/i.test(guard.selectSql) || guard.selectSql.includes(";"))
  ) {
    throw new TypeError("INVALID_DELETION_LIFECYCLE_GUARD");
  }
  const values = [
    record.id,
    input.requestId,
    input.subjectHash,
    input.subjectKeyVersion,
    input.eventType,
    input.deletionMode,
    ACCOUNT_DELETION_POLICY_VERSION,
    record.summaryJson,
    record.previousHash,
    record.eventHash,
    input.createdAt,
  ];
  const sql = guard
    ? `INSERT INTO account_deletion_lifecycle_events (
       id,request_id,subject_hash,subject_key_version,event_type,deletion_mode,
       policy_version,summary_json,previous_hash,event_hash,created_at
     )
     SELECT ?,?,?,?,?,?,?,?,?,?,?
     WHERE EXISTS (${guard.selectSql})`
    : `INSERT INTO account_deletion_lifecycle_events (
       id,request_id,subject_hash,subject_key_version,event_type,deletion_mode,
       policy_version,summary_json,previous_hash,event_hash,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
  return db.prepare(sql).bind(...values, ...(guard?.bindings ?? []));
}

export async function deletionPurgeEvidenceHash(input: {
  requestId: string;
  subjectHash: string;
  subjectKeyVersion: string;
  deletionMode: AccountDeletionMode;
  requestedAt: string;
  completedAt: string;
  r2DeletedCount: number;
  d1DeletedCount: number;
  redactedCount: number;
  retainedEvidenceJson: string;
}): Promise<string> {
  return sha256([
    "juro-account-deletion-purge-evidence-v1",
    input.requestId,
    input.subjectHash,
    input.subjectKeyVersion,
    input.deletionMode,
    ACCOUNT_DELETION_POLICY_VERSION,
    input.requestedAt,
    input.completedAt,
    String(input.r2DeletedCount),
    String(input.d1DeletedCount),
    String(input.redactedCount),
    input.retainedEvidenceJson,
  ].join("\n"));
}