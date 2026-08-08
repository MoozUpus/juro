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
