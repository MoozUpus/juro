import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { AiUnavailableError } from "../../../../lib/document-builder/ai/openai";
import { aiProviderStatus, legalAiProvider, type LegalAiProgress } from "../../../../lib/ai/provider";
import {
  AiRunConflictError,
  beginAiRunFinalization,
  completeAiRunStatements,
  failAiRun,
  reserveAiRun,
  sha256Json,
} from "../../../../lib/ai/run-store";
import { AiBranchInputError, listAiBranches, resolveAiBranchInput } from "../../../../lib/ai/branch-store";
import { selectAiConversationMessage } from "../../../../lib/ai/conversation-branch-reader";
import {
  enforceLegalDatabaseFreshness,
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
} from "../../../../lib/ai/legal-chat-schema";
import {
  legalDatabaseFreshnessFromAsOf,
  retrieveVerifiedLegalSources,
} from "../../../../lib/legal/verified-retrieval";
import { workspaceEntitlements } from "../../../../lib/billing/entitlements";
import { workspaceForUser } from "../../../../lib/platform/workspace";
import {
  listUserMemories,
  memoryKeyring,
  persistAutomaticMemories,
  UserMemoryError,
  type UserMemory,
} from "../../../../lib/ai/user-memory";
import type { IdentityKeyring } from "../../../../lib/auth/keyring";
import {
  assertVoiceTranscriptMatches,
  linkVoiceRecordingStatement,
  VoiceRecordingError,
  voiceKeyring,
  type VoiceRecordingRow,
} from "../../../../lib/ai/voice-recording";

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
  const entitlements = await workspaceEntitlements(db, workspace.id);
  const url = new URL(request.url);
  const selectedId = url.searchParams.get("conversationId");
  const selectedBranchId = url.searchParams.get("branchId");
  const conversations = await db.prepare(
    `SELECT c.id,c.title,c.locale,c.status,c.case_id AS caseId,c.created_at AS createdAt,c.updated_at AS updatedAt,
      (SELECT content FROM conversation_messages WHERE conversation_id=c.id AND author_type='assistant' ORDER BY created_at DESC LIMIT 1) AS lastAnswer,
      (SELECT json_group_array(json_object('id',f.id,'statement',f.statement,'status',f.status)) FROM confirmed_facts f WHERE f.conversation_id=c.id) AS factsJson
     FROM conversations c WHERE c.workspace_id=? AND c.owner_user_id=? ORDER BY c.updated_at DESC LIMIT 40`,
  ).bind(workspace.id, user.id).all();
  const cases = await db.prepare(
    `SELECT id,title,status,updated_at AS updatedAt
     FROM cases
     WHERE workspace_id=? AND archived_at IS NULL
     ORDER BY updated_at DESC,id
     LIMIT 50`,
  ).bind(workspace.id).all();
  const selected = selectedId
    ? await loadConversationResult(db, selectedId, workspace.id, user.id, selectedBranchId)
    : null;
  return response({
    status: aiProviderStatus(),
    usage: await usageSummary(db, workspace.id, user.id, entitlements.aiAnswerCyclesMonthly),
    conversations: conversations.results.map((row) => ({
      ...row,
      facts: parseJson(String((row as Record<string, unknown>).factsJson || "[]"), []),
    })),
    cases: cases.results,
    selected,
  });
});

async function executePost(
  request: Request,
  onProgress?: (event: LegalAiProgress) => void | Promise<void>,
  signal: AbortSignal = request.signal,
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as {
    question?: string;
    locale?: string;
    conversationId?: string;
    operation?: string;
    sourceMessageId?: string;
    caseId?: string;
    answerMode?: string;
    reasoningMode?: string;
    voiceRecordingId?: string;
  } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const submittedQuestion = body?.question?.trim();
  const answerMode = body?.answerMode === "short" ? "short" : "detailed";
  const reasoningMode = body?.reasoningMode === "deep" ? "deep" : "fast";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return response({
      code: "INVALID_IDEMPOTENCY_KEY",
      error: locale === "ru" ? "Повторите отправку: идентификатор запроса отсутствует или некорректен." : "Qayta yuboring: so‘rov identifikatori yo‘q yoki noto‘g‘ri.",
    }, 400);
  }
  if (body?.operation !== "regenerate" && (!submittedQuestion || submittedQuestion.length < 5)) {
    return response({ error: locale === "ru" ? "Опишите ситуацию чуть подробнее." : "Vaziyatni biroz batafsil yozing." }, 400);
  }
  if (submittedQuestion && submittedQuestion.length > 8_000) {
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
  const entitlements = await workspaceEntitlements(db, workspace.id);
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

  let branchInput: Awaited<ReturnType<typeof resolveAiBranchInput>>;
  try {
    branchInput = await resolveAiBranchInput({
      db,
      workspaceId: workspace.id,
      userId: user.id,
      conversationId: existingConversation ? conversationId : null,
      requestedOperation: body?.operation,
      sourceMessageId: body?.sourceMessageId,
      question: submittedQuestion,
    });
  } catch (error) {
    if (!(error instanceof AiBranchInputError)) throw error;
    return response({
      code: error.code,
      error: error.code === "SOURCE_MESSAGE_NOT_FOUND"
        ? (locale === "ru" ? "Исходное сообщение не найдено в этом диалоге." : "Boshlang‘ich xabar bu suhbatda topilmadi.")
        : (locale === "ru" ? "Некорректная операция с версией ответа." : "Javob versiyasi bilan amal noto‘g‘ri."),
    }, error.code === "SOURCE_MESSAGE_NOT_FOUND" ? 404 : 400);
  }
  const question = branchInput.question;
  let voiceRecording: VoiceRecordingRow | null = null;
  if (body?.voiceRecordingId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.voiceRecordingId)) {
      return response({ code: "INVALID_VOICE_REQUEST", error: locale === "ru" ? "Некорректная голосовая запись." : "Ovozli yozuv noto‘g‘ri." }, 400);
    }
    try {
      voiceRecording = await assertVoiceTranscriptMatches({
        db,
        keyring: voiceKeyring(runtimeEnv().IDENTITY_KEYRING),
        recordingId: body.voiceRecordingId,
        workspaceId: workspace.id,
        userId: user.id,
        question,
      });
    } catch (error) {
      if (!(error instanceof VoiceRecordingError)) throw error;
      return response({ code: error.code, error: error.message }, error.status);
    }
  }
  let memoryEncryption: IdentityKeyring | null = null;
  let memories: UserMemory[] = [];
  try {
    memoryEncryption = memoryKeyring(runtimeEnv().IDENTITY_KEYRING);
    memories = (await listUserMemories({
      db,
      keyring: memoryEncryption,
      userId: user.id,
      workspaceId: workspace.id,
    })).slice(0, 20);
  } catch (error) {
    if (!(error instanceof UserMemoryError)) throw error;
    console.warn({
      event: "ai.memory_context_unavailable",
      code: error.code,
      workspaceIdHash: await sha256Json({ workspaceId: workspace.id }),
    });
  }
  const retrieval = await retrieveVerifiedLegalSources(db, question, locale, 8, { semantic: runtimeEnv() });
  const { sources, evidence, freshness, legalDatabaseAsOf } = retrieval;
  const requestHash = await sha256Json({
    question,
    locale,
    answerMode,
    reasoningMode,
    conversationId: body?.conversationId || null,
    caseId: body?.caseId || null,
    operation: branchInput.operation,
    sourceMessageId: branchInput.forkedFromMessageId,
    memory: memories.map((memory) => ({
      id: memory.id,
      category: memory.category,
      statement: memory.statement,
      scope: memory.scope,
      updatedAt: memory.updatedAt,
    })),
  });
  const safetyIdentifier = await sha256Json({ scope: "openai-safety-v1", userId: user.id });
  const instructionHash = await sha256Json({ version: INSTRUCTION_VERSION, jurisdiction: "UZ" });
  const sourceVersionHash = await sha256Json({
    freshness,
    evidence,
    sources: sources.map((source) => ({
      id: source.id, hash: source.contentSha256, excerpt: source.excerpt || null,
    })),
  });

  let reservation;
  try {
    reservation = await reserveAiRun({
      db, workspaceId: workspace.id, userId: user.id, idempotencyKey, requestHash,
      conversationId: existingConversation ? conversationId : null,
      provider: provider.name, model: providerStatus.model, answerMode, reasoningMode,
      legalDatabaseAsOf, instructionHash, sourceVersionHash,
      monthlyLimit: entitlements.aiAnswerCyclesMonthly,
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
    const replay = await loadConversationResult(db, reservation.conversationId, workspace.id, user.id, null, reservation.responseMessageId);
    return response({ ...replay, idempotentReplay: true }, 200);
  }
  if (reservation.kind === "processing") {
    return response({ code: "AI_RUN_PROCESSING", runId: reservation.runId }, 202);
  }
  if (reservation.kind === "expired") {
    return response({
      code: "AI_RUN_EXPIRED",
      runId: reservation.runId,
      error: locale === "ru"
        ? "Предыдущий запрос не завершился вовремя. Отправьте его ещё раз — будет создан новый защищённый запрос."
        : "Oldingi so‘rov vaqtida yakunlanmadi. Uni yana yuboring — yangi himoyalangan so‘rov yaratiladi.",
    }, 409);
  }
  if (reservation.kind === "failed") {
    return response({
      code: "AI_RUN_FAILED",
      runId: reservation.runId,
      previousErrorCode: publicAiFailureCode(reservation.errorCode),
      error: locale === "ru"
        ? "Предыдущая попытка завершилась ошибкой и не списала лимит. Можно безопасно создать новый запрос."
        : "Oldingi urinish xato bilan yakunlandi va limit yechilmadi. Yangi so‘rovni xavfsiz yaratish mumkin.",
    }, 409);
  }

  let aiResult;
  try {
    aiResult = await provider.runLegalChat({
      question, locale, answerMode, reasoningMode, sources, legalDatabaseAsOf,
      requestId: reservation.correlationId, safetyIdentifier,
      memories: memories.map((memory) => ({
        category: memory.category,
        statement: memory.statement,
        scope: memory.scope,
      })),
    }, { signal, onProgress });
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

  let result;
  try {
    const boundedResult = enforceLegalChatSourceBoundary(
      parseLegalChatResponse(aiResult.data),
      new Set(sources.filter((source) => source.excerpt?.trim()).map((source) => source.id)),
    );
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const canonicalResult = {
      ...boundedResult,
      sources: boundedResult.sources.map((reference) => {
        const source = sourceById.get(reference.sourceId)!;
        return {
          sourceId: source.id,
          actTitle: source.actTitle,
          actIdentifier: source.actIdentifier,
          article: source.article ?? null,
          excerpt: source.excerpt ?? null,
          originalUrl: source.officialUrl,
          status: "current" as const,
          effectiveDate: source.effectiveDate ?? null,
          verifiedAt: source.verifiedAt,
        };
      }),
    };
    result = enforceLegalDatabaseFreshness(
      canonicalResult,
      freshness,
      { locale, answerMode, reasoningMode },
    );
  } catch {
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      errorCode: "INVALID_AI_OUTPUT",
    });
    return response({
      code: "INVALID_AI_OUTPUT",
      correlationId: reservation.correlationId,
      error: localizedProviderError(locale, "INVALID_AI_OUTPUT"),
    }, 422);
  }
  const now = isoNow();
  if (!await beginAiRunFinalization({
    db, runId: reservation.runId, workspaceId: workspace.id, userId: user.id,
  })) {
    return response({
      code: "AI_RUN_EXPIRED",
      runId: reservation.runId,
      error: locale === "ru"
        ? "Ответ не был сохранён: предыдущий запрос уже был безопасно закрыт. Отправьте вопрос ещё раз."
        : "Javob saqlanmadi: oldingi so‘rov xavfsiz yopilgan. Savolni yana yuboring.",
    }, 409);
  }
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const messageVersionId = crypto.randomUUID();
  const contentSha256 = await sha256Json(question);
  const facts = result.assumptions.map((assumption) => ({ id: crypto.randomUUID(), statement: assumption.statement, status: "proposed" as const }));
  const statements = [
    ...(existingConversation ? [] : [db.prepare(
      "INSERT INTO conversations (id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)",
    ).bind(conversationId, workspace.id, user.id, body?.caseId || null, question.slice(0, 120), locale, now, now)]),
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at) VALUES (?,?,'user',?,?)")
      .bind(userMessageId, conversationId, question, now),
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,'assistant',?,?,?)")
      .bind(assistantMessageId, conversationId, result.answer, JSON.stringify(result), now),
    db.prepare(
      "INSERT INTO message_branches (id,conversation_id,workspace_id,owner_user_id,parent_branch_id,forked_from_message_id,request_message_id,response_message_id,operation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(branchId, conversationId, workspace.id, user.id, branchInput.parentBranchId, branchInput.forkedFromMessageId, userMessageId, assistantMessageId, branchInput.operation, now),
    db.prepare(
      "INSERT INTO message_versions (id,conversation_id,branch_id,message_id,source_message_id,created_by_user_id,operation,version_number,content_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(messageVersionId, conversationId, branchId, userMessageId, branchInput.sourceMessageId, user.id, branchInput.operation, branchInput.versionNumber, contentSha256, now),
    db.prepare("UPDATE conversations SET updated_at=? WHERE id=? AND workspace_id=?").bind(now, conversationId, workspace.id),
    ...facts.map((fact) => db.prepare(
      "INSERT INTO confirmed_facts (id,conversation_id,case_id,statement,status,created_at,updated_at) VALUES (?,?,?,?,'proposed',?,?)",
    ).bind(fact.id, conversationId, body?.caseId || null, fact.statement, now, now)),
    ...result.sources.map((source) => db.prepare(
      "INSERT INTO conversation_sources (id,conversation_id,message_id,source_id,citation_label,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), conversationId, assistantMessageId, source.sourceId, source.article || source.actIdentifier || source.sourceId, now)),
    ...(voiceRecording ? [linkVoiceRecordingStatement({
      db,
      recordingId: voiceRecording.id,
      workspaceId: workspace.id,
      userId: user.id,
      conversationId,
      messageId: userMessageId,
      caseId: body?.caseId || null,
      now,
    })] : []),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'conversation',?,'ai_chat_completed',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, conversationId, JSON.stringify({
      runId: reservation.runId, provider: aiResult.provider, model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider,
      sourceCount: result.sources.length, responseKind: result.responseKind,
      sourceFreshnessStatus: freshness.status,
      sourceFreshnessAsOf: freshness.asOf,
      branchId, operation: branchInput.operation,
      sourceMessageId: branchInput.forkedFromMessageId,
    }), now),
  ];
  try {
    await db.batch([...statements, ...completeAiRunStatements({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      conversationId, requestMessageId: userMessageId, responseMessageId: assistantMessageId,
      providerResponseId: aiResult.providerResponseId, model: aiResult.model,
      provider: aiResult.provider,
      fallbackFromProvider: aiResult.fallbackFromProvider,
      inputTokens: aiResult.usage.inputTokens, outputTokens: aiResult.usage.outputTokens,
      cachedInputTokens: aiResult.usage.cachedInputTokens, attempts: aiResult.attempts,
      latencyMs: aiResult.latencyMs, chargeable: result.responseKind === "answer",
    })]);
  } catch (error) {
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey, errorCode: "PERSISTENCE_FAILED",
    });
    throw error;
  }

  if (memoryEncryption) {
    try {
      await persistAutomaticMemories({
        db,
        keyring: memoryEncryption,
        userId: user.id,
        workspaceId: workspace.id,
        conversationId,
        messageId: userMessageId,
        question,
        locale,
      });
    } catch (error) {
      console.warn({
        event: "ai.memory_persistence_failed",
        code: error instanceof UserMemoryError ? error.code : "MEMORY_WRITE_FAILED",
        runId: reservation.runId,
      });
    }
  }

  return response({
    conversationId, messageId: assistantMessageId, runId: reservation.runId,
    requestMessageId: userMessageId, branchId, operation: branchInput.operation,
    branches: await listAiBranches({ db, conversationId, workspaceId: workspace.id, userId: user.id }),
    correlationId: reservation.correlationId, result, facts, sources: result.sources,
    sourceFreshness: freshness,
    technicalDetails: {
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider,
    },
    usage: await usageSummary(db, workspace.id, user.id, entitlements.aiAnswerCyclesMonthly),
  }, 201);
}


const guardedExecutePost = withApiErrors(executePost);

export async function POST(request: Request) {
  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    return guardedExecutePost(request);
  }
  const abortController = new AbortController();
  const encoder = new TextEncoder();
  const abortFromRequest = () => abortController.abort();
  if (request.signal.aborted) abortController.abort();
  else request.signal.addEventListener("abort", abortFromRequest, { once: true });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: string, data: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cancelled = true;
          abortController.abort();
        }
      };
      emit("status", { stage: "accepted" });
      void (async () => {
        try {
          const result = await guardedExecutePost(
            request,
            (progress) => emit("status", progress),
            abortController.signal,
          );
          const body = await result.json().catch(() => ({
            code: "STREAM_RESPONSE_INVALID",
            error: "AI stream returned a non-JSON terminal response.",
          }));
          emit(result.ok ? "complete" : "error", { status: result.status, body });
        } catch {
          emit("error", {
            status: 500,
            body: { code: "STREAM_FAILED", error: "AI stream failed before completion." },
          });
        } finally {
          request.signal.removeEventListener("abort", abortFromRequest);
          if (!cancelled) {
            try { controller.close(); } catch { /* client disconnected */ }
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
      abortController.abort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "cache-control": "private, no-store, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      pragma: "no-cache",
      "x-accel-buffering": "no",
    },
  });
}

async function loadConversationResult(db: D1Database, conversationId: string, workspaceId: string, userId: string, branchId?: string | null, responseMessageId?: string | null) {
  const conversation = await selectAiConversationMessage(
    { db, conversationId, workspaceId, userId, branchId, responseMessageId },
  );
  if (!conversation?.structuredJson) return null;
  const facts = await db.prepare("SELECT id,statement,status FROM confirmed_facts WHERE conversation_id=? ORDER BY created_at")
    .bind(conversationId).all();
  const storedResult = parseLegalChatResponse(
    parseJson(conversation.structuredJson, null),
  );
  const sourceFreshness = legalDatabaseFreshnessFromAsOf(
    storedResult.legalDatabaseAsOf,
  );
  const result = enforceLegalDatabaseFreshness(storedResult, sourceFreshness, {
    locale: storedResult.language, answerMode: storedResult.answerMode, reasoningMode: storedResult.reasoningMode,
  });
  return {
    conversationId: conversation.conversationId,
    messageId: conversation.messageId,
    branchId: conversation.branchId,
    requestMessageId: conversation.requestMessageId,
    operation: conversation.operation,
    question: conversation.question || "",
    branches: await listAiBranches({ db, conversationId, workspaceId, userId }),
    result,
    sourceFreshness,
    facts: facts.results,
    sources: result.sources,
  };
}

async function usageSummary(db: D1Database, workspaceId: string, userId: string, limit: number) {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const row = await db.prepare(
    "SELECT COALESCE(SUM(units),0) AS used FROM ai_usage_ledger WHERE workspace_id=? AND user_id=? AND feature='legal_chat' AND period_start=? AND status='consumed'",
  ).bind(workspaceId, userId, periodStart).first<{ used: number }>();
  return { used: row?.used ?? 0, limit, periodEnd };
}

function localizedProviderError(locale: "ru" | "uz", code: string) {
  const ru: Record<string, string> = {
    PROVIDER_TIMEOUT: "AI не успел завершить ответ. Лимит не списан; попробуйте ещё раз.",
    INVALID_AI_OUTPUT: "AI вернул результат, который не прошёл проверку структуры. Лимит не списан.",
    AI_REFUSED: "Запрос не был обработан AI. Лимит не списан.",
    PROVIDER_UNAVAILABLE: "AI-провайдер временно недоступен. Лимит не списан.",
    AI_CANCELLED: "Генерация остановлена. Лимит не списан.",
  };
  const uz: Record<string, string> = {
    PROVIDER_TIMEOUT: "AI javobni vaqtida yakunlamadi. Limit yechilmadi; qayta urinib ko‘ring.",
    INVALID_AI_OUTPUT: "AI natijasi tuzilma tekshiruvidan o‘tmadi. Limit yechilmadi.",
    AI_REFUSED: "So‘rov AI tomonidan qayta ishlanmadi. Limit yechilmadi.",
    PROVIDER_UNAVAILABLE: "AI-provayder vaqtincha ishlamayapti. Limit yechilmadi.",
    AI_CANCELLED: "Javob yaratish to‘xtatildi. Limit yechilmadi.",
  };
  return (locale === "ru" ? ru : uz)[code] || (locale === "ru" ? ru.PROVIDER_UNAVAILABLE : uz.PROVIDER_UNAVAILABLE);
}

function publicAiFailureCode(code: string) {
  return new Set([
    "AI_CANCELLED",
    "AI_REFUSED",
    "INVALID_AI_OUTPUT",
    "PROVIDER_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
  ]).has(code) ? code : "AI_RUN_FAILED";
}
