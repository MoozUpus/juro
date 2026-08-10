import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

const messageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Records that the user had enough information from a post-answer clarification. */
export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as { assistantMessageId?: string; branchId?: string; locale?: "ru" | "uz" } | null;
  const ru = body?.locale !== "uz";
  const assistantMessageId = body?.assistantMessageId?.trim() || "";
  if (!messageIdPattern.test(assistantMessageId)) {
    return Response.json({
      code: "INVALID_ASSISTANT_MESSAGE",
      error: ru ? "Не удалось определить ответ для уточнения." : "Aniqlik kiritiladigan javobni aniqlab bo‘lmadi.",
    }, { status: 400 });
  }
  const db = requireD1();
  const message = await db.prepare(`
    SELECT message.id,conversation.id AS conversationId
    FROM conversation_messages message
    INNER JOIN conversations conversation ON conversation.id=message.conversation_id
    WHERE message.id=? AND message.author_type='assistant'
      AND conversation.workspace_id=? AND conversation.owner_user_id=?
    LIMIT 1
  `).bind(assistantMessageId, workspace.id, user.id).first<{ id: string; conversationId: string }>();
  if (!message) {
    return Response.json({
      code: "ASSISTANT_MESSAGE_NOT_FOUND",
      error: ru ? "Ответ JURO для уточнения не найден." : "Aniqlik kiritiladigan JURO javobi topilmadi.",
    }, { status: 404 });
  }
  const existing = await db.prepare(`
    SELECT id FROM workspace_audit_events
    WHERE workspace_id=? AND actor_user_id=? AND entity_type='conversation_message'
      AND entity_id=? AND action='ai_post_answer_clarification_dismissed'
    LIMIT 1
  `).bind(workspace.id, user.id, assistantMessageId).first<{ id: string }>();
  if (!existing) {
    await db.prepare(`
      INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
      VALUES (?,?,?,'conversation_message',?,'ai_post_answer_clarification_dismissed',?,?)
    `).bind(
      crypto.randomUUID(), workspace.id, user.id, assistantMessageId,
      JSON.stringify({ conversationId: message.conversationId, branchId: body?.branchId || null }),
      isoNow(),
    ).run();
  }
  return Response.json({ assistantMessageId, dismissed: true }, { headers: { "cache-control": "private, no-store" } });
});
