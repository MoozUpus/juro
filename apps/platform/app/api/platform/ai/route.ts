import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { aiProviderStatus, legalAiProvider, type LegalSourceContext } from "../../../../lib/ai/provider";
import { filterTrustedVerifiedLegalSources } from "../../../../lib/legal/source-trust";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const selectedId = new URL(request.url).searchParams.get("conversationId");
  const conversations = await db.prepare(
    `SELECT c.id,c.title,c.locale,c.status,c.case_id AS caseId,c.created_at AS createdAt,c.updated_at AS updatedAt,
      (SELECT content FROM conversation_messages WHERE conversation_id=c.id AND author_type='assistant' ORDER BY created_at DESC LIMIT 1) AS lastAnswer,
      (SELECT json_group_array(json_object('id',f.id,'statement',f.statement,'status',f.status)) FROM confirmed_facts f WHERE f.conversation_id=c.id) AS factsJson
     FROM conversations c WHERE c.workspace_id=? AND c.owner_user_id=? ORDER BY c.updated_at DESC LIMIT 40`,
  ).bind(workspace.id, user.id).all();
  let selected: Record<string, unknown> | null = null;
  if (selectedId) {
    const conversation = await db.prepare(
      `SELECT c.id AS conversationId,m.structured_json AS structuredJson
       FROM conversations c JOIN conversation_messages m ON m.conversation_id=c.id
       WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=? AND m.author_type='assistant'
       ORDER BY m.created_at DESC LIMIT 1`,
    ).bind(selectedId, workspace.id, user.id).first<{
      conversationId: string;
      structuredJson: string | null;
    }>();
    if (conversation?.structuredJson) {
      const [facts, sourceRows] = await db.batch([
        db.prepare(
          "SELECT id,statement,status FROM confirmed_facts WHERE conversation_id=? ORDER BY created_at",
        ).bind(selectedId),
        db.prepare(
          `SELECT s.id,s.official_url AS officialUrl,s.act_title AS actTitle,
            s.act_identifier AS actIdentifier,s.published_at AS publishedAt,
            s.revision_date AS revisionDate,s.last_checked_at AS lastCheckedAt,
            s.locale,s.source_type AS sourceType,s.status
           FROM conversation_sources cs JOIN legal_sources s ON s.id=cs.source_id
           WHERE cs.conversation_id=? AND s.status='verified'`,
        ).bind(selectedId),
      ]);
      selected = {
        conversationId: conversation.conversationId,
        result: parseJson(conversation.structuredJson, null),
        facts: facts.results,
        sources: filterTrustedVerifiedLegalSources(
          sourceRows.results as unknown as LegalSourceContext[],
        ),
      };
    }
  }
  return response({
    status: aiProviderStatus(),
    conversations: conversations.results.map(row => ({ ...row, facts: parseJson(String((row as Record<string, unknown>).factsJson || "[]"), []) })),
    selected,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as { question?: string; locale?: string; conversationId?: string; caseId?: string } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const question = body?.question?.trim();
  if (!question || question.length < 5) return response({ error: locale === "ru" ? "Опишите ситуацию чуть подробнее." : "Vaziyatni biroz batafsil yozing." }, 400);
  if (question.length > 8_000) return response({ error: locale === "ru" ? "Сообщение слишком длинное. Сократите его до 8 000 символов." : "Xabar juda uzun. Uni 8 000 belgigacha qisqartiring." }, 413);
  const provider = legalAiProvider();
  if (!provider) {
    return response({
      code: "AI_PROVIDER_UNAVAILABLE",
      error: locale === "ru"
        ? "AI-провайдер пока не подключён. Сообщение не отправлено и не показано как успешно обработанное."
        : "AI-provayder hozircha ulanmagan. Xabar yuborilmadi va muvaffaqiyatli qayta ishlangan deb ko‘rsatilmadi.",
    }, 503);
  }
  const db = requireD1();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const usage = await db.prepare(
    `SELECT count(*) AS total FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id
     WHERE c.workspace_id=? AND c.owner_user_id=? AND m.author_type='user' AND m.created_at>?`,
  ).bind(workspace.id, user.id, since).first<{ total: number }>();
  if ((usage?.total ?? 0) >= 20) return response({ code: "AI_RATE_LIMIT", error: locale === "ru" ? "Почасовой лимит AI достигнут. Попробуйте позже." : "AI soatlik limiti tugadi. Keyinroq urinib ko‘ring." }, 429);

  if (body?.caseId) {
    const accessible = await db.prepare("SELECT id FROM cases WHERE id=? AND workspace_id=? LIMIT 1").bind(body.caseId, workspace.id).first();
    if (!accessible) return response({ error: locale === "ru" ? "Дело не найдено в этом пространстве." : "Bu makonda ish topilmadi." }, 403);
  }
  let conversationId = body?.conversationId;
  if (conversationId) {
    const accessible = await db.prepare("SELECT id FROM conversations WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1").bind(conversationId, workspace.id, user.id).first();
    if (!accessible) return response({ error: locale === "ru" ? "Диалог не найден." : "Suhbat topilmadi." }, 404);
  } else {
    conversationId = crypto.randomUUID();
  }

  const sourceRows = await db.prepare(
    `SELECT id,official_url AS officialUrl,act_title AS actTitle,act_identifier AS actIdentifier,
      published_at AS publishedAt,revision_date AS revisionDate,last_checked_at AS lastCheckedAt,
      locale,source_type AS sourceType,status
     FROM legal_sources WHERE status='verified' AND locale=? ORDER BY last_checked_at DESC LIMIT 16`,
  ).bind(locale).all();
  const sources = filterTrustedVerifiedLegalSources(
    sourceRows.results as unknown as LegalSourceContext[],
  );
  const result = await provider.runIntake({ question, locale, sources });
  const now = isoNow();
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const answerText = result.understanding;
  const existing = body?.conversationId;
  const facts = result.proposedFacts.map(statement => ({ id: crypto.randomUUID(), statement, status: "proposed" as const }));
  const statements = [
    ...(existing ? [] : [db.prepare(
      "INSERT INTO conversations (id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)",
    ).bind(conversationId, workspace.id, user.id, body?.caseId || null, question.slice(0, 120), locale, now, now)]),
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at) VALUES (?,?,'user',?,?)").bind(userMessageId, conversationId, question, now),
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,'assistant',?,?,?)").bind(assistantMessageId, conversationId, answerText, JSON.stringify(result), now),
    db.prepare("UPDATE conversations SET updated_at=? WHERE id=? AND workspace_id=?").bind(now, conversationId, workspace.id),
    ...facts.map(fact => db.prepare(
      "INSERT INTO confirmed_facts (id,conversation_id,case_id,statement,status,created_at,updated_at) VALUES (?,?,?,?,'proposed',?,?)",
    ).bind(fact.id, conversationId, body?.caseId || null, fact.statement, now, now)),
    ...result.sourceIds.map(sourceId => db.prepare(
      "INSERT INTO conversation_sources (id,conversation_id,message_id,source_id,citation_label,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), conversationId, assistantMessageId, sourceId, sourceId, now)),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'conversation',?,'ai_intake_completed',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, conversationId, JSON.stringify({ provider: provider.name, sourceMode: result.sourceMode, sourceCount: result.sourceIds.length }), now),
  ];
  await db.batch(statements);
  return response({
    conversationId,
    messageId: assistantMessageId,
    result,
    facts,
    sources: sources.filter(source => result.sourceIds.includes(source.id)),
  }, 201);
});
