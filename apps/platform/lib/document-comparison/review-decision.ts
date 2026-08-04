export type ComparisonReviewDecision = "accepted" | "rejected" | null;

export type ComparisonChangeDecision = {
  id: string;
  comparisonId: string;
  reviewDecision: ComparisonReviewDecision;
  decidedAt: string | null;
  reviewedAt: string | null;
  reviewDecisionVersion: number;
};

type DecisionRow = ComparisonChangeDecision & {
  decidedByUserId: string | null;
  reviewDecisionEventId: string | null;
};

export class ComparisonDecisionError extends Error {
  constructor(
    readonly code:
      | "COMPARISON_CHANGE_NOT_FOUND"
      | "COMPARISON_CHANGE_DECISION_CONFLICT",
    readonly status: number,
  ) {
    super(code);
    this.name = "ComparisonDecisionError";
  }
}

export async function decideComparisonChange(
  db: D1Database,
  input: {
    comparisonId: string;
    changeId: string;
    workspaceId: string;
    userId: string;
    decision: ComparisonReviewDecision;
  },
): Promise<{ change: ComparisonChangeDecision; replay: boolean }> {
  const current = await decisionRow(db, input);
  if (!current) throw new ComparisonDecisionError("COMPARISON_CHANGE_NOT_FOUND", 404);
  if (current.reviewDecision === input.decision) {
    return { change: publicDecision(current), replay: true };
  }

  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const nextVersion = current.reviewDecisionVersion + 1;
  const actor = input.decision === null ? null : input.userId;
  const decidedAt = input.decision === null ? null : now;
  const [updated, audited] = await db.batch([
    db.prepare(
      `UPDATE comparison_changes
       SET review_decision=?,decided_by_user_id=?,decided_at=?,
           review_decision_version=?,review_decision_event_id=?,
           reviewed_at=CASE WHEN ? IS NULL THEN reviewed_at ELSE COALESCE(reviewed_at,?) END
       WHERE id=? AND comparison_id=?
         AND review_decision_version=? AND review_decision IS ?
         AND EXISTS (
           SELECT 1 FROM document_comparisons comparison
           WHERE comparison.id=comparison_changes.comparison_id
             AND comparison.workspace_id=? AND comparison.owner_user_id=?
             AND comparison.status IN ('completed','completed_partial')
             AND comparison.deleted_at IS NULL
         )`,
    ).bind(
      input.decision, actor, decidedAt, nextVersion, eventId,
      input.decision, now, input.changeId, input.comparisonId,
      current.reviewDecisionVersion, current.reviewDecision,
      input.workspaceId, input.userId,
    ),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'comparison_change',?,?,?,?
       WHERE EXISTS (
         SELECT 1 FROM comparison_changes change
         JOIN document_comparisons comparison ON comparison.id=change.comparison_id
         WHERE change.id=? AND change.comparison_id=?
           AND change.review_decision_event_id=? AND change.review_decision_version=?
           AND comparison.workspace_id=? AND comparison.owner_user_id=?
           AND comparison.deleted_at IS NULL
       )`,
    ).bind(
      crypto.randomUUID(), input.workspaceId, input.userId, input.changeId,
      input.decision === "accepted"
        ? "comparison_change_accepted"
        : input.decision === "rejected"
          ? "comparison_change_rejected"
          : "comparison_change_decision_cleared",
      JSON.stringify({ comparisonId: input.comparisonId, decisionVersion: nextVersion }),
      now, input.changeId, input.comparisonId, eventId, nextVersion,
      input.workspaceId, input.userId,
    ),
  ]);

  if (Number(updated?.meta.changes ?? 0) !== 1 || Number(audited?.meta.changes ?? 0) !== 1) {
    const raced = await decisionRow(db, input);
    if (raced?.reviewDecision === input.decision) {
      return { change: publicDecision(raced), replay: true };
    }
    throw new ComparisonDecisionError("COMPARISON_CHANGE_DECISION_CONFLICT", 409);
  }

  const result = await decisionRow(db, input);
  if (!result || result.reviewDecisionEventId !== eventId || result.reviewDecisionVersion !== nextVersion) {
    throw new ComparisonDecisionError("COMPARISON_CHANGE_DECISION_CONFLICT", 409);
  }
  return { change: publicDecision(result), replay: false };
}

async function decisionRow(
  db: D1Database,
  input: { comparisonId: string; changeId: string; workspaceId: string; userId: string },
): Promise<DecisionRow | null> {
  return db.prepare(
    `SELECT change.id,change.comparison_id AS comparisonId,
      change.review_decision AS reviewDecision,
      change.decided_by_user_id AS decidedByUserId,
      change.decided_at AS decidedAt,change.reviewed_at AS reviewedAt,
      change.review_decision_version AS reviewDecisionVersion,
      change.review_decision_event_id AS reviewDecisionEventId
     FROM comparison_changes change
     JOIN document_comparisons comparison ON comparison.id=change.comparison_id
     WHERE change.id=? AND change.comparison_id=?
       AND comparison.workspace_id=? AND comparison.owner_user_id=?
       AND comparison.status IN ('completed','completed_partial')
       AND comparison.deleted_at IS NULL LIMIT 1`,
  ).bind(
    input.changeId, input.comparisonId, input.workspaceId, input.userId,
  ).first<DecisionRow>();
}

function publicDecision(row: DecisionRow): ComparisonChangeDecision {
  return {
    id: row.id,
    comparisonId: row.comparisonId,
    reviewDecision: row.reviewDecision,
    decidedAt: row.decidedAt,
    reviewedAt: row.reviewedAt,
    reviewDecisionVersion: Number(row.reviewDecisionVersion),
  };
}
