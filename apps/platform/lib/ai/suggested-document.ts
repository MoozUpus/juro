import { z } from "zod";
import { getDocumentByCode } from "../document-builder/registry";
import { parseLegalChatResponse } from "./legal-chat-schema";

export const resolveAiSuggestedDocumentInputSchema = z.object({
  assistantMessageId: z.string().uuid(),
  locale: z.enum(["ru", "uz"]).default("uz"),
}).strict();

export class AiSuggestedDocumentError extends Error {
  constructor(
    readonly code: "AI_SUGGESTED_DOCUMENT_NOT_FOUND" | "AI_SUGGESTED_DOCUMENT_INVALID" | "AI_SUGGESTED_DOCUMENT_UNAVAILABLE",
  ) {
    super(code);
    this.name = "AiSuggestedDocumentError";
  }
}

type StoredSuggestedDocumentMessage = { structuredJson: string | null };

/**
 * Resolves a template only from an already persisted, tenant-owned AI result.
 * The client is deliberately unable to choose either a template code or a
 * document title, so an AI response cannot be repurposed across workspaces.
 */
export async function resolveAiSuggestedDocument(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  assistantMessageId: string;
  locale: "ru" | "uz";
}): Promise<{ templateCode: string; categorySlug: string; title: string; reason: string }> {
  const stored = await input.db.prepare(`
    SELECT message.structured_json AS structuredJson
    FROM conversation_messages message
    INNER JOIN conversations conversation ON conversation.id=message.conversation_id
    WHERE message.id=? AND message.author_type='assistant'
      AND conversation.workspace_id=? AND conversation.owner_user_id=?
    LIMIT 1
  `).bind(input.assistantMessageId, input.workspaceId, input.userId).first<StoredSuggestedDocumentMessage>();
  if (!stored) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_NOT_FOUND");
  if (!stored.structuredJson) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_INVALID");

  let suggested: { templateCode: string | null; reason: string } | null = null;
  try {
    const result = parseLegalChatResponse(JSON.parse(stored.structuredJson));
    suggested = result.responseKind === "answer" ? result.suggestedDocument : null;
  } catch {
    throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_INVALID");
  }
  if (!suggested?.templateCode) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_UNAVAILABLE");

  const definition = getDocumentByCode(suggested.templateCode);
  if (!definition || definition.status !== "published") {
    throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_UNAVAILABLE");
  }
  return {
    templateCode: definition.code,
    categorySlug: definition.categorySlug,
    title: input.locale === "ru" ? definition.titleRu : definition.titleUz,
    reason: suggested.reason,
  };
}
