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
import { AiBranchInputError, deleteAiConversation, listAiAnswerVersions, resolveAiBranchInput } from "../../../../lib/ai/branch-store";
import { loadAiConversationTurns, selectAiConversationMessage } from "../../../../lib/ai/conversation-branch-reader";
import {
  enforceLegalDatabaseFreshness,
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
} from "../../../../lib/ai/legal-chat-schema";
import { createUnavailableVerifiedSourceClarification } from "../../../../lib/ai/fast-clarification";
import {
  legalDatabaseFreshnessFromAsOf,
} from "../../../../lib/legal/verified-retrieval";
import {
  retrieveInteractiveVerifiedLegalSources,
  unavailableInteractiveVerifiedLegalRetrieval,
  type InteractiveVerifiedLegalRetrieval,
} from "../../../../lib/legal/interactive-verified-retrieval";
import { legalCitationStatements } from "../../../../lib/legal/direct-citation-store";
import {
  AI_INTERACTIVE_FINALIZATION_RESERVE_MS,
  createAiExecutionBudget,
  type AiExecutionBudget,
} from "../../../../lib/ai/execution-budget";
import {
  tryRecordAiSloTelemetry,
  type AiSloFirstUsefulStage,
} from "../../../../lib/ai/slo-telemetry";
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

const INSTRUCTION_VERSION = "juro-legal-chat-v2-conversation";

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

export const DELETE = withApiErrors(async function DELETE(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const conversationId = new URL(request.url).searchParams.get("conversationId") || "";
  if (!/^[0-9a-z_-]{1,128}$/i.test(conversationId)) {
    return response({ code: "INVALID_CONVERSATION_ID", error: "Некорректный идентификатор диалога." }, 400);
  }
  const result = await deleteAiConversation({
    db: requireD1(),
    conversationId,
    workspaceId: workspace.id,
    userId: user.id,
  });
  if (result === "busy") {
    return response({ code: "CONVERSATION_BUSY", error: "Дождитесь завершения текущего ответа перед удалением диалога." }, 409);
  }
  if (result === "unavailable") {
    return response({ code: "CONVERSATION_UNAVAILABLE", error: "Диалог не найден." }, 404);
  }
  return response({ deleted: true, conversationId });
});

type AiRouteProgress = LegalAiProgress | {
  stage: "preliminary";
  preliminary: {
    kind: "verified_excerpt" | "clarification_required";
    message: string;
    excerpt?: string;
    sources: Array<{
      actTitle: string;
      article: string | null;
      originalUrl: string;
      verifiedAt: string;
    }>;
    sourceFreshness: "fresh" | "stale" | "unavailable";
    legalDatabaseAsOf: string;
  };
};

async function executePost(
  request: Request,
  onProgress?: (event: AiRouteProgress) => void | Promise<void>,
  signal: AbortSignal = request.signal,
) {
  const budget = createAiExecutionBudget({ callerSignal: signal });
  try {
    return await executePostWithinBudget(request, budget, onProgress, budget.signal);
  } finally {
    budget.dispose();
  }
}

async function executePostWithinBudget(
  request: Request,
  budget: AiExecutionBudget,
  onProgress?: (event: AiRouteProgress) => void | Promise<void>,
  signal: AbortSignal = request.signal,
) {
  assertSafeWrite(request);
  const authStage = budget.beginStage("auth");
  let user: Awaited<ReturnType<typeof requireApiUser>>;
  let workspace: Awaited<ReturnType<typeof workspaceForUser>>;
  try {
    user = await requireApiUser();
    workspace = await workspaceForUser(user);
    authStage.complete();
  } catch (error) {
    authStage.fail();
    throw error;
  }
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
  } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const db = requireD1();
  let preliminaryAtMs: number | null = null;
  let providerFirstDeltaAtMs: number | null = null;
  let fallbackFromProgress: "openai" | "anthropic" | null = null;
  const emitProgress = async (event: AiRouteProgress) => {
    await onProgress?.(event);
    // These are only recorded after an SSE client has actually received the
    // useful event. A regular JSON POST has no early user-visible response.
    if (onProgress && event.stage === "preliminary" && preliminaryAtMs === null) {
      preliminaryAtMs = budget.elapsedMs;
    }
    if (onProgress && event.stage === "provider_delta" && providerFirstDeltaAtMs === null) {
      providerFirstDeltaAtMs = budget.elapsedMs;
    }
    if (event.stage === "fallback") {
      fallbackFromProgress = event.from;
    }
  };
  try {
    await assertOperationalFeatureEnabled({ db, environment: operationalEnvironment(runtimeEnv().APP_ENV), key: "ai_chat" });
  } catch (error) {
    if (!(error instanceof OperationalFeatureError)) throw error;
    return response({ code: error.code, error: operationalFeatureMessage(locale) }, 503);
  }
  const submittedQuestion = body?.question?.trim();
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
  const branchTurns = existingConversation && branchInput.parentBranchId
    ? await loadAiConversationTurns({
      db,
      conversationId,
      workspaceId: workspace.id,
      userId: user.id,
      leafBranchId: branchInput.parentBranchId,
      limit: 12,
    })
    : [];
  // Editing/regenerating replaces the selected turn for model purposes. The
  // immutable old version remains available in history, but is not presented
  // as an earlier statement that the user made twice.
  const conversationHistory = boundedConversationHistory(
    branchInput.operation === "edit" || branchInput.operation === "regenerate"
      ? branchTurns.slice(0, -1)
      : branchTurns,
  );
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
  const retrievalQuestion = contextualRetrievalQuestion(conversationHistory, question);
  // These two bounded reads are independent. Start them together so a slow
  // encrypted-memory lookup cannot delay the first source-bound SSE brief.
  const memoryStage = budget.beginStage("memory_context", { timeoutMs: 1_250 });
  const retrievalStage = budget.beginStage("verified_retrieval", { timeoutMs: 2_250 });
  const memoryContext = (async () => {
    try {
      const keyring = memoryKeyring(runtimeEnv().IDENTITY_KEYRING);
      const loaded = (await listUserMemories({
        db,
        keyring,
        userId: user.id,
        workspaceId: workspace.id,
      })).slice(0, 20);
      memoryStage.complete();
      return { memoryEncryption: keyring, memories: loaded };
    } catch (error) {
      memoryStage.fail();
      if (!(error instanceof UserMemoryError)) throw error;
      console.warn({
        event: "ai.memory_context_unavailable",
        code: error.code,
        workspaceIdHash: await sha256Json({ workspaceId: workspace.id }),
      });
      return { memoryEncryption: null, memories: [] as UserMemory[] };
    }
  })();
  const verifiedRetrieval = (async (): Promise<InteractiveVerifiedLegalRetrieval> => {
    try {
      const result = await retrieveInteractiveVerifiedLegalSources({
        db,
        query: retrievalQuestion,
        locale,
        applicableAt: applicableAt ?? undefined,
        signal: retrievalStage.signal,
        limit: 2,
      });
      retrievalStage.complete();
      return result;
    } catch (error) {
      retrievalStage.fail();
      if (signal.aborted) throw error;
      return unavailableInteractiveVerifiedLegalRetrieval("VERIFIED_RETRIEVAL_TIMEOUT");
    }
  })();
  // The source-bound preliminary result is independent of personal-memory
  // decryption. Do not make a bounded-but-slower optional memory read hold up
  // the only safe <=5s user-visible result on the SSE path.
  const retrieval = await verifiedRetrieval;
  const { sources, evidence, freshness, legalDatabaseAsOf } = retrieval;
  await emitProgress({
    stage: "preliminary",
    preliminary: preliminaryForVerifiedRetrieval({ retrieval, locale, answerMode, reasoningMode }),
  });
  const { memoryEncryption, memories } = await memoryContext;
  const requestHash = await sha256Json({
    question,
    locale,
    answerMode,
    reasoningMode,
    legalContextDate: body?.legalContextDate || null,
    conversationId: body?.conversationId || null,
    caseId: body?.caseId || null,
    operation: branchInput.operation,
    sourceMessageId: branchInput.forkedFromMessageId,
    parentBranchId: branchInput.parentBranchId,
    memory: memories.map((memory) => ({
      id: memory.id,
      category: memory.category,
      statement: memory.statement,
      scope: memory.scope,
      updatedAt: memory.updatedAt,
    })),
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
  // Provider-level deadlines are derived from the same absolute request
  // budget. A separate short stage signal would abort a viable fallback, so
  // this stage is telemetry-only and the provider receives budget.signal.
  const providerStage = budget.beginStage("provider_execution");
  try {
    aiResult = await provider.runLegalChat({
      question, locale, answerMode, reasoningMode, sources, legalDatabaseAsOf,
      applicableAt: applicableAt?.toISOString(),
      requestId: reservation.correlationId, safetyIdentifier,
      conversationHistory,
      memories: memories.map((memory) => ({
        category: memory.category,
        statement: memory.statement,
        scope: memory.scope,
      })),
      runtimeSettings,
    }, {
      signal,
      budget,
      onProgress: emitProgress,
      beforeProviderCall,
      onProviderFailure: async (failure) => { providerFailures.push(failure); },
    });
    providerStage.complete();
  } catch (error) {
    providerStage.fail();
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
    const lastProviderCall = providerCalls.at(-1);
    const telemetryProvider = lastProviderCall?.provider
      ?? (provider.name === "anthropic" ? "anthropic" : "openai");
    await recordLegalChatSlo({
      db,
      budget,
      correlationId: reservation.correlationId,
      answerMode,
      reasoningMode,
      provider: telemetryProvider,
      model: lastProviderCall?.model ?? providerStatus.model,
      fallbackFromProvider: fallbackFromProgress,
      preliminaryAtMs,
      providerFirstDeltaAtMs,
      outcome: aiSloFailureOutcome(code, budget),
    });
    return response({
      code,
      correlationId: reservation.correlationId,
      error: localizedProviderError(locale, code),
    }, code === "AI_REFUSED" || code === "INVALID_AI_OUTPUT" ? 422 : 503);
  }

  let result;
  const validationStage = budget.beginStage("validation");
  try {
    const boundedResult = enforceLegalChatSourceBoundary(
      parseLegalChatResponse(aiResult.data),
      new Set(sources.filter((source) => source.excerpt?.trim()).map((source) => source.id)),
    );
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    // A verified corpus card can be shown even if the model elects not to cite
    // it. It is server-owned metadata, not a model legal assertion.
    const returnedSources = boundedResult.sources.length > 0
      ? boundedResult.sources
      : verifiedSourceCards(sources);
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
    result = enforceLegalDatabaseFreshness(
      canonicalResult,
      freshness,
      { locale, answerMode, reasoningMode },
    );
    validationStage.complete();
  } catch {
    validationStage.fail();
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      errorCode: "INVALID_AI_OUTPUT",
    });
    await recordLegalChatSlo({
      db,
      budget,
      correlationId: reservation.correlationId,
      answerMode,
      reasoningMode,
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider ?? fallbackFromProgress,
      preliminaryAtMs,
      providerFirstDeltaAtMs,
      outcome: aiSloFailureOutcome("INVALID_AI_OUTPUT", budget),
    });
    return response({
      code: "INVALID_AI_OUTPUT",
      correlationId: reservation.correlationId,
      error: localizedProviderError(locale, "INVALID_AI_OUTPUT"),
    }, 422);
  }
  // Preserve enough time for one atomic completion batch. If the full model
  // answer consumed the user-facing deadline, release the reservation rather
  // than storing/charging a response that arrived too late.
  if (budget.signal.aborted || budget.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS) {
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      errorCode: "PROVIDER_TIMEOUT",
    });
    await recordLegalChatSlo({
      db,
      budget,
      correlationId: reservation.correlationId,
      answerMode,
      reasoningMode,
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider ?? fallbackFromProgress,
      preliminaryAtMs,
      providerFirstDeltaAtMs,
      outcome: aiSloFailureOutcome("PROVIDER_TIMEOUT", budget),
    });
    return response({
      code: "PROVIDER_TIMEOUT",
      correlationId: reservation.correlationId,
      error: localizedProviderError(locale, "PROVIDER_TIMEOUT"),
    }, 503);
  }
  const now = isoNow();
  if (!await beginAiRunFinalization({
    db, runId: reservation.runId, workspaceId: workspace.id, userId: user.id,
  })) {
    await recordLegalChatSlo({
      db,
      budget,
      correlationId: reservation.correlationId,
      answerMode,
      reasoningMode,
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider ?? fallbackFromProgress,
      preliminaryAtMs,
      providerFirstDeltaAtMs,
      outcome: { outcome: "timed_out", safeErrorCode: "AI_SLO_TIMEOUT" },
    });
    return response({
      code: "AI_RUN_EXPIRED",
      runId: reservation.runId,
      error: locale === "ru"
        ? "Ответ не был сохранён: предыдущий запрос уже был безопасно закрыт. Отправьте вопрос ещё раз."
        : "Javob saqlanmadi: oldingi so‘rov xavfsiz yopilgan. Savolni yana yuboring.",
    }, 409);
  }

  try {
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
    // Cost telemetry is reconciled from the completed ai_run. It must never
    // turn an otherwise durable, validated legal result into a 503.
    console.warn(JSON.stringify({
      event: "ai.provider_usage_deferred",
      correlationId: reservation.correlationId,
    }));
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
    ...legalCitationStatements({
      db,
      sources,
      citations: result.sources,
      aiRunId: reservation.runId,
      conversationId,
      messageId: assistantMessageId,
      now,
      sourceAccessMode: "approved_package",
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
      verifiedRetrievalErrorCodes: retrieval.errors.map((error) => error.code).slice(0, 4),
      branchId, operation: branchInput.operation,
      sourceMessageId: branchInput.forkedFromMessageId,
    }), now),
  ];
  const persistenceStage = budget.beginStage("persistence");
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
    persistenceStage.complete();
  } catch (error) {
    persistenceStage.fail();
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey, errorCode: "PERSISTENCE_FAILED",
    });
    await recordLegalChatSlo({
      db,
      budget,
      correlationId: reservation.correlationId,
      answerMode,
      reasoningMode,
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackFromProvider: aiResult.fallbackFromProvider ?? fallbackFromProgress,
      preliminaryAtMs,
      providerFirstDeltaAtMs,
      outcome: aiSloFailureOutcome("PERSISTENCE_FAILED", budget),
    });
    throw error;
  }

  await recordLegalChatSlo({
    db,
    budget,
    correlationId: reservation.correlationId,
    answerMode,
    reasoningMode,
    provider: aiResult.provider,
    model: aiResult.model,
    fallbackFromProvider: aiResult.fallbackFromProvider ?? fallbackFromProgress,
    preliminaryAtMs,
    providerFirstDeltaAtMs,
    outcome: { outcome: "completed", safeErrorCode: null },
  });

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

  const turns = await conversationTurnsForClient({
    db,
    conversationId,
    workspaceId: workspace.id,
    userId: user.id,
    leafBranchId: branchId,
  });
  return response({
    conversationId, messageId: assistantMessageId, runId: reservation.runId,
    requestMessageId: userMessageId, branchId, operation: branchInput.operation,
    question,
    branches: await listAiAnswerVersions({ db, conversationId, workspaceId: workspace.id, userId: user.id, branchId }),
    turns,
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
  const { result, sourceFreshness } = storedConversationResult(conversation.structuredJson);
  return {
    conversationId: conversation.conversationId,
    messageId: conversation.messageId,
    branchId: conversation.branchId,
    requestMessageId: conversation.requestMessageId,
    operation: conversation.operation,
    question: conversation.question || "",
    branches: await listAiAnswerVersions({ db, conversationId, workspaceId, userId, branchId: conversation.branchId }),
    turns: await conversationTurnsForClient({
      db,
      conversationId,
      workspaceId,
      userId,
      leafBranchId: conversation.branchId,
    }),
    result,
    sourceFreshness,
    facts: facts.results,
    sources: result.sources,
  };
}

function storedConversationResult(structuredJson: string) {
  const storedResult = parseLegalChatResponse(parseJson(structuredJson, null));
  const sourceFreshness = legalDatabaseFreshnessFromAsOf(storedResult.legalDatabaseAsOf);
  const result = storedResult.sourceAccessMode === "direct"
    ? storedResult
    : enforceLegalDatabaseFreshness(storedResult, sourceFreshness, {
      locale: storedResult.language,
      answerMode: storedResult.answerMode,
      reasoningMode: storedResult.reasoningMode,
    });
  return { result, sourceFreshness };
}

async function conversationTurnsForClient(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
  leafBranchId: string | null;
}) {
  const turns = await loadAiConversationTurns(input);
  return turns.flatMap((turn) => {
    if (!turn.structuredJson) return [];
    const { result, sourceFreshness } = storedConversationResult(turn.structuredJson);
    return [{
      branchId: turn.branchId,
      requestMessageId: turn.requestMessageId,
      responseMessageId: turn.responseMessageId,
      question: turn.question,
      createdAt: turn.createdAt,
      result,
      sourceFreshness,
    }];
  });
}

function boundedConversationHistory(
  turns: Array<{ question: string; answer: string }>,
): Array<{ user: string; assistant: string }> {
  const selected: Array<{ user: string; assistant: string }> = [];
  let characters = 0;
  for (const turn of turns.slice(-12).reverse()) {
    const user = turn.question.trim().slice(0, 8_000);
    const assistant = turn.answer.trim().slice(0, 8_000);
    const size = user.length + assistant.length;
    if (selected.length > 0 && characters + size > 24_000) break;
    selected.push({ user, assistant });
    characters += size;
  }
  return selected.reverse();
}

function contextualRetrievalQuestion(
  history: Array<{ user: string; assistant: string }>,
  question: string,
) {
  const earlierQuestion = history.at(-1)?.user;
  return earlierQuestion
    ? `${earlierQuestion.slice(0, 2_000)}\n${question}`.slice(0, 4_000)
    : question;
}

function verifiedSourceCards(sources: ReadonlyArray<{
  id: string;
  actTitle: string;
  actIdentifier: string | null;
  article?: string | null;
  excerpt?: string | null;
  officialUrl: string;
  applicabilityStatus?: "current" | "historical";
  effectiveDate?: string | null;
  verifiedAt: string;
}>) {
  return sources.map((source) => ({
    sourceId: source.id,
    actTitle: source.actTitle,
    actIdentifier: source.actIdentifier,
    article: source.article ?? null,
    excerpt: source.excerpt ?? null,
    originalUrl: source.officialUrl,
    status: source.applicabilityStatus ?? "current" as const,
    effectiveDate: source.effectiveDate ?? null,
    verifiedAt: source.verifiedAt,
  }));
}

function preliminaryForVerifiedRetrieval(input: {
  retrieval: InteractiveVerifiedLegalRetrieval;
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
}) {
  const sources = input.retrieval.sources.slice(0, 2).map((source) => ({
    actTitle: source.actTitle,
    article: source.article ?? null,
    originalUrl: source.officialUrl,
    verifiedAt: source.verifiedAt,
  }));
  const firstExcerpt = input.retrieval.sources[0]?.excerpt?.trim().slice(0, 700);
  const hasVerifiedSources = sources.length > 0
    && Boolean(firstExcerpt)
    && input.retrieval.sourceValidationStatus === "validated";
  const clarification = hasVerifiedSources
    ? null
    : createUnavailableVerifiedSourceClarification({
      locale: input.locale,
      answerMode: input.answerMode,
      reasoningMode: input.reasoningMode,
      legalDatabaseAsOf: input.retrieval.legalDatabaseAsOf,
    });
  return {
    kind: hasVerifiedSources ? "verified_excerpt" as const : "clarification_required" as const,
    message: hasVerifiedSources
      ? (input.locale === "ru"
        ? "Проверенный фрагмент официального источника по вашему вопросу:"
        : "Savolingiz bo‘yicha rasmiy manbaning tasdiqlangan parchasi:")
      : clarification!.answer,
    ...(hasVerifiedSources ? { excerpt: firstExcerpt } : {}),
    sources,
    sourceFreshness: input.retrieval.freshness.status,
    legalDatabaseAsOf: input.retrieval.legalDatabaseAsOf,
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

type AiSloRouteOutcome = {
  outcome: "completed" | "failed" | "timed_out" | "cancelled";
  safeErrorCode:
    | "AI_SLO_TIMEOUT"
    | "AI_SLO_PROVIDER_UNAVAILABLE"
    | "AI_SLO_ABORTED"
    | "AI_SLO_VALIDATION_FAILED"
    | "AI_SLO_PERSISTENCE_FAILED"
    | "AI_SLO_INTERNAL_ERROR"
    | null;
};

function aiSloFailureOutcome(code: string, budget: AiExecutionBudget): AiSloRouteOutcome {
  if (code === "AI_CANCELLED" || budget.abortReason === "caller") {
    return { outcome: "cancelled", safeErrorCode: "AI_SLO_ABORTED" };
  }
  if (code === "PROVIDER_TIMEOUT" || budget.abortReason === "overall_timeout") {
    return { outcome: "timed_out", safeErrorCode: "AI_SLO_TIMEOUT" };
  }
  if (code === "INVALID_AI_OUTPUT") {
    return { outcome: "failed", safeErrorCode: "AI_SLO_VALIDATION_FAILED" };
  }
  if (code === "PERSISTENCE_FAILED") {
    return { outcome: "failed", safeErrorCode: "AI_SLO_PERSISTENCE_FAILED" };
  }
  return { outcome: "failed", safeErrorCode: "AI_SLO_PROVIDER_UNAVAILABLE" };
}

function fallbackForAiSlo(
  provider: "openai" | "anthropic" | "none",
  fallbackFromProvider: "openai" | "anthropic" | null,
) {
  if (fallbackFromProvider === "openai" && provider === "anthropic") return "openai_to_anthropic" as const;
  if (fallbackFromProvider === "anthropic" && provider === "openai") return "anthropic_to_openai" as const;
  return "none" as const;
}

/**
 * This is deliberately a post-durability best-effort tail. It contains only
 * bounded timings plus the opaque run correlation; `tryRecord…` hashes that
 * correlation before persistence and this helper never changes an AI result.
 */
async function recordLegalChatSlo(input: {
  db: D1Database;
  budget: AiExecutionBudget;
  correlationId: string;
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  provider: "openai" | "anthropic" | "none";
  model: string | null;
  fallbackFromProvider: "openai" | "anthropic" | null;
  preliminaryAtMs: number | null;
  providerFirstDeltaAtMs: number | null;
  outcome: AiSloRouteOutcome;
}): Promise<void> {
  try {
    const snapshot = input.budget.snapshot();
    const stage = (name: string) => snapshot.stages.find((timing) => timing.stage === name);
    const auth = stage("auth");
    const context = stage("memory_context");
    const retrieval = stage("verified_retrieval");
    const provider = stage("provider_execution");
    const validation = stage("validation");
    const persistence = stage("persistence");
    let firstUsefulStage: AiSloFirstUsefulStage = "none";
    let firstUsefulLatencyMs: number | null = null;
    if (input.preliminaryAtMs !== null) {
      firstUsefulStage = "preliminary";
      firstUsefulLatencyMs = Math.min(input.preliminaryAtMs, snapshot.elapsedMs);
    } else if (input.outcome.outcome === "completed") {
      // Non-SSE clients receive their first useful result only after the
      // durable completion batch, so do not claim a preliminary answer.
      firstUsefulStage = "persistence";
      firstUsefulLatencyMs = Math.min(persistence?.endedAtMs ?? snapshot.elapsedMs, snapshot.elapsedMs);
    }
    const providerTtftMs = input.providerFirstDeltaAtMs !== null && provider
      ? Math.min(
        provider.elapsedMs,
        Math.max(0, input.providerFirstDeltaAtMs - provider.startedAtMs),
      )
      : null;
    await tryRecordAiSloTelemetry({
      db: input.db,
      value: {
        correlationId: input.correlationId,
        environment: operationalEnvironment(runtimeEnv().APP_ENV),
        requestKind: "legal_chat",
        authKind: "authenticated",
        answerMode: input.answerMode,
        reasoningMode: input.reasoningMode,
        provider: input.provider,
        model: input.provider === "none" ? null : input.model,
        outcome: input.outcome.outcome,
        fallback: fallbackForAiSlo(input.provider, input.fallbackFromProvider),
        authLatencyMs: auth?.elapsedMs ?? null,
        contextLatencyMs: context?.elapsedMs ?? null,
        retrievalLatencyMs: retrieval?.elapsedMs ?? null,
        providerTtftMs,
        providerTotalMs: provider?.elapsedMs ?? null,
        validationLatencyMs: validation?.elapsedMs ?? null,
        persistenceLatencyMs: persistence?.elapsedMs ?? null,
        endToEndMs: snapshot.elapsedMs,
        firstUsefulStage,
        firstUsefulLatencyMs,
        safeErrorCode: input.outcome.safeErrorCode,
      },
    });
  } catch {
    // SLO telemetry is intentionally non-critical after a durable AI result
    // or run failure; do not make legal work or usage reconciliation fail.
  }
}
