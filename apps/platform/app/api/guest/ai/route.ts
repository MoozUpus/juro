import { z } from "zod";

import { ApiAuthError, assertSafeWrite } from "../../../../lib/auth/safe-write";
import {
  guestAiTurnstileAction,
  validateTurnstile,
} from "../../../../lib/auth/turnstile";
import {
  IdentityKeyringError,
  parseIdentityKeyring,
} from "../../../../lib/auth/keyring";
import { authRequestSecurityContext } from "../../../../lib/auth/request-security-evidence";
import { AiUnavailableError } from "../../../../lib/document-builder/ai/openai";
import {
  requireD1,
  runtimeEnv,
} from "../../../../lib/document-builder/storage/runtime";
import {
  aiProviderStatus,
  legalAiProvider,
} from "../../../../lib/ai/provider";
import {
  enforceLegalDatabaseFreshness,
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
} from "../../../../lib/ai/legal-chat-schema";
import {
  legalDatabaseFreshnessFromAsOf,
} from "../../../../lib/legal/verified-retrieval";
import { retrieveCorpusAwareLegalSources } from "../../../../lib/legal-corpus/chat-retrieval";
import { directSourceCards } from "../../../../lib/legal/direct-retrieval";
import { legalCitationStatements } from "../../../../lib/legal/direct-citation-store";
import {
  AI_INTERACTIVE_FINALIZATION_RESERVE_MS,
  createAiExecutionBudget,
  type AiExecutionBudget,
} from "../../../../lib/ai/execution-budget";
import { tryRecordAiSloTelemetry } from "../../../../lib/ai/slo-telemetry";
import { parseLegalApplicabilityDate } from "../../../../lib/legal/applicability-date";
import { sha256Json } from "../../../../lib/ai/run-store";
import {
  GuestAiError,
  clearGuestSessionCookie,
  completeGuestAiRun,
  createGuestAiSession,
  failGuestAiRun,
  guestAiEnabled,
  guestSessionCookie,
  latestGuestAiRun,
  latestGuestAiClarificationRun,
  reserveGuestAiRun,
  resolveGuestAiSession,
  revealGuestAiRunQuestion,
  revealGuestAiRunResult,
  type GuestAiRun,
  type GuestAiSession,
} from "../../../../lib/ai/guest-session";
import { resolveAiRuntimeSettings } from "../../../../lib/ai/runtime-settings";
import {
  assertOperationalFeatureEnabled,
  operationalEnvironment,
  OperationalFeatureError,
  operationalFeatureMessage,
} from "../../../../lib/operations/operational-feature-flags";

const GUEST_INSTRUCTION_VERSION = "juro-guest-legal-chat-v1";
const requestSchema = z.object({
  question: z.string().trim().min(5).max(4_000),
  locale: z.enum(["ru", "uz"]),
  turnstileToken: z.string().trim().max(2_048).optional(),
  legalContextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

function json(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  return Response.json(body, { status, headers });
}

function copy(locale: "ru" | "uz", ru: string, uz: string): string {
  return locale === "ru" ? ru : uz;
}

type GuestAiSloContext = {
  db: D1Database;
  budget: AiExecutionBudget;
  correlationId: string | null;
  answerMode: "short";
  reasoningMode: "fast";
  provider: "openai" | "anthropic";
  model: string;
  contextLatencyMs: number | null;
  providerFirstDeltaAtMs: number | null;
  providerStartedAtMs: number | null;
  fallbackFromProvider: "openai" | "anthropic" | null;
};

type GuestAiSloOutcome = {
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

function guestAiSloFailureOutcome(code: string, budget: AiExecutionBudget): GuestAiSloOutcome {
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

function guestAiSloFallback(
  provider: "openai" | "anthropic",
  fallbackFromProvider: "openai" | "anthropic" | null,
) {
  if (provider === "anthropic" && fallbackFromProvider === "openai") return "openai_to_anthropic" as const;
  if (provider === "openai" && fallbackFromProvider === "anthropic") return "anthropic_to_openai" as const;
  return "none" as const;
}

async function recordGuestAiSlo(input: {
  telemetry: GuestAiSloContext | null;
  outcome: GuestAiSloOutcome;
}): Promise<void> {
  const correlationId = input.telemetry?.correlationId;
  if (!input.telemetry || !correlationId) return;
  try {
    const telemetry = input.telemetry;
    const snapshot = telemetry.budget.snapshot();
    const stage = (name: string) => snapshot.stages.find((timing) => timing.stage === name);
    const retrieval = stage("live_lex_retrieval");
    const provider = stage("provider_execution");
    const validation = stage("validation");
    const persistence = stage("persistence");
    const completed = input.outcome.outcome === "completed";
    const firstUsefulLatencyMs = completed
      ? Math.min(persistence?.endedAtMs ?? snapshot.elapsedMs, snapshot.elapsedMs)
      : null;
    await tryRecordAiSloTelemetry({
      db: telemetry.db,
      value: {
        correlationId,
        environment: operationalEnvironment(runtimeEnv().APP_ENV),
        requestKind: "legal_chat",
        authKind: "guest",
        answerMode: telemetry.answerMode,
        reasoningMode: telemetry.reasoningMode,
        provider: telemetry.provider,
        model: telemetry.model,
        outcome: input.outcome.outcome,
        fallback: guestAiSloFallback(telemetry.provider, telemetry.fallbackFromProvider),
        authLatencyMs: null,
        contextLatencyMs: telemetry.contextLatencyMs,
        retrievalLatencyMs: retrieval?.elapsedMs ?? null,
        // Guest requests do not stream provider deltas, so this remains null
        // rather than deriving a fake TTFT from response headers.
        providerTtftMs: null,
        providerTotalMs: provider?.elapsedMs ?? null,
        validationLatencyMs: validation?.elapsedMs ?? null,
        persistenceLatencyMs: persistence?.elapsedMs ?? null,
        endToEndMs: snapshot.elapsedMs,
        firstUsefulStage: completed ? "persistence" : "none",
        firstUsefulLatencyMs,
        safeErrorCode: input.outcome.safeErrorCode,
      },
    });
  } catch {
    // A telemetry write is never allowed to alter a guest session or answer.
  }
}

function publicError(
  error: unknown,
  locale: "ru" | "uz",
  requestUrl: string,
): Response {
  if (error instanceof GuestAiError) {
    const map: Record<GuestAiError["code"], { status: number; ru: string; uz: string; clear?: boolean }> = {
      GUEST_AI_DISABLED: { status: 404, ru: "Гостевой AI-режим недоступен.", uz: "Mehmon AI rejimi mavjud emas." },
      GUEST_CONFIGURATION_UNAVAILABLE: { status: 503, ru: "Гостевой AI временно недоступен.", uz: "Mehmon AI vaqtincha mavjud emas." },
      GUEST_SESSION_REQUIRED: { status: 401, ru: "Пройдите проверку перед отправкой вопроса.", uz: "Savol yuborishdan oldin tekshiruvdan o‘ting.", clear: true },
      GUEST_SESSION_INVALID: { status: 401, ru: "Гостевая сессия недействительна. Пройдите проверку ещё раз.", uz: "Mehmon sessiyasi yaroqsiz. Tekshiruvdan qayta o‘ting.", clear: true },
      GUEST_SESSION_EXPIRED: { status: 401, ru: "Гостевая сессия истекла. Пройдите проверку ещё раз.", uz: "Mehmon sessiyasi tugadi. Tekshiruvdan qayta o‘ting.", clear: true },
      GUEST_SESSION_CONSUMED: { status: 429, ru: "Гостевой ответ уже использован. Зарегистрируйтесь, чтобы продолжить.", uz: "Mehmon javobi ishlatildi. Davom etish uchun ro‘yxatdan o‘ting." },
      GUEST_RATE_LIMIT: { status: 429, ru: "Слишком много гостевых сессий. Попробуйте позже.", uz: "Mehmon sessiyalari juda ko‘p. Keyinroq urinib ko‘ring." },
      GUEST_REQUEST_LIMIT: { status: 429, ru: "Лимит уточняющих попыток исчерпан. Зарегистрируйтесь, чтобы продолжить.", uz: "Aniqlashtirish urinishlari limiti tugadi. Davom etish uchun ro‘yxatdan o‘ting." },
      GUEST_RUN_CONFLICT: { status: 409, ru: "Идентификатор запроса уже использован иначе.", uz: "So‘rov identifikatori boshqa so‘rov uchun ishlatilgan." },
      GUEST_RUN_PROCESSING: { status: 202, ru: "Ответ уже формируется.", uz: "Javob tayyorlanmoqda." },
      GUEST_RUN_FAILED: { status: 409, ru: "Предыдущая попытка завершилась ошибкой. Создайте новый запрос.", uz: "Oldingi urinish xato bilan tugadi. Yangi so‘rov yarating." },
      GUEST_RESERVATION_LOST: { status: 409, ru: "Сессия изменилась во время ответа. Повторите запрос.", uz: "Javob vaqtida sessiya o‘zgardi. So‘rovni takrorlang." },
    };
    const entry = map[error.code];
    return json(
      { code: error.code, error: copy(locale, entry.ru, entry.uz) },
      entry.status,
      entry.clear ? { "set-cookie": clearGuestSessionCookie(requestUrl) } : undefined,
    );
  }
  if (error instanceof IdentityKeyringError) {
    return json({
      code: "GUEST_CONFIGURATION_UNAVAILABLE",
      error: copy(locale, "Гостевой AI временно недоступен.", "Mehmon AI vaqtincha mavjud emas."),
    }, 503);
  }
  if (error instanceof OperationalFeatureError) {
    return json({
      code: error.code,
      error: operationalFeatureMessage(locale),
    }, 503);
  }
  if (error instanceof ApiAuthError) {
    return json({
      code: "REQUEST_REJECTED",
      error: copy(locale, "Запрос отклонён проверкой безопасности.", "So‘rov xavfsizlik tekshiruvi tomonidan rad etildi."),
    }, error.status);
  }
  return json({
    code: "GUEST_AI_FAILED",
    error: copy(locale, "Не удалось обработать запрос.", "So‘rovni qayta ishlash imkoni bo‘lmadi."),
  }, 500);
}

function configuration() {
  const env = runtimeEnv();
  if (!guestAiEnabled(env)) throw new GuestAiError("GUEST_AI_DISABLED");
  if (!env.IDENTITY_KEYRING) {
    throw new GuestAiError("GUEST_CONFIGURATION_UNAVAILABLE");
  }
  return {
    env,
    db: requireD1(),
    keyring: parseIdentityKeyring(env.IDENTITY_KEYRING),
  };
}

async function sessionForRequest(input: {
  request: Request;
  db: D1Database;
  keyring: ReturnType<typeof parseIdentityKeyring>;
  locale: "ru" | "uz";
  turnstileToken?: string;
}): Promise<{ session: GuestAiSession; setCookie?: string }> {
  try {
    return {
      session: await resolveGuestAiSession({
        db: input.db,
        keyring: input.keyring,
        request: input.request,
      }),
    };
  } catch (error) {
    if (
      !(error instanceof GuestAiError)
      || !["GUEST_SESSION_REQUIRED", "GUEST_SESSION_INVALID", "GUEST_SESSION_EXPIRED"].includes(error.code)
    ) throw error;
  }

  const env = runtimeEnv();
  if (!env.TURNSTILE_SECRET_KEY || !input.turnstileToken) {
    throw new GuestAiError("GUEST_SESSION_REQUIRED");
  }
  const requestUrl = new URL(input.request.url);
  const security = authRequestSecurityContext(input.request);
  const verification = await validateTurnstile({
    secretKey: env.TURNSTILE_SECRET_KEY,
    token: input.turnstileToken,
    remoteIp: security.connectingIp,
    expectedHostname: requestUrl.hostname,
    expectedAction: guestAiTurnstileAction,
  });
  if (verification.status === "unavailable") {
    throw new GuestAiError("GUEST_CONFIGURATION_UNAVAILABLE");
  }
  if (verification.status !== "verified") {
    throw new GuestAiError("GUEST_SESSION_INVALID");
  }
  const created = await createGuestAiSession({
    db: input.db,
    keyring: input.keyring,
    connectingIp: security.connectingIp,
    locale: input.locale,
  });
  return {
    session: created.session,
    setCookie: guestSessionCookie(created.session.id, created.token, input.request.url),
  };
}

async function completedResult(
  keyring: ReturnType<typeof parseIdentityKeyring>,
  run: GuestAiRun,
) {
  return parseLegalChatResponse(JSON.parse(await revealGuestAiRunResult({ keyring, run })));
}

async function guestQuestionWithClarificationContext(input: {
  db: D1Database;
  keyring: ReturnType<typeof parseIdentityKeyring>;
  sessionId: string;
  question: string;
  locale: "ru" | "uz";
}): Promise<string> {
  const previous = await latestGuestAiClarificationRun(input.db, input.sessionId);
  if (!previous) return input.question;
  const [previousQuestion, previousResult] = await Promise.all([
    revealGuestAiRunQuestion({ keyring: input.keyring, run: previous }),
    completedResult(input.keyring, previous),
  ]);
  const questions = previousResult.clarificationQuestions.join("; ");
  return input.locale === "ru"
    ? `${previousQuestion}\n\nJURO запросил уточнение: ${questions}\nОтвет пользователя на уточнение: ${input.question}`
    : `${previousQuestion}\n\nJURO quyidagilarni aniqlashtirishni so‘radi: ${questions}\nFoydalanuvchining aniqlashtirishga javobi: ${input.question}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "uz" ? "uz" : "ru";
  try {
    const { env, db, keyring } = configuration();
    let session: GuestAiSession | null = null;
    let result = null;
    let clearCookie = false;
    try {
      session = await resolveGuestAiSession({ db, keyring, request });
      const run = await latestGuestAiRun(db, session.id);
      if (run) result = await completedResult(keyring, run);
    } catch (error) {
      if (
        !(error instanceof GuestAiError)
        || !["GUEST_SESSION_REQUIRED", "GUEST_SESSION_INVALID", "GUEST_SESSION_EXPIRED"].includes(error.code)
      ) throw error;
      clearCookie = error.code !== "GUEST_SESSION_REQUIRED";
    }
    const provider = aiProviderStatus();
    return json({
      enabled: true,
      providerConfigured: provider.configured,
      siteKey: env.TURNSTILE_SITE_KEY ?? null,
      session: session ? {
        state: session.state,
        requestCount: session.requestCount,
        answerCount: session.answerCount,
        expiresAt: session.expiresAt,
      } : null,
      result,
    }, 200, clearCookie ? { "set-cookie": clearGuestSessionCookie(request.url) } : undefined);
  } catch (error) {
    return publicError(error, locale, request.url);
  }
}

export async function POST(request: Request): Promise<Response> {
  let locale: "ru" | "uz" = "ru";
  let budget: ReturnType<typeof createAiExecutionBudget> | null = null;
  let telemetry: GuestAiSloContext | null = null;
  try {
    assertSafeWrite(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return json({
        code: "INVALID_GUEST_AI_REQUEST",
        error: "Введите вопрос длиной от 5 до 4 000 символов.",
      }, 400);
    }
    locale = parsed.data.locale;
    const applicableAt = parsed.data.legalContextDate
      ? parseLegalApplicabilityDate(parsed.data.legalContextDate)
      : null;
    if (parsed.data.legalContextDate && !applicableAt) {
      return json({ code: "INVALID_LEGAL_CONTEXT_DATE", error: copy(locale,
        "Укажите существующую дату события не позднее сегодняшнего дня.",
        "Bugungi kundan kech bo‘lmagan haqiqiy voqea sanasini kiriting.",
      ) }, 400);
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
    const { env, db, keyring } = configuration();
    await assertOperationalFeatureEnabled({
      db,
      environment: operationalEnvironment(env.APP_ENV),
      key: "ai_chat",
    });
    const sessionContext = await sessionForRequest({
      request,
      db,
      keyring,
      locale,
      turnstileToken: parsed.data.turnstileToken,
    });
    if (sessionContext.session.state === "consumed") {
      throw new GuestAiError("GUEST_SESSION_CONSUMED");
    }

    const provider = legalAiProvider();
    const providerStatus = aiProviderStatus();
    if (!provider || !providerStatus.model) {
      return json({
        code: "AI_PROVIDER_UNAVAILABLE",
        error: copy(locale, "AI-провайдер временно недоступен.", "AI-provayder vaqtincha mavjud emas."),
      }, 503, sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
    }

    const effectiveQuestion = await guestQuestionWithClarificationContext({
      db,
      keyring,
      sessionId: sessionContext.session.id,
      question: parsed.data.question,
      locale,
    });
    // Guest chat follows the same official Lex-only boundary as the
    // authenticated route. The feature-gated immutable corpus is preferred;
    // otherwise the existing request-scoped live validator remains exact.
    const configuredProvider = provider.name === "anthropic" ? "anthropic" : "openai";
    const configuredModel = providerStatus.model;
    budget = createAiExecutionBudget({ callerSignal: request.signal });
    telemetry = {
      db,
      budget,
      correlationId: null,
      answerMode: "short",
      reasoningMode: "fast",
      provider: configuredProvider,
      model: configuredModel,
      contextLatencyMs: null,
      providerFirstDeltaAtMs: null,
      providerStartedAtMs: null,
      fallbackFromProvider: null,
    };
    let retrieval;
    const retrievalStage = budget.beginStage("live_lex_retrieval", { timeoutMs: 2_900 });
    try {
      retrieval = await retrieveCorpusAwareLegalSources({
        env: { ...runtimeEnv(), DB: db },
        query: effectiveQuestion,
        locale,
        signal: retrievalStage.signal,
        limit: 2,
        budgetMs: 2_750,
        correlationId: idempotencyKey,
        scope: { asOfDate: applicableAt ? parsed.data.legalContextDate ?? null : null },
      });
      retrievalStage.complete();
    } catch {
      retrievalStage.fail();
      retrieval = await retrieveCorpusAwareLegalSources({
        env: { ...runtimeEnv(), DB: db }, query: "", locale, limit: 1, budgetMs: 1,
      });
    }
    const requestHash = await sha256Json({
      question: effectiveQuestion,
      locale,
      answerMode: "short",
      reasoningMode: "fast",
      legalContextDate: parsed.data.legalContextDate ?? null,
    });
    const runtimeSettings = await resolveAiRuntimeSettings({ db, env: runtimeEnv() });
    const instructionHash = await sha256Json({
      version: GUEST_INSTRUCTION_VERSION,
      jurisdiction: "UZ",
      runtimeConfigHash: runtimeSettings.configHash,
    });
    const sourceVersionHash = await sha256Json({
      freshness: retrieval.freshness,
      evidence: retrieval.evidence,
      sources: retrieval.sources.map((source) => ({
        id: source.id,
        hash: source.contentSha256,
        excerpt: source.excerpt ?? null,
      })),
    });
    const reservation = await reserveGuestAiRun({
      db,
      session: sessionContext.session,
      idempotencyKey,
      requestHash,
      provider: provider.name,
      model: provider.name === "openai"
        ? runtimeSettings.openaiChatModel
        : runtimeSettings.anthropicChatFallbackModel,
      legalDatabaseAsOf: retrieval.legalDatabaseAsOf,
      instructionHash,
      sourceVersionHash,
      keyring,
      question: effectiveQuestion,
    });
    if (telemetry) telemetry.correlationId = reservation.run.correlationId;
    if (reservation.kind === "completed") {
      const result = await completedResult(keyring, reservation.run);
      return json({
        idempotentReplay: true,
        runId: reservation.run.id,
        result,
        session: {
          state: result.responseKind === "answer" ? "consumed" : "available",
          expiresAt: sessionContext.session.expiresAt,
        },
      }, 200, sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
    }
    if (reservation.kind === "processing") {
      return json({ code: "GUEST_RUN_PROCESSING", runId: reservation.run.id }, 202,
        sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
    }
    if (reservation.kind === "failed") throw new GuestAiError("GUEST_RUN_FAILED");

    let aiResult;
    const providerStage = budget.beginStage("provider_execution");
    try {
      aiResult = await provider.runLegalChat({
        question: effectiveQuestion,
        locale,
        answerMode: "short",
        reasoningMode: "fast",
        sources: retrieval.sources,
        legalDatabaseAsOf: retrieval.legalDatabaseAsOf,
        applicableAt: applicableAt?.toISOString(),
        requestId: reservation.run.correlationId,
        safetyIdentifier: await sha256Json({
          scope: "guest-openai-safety-v1",
          sessionId: sessionContext.session.id,
        }),
        runtimeSettings,
      }, { signal: budget.signal, budget });
      providerStage.complete();
    } catch (error) {
      providerStage.fail();
      const code = error instanceof AiUnavailableError
        ? error.code
        : "PROVIDER_UNAVAILABLE";
      await failGuestAiRun({ db, run: reservation.run, errorCode: code });
      await recordGuestAiSlo({
        telemetry,
        outcome: guestAiSloFailureOutcome(code, budget),
      });
      return json({
        code,
        correlationId: reservation.run.correlationId,
        error: copy(
          locale,
          "AI-провайдер временно недоступен. Гостевой ответ не использован.",
          "AI-provayder vaqtincha mavjud emas. Mehmon javobi ishlatilmadi.",
        ),
      }, code === "AI_REFUSED" || code === "INVALID_AI_OUTPUT" ? 422 : 503,
      sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
    }

    let result;
    const validationStage = budget.beginStage("validation");
    try {
      const bounded = enforceLegalChatSourceBoundary(
        parseLegalChatResponse(aiResult.data),
        new Set(
          retrieval.sources
            .filter((source) => source.excerpt?.trim())
            .map((source) => source.id),
        ),
      );
      const sourceById = new Map(retrieval.sources.map((source) => [source.id, source]));
      // Lex cards come from a technically validated live fetch, not
      // from a model claim. This preserves the empty-claim safety boundary.
      const returnedSources = bounded.sources.length > 0
        ? bounded.sources
        : directSourceCards(retrieval.sources);
      result = enforceLegalDatabaseFreshness({
        ...bounded,
        sources: returnedSources.map((reference) => {
          const source = sourceById.get(reference.sourceId)!;
          return {
            sourceId: source.id,
            actTitle: source.actTitle,
            actIdentifier: source.actIdentifier,
            article: source.article ?? null,
            excerpt: source.excerpt ?? null,
            originalUrl: source.officialUrl,
            status: source.applicabilityStatus ?? "current" as const,
            effectiveDate: source.effectiveDate ?? null,
            verifiedAt: source.verifiedAt,
          };
        }),
        sourceAccessMode: retrieval.sourceAccessMode,
        sourcesRetrievedAt: retrieval.sourcesRetrievedAt,
        sourceValidationStatus: retrieval.sourceValidationStatus,
      }, retrieval.freshness, {
        locale,
        answerMode: "short",
        reasoningMode: "fast",
      });
      validationStage.complete();
    } catch {
      validationStage.fail();
      await failGuestAiRun({
        db,
        run: reservation.run,
        errorCode: "INVALID_AI_OUTPUT",
      });
      await recordGuestAiSlo({
        telemetry: telemetry && { ...telemetry, provider: aiResult.provider, model: aiResult.model, fallbackFromProvider: aiResult.fallbackFromProvider },
        outcome: guestAiSloFailureOutcome("INVALID_AI_OUTPUT", budget),
      });
      return json({
        code: "INVALID_AI_OUTPUT",
        error: copy(
          locale,
          "AI-ответ не прошёл проверку. Гостевой ответ не использован.",
          "AI javobi tekshiruvdan o‘tmadi. Mehmon javobi ishlatilmadi.",
        ),
      }, 422, sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
    }

    // Do not persist/consume a guest turn once the shared interactive deadline
    // no longer leaves room for the atomic completion. The same provider
    // reserve protects registered chat; this explicit boundary keeps the
    // guest's one allowed answer equally non-chargeable on a late result.
    if (budget.signal.aborted || budget.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS) {
      await failGuestAiRun({ db, run: reservation.run, errorCode: "PROVIDER_TIMEOUT" });
      await recordGuestAiSlo({
        telemetry: telemetry && {
          ...telemetry,
          provider: aiResult.provider,
          model: aiResult.model,
          fallbackFromProvider: aiResult.fallbackFromProvider,
        },
        outcome: guestAiSloFailureOutcome("PROVIDER_TIMEOUT", budget),
      });
      return json({
        code: "PROVIDER_TIMEOUT",
        correlationId: reservation.run.correlationId,
        error: copy(
          locale,
          "AI не успел безопасно сохранить ответ. Гостевой ответ не использован; попробуйте ещё раз.",
          "AI javobni xavfsiz saqlashga ulgurmadi. Mehmon javobi ishlatilmadi; qayta urinib ko‘ring.",
        ),
      }, 503, sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
    }

    const persistenceStage = budget.beginStage("persistence");
    try {
      await completeGuestAiRun({
        db,
        keyring,
        run: reservation.run,
        resultJson: JSON.stringify(result),
        responseKind: result.responseKind,
        provider: aiResult.provider,
        model: aiResult.model,
        providerResponseId: aiResult.providerResponseId,
        fallbackFromProvider: aiResult.fallbackFromProvider,
        inputTokens: aiResult.usage.inputTokens,
        outputTokens: aiResult.usage.outputTokens,
        cachedInputTokens: aiResult.usage.cachedInputTokens,
        attempts: aiResult.attempts,
        latencyMs: aiResult.latencyMs,
        additionalStatements: legalCitationStatements({
          db,
          sources: retrieval.sources,
          citations: result.sources,
          guestRunId: reservation.run.id,
          now: new Date().toISOString(),
          sourceAccessMode: retrieval.sourceAccessMode,
        }),
      });
      persistenceStage.complete();
    } catch (error) {
      persistenceStage.fail();
      await failGuestAiRun({ db, run: reservation.run, errorCode: "PERSISTENCE_FAILED" });
      await recordGuestAiSlo({
        telemetry: telemetry && { ...telemetry, provider: aiResult.provider, model: aiResult.model, fallbackFromProvider: aiResult.fallbackFromProvider },
        outcome: guestAiSloFailureOutcome("PERSISTENCE_FAILED", budget),
      });
      throw error;
    }
    await recordGuestAiSlo({
      telemetry: telemetry && { ...telemetry, provider: aiResult.provider, model: aiResult.model, fallbackFromProvider: aiResult.fallbackFromProvider },
      outcome: { outcome: "completed", safeErrorCode: null },
    });
    return json({
      runId: reservation.run.id,
      correlationId: reservation.run.correlationId,
      result,
      sourceFreshness: legalDatabaseFreshnessFromAsOf(result.legalDatabaseAsOf),
      session: {
        state: result.responseKind === "answer" ? "consumed" : "available",
        requestCount: sessionContext.session.requestCount + 1,
        answerCount: result.responseKind === "answer" ? 1 : 0,
        expiresAt: sessionContext.session.expiresAt,
      },
      technicalDetails: {
        provider: aiResult.provider,
        model: aiResult.model,
        fallbackFromProvider: aiResult.fallbackFromProvider,
      },
    }, 201, sessionContext.setCookie ? { "set-cookie": sessionContext.setCookie } : undefined);
  } catch (error) {
    return publicError(error, locale, request.url);
  } finally {
    budget?.dispose();
  }
}
