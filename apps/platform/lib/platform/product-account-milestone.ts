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

/**
 * Elects the first completed clarification for an account, but only when the
 * durable parent branch really ended in an Insufficient-Evidence Result. The
 * message and account identifiers remain D1-local; Analytics Engine receives
 * only the fixed, identity-free event after this statement wins.
 */
export function productClarificationCompletedStatement(input: {
  db: D1Database;
  userId: string;
  workspaceId: string;
  conversationId: string;
  parentBranchId: string;
  completedAt: string;
}): D1PreparedStatement {
  return input.db.prepare(
    `INSERT OR IGNORE INTO product_account_milestones (
       user_id,event_name,first_completed_at
     )
     SELECT ?, 'clarification_completed', ?
     FROM message_branches source_branch
     JOIN conversations conversation
       ON conversation.id=source_branch.conversation_id
      AND conversation.workspace_id=source_branch.workspace_id
      AND conversation.owner_user_id=source_branch.owner_user_id
     JOIN conversation_messages assistant
       ON assistant.id=source_branch.response_message_id
      AND assistant.conversation_id=conversation.id
      AND assistant.author_type='assistant'
     WHERE source_branch.id=?
       AND source_branch.conversation_id=?
       AND source_branch.workspace_id=?
       AND source_branch.owner_user_id=?
       AND CASE
         WHEN json_valid(assistant.structured_json)
           THEN json_extract(assistant.structured_json,'$.responseKind')
         ELSE NULL
       END='clarification_required'
     LIMIT 1`,
  ).bind(
    input.userId,
    input.completedAt,
    input.parentBranchId,
    input.conversationId,
    input.workspaceId,
    input.userId,
  );
}

export function productAccountMilestoneCreated(
  result: D1Result<unknown> | undefined,
): boolean {
  return Number(result?.meta.changes ?? 0) === 1;
}
