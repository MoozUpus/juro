"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated remote data is hydrated after the first browser render */

import { AudioLines, BookmarkPlus, BookOpenCheck, Bot, Check, CircleAlert, FilePlus2, FileQuestion, History, Keyboard, ListPlus, LoaderCircle, Mic, Pencil, RotateCcw, Send, ShieldAlert, SlidersHorizontal, Square, ThumbsUp, UserRoundX, X } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiRestartableRequestError, AiRetryableRequestError, createAiRetryRequest, isRestartableAiTerminal, isUserCancelledAiRequest, shouldOfferAiRetry, shouldUseFreshAiRetry, type AiRetryRequest } from "../../lib/ai/client-retry";
import { confirmVoiceTranscript } from "../../lib/ai/client-voice";
import { resolveVoiceModeState, type VoiceModeState, type VoiceRecorderPhase, type VoiceSpeechPhase } from "../../lib/ai/voice-ui";
import type { PlatformLocale } from "../../lib/platform/routing";
import { uzbekistanCalendarDate } from "../../lib/legal/applicability-date";
import { usePlatformBasePath } from "./PlatformRouteContext";
import { AssistantSpeechControls, VoiceMessageControls } from "./VoiceMessageControls";

type ProviderStatus = { configured: boolean; provider: string | null; model: string | null; fallbackConfigured: boolean };
type Usage = { used: number; limit: number; periodEnd: string };
type SourceFreshness = { status: "fresh" | "stale" | "unavailable"; asOf: string; ageDays: number | null; maxAgeDays: number };
type Conversation = { id: string; title: string; locale: string; status: string; updatedAt: string; lastAnswer: string | null; facts: Fact[] };
type CaseOption = { id: string; title: string; status: string; updatedAt: string };
type Fact = { id: string; statement: string; status: string };
type Source = { sourceId: string; actTitle: string; actIdentifier: string | null; article: string | null; excerpt: string | null; originalUrl: string; status: string; effectiveDate: string | null; verifiedAt: string };
type LegalResult = {
  responseKind: "answer" | "clarification_required";
  summary: string;
  answer: string;
  clarificationQuestions: string[];
  confirmedFindings: Array<{ title: string; explanation: string }>;
  assumptions: Array<{ statement: string; impact: string }>;
  risks: Array<{ level: "low" | "medium" | "high" | "critical"; title: string; explanation: string }>;
  sources: Source[];
  requiredDocuments: Array<{ name: string; reason: string; required: boolean }>;
  actionPlan: Array<{ title: string; description: string }>;
  deadlines: Array<{ title: string; dueDate: string | null; calculationMethod: string; confidence: string }>;
  urgency: "normal" | "high" | "critical";
  suggestedDocument: { templateCode: string | null; title: string; reason: string } | null;
  suggestLawyer: boolean;
  legalDatabaseAsOf: string;
  sourceAccessMode?: "direct" | "approved_package";
  sourcesRetrievedAt?: string | null;
  sourceValidationStatus?: "validated" | "unavailable";
};
type ClarificationAnswer = { question: string; answer: string };
type AnswerPreferences = {
  responseStyle: "plain" | "legal";
  clarificationPolicy: "critical_only";
  solutionPath: "recommended" | "all_legal_options";
  includeLegalDetails: boolean;
};
type ConversationMessage = {
  id: string;
  authorType: "user" | "assistant";
  content: string;
  createdAt: string;
  branchId: string;
  result?: LegalResult;
  clarificationDismissed?: boolean;
  clarificationAnswers?: ClarificationAnswer[] | null;
  legalContextDate?: string | null;
};
type AiMessageOperation = "new" | "follow_up" | "edit" | "regenerate";
type Branch = { branchId: string; parentBranchId: string | null; requestMessageId: string; responseMessageId: string; operation: AiMessageOperation; versionNumber: number; question: string; createdAt: string };
type Answer = { conversationId: string; messageId?: string; requestMessageId?: string | null; branchId?: string | null; operation?: AiMessageOperation; question?: string; branches?: Branch[]; messages?: ConversationMessage[]; result: LegalResult; facts: Fact[]; sourceFreshness?: SourceFreshness; usage?: Usage };
type AiRequestPayload = {
  question?: string;
  locale: PlatformLocale;
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  conversationId?: string;
  operation: AiMessageOperation;
  sourceMessageId?: string;
  voiceRecordingId?: string;
  legalContextDate?: string;
  clarificationAnswers?: ClarificationAnswer[];
  clarificationSourceMessageId?: string;
  preferences: AnswerPreferences;
};
type AiFeedbackType = "helpful" | "not_helpful" | "wrong_norm" | "broken_link" | "outdated" | "incomplete" | "language" | "unsafe" | "ignored_facts";
type AiFeedback = { feedbackType: AiFeedbackType; comment: string | null; updatedAt: string };
type DocumentPrefillCandidate = { fieldId: string; label: string; value: string; source: "profile" | "workspace" | "ai_answer"; sensitive: boolean };
type DocumentPrefillPreview = { templateCode: string; categorySlug: string; title: string; reason: string; caseId: string | null; candidates: DocumentPrefillCandidate[] };
type AiRunRecoveryStatus =
  | { kind: "processing"; runId: string }
  | { kind: "completed"; runId: string; conversationId: string; responseMessageId: string; branchId: string | null }
  | { kind: "failed"; runId: string; errorCode: string };

const feedbackOptions: AiFeedbackType[] = ["not_helpful", "wrong_norm", "broken_link", "outdated", "incomplete", "language", "unsafe", "ignored_facts"];

export function AiLawyerClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedConversationId = searchParams.get("conversationId") || "";
  const selectedBranchId = searchParams.get("branchId") || "";
  const voiceMode = searchParams.get("mode") === "voice";
  const base = usePlatformBasePath();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [question, setQuestion] = useState(() => (searchParams.get("prompt") || "").slice(0, 4_000));
  const [answerMode, setAnswerMode] = useState<"short" | "detailed">("detailed");
  const [reasoningMode, setReasoningMode] = useState<"fast" | "deep">("fast");
  const [preferences, setPreferences] = useState<AnswerPreferences>({
    responseStyle: "plain",
    clarificationPolicy: "critical_only",
    solutionPath: "recommended",
    includeLegalDetails: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legalContextDate, setLegalContextDate] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editSourceMessageId, setEditSourceMessageId] = useState("");
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [streamStage, setStreamStage] = useState<AiStreamStatus["stage"]>(undefined);
  const [optimisticMessage, setOptimisticMessage] = useState<ConversationMessage | null>(null);
  const [progressiveMessageId, setProgressiveMessageId] = useState("");
  const [progressiveDeliveryEnabled, setProgressiveDeliveryEnabled] = useState(false);
  const [dismissedClarificationIds, setDismissedClarificationIds] = useState<ReadonlySet<string>>(() => new Set());
  const streamAbortRef = useRef<AbortController | null>(null);
  const pendingAiRequestRef = useRef<AiRetryRequest<AiRequestPayload> | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [targetCaseId, setTargetCaseId] = useState("");
  const [planConfirmationOpen, setPlanConfirmationOpen] = useState(false);
  const planConfirmationRef = useRef<HTMLDivElement | null>(null);
  const [openingSuggestedDocument, setOpeningSuggestedDocument] = useState(false);
  const [documentPrefill, setDocumentPrefill] = useState<DocumentPrefillPreview | null>(null);
  const [documentPrefillMessageId, setDocumentPrefillMessageId] = useState("");
  const [creatingSuggestedDocument, setCreatingSuggestedDocument] = useState(false);
  const documentHandoffKeyRef = useRef("");
  const [feedback, setFeedback] = useState<AiFeedback[]>([]);
  const [feedbackType, setFeedbackType] = useState<AiFeedbackType>("not_helpful");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [voiceRecordingId, setVoiceRecordingId] = useState("");
  const [voiceRecorderPhase, setVoiceRecorderPhase] = useState<VoiceRecorderPhase>("idle");
  const [voiceSpeechPhase, setVoiceSpeechPhase] = useState<VoiceSpeechPhase>("idle");

  function aiLocation(params = new URLSearchParams()): string {
    if (voiceMode) params.set("mode", "voice");
    const serialized = params.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
  }

  function setComposerMode(next: "text" | "voice") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "voice") params.set("mode", "voice");
    else params.delete("mode");
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedConversationId) params.set("conversationId", selectedConversationId);
      if (selectedBranchId) params.set("branchId", selectedBranchId);
      const response = await fetch(`/api/platform/ai${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      const body = await response.json() as { status?: ProviderStatus; usage?: Usage; conversations?: Conversation[]; cases?: CaseOption[]; selected?: Answer | null; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "AI-модуль не загрузился." : "AI moduli yuklanmadi."));
      setStatus(body.status ?? null);
      setUsage(body.usage ?? null);
      setConversations(body.conversations ?? []);
      setCases(body.cases ?? []);
      setAnswer(body.selected ?? null);
      setProgressiveMessageId("");
      setProgressiveDeliveryEnabled(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru, selectedBranchId, selectedConversationId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (planConfirmationOpen) planConfirmationRef.current?.focus();
  }, [planConfirmationOpen]);

  useEffect(() => {
    if (!answer?.messageId) { setFeedback([]); setFeedbackStatus(""); return; }
    let active = true;
    void fetch(`/api/platform/ai/feedback?assistantMessageId=${encodeURIComponent(answer.messageId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as { feedback?: AiFeedback[] } }))
      .then(({ response, body }) => { if (active && response.ok) setFeedback(body.feedback ?? []); })
      .catch(() => { /* Feedback is supplementary; an unavailable read must not hide the legal answer. */ });
    return () => { active = false; };
  }, [answer?.messageId]);

  async function recoverPendingRequest(pending: AiRetryRequest<AiRequestPayload>, signal: AbortSignal) {
    const waits = [500, 1_000, 1_500, 2_500, 4_000];
    for (const wait of waits) {
      await abortableDelay(wait, signal);
      const statusResponse = await fetch(
        `/api/platform/ai/runs/${encodeURIComponent(pending.idempotencyKey)}`,
        { cache: "no-store", signal },
      );
      if (statusResponse.status === 404) continue;
      const statusBody = await statusResponse.json().catch(() => null) as AiRunRecoveryStatus | null;
      if ((!statusResponse.ok && statusResponse.status !== 202) || !statusBody?.kind) {
        throw new TypeError("AI_RUN_RECOVERY_UNAVAILABLE");
      }
      if (statusBody.kind === "processing") continue;
      if (statusBody.kind === "failed") return { kind: "failed" as const };

      const params = new URLSearchParams({ conversationId: statusBody.conversationId });
      if (statusBody.branchId) params.set("branchId", statusBody.branchId);
      const resultResponse = await fetch(`/api/platform/ai?${params}`, { cache: "no-store", signal });
      const resultBody = await resultResponse.json().catch(() => null) as {
        selected?: Answer | null;
        usage?: Usage;
        error?: string;
      } | null;
      if (!resultResponse.ok || !resultBody?.selected) throw new TypeError("AI_RUN_RECOVERY_RESULT_UNAVAILABLE");
      setAnswer(resultBody.selected);
      setProgressiveMessageId("");
      setProgressiveDeliveryEnabled(false);
      if (resultBody.usage) setUsage(resultBody.usage);
      setQuestion("");
      setVoiceRecordingId("");
      setEditSourceMessageId("");
      setOptimisticMessage(null);
      pendingAiRequestRef.current = null;
      setCanRetry(false);
      const nextParams = new URLSearchParams({ conversationId: statusBody.conversationId });
      if (statusBody.branchId) nextParams.set("branchId", statusBody.branchId);
      router.replace(aiLocation(nextParams), { scroll: false });
      return { kind: "completed" as const };
    }
    return { kind: "uncertain" as const };
  }

  async function submit(
    event?: FormEvent,
    override?: { operation: "regenerate"; sourceMessageId: string },
    retry?: AiRetryRequest<AiRequestPayload>,
    clarification?: { answers: ClarificationAnswer[]; sourceMessageId: string },
    delivery: "keyboard" | "pointer" = "pointer",
  ) {
    event?.preventDefault();
    const operation: AiMessageOperation = retry?.payload.operation || override?.operation || (editSourceMessageId ? "edit" : (answer?.conversationId || selectedConversationId ? "follow_up" : "new"));
    const sourceMessageId = retry?.payload.sourceMessageId || override?.sourceMessageId || editSourceMessageId || undefined;
    const nextClarificationAnswers = clarification?.answers ?? retry?.payload.clarificationAnswers;
    const clarificationSourceMessageId = clarification?.sourceMessageId ?? retry?.payload.clarificationSourceMessageId;
    if ((operation !== "regenerate" && !(nextClarificationAnswers?.length || retry?.payload.question || question.trim())) || sending || !status?.configured) return;
    const pending = retry || createAiRetryRequest<AiRequestPayload>({
      question: operation === "regenerate" || nextClarificationAnswers?.length ? undefined : question,
      locale,
      answerMode,
      reasoningMode,
      legalContextDate: legalContextDate || undefined,
      conversationId: answer?.conversationId || selectedConversationId || undefined,
      operation,
      sourceMessageId,
      voiceRecordingId: operation === "new" || operation === "follow_up" ? (voiceRecordingId || undefined) : undefined,
      clarificationAnswers: nextClarificationAnswers,
      clarificationSourceMessageId,
      preferences,
    }, () => crypto.randomUUID());
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setSending(true);
    setError("");
    setCanRetry(false);
    setStreamStatus(ru ? "JURO принимает запрос…" : "JURO so‘rovni qabul qilmoqda…");
    setStreamStage("accepted");
    if (operation !== "regenerate") {
      setOptimisticMessage({
        id: `optimistic-${pending.idempotencyKey}`,
        authorType: "user",
        content: pending.payload.question || "",
        createdAt: new Date().toISOString(),
        branchId: answer?.branchId || "pending",
        clarificationAnswers: nextClarificationAnswers ?? null,
        legalContextDate: pending.payload.legalContextDate ?? null,
      });
    }
    try {
      if (pending.payload.voiceRecordingId && pending.payload.question) {
        setStreamStatus(ru ? "Подтверждаем распознанный текст…" : "Tanilgan matn tasdiqlanmoqda…");
        await confirmVoiceTranscript(pending.payload.voiceRecordingId, pending.payload.question.trim(), locale);
      }
      const response = await fetch("/api/platform/ai", {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
          "x-juro-csrf": "1",
          "idempotency-key": pending.idempotencyKey,
        },
        body: JSON.stringify(pending.payload),
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error(ru ? "Не удалось открыть защищённый поток ответа." : "Himoyalangan javob oqimini ochib bo‘lmadi.");
      }
      let terminal;
      try {
        terminal = await readAiEventStream(response, (progress) => {
          setStreamStage(progress.stage);
          if (progress.stage === "provider_started") {
            setStreamStatus(ru ? "Формируем структурированный ответ…" : "Tuzilgan javob tayyorlanmoqda…");
          } else if (progress.stage === "retrieval_started") {
            setStreamStatus(ru ? "Ищем официальный источник Lex.uz…" : "Lex.uz rasmiy manbasi izlanmoqda…");
          } else if (progress.stage === "retrieval_completed") {
            setStreamStatus(ru ? "Проверяем актуальность нормы…" : "Normaning dolzarbligi tekshirilmoqda…");
          } else if (progress.stage === "provider_delta") {
            setStreamStatus(ru ? "Проверяем структуру и источники…" : "Tuzilma va manbalar tekshirilmoqda…");
          } else if (progress.stage === "validation_started") {
            setStreamStatus(ru ? "Проверяем источники и результат…" : "Manbalar va natija tekshirilmoqda…");
          } else if (progress.stage === "persisting") {
            setStreamStatus(ru ? "Сохраняем проверенный ответ…" : "Tekshirilgan javob saqlanmoqda…");
          } else if (progress.stage === "fallback") {
            setStreamStatus(ru ? "Основной провайдер недоступен — включён резервный…" : "Asosiy provayder ishlamayapti — zaxira yoqildi…");
          }
        });
      } catch (streamError) {
        throw new AiRetryableRequestError(
          streamError instanceof Error ? streamError.message : "STREAM_TERMINAL_EVENT_MISSING",
        );
      }
      const body = terminal.body as Answer & { error?: string; code?: string };
      if (terminal.status < 200 || terminal.status >= 300) {
        const message = body.error || (ru ? "Не удалось получить ответ." : "Javob olinmadi.");
        if (isRestartableAiTerminal(terminal.status, body.code)) throw new AiRestartableRequestError(message);
        throw new Error(message);
      }
      if (terminal.status === 202) throw new AiRetryableRequestError(ru ? "Запрос уже обрабатывается. Повторите проверку через несколько секунд." : "So‘rov qayta ishlanmoqda. Bir necha soniyadan so‘ng qayta tekshiring.");
      setAnswer(body);
      setProgressiveMessageId(body.messageId || "");
      setProgressiveDeliveryEnabled(delivery === "pointer");
      if (body.usage) setUsage(body.usage);
      setQuestion("");
      setVoiceRecordingId("");
      setEditSourceMessageId("");
      setOptimisticMessage(null);
      pendingAiRequestRef.current = null;
      setCanRetry(false);
      const nextParams = new URLSearchParams({ conversationId: body.conversationId });
      if (body.branchId) nextParams.set("branchId", body.branchId);
      router.replace(aiLocation(nextParams), { scroll: false });
    } catch (value) {
      const cancelled = isUserCancelledAiRequest(value);
      if (cancelled) setOptimisticMessage(null);
      if (!cancelled && (value instanceof AiRetryableRequestError || value instanceof TypeError)) {
        setStreamStatus(ru ? "Проверяем, сохранился ли ответ…" : "Javob saqlanganini tekshiryapmiz…");
        try {
          const recovery = await recoverPendingRequest(pending, controller.signal);
          if (recovery.kind === "completed") {
            setError("");
            return;
          }
          if (recovery.kind === "failed") {
            pendingAiRequestRef.current = createAiRetryRequest(pending.payload, () => crypto.randomUUID());
            setCanRetry(true);
            setError(ru
              ? "Предыдущая попытка завершилась без списания лимита. Можно безопасно повторить запрос."
              : "Oldingi urinish limit yechilmasdan yakunlandi. So‘rovni xavfsiz takrorlash mumkin.");
            return;
          }
        } catch (recoveryError) {
          if (isUserCancelledAiRequest(recoveryError)) {
            setError(ru ? "Восстановление остановлено." : "Tiklash to‘xtatildi.");
            return;
          }
          // An unavailable status check is still an uncertain outcome. Reuse
          // the exact request/key on the next explicit retry.
        }
      }
      if (!cancelled && shouldOfferAiRetry(value)) {
        pendingAiRequestRef.current = shouldUseFreshAiRetry(value)
          ? createAiRetryRequest(pending.payload, () => crypto.randomUUID())
          : pending;
        setCanRetry(true);
      }
      setError(cancelled
        ? (ru ? "Генерация остановлена. Лимит не списан." : "Javob yaratish to‘xtatildi. Limit yechilmadi.")
        : value instanceof Error ? value.message : String(value));
    } finally {
      streamAbortRef.current = null;
      setStreamStatus("");
      setStreamStage(undefined);
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(undefined, undefined, undefined, undefined, "keyboard");
    }
  }

  async function updateFact(factId: string, nextStatus: "confirmed" | "rejected") {
    const response = await fetch(`/api/platform/ai/facts/${encodeURIComponent(factId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Факт не обновлён." : "Fakt yangilanmadi.")); return; }
    setAnswer((current) => current ? { ...current, facts: current.facts.map((fact) => fact.id === factId ? { ...fact, status: nextStatus } : fact) } : current);
  }

  async function savePlanToCase() {
    if (!answer?.messageId || answer.result.responseKind !== "answer" || !answer.result.actionPlan.length || savingPlan) return;
    setPlanConfirmationOpen(false);
    setSavingPlan(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ai/action-plan", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ assistantMessageId: answer.messageId, targetCaseId: targetCaseId || undefined, locale }),
      });
      const body = await response.json() as { caseId?: string; error?: string };
      if (!response.ok || !body.caseId) throw new Error(body.error || (ru ? "План не сохранён в дело." : "Reja ishga saqlanmadi."));
      router.push(`${base}/cases/${encodeURIComponent(body.caseId)}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSavingPlan(false);
    }
  }

  async function openSuggestedDocument() {
    if (!answer?.messageId || answer.result.responseKind !== "answer" || !answer.result.suggestedDocument || openingSuggestedDocument) return;
    setOpeningSuggestedDocument(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ai/suggested-document", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ action: "preview", assistantMessageId: answer.messageId, locale }),
      });
      const body = await response.json() as Partial<DocumentPrefillPreview> & { error?: string };
      if (!response.ok || !body.templateCode || !body.categorySlug || !body.title || !Array.isArray(body.candidates)) {
        throw new Error(body.error || (ru ? "Шаблон не удалось проверить." : "Shablonni tekshirib bo‘lmadi."));
      }
      documentHandoffKeyRef.current = `ai-document-${crypto.randomUUID()}`;
      setDocumentPrefill(body as DocumentPrefillPreview);
      setDocumentPrefillMessageId(answer.messageId);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setOpeningSuggestedDocument(false);
    }
  }

  async function confirmSuggestedDocument() {
    if (!documentPrefillMessageId || !documentPrefill || creatingSuggestedDocument) return;
    setCreatingSuggestedDocument(true);
    setError("");
    if (!documentHandoffKeyRef.current) documentHandoffKeyRef.current = `ai-document-${crypto.randomUUID()}`;
    try {
      const response = await fetch("/api/platform/ai/suggested-document", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": documentHandoffKeyRef.current,
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({
          action: "confirm",
          assistantMessageId: documentPrefillMessageId,
          locale,
          fields: documentPrefill.candidates.map(({ fieldId, value }) => ({ fieldId, value })),
        }),
      });
      const body = await response.json() as { documentId?: string; error?: string };
      if (!response.ok || !body.documentId) throw new Error(body.error || (ru ? "Черновик не создан." : "Qoralama yaratilmadi."));
      router.push(`${base}/documents/${encodeURIComponent(body.documentId)}/edit`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setCreatingSuggestedDocument(false);
    }
  }

  async function saveFeedback(nextType: AiFeedbackType, comment = "") {
    if (!answer?.messageId || savingFeedback) return;
    setSavingFeedback(true);
    setFeedbackStatus("");
    try {
      const response = await fetch("/api/platform/ai/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ assistantMessageId: answer.messageId, feedbackType: nextType, comment }),
      });
      const body = await response.json() as { error?: string; feedbackType?: AiFeedbackType; updatedAt?: string };
      if (!response.ok || body.feedbackType === undefined || body.updatedAt === undefined) throw new Error(body.error || (ru ? "Отзыв не сохранён." : "Fikr-mulohaza saqlanmadi."));
      const savedFeedback: AiFeedback = { feedbackType: body.feedbackType, comment: comment.trim() || null, updatedAt: body.updatedAt };
      setFeedback((current) => [...current.filter((item) => item.feedbackType !== savedFeedback.feedbackType), savedFeedback]);
      setFeedbackComment("");
      setFeedbackStatus(ru ? "Спасибо, отзыв сохранён для проверки качества JURO." : "Rahmat, fikr-mulohaza JURO sifatini tekshirish uchun saqlandi.");
    } catch (value) {
      setFeedbackStatus(value instanceof Error ? value.message : String(value));
    } finally {
      setSavingFeedback(false);
    }
  }

  function feedbackLabel(type: AiFeedbackType) {
    const ruLabels: Record<AiFeedbackType, string> = { helpful: "Полезно", not_helpful: "Не помогло", wrong_norm: "Неверная норма", broken_link: "Нерабочая ссылка", outdated: "Устарело", incomplete: "Неполно", language: "Проблема языка", unsafe: "Небезопасно", ignored_facts: "Не учтены факты" };
    const uzLabels: Record<AiFeedbackType, string> = { helpful: "Foydali", not_helpful: "Yordam bermadi", wrong_norm: "Noto‘g‘ri norma", broken_link: "Ishlamaydigan havola", outdated: "Eskirgan", incomplete: "To‘liq emas", language: "Til muammosi", unsafe: "Xavfsiz emas", ignored_facts: "Faktlar hisobga olinmadi" };
    return (ru ? ruLabels : uzLabels)[type];
  }

  async function markClarificationSufficient(assistantMessageId: string, branchId: string) {
    setDismissedClarificationIds((current) => new Set([...current, assistantMessageId]));
    try {
      const response = await fetch("/api/platform/ai/clarification", {
      method: "POST",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ assistantMessageId, branchId, locale }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || (ru ? "Не удалось сохранить выбор." : "Tanlovni saqlab bo‘lmadi."));
    } catch (value) {
      setDismissedClarificationIds((current) => {
        const next = new Set(current);
        next.delete(assistantMessageId);
        return next;
      });
      setError(value instanceof Error ? value.message : String(value));
    }
  }

  const transcript = answer?.messages?.length
    ? answer.messages
    : answer ? [
      {
        id: answer.requestMessageId || "selected-user-message",
        authorType: "user" as const,
        content: answer.question || "",
        createdAt: "",
        branchId: answer.branchId || "selected",
      },
      {
        id: answer.messageId || "selected-assistant-message",
        authorType: "assistant" as const,
        content: answer.result.answer,
        createdAt: "",
        branchId: answer.branchId || "selected",
        result: answer.result,
      },
    ] : [];
  const responsePreset = reasoningMode === "deep" ? "deep" : answerMode === "short" ? "fast" : "guided";

  if (loading) return <div className="ai-workspace-loading"><LoaderCircle className="spin" /></div>;
  return (
    <section className={`ai-workspace ${voiceMode ? "ai-workspace-voice" : ""}`}>
      <aside className="ai-conversations">
        <header><Bot /><div><small>JURO</small><strong>{ru ? "Диалоги" : "Suhbatlar"}</strong></div></header>
        <button className="ai-new" onClick={() => { pendingAiRequestRef.current = null; setCanRetry(false); setAnswer(null); setOptimisticMessage(null); setQuestion(""); setVoiceRecordingId(""); setEditSourceMessageId(""); router.replace(aiLocation(), { scroll: false }); }}>{ru ? "+ Новый вопрос" : "+ Yangi savol"}</button>
        <div>{conversations.length ? conversations.map((item) => <a key={item.id} href={aiLocation(new URLSearchParams({ conversationId: item.id }))}><strong>{item.title}</strong><small>{formatDate(item.updatedAt, ru)}</small></a>) : <p>{ru ? "История появится после первого обработанного вопроса." : "Tarix birinchi qayta ishlangan savoldan keyin paydo bo‘ladi."}</p>}</div>
      </aside>
      <section className="ai-dialog" aria-labelledby="ai-lawyer-heading">
        <header><span><Bot /></span><div><h1 id="ai-lawyer-heading">{ru ? "AI-юрист JURO" : "JURO AI-yuristi"}</h1><p>{status?.configured ? (ru ? `Узбекистан · ${usage?.used ?? 0} из ${usage?.limit ?? 20} ответов` : `O‘zbekiston · ${usage?.used ?? 0}/${usage?.limit ?? 20} javob`) : (ru ? "Провайдер не подключён" : "Provayder ulanmagan")}</p></div><nav className="ai-composer-mode" aria-label={ru ? "Способ общения" : "Muloqot usuli"}><button type="button" aria-pressed={!voiceMode} onClick={() => setComposerMode("text")}><Keyboard />{ru ? "Текст" : "Matn"}</button><button type="button" aria-pressed={voiceMode} onClick={() => setComposerMode("voice")}><Mic />{ru ? "Голос" : "Ovoz"}</button><button type="button" disabled title={ru ? "Нужен утверждённый 3D-ассет Журобека" : "Tasdiqlangan Jurobek 3D asseti kerak"}><UserRoundX />{ru ? "С аватаром · скоро" : "Avatar bilan · tez orada"}</button></nav></header>
        {voiceMode && <VoiceModeStage
          locale={locale}
          configured={Boolean(status?.configured)}
          answerReady={Boolean(answer)}
          sending={sending}
          recorderPhase={voiceRecorderPhase}
          speechPhase={voiceSpeechPhase}
        />}
        {!status?.configured && <div className="ai-unavailable" role="status"><ShieldAlert /><div><strong>{ru ? "AI пока недоступен" : "AI hozircha ishlamaydi"}</strong><p>{ru ? "Сервер не подтвердил ключ AI-провайдера. JURO не имитирует ответ и не показывает ложный success." : "Server AI-provayder kalitini tasdiqlamadi. JURO javobni taqlid qilmaydi va soxta muvaffaqiyatni ko‘rsatmaydi."}</p></div></div>}
        {error && <div className="ai-error" role="alert"><CircleAlert /><div><p>{error}</p>{canRetry && <button type="button" disabled={sending} onClick={() => { const pending = pendingAiRequestRef.current; if (pending) void submit(undefined, undefined, pending); }}>{ru ? "Безопасно повторить запрос" : "So‘rovni xavfsiz qaytarish"}</button>}</div></div>}
        <div className="ai-answer-stream">
          {!answer && !optimisticMessage && !sending ? (
            <div className="ai-start"><FileQuestion /><h2>{ru ? "Опишите юридическую ситуацию" : "Yuridik vaziyatni yozing"}</h2><p>{ru ? "Не указывайте лишние персональные данные. JURO отделит подтверждённые нормы от предположений." : "Ortiqcha shaxsiy ma’lumotlarni yozmang. JURO tasdiqlangan normalarni taxminlardan ajratadi."}</p></div>
          ) : <>
            <div className="ai-message-list">
                {transcript.map((message) => message.authorType === "user"
                  ? <UserMessageBubble key={message.id} message={message} ru={ru} />
                  : message.result
                  ? <LegalAnswer key={message.id} result={message.id === answer?.messageId ? answer.result : message.result} freshness={message.id === answer?.messageId ? answer.sourceFreshness : undefined} ru={ru} progressive={message.id === progressiveMessageId && progressiveDeliveryEnabled} />
                  : null,
              )}
              {optimisticMessage && !transcript.some((message) => message.id === optimisticMessage.id) && <UserMessageBubble message={optimisticMessage} ru={ru} optimistic />}
              {sending && <PendingAssistantBubble
                label={streamStatus || (ru ? "JURO готовит ответ" : "JURO javob tayyorlamoqda")}
                stage={streamStage}
                onStop={() => streamAbortRef.current?.abort()}
                ru={ru}
              />}
            </div>
            {answer && answer.result.clarificationQuestions[0] && !sending
              && !dismissedClarificationIds.has(answer.messageId || "")
              && !transcript.find((message) => message.id === answer.messageId)?.clarificationDismissed
              && <PostAnswerClarification
                locale={locale}
                question={answer.result.clarificationQuestions[0]}
                disabled={!status?.configured}
                onSubmit={(item) => { if (answer.messageId) void submit(undefined, undefined, undefined, { answers: [item], sourceMessageId: answer.messageId }); }}
                onSufficient={() => { if (answer.messageId) void markClarificationSufficient(answer.messageId, answer.branchId || ""); }}
                onAskDifferent={() => document.getElementById("ai-question")?.focus()}
              />}
            {answer && <>
            <div className="ai-answer-actions">
              {answer.result.responseKind === "answer" && answer.result.actionPlan.length > 0 && <div className="ai-plan-destination">
                <label htmlFor="ai-plan-case">{ru ? "Куда добавить план" : "Rejani qayerga qo‘shish"}</label>
                <select id="ai-plan-case" value={targetCaseId} disabled={savingPlan} onChange={(event) => setTargetCaseId(event.target.value)}>
                  <option value="">{ru ? "Новое дело" : "Yangi ish"}</option>
                  {cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                {!planConfirmationOpen ? <button type="button" disabled={!answer.messageId || sending || savingPlan} onClick={() => setPlanConfirmationOpen(true)}><ListPlus />{savingPlan ? (ru ? "Сохраняем план…" : "Reja saqlanmoqda…") : targetCaseId ? (ru ? "Добавить в выбранное дело" : "Tanlangan ishga qo‘shish") : (ru ? "Создать дело с планом" : "Reja bilan ish yaratish")}</button> : <div className="ai-plan-confirmation" ref={planConfirmationRef} tabIndex={-1} role="group" aria-label={ru ? "Подтверждение сохранения плана" : "Rejani saqlashni tasdiqlash"}>
                  <p>{targetCaseId
                    ? (ru
                      ? `Добавить задачи по показанному плану в дело «${cases.find((item) => item.id === targetCaseId)?.title ?? "Выбранное дело"}»? Исходный AI-ответ и текущая версия плана сохранятся.`
                      : `Ko‘rsatilgan reja vazifalari “${cases.find((item) => item.id === targetCaseId)?.title ?? "Tanlangan ish"}” ishiga qo‘shilsinmi? Asl AI javobi va joriy reja versiyasi saqlanadi.`)
                    : (ru
                      ? "Создать новое дело и задачи по показанному плану? Исходный AI-ответ сохранится без изменений."
                      : "Ko‘rsatilgan reja bo‘yicha yangi ish va vazifalar yaratilsinmi? Asl AI javobi o‘zgarmaydi.")}</p>
                  <div><button type="button" className="secondary" disabled={savingPlan} onClick={() => setPlanConfirmationOpen(false)}>{ru ? "Отмена" : "Bekor qilish"}</button><button type="button" disabled={savingPlan} aria-busy={savingPlan} onClick={() => void savePlanToCase()}>{savingPlan ? <LoaderCircle className="spin" /> : <ListPlus />}{savingPlan ? (ru ? "Сохраняем…" : "Saqlanmoqda…") : (ru ? "Подтвердить и сохранить" : "Tasdiqlash va saqlash")}</button></div>
                </div>}
              </div>}
              {answer.result.responseKind === "answer" && answer.result.suggestedDocument && <button type="button" disabled={!answer.messageId || sending || openingSuggestedDocument} onClick={() => void openSuggestedDocument()}><FilePlus2 />{openingSuggestedDocument ? (ru ? "Проверяем шаблон…" : "Shablon tekshirilmoqda…") : (ru ? "Открыть шаблон JURO" : "JURO shablonini ochish")}</button>}
              <button type="button" disabled={!answer.requestMessageId || sending} onClick={() => { if (answer.requestMessageId) { setVoiceRecordingId(""); setQuestion(answer.question || ""); setEditSourceMessageId(answer.requestMessageId); } }}><Pencil />{ru ? "Редактировать вопрос" : "Savolni tahrirlash"}</button>
              <button type="button" disabled={!answer.messageId || sending || !status?.configured} onClick={() => { if (answer.messageId) void submit(undefined, { operation: "regenerate", sourceMessageId: answer.messageId }); }}><RotateCcw />{ru ? "Повторить ответ" : "Javobni qayta yaratish"}</button>
              {answer.messageId && answer.result.responseKind === "answer" && <AssistantSpeechControls locale={locale} assistantMessageId={answer.messageId} disabled={sending} onPhaseChange={setVoiceSpeechPhase} />}
            </div>
            {documentPrefill && documentPrefillMessageId === answer.messageId && <section className="ai-document-prefill" aria-labelledby="ai-document-prefill-title" aria-busy={creatingSuggestedDocument}>
              <header><div><small>{ru ? "Проверка перед созданием" : "Yaratishdan oldin tekshirish"}</small><h2 id="ai-document-prefill-title">{documentPrefill.title}</h2><p>{documentPrefill.reason}</p></div><button type="button" aria-label={ru ? "Закрыть проверку заполнения" : "To‘ldirish tekshiruvini yopish"} disabled={creatingSuggestedDocument} onClick={() => { setDocumentPrefill(null); setDocumentPrefillMessageId(""); documentHandoffKeyRef.current = ""; }}><X /></button></header>
              <p className="ai-document-prefill-note">{ru
                ? "JURO предлагает только данные из вашего профиля, workspace и сохранённого AI-ответа. Проверьте роль каждой стороны: можно исправить или удалить любое поле. Данные не помещаются в URL."
                : "JURO faqat profilingiz, workspace va saqlangan AI javobidagi ma’lumotlarni taklif qiladi. Har bir taraf rolini tekshiring: istalgan maydonni tuzatish yoki olib tashlash mumkin. Ma’lumotlar URLga joylanmaydi."}</p>
              {documentPrefill.candidates.length ? <div className="ai-document-prefill-fields">{documentPrefill.candidates.map((candidate) => <div className="ai-document-prefill-field" key={candidate.fieldId}>
                <label><span>{candidate.label}<em>{candidate.source === "profile" ? (ru ? "Профиль" : "Profil") : candidate.source === "workspace" ? "Workspace" : (ru ? "AI-ответ" : "AI javobi")}{candidate.sensitive ? ` · ${ru ? "проверьте конфиденциальные данные" : "maxfiy ma’lumotlarni tekshiring"}` : ""}</em></span>{candidate.value.length > 160 ? <textarea rows={4} value={candidate.value} disabled={creatingSuggestedDocument} onChange={(event) => setDocumentPrefill((current) => current ? { ...current, candidates: current.candidates.map((item) => item.fieldId === candidate.fieldId ? { ...item, value: event.target.value } : item) } : current)} /> : <input value={candidate.value} disabled={creatingSuggestedDocument} onChange={(event) => setDocumentPrefill((current) => current ? { ...current, candidates: current.candidates.map((item) => item.fieldId === candidate.fieldId ? { ...item, value: event.target.value } : item) } : current)} />}</label>
                <button type="button" disabled={creatingSuggestedDocument} onClick={() => setDocumentPrefill((current) => current ? { ...current, candidates: current.candidates.filter((item) => item.fieldId !== candidate.fieldId) } : current)}>{ru ? "Удалить" : "Olib tashlash"}</button>
              </div>)}</div> : <p role="status">{ru ? "Безопасных данных для автозаполнения не найдено. Можно создать пустой черновик и заполнить его вручную." : "Xavfsiz avtomatik to‘ldirish ma’lumotlari topilmadi. Bo‘sh qoralama yaratib, uni qo‘lda to‘ldirish mumkin."}</p>}
              <footer><button type="button" className="secondary" disabled={creatingSuggestedDocument} onClick={() => { setDocumentPrefill(null); setDocumentPrefillMessageId(""); documentHandoffKeyRef.current = ""; }}>{ru ? "Отмена" : "Bekor qilish"}</button><button type="button" disabled={creatingSuggestedDocument} aria-busy={creatingSuggestedDocument} onClick={() => void confirmSuggestedDocument()}>{creatingSuggestedDocument ? <LoaderCircle className="spin" /> : <FilePlus2 />}{creatingSuggestedDocument ? (ru ? "Создаём черновик…" : "Qoralama yaratilmoqda…") : (ru ? "Подтвердить и создать черновик" : "Tasdiqlash va qoralama yaratish")}</button><span className="sr-only" role="status" aria-live="polite">{creatingSuggestedDocument ? (ru ? "JURO создаёт черновик документа" : "JURO hujjat qoralamasini yaratmoqda") : ""}</span></footer>
            </section>}
            {answer.messageId && <section className="ai-feedback" aria-labelledby="ai-feedback-heading">
              <div><h2 id="ai-feedback-heading">{ru ? "Оцените этот ответ" : "Bu javobni baholang"}</h2><p>{ru ? "Отзыв привязан к этому сохранённому ответу и помогает проверить качество источников." : "Fikr-mulohaza shu saqlangan javobga bog‘lanadi va manbalar sifatini tekshirishga yordam beradi."}</p></div>
              <div className="ai-feedback-actions">
                <button type="button" className={feedback.some((item) => item.feedbackType === "helpful") ? "selected" : undefined} disabled={savingFeedback} onClick={() => void saveFeedback("helpful")}><ThumbsUp />{feedback.some((item) => item.feedbackType === "helpful") ? (ru ? "Полезно — сохранено" : "Foydali — saqlandi") : feedbackLabel("helpful")}</button>
                <details>
                  <summary>{ru ? "Сообщить о проблеме" : "Muammo haqida xabar berish"}</summary>
                  <div className="ai-feedback-form">
                    <label>{ru ? "Что не так" : "Nima noto‘g‘ri"}<select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as AiFeedbackType)}>{feedbackOptions.map((item) => <option value={item} key={item}>{feedbackLabel(item)}</option>)}</select></label>
                    <label>{ru ? "Комментарий — необязательно" : "Izoh — ixtiyoriy"}<textarea value={feedbackComment} maxLength={2_000} onChange={(event) => setFeedbackComment(event.target.value)} placeholder={ru ? "Не указывайте лишние персональные данные." : "Ortiqcha shaxsiy ma’lumotlarni kiritmang."} /></label>
                    <button type="button" disabled={savingFeedback} onClick={() => void saveFeedback(feedbackType, feedbackComment)}>{savingFeedback ? (ru ? "Сохраняем…" : "Saqlanmoqda…") : (ru ? "Сохранить отзыв" : "Fikrni saqlash")}</button>
                  </div>
                </details>
              </div>
              {feedbackStatus && <p className="ai-feedback-status" role="status">{feedbackStatus}</p>}
            </section>}
            {answer.branches && answer.branches.length > 1 && <nav className="ai-branch-history" aria-label={ru ? "Версии ответа" : "Javob versiyalari"}>
              <span><History />{ru ? "Версии" : "Versiyalar"}</span>
              {answer.branches.map((branch) => <a aria-current={branch.branchId === answer.branchId ? "page" : undefined} key={branch.branchId} href={aiLocation(new URLSearchParams({ conversationId: answer.conversationId, branchId: branch.branchId }))}>{branch.versionNumber} · {branch.operation}</a>)}
            </nav>}
            </>}
          </>}
        </div>
        <form className="ai-composer" onSubmit={submit}>
          {editSourceMessageId && <div className="ai-edit-notice" role="status"><span>{ru ? "Редактирование создаст новую версию; исходный ответ сохранится." : "Tahrirlash yangi versiya yaratadi; oldingi javob saqlanadi."}</span><button type="button" onClick={() => { setEditSourceMessageId(""); setQuestion(""); }}>{ru ? "Отменить" : "Bekor qilish"}</button></div>}
          <div className="ai-modes">
            <fieldset className="ai-response-preset" aria-label={ru ? "Глубина ответа" : "Javob chuqurligi"}>
              <legend>{ru ? "Как ответить" : "Javob usuli"}</legend>
              <button type="button" aria-pressed={responsePreset === "fast"} onClick={() => { setAnswerMode("short"); setReasoningMode("fast"); }}>{ru ? "Быстро" : "Tez"}</button>
              <button type="button" aria-pressed={responsePreset === "guided"} onClick={() => { setAnswerMode("detailed"); setReasoningMode("fast"); }}>{ru ? "Пошагово" : "Bosqichma-bosqich"}</button>
              <button type="button" aria-pressed={responsePreset === "deep"} onClick={() => { setAnswerMode("detailed"); setReasoningMode("deep"); }}>{ru ? "Глубоко" : "Chuqur"}</button>
            </fieldset>
            <button type="button" className="ai-settings-trigger" aria-expanded={settingsOpen} aria-controls="ai-answer-settings" onClick={() => setSettingsOpen((current) => !current)}><SlidersHorizontal />{ru ? "Настроить ответ" : "Javobni sozlash"}</button>
            <p className="ai-settings-summary">{responsePreset === "fast" ? (ru ? "Быстро · ближайший шаг" : "Tez · yaqin qadam") : responsePreset === "deep" ? (ru ? "Глубоко · источники, риски, варианты" : "Chuqur · manbalar, xavflar, variantlar") : (ru ? "Пошагово · рекомендуемый режим" : "Bosqichma-bosqich · tavsiya etilgan rejim")} · {preferences.responseStyle === "plain" ? (ru ? "простым языком" : "oddiy tilda") : (ru ? "юридически точно" : "yuridik aniqlikda")} · {ru ? "уточнить только важное" : "faqat muhimini aniqlash"}</p>
            {settingsOpen && <fieldset id="ai-answer-settings" className="ai-answer-settings">
              <legend>{ru ? "Настройки ответа" : "Javob sozlamalari"}</legend>
              <label>{ru ? "Объём" : "Hajm"}<select value={answerMode} onChange={(event) => setAnswerMode(event.target.value as "short" | "detailed")}><option value="short">{ru ? "Кратко" : "Qisqa"}</option><option value="detailed">{ru ? "Подробно" : "Batafsil"}</option></select></label>
              <label>{ru ? "Стиль объяснения" : "Tushuntirish uslubi"}<select value={preferences.responseStyle} onChange={(event) => setPreferences((current) => ({ ...current, responseStyle: event.target.value as AnswerPreferences["responseStyle"] }))}><option value="plain">{ru ? "Простым языком" : "Oddiy tilda"}</option><option value="legal">{ru ? "Юридически точно" : "Yuridik aniqlikda"}</option></select></label>
              <label>{ru ? "Уточняющие вопросы" : "Aniqlashtiruvchi savollar"}<output>{ru ? "JURO спросит только факт, который меняет ответ или срок." : "JURO faqat javob yoki muddatni o‘zgartiradigan faktni so‘raydi."}</output></label>
              <label>{ru ? "Пути решения" : "Yechim yo‘llari"}<select value={preferences.solutionPath} onChange={(event) => setPreferences((current) => ({ ...current, solutionPath: event.target.value as AnswerPreferences["solutionPath"] }))}><option value="recommended">{ru ? "Рекомендованный путь" : "Tavsiya etilgan yo‘l"}</option><option value="all_legal_options">{ru ? "Все законные варианты" : "Barcha qonuniy variantlar"}</option></select></label>
              <label className="ai-settings-check"><input type="checkbox" checked={preferences.includeLegalDetails} onChange={(event) => setPreferences((current) => ({ ...current, includeLegalDetails: event.target.checked }))} />{ru ? "Показывать нормы и дату редакции" : "Normalar va tahrir sanasini ko‘rsatish"}</label>
            </fieldset>}
            <label className="ai-event-date">{ru ? "Дата события — если важна редакция закона" : "Voqea sanasi — qonun tahriri muhim bo‘lsa"}<input type="date" value={legalContextDate} max={uzbekistanCalendarDate()} onChange={(event) => { pendingAiRequestRef.current = null; setCanRetry(false); setLegalContextDate(event.target.value); }} /></label>
          </div>
          <VoiceMessageControls
            locale={locale}
            disabled={!status?.configured || sending}
            recordingId={voiceRecordingId}
            presentation={voiceMode ? "stage" : "inline"}
            onPhaseChange={setVoiceRecorderPhase}
            onTranscript={({ recordingId, transcript }) => { setVoiceRecordingId(recordingId); setQuestion(transcript); pendingAiRequestRef.current = null; setCanRetry(false); }}
            onClear={() => setVoiceRecordingId("")}
          />
          <label className="sr-only" htmlFor="ai-question">{ru ? "Юридический вопрос" : "Yuridik savol"}</label>
          <textarea id="ai-question" value={question} onChange={(event) => { pendingAiRequestRef.current = null; setCanRetry(false); setQuestion(event.target.value); }} onKeyDown={handleComposerKeyDown} disabled={!status?.configured || sending} placeholder={ru ? "Что произошло? Enter — отправить" : "Nima bo‘ldi? Enter — yuborish"} />
          {sending
            ? <button type="button" onClick={() => streamAbortRef.current?.abort()} aria-label={ru ? "Остановить генерацию" : "Javob yaratishni to‘xtatish"}><Square /></button>
            : <button disabled={!status?.configured || !question.trim()} aria-label={ru ? "Отправить" : "Yuborish"}><Send /></button>}
          <small role={sending ? "status" : undefined}>{streamStatus || (legalContextDate
            ? (ru ? `Проверяется редакция права на ${legalContextDate}.` : `${legalContextDate} sanasidagi qonun tahriri tekshiriladi.`)
            : (ru ? "JURO проверяет официальный Lex.uz для этого вопроса. Сценарии Advice.uz используются только внутри как практический контекст." : "JURO bu savol uchun rasmiy Lex.uzni tekshiradi. Advice.uz ssenariylari faqat ichki amaliy kontekst sifatida ishlatiladi."))}</small>
        </form>
      </section>
      <aside className="ai-context">
        <header><BookOpenCheck /><strong>{ru ? "Контекст" : "Kontekst"}</strong></header>
        <section><h2>{ru ? "Факты для подтверждения" : "Tasdiqlash uchun faktlar"}</h2>{answer?.facts.length ? answer.facts.map((fact) => <div className={`ai-fact ${fact.status}`} key={fact.id}><p>{fact.statement}</p>{fact.status === "proposed" ? <span><button onClick={() => void updateFact(fact.id, "confirmed")} aria-label={ru ? "Подтвердить факт" : "Faktni tasdiqlash"}><Check /></button><button onClick={() => void updateFact(fact.id, "rejected")} aria-label={ru ? "Отклонить факт" : "Faktni rad etish"}><X /></button></span> : <small>{fact.status === "confirmed" ? (ru ? "Подтверждено" : "Tasdiqlandi") : (ru ? "Отклонено" : "Rad etildi")}</small>}</div>) : <p>{ru ? "Предположения появятся после разбора." : "Taxminlar tahlildan keyin paydo bo‘ladi."}</p>}</section>
        <section className="ai-evidence"><h2>{ru ? "Проверено по Lex.uz" : "Lex.uz bo‘yicha tekshirildi"}</h2>{answer?.result.sources.filter((source) => safeLexOfficialUrl(source.originalUrl)).length ? answer.result.sources.filter((source) => safeLexOfficialUrl(source.originalUrl)).map((source) => <article className="ai-source-card" key={`${source.sourceId}:${source.article || "source"}`}><a href={source.originalUrl} target="_blank" rel="noreferrer"><strong>{source.actTitle}</strong><small>{source.status === "historical" ? (ru ? "Историческая редакция" : "Tarixiy tahrir") : (source.article || source.actIdentifier || (ru ? "Официальный источник Lex.uz" : "Lex.uz rasmiy manbasi"))}</small>{source.excerpt && <span>{source.excerpt}</span>}<em>{answer.result.sourceAccessMode === "direct" ? (ru ? `Проверено напрямую ${formatDate(answer.result.sourcesRetrievedAt || source.verifiedAt, ru)}` : `${formatDate(answer.result.sourcesRetrievedAt || source.verifiedAt, ru)} bevosita tekshirildi`) : (ru ? `Проверено ${formatDate(source.verifiedAt, ru)}` : `${formatDate(source.verifiedAt, ru)} tekshirildi`)}</em></a>{answer.result.sourceAccessMode !== "direct" && <SourceBookmarkControl source={source} cases={cases} locale={locale} />}</article>) : <p>{ru ? "Официальное основание пока не удалось подтвердить по Lex.uz; статья и цитата не выдумываются." : "Rasmiy asosni Lex.uz bo‘yicha hozircha tasdiqlab bo‘lmadi; modda va iqtibos o‘ylab topilmaydi."}</p>}</section>
      </aside>
    </section>
  );
}

function SourceBookmarkControl({ source, cases, locale }: { source: Source; cases: CaseOption[]; locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [caseId, setCaseId] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFailed(false);
    setStatus("");
    try {
      const response = await fetch("/api/platform/legal-bookmarks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `legal-bookmark-create-${crypto.randomUUID()}`,
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({ sourceId: source.sourceId, caseId: caseId || null, comment: comment || null }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Источник не сохранён." : "Manba saqlanmadi."));
      setSaved(true);
      setStatus(caseId
        ? (ru ? "Норма сохранена в выбранное дело." : "Norma tanlangan ishga saqlandi.")
        : (ru ? "Норма сохранена в личные закладки." : "Norma shaxsiy xatcho‘plarga saqlandi."));
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return <details className="ai-source-bookmark">
    <summary><BookmarkPlus aria-hidden="true" />{saved ? (ru ? "Сохранено" : "Saqlandi") : (ru ? "Сохранить норму" : "Normani saqlash")}</summary>
    <form onSubmit={(event) => void save(event)}>
      <label>{ru ? "Добавить в дело — необязательно" : "Ishga qo‘shish — ixtiyoriy"}<select value={caseId} disabled={saving || saved} onChange={(event) => setCaseId(event.target.value)}><option value="">{ru ? "Личные закладки" : "Shaxsiy xatcho‘plar"}</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>{ru ? "Комментарий — необязательно" : "Izoh — ixtiyoriy"}<textarea value={comment} disabled={saving || saved} maxLength={2_000} onChange={(event) => setComment(event.target.value)} placeholder={ru ? "Почему эта норма важна для вашей ситуации" : "Bu norma vaziyatingiz uchun nega muhim"} /></label>
      <button type="submit" disabled={saving || saved}><BookmarkPlus aria-hidden="true" />{saving ? (ru ? "Сохраняем…" : "Saqlanmoqda…") : saved ? (ru ? "Сохранено" : "Saqlandi") : (ru ? "Сохранить проверенную версию" : "Tekshirilgan versiyani saqlash")}</button>
      <output role={failed ? "alert" : "status"} aria-live="polite">{status}</output>
    </form>
  </details>;
}

function VoiceModeStage(props: {
  locale: PlatformLocale;
  configured: boolean;
  answerReady: boolean;
  sending: boolean;
  recorderPhase: VoiceRecorderPhase;
  speechPhase: VoiceSpeechPhase;
}) {
  const ru = props.locale === "ru";
  const state = resolveVoiceModeState(props);
  const labels: Record<VoiceModeState, [string, string]> = {
    idle: ["Голосовой режим ожидает", "Ovozli rejim kutmoqda"],
    ready: ["Готов слушать после вашего нажатия", "Bosganingizdan keyin tinglashga tayyor"],
    listening: ["Слушаю вашу ситуацию", "Vaziyatingizni tinglayapman"],
    transcribing: ["Защищённо распознаю речь", "Nutqni himoyalangan tarzda matnga aylantiryapman"],
    thinking: ["Проверяю факты и источники", "Faktlar va manbalarni tekshiryapman"],
    speaking: ["Озвучиваю сохранённый AI-ответ", "Saqlangan AI javobini ovozlantiryapman"],
    paused: ["Пауза — вы управляете продолжением", "Pauza — davom ettirish sizning nazoratingizda"],
    completed: ["Ответ готов — проверьте текст и источники", "Javob tayyor — matn va manbalarni tekshiring"],
    offline: ["Голосовой провайдер сейчас недоступен", "Ovoz provayderi hozir mavjud emas"],
    error: ["Голосовой этап не завершён — можно повторить или перейти к тексту", "Ovoz bosqichi yakunlanmadi — qayta urinib ko‘ring yoki matnga o‘ting"],
  };
  return <section className="ai-voice-stage" data-state={state} aria-labelledby="ai-voice-stage-title">
    <div className="ai-voice-stage-portrait">
      <Image
        src="/jurobek-avatar.webp"
        alt={ru ? "Журобек, статичный цифровой помощник JURO" : "Jurobek, JUROning statik raqamli yordamchisi"}
        width={1024}
        height={1792}
        sizes="(max-width: 760px) 92px, 116px"
        priority={false}
      />
    </div>
    <div className="ai-voice-stage-copy">
      <span><AudioLines aria-hidden="true" />{ru ? "Голосовой режим" : "Ovozli rejim"}</span>
      <h2 id="ai-voice-stage-title">{labels[state][ru ? 0 : 1]}</h2>
      <p>{ru
        ? "Микрофон включается только по вашему нажатию. Перед отправкой вы увидите и сможете исправить расшифровку."
        : "Mikrofon faqat siz bosganda yoqiladi. Yuborishdan oldin matnni ko‘rib, tahrirlashingiz mumkin."}</p>
      <small>{ru
        ? "Изображение Журобека статично: утверждённый 3D-rig ещё не предоставлен. Это AI, а не живой юрист."
        : "Jurobek tasviri statik: tasdiqlangan 3D rig hali taqdim etilmagan. Bu AI, tirik yurist emas."}</small>
    </div>
    <output role={state === "error" ? "alert" : "status"} aria-live="polite">{state}</output>
  </section>;
}

type AiStreamStatus = {
  stage?: "accepted" | "retrieval_started" | "retrieval_completed" | "provider_started" | "provider_delta" | "validation_started" | "persisting" | "fallback";
  provider?: string;
  model?: string;
  receivedCharacters?: number;
};

async function readAiEventStream(
  response: Response,
  onStatus: (status: AiStreamStatus) => void,
): Promise<{ status: number; body: unknown }> {
  if (!response.body) throw new Error("STREAM_BODY_MISSING");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal: { status: number; body: unknown } | null = null;

  const processFrame = (frame: string) => {
    const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = frame.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!event || !data) return;
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { throw new Error("STREAM_EVENT_INVALID"); }
    if (event === "status") onStatus(parsed as AiStreamStatus);
    if (event === "complete" || event === "error") {
      const value = parsed as { status?: number; body?: unknown };
      terminal = { status: value.status ?? 500, body: value.body ?? {} };
    }
  };

  while (!terminal) {
    const { done, value } = await reader.read();
    buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      processFrame(frame);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (!terminal && buffer.trim()) processFrame(buffer);
  if (!terminal) throw new Error("STREAM_TERMINAL_EVENT_MISSING");
  return terminal;
}

function LegalAnswer({ result, freshness, ru, progressive }: { result: LegalResult; freshness?: SourceFreshness; ru: boolean; progressive: boolean }) {
  const lexSources = result.sources.filter((source) => safeLexOfficialUrl(source.originalUrl));
  const sourceUnavailable = result.sourceValidationStatus === "unavailable";
  const showFreshnessNotice = sourceUnavailable || Boolean(freshness && freshness.status !== "fresh" && result.sourceAccessMode !== "direct");
  return <article className="ai-answer" data-response-kind="answer" data-progressive={progressive || undefined}>
    <header><small>JURO · {ru ? "проверенный структурированный ответ" : "tekshirilgan tuzilgan javob"}</small></header>
    {showFreshnessNotice && <div className={`ai-source-freshness ai-source-freshness-${sourceUnavailable ? "unavailable" : freshness!.status}`} role="status">
      <CircleAlert aria-hidden="true" />
      <p>{sourceUnavailable || freshness!.status === "unavailable"
        ? (ru
          ? "JURO не смог подтвердить основание по Lex.uz. Ни статья, ни срок, ни правовой вывод не показаны как подтверждённые."
          : "JURO Lex.uz bo‘yicha asosni tasdiqlay olmadi. Modda, muddat va huquqiy xulosa tasdiqlangan deb ko‘rsatilmaydi.")
        : (ru
          ? `Правовая база старше ${freshness!.maxAgeDays} дней. Последняя подтверждённая полная синхронизация: ${formatDate(freshness!.asOf, true)}.`
          : `Huquqiy baza ${freshness!.maxAgeDays} kundan eski. Oxirgi tasdiqlangan to‘liq sinxronlash: ${formatDate(freshness!.asOf, false)}.`)}</p>
    </div>}
    <h2>{result.summary}</h2>
    <div className="ai-validated-content">
      <section className="ai-answer-now"><h3>{ru ? "Что можно сказать уже сейчас" : "Hozir aytish mumkin bo‘lgan narsa"}</h3><ValidatedAnswerBody text={result.answer} progressive={progressive} ru={ru} /></section>
      {result.urgency !== "normal" && <div className="ai-cautions"><ShieldAlert /><p>{result.urgency === "critical" ? (ru ? "Критическая срочность: проверьте ближайший срок и возможность немедленной помощи." : "Juda shoshilinch: yaqin muddat va zudlik bilan yordam olish imkonini tekshiring.") : (ru ? "Вопрос требует приоритетного внимания." : "Masala ustuvor e’tiborni talab qiladi.")}</p></div>}
      {result.confirmedFindings.length > 0 && <section><h3>{ru ? "Подтверждено источниками" : "Manbalar bilan tasdiqlangan"}</h3>{result.confirmedFindings.map((item) => <section className="ai-result-block" key={item.title}><strong>{item.title}</strong><p>{item.explanation}</p></section>)}</section>}
      {result.assumptions.length > 0 && <section><h3>{ru ? "Предположения" : "Taxminlar"}</h3>{result.assumptions.map((item) => <section className="ai-result-block ai-assumption" key={item.statement}><strong>{item.statement}</strong><p>{item.impact}</p></section>)}</section>}
      {result.risks.length > 0 && <section><h3>{ru ? "Риски" : "Xavflar"}</h3>{result.risks.map((risk) => <section className={`ai-result-block risk-${risk.level}`} key={`${risk.level}:${risk.title}`}><strong>{risk.title}</strong><p>{risk.explanation}</p></section>)}</section>}
      {result.actionPlan.length > 0 && <section><h3>{ru ? "План действий" : "Harakatlar rejasi"}</h3><ol>{result.actionPlan.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.description}</p></li>)}</ol></section>}
      {result.suggestedDocument && <section className="ai-result-block"><h3>{ru ? "Рекомендованный документ" : "Tavsiya etilgan hujjat"}</h3><strong>{result.suggestedDocument.title}</strong><p>{result.suggestedDocument.reason}</p></section>}
      {result.requiredDocuments.length > 0 && <section><h3>{ru ? "Документы" : "Hujjatlar"}</h3><ul>{result.requiredDocuments.map((document) => <li key={document.name}><strong>{document.name}</strong> — {document.reason}</li>)}</ul></section>}
      {result.deadlines.length > 0 && <section><h3>{ru ? "Сроки" : "Muddatlar"}</h3>{result.deadlines.map((deadline) => <section className="ai-result-block" key={deadline.title}><strong>{deadline.title}{deadline.dueDate ? ` · ${deadline.dueDate}` : ""}</strong><p>{deadline.calculationMethod}</p></section>)}</section>}
      {lexSources.length > 0 && <section className="ai-lex-citations"><h3>{ru ? "Проверено по Lex.uz" : "Lex.uz bo‘yicha tekshirildi"}</h3><ul>{lexSources.map((source) => <li key={source.sourceId}><a href={source.originalUrl} target="_blank" rel="noreferrer">{source.actTitle}{source.article ? ` · ${source.article}` : ""}</a><small>{source.effectiveDate ? (ru ? `Применимая редакция: ${source.effectiveDate}` : `Qo‘llanadigan tahrir: ${source.effectiveDate}`) : (ru ? "Официальный НПА Lex.uz" : "Lex.uz rasmiy NHH")}</small></li>)}</ul></section>}
    </div>
  </article>;
}

function ValidatedAnswerBody({ text, progressive, ru }: { text: string; progressive: boolean; ru: boolean }) {
  const chunks = useMemo(() => answerChunks(text), [text]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visibleCount, setVisibleCount] = useState(progressive ? 1 : chunks.length);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const shouldProgress = progressive && !reducedMotion;
    setVisibleCount(shouldProgress ? 1 : chunks.length);
    if (!shouldProgress || chunks.length < 2) return;
    const timers = chunks.slice(1).map((_, index) => window.setTimeout(
      () => setVisibleCount((current) => Math.min(chunks.length, current + 1)),
      140 * (index + 1),
    ));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [progressive, reducedMotion, chunks]);
  return <div className="ai-answer-body" data-progressive={progressive && !reducedMotion || undefined}>
    {chunks.slice(0, visibleCount).map((chunk, index) => <p key={`${index}:${chunk.slice(0, 20)}`}>{chunk}</p>)}
    {visibleCount < chunks.length && <button type="button" onClick={() => setVisibleCount(chunks.length)}>{ru ? "Показать полностью" : "To‘liq ko‘rsatish"}</button>}
  </div>;
}

function answerChunks(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  const chunks = paragraphs.length > 1 ? paragraphs : (text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/gu) ?? [text]);
  return chunks.map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function UserMessageBubble({ message, ru, optimistic = false }: { message: ConversationMessage; ru: boolean; optimistic?: boolean }) {
  return <article className="ai-user-message" data-optimistic={optimistic || undefined}>
    <header><strong>{ru ? "Вы" : "Siz"}</strong>{message.createdAt && <time dateTime={message.createdAt}>{formatDate(message.createdAt, ru)}</time>}</header>
    {message.clarificationAnswers?.length ? <section><small>{ru ? "Уточнения пользователя" : "Foydalanuvchi aniqliklari"}</small>{message.clarificationAnswers.map((item) => <dl key={item.question}><dt>{item.question}</dt><dd>{item.answer}</dd></dl>)}</section> : <p>{message.content}</p>}
    {message.legalContextDate && <small className="ai-message-meta">{ru ? `Дата события: ${message.legalContextDate}` : `Voqea sanasi: ${message.legalContextDate}`}</small>}
  </article>;
}

function PendingAssistantBubble({ label, stage, onStop, ru }: { label: string; stage?: AiStreamStatus["stage"]; onStop: () => void; ru: boolean }) {
  const steps: Array<{ id: NonNullable<AiStreamStatus["stage"]>; ru: string; uz: string }> = [
    { id: "accepted", ru: "Запрос принят", uz: "So‘rov qabul qilindi" },
    { id: "retrieval_started", ru: "Ищем официальный источник Lex.uz", uz: "Lex.uz rasmiy manbasi izlanmoqda" },
    { id: "retrieval_completed", ru: "Проверяем актуальность нормы", uz: "Normaning dolzarbligi tekshirilmoqda" },
    { id: "provider_started", ru: "Формируем структурированный ответ", uz: "Tuzilgan javob tayyorlanmoqda" },
    { id: "validation_started", ru: "Проверяем источники и сохраняем ответ", uz: "Manbalar tekshirilmoqda va javob saqlanmoqda" },
  ];
  const currentIndex = stage === "provider_delta"
    ? 3
    : stage === "persisting"
      ? 4
      : Math.max(0, steps.findIndex((item) => item.id === stage));
  return <article className="ai-pending-message" aria-busy="true">
    <header><strong>JURO</strong><small>{ru ? "готовит ответ" : "javob tayyorlamoqda"}</small></header>
    <p role="status" aria-live="polite">{label}</p>
    <ol aria-label={ru ? "Этапы подготовки ответа" : "Javob tayyorlash bosqichlari"}>{steps.map((item, index) => <li key={item.id} data-current={index === currentIndex || undefined} data-complete={index < currentIndex || undefined}>{ru ? item.ru : item.uz}</li>)}</ol>
    <button type="button" onClick={onStop}><Square aria-hidden="true" />{ru ? "Остановить" : "To‘xtatish"}</button>
  </article>;
}

function PostAnswerClarification(props: {
  locale: PlatformLocale;
  question: string;
  disabled: boolean;
  onSubmit: (answer: ClarificationAnswer) => void;
  onSufficient: () => void;
  onAskDifferent: () => void;
}) {
  const ru = props.locale === "ru";
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const firstInvalidRef = useRef<HTMLElement | null>(null);
  function submitClarifications(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) {
      setError(ru ? "Введите ответ." : "Javobni kiriting.");
      window.requestAnimationFrame(() => firstInvalidRef.current?.focus());
      return;
    }
    props.onSubmit({ question: props.question, answer: value.trim() });
  }
  const kind = clarificationInputKind(props.question);
  const id = "ai-post-answer-clarification";
  return <form className="ai-clarification-form ai-post-answer-clarification" onSubmit={submitClarifications} noValidate>
    <header><small>JURO</small><h2>{ru ? "Хотите уточнить ответ?" : "Javobni aniqlashtirmoqchimisiz?"}</h2><p>{ru ? "Этот один факт может изменить норму, срок, риск или следующий шаг. Ответ уже доступен — уточнение необязательно." : "Bu bitta fakt norma, muddat, xavf yoki keyingi qadamni o‘zgartirishi mumkin. Javob allaqachon mavjud — aniqlik kiritish ixtiyoriy."}</p></header>
    {error && <p className="ai-form-errors" role="alert">{error}</p>}
    <label htmlFor={id}><span>{props.question}</span>{kind === "text"
      ? <textarea id={id} value={value} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} ref={(node) => { firstInvalidRef.current = node; }} onChange={(event) => { setValue(event.target.value); setError(""); }} />
      : <input id={id} type={kind} inputMode={kind === "number" ? "decimal" : undefined} value={value} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} ref={(node) => { firstInvalidRef.current = node; }} onChange={(event) => { setValue(event.target.value); setError(""); }} />}
      {error && <small id={`${id}-error`}>{error}</small>}
    </label>
    <footer><button type="button" className="secondary" onClick={props.onSufficient}>{ru ? "Ответа достаточно" : "Javob yetarli"}</button><button type="button" className="secondary" onClick={props.onAskDifferent}>{ru ? "Задать другой вопрос" : "Boshqa savol berish"}</button><button type="submit" disabled={props.disabled}>{ru ? "Уточнить ответ" : "Javobni aniqlashtirish"}</button></footer>
  </form>;
}

function clarificationInputKind(question: string): "date" | "number" | "text" {
  const value = question.toLocaleLowerCase("ru");
  if (/(дата|когда|срок|qachon|sana|muddat)/u.test(value)) return "date";
  if (/(сумм|размер|стоим|оплат|заработ|so['’`ʻ‘]?m|miqdor|narx|to['’`ʻ‘]?lov)/u.test(value)) return "number";
  return "text";
}

function formatDate(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(value));
}

function safeLexOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz");
  } catch { return false; }
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
