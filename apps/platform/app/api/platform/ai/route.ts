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
import { listAiConversationBranchMessages, selectAiConversationMessage } from "../../../../lib/ai/conversation-branch-reader";
import {
  enforceLegalDatabaseFreshness,
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
  type LegalChatResponse,
} from "../../../../lib/ai/legal-chat-schema";
import {
  formatClarificationAnswers,
  normalizeAiAnswerPreferences,
  parseClarificationAnswers,
  parseStoredUserMessageMeta,
} from "../../../../lib/ai/chat-dialog";
import {
  legalDatabaseFreshnessFromAsOf,
} from "../../../../lib/legal/verified-retrieval";
import {
  directSourceCards,
  retrieveDirectLegalSources,
  unavailableDirectLegalRetrieval,
} from "../../../../lib/legal/direct-retrieval";
import { findReviewedAdviceScenarioContext } from "../../../../lib/legal/advice-scenario-context";
import { directCitationStatements } from "../../../../lib/legal/direct-citation-store";
import { parseLegalApplicabilityDate } from "../../../../lib/legal/applicability-date";
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
import {
  assertProviderCallAllowed,
  parseProviderEnvironment,
  ProviderCostControlError,
} from "../../../../lib/ai/provider-cost-control";
import { recordProviderUsage } from "../../../../lib/ai/provider-usage";
import { resolveAiRuntimeSettings } from "../../../../lib/ai/runtime-settings";
import {
  assertOperationalFeatureEnabled,
  operationalEnvironment,
  OperationalFeatureError,
  operationalFeatureMessage,
} from "../../../../lib/operations/operational-feature-flags";

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
    legalContextDate?: string;
    clarificationAnswers?: unknown;
    clarificationSourceMessageId?: string;
    preferences?: unknown;
  } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const db = requireD1();
  try {
    await assertOperationalFeatureEnabled({ db, environment: operationalEnvironment(runtimeEnv().APP_ENV), key: "ai_chat" });
  } catch (error) {
    if (!(error instanceof OperationalFeatureError)) throw error;
    return response({ code: error.code, error: operationalFeatureMessage(locale) }, 503);
  }
  const submittedQuestion = body?.question?.trim();
  const parsedClarificationAnswers = body?.clarificationAnswers === undefined
    ? null
    : parseClarificationAnswers(body.clarificationAnswers);
  if (body?.clarificationAnswers !== undefined && !parsedClarificationAnswers) {
    return response({
      code: "INVALID_CLARIFICATION_ANSWERS",
      error: locale === "ru"
        ? "Проверьте ответы на уточняющие вопросы: можно отправить от одного до трёх непустых ответов."
        : "Aniqlashtiruvchi savollarga javoblarni tekshiring: birdan uchgacha bo‘sh bo‘lmagan javob yuborish mumkin.",
    }, 400);
  }
  // Older clients could submit a bounded batch. Keep that request compatible,
  // but this answer-first flow processes one fact per turn.
  const clarificationAnswers = parsedClarificationAnswers?.slice(0, 1) ?? null;
  const preferences = normalizeAiAnswerPreferences(body?.preferences);
  if (!preferences) {
    return response({
      code: "INVALID_AI_PREFERENCES",
      error: locale === "ru" ? "Настройки ответа имеют неподдерживаемый формат." : "Javob sozlamalari qo‘llab-quvvatlanmaydigan formatda.",
    }, 400);
  }
  const questionForBranch = clarificationAnswers
    ? formatClarificationAnswers(locale, clarificationAnswers)
    : submittedQuestion;
  const answerMode = body?.answerMode === "short" ? "short" : "detailed";
  const reasoningMode = body?.reasoningMode === "deep" ? "deep" : "fast";
  const applicableAt = body?.legalContextDate
    ? parseLegalApplicabilityDate(body.legalContextDate)
    : null;
  if (body?.legalContextDate && !applicableAt) {
    return response({
      code: "INVALID_LEGAL_CONTEXT_DATE",
      error: locale === "ru"
        ? "Укажите существующую дату события не позднее сегодняшнего дня."
        : "Bugungi kundan kech bo‘lmagan haqiqiy voqea sanasini kiriting.",
    }, 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return response({
      code: "INVALID_IDEMPOTENCY_KEY",
      error: locale === "ru" ? "Повторите отправку: идентификатор запроса отсутствует или некорректен." : "Qayta yuboring: so‘rov identifikatori yo‘q yoki noto‘g‘ri.",
    }, 400);
  }
  if (body?.operation !== "regenerate" && (!questionForBranch || questionForBranch.length < 5)) {
    return response({ error: locale === "ru" ? "Опишите ситуацию чуть подробнее." : "Vaziyatni biroz batafsil yozing." }, 400);
  }
  if (questionForBranch && questionForBranch.length > 8_000) {
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

  const providerEnvironment = parseProviderEnvironment(runtimeEnv().APP_ENV);
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
  const clarificationSourceMessageId = body?.clarificationSourceMessageId?.trim() || null;
  if (clarificationSourceMessageId && (!clarificationAnswers || !existingConversation)) {
    return response({
      code: "INVALID_CLARIFICATION_SOURCE",
      error: locale === "ru" ? "Исходный ответ для уточнения не найден." : "Aniqlik uchun boshlang‘ich javob topilmadi.",
    }, 400);
  }
  if (clarificationSourceMessageId) {
    const sourceMessage = await db.prepare(`
      SELECT assistant.id
      FROM conversations conversation
      INNER JOIN conversation_messages assistant
        ON assistant.conversation_id=conversation.id AND assistant.id=? AND assistant.author_type='assistant'
      WHERE conversation.id=? AND conversation.workspace_id=? AND conversation.owner_user_id=?
      LIMIT 1
    `).bind(clarificationSourceMessageId, conversationId, workspace.id, user.id).first();
    if (!sourceMessage) {
      return response({
        code: "INVALID_CLARIFICATION_SOURCE",
        error: locale === "ru" ? "Исходный ответ для уточнения не найден." : "Aniqlik uchun boshlang‘ich javob topilmadi.",
      }, 404);
    }
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
      question: questionForBranch,
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
  const clarificationTurnsUsed = existingConversation
    ? await completedClarificationCount(db, conversationId)
    : 0;
  const remainingClarifications = Math.max(0, 3 - clarificationTurnsUsed);
  if (clarificationAnswers && remainingClarifications === 0) {
    return response({
      code: "MAX_CLARIFICATIONS_REACHED",
      error: locale === "ru"
        ? "Достигнут предел уточнений для этого пути. Можно задать новый вопрос в свободной форме."
        : "Bu yo‘l uchun aniqliklar limiti tugadi. Yangi savolni erkin shaklda berishingiz mumkin.",
    }, 409);
  }
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
  await onProgress?.({ stage: "retrieval_started" });
  const [retrieval, adviceScenarios] = await Promise.all([
    runtimeEnv().LEGAL_DIRECT_RETRIEVAL_ENABLED === "true"
      ? retrieveDirectLegalSources(question, locale, { limit: 1, signal, sourceKinds: ["lex"] })
      : Promise.resolve(unavailableDirectLegalRetrieval()),
    findReviewedAdviceScenarioContext({ db, question, locale }),
  ]);
  await onProgress?.({ stage: "retrieval_completed" });
  const { sources, evidence, freshness, legalDatabaseAsOf } = retrieval;
  const requestHash = await sha256Json({
    question,
    locale,
    answerMode,
    reasoningMode,
    legalContextDate: body?.legalContextDate || null,
    clarificationAnswers,
    clarificationSourceMessageId,
    preferences,
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
    adviceScenarioTitles: adviceScenarios.map((scenario) => scenario.title),
  });
  const safetyIdentifier = await sha256Json({ scope: "openai-safety-v1", userId: user.id });
  const runtimeSettings = await resolveAiRuntimeSettings({ db, env: runtimeEnv() });
  const instructionHash = await sha256Json({
    version: INSTRUCTION_VERSION,
    jurisdiction: "UZ",
    runtimeConfigHash: runtimeSettings.configHash,
  });
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
      provider: provider.name,
      model: provider.name === "openai"
        ? (reasoningMode === "deep" ? runtimeSettings.openaiDeepModel : runtimeSettings.openaiChatModel)
        : runtimeSettings.anthropicChatFallbackModel,
      answerMode, reasoningMode,
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

  const providerCalls: Array<{
    provider: "openai" | "anthropic";
    model: string;
    startedAt: string;
  }> = [];
  const providerFailures: Array<{
    provider: "openai" | "anthropic";
    code: AiUnavailableError["code"];
    providerStatus: number | null;
    providerErrorType: string | null;
  }> = [];
  const beforeProviderCall = async (call: { provider: "openai" | "anthropic"; model: string }) => {
    try {
      await assertProviderCallAllowed({
        db,
        environment: providerEnvironment,
        provider: call.provider,
      });
    } catch (error) {
      if (error instanceof ProviderCostControlError && error.code === "PROVIDER_CIRCUIT_OPEN") {
        throw new AiUnavailableError(
          "AI-провайдер временно остановлен системой контроля расходов.",
          "PROVIDER_CIRCUIT_OPEN",
          false,
        );
      }
      throw error;
    }
    providerCalls.push({ ...call, startedAt: isoNow() });
  };

  let aiResult;
  try {
    aiResult = await provider.runLegalChat({
      question, locale, answerMode, reasoningMode, sources, legalDatabaseAsOf,
      applicableAt: applicableAt?.toISOString(),
      requestId: reservation.correlationId, safetyIdentifier,
      memories: memories.map((memory) => ({
        category: memory.category,
        statement: memory.statement,
        scope: memory.scope,
      })),
      preferences,
      adviceScenarios,
      runtimeSettings,
    }, {
      signal,
      onProgress,
      beforeProviderCall,
      onProviderFailure: async (failure) => { providerFailures.push(failure); },
    });
  } catch (error) {
    const code = error instanceof AiUnavailableError ? error.code : "PROVIDER_UNAVAILABLE";
    // Keep staging/provider incidents diagnosable without emitting the legal
    // question, user identifiers, source excerpts, or provider response body.
    // The request correlation id already belongs to the client-safe response
    // and lets operations correlate this metadata with the durable ai_run.
    console.warn(JSON.stringify({
      event: "ai.legal_chat_provider_failed",
      code,
      providerStatus: error instanceof AiUnavailableError ? error.providerStatus : null,
      providerErrorType: error instanceof AiUnavailableError ? error.providerErrorType : null,
      attemptedProviders: providerCalls.map((call) => ({ provider: call.provider, model: call.model })),
      providerFailures,
      correlationId: reservation.correlationId,
    }));
    // Store the same non-content metadata in the durable workspace audit log.
    // This makes a provider incident explainable even where operator log access
    // is intentionally restricted, while preserving the privacy boundary for
    // legal questions, source excerpts, and raw provider responses.
    try {
      await db.prepare(
        "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'ai_run',?,'ai_chat_provider_failure',?,?)",
      ).bind(
        crypto.randomUUID(),
        workspace.id,
        user.id,
        reservation.runId,
        JSON.stringify({
          code,
          providerStatus: error instanceof AiUnavailableError ? error.providerStatus : null,
          providerErrorType: error instanceof AiUnavailableError ? error.providerErrorType : null,
          attemptedProviders: providerCalls.map((call) => ({ provider: call.provider, model: call.model })),
          providerFailures,
        }),
        isoNow(),
      ).run();
    } catch {
      // Failure audit must not mask the durable run failure or public response.
    }
    const completedAt = isoNow();
    try {
      for (const call of providerCalls) {
        await recordProviderUsage({
          db,
          environment: providerEnvironment,
          workspaceId: workspace.id,
          userId: user.id,
          feature: "legal_chat",
          operation: call.provider === "openai" ? "responses" : "messages",
          provider: call.provider,
          model: call.model,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          status: "failed",
          errorCode: code,
          startedAt: call.startedAt,
          completedAt,
          eventId: `provider_usage_${reservation.runId}_${call.provider}`,
        });
      }
    } catch {
      // The durable ai_run failure below remains the reconciliation source.
    }
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
    await onProgress?.({ stage: "validation_started" });
    const boundedResult = enforceLegalChatSourceBoundary(
      parseLegalChatResponse(aiResult.data),
      new Set(sources.filter((source) => source.excerpt?.trim()).map((source) => source.id)),
    );
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    // The model may correctly decline to cite a page. In direct mode the
    // technically validated, query-relevant page can still be shown as an
    // official source card; it does not turn any model claim into a cited fact.
    const returnedSources = boundedResult.sources.length > 0
      ? boundedResult.sources
      : directSourceCards(sources);
    const canonicalResult = {
      ...boundedResult,
      sources: returnedSources.map((reference) => {
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
      sourceAccessMode: retrieval.sourceAccessMode,
      sourcesRetrievedAt: retrieval.sourcesRetrievedAt,
      sourceValidationStatus: retrieval.sourceValidationStatus,
    };
    result = answerFirstResult(enforceLegalDatabaseFreshness(
      canonicalResult,
      freshness,
      { locale, answerMode, reasoningMode },
    ), { remainingClarifications });
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

  try {
    await onProgress?.({ stage: "persisting" });
    const completedAt = isoNow();
    for (const call of providerCalls.filter((call) => call.provider !== aiResult.provider)) {
      await recordProviderUsage({
        db,
        environment: providerEnvironment,
        workspaceId: workspace.id,
        userId: user.id,
        feature: "legal_chat",
        operation: call.provider === "openai" ? "responses" : "messages",
        provider: call.provider,
        model: call.model,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        status: "failed",
        errorCode: "FALLBACK_USED",
        startedAt: call.startedAt,
        completedAt,
        eventId: `provider_usage_${reservation.runId}_${call.provider}`,
      });
    }
    const successfulCall = [...providerCalls].reverse().find((call) => call.provider === aiResult.provider);
    await recordProviderUsage({
      db,
      environment: providerEnvironment,
      workspaceId: workspace.id,
      userId: user.id,
      feature: "legal_chat",
      operation: aiResult.provider === "openai" ? "responses" : "messages",
      provider: aiResult.provider,
      model: aiResult.model,
      providerRequestId: aiResult.providerResponseId,
      inputTokens: aiResult.usage.inputTokens,
      outputTokens: aiResult.usage.outputTokens,
      cachedInputTokens: aiResult.usage.cachedInputTokens,
      status: "succeeded",
      startedAt: successfulCall?.startedAt ?? completedAt,
      completedAt,
      eventId: `provider_usage_${reservation.runId}_${aiResult.provider}`,
    });
  } catch {
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      errorCode: "PROVIDER_USAGE_PERSISTENCE_FAILED",
    });
    return response({
      code: "PROVIDER_UNAVAILABLE",
      correlationId: reservation.correlationId,
      error: localizedProviderError(locale, "PROVIDER_UNAVAILABLE"),
    }, 503);
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
    db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,'user',?,?,?)")
      .bind(userMessageId, conversationId, question, JSON.stringify({
        kind: "juro_ai_user_message",
        clarificationAnswers: clarificationAnswers ?? undefined,
        clarificationOrigin: clarificationAnswers && clarificationSourceMessageId
          ? { assistantMessageId: clarificationSourceMessageId, branchId: branchInput.parentBranchId }
          : undefined,
        legalContextDate: body?.legalContextDate || null,
        preferences,
      }), now),
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
    ...directCitationStatements({
      db,
      sources,
      citations: result.sources,
      aiRunId: reservation.runId,
      conversationId,
      messageId: assistantMessageId,
      now,
    }),
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
      // Direct retrieval errors are bounded public codes only. Keeping them in
      // the workspace audit record makes a staging source outage diagnosable
      // without retaining a source page, question, or provider response.
      directSourceErrorCodes: retrieval.errors.map((error) => error.code).slice(0, 4),
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
      // A follow-up that supplies one of JURO's optional post-answer facts
      // updates the same legal turn. It must not reserve or consume a second
      // answer cycle merely because the refreshed result is an answer.
      latencyMs: aiResult.latencyMs, chargeable: result.responseKind === "answer" && !clarificationAnswers,
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

  const persisted = await loadConversationResult(
    db,
    conversationId,
    workspace.id,
    user.id,
    branchId,
    assistantMessageId,
  );
  if (!persisted) throw new Error("AI_PERSISTED_CONVERSATION_MISSING");
  return response({
    ...persisted,
    conversationId, messageId: assistantMessageId, runId: reservation.runId,
    requestMessageId: userMessageId, branchId, operation: branchInput.operation,
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

/** A clarification is a follow-up aid, never a gate before the first answer. */
function answerFirstResult(
  result: LegalChatResponse,
  options: { remainingClarifications: number },
): LegalChatResponse {
  return {
    ...result,
    responseKind: "answer",
    clarificationQuestions: options.remainingClarifications > 0
      ? result.clarificationQuestions.slice(0, 1)
      : [],
  };
}

async function completedClarificationCount(db: D1Database, conversationId: string): Promise<number> {
  const messages = await db.prepare(`
    SELECT structured_json AS structuredJson
    FROM conversation_messages
    WHERE conversation_id=? AND author_type='user'
  `).bind(conversationId).all<{ structuredJson: string | null }>();
  return messages.results.reduce((count, message) => (
    count + (parseStoredUserMessageMeta(parseJson(message.structuredJson || "", null))?.clarificationAnswers?.length ?? 0)
  ), 0);
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
  const result = storedResult.sourceAccessMode === "direct"
    ? storedResult
    : enforceLegalDatabaseFreshness(storedResult, sourceFreshness, {
    locale: storedResult.language, answerMode: storedResult.answerMode, reasoningMode: storedResult.reasoningMode,
  });
  return {
    conversationId: conversation.conversationId,
    messageId: conversation.messageId,
    branchId: conversation.branchId,
    requestMessageId: conversation.requestMessageId,
    operation: conversation.operation,
    question: conversation.question || "",
    messages: (await listAiConversationBranchMessages({
      db,
      conversationId,
      workspaceId,
      userId,
      selectedBranchId: conversation.branchId,
      selectedResponseMessageId: conversation.messageId,
    })).map((message) => {
      if (message.authorType === "assistant") {
        const stored = parseLegalChatResponse(parseJson(message.structuredJson || "", null));
        const messageFreshness = legalDatabaseFreshnessFromAsOf(stored.legalDatabaseAsOf);
        const result = stored.sourceAccessMode === "direct"
          ? stored
          : enforceLegalDatabaseFreshness(stored, messageFreshness, {
            locale: stored.language,
            answerMode: stored.answerMode,
            reasoningMode: stored.reasoningMode,
          });
        return {
          id: message.id,
          authorType: message.authorType,
          content: message.content,
          createdAt: message.createdAt,
          branchId: message.branchId,
          clarificationDismissed: message.clarificationDismissed,
          result,
        };
      }
      const meta = parseStoredUserMessageMeta(parseJson(message.structuredJson || "", null));
      return {
        id: message.id,
        authorType: message.authorType,
        content: message.content,
        createdAt: message.createdAt,
        branchId: message.branchId,
        clarificationDismissed: false,
        clarificationAnswers: meta?.clarificationAnswers ?? null,
        legalContextDate: meta?.legalContextDate ?? null,
      };
    }),
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
    PROVIDER_CIRCUIT_OPEN: "AI временно остановлен системой контроля расходов. Лимит не списан.",
    AI_CANCELLED: "Генерация остановлена. Лимит не списан.",
  };
  const uz: Record<string, string> = {
    PROVIDER_TIMEOUT: "AI javobni vaqtida yakunlamadi. Limit yechilmadi; qayta urinib ko‘ring.",
    INVALID_AI_OUTPUT: "AI natijasi tuzilma tekshiruvidan o‘tmadi. Limit yechilmadi.",
    AI_REFUSED: "So‘rov AI tomonidan qayta ishlanmadi. Limit yechilmadi.",
    PROVIDER_UNAVAILABLE: "AI-provayder vaqtincha ishlamayapti. Limit yechilmadi.",
    PROVIDER_CIRCUIT_OPEN: "AI xarajat nazorati tomonidan vaqtincha to‘xtatildi. Limit yechilmadi.",
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
    "PROVIDER_CIRCUIT_OPEN",
  ]).has(code) ? code : "AI_RUN_FAILED";
}
