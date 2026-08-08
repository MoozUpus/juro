import { z } from "zod";
import {
  requirePlatformStaffAccess,
  type PlatformStaffAccess,
} from "../auth/staff-access";
import type { LocalSession } from "../auth/session-management";

export const LEGAL_SOURCE_LIFECYCLE_ERROR_CODES = [
  "LEGAL_SOURCE_LIFECYCLE_NOT_FOUND",
  "LEGAL_SOURCE_LIFECYCLE_STATE_CONFLICT",
  "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
  "LEGAL_SOURCE_LIFECYCLE_PERSISTENCE_FAILED",
] as const;

export type LegalSourceLifecycleErrorCode =
  (typeof LEGAL_SOURCE_LIFECYCLE_ERROR_CODES)[number];

export class LegalSourceLifecycleError extends Error {
  constructor(readonly code: LegalSourceLifecycleErrorCode) {
    super(code);
    this.name = "LegalSourceLifecycleError";
  }
}

export type LegalSourceLifecycleEnv = {
  DB: D1Database;
};

export type LegalSourceLifecycleSession = Pick<
  LocalSession,
  "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
>;

const identifierSchema = z.string().min(1).max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const notesSchema = z.string().trim().min(10).max(2_000);

export const legalSourceWithdrawalInputSchema = z.object({
  publicationId: identifierSchema,
  expectedPublicationEvidenceSha256: sha256Schema,
  reasonNotes: notesSchema,
}).strict();

export const legalSourceLifecycleEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: identifierSchema,
  eventType: z.enum([
    "activated_initial",
    "activated_replacement",
    "withdrawn",
  ]),
  sourceId: identifierSchema,
  publicationId: identifierSchema,
  versionId: identifierSchema,
  previousPublicationId: identifierSchema.nullable(),
  previousVersionId: identifierSchema.nullable(),
  reasonNotes: notesSchema.nullable(),
  actedByUserId: identifierSchema,
  actorSessionId: identifierSchema,
  actorAssignmentIds: z.array(identifierSchema).min(1).max(16),
  mfaVerifiedAt: z.string().datetime(),
  occurredAt: z.string().datetime(),
}).strict();

export type LegalSourceActivationPredecessor = {
  publicationId: string;
  versionId: string;
  isCurrent: boolean;
} | null;

type LifecycleEventRow = {
  id: string;
  source_id: string;
  publication_id: string;
  version_id: string;
  previous_publication_id: string | null;
  previous_version_id: string | null;
  event_type: string;
  reason_notes: string | null;
  acted_by_user_id: string;
  actor_session_id: string;
  actor_assignment_ids_json: string;
  mfa_verified_at: string;
  evidence_json: string;
  evidence_sha256: string;
  occurred_at: string;
};

type WithdrawalStateRow = {
  publication_id: string;
  source_id: string;
  version_id: string;
  publication_evidence_sha256: string;
  source_status: string;
  source_verification_state: string;
  source_content_sha256: string | null;
  version_status: string;
  version_content_sha256: string;
  current_publication_id: string | null;
  current_version_id: string | null;
};

const FRESH_MFA_WINDOW_MS = 15 * 60 * 1_000;

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function lifecycleAccess(
  db: D1Database,
  session: LegalSourceLifecycleSession,
  now: Date,
): Promise<PlatformStaffAccess> {
  return requirePlatformStaffAccess(
    db,
    session,
    "legal.sources.publish",
    { now, freshMfaWithinMs: FRESH_MFA_WINDOW_MS },
  );
}

export async function loadLegalSourceActivationPredecessor(
  db: D1Database,
  sourceIdValue: string,
): Promise<LegalSourceActivationPredecessor> {
  const sourceId = identifierSchema.parse(sourceIdValue);
  const current = await db.prepare(`
    SELECT publication_id,version_id
    FROM legal_source_current_activations
    WHERE source_id=?
    LIMIT 1
  `).bind(sourceId).first<{
    publication_id: string;
    version_id: string;
  }>();
  if (current) {
    return {
      publicationId: identifierSchema.parse(current.publication_id),
      versionId: identifierSchema.parse(current.version_id),
      isCurrent: true,
    };
  }
  const latest = await db.prepare(`
    SELECT id AS publication_id,version_id
    FROM legal_source_publications
    WHERE source_id=?
    ORDER BY published_at DESC,id DESC
    LIMIT 1
  `).bind(sourceId).first<{
    publication_id: string;
    version_id: string;
  }>();
  return latest
    ? {
      publicationId: identifierSchema.parse(latest.publication_id),
      versionId: identifierSchema.parse(latest.version_id),
      isCurrent: false,
    }
    : null;
}

async function buildLifecycleEvent(
  access: PlatformStaffAccess,
  input: {
    eventType: "activated_initial" | "activated_replacement" | "withdrawn";
    sourceId: string;
    publicationId: string;
    versionId: string;
    previousPublicationId: string | null;
    previousVersionId: string | null;
    reasonNotes: string | null;
    occurredAt: string;
  },
) {
  const stableHash = await sha256Text([
    input.eventType,
    input.sourceId,
    input.publicationId,
    input.versionId,
    input.previousPublicationId ?? "",
    input.previousVersionId ?? "",
  ].join("\n"));
  const eventId = `lslifecycle_${stableHash.slice(0, 32)}`;
  const actorAssignmentIds = [...access.assignmentIds].sort();
  const evidenceJson = JSON.stringify(
    legalSourceLifecycleEvidenceSchema.parse({
      schemaVersion: 1,
      eventId,
      eventType: input.eventType,
      sourceId: input.sourceId,
      publicationId: input.publicationId,
      versionId: input.versionId,
      previousPublicationId: input.previousPublicationId,
      previousVersionId: input.previousVersionId,
      reasonNotes: input.reasonNotes,
      actedByUserId: access.userId,
      actorSessionId: access.sessionId,
      actorAssignmentIds,
      mfaVerifiedAt: access.mfaVerifiedAt,
      occurredAt: input.occurredAt,
    }),
  );
  return {
    eventId,
    actorAssignmentIdsJson: JSON.stringify(actorAssignmentIds),
    evidenceJson,
    evidenceSha256: await sha256Text(evidenceJson),
    ...input,
  };
}

export async function prepareLegalSourceActivation(
  db: D1Database,
  access: PlatformStaffAccess,
  input: {
    sourceId: string;
    publicationId: string;
    versionId: string;
    predecessor: LegalSourceActivationPredecessor;
    activatedAt: string;
  },
): Promise<{
  eventId: string;
  eventType: "activated_initial" | "activated_replacement";
  evidenceSha256: string;
  statements: D1PreparedStatement[];
}> {
  const eventType = input.predecessor
    ? "activated_replacement" as const
    : "activated_initial" as const;
  const event = await buildLifecycleEvent(access, {
    eventType,
    sourceId: input.sourceId,
    publicationId: input.publicationId,
    versionId: input.versionId,
    previousPublicationId: input.predecessor?.publicationId ?? null,
    previousVersionId: input.predecessor?.versionId ?? null,
    reasonNotes: null,
    occurredAt: input.activatedAt,
  });
  const statements = [
    db.prepare(`
      INSERT INTO legal_source_lifecycle_events (
        id,source_id,publication_id,version_id,previous_publication_id,
        previous_version_id,event_type,reason_notes,acted_by_user_id,
        actor_session_id,actor_assignment_ids_json,mfa_verified_at,
        evidence_json,evidence_sha256,occurred_at,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      event.eventId,
      event.sourceId,
      event.publicationId,
      event.versionId,
      event.previousPublicationId,
      event.previousVersionId,
      event.eventType,
      event.reasonNotes,
      access.userId,
      access.sessionId,
      event.actorAssignmentIdsJson,
      access.mfaVerifiedAt,
      event.evidenceJson,
      event.evidenceSha256,
      event.occurredAt,
      event.occurredAt,
    ),
  ];
  if (input.predecessor?.isCurrent) {
    statements.push(db.prepare(`
      UPDATE legal_source_current_activations
      SET publication_id=?,version_id=?,activated_by_user_id=?,
        activated_at=?,updated_at=?
      WHERE source_id=? AND publication_id=? AND version_id=?
    `).bind(
      input.publicationId,
      input.versionId,
      access.userId,
      input.activatedAt,
      input.activatedAt,
      input.sourceId,
      input.predecessor.publicationId,
      input.predecessor.versionId,
    ));
  } else {
    statements.push(db.prepare(`
      INSERT INTO legal_source_current_activations (
        source_id,publication_id,version_id,activated_by_user_id,
        activated_at,updated_at
      ) VALUES (?,?,?,?,?,?)
    `).bind(
      input.sourceId,
      input.publicationId,
      input.versionId,
      access.userId,
      input.activatedAt,
      input.activatedAt,
    ));
  }
  return {
    eventId: event.eventId,
    eventType,
    evidenceSha256: event.evidenceSha256,
    statements,
  };
}

async function loadLifecycleEvent(
  db: D1Database,
  publicationId: string,
  eventTypes: readonly string[],
): Promise<LifecycleEventRow | null> {
  const placeholders = eventTypes.map(() => "?").join(",");
  return db.prepare(`
    SELECT id,source_id,publication_id,version_id,
      previous_publication_id,previous_version_id,event_type,reason_notes,
      acted_by_user_id,actor_session_id,actor_assignment_ids_json,
      mfa_verified_at,evidence_json,evidence_sha256,occurred_at
    FROM legal_source_lifecycle_events
    WHERE publication_id=? AND event_type IN (${placeholders})
    ORDER BY occurred_at DESC,id DESC
    LIMIT 1
  `).bind(publicationId, ...eventTypes).first<LifecycleEventRow>();
}

async function validateEventEvidence(
  event: LifecycleEventRow,
): Promise<z.infer<typeof legalSourceLifecycleEvidenceSchema>> {
  let evidence: z.infer<typeof legalSourceLifecycleEvidenceSchema>;
  try {
    evidence = legalSourceLifecycleEvidenceSchema.parse(
      JSON.parse(event.evidence_json),
    );
  } catch {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
  }
  if (
    await sha256Text(event.evidence_json) !== event.evidence_sha256
    || evidence.eventId !== event.id
    || evidence.eventType !== event.event_type
    || evidence.sourceId !== event.source_id
    || evidence.publicationId !== event.publication_id
    || evidence.versionId !== event.version_id
    || evidence.previousPublicationId !== event.previous_publication_id
    || evidence.previousVersionId !== event.previous_version_id
    || evidence.reasonNotes !== event.reason_notes
    || evidence.actedByUserId !== event.acted_by_user_id
    || evidence.actorSessionId !== event.actor_session_id
    || JSON.stringify(evidence.actorAssignmentIds)
      !== event.actor_assignment_ids_json
    || evidence.mfaVerifiedAt !== event.mfa_verified_at
    || evidence.occurredAt !== event.occurred_at
  ) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
  }
  return evidence;
}

export async function validateLegalSourcePublicationLifecycle(
  db: D1Database,
  input: {
    sourceId: string;
    publicationId: string;
    versionId: string;
  },
): Promise<{
  eventId: string;
  eventType: "activated_initial" | "activated_replacement";
  current: boolean;
  retired: boolean;
  withdrawn: boolean;
  replaced: boolean;
}> {
  const activation = await loadLifecycleEvent(
    db,
    input.publicationId,
    ["activated_initial", "activated_replacement"],
  );
  if (
    !activation
    || activation.source_id !== input.sourceId
    || activation.version_id !== input.versionId
  ) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
  }
  await validateEventEvidence(activation);
  const state = await db.prepare(`
    SELECT
      EXISTS(
        SELECT 1 FROM legal_source_current_activations
        WHERE source_id=? AND publication_id=? AND version_id=?
      ) AS is_current,
      EXISTS(
        SELECT 1 FROM legal_source_lifecycle_events
        WHERE source_id=? AND event_type='withdrawn'
          AND publication_id=? AND version_id=?
      ) AS is_withdrawn,
      EXISTS(
        SELECT 1 FROM legal_source_lifecycle_events
        WHERE source_id=? AND event_type='activated_replacement'
          AND previous_publication_id=? AND previous_version_id=?
      ) AS is_replaced
  `).bind(
    input.sourceId,
    input.publicationId,
    input.versionId,
    input.sourceId,
    input.publicationId,
    input.versionId,
    input.sourceId,
    input.publicationId,
    input.versionId,
  ).first<{
    is_current: number;
    is_withdrawn: number;
    is_replaced: number;
  }>();
  if (
    !state
    || (
      state.is_current === 0
      && state.is_withdrawn === 0
      && state.is_replaced === 0
    )
  ) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
  }
  return {
    eventId: activation.id,
    eventType: activation.event_type as
      | "activated_initial"
      | "activated_replacement",
    current: state.is_current === 1,
    retired: state.is_withdrawn === 1 || state.is_replaced === 1,
    withdrawn: state.is_withdrawn === 1,
    replaced: state.is_replaced === 1,
  };
}

async function loadWithdrawalState(
  db: D1Database,
  publicationId: string,
): Promise<WithdrawalStateRow | null> {
  return db.prepare(`
    SELECT publication.id AS publication_id,publication.source_id,
      publication.version_id,publication.publication_evidence_sha256,
      source.status AS source_status,
      source.verification_state AS source_verification_state,
      source.content_sha256 AS source_content_sha256,
      version.status AS version_status,
      version.content_sha256 AS version_content_sha256,
      current.publication_id AS current_publication_id,
      current.version_id AS current_version_id
    FROM legal_source_publications publication
    INNER JOIN legal_sources source ON source.id=publication.source_id
    INNER JOIN legal_source_versions version
      ON version.id=publication.version_id
     AND version.source_id=publication.source_id
    LEFT JOIN legal_source_current_activations current
      ON current.source_id=publication.source_id
    WHERE publication.id=?
    LIMIT 1
  `).bind(publicationId).first<WithdrawalStateRow>();
}

export type LegalSourceWithdrawalResult = {
  eventId: string;
  sourceId: string;
  publicationId: string;
  versionId: string;
  evidenceSha256: string;
  withdrawnAt: string;
  changed: boolean;
};

async function validateWithdrawalReplay(
  state: WithdrawalStateRow,
  event: LifecycleEventRow,
  expectedReasonNotes: string,
): Promise<LegalSourceWithdrawalResult> {
  const evidence = await validateEventEvidence(event);
  if (
    event.event_type !== "withdrawn"
    || event.source_id !== state.source_id
    || event.publication_id !== state.publication_id
    || event.version_id !== state.version_id
    || evidence.reasonNotes !== expectedReasonNotes
    || state.current_publication_id !== null
    || state.current_version_id !== null
    || state.source_status !== "archived"
    || state.source_verification_state !== "archived"
    || state.version_status !== "archived"
  ) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
  }
  return {
    eventId: event.id,
    sourceId: event.source_id,
    publicationId: event.publication_id,
    versionId: event.version_id,
    evidenceSha256: event.evidence_sha256,
    withdrawnAt: evidence.occurredAt,
    changed: false,
  };
}

export async function withdrawPublishedLegalSource(
  env: LegalSourceLifecycleEnv,
  session: LegalSourceLifecycleSession,
  inputValue: unknown,
  options: { now?: Date } = {},
): Promise<LegalSourceWithdrawalResult> {
  const now = options.now ?? new Date();
  const access = await lifecycleAccess(env.DB, session, now);
  const input = legalSourceWithdrawalInputSchema.parse(inputValue);
  const state = await loadWithdrawalState(env.DB, input.publicationId);
  if (!state) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_NOT_FOUND",
    );
  }
  if (
    state.publication_evidence_sha256
      !== input.expectedPublicationEvidenceSha256
  ) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
  }
  const existing = await loadLifecycleEvent(
    env.DB,
    input.publicationId,
    ["withdrawn"],
  );
  if (existing) {
    return validateWithdrawalReplay(state, existing, input.reasonNotes);
  }
  if (
    state.current_publication_id !== state.publication_id
    || state.current_version_id !== state.version_id
    || state.source_status !== "verified"
    || state.source_verification_state !== "verified"
    || state.version_status !== "verified"
    || state.source_content_sha256 !== state.version_content_sha256
  ) {
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_STATE_CONFLICT",
    );
  }
  const withdrawnAt = now.toISOString();
  const event = await buildLifecycleEvent(access, {
    eventType: "withdrawn",
    sourceId: state.source_id,
    publicationId: state.publication_id,
    versionId: state.version_id,
    previousPublicationId: null,
    previousVersionId: null,
    reasonNotes: input.reasonNotes,
    occurredAt: withdrawnAt,
  });
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO legal_source_lifecycle_events (
          id,source_id,publication_id,version_id,previous_publication_id,
          previous_version_id,event_type,reason_notes,acted_by_user_id,
          actor_session_id,actor_assignment_ids_json,mfa_verified_at,
          evidence_json,evidence_sha256,occurred_at,created_at
        ) VALUES (?,?,?,?,NULL,NULL,'withdrawn',?,?,?,?,?,?,?,?,?)
      `).bind(
        event.eventId,
        event.sourceId,
        event.publicationId,
        event.versionId,
        event.reasonNotes,
        access.userId,
        access.sessionId,
        event.actorAssignmentIdsJson,
        access.mfaVerifiedAt,
        event.evidenceJson,
        event.evidenceSha256,
        withdrawnAt,
        withdrawnAt,
      ),
      env.DB.prepare(`
        UPDATE legal_source_versions
        SET status='archived',expires_at=?,updated_at=?
        WHERE id=? AND source_id=? AND status='verified'
      `).bind(
        withdrawnAt,
        withdrawnAt,
        state.version_id,
        state.source_id,
      ),
      env.DB.prepare(`
        UPDATE legal_sources
        SET status='archived',verification_state='archived',
          expires_at=?,updated_at=?
        WHERE id=? AND status='verified' AND verification_state='verified'
          AND content_sha256=?
      `).bind(
        withdrawnAt,
        withdrawnAt,
        state.source_id,
        state.version_content_sha256,
      ),
      env.DB.prepare(`
        DELETE FROM legal_source_current_activations
        WHERE source_id=? AND publication_id=? AND version_id=?
      `).bind(
        state.source_id,
        state.publication_id,
        state.version_id,
      ),
    ]);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) {
      throw new LegalSourceLifecycleError(
        "LEGAL_SOURCE_LIFECYCLE_PERSISTENCE_FAILED",
      );
    }
  } catch (error) {
    const concurrent = await loadLifecycleEvent(
      env.DB,
      input.publicationId,
      ["withdrawn"],
    );
    const currentState = await loadWithdrawalState(env.DB, input.publicationId);
    if (concurrent && currentState) {
      return validateWithdrawalReplay(
        currentState,
        concurrent,
        input.reasonNotes,
      );
    }
    if (error instanceof LegalSourceLifecycleError) throw error;
    throw new LegalSourceLifecycleError(
      "LEGAL_SOURCE_LIFECYCLE_PERSISTENCE_FAILED",
    );
  }
  return {
    eventId: event.eventId,
    sourceId: state.source_id,
    publicationId: state.publication_id,
    versionId: state.version_id,
    evidenceSha256: event.evidenceSha256,
    withdrawnAt,
    changed: true,
  };
}