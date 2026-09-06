import { sha256 } from "./crypto";

const GENESIS_HASH = "0".repeat(64);
// A login challenge permits five concurrent, already-reserved MFA attempts.
// The append-only event chain must therefore tolerate all five settlements
// racing on the same user's chain head without dropping an auth-state update.
const MAX_CHAIN_RETRIES = 8;

export type SecurityEventSeverity = "info" | "warning" | "critical";

export type SecurityEventInput = {
  id?: string;
  userId: string;
  sessionId?: string | null;
  deviceId?: string | null;
  eventType: string;
  severity?: SecurityEventSeverity;
  authSource?: string | null;
  assuranceLevel?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type SecurityEventRecord = {
  id: string;
  previousHash: string;
  eventHash: string;
  metadataJson: string | null;
};

export type SecurityEventGuard = {
  selectSql: string;
  bindings: Array<string | number | null>;
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

function canonicalJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(canonicalize(value)) : null;
}

async function chainHead(
  db: D1Database,
  userId: string,
): Promise<string> {
  const row = await db.prepare(
    `SELECT event.event_hash AS eventHash
     FROM security_events event
     WHERE event.user_id=?
       AND NOT EXISTS (
         SELECT 1
         FROM security_events child
         WHERE child.user_id=event.user_id
           AND child.previous_hash=event.event_hash
       )
     LIMIT 1`,
  ).bind(userId).first<{ eventHash: string }>();
  return row?.eventHash ?? GENESIS_HASH;
}

export async function createSecurityEventRecord(
  db: D1Database,
  input: SecurityEventInput,
): Promise<SecurityEventRecord> {
  const id = input.id ?? crypto.randomUUID();
  const previousHash = await chainHead(db, input.userId);
  const metadataJson = canonicalJson(input.metadata);
  const eventHash = await sha256([
    "juro-security-event-v1",
    previousHash,
    id,
    input.userId,
    input.sessionId ?? "",
    input.deviceId ?? "",
    input.eventType,
    input.severity ?? "info",
    input.authSource ?? "",
    input.assuranceLevel ?? "",
    input.ipHash ?? "",
    input.userAgentHash ?? "",
    metadataJson ?? "",
    input.createdAt,
  ].join("\n"));
  return { id, previousHash, eventHash, metadataJson };
}

function eventStatement(
  db: D1Database,
  input: SecurityEventInput,
  record: SecurityEventRecord,
  guard?: SecurityEventGuard,
): D1PreparedStatement {
  if (
    guard
    && (
      !/^\s*SELECT\b/i.test(guard.selectSql)
      || guard.selectSql.includes(";")
    )
  ) {
    throw new Error("INVALID_SECURITY_EVENT_GUARD");
  }
  const values = [
    record.id,
    input.userId,
    input.sessionId ?? null,
    input.deviceId ?? null,
    input.eventType,
    input.severity ?? "info",
    input.authSource ?? null,
    input.assuranceLevel ?? null,
    input.ipHash ?? null,
    input.userAgentHash ?? null,
    record.metadataJson,
    record.previousHash,
    record.eventHash,
    input.createdAt,
  ];
  const statement = guard
    ? `INSERT INTO security_events (
       id,user_id,session_id,device_id,event_type,severity,auth_source,
       assurance_level,ip_hash,user_agent_hash,metadata_json,previous_hash,
       event_hash,created_at
     )
     SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?
     WHERE EXISTS (${guard.selectSql})`
    : `INSERT INTO security_events (
       id,user_id,session_id,device_id,event_type,severity,auth_source,
       assurance_level,ip_hash,user_agent_hash,metadata_json,previous_hash,
       event_hash,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  return db.prepare(statement).bind(
    ...values,
    ...(guard?.bindings ?? []),
  );
}

function isChainConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("security_events_chain_uidx")
    || message.includes("security_events.previous_hash")
    || message.includes("UNIQUE constraint failed: security_events.user_id, security_events.previous_hash");
}

/**
 * Runs state changes and their audit event in one D1 transaction. The unique
 * (user_id, previous_hash) index rejects chain forks; a concurrent writer is
 * retried against the new head.
 */
export async function batchWithSecurityEvent(
  db: D1Database,
  input: SecurityEventInput,
  statements: (record: SecurityEventRecord) => D1PreparedStatement[],
  eventGuard?: SecurityEventGuard,
): Promise<D1Result[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CHAIN_RETRIES; attempt += 1) {
    const record = await createSecurityEventRecord(db, input);
    try {
      return await db.batch([
        ...statements(record),
        eventStatement(db, input, record, eventGuard),
      ]);
    } catch (error) {
      lastError = error;
      if (!isChainConflict(error)) throw error;
    }
  }
  throw lastError;
}

export function verifySecurityEventChain(
  events: Array<SecurityEventInput & SecurityEventRecord>,
): Promise<boolean> {
  return events.reduce(
    async (validPromise, event, index) => {
      if (!await validPromise) return false;
      const expectedPrevious = index === 0
        ? GENESIS_HASH
        : events[index - 1].eventHash;
      if (event.previousHash !== expectedPrevious) return false;
      const metadataJson = canonicalJson(event.metadata);
      const expected = await sha256([
        "juro-security-event-v1",
        event.previousHash,
        event.id,
        event.userId,
        event.sessionId ?? "",
        event.deviceId ?? "",
        event.eventType,
        event.severity ?? "info",
        event.authSource ?? "",
        event.assuranceLevel ?? "",
        event.ipHash ?? "",
        event.userAgentHash ?? "",
        metadataJson ?? "",
        event.createdAt,
      ].join("\n"));
      return expected === event.eventHash;
    },
    Promise.resolve(true),
  );
}
