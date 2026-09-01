/**
 * Elects the first durable, validated Legal Answer for an account. The
 * account/run identifiers remain D1-local and must never be copied into
 * Analytics Engine, API responses, or logs.
 */
export function productValueActivationStatement(input: {
  db: D1Database;
  userId: string;
  workspaceId: string;
  aiRunId: string;
  responseMessageId: string;
  completedAt: string;
}): D1PreparedStatement {
  return input.db.prepare(
    `INSERT OR IGNORE INTO product_value_activations (
       user_id,ai_run_id,first_completed_at
     )
     SELECT ?,?,?
     FROM ai_runs run
     JOIN conversation_messages response
       ON response.id=?
      AND response.conversation_id=run.conversation_id
      AND response.author_type='assistant'
     WHERE run.id=?
       AND run.workspace_id=?
       AND run.user_id=?
       AND run.status='finalizing'
       AND json_valid(response.structured_json)
       AND json_extract(response.structured_json,'$.responseKind')='answer'
     LIMIT 1`,
  ).bind(
    input.userId,
    input.aiRunId,
    input.completedAt,
    input.responseMessageId,
    input.aiRunId,
    input.workspaceId,
    input.userId,
  );
}
