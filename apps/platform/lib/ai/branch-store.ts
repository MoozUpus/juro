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
    if (!question) throw new AiBranchInputError("INVALID_BRANCH_OPERATION");
    let parentBranchId: string | null;
    if (input.sourceMessageId) {
      const source = await input.db.prepare(
        `SELECT b.id AS branchId
         FROM conversations c
         JOIN conversation_messages assistant ON assistant.conversation_id=c.id
           AND assistant.id=? AND assistant.author_type='assistant'
         JOIN message_branches b ON b.response_message_id=assistant.id AND b.conversation_id=c.id
         WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=?
           AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
         LIMIT 1`,
      ).bind(input.sourceMessageId, input.conversationId, input.workspaceId, input.userId)
        .first<{ branchId: string }>();
      if (!source) throw new AiBranchInputError("SOURCE_MESSAGE_NOT_FOUND");
      parentBranchId = source.branchId;
    } else {
      parentBranchId = await latestBranchId(input.db, input.conversationId, input.workspaceId, input.userId);
    }
    return {
      operation,
      question,
      sourceMessageId: null,
      forkedFromMessageId: input.sourceMessageId || null,
      parentBranchId,
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

/**
 * Lists only the answer alternatives that belong to the selected question.
 * A normal follow-up is a new turn with its own root request and must not be
 * presented as another version of the previous answer.
 */
export async function listAiAnswerVersions(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
  branchId: string | null;
}): Promise<AiBranchSummary[]> {
  if (!input.branchId) return [];
  const rows = await input.db.prepare(
    `WITH RECURSIVE lineage(branchId,messageId,currentMessageId,sourceMessageId,depth) AS (
       SELECT mv.branch_id,mv.message_id,mv.message_id,mv.source_message_id,0
       FROM message_versions mv
       WHERE mv.conversation_id=?
       UNION ALL
       SELECT chain.branchId,chain.messageId,parent.message_id,parent.source_message_id,chain.depth+1
       FROM lineage chain
       JOIN message_versions parent ON parent.message_id=chain.sourceMessageId
         AND parent.conversation_id=?
       WHERE chain.sourceMessageId IS NOT NULL AND chain.depth<40
     ),
     roots(branchId,messageId,rootMessageId) AS (
       SELECT branchId,messageId,currentMessageId FROM lineage WHERE sourceMessageId IS NULL
     ),
     selectedRoot(rootMessageId) AS (
       SELECT rootMessageId FROM roots WHERE branchId=? LIMIT 1
     )
     SELECT b.id AS branchId,b.parent_branch_id AS parentBranchId,b.request_message_id AS requestMessageId,
       b.response_message_id AS responseMessageId,b.operation,mv.version_number AS versionNumber,
       request.content AS question,b.created_at AS createdAt
     FROM message_branches b
     JOIN conversations c ON c.id=b.conversation_id
     JOIN conversation_messages request ON request.id=b.request_message_id
     JOIN message_versions mv ON mv.branch_id=b.id AND mv.message_id=b.request_message_id
     JOIN roots versionRoot ON versionRoot.branchId=b.id AND versionRoot.messageId=mv.message_id
     JOIN selectedRoot ON selectedRoot.rootMessageId=versionRoot.rootMessageId
     WHERE b.conversation_id=? AND c.workspace_id=? AND c.owner_user_id=?
       AND b.workspace_id=c.workspace_id AND b.owner_user_id=c.owner_user_id
     ORDER BY mv.version_number ASC,b.created_at ASC,b.id ASC`,
  ).bind(
    input.conversationId,
    input.conversationId,
    input.branchId,
    input.conversationId,
    input.workspaceId,
    input.userId,
  ).all<AiBranchSummary>();
  return rows.results;
}

export async function deleteAiConversation(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
}): Promise<"deleted" | "busy" | "unavailable"> {
  const existing = await input.db.prepare(
    `SELECT EXISTS(
       SELECT 1 FROM conversations WHERE id=? AND workspace_id=? AND owner_user_id=?
     ) AS owned,
     EXISTS(
       SELECT 1 FROM ai_runs
       WHERE conversation_id=? AND workspace_id=? AND user_id=?
         AND status IN ('reserved','finalizing')
     ) AS busy`,
  ).bind(
    input.conversationId,
    input.workspaceId,
    input.userId,
    input.conversationId,
    input.workspaceId,
    input.userId,
  ).first<{ owned: number; busy: number }>();
  if (!existing?.owned) return "unavailable";
  if (existing.busy) return "busy";

  // message_versions.source_message_id and message_branches.forked_from_message_id
  // use ON DELETE SET NULL, while both tables intentionally reject updates.
  // Remove those immutable dependants first so the conversation cascade never
  // attempts a forbidden FK-driven update. D1 batch keeps the sequence atomic.
  await input.db.batch([
    input.db.prepare(
      `DELETE FROM message_versions
       WHERE conversation_id=? AND EXISTS (
         SELECT 1 FROM conversations c
         WHERE c.id=message_versions.conversation_id AND c.workspace_id=? AND c.owner_user_id=?
       ) AND NOT EXISTS (
         SELECT 1 FROM ai_runs
         WHERE conversation_id=message_versions.conversation_id AND workspace_id=? AND user_id=?
           AND status IN ('reserved','finalizing')
       )`,
    ).bind(
      input.conversationId,
      input.workspaceId,
      input.userId,
      input.workspaceId,
      input.userId,
    ),
    input.db.prepare(
      `DELETE FROM message_branches
       WHERE conversation_id=? AND workspace_id=? AND owner_user_id=?
         AND NOT EXISTS (
           SELECT 1 FROM ai_runs
           WHERE conversation_id=message_branches.conversation_id AND workspace_id=? AND user_id=?
             AND status IN ('reserved','finalizing')
         )`,
    ).bind(
      input.conversationId,
      input.workspaceId,
      input.userId,
      input.workspaceId,
      input.userId,
    ),
    input.db.prepare(
      `DELETE FROM conversations
       WHERE id=? AND workspace_id=? AND owner_user_id=?
         AND NOT EXISTS (
           SELECT 1 FROM ai_runs
           WHERE conversation_id=conversations.id AND workspace_id=? AND user_id=?
             AND status IN ('reserved','finalizing')
         )`,
    ).bind(input.conversationId, input.workspaceId, input.userId, input.workspaceId, input.userId),
  ]);
  // D1 batch metadata is not a reliable deletion acknowledgement across all
  // runtimes. Read the tenant-owned row after the atomic batch instead.
  const remaining = await input.db.prepare(
    `SELECT EXISTS(
       SELECT 1 FROM conversations WHERE id=? AND workspace_id=? AND owner_user_id=?
     ) AS owned,
     EXISTS(
       SELECT 1 FROM ai_runs
       WHERE conversation_id=? AND workspace_id=? AND user_id=?
         AND status IN ('reserved','finalizing')
     ) AS busy`,
  ).bind(
    input.conversationId,
    input.workspaceId,
    input.userId,
    input.conversationId,
    input.workspaceId,
    input.userId,
  ).first<{ owned: number; busy: number }>();
  if (!remaining?.owned) return "deleted";
  return remaining.busy ? "busy" : "unavailable";
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
