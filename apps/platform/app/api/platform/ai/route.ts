import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { getPublishedDocuments } from "../../../../lib/document-builder/registry";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { AiUnavailableError } from "../../../../lib/document-builder/ai/openai";
import { aiProviderStatus, legalAiProvider, type LegalAiProgress } from "../../../../lib/ai/provider";
import {
  createLegalAiGateway,
  type GroundedLegalPreliminary,
} from "../../../../lib/ai/legal-ai-gateway";
import { classifyLegalIntent } from "../../../../lib/ai/legal-query-planner";
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
  parseLegalChatResponse,
} from "../../../../lib/ai/legal-chat-schema";
import {
  legalDatabaseFreshnessFromAsOf,
} from "../../../../lib/legal/verified-retrieval";
import {
  retrieveCorpusAwareLegalSources,
  shouldRetrieveSecondaryInternet,
  type LegalChatSourceRetrieval,
} from "../../../../lib/legal-corpus/chat-retrieval";
import {
  retrieveTrustedUserDocumentSources,
  type TrustedUserDocumentRetrieval,
} from "../../../../lib/document-analysis/user-document-chat-sources";
import { discoverOfficialLexUrls } from "../../../../lib/legal/openai-lex-discovery";
import {
  fallbackLegalRetrievalUnderstanding,
  rerankLegalCorpusCandidates,
  understandLegalRetrievalQuery,
} from "../../../../lib/legal/legal-retrieval-understanding";
import {
  retrieveSecondaryInternetSources,
  type SecondaryInternetRetrieval,
} from "../../../../lib/legal/secondary-internet-retrieval";
import { legalCitationStatements } from "../../../../lib/legal/direct-citation-store";
import {
  createAiExecutionBudget,
  type AiExecutionBudget,
} from "../../../../lib/ai/execution-budget";
import {
  tryRecordAiSloTelemetry,
  type AiSloFirstUsefulStage,
} from "../../../../lib/ai/slo-telemetry";
import { parseLegalApplicabilityDate } from "../../../../lib/legal/applicability-date";
import {
  resolveAiAnswerCycleLimit,
  workspaceEntitlements,
  type AiAnswerCycleLimit,
} from "../../../../lib/billing/entitlements";
import { workspaceForUser, workspaceForUserById } from "../../../../lib/platform/workspace";
import { isWorkspaceId } from "../../../../lib/platform/routing";
import { trackProductEvent, type ProductEventInput } from "../../../../lib/platform/analytics";
import { completedAiQualityEvents } from "../../../../lib/platform/ai-quality-events";
import {
  productAccountMilestoneCreated,
  productAccountMilestoneStatement,
  productClarificationCompletedStatement,
} from "../../../../lib/platform/product-account-milestone";
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

const INSTRUCTION_VERSION = "juro-legal-chat-v4-grounded-tiered-retrieval";

function matchingDocumentTemplates(question: string, locale: "ru" | "uz") {
  const terms = [...new Set(question.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])].slice(0, 20);
  return getPublishedDocuments()
    .map((definition) => {
      const haystack = `${definition.categorySlug} ${definition.titleRu} ${definition.titleUz} ${definition.descriptionRu} ${definition.descriptionUz}`.toLocaleLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        + (definition.popular ? 0.25 : 0);
      return { definition, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.definition.code.localeCompare(right.definition.code))
    .slice(0, 8)
    .map(({ definition }) => ({
      templateCode: definition.code,
      title: locale === "ru" ? definition.titleRu : definition.titleUz,
      categorySlug: definition.categorySlug,
    }));
}

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function workspaceForAiRequest(
  request: Request,
  user: Awaited<ReturnType<typeof requireApiUser>>,
) {
  const requestedWorkspaceId = request.headers.get("x-juro-workspace-id");
  if (!requestedWorkspaceId) return workspaceForUser(user);
  if (!isWorkspaceId(requestedWorkspaceId)) return null;
  return workspaceForUserById(user.id, requestedWorkspaceId);
}

function unavailableLegalRetrieval(code: string): LegalChatSourceRetrieval {
  const freshness = legalDatabaseFreshnessFromAsOf("unavailable");
  return {
    sources: [],
    freshness,
    legalDatabaseAsOf: freshness.asOf,
    sourceAccessMode: "approved_package",
    sourcesRetrievedAt: null,
    sourceValidationStatus: "unavailable",
    errors: [{ code }],
    evidence: [],
    coverageStatus: "no_coverage",
    retrievalTelemetry: {
      indexedHitCount: 0,
      liveHitCount: 0,
      queriesRun: 0,
      retrievedCandidateCount: 0,
      rerankCandidateCount: 0,
      rerankedCandidateCount: 0,
      rerankingOutcome: "not_configured",
      rerankingFailureCode: null,
      exactWindowSuccesses: 0,
      denseUnavailable: false,
      fusionOutcome: "none",
    },
  };
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser(request);
  const workspace = await workspaceForAiRequest(request, user);
  if (!workspace) return response({ code: "WORKSPACE_UNAVAILABLE" }, 404);
  const db = requireD1();
  const entitlements = await workspaceEntitlements(db, workspace.id);
  const answerCycleLimit = resolveAiAnswerCycleLimit(
    runtimeEnv().APP_ENV,
    entitlements.aiAnswerCyclesMonthly,
  );
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
    usage: await usageSummary(db, workspace.id, user.id, answerCycleLimit),
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
  const user = await requireApiUser(request);
  const workspace = await workspaceForAiRequest(request, user);
  if (!workspace) return response({ code: "WORKSPACE_UNAVAILABLE" }, 404);
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

type AiRouteProgress = LegalAiProgress
  | { stage: "document_search_started" }
  | { stage: "lex_search_started" }
  | { stage: "internet_search_started" }
  | { stage: "source_verified" }
  | {
  stage: "preliminary";
  preliminary: GroundedLegalPreliminary;
};

async function executePost(
  request: Request,
  onProgress?: (event: AiRouteProgress) => void | Promise<void>,
  signal: AbortSignal = request.signal,
) {
  const budget = createAiExecutionBudget({
    callerSignal: signal,
    // Retrieval and provider adapters retain bounded, operation-specific
    // timeouts. The route itself must not cut off a healthy LLM response at an
    // unrelated 30-second wall-clock deadline.
    enforceOverallTimeout: false,
  });
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
  let workspace: NonNullable<Awaited<ReturnType<typeof workspaceForAiRequest>>>;
  try {
    user = await requireApiUser(request);
    const resolvedWorkspace = await workspaceForAiRequest(request, user);
    if (!resolvedWorkspace) {
      authStage.complete();
      return response({ code: "WORKSPACE_UNAVAILABLE" }, 404);
    }
    workspace = resolvedWorkspace;
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
  const trackDurableAiError = () => trackProductEvent({
    event: "AI_error",
    surface: "platform",
    locale,
    accountType: workspace.type,
    outcome: "failed",
  });
  let preliminaryAtMs: number | null = null;
  let providerFirstDeltaAtMs: number | null = null;
  let fallbackFromProgress: "openai" | "anthropic" | null = null;
  const emitProgress = async (event: AiRouteProgress) => {
    await onProgress?.(event);
    // Research progress is deliberately not counted as useful answer content.
    // The first useful timestamp remains the validated, durable terminal answer.
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

  const appEnvironment = runtimeEnv().APP_ENV;
  const providerEnvironment = parseProviderEnvironment(appEnvironment);
  const entitlements = await workspaceEntitlements(db, workspace.id);
  const answerCycleLimit = resolveAiAnswerCycleLimit(
    appEnvironment,
    entitlements.aiAnswerCyclesMonthly,
  );
  if (body?.caseId) {
    const accessible = await db.prepare("SELECT id FROM cases WHERE id=? AND workspace_id=? LIMIT 1").bind(body.caseId, workspace.id).first();
    if (!accessible) return response({ code: "ACCESS_DENIED", error: locale === "ru" ? "Дело не найдено в этом пространстве." : "Bu makonda ish topilmadi." }, 404);
  }
  const conversationId = body?.conversationId || `conversation_${(await sha256Json({
    workspaceId: workspace.id,
    userId: user.id,
    idempotencyKey,
  })).slice(0, 48)}`;
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
  const intent = classifyLegalIntent(question);
  if (intent.intent === "conversation" || intent.intent === "out_of_scope") {
    return completeNonChargeableIntent({
      db,
      workspaceId: workspace.id,
      userId: user.id,
      accountType: workspace.type,
      caseId: body?.caseId || null,
      conversationId,
      existingConversation,
      question,
      locale,
      answerMode,
      reasoningMode,
      idempotencyKey,
      branchInput,
      usageLimit: answerCycleLimit,
      intent: intent.intent,
    });
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
  const gateway = createLegalAiGateway(provider);
  const safetyIdentifier = await sha256Json({ scope: "openai-safety-v1", userId: user.id });
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
  const rewrite = gateway.rewriteFollowUp({ question, locale, conversationHistory });
  const bindings = runtimeEnv();
  const remoteDevelopmentCorpus = bindings.APP_ENV === "development"
    && bindings.LEGAL_CORPUS_REMOTE_READ_ENABLED === "true";
  const understandingStage = budget.beginStage("query_understanding", {
    timeoutMs: remoteDevelopmentCorpus ? 14_500 : 6_500,
  });
  let queryUnderstandingFallback = false;
  const retrievalUnderstandingPromise = (async () => {
    try {
      const usage = await usageSummary(db, workspace.id, user.id, answerCycleLimit);
      if (usage.limit !== null && usage.used >= usage.limit) throw new Error("PLAN_LIMIT_PRECHECK");
      await assertProviderCallAllowed({ db, environment: providerEnvironment, provider: "openai" });
      const startedAt = isoNow();
      const understood = await understandLegalRetrievalQuery({
        query: rewrite.query,
        locale,
        conversationHistory,
        requestId: `${idempotencyKey}:understanding`,
        safetyIdentifier,
        signal: understandingStage.signal,
        timeoutMs: Math.min(remoteDevelopmentCorpus ? 14_200 : 6_200, budget.remainingMs),
        maxAttempts: remoteDevelopmentCorpus ? 2 : 1,
        onTelemetry: async (event) => {
          try {
            const completedAt = isoNow();
            const eventHash = (await sha256Json({
              idempotencyKey,
              providerResponseId: event.providerResponseId,
              startedAt,
              tier: "query_understanding",
            })).slice(0, 48);
            await recordProviderUsage({
              db,
              environment: providerEnvironment,
              workspaceId: workspace.id,
              userId: user.id,
              feature: "legal_chat",
              operation: "responses",
              provider: "openai",
              model: event.model,
              providerRequestId: event.providerResponseId,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              cachedInputTokens: 0,
              status: "succeeded",
              startedAt,
              completedAt,
              eventId: `provider_usage_understanding_${eventHash}`,
            });
          } catch {
            console.warn(JSON.stringify({ event: "ai.query_understanding_usage_deferred" }));
          }
        },
      });
      understandingStage.complete();
      return understood;
    } catch (error) {
      understandingStage.fail();
      if (signal.aborted) throw error;
      queryUnderstandingFallback = true;
      console.warn(JSON.stringify({
        event: "ai.query_understanding_unavailable",
        code: error instanceof Error ? error.name : "QUERY_UNDERSTANDING_FAILED",
        providerCode: error instanceof AiUnavailableError ? error.code : null,
        providerStatus: error instanceof AiUnavailableError ? error.providerStatus : null,
        providerErrorType: error instanceof AiUnavailableError ? error.providerErrorType : null,
      }));
      return fallbackLegalRetrievalUnderstanding(rewrite.query);
    }
  })();
  // The original-query corpus search begins below while this model-produced,
  // bounded research plan is still resolving. Model output can discover and
  // rank candidates but never becomes evidence.
  // Memory and tenant-document lookup provide conversational/case-fact context
  // and may run alongside the legal-source ladder. Official authority retrieval
  // remains sequential inside its own ladder: JURO indexed legal corpus -> live Lex.uz.
  // Lower-authority public-web research is a terminal fallback.
  const memoryStage = budget.beginStage("memory_context", { timeoutMs: 1_250 });
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
  const privateDocumentStage = budget.beginStage("private_document_retrieval", { timeoutMs: 1_800 });
  const privateDocumentRetrieval = (async (): Promise<TrustedUserDocumentRetrieval> => {
    if (
      bindings.LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST !== "true"
      || !bindings.APP_ENV
      || !bindings.BUCKET
      || !bindings.USER_DOCUMENTS_INDEX
      || !bindings.OPENAI_API_KEY
    ) {
      privateDocumentStage.complete();
      return { sources: [], evidence: [], errors: [] };
    }
    try {
      await assertProviderCallAllowed({ db, environment: providerEnvironment, provider: "openai" });
      const retrievalUnderstanding = await retrievalUnderstandingPromise;
      const result = await retrieveTrustedUserDocumentSources({
        APP_ENV: bindings.APP_ENV,
        DB: db,
        BUCKET: bindings.BUCKET,
        USER_DOCUMENTS_INDEX: bindings.USER_DOCUMENTS_INDEX,
        OPENAI_API_KEY: bindings.OPENAI_API_KEY,
        EMBEDDING_MODEL: bindings.EMBEDDING_MODEL,
      }, {
        workspaceId: workspace.id,
        userId: user.id,
        query: retrievalUnderstanding.standaloneQuestion,
        locale,
        limit: 3,
      }, { signal: privateDocumentStage.signal });
      privateDocumentStage.complete();
      return result;
    } catch (error) {
      privateDocumentStage.fail();
      console.warn(JSON.stringify({
        event: "ai.private_document_retrieval_unavailable",
        code: error instanceof Error ? error.name : "PRIVATE_DOCUMENT_RETRIEVAL_FAILED",
      }));
      return {
        sources: [],
        evidence: [],
        errors: [{ code: "PRIVATE_DOCUMENT_RETRIEVAL_UNAVAILABLE" }],
      };
    }
  })();

  // This progress stage refers to JURO's stored legal corpus, not to private
  // uploads. The corpus retriever falls back to live Lex.uz only when indexed
  // coverage is insufficient or stale.
  await emitProgress({ stage: "document_search_started" });
  const retrievalStage = budget.beginStage("live_lex_retrieval", {
    // Four bounded staging-D1 reads can take about forty seconds over the
    // remote binding. Leave enough room for them to finish without poisoning
    // the separate semantic-reranking signal below.
    timeoutMs: remoteDevelopmentCorpus ? 55_000 : 13_000,
  });
  const retrieval: LegalChatSourceRetrieval = await (async () => {
    try {
      const result = await retrieveCorpusAwareLegalSources({
        env: { ...runtimeEnv(), DB: db },
        query: rewrite.query,
        locale,
        indexQueries: retrievalUnderstandingPromise.then((understanding) => understanding.corpusQueries),
        rerankingQuestion: retrievalUnderstandingPromise.then((understanding) => understanding.standaloneQuestion),
        requiredConcepts: retrievalUnderstandingPromise.then((understanding) => understanding.requiredConcepts),
        lexSearchQueries: retrievalUnderstandingPromise.then((understanding) => understanding.lexSearchQueries),
        signal: retrievalStage.signal,
        limit: 8,
        budgetMs: remoteDevelopmentCorpus ? 36_000 : 12_500,
        scope: {
          tenantId: workspace.id,
          userId: user.id,
          matterId: body?.caseId ?? null,
          asOfDate: applicableAt ? body?.legalContextDate ?? null : null,
        },
        correlationId: idempotencyKey,
        onLiveSearchStarted: () => emitProgress({ stage: "lex_search_started" }),
        rerankCandidates: async ({ question: candidateQuestion, candidates, limit }) => {
          if (budget.remainingMs < 9_000) throw new Error("RERANK_BUDGET_UNAVAILABLE");
          // The bounded 12-passage packet is substantially larger than query
          // understanding. Provider response-start latency can legitimately
          // exceed seven seconds, so give this independent gate a realistic
          // window while keeping it strictly bounded.
          const rerankingStage = budget.beginStage("corpus_reranking", { timeoutMs: 14_500 });
          try {
            const usage = await usageSummary(db, workspace.id, user.id, answerCycleLimit);
            if (usage.limit !== null && usage.used >= usage.limit) throw new Error("PLAN_LIMIT_PRECHECK");
            await assertProviderCallAllowed({ db, environment: providerEnvironment, provider: "openai" });
            const startedAt = isoNow();
            const ranked = await rerankLegalCorpusCandidates({
              question: candidateQuestion,
              locale,
              candidates,
              limit,
              requestId: `${idempotencyKey}:corpus-reranking`,
              safetyIdentifier,
              // Candidate retrieval and semantic ranking are separate
              // operations. A slow remote D1 read must not hand the reranker
              // an already-aborted retrieval signal.
              signal: rerankingStage.signal,
              timeoutMs: Math.min(14_000, Math.max(1, budget.remainingMs - 3_000)),
              onTelemetry: async (event) => {
                try {
                  const completedAt = isoNow();
                  const eventHash = (await sha256Json({
                    idempotencyKey,
                    providerResponseId: event.providerResponseId,
                    startedAt,
                    tier: "corpus_reranking",
                  })).slice(0, 48);
                  await recordProviderUsage({
                    db,
                    environment: providerEnvironment,
                    workspaceId: workspace.id,
                    userId: user.id,
                    feature: "legal_chat",
                    operation: "responses",
                    provider: "openai",
                    model: event.model,
                    providerRequestId: event.providerResponseId,
                    inputTokens: event.inputTokens,
                    outputTokens: event.outputTokens,
                    cachedInputTokens: 0,
                    status: "succeeded",
                    startedAt,
                    completedAt,
                    eventId: `provider_usage_corpus_reranking_${eventHash}`,
                  });
                } catch {
                  console.warn(JSON.stringify({ event: "ai.corpus_reranking_usage_deferred" }));
                }
              },
            });
            rerankingStage.complete();
            return ranked;
          } catch (error) {
            rerankingStage.fail();
            throw error;
          }
        },
        discoverOfficialUrls: async (query, discoveryLocale, discoverySignal) => {
          const usage = await usageSummary(db, workspace.id, user.id, answerCycleLimit);
          if (usage.limit !== null && usage.used >= usage.limit) throw new Error("PLAN_LIMIT_PRECHECK");
          await assertProviderCallAllowed({ db, environment: providerEnvironment, provider: "openai" });
          const startedAt = isoNow();
          return discoverOfficialLexUrls({
            query,
            locale: discoveryLocale,
            requestId: idempotencyKey,
            safetyIdentifier,
            signal: discoverySignal,
            timeoutMs: Math.min(5_000, budget.remainingMs),
            onTelemetry: async (event) => {
              try {
                const completedAt = isoNow();
                const eventHash = (await sha256Json({
                  idempotencyKey,
                  providerResponseId: event.providerResponseId,
                  startedAt,
                })).slice(0, 48);
                await recordProviderUsage({
                  db,
                  environment: providerEnvironment,
                  workspaceId: workspace.id,
                  userId: user.id,
                  feature: "legal_chat",
                  operation: "web_search",
                  provider: "openai",
                  model: event.model,
                  providerRequestId: event.providerResponseId,
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                  cachedInputTokens: 0,
                  status: "succeeded",
                  startedAt,
                  completedAt,
                  eventId: `provider_usage_discovery_${eventHash}`,
                });
              } catch {
                console.warn(JSON.stringify({ event: "ai.lex_discovery_usage_deferred" }));
              }
            },
          });
        },
      });
      retrievalStage.complete();
      return result;
    } catch (error) {
      retrievalStage.fail();
      if (signal.aborted) throw error;
      // A timed-out remote D1 request may still be finishing below the
      // platform boundary. Starting the same corpus search again here doubled
      // latency and could consume the shared provider deadline. Fail closed
      // with a typed empty packet; the normal answer path will ask for facts
      // and will not publish model knowledge as law.
      return unavailableLegalRetrieval("LEGAL_RETRIEVAL_UNAVAILABLE");
    }
  })();

  const retrievalUnderstanding = await retrievalUnderstandingPromise;
  const retrievalQuestion = retrievalUnderstanding.standaloneQuestion;
  // Secondary internet material is consulted only after the combined official result is weak or empty.
  // It can explain practice, but can never establish
  // a legal rule, deadline, calculation, or mandatory action.
  const secondaryRetrievalFallbackUsed = !applicableAt
    && shouldRetrieveSecondaryInternet(retrieval);
  const secondaryInternet: SecondaryInternetRetrieval = secondaryRetrievalFallbackUsed
    ? await (async () => {
      if (budget.remainingMs < 8_000) {
        return { sources: [], evidence: [], errors: [{ code: "SECONDARY_RESEARCH_BUDGET_SKIPPED" }] };
      }
      await emitProgress({ stage: "internet_search_started" });
      const internetStage = budget.beginStage("secondary_web_retrieval", { timeoutMs: 6_200 });
      try {
        const usage = await usageSummary(db, workspace.id, user.id, answerCycleLimit);
        if (usage.limit !== null && usage.used >= usage.limit) throw new Error("PLAN_LIMIT_PRECHECK");
        await assertProviderCallAllowed({ db, environment: providerEnvironment, provider: "openai" });
        const startedAt = isoNow();
        const result = await retrieveSecondaryInternetSources({
          db,
          query: retrievalUnderstanding.webSearchQuery,
          locale,
          requestId: `${idempotencyKey}:secondary`,
          safetyIdentifier,
          signal: internetStage.signal,
          timeoutMs: Math.min(6_000, budget.remainingMs),
          onTelemetry: async (event) => {
            try {
              const completedAt = isoNow();
              const eventHash = (await sha256Json({
                idempotencyKey,
                providerResponseId: event.providerResponseId,
                startedAt,
                tier: "secondary",
              })).slice(0, 48);
              await recordProviderUsage({
                db,
                environment: providerEnvironment,
                workspaceId: workspace.id,
                userId: user.id,
                feature: "legal_chat",
                operation: "web_search",
                provider: "openai",
                model: event.model,
                providerRequestId: event.providerResponseId,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                cachedInputTokens: 0,
                status: "succeeded",
                startedAt,
                completedAt,
                eventId: `provider_usage_secondary_${eventHash}`,
              });
            } catch {
              console.warn(JSON.stringify({ event: "ai.secondary_research_usage_deferred" }));
            }
          },
        });
        internetStage.complete();
        return result;
      } catch (error) {
        internetStage.fail();
        if (signal.aborted) throw error;
        console.warn(JSON.stringify({
          event: "ai.secondary_research_unavailable",
          code: error instanceof Error ? error.name : "SECONDARY_RESEARCH_FAILED",
        }));
        return {
          sources: [],
          evidence: [],
          errors: [{ code: "SECONDARY_RESEARCH_UNAVAILABLE" }],
        };
      }
    })()
    : { sources: [], evidence: [], errors: [] };
  // Source verification progress is content-free. A separate preliminary
  // event is emitted only after a complete provider finding passes the same
  // authoritative Lex claim/span gate as the terminal answer.
  const privateDocuments = await privateDocumentRetrieval;
  const sources = [...retrieval.sources, ...privateDocuments.sources, ...secondaryInternet.sources];
  const evidence = [...retrieval.evidence, ...privateDocuments.evidence, ...secondaryInternet.evidence];
  const { freshness, legalDatabaseAsOf, coverageStatus } = retrieval;
  await emitProgress({ stage: "source_verified" });
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
      id: source.id, hash: source.contentSha256,
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
      monthlyLimit: answerCycleLimit,
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
    attempt: number;
    startedAt: string;
  }> = [];
  const providerFailures: Array<{
    provider: "openai" | "anthropic";
    code: AiUnavailableError["code"];
    providerStatus: number | null;
    providerErrorType: string | null;
  }> = [];
  const beforeProviderCall = async (call: { provider: "openai" | "anthropic"; model: string; attempt: number }) => {
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
    const gatewayResult = await gateway.generateGroundedAnswer({
      question: rewrite.query, locale, answerMode, reasoningMode, sources, legalDatabaseAsOf,
      retrievalQuery: retrievalQuestion,
      applicableAt: applicableAt?.toISOString(),
      requestId: reservation.correlationId, safetyIdentifier,
      conversationHistory,
      memories: memories.map((memory) => ({
        category: memory.category,
        statement: memory.statement,
        scope: memory.scope,
      })),
      runtimeSettings,
      intent: intent.intent,
      availableDocumentTemplates: intent.intent === "document"
        ? matchingDocumentTemplates(rewrite.query, locale)
        : [],
    }, {
      signal,
      budget,
      onProgress: emitProgress,
      onGroundedPreliminary: async (preliminary) => {
        if (
          !onProgress
          || preliminaryAtMs !== null
          || retrieval.sourceValidationStatus !== "validated"
          || freshness.status !== "fresh"
        ) return;
        const emittedAtMs = budget.elapsedMs;
        await emitProgress({ stage: "preliminary", preliminary });
        preliminaryAtMs = emittedAtMs;
      },
      beforeProviderCall,
      onProviderFailure: async (failure) => { providerFailures.push(failure); },
    });
    aiResult = gatewayResult.run;
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
      for (const [callIndex, call] of providerCalls.entries()) {
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
          eventId: `provider_usage_${reservation.runId}_${call.provider}_${call.attempt}_${callIndex}`,
        });
      }
    } catch {
      // The durable ai_run failure below remains the reconciliation source.
    }
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey, errorCode: code,
    });
    trackDurableAiError();
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
    const boundedResult = parseLegalChatResponse(aiResult.data);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const returnedSources = boundedResult.sources;
    const canonicalResult = {
      ...boundedResult,
      sources: returnedSources.map((reference) => {
        const source = sourceById.get(reference.sourceId)!;
        return {
          sourceId: source.id,
          actTitle: source.actTitle,
          actIdentifier: source.actIdentifier,
          article: source.article ?? null,
          excerpt: (source.spans?.find((span) => span.article === (reference.article ?? source.article))
            ?? source.spans?.[0])?.text.slice(0, 1_200)
            ?? source.excerpt?.slice(0, 1_200)
            ?? null,
          originalUrl: source.officialUrl,
          status: source.applicabilityStatus ?? "current" as const,
          effectiveDate: source.effectiveDate ?? null,
          verifiedAt: source.verifiedAt,
          documentType: source.documentType ?? null,
          documentNumber: source.documentNumber ?? source.actIdentifier ?? null,
          adoptingAuthority: source.adoptingAuthority ?? null,
          sourceClass: source.sourceClass ?? "OFFICIAL_LEGISLATION",
          language: source.locale === "uzc" ? "uz-Cyrl" as const
            : source.locale === "uz" ? "uz-Latn" as const
              : source.locale === "en" ? "en" as const : "ru" as const,
          sourceOrigin: source.verificationState === "web_cited"
            ? "web" as const
            : source.verificationState === "direct_validated" ? "live" as const : "indexed" as const,
        };
      }),
      sourceAccessMode: retrieval.sourceAccessMode,
      sourcesRetrievedAt: retrieval.sourcesRetrievedAt,
      sourceValidationStatus: retrieval.sourceValidationStatus,
      coverageStatus,
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
    trackDurableAiError();
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
  // A disconnected caller cancels downstream work and must never be charged.
  // Provider and retrieval timeouts are handled at their own boundaries.
  if (budget.signal.aborted) {
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey,
      errorCode: "PROVIDER_TIMEOUT",
    });
    trackDurableAiError();
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
    const successfulCallIndex = aiResult.sourceFallback
      ? -1
      : providerCalls.findLastIndex((call) => call.provider === aiResult.provider);
    for (const [callIndex, call] of providerCalls.entries()) {
      if (callIndex === successfulCallIndex) continue;
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
        errorCode: aiResult.sourceFallback
          ? (aiResult.sourceFallbackReason ?? "PROVIDER_UNAVAILABLE")
          : call.provider === aiResult.provider ? "RETRY_USED" : "FALLBACK_USED",
        startedAt: call.startedAt,
        completedAt,
        eventId: `provider_usage_${reservation.runId}_${call.provider}_${call.attempt}_${callIndex}`,
      });
    }
    if (!aiResult.sourceFallback) {
      const successfulCall = successfulCallIndex >= 0 ? providerCalls[successfulCallIndex] : undefined;
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
        eventId: `provider_usage_${reservation.runId}_${aiResult.provider}_${successfulCall?.attempt ?? aiResult.attempts}_success`,
      });
    }
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
      .bind(assistantMessageId, conversationId, result.answer, JSON.stringify(metadataOnlyLegalResult(result)), now),
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
      sourceAccessMode: retrieval.sourceAccessMode,
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
      sourceFallbackUsed: aiResult.sourceFallback === true,
      sourceFallbackReason: aiResult.sourceFallbackReason ?? null,
      sourceCount: result.sources.length, responseKind: result.responseKind,
      sourceFreshnessStatus: freshness.status,
      sourceFreshnessAsOf: freshness.asOf,
      liveLexRetrievalErrorCodes: retrieval.errors.map((error) => error.code).slice(0, 4),
      privateDocumentRetrievalErrorCodes: privateDocuments.errors.map((error) => error.code).slice(0, 4),
      secondaryInternetRetrievalErrorCodes: secondaryInternet.errors.map((error) => error.code).slice(0, 4),
      trustedPrivateSourceCount: result.sources.filter((source) => source.sourceClass === "USER_TRUSTED_PRIVATE").length,
      secondarySourceCount: result.sources.filter((source) => source.sourceClass === "SECONDARY_REFERENCE").length,
      tierHitCounts: {
        indexed: retrieval.retrievalTelemetry?.indexedHitCount ?? 0,
        live: retrieval.retrievalTelemetry?.liveHitCount ?? 0,
        secondary: secondaryInternet.sources.length,
        private: privateDocuments.sources.length,
      },
      retrievalFusionOutcome: retrieval.retrievalTelemetry?.fusionOutcome ?? "none",
      queryUnderstandingFallback,
      retrievedCandidateCount: retrieval.retrievalTelemetry?.retrievedCandidateCount ?? 0,
      rerankCandidateCount: retrieval.retrievalTelemetry?.rerankCandidateCount ?? 0,
      rerankedCandidateCount: retrieval.retrievalTelemetry?.rerankedCandidateCount ?? 0,
      rerankingOutcome: retrieval.retrievalTelemetry?.rerankingOutcome ?? "not_configured",
      rerankingFailureCode: retrieval.retrievalTelemetry?.rerankingFailureCode ?? null,
      exactWindowSuccesses: retrieval.retrievalTelemetry?.exactWindowSuccesses ?? 0,
      denseSearchUnavailable: retrieval.retrievalTelemetry?.denseUnavailable ?? false,
      gatewayRefusalReason: result.responseKind === "clarification_required" ? "no_usable_evidence" : null,
      evidenceMode: result.evidenceMode ?? "none",
      coverageStatus,
      branchId, operation: branchInput.operation,
      sourceMessageId: branchInput.forkedFromMessageId,
    }), now),
  ];
  const firstQuestionMilestoneIndex = statements.length;
  const milestoneStatements: D1PreparedStatement[] = [
    productAccountMilestoneStatement({
      db,
      userId: user.id,
      eventName: "first_question_sent",
      completedAt: now,
    }),
  ];
  const clarificationMilestoneEligible = result.responseKind === "answer"
    && branchInput.operation === "follow_up"
    && Boolean(branchInput.parentBranchId);
  const clarificationMilestoneIndex = clarificationMilestoneEligible
    ? firstQuestionMilestoneIndex + milestoneStatements.length
    : -1;
  if (clarificationMilestoneEligible) {
    milestoneStatements.push(productClarificationCompletedStatement({
      db,
      userId: user.id,
      workspaceId: workspace.id,
      conversationId,
      parentBranchId: branchInput.parentBranchId!,
      completedAt: now,
    }));
  }
  const persistenceStage = budget.beginStage("persistence");
  let firstQuestionCreated = false;
  let clarificationCompleted = false;
  try {
    const persistenceResults = await db.batch([
      ...statements,
      ...milestoneStatements,
      ...completeAiRunStatements({
        db, runId: reservation.runId, ledgerId: reservation.ledgerId,
        workspaceId: workspace.id, userId: user.id, idempotencyKey,
        conversationId, requestMessageId: userMessageId, responseMessageId: assistantMessageId,
        providerResponseId: aiResult.providerResponseId, model: aiResult.model,
        provider: aiResult.provider,
        fallbackFromProvider: aiResult.fallbackFromProvider,
        inputTokens: aiResult.usage.inputTokens, outputTokens: aiResult.usage.outputTokens,
        cachedInputTokens: aiResult.usage.cachedInputTokens, attempts: aiResult.attempts,
        latencyMs: aiResult.latencyMs, chargeable: result.responseKind === "answer",
      }),
    ]);
    firstQuestionCreated = productAccountMilestoneCreated(
      persistenceResults[firstQuestionMilestoneIndex],
    );
    clarificationCompleted = clarificationMilestoneIndex >= 0
      && productAccountMilestoneCreated(
        persistenceResults[clarificationMilestoneIndex],
      );
    persistenceStage.complete();
  } catch (error) {
    persistenceStage.fail();
    await failAiRun({
      db, runId: reservation.runId, ledgerId: reservation.ledgerId,
      workspaceId: workspace.id, userId: user.id, idempotencyKey, errorCode: "PERSISTENCE_FAILED",
    });
    trackDurableAiError();
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

  if (firstQuestionCreated) {
    trackProductEvent({
      event: "first_question_sent",
      surface: "platform",
      locale,
      accountType: workspace.type,
      outcome: "completed",
    });
  }
  if (clarificationCompleted) {
    trackProductEvent({
      event: "clarification_completed",
      surface: "platform",
      locale,
      accountType: workspace.type,
      outcome: "completed",
    });
  }
  for (const event of completedAiQualityEvents({
    queryUnderstandingFallback,
    secondaryRetrievalFallbackUsed,
    rerankingOutcome: retrieval.retrievalTelemetry?.rerankingOutcome ?? null,
    responseKind: result.responseKind,
    sourceCount: result.sources.length,
  })) {
    trackProductEvent({
      event,
      surface: "platform",
      locale,
      accountType: workspace.type,
      outcome: event === "source_not_found" ? "failed" : "completed",
    });
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
    usage: await usageSummary(db, workspace.id, user.id, answerCycleLimit),
  }, 201);
}


const guardedExecutePost = withApiErrors(executePost);

/**
 * Executes the exact interactive route for the staging-only canonical
 * evaluation runner. Authentication is still resolved from the supplied
 * Request; the runner provides a short-lived synthetic session and cannot
 * bypass tenant, quota, source, provider, validation, or persistence logic.
 */
export function executeAiPostForInternalEvaluation(request: Request) {
  return guardedExecutePost(request);
}

export async function POST(request: Request) {
  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    return executeAiPostForInternalEvaluation(request);
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
  const stored = storedConversationResult(conversation.structuredJson);
  const result = await restoreDisplayedCitationExcerpts(db, conversation.messageId, stored.result);
  const { sourceFreshness } = stored;
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

async function restoreDisplayedCitationExcerpts(
  db: D1Database,
  messageId: string,
  result: ReturnType<typeof parseLegalChatResponse>,
): Promise<ReturnType<typeof parseLegalChatResponse>> {
  try {
    const rows = await db.prepare(`SELECT canonical_url AS canonicalUrl,
        article_reference AS articleReference,excerpt
      FROM legal_source_references
      WHERE message_id=? AND citation_validation_status='validated'
      ORDER BY created_at ASC LIMIT 12`).bind(messageId).all<{
        canonicalUrl: string;
        articleReference: string | null;
        excerpt: string | null;
      }>();
    return {
      ...result,
      sources: result.sources.map((source) => {
        const row = rows.results.find((candidate) => candidate.canonicalUrl === source.originalUrl
          && (candidate.articleReference ?? null) === (source.article ?? null));
        return row?.excerpt ? { ...source, excerpt: row.excerpt.slice(0, 1_200) } : source;
      }),
    };
  } catch {
    // Old rows can predate exact-quote persistence; the legal answer and its
    // canonical Lex link remain available without inventing a quotation.
    return result;
  }
}

async function conversationTurnsForClient(input: {
  db: D1Database;
  conversationId: string;
  workspaceId: string;
  userId: string;
  leafBranchId: string | null;
}) {
  const turns = await loadAiConversationTurns(input);
  const output = [];
  for (const turn of turns) {
    if (!turn.structuredJson) continue;
    const stored = storedConversationResult(turn.structuredJson);
    const result = await restoreDisplayedCitationExcerpts(input.db, turn.responseMessageId, stored.result);
    output.push({
      branchId: turn.branchId,
      requestMessageId: turn.requestMessageId,
      responseMessageId: turn.responseMessageId,
      question: turn.question,
      createdAt: turn.createdAt,
      result,
      sourceFreshness: stored.sourceFreshness,
    });
  }
  return output;
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

function metadataOnlyLegalResult(result: ReturnType<typeof parseLegalChatResponse>) {
  return {
    ...result,
    sources: result.sources.map((source) => ({ ...source, excerpt: null })),
  };
}

async function completeNonChargeableIntent(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  accountType: ProductEventInput["accountType"];
  caseId: string | null;
  conversationId: string;
  existingConversation: boolean;
  question: string;
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  idempotencyKey: string;
  branchInput: {
    parentBranchId: string | null;
    forkedFromMessageId: string | null;
    sourceMessageId: string | null;
    operation: "new" | "follow_up" | "edit" | "regenerate";
    versionNumber: number;
  };
  usageLimit: AiAnswerCycleLimit;
  intent: "conversation" | "out_of_scope";
}) {
  const now = isoNow();
  const keyHash = (await sha256Json({
    workspaceId: input.workspaceId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
  })).slice(0, 48);
  const userMessageId = `intent_user_${keyHash}`;
  const assistantMessageId = `intent_assistant_${keyHash}`;
  const branchId = `intent_branch_${keyHash}`;
  const messageVersionId = `intent_version_${keyHash}`;
  const greeting = input.locale === "ru"
    ? "Здравствуйте! Я помогу разобраться в правовом вопросе Узбекистана, подготовить план действий или перейти к существующему конструктору документов JURO. Опишите ситуацию простыми словами."
    : "Assalomu alaykum! O‘zbekiston huquqi bo‘yicha masalani tushuntirish, harakatlar rejasini tuzish yoki JURO hujjat konstruktoriga o‘tishda yordam beraman. Vaziyatni oddiy so‘zlar bilan yozing.";
  const outOfScope = input.locale === "ru"
    ? "Этот запрос выходит за безопасные возможности AI-юриста JURO. Я могу помочь с правовым вопросом Узбекистана, официальными основаниями Lex.uz, планом действий или существующим шаблоном документа."
    : "Bu so‘rov JURO AI-yuristining xavfsiz imkoniyatlaridan tashqarida. O‘zbekiston huquqi, Lex.uz rasmiy asoslari, harakatlar rejasi yoki mavjud hujjat shabloni bo‘yicha yordam bera olaman.";
  const answer = input.intent === "conversation" ? greeting : outOfScope;
  const result = parseLegalChatResponse({
    responseKind: "answer",
    summary: input.locale === "ru" ? "Чем может помочь JURO" : "JURO qanday yordam beradi",
    answer,
    language: input.locale,
    jurisdiction: "UZ",
    answerMode: input.answerMode,
    reasoningMode: input.reasoningMode,
    clarificationQuestions: [],
    confirmedFindings: [],
    assumptions: [],
    risks: [],
    sources: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    urgency: "normal",
    suggestedDocument: null,
    suggestLawyer: false,
    legalDatabaseAsOf: "unavailable",
    sourceAccessMode: "direct",
    sourcesRetrievedAt: null,
    sourceValidationStatus: "unavailable",
  });
  const contentSha256 = await sha256Json(input.question);
  const statements = [
    ...(input.existingConversation ? [] : [input.db.prepare(
      "INSERT INTO conversations (id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)",
    ).bind(input.conversationId, input.workspaceId, input.userId, input.caseId, input.question.slice(0, 120), input.locale, now, now)]),
    input.db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at) VALUES (?,?,'user',?,?)")
      .bind(userMessageId, input.conversationId, input.question, now),
    input.db.prepare("INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,'assistant',?,?,?)")
      .bind(assistantMessageId, input.conversationId, result.answer, JSON.stringify(result), now),
    input.db.prepare(
      "INSERT INTO message_branches (id,conversation_id,workspace_id,owner_user_id,parent_branch_id,forked_from_message_id,request_message_id,response_message_id,operation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(branchId, input.conversationId, input.workspaceId, input.userId, input.branchInput.parentBranchId, input.branchInput.forkedFromMessageId, userMessageId, assistantMessageId, input.branchInput.operation, now),
    input.db.prepare(
      "INSERT INTO message_versions (id,conversation_id,branch_id,message_id,source_message_id,created_by_user_id,operation,version_number,content_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(messageVersionId, input.conversationId, branchId, userMessageId, input.branchInput.sourceMessageId, input.userId, input.branchInput.operation, input.branchInput.versionNumber, contentSha256, now),
    input.db.prepare("UPDATE conversations SET updated_at=? WHERE id=? AND workspace_id=?")
      .bind(now, input.conversationId, input.workspaceId),
    input.db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'conversation',?,'ai_chat_nonchargeable_intent',?,?)",
    ).bind(crypto.randomUUID(), input.workspaceId, input.userId, input.conversationId, JSON.stringify({ intent: input.intent, charged: false, lexRetrieval: false }), now),
  ];
  try {
    const firstQuestionMilestoneIndex = statements.length;
    const results = await input.db.batch([
      ...statements,
      productAccountMilestoneStatement({
        db: input.db,
        userId: input.userId,
        eventName: "first_question_sent",
        completedAt: now,
      }),
    ]);
    if (productAccountMilestoneCreated(results[firstQuestionMilestoneIndex])) {
      trackProductEvent({
        event: "first_question_sent",
        surface: "platform",
        locale: input.locale,
        accountType: input.accountType,
        outcome: "completed",
      });
    }
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint/i.test(error.message)) {
      const replay = await loadConversationResult(
        input.db,
        input.conversationId,
        input.workspaceId,
        input.userId,
        branchId,
        assistantMessageId,
      );
      return response({ ...replay, idempotentReplay: true }, 200);
    }
    throw error;
  }
  const sourceFreshness = legalDatabaseFreshnessFromAsOf("unavailable");
  const turns = await conversationTurnsForClient({
    db: input.db,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    leafBranchId: branchId,
  });
  return response({
    conversationId: input.conversationId,
    messageId: assistantMessageId,
    requestMessageId: userMessageId,
    branchId,
    operation: input.branchInput.operation,
    question: input.question,
    branches: await listAiAnswerVersions({
      db: input.db,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      branchId,
    }),
    turns,
    result,
    facts: [],
    sources: [],
    sourceFreshness,
    usage: await usageSummary(input.db, input.workspaceId, input.userId, input.usageLimit),
  }, 201);
}

async function usageSummary(db: D1Database, workspaceId: string, userId: string, limit: AiAnswerCycleLimit) {
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
    const retrieval = stage("live_lex_retrieval");
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
