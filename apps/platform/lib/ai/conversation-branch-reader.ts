import type { AiBranchSummary, AiMessageOperation } from "./branch-store";
import { listAiBranches } from "./branch-store";

export type AiConversationSelection = {
  conversationId: string;
  messageId: string;
  structuredJson: string | null;
  branchId: string | null;
  requestMessageId: string | null;
  operation: AiMessageOperation;
  question: string | null;
};

export type AiConversationTurn = {
  branchId: string;
  parentBranchId: string | null;
  requestMessageId: string;
  responseMessageId: string;
  question: string;
  answer: string;
  structuredJson: string | null;
  createdAt: string;
};

export async function selectAiConversationMessage(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
  branchId?: string | null;
  responseMessageId?: string | null;
}): Promise<AiConversationSelection | null> {
  const selector = input.branchId
    ? { clause: "AND b.id=?", value: input.branchId }
    : input.responseMessageId
      ? { clause: "AND m.id=?", value: input.responseMessageId }
      : { clause: "", value: null };
  const statement = input.db.prepare(
    `SELECT c.id AS conversationId,m.id AS messageId,m.structured_json AS structuredJson,
      b.id AS branchId,COALESCE(b.request_message_id,r.request_message_id) AS requestMessageId,
      COALESCE(b.operation,'new') AS operation,request.content AS question
     FROM conversations c JOIN conversation_messages m ON m.conversation_id=c.id
     LEFT JOIN message_branches b ON b.response_message_id=m.id AND b.conversation_id=c.id
     LEFT JOIN ai_runs r ON r.response_message_id=m.id AND r.conversation_id=c.id AND r.status='completed'
     LEFT JOIN conversation_messages request ON request.id=COALESCE(b.request_message_id,r.request_message_id)
     WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=? AND m.author_type='assistant'
       ${selector.clause}
     ORDER BY m.created_at DESC,m.id DESC LIMIT 1`,
  );
  const bound = selector.value
    ? statement.bind(input.conversationId, input.workspaceId, input.userId, selector.value)
    : statement.bind(input.conversationId, input.workspaceId, input.userId);
  return bound.first<AiConversationSelection>();
}

export async function loadAiConversationBranchMetadata(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
}): Promise<AiBranchSummary[]> {
  return listAiBranches(input);
}

/**
 * Returns the linear ancestry for the selected answer. A conversation can
 * contain edits and regenerated branches, so ordering every stored message by
 * time would mix mutually exclusive versions into the model context and UI.
 */
export async function loadAiConversationTurns(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
  leafBranchId?: string | null;
  limit?: number;
}): Promise<AiConversationTurn[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 24, 40));
  const leaf = input.leafBranchId
    ? await input.db.prepare(
      `SELECT b.id
       FROM message_branches b JOIN conversations c ON c.id=b.conversation_id
       WHERE b.id=? AND b.conversation_id=? AND c.workspace_id=? AND c.owner_user_id=?
         AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
       LIMIT 1`,
    ).bind(input.leafBranchId, input.conversationId, input.workspaceId, input.userId).first<{ id: string }>()
    : await input.db.prepare(
      `SELECT b.id
       FROM message_branches b JOIN conversations c ON c.id=b.conversation_id
       WHERE b.conversation_id=? AND c.workspace_id=? AND c.owner_user_id=?
         AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
       ORDER BY b.created_at DESC,b.id DESC LIMIT 1`,
    ).bind(input.conversationId, input.workspaceId, input.userId).first<{ id: string }>();
  if (!leaf?.id) return [];

  const rows = await input.db.prepare(
    `WITH RECURSIVE branch_path(id,parent_branch_id,depth) AS (
       SELECT id,parent_branch_id,0 FROM message_branches WHERE id=? AND conversation_id=?
       UNION ALL
       SELECT parent.id,parent.parent_branch_id,path.depth+1
       FROM message_branches parent JOIN branch_path path ON parent.id=path.parent_branch_id
       WHERE parent.conversation_id=? AND path.depth<?
     )
     SELECT b.id AS branchId,b.parent_branch_id AS parentBranchId,
       b.request_message_id AS requestMessageId,b.response_message_id AS responseMessageId,
       request.content AS question,response.content AS answer,response.structured_json AS structuredJson,
       b.created_at AS createdAt,path.depth AS depth
     FROM branch_path path
     JOIN message_branches b ON b.id=path.id
     JOIN conversations c ON c.id=b.conversation_id
     JOIN conversation_messages request ON request.id=b.request_message_id AND request.author_type='user'
     JOIN conversation_messages response ON response.id=b.response_message_id AND response.author_type='assistant'
     WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=?
       AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
     ORDER BY path.depth DESC`,
  ).bind(
    leaf.id,
    input.conversationId,
    input.conversationId,
    limit - 1,
    input.conversationId,
    input.workspaceId,
    input.userId,
  ).all<AiConversationTurn & { depth: number }>();
  return rows.results.map((turn) => ({
    branchId: turn.branchId,
    parentBranchId: turn.parentBranchId,
    requestMessageId: turn.requestMessageId,
    responseMessageId: turn.responseMessageId,
    question: turn.question,
    answer: turn.answer,
    structuredJson: turn.structuredJson,
    createdAt: turn.createdAt,
  }));
}
