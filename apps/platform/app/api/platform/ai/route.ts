import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { AiUnavailableError } from "../../../../lib/document-builder/ai/openai";
import { aiProviderStatus, legalAiProvider, type LegalSourceContext } from "../../../../lib/ai/provider";
import {
  AiRunConflictError,
  completeAiRun,
  failAiRun,
  reserveAiRun,
  sha256Json,
} from "../../../../lib/ai/run-store";
import { parseLegalChatResponse } from "../../../../lib/ai/legal-chat-schema";
import { filterTrustedVerifiedLegalSources } from "../../../../lib/legal/source-trust";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const MONTHLY_CHAT_LIMIT = 20;
const INSTRUCTION_VERSION = "juro-legal-chat-v1";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
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
  const selected = selectedId
    ? await loadConversationResult(db, selectedId, workspace.id, user.id)
    : null;
  return response({
    status: aiProviderStatus(),
    usage: await usageSummary(db, workspace.id, user.id),
    conversations: conversations.results.map((row) => ({
      ...row,
      facts: parseJson(String((row as Record<string, unknown>).factsJson || "[]"), []),
    })),
    selected,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as {
    question?: string;
    locale?: string;
    conversationId?: string;
    caseId?: string;
    answerMode?: string;
    reasoningMode?: string;
  } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const question = body?.question?.trim();
  const answerMode = body?.answerMode === "short" ? "short" : "detailed";
  const reasoningMode = body?.reasoningMode === "deep" ? "deep" : "fast";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return response({
      code: "INVALID_IDEMPOTENCY_KEY",
      error: locale === "ru" ? "Повторите отправку: идентификатор запроса отсутствует или некорректен." : "Qayta yuboring: so‘rov identifikatori yo‘q yoki noto‘g‘ri.",
    }, 400);
  }
  if (!question || question.length < 5) {
    return response({ error: locale === "ru" ? "Опишите ситуацию чуть подробнее." : "Vaziyatni biroz batafsil yozing." }, 400);
  }
  if (question.length > 8_000) {
    return response({ error: locale === "ru" ? "Сообщение слишком длинное. Сократите его до 8 000 символов." : "Xabar juda uzun. Uni 8 000 belgigacha qisqartiring." }, 413);
  }

  const provider = legalAiProvider();
  const providerStatus = aiProviderStatus();
  if (!provider || !providerStatus.model) {
    return response({
      code: "AI_PROVIDER_UNAVAILABLE",
      error: locale === "ru"
        ? "AI-провайдер пока не подключён. Сообщение не отправлено и не показано как успешно обработанное."
        : "AI-provayder hozircha ulanmagan. Xabar yuborilmadi va muvaffaqiyatli qayta ishlangan deb ko‘rsatilmadi.",
    }, 503);
  }

  const db = requireD1();
  if (body?.caseId) {
    const accessible = await db.prepare("SELECT id FROM cases WHERE id=? AND workspace_id=? LIMIT 1").bind(body.caseId, workspace.id).first();
    if (!accessible) return response({ code: "ACCESS_DENIED", error: locale === "ru" ? "Дело не найдено в этом пространстве." : "Bu makonda ish topilmadi." }, 404);
  }
  const conversationId = body?.conversationId || crypto.randomUUID();
  const existingConversation = Boolean(body?.conversationId);
  if (existingConversation) {
    const accessible = await db.prepare(
      "SELECT id FROM conversations WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1",
    ).bind(conversationId, workspace.id, user.id).first();
    if (!accessible) return response({ code: "ACCESS_DENIED", error: locale === "ru" ? "Диалог не найден." : "Suhbat topilmadi." }, 404);
  }

  const { sources, legalDatabaseAsOf } = await retrieveVerifiedSources(db, question, locale);
  const requestHash = await sha256Json({ question, locale, answerMode, reasoningMode, conversationId: body?.conversationId || null, caseId: body?.caseId || null });
  const instructionHash = await sha256Json({ version: INSTRUCTION_VERSION, jurisdiction: "UZ" });
  const sourceVersionHash = await sha256Json(sources.map((source) => ({ id: source.id, hash: source.contentSha256, excerpt: source.excerpt || null })));

  let reservation;
  try {
    reservation = await reserveAiRun({
      db, workspaceId: workspace.id, userId: user.id, idempotencyKey, requestHash,
      conversationId: existingConversation ? conversationId : null,
      provider: provider.name, model: providerStatus.model, answerMode, reasoningMode,
      legalDatabaseAsOf, instructionHash, sourceVersionHash, monthlyLimit: MONTHLY_CHAT_LIMIT,
    });
  } catch (error) {
    if (error instanceof AiRunConflictError) {
      return response({
        code: error.code,
        error: error.code === "PLAN_LIMIT"
          ? (locale === "ru" ? "Месячный лимит AI-ответов исчерпан." : "Oylik AI-javoblar limiti tugadi.")
          : (locale === "ru" ? "Этот идентификатор уже использован для другого запроса." : "Bu identifikator boshqa so‘rov uchun ishlatilgan."),
      }, error.code === "PLAN_LIMIT" ? 429 : 409);
    }
    throw error;
  }
  if (reservation.kind === "completed") {
    const replay = await loadConversationResult(db, reservation.conversationId, workspace.id, user.id);
    return response({ ...replay, idempotentReplay: true }, 200);
  }
  if (reservation.kind === "processing") {
    return response({ code: "AI_RUN_PROCESSING", runId: reservation.runId }, 202);
  }

  let aiResult;
  try {
    aiResult = await provider.runLegalChat({
      question, locale, answerMode, reasoningMode, sources, legalDatabaseAsOf,
      requestId: reservation.correlationId,
    });
  } catch (error) {
    const code = error instanceof AiUnavailableError ? error.code : "PROVIDER_UNAVAILABLE";
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey, errorCode: code,
    });
    return response({
      code,
      correlationId: reservation.correlationId,
      error: localizedProviderError(locale, code),
    }, code === "AI_REFUSED" || code === "INVALID_AI_OUTPUT" ? 422 : 503);
  }

  const result = parseLegalChatResponse(aiResult.data);
  const now = isoNow();
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const facts = result.assumptions.map((assumption) => ({ id: crypto.randomUUID(), statement: assumption.statement, status: "proposed" as const }));
  const statements = [
    ...(existingConversation ? [] : [db.prepare(
      "INSERT INTO conversations (id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)",
    ).bind(conversationId, workspace.id, user.id, body?.caseId || null, question.slice(0, 120), locale, now, now)]),
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at) VALUES (?,?,'user',?,?)")
      .bind(userMessageId, conversationId, question, now),
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,'assistant',?,?,?)")
      .bind(assistantMessageId, conversationId, result.answer, JSON.stringify(result), now),
    db.prepare("UPDATE conversations SET updated_at=? WHERE id=? AND workspace_id=?").bind(now, conversationId, workspace.id),
    ...facts.map((fact) => db.prepare(
      "INSERT INTO confirmed_facts (id,conversation_id,case_id,statement,status,created_at,updated_at) VALUES (?,?,?,?,'proposed',?,?)",
    ).bind(fact.id, conversationId, body?.caseId || null, fact.statement, now, now)),
    ...result.sources.map((source) => db.prepare(
      "INSERT INTO conversation_sources (id,conversation_id,message_id,source_id,citation_label,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), conversationId, assistantMessageId, source.sourceId, source.article || source.actIdentifier || source.sourceId, now)),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'conversation',?,'ai_chat_completed',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, conversationId, JSON.stringify({
      runId: reservation.runId, provider: aiResult.provider, model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider,
      sourceCount: result.sources.length, responseKind: result.responseKind,
    }), now),
  ];
  try {
    await db.batch(statements);
    await completeAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      conversationId, requestMessageId: userMessageId, responseMessageId: assistantMessageId,
      providerResponseId: aiResult.providerResponseId, model: aiResult.model,
      provider: aiResult.provider,
      fallbackFromProvider: aiResult.fallbackFromProvider,
      inputTokens: aiResult.usage.inputTokens, outputTokens: aiResult.usage.outputTokens,
      cachedInputTokens: aiResult.usage.cachedInputTokens, attempts: aiResult.attempts,
      latencyMs: aiResult.latencyMs, chargeable: result.responseKind === "answer",
    });
  } catch (error) {
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey, errorCode: "PERSISTENCE_FAILED",
    });
    throw error;
  }

  return response({
    conversationId, messageId: assistantMessageId, runId: reservation.runId,
    correlationId: reservation.correlationId, result, facts, sources: result.sources,
    technicalDetails: {
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider,
    },
    usage: await usageSummary(db, workspace.id, user.id),
  }, 201);
});

async function loadConversationResult(db: D1Database, conversationId: string, workspaceId: string, userId: string) {
  const conversation = await db.prepare(
    `SELECT c.id AS conversationId,m.id AS messageId,m.structured_json AS structuredJson
     FROM conversations c JOIN conversation_messages m ON m.conversation_id=c.id
     WHERE c.id=? AND c.workspace_id=? AND c.owner_user_id=? AND m.author_type='assistant'
     ORDER BY m.created_at DESC LIMIT 1`,
  ).bind(conversationId, workspaceId, userId).first<{ conversationId: string; messageId: string; structuredJson: string | null }>();
  if (!conversation?.structuredJson) return null;
  const [facts, sourceRows] = await db.batch([
    db.prepare("SELECT id,statement,status FROM confirmed_facts WHERE conversation_id=? ORDER BY created_at").bind(conversationId),
    db.prepare(
      `SELECT s.id,s.official_url AS officialUrl,s.act_title AS actTitle,s.act_identifier AS actIdentifier,
        s.published_at AS publishedAt,s.revision_date AS revisionDate,s.last_checked_at AS lastCheckedAt,
        s.locale,s.source_type AS sourceType,s.status,s.verification_state AS verificationState,
        s.verified_at AS verifiedAt,s.content_sha256 AS contentSha256
       FROM conversation_sources cs JOIN legal_sources s ON s.id=cs.source_id
       WHERE cs.conversation_id=? AND cs.message_id=? AND s.status='verified'
         AND s.verification_state='verified' AND s.verified_at IS NOT NULL AND s.content_sha256 IS NOT NULL`,
    ).bind(conversationId, conversation.messageId),
  ]);
  return {
    conversationId: conversation.conversationId,
    messageId: conversation.messageId,
    result: parseJson(conversation.structuredJson, null),
    facts: facts.results,
    sources: filterTrustedVerifiedLegalSources(sourceRows.results as unknown as LegalSourceContext[]),
  };
}

async function retrieveVerifiedSources(db: D1Database, question: string, locale: "ru" | "uz") {
  const keywords = [...new Set(question.toLocaleLowerCase(locale === "ru" ? "ru" : "uz").match(/[\p{L}\p{N}]{5,}/gu) || [])].slice(0, 4);
  const freshness = await db.prepare(
    "SELECT MAX(finished_at) AS asOf FROM source_sync_runs WHERE status='completed'",
  ).first<{ asOf: string | null }>();
  const legalDatabaseAsOf = freshness?.asOf || "unavailable";
  if (!keywords.length) return { sources: [] as LegalSourceContext[], legalDatabaseAsOf };
  const conditions = keywords.map(() => "lower(ss.body_text) LIKE ?").join(" OR ");
  const rows = await db.prepare(
    `SELECT s.id,s.official_url AS officialUrl,s.act_title AS actTitle,s.act_identifier AS actIdentifier,
      s.published_at AS publishedAt,s.revision_date AS revisionDate,s.last_checked_at AS lastCheckedAt,
      s.locale,s.source_type AS sourceType,s.status,s.verification_state AS verificationState,
      s.verified_at AS verifiedAt,s.content_sha256 AS contentSha256,
      ss.article,substr(ss.body_text,1,1200) AS excerpt,
      COALESCE(v.effective_at,s.effective_at) AS effectiveDate
     FROM legal_sources s
     JOIN legal_source_current_activations a ON a.source_id=s.id
     JOIN legal_source_versions v ON v.id=a.version_id AND v.status='verified'
     JOIN legal_source_sections ss ON ss.version_id=a.version_id
     WHERE s.status='verified' AND s.verification_state='verified'
       AND s.verified_at IS NOT NULL AND s.content_sha256 IS NOT NULL AND s.locale=?
       AND (${conditions})
     ORDER BY s.last_checked_at DESC,ss.sequence ASC LIMIT 12`,
  ).bind(locale, ...keywords.map((keyword) => `%${keyword}%`)).all();
  const trusted = filterTrustedVerifiedLegalSources(rows.results as unknown as LegalSourceContext[]);
  const unique = new Map<string, LegalSourceContext>();
  for (const source of trusted) if (!unique.has(source.id)) unique.set(source.id, source);
  return { sources: [...unique.values()].slice(0, 8), legalDatabaseAsOf };
}

async function usageSummary(db: D1Database, workspaceId: string, userId: string) {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const row = await db.prepare(
    "SELECT COALESCE(SUM(units),0) AS used FROM ai_usage_ledger WHERE workspace_id=? AND user_id=? AND feature='legal_chat' AND period_start=? AND status='consumed'",
  ).bind(workspaceId, userId, periodStart).first<{ used: number }>();
  return { used: row?.used ?? 0, limit: MONTHLY_CHAT_LIMIT, periodEnd };
}

function localizedProviderError(locale: "ru" | "uz", code: string) {
  const ru: Record<string, string> = {
    PROVIDER_TIMEOUT: "AI не успел завершить ответ. Лимит не списан; попробуйте ещё раз.",
    INVALID_AI_OUTPUT: "AI вернул результат, который не прошёл проверку структуры. Лимит не списан.",
    AI_REFUSED: "Запрос не был обработан AI. Лимит не списан.",
    PROVIDER_UNAVAILABLE: "AI-провайдер временно недоступен. Лимит не списан.",
  };
  const uz: Record<string, string> = {
    PROVIDER_TIMEOUT: "AI javobni vaqtida yakunlamadi. Limit yechilmadi; qayta urinib ko‘ring.",
    INVALID_AI_OUTPUT: "AI natijasi tuzilma tekshiruvidan o‘tmadi. Limit yechilmadi.",
    AI_REFUSED: "So‘rov AI tomonidan qayta ishlanmadi. Limit yechilmadi.",
    PROVIDER_UNAVAILABLE: "AI-provayder vaqtincha ishlamayapti. Limit yechilmadi.",
  };
  return (locale === "ru" ? ru : uz)[code] || (locale === "ru" ? ru.PROVIDER_UNAVAILABLE : uz.PROVIDER_UNAVAILABLE);
}
