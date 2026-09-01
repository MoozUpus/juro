export type ProductAccountMilestone =
  | "first_question_sent"
  | "clarification_completed"
  | "document_analyzed";

/**
 * Creates a D1-local account milestone. The user identifier stays inside D1
 * and must never be copied into Analytics Engine or logs. The composite
 * primary key makes concurrent attempts replay-safe.
 */
export function productAccountMilestoneStatement(input: {
  db: D1Database;
  userId: string;
  eventName: ProductAccountMilestone;
  completedAt: string;
}): D1PreparedStatement {
  return input.db.prepare(
    `INSERT OR IGNORE INTO product_account_milestones (
       user_id,event_name,first_completed_at
     ) VALUES (?,?,?)`,
  ).bind(input.userId, input.eventName, input.completedAt);
}

export function productAccountMilestoneCreated(
  result: D1Result<unknown> | undefined,
): boolean {
  return Number(result?.meta.changes ?? 0) === 1;
}
