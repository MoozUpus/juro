export const AI_MESSAGE_OPERATIONS = ["new", "follow_up", "edit", "regenerate"] as const;

export type AiMessageOperation = (typeof AI_MESSAGE_OPERATIONS)[number];

export type AiBranchInput = {
  operation: AiMessageOperation;
  question: string;
  sourceMessageId: string | null;
  forkedFromMessageId: string | null;
  parentBranchId: string | null;
  versionNumber: number;
};

export type AiBranchSummary = {
  branchId: string;
  parentBranchId: string | null;
  requestMessageId: string;
  responseMessageId: string;
  operation: AiMessageOperation;
  versionNumber: number;
  question: string;
  createdAt: string;
};

export class AiBranchInputError extends Error {
  readonly code: "INVALID_BRANCH_OPERATION" | "SOURCE_MESSAGE_NOT_FOUND";

  constructor(code: "INVALID_BRANCH_OPERATION" | "SOURCE_MESSAGE_NOT_FOUND") {
    super(code);
    this.name = "AiBranchInputError";
    this.code = code;
  }
}

export function parseAiMessageOperation(value: unknown, hasConversation: boolean): AiMessageOperation {
  if (value === undefined || value === null || value === "") return hasConversation ? "follow_up" : "new";
  if (!AI_MESSAGE_OPERATIONS.includes(value as AiMessageOperation)) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
  const operation = value as AiMessageOperation;
  if ((!hasConversation && operation !== "new") || (hasConversation && operation === "new")) {
    throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
  }
  return operation;
}

export async function resolveAiBranchInput(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  conversationId: string | null;
  requestedOperation: unknown;
  sourceMessageId?: string | null;
  question?: string | null;
}): Promise<AiBranchInput> {
  const hasConversation = Boolean(input.conversationId);
  const operation = parseAiMessageOperation(input.requestedOperation, hasConversation);
  const question = input.question?.trim() || "";

  if (operation === "new") {
    if (!question || input.sourceMessageId) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
    return { operation, question, sourceMessageId: null, forkedFromMessageId: null, parentBranchId: null, versionNumber: 1 };
  }

  if (!input.conversationId) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
  if (operation === "follow_up") {
    if (!question || input.sourceMessageId) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
    return {
      operation,
      question,
      sourceMessageId: null,
      forkedFromMessageId: null,
      parentBranchId: await latestBranchId(input.db, input.conversationId, input.workspaceId, input.userId),
      versionNumber: 1,
    };
  }

  const sourceMessageId = input.sourceMessageId?.trim() || "";
  if (!sourceMessageId) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");

  if (operation === "edit") {
    if (!question) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
    const source = await input.db.prepare(
      `SELECT m.id,mv.branch_id AS branchId,COALESCE(mv.version_number,1) AS versionNumber
       FROM conversations c JOIN conversation_messages m ON m.conversation_id=c.id
       LEFT JOIN message_versions mv ON mv.message_id=m.id
       WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=? AND m.id=? AND m.author_type='user'
       LIMIT 1`,
    ).bind(input.conversationId, input.workspaceId, input.userId, sourceMessageId)
      .first<{ id: string; branchId: string | null; versionNumber: number }>();
    if (!source) throw new AiBranchInputError("SOURCE_MESSAGE_NOT_FOUND");
    return {
      operation,
      question,
      sourceMessageId: source.id,
      forkedFromMessageId: source.id,
      parentBranchId: source.branchId,
      versionNumber: Number(source.versionNumber) + 1,
    };
  }

  const source = await input.db.prepare(
    `SELECT assistant.id AS assistantMessageId,request.id AS requestMessageId,request.content AS question,
      b.id AS branchId,COALESCE(mv.version_number,1) AS versionNumber
     FROM conversations c
     JOIN conversation_messages assistant ON assistant.conversation_id=c.id AND assistant.id=? AND assistant.author_type='assistant'
     JOIN ai_runs r ON r.conversation_id=c.id AND r.response_message_id=assistant.id
       AND r.workspace_id=c.workspace_id AND r.user_id=c.owner_user_id AND r.status='completed'
     JOIN conversation_messages request ON request.id=r.request_message_id
       AND request.conversation_id=c.id AND request.author_type='user'
     LEFT JOIN message_branches b ON b.response_message_id=assistant.id
     LEFT JOIN message_versions mv ON mv.message_id=request.id
     WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=?
     ORDER BY r.completed_at DESC LIMIT 1`,
  ).bind(sourceMessageId, input.conversationId, input.workspaceId, input.userId)
    .first<{ assistantMessageId: string; requestMessageId: string; question: string; branchId: string | null; versionNumber: number }>();
  if (!source) throw new AiBranchInputError("SOURCE_MESSAGE_NOT_FOUND");
  return {
    operation,
    question: source.question,
    sourceMessageId: source.requestMessageId,
    forkedFromMessageId: source.assistantMessageId,
    parentBranchId: source.branchId,
    versionNumber: Number(source.versionNumber) + 1,
  };
}

export async function listAiBranches(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
  limit?: number;
}): Promise<AiBranchSummary[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 40, 40));
  const rows = await input.db.prepare(
    `SELECT b.id AS branchId,b.parent_branch_id AS parentBranchId,b.request_message_id AS requestMessageId,
      b.response_message_id AS responseMessageId,b.operation,mv.version_number AS versionNumber,
      request.content AS question,b.created_at AS createdAt
     FROM message_branches b
     JOIN conversations c ON c.id=b.conversation_id
     JOIN conversation_messages request ON request.id=b.request_message_id
     JOIN message_versions mv ON mv.branch_id=b.id AND mv.message_id=b.request_message_id
     WHERE b.conversation_id=? AND c.workspace_id=? AND c.owner_user_id=?
       AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
     ORDER BY b.created_at DESC,b.id DESC LIMIT ?`,
  ).bind(input.conversationId, input.workspaceId, input.userId, limit).all<AiBranchSummary>();
  return rows.results;
}

async function latestBranchId(db: D1Database, conversationId: string, workspaceId: string, userId: string) {
  const row = await db.prepare(
    `SELECT b.id FROM message_branches b JOIN conversations c ON c.id=b.conversation_id
     WHERE b.conversation_id=? AND c.workspace_id=? AND c.owner_user_id=?
       AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
     ORDER BY b.created_at DESC,b.id DESC LIMIT 1`,
  ).bind(conversationId, workspaceId, userId).first<{ id: string }>();
  return row?.id ?? null;
}
