"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated remote data is hydrated after the first browser render */

import { AudioLines, BookmarkPlus, BookOpenCheck, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FilePlus2, FileQuestion, History, Keyboard, ListPlus, LoaderCircle, Mic, Pencil, Plus, RotateCcw, Send, Settings2, ShieldAlert, Square, ThumbsUp, Trash2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { AiRestartableRequestError, AiRetryableRequestError, createAiRetryRequest, isRestartableAiTerminal, isUserCancelledAiRequest, shouldOfferAiRetry, shouldUseFreshAiRetry, type AiRetryRequest } from "../../lib/ai/client-retry";
import { confirmVoiceTranscript } from "../../lib/ai/client-voice";
import { resolveVoiceModeState, type VoiceModeState, type VoiceRecorderPhase, type VoiceSpeechPhase } from "../../lib/ai/voice-ui";
import { formatPlatformDate, formatPlatformLongDate, formatPlatformMonth } from "../../lib/platform/date-time";
import type { PlatformLocale } from "../../lib/platform/routing";
import { uzbekistanCalendarDate } from "../../lib/legal/applicability-date";
import { usePlatformBasePath } from "./PlatformRouteContext";
import { AiSelect } from "./AiSelect";
import { LegalAnswerView } from "./LegalAnswerView";
import { AssistantSpeechControls, VoiceMessageControls } from "./VoiceMessageControls";

type ProviderStatus = { configured: boolean; provider: string | null; model: string | null; fallbackConfigured: boolean };
type Usage = { used: number; limit: number | null; periodEnd: string };
type SourceFreshness = { status: "fresh" | "stale" | "unavailable"; asOf: string; ageDays: number | null; maxAgeDays: number };
type Conversation = { id: string; title: string; locale: string; status: string; updatedAt: string; lastAnswer: string | null; facts: Fact[] };
type CaseOption = { id: string; title: string; status: string; updatedAt: string };
type Fact = { id: string; statement: string; status: string };
type Source = {
  sourceId: string;
  actTitle: string;
  actIdentifier: string | null;
  article: string | null;
  excerpt?: string | null;
  originalUrl: string;
  status: string;
  effectiveDate: string | null;
  verifiedAt: string;
  documentType?: string | null;
  documentNumber?: string | null;
  adoptingAuthority?: string | null;
  sourceClass?: string;
  language?: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  sourceOrigin?: "indexed" | "live" | "web";
};
type ArticleDetails = {
  documentTitle: string;
  documentType: string | null;
  documentNumber: string | null;
  adoptingAuthority: string | null;
  sourceClass: string;
  articleNumber: string | null;
  articleTitle: string | null;
  part: string | null;
  chapter: string | null;
  section: string | null;
  text: string | null;
  fullArticle: boolean;
  fullDocument?: boolean;
  privateSource?: boolean;
  truncated: boolean;
  language: string;
  status: string;
  validFrom: string | null;
  validTo: string | null;
  versionDate: string | null;
  officialUrl: string;
  verifiedAt: string;
  availableLanguages: Array<{ language: string; officialUrl: string; verifiedAt: string; official: boolean }>;
  versionHistory: Array<{ versionNumber: number; status: string; validFrom: string | null; validTo: string | null; versionDate: string | null; fetchedAt: string }>;
};
type AiPreliminary = {
  kind: "grounded_answer";
  message: string;
  claim: {
    text: string;
    type: "legal_basis" | "action" | "deadline" | "risk" | "fact";
    sourceId: string | null;
    sourceSpanId: string | null;
    confidence: number;
  };
  source: {
    sourceId: string;
    title: string;
    article: string | null;
    paragraph: string | null;
    canonicalUrl: string;
    accessedAt: string;
    contentSha256: string;
  };
};
type LegalResult = {
  responseKind: "answer" | "clarification_required";
  summary: string;
  answer: string;
  clarificationQuestions: string[];
  confirmedFindings: Array<{ title: string; explanation: string; sourceIds?: string[] }>;
  assumptions: Array<{ statement: string; impact: string }>;
  risks: Array<{ level: "low" | "medium" | "high" | "critical"; title: string; explanation: string; sourceIds?: string[] }>;
  sources: Source[];
  requiredDocuments: Array<{ name: string; reason: string; required: boolean }>;
  actionPlan: Array<{ title: string; description: string; sourceIds?: string[] }>;
  deadlines: Array<{ title: string; dueDate: string | null; calculationMethod: string; confidence: string; sourceIds?: string[] }>;
  urgency: "normal" | "high" | "critical";
  suggestedDocument: { templateCode: string | null; title: string; reason: string } | null;
  suggestLawyer: boolean;
  legalDatabaseAsOf: string;
  sourceAccessMode?: "direct" | "approved_package" | "mixed";
  evidenceMode?: "official" | "mixed" | "secondary_only" | "private_only" | "none";
  referenceNotes?: Array<{ title: string; note: string; sourceIds: string[] }>;
  sourcesRetrievedAt?: string | null;
  sourceValidationStatus?: "validated" | "unavailable";
  coverageStatus?: "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage";
};
type AiMessageOperation = "new" | "follow_up" | "edit" | "regenerate";
type Branch = { branchId: string; parentBranchId: string | null; requestMessageId: string; responseMessageId: string; operation: AiMessageOperation; versionNumber: number; question: string; createdAt: string };
type ConversationTurn = { branchId: string; requestMessageId: string; responseMessageId: string; question: string; createdAt: string; result: LegalResult; sourceFreshness?: SourceFreshness };
type Answer = { conversationId: string; messageId?: string; requestMessageId?: string | null; branchId?: string | null; operation?: AiMessageOperation; question?: string; branches?: Branch[]; turns?: ConversationTurn[]; result: LegalResult; facts: Fact[]; sourceFreshness?: SourceFreshness; usage?: Usage };
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
  const [legalContextDate, setLegalContextDate] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editSourceMessageId, setEditSourceMessageId] = useState("");
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [optimisticQuestion, setOptimisticQuestion] = useState("");
  const [preliminary, setPreliminary] = useState<AiPreliminary | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const latestAnswerRef = useRef<HTMLDivElement | null>(null);
  const transcriptPinnedRef = useRef(true);
  const pendingAiRequestRef = useRef<AiRetryRequest<AiRequestPayload> | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [mobileContextTab, setMobileContextTab] = useState<"facts" | "sources">("sources");
  const [canRetry, setCanRetry] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [targetCaseId, setTargetCaseId] = useState("");
  const [planConfirmationOpen, setPlanConfirmationOpen] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [dismissedPlanMessageId, setDismissedPlanMessageId] = useState("");
  const planConfirmationRef = useRef<HTMLDivElement | null>(null);
  const [openingSuggestedDocument, setOpeningSuggestedDocument] = useState(false);
  const [documentPrefill, setDocumentPrefill] = useState<DocumentPrefillPreview | null>(null);
  const [documentPrefillMessageId, setDocumentPrefillMessageId] = useState("");
  const [sensitivePrefillConsent, setSensitivePrefillConsent] = useState(false);
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
  const [deleteCandidateId, setDeleteCandidateId] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [conversationDeleteError, setConversationDeleteError] = useState("");

  function aiLocation(params = new URLSearchParams()): string {
    if (voiceMode) params.set("mode", "voice");
    const serialized = params.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
  }

  function setComposerMode(next: "text" | "voice") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "voice") params.set("mode", "voice");
    else params.delete("mode");
    window.location.assign(params.size ? `${pathname}?${params}` : pathname);
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
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru, selectedBranchId, selectedConversationId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setHistoryCollapsed(localStorage.getItem("juro:ai-history") === "collapsed");
  }, []);

  useEffect(() => {
    if (planConfirmationOpen) planConfirmationRef.current?.focus();
  }, [planConfirmationOpen]);

  useEffect(() => {
    setPlanConfirmationOpen(false);
    setPlanEditorOpen(false);
  }, [answer?.messageId]);

  useEffect(() => {
    if (!answer?.messageId || !transcriptPinnedRef.current) return;
    latestAnswerRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    if (answer.result.sources.length > 0) setEvidenceCollapsed(false);
  }, [answer?.messageId, answer?.result.sources.length]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !transcriptPinnedRef.current || (!optimisticQuestion && !preliminary)) return;
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: "auto" });
  }, [optimisticQuestion, preliminary]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (textarea) resizeComposer(textarea);
  }, [question]);

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
      if (resultBody.usage) setUsage(resultBody.usage);
      setQuestion("");
      setOptimisticQuestion("");
      setPreliminary(null);
      setVoiceRecordingId("");
      setEditSourceMessageId("");
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
  ) {
    event?.preventDefault();
    const operation: AiMessageOperation = retry?.payload.operation || override?.operation || (editSourceMessageId ? "edit" : (answer?.conversationId || selectedConversationId ? "follow_up" : "new"));
    const sourceMessageId = retry?.payload.sourceMessageId || override?.sourceMessageId || editSourceMessageId
      || (operation === "follow_up" ? answer?.messageId : undefined);
    if ((operation !== "regenerate" && !(retry?.payload.question || question.trim())) || sending || !status?.configured) return;
    const pending = retry || createAiRetryRequest<AiRequestPayload>({
      question: operation === "regenerate" ? undefined : question,
      locale,
      answerMode,
      reasoningMode,
      legalContextDate: legalContextDate || undefined,
      conversationId: answer?.conversationId || selectedConversationId || undefined,
      operation,
      sourceMessageId,
      voiceRecordingId: operation === "new" || operation === "follow_up" ? (voiceRecordingId || undefined) : undefined,
    }, () => crypto.randomUUID());
    const controller = new AbortController();
    streamAbortRef.current = controller;
    const visibleQuestion = pending.payload.question?.trim() || answer?.question?.trim() || "";
    setOptimisticQuestion(visibleQuestion);
    setPreliminary(null);
    if (operation !== "regenerate") setQuestion("");
    setSending(true);
    setError("");
    setCanRetry(false);
    setStreamStatus(ru ? "Понимаю вопрос" : "Savolni tushunyapman");
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
          if (progress.stage === "accepted") {
            setStreamStatus(ru ? "Понимаю вопрос" : "Savolni tushunyapman");
          } else if (progress.stage === "document_search_started") {
            setStreamStatus(ru ? "Сначала проверяю юридические документы в базе JURO" : "Avval JURO bazasidagi yuridik hujjatlarni tekshiryapman");
          } else if (progress.stage === "lex_search_started") {
            setStreamStatus(ru ? "Ищу действующие нормы в Lex.uz" : "Lex.uz’dan amaldagi normalarni izlayapman");
          } else if (progress.stage === "internet_search_started") {
            setStreamStatus(ru ? "Дополняю поиск другими открытыми материалами" : "Qidiruvni boshqa ochiq materiallar bilan to‘ldiryapman");
          } else if (progress.stage === "source_verified") {
            setStreamStatus(ru ? "Проверяю официальный источник" : "Rasmiy manbani tekshiryapman");
          } else if (progress.stage === "provider_started") {
            setStreamStatus(ru ? "Готовлю практический ответ…" : "Amaliy javobni tayyorlayapman…");
          } else if (progress.stage === "provider_delta") {
            setStreamStatus(ru ? "JURO проверяет структуру и источники…" : "JURO tuzilma va manbalarni tekshirmoqda…");
          } else if (progress.stage === "preliminary" && progress.preliminary) {
            setPreliminary(progress.preliminary);
            setStreamStatus(progress.preliminary.message);
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
      setOptimisticQuestion("");
      setPreliminary(null);
      if (body.usage) setUsage(body.usage);
      setQuestion("");
      setVoiceRecordingId("");
      setEditSourceMessageId("");
      pendingAiRequestRef.current = null;
      setCanRetry(false);
      const nextParams = new URLSearchParams({ conversationId: body.conversationId });
      if (body.branchId) nextParams.set("branchId", body.branchId);
      router.replace(aiLocation(nextParams), { scroll: false });
    } catch (value) {
      // A preliminary finding is useful only while the authoritative run is
      // still able to finish. Never leave it looking like a completed answer
      // after cancellation, provider failure, or persistence uncertainty.
      setPreliminary(null);
      const cancelled = isUserCancelledAiRequest(value);
      if (cancelled && pending.payload.question) setQuestion(pending.payload.question);
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
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  function toggleHistory() {
    setHistoryCollapsed((current) => {
      const next = !current;
      localStorage.setItem("juro:ai-history", next ? "collapsed" : "expanded");
      return next;
    });
  }

  function revealCitation(sourceId: string) {
    setEvidenceCollapsed(false);
    setMobileContextTab("sources");
    if (window.matchMedia("(max-width: 1380px)").matches) setMobileContextOpen(true);
    requestAnimationFrame(() => focusSourceCard(sourceId));
  }

  async function deleteConversation(conversationId: string) {
    if (sending || deletingConversationId) return;
    setDeletingConversationId(conversationId);
    setConversationDeleteError("");
    try {
      const response = await fetch(`/api/platform/ai?conversationId=${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
        headers: { "x-juro-csrf": "1" },
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Диалог не удалён." : "Suhbat o‘chirilmadi."));
      setConversations((current) => current.filter((item) => item.id !== conversationId));
      setDeleteCandidateId("");
      if (conversationId === selectedConversationId) window.location.assign(aiLocation());
    } catch (value) {
      setConversationDeleteError(value instanceof Error ? value.message : String(value));
    } finally {
      setDeletingConversationId("");
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
      setSensitivePrefillConsent(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setOpeningSuggestedDocument(false);
    }
  }

  async function confirmSuggestedDocument() {
    if (!documentPrefillMessageId || !documentPrefill || creatingSuggestedDocument) return;
    if (documentPrefill.candidates.some((candidate) => candidate.sensitive) && !sensitivePrefillConsent) {
      setError(ru ? "Подтвердите сохранение выбранных конфиденциальных реквизитов." : "Tanlangan maxfiy rekvizitlarni saqlashni tasdiqlang.");
      return;
    }
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
          sensitiveDataConsent: sensitivePrefillConsent,
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

  const visibleSources = answer?.result.sources.filter((source) =>
    safeOfficialUrl(source.originalUrl) || isTrustedPrivateSource(source) || isSafeSecondarySource(source)) ?? [];
  const hasPrivateSources = visibleSources.some(isTrustedPrivateSource);
  const hasSecondarySources = visibleSources.some(isSafeSecondarySource);

  if (loading) return <div className="ai-workspace-loading"><LoaderCircle className="spin" /></div>;
  return (
    <section className={`ai-workspace ${voiceMode ? "ai-workspace-voice" : ""} ${historyCollapsed ? "ai-history-collapsed" : ""} ${evidenceCollapsed ? "ai-evidence-collapsed" : ""}`}>
      <aside className="ai-conversations" id="ai-conversations-panel" aria-label={ru ? "История диалогов" : "Suhbatlar tarixi"}>
        <header><Bot /><div><small>JURO</small><strong>{ru ? "Диалоги" : "Suhbatlar"}</strong></div></header>
        <button className="ai-new" onClick={() => { pendingAiRequestRef.current = null; setCanRetry(false); setAnswer(null); setQuestion(""); setOptimisticQuestion(""); setPreliminary(null); setVoiceRecordingId(""); setEditSourceMessageId(""); window.location.assign(aiLocation()); }}><Plus />{ru ? "Новый вопрос" : "Yangi savol"}</button>
        <nav className="ai-conversation-list" aria-label={ru ? "История диалогов" : "Suhbatlar tarixi"}>
          {conversationDeleteError && <p className="ai-conversation-delete-error" role="alert">{conversationDeleteError}</p>}
          {conversations.length ? conversations.map((item) => <div className="ai-conversation-item" key={item.id}>
            <a aria-current={item.id === selectedConversationId ? "page" : undefined} href={aiLocation(new URLSearchParams({ conversationId: item.id }))}><span className="ai-conversation-marker" aria-hidden="true" /><strong>{item.title}</strong><small>{formatDate(item.updatedAt, ru)}</small></a>
            <button className="ai-conversation-delete" type="button" disabled={sending || Boolean(deletingConversationId)} aria-expanded={deleteCandidateId === item.id} aria-label={ru ? `Удалить диалог «${item.title}»` : `“${item.title}” suhbatini o‘chirish`} title={ru ? "Удалить диалог" : "Suhbatni o‘chirish"} onClick={() => { setConversationDeleteError(""); setDeleteCandidateId((current) => current === item.id ? "" : item.id); }}><Trash2 /></button>
            {deleteCandidateId === item.id && <div className="ai-conversation-delete-confirm" role="group" aria-label={ru ? "Подтверждение удаления" : "O‘chirishni tasdiqlash"}><span>{ru ? "Удалить без возможности восстановления?" : "Tiklash imkoniyatisiz o‘chirilsinmi?"}</span><button type="button" disabled={Boolean(deletingConversationId)} onClick={() => setDeleteCandidateId("")}>{ru ? "Отмена" : "Bekor qilish"}</button><button className="is-danger" type="button" disabled={Boolean(deletingConversationId)} onClick={() => void deleteConversation(item.id)}>{deletingConversationId === item.id ? (ru ? "Удаляем…" : "O‘chirilmoqda…") : (ru ? "Удалить" : "O‘chirish")}</button></div>}
          </div>) : <p>{ru ? "История появится после первого обработанного вопроса." : "Tarix birinchi qayta ishlangan savoldan keyin paydo bo‘ladi."}</p>}
        </nav>
      </aside>
      <section className="ai-dialog" aria-labelledby="ai-lawyer-heading">
        <header><span><Bot /></span><div><h1 id="ai-lawyer-heading">{ru ? "AI-юрист JURO" : "JURO AI-yuristi"}</h1><p>{status?.configured ? (usage?.limit === null
          ? (ru ? `Право Узбекистана · безлимитно (локально) · ${usage.used} ответов` : `O‘zbekiston huquqi · lokal cheklanmagan · ${usage.used} javob`)
          : (ru ? `Право Узбекистана · ${usage?.used ?? 0} из ${usage?.limit ?? 20} ответов` : `O‘zbekiston huquqi · ${usage?.used ?? 0}/${usage?.limit ?? 20} javob`)) : (ru ? "Провайдер не подключён" : "Provayder ulanmagan")}</p></div><div className="ai-panel-controls"><button type="button" aria-controls="ai-conversations-panel" aria-expanded={!historyCollapsed} onClick={toggleHistory}><History aria-hidden="true" /><span>{ru ? "История" : "Tarix"}</span></button><button type="button" aria-controls="ai-context-panel" aria-expanded={mobileContextOpen || !evidenceCollapsed} onClick={() => { if (window.matchMedia("(max-width: 1380px)").matches) { setMobileContextTab("sources"); setMobileContextOpen(true); } else setEvidenceCollapsed((current) => !current); }}><BookOpenCheck aria-hidden="true" /><span>{ru ? "Источники" : "Manbalar"}</span></button></div><nav className="ai-composer-mode" aria-label={ru ? "Способ общения" : "Muloqot usuli"}><button type="button" aria-pressed={!voiceMode} onClick={() => setComposerMode("text")}><Keyboard />{ru ? "Текст" : "Matn"}</button><button type="button" aria-pressed={voiceMode} onClick={() => setComposerMode("voice")}><Mic />{ru ? "Голос" : "Ovoz"}</button></nav></header>
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
        <p className="sr-only" role="status" aria-live="polite">{sending ? streamStatus : answer?.messageId ? (ru ? "Проверенный ответ готов" : "Tekshirilgan javob tayyor") : ""}</p>
        <div className="ai-answer-stream" ref={transcriptRef} role="log" aria-label={ru ? "Юридический диалог" : "Huquqiy suhbat"} aria-busy={sending} onScroll={(event) => { const transcript = event.currentTarget; transcriptPinnedRef.current = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 96; }}>
          {!answer && !optimisticQuestion ? (
            <div className="ai-start"><FileQuestion /><h2>{ru ? "Опишите юридическую ситуацию" : "Yuridik vaziyatni yozing"}</h2><p>{ru ? "Не указывайте лишние персональные данные. JURO отделит подтверждённые нормы от предположений." : "Ortiqcha shaxsiy ma’lumotlarni yozmang. JURO tasdiqlangan normalarni taxminlardan ajratadi."}</p></div>
          ) : <>
            {answer && <>
            <div className="ai-transcript">
              {(answer.turns ?? []).filter((turn) => turn.responseMessageId !== answer.messageId).map((turn) => <ConversationTurnPair key={turn.branchId} turn={turn} ru={ru} onCitationSelect={revealCitation} />)}
              <HumanMessage question={answer.question || answer.turns?.at(-1)?.question || ""} ru={ru} />
              <div className="ai-current-answer" ref={latestAnswerRef}><LegalAnswer result={answer.result} freshness={answer.sourceFreshness} ru={ru} onCitationSelect={revealCitation} onQuestionSelect={(selected) => {
                 setQuestion(selected);
                 requestAnimationFrame(() => composerRef.current?.focus());
              }} /></div>
            </div>
            {answer.result.responseKind === "answer" && answer.result.actionPlan.length > 0 && dismissedPlanMessageId !== answer.messageId && <section className="ai-plan-card" aria-labelledby="ai-plan-card-title">
              <header><small>{ru ? "После ответа AI" : "AI javobidan so‘ng"}</small><h2 id="ai-plan-card-title">{ru ? "Создать план действий" : "Harakatlar rejasini yaratish"}</h2></header>
              <p>{ru ? "Сохраните следующие шаги из ответа как задачи в новом или существующем деле." : "Javobdagi keyingi qadamlarni yangi yoki mavjud ishda vazifalar sifatida saqlang."}</p>
              {planEditorOpen && <div className="ai-plan-destination"><label htmlFor="ai-plan-case">{ru ? "Куда добавить план" : "Rejani qayerga qo‘shish"}</label><AiSelect id="ai-plan-case" value={targetCaseId} disabled={savingPlan} onChange={setTargetCaseId} options={[{ value: "", label: ru ? "Новое дело" : "Yangi ish" }, ...cases.map((item) => ({ value: item.id, label: item.title }))]} /></div>}
              {!planConfirmationOpen ? <footer><button type="button" disabled={!answer.messageId || sending || savingPlan} onClick={() => setPlanConfirmationOpen(true)}><ListPlus />{targetCaseId ? (ru ? "Создать в выбранном деле" : "Tanlangan ishda yaratish") : (ru ? "Создать план" : "Reja yaratish")}</button><button type="button" className="secondary" disabled={savingPlan} onClick={() => setPlanEditorOpen((current) => !current)}>{ru ? "Изменить" : "O‘zgartirish"}</button><button type="button" className="quiet" disabled={savingPlan} onClick={() => setDismissedPlanMessageId(answer.messageId || "")}>{ru ? "Не предлагать" : "Taklif qilmaslik"}</button></footer> : <div className="ai-plan-confirmation" ref={planConfirmationRef} tabIndex={-1} role="group" aria-label={ru ? "Подтверждение сохранения плана" : "Rejani saqlashni tasdiqlash"}>
                <p>{targetCaseId
                  ? (ru ? `Добавить задачи в дело «${cases.find((item) => item.id === targetCaseId)?.title ?? "Выбранное дело"}»?` : `Vazifalar “${cases.find((item) => item.id === targetCaseId)?.title ?? "Tanlangan ish"}” ishiga qo‘shilsinmi?`)
                  : (ru ? "Создать новое дело и задачи по этому плану?" : "Bu reja bo‘yicha yangi ish va vazifalar yaratiladimi?")}</p>
                <div><button type="button" className="secondary" disabled={savingPlan} onClick={() => setPlanConfirmationOpen(false)}>{ru ? "Отмена" : "Bekor qilish"}</button><button type="button" disabled={savingPlan} aria-busy={savingPlan} onClick={() => void savePlanToCase()}>{savingPlan ? <LoaderCircle className="spin" /> : <ListPlus />}{savingPlan ? (ru ? "Сохраняем…" : "Saqlanmoqda…") : (ru ? "Подтвердить и сохранить" : "Tasdiqlash va saqlash")}</button></div>
              </div>}
            </section>}
            <div className="ai-answer-actions">
              {answer.result.responseKind === "answer" && answer.result.suggestedDocument && <button type="button" disabled={!answer.messageId || sending || openingSuggestedDocument} onClick={() => void openSuggestedDocument()}><FilePlus2 />{openingSuggestedDocument ? (ru ? "Проверяем шаблон…" : "Shablon tekshirilmoqda…") : (ru ? "Открыть шаблон JURO" : "JURO shablonini ochish")}</button>}
              <button type="button" disabled={!answer.requestMessageId || sending} onClick={() => { if (answer.requestMessageId) { setVoiceRecordingId(""); setQuestion(answer.question || ""); setEditSourceMessageId(answer.requestMessageId); } }}><Pencil />{ru ? "Редактировать вопрос" : "Savolni tahrirlash"}</button>
              <button type="button" disabled={!answer.messageId || sending || !status?.configured} onClick={() => { if (answer.messageId) void submit(undefined, { operation: "regenerate", sourceMessageId: answer.messageId }); }}><RotateCcw />{ru ? "Повторить ответ" : "Javobni qayta yaratish"}</button>
              {answer.messageId && answer.result.responseKind === "answer" && <AssistantSpeechControls locale={locale} assistantMessageId={answer.messageId} disabled={sending} onPhaseChange={setVoiceSpeechPhase} />}
            </div>
            {documentPrefill && documentPrefillMessageId === answer.messageId && <section className="ai-document-prefill" aria-labelledby="ai-document-prefill-title" aria-busy={creatingSuggestedDocument}>
              <header><div><small>{ru ? "Проверка перед созданием" : "Yaratishdan oldin tekshirish"}</small><h2 id="ai-document-prefill-title">{documentPrefill.title}</h2><p>{documentPrefill.reason}</p></div><button type="button" aria-label={ru ? "Закрыть проверку заполнения" : "To‘ldirish tekshiruvini yopish"} disabled={creatingSuggestedDocument} onClick={() => { setDocumentPrefill(null); setDocumentPrefillMessageId(""); setSensitivePrefillConsent(false); documentHandoffKeyRef.current = ""; }}><X /></button></header>
              <p className="ai-document-prefill-note">{ru
                ? "JURO предлагает только данные из вашего профиля, workspace и сохранённого AI-ответа. Проверьте роль каждой стороны: можно исправить или удалить любое поле. Данные не помещаются в URL."
                : "JURO faqat profilingiz, workspace va saqlangan AI javobidagi ma’lumotlarni taklif qiladi. Har bir taraf rolini tekshiring: istalgan maydonni tuzatish yoki olib tashlash mumkin. Ma’lumotlar URLga joylanmaydi."}</p>
              {documentPrefill.candidates.length ? <div className="ai-document-prefill-fields">{documentPrefill.candidates.map((candidate) => <div className="ai-document-prefill-field" key={candidate.fieldId}>
                <label><span>{candidate.label}<em>{candidate.source === "profile" ? (ru ? "Профиль" : "Profil") : candidate.source === "workspace" ? "Workspace" : (ru ? "AI-ответ" : "AI javobi")}{candidate.sensitive ? ` · ${ru ? "проверьте конфиденциальные данные" : "maxfiy ma’lumotlarni tekshiring"}` : ""}</em></span>{candidate.value.length > 160 ? <textarea rows={4} value={candidate.value} disabled={creatingSuggestedDocument} onChange={(event) => setDocumentPrefill((current) => current ? { ...current, candidates: current.candidates.map((item) => item.fieldId === candidate.fieldId ? { ...item, value: event.target.value } : item) } : current)} /> : <input value={candidate.value} disabled={creatingSuggestedDocument} onChange={(event) => setDocumentPrefill((current) => current ? { ...current, candidates: current.candidates.map((item) => item.fieldId === candidate.fieldId ? { ...item, value: event.target.value } : item) } : current)} />}</label>
                <button type="button" disabled={creatingSuggestedDocument} onClick={() => setDocumentPrefill((current) => current ? { ...current, candidates: current.candidates.filter((item) => item.fieldId !== candidate.fieldId) } : current)}>{ru ? "Удалить" : "Olib tashlash"}</button>
              </div>)}</div> : <p role="status">{ru ? "Безопасных данных для автозаполнения не найдено. Можно создать пустой черновик и заполнить его вручную." : "Xavfsiz avtomatik to‘ldirish ma’lumotlari topilmadi. Bo‘sh qoralama yaratib, uni qo‘lda to‘ldirish mumkin."}</p>}
              {documentPrefill.candidates.some((candidate) => candidate.sensitive) && <label className="ai-document-sensitive-consent"><input type="checkbox" checked={sensitivePrefillConsent} disabled={creatingSuggestedDocument} onChange={(event) => setSensitivePrefillConsent(event.target.checked)} /><span>{ru ? "Я подтверждаю сохранение только выбранных конфиденциальных реквизитов в этом черновике." : "Faqat tanlangan maxfiy rekvizitlarni ushbu qoralamada saqlashni tasdiqlayman."}</span></label>}
              <footer><button type="button" className="secondary" disabled={creatingSuggestedDocument} onClick={() => { setDocumentPrefill(null); setDocumentPrefillMessageId(""); setSensitivePrefillConsent(false); documentHandoffKeyRef.current = ""; }}>{ru ? "Отмена" : "Bekor qilish"}</button><button type="button" disabled={creatingSuggestedDocument || (documentPrefill.candidates.some((candidate) => candidate.sensitive) && !sensitivePrefillConsent)} aria-busy={creatingSuggestedDocument} onClick={() => void confirmSuggestedDocument()}>{creatingSuggestedDocument ? <LoaderCircle className="spin" /> : <FilePlus2 />}{creatingSuggestedDocument ? (ru ? "Создаём черновик…" : "Qoralama yaratilmoqda…") : (ru ? "Подтвердить и создать черновик" : "Tasdiqlash va qoralama yaratish")}</button><span className="sr-only" role="status" aria-live="polite">{creatingSuggestedDocument ? (ru ? "JURO создаёт черновик документа" : "JURO hujjat qoralamasini yaratmoqda") : ""}</span></footer>
            </section>}
            {answer.messageId && <section className="ai-feedback" aria-labelledby="ai-feedback-heading">
              <div><h2 id="ai-feedback-heading">{ru ? "Оцените этот ответ" : "Bu javobni baholang"}</h2><p>{ru ? "Отзыв привязан к этому сохранённому ответу и помогает проверить качество источников." : "Fikr-mulohaza shu saqlangan javobga bog‘lanadi va manbalar sifatini tekshirishga yordam beradi."}</p></div>
              <div className="ai-feedback-actions">
                <button type="button" className={feedback.some((item) => item.feedbackType === "helpful") ? "selected" : undefined} disabled={savingFeedback} onClick={() => void saveFeedback("helpful")}><ThumbsUp />{feedback.some((item) => item.feedbackType === "helpful") ? (ru ? "Полезно — сохранено" : "Foydali — saqlandi") : feedbackLabel("helpful")}</button>
                <details>
                  <summary>{ru ? "Сообщить о проблеме" : "Muammo haqida xabar berish"}</summary>
                  <div className="ai-feedback-form">
                    <div className="ai-select-field"><span id="ai-feedback-type-label">{ru ? "Что не так" : "Nima noto‘g‘ri"}</span><AiSelect value={feedbackType} onChange={setFeedbackType} ariaLabelledBy="ai-feedback-type-label" options={feedbackOptions.map((item) => ({ value: item, label: feedbackLabel(item) }))} /></div>
                    <label>{ru ? "Комментарий — необязательно" : "Izoh — ixtiyoriy"}<textarea value={feedbackComment} maxLength={2_000} onChange={(event) => setFeedbackComment(event.target.value)} placeholder={ru ? "Не указывайте лишние персональные данные." : "Ortiqcha shaxsiy ma’lumotlarni kiritmang."} /></label>
                    <button type="button" disabled={savingFeedback} onClick={() => void saveFeedback(feedbackType, feedbackComment)}>{savingFeedback ? (ru ? "Сохраняем…" : "Saqlanmoqda…") : (ru ? "Сохранить отзыв" : "Fikrni saqlash")}</button>
                  </div>
                </details>
              </div>
              {feedbackStatus && <p className="ai-feedback-status" role="status">{feedbackStatus}</p>}
            </section>}
            {answer.branches && answer.branches.length > 1 && <nav className="ai-branch-history" aria-label={ru ? "Версии ответа" : "Javob versiyalari"}>
              <span><History />{ru ? "Версии" : "Versiyalar"}</span>
              <div>{answer.branches.map((branch) => <a aria-current={branch.branchId === answer.branchId ? "page" : undefined} key={branch.branchId} href={aiLocation(new URLSearchParams({ conversationId: answer.conversationId, branchId: branch.branchId }))}>{branch.versionNumber === 1 ? (ru ? "Исходный ответ" : "Asl javob") : `${ru ? "Версия" : "Versiya"} ${branch.versionNumber}`}</a>)}</div>
            </nav>}
            </>}
            {optimisticQuestion && <PendingConversationTurn question={optimisticQuestion} preliminary={preliminary} status={streamStatus} failed={Boolean(error) && !sending} ru={ru} />}
          </>}
        </div>
        <form className="ai-composer" onSubmit={submit}>
          {editSourceMessageId && <div className="ai-edit-notice" role="status"><span>{ru ? "Редактирование создаст новую версию; исходный ответ сохранится." : "Tahrirlash yangi versiya yaratadi; oldingi javob saqlanadi."}</span><button type="button" onClick={() => { setEditSourceMessageId(""); setQuestion(""); }}>{ru ? "Отменить" : "Bekor qilish"}</button></div>}
          <details className="ai-composer-options">
            <summary><Settings2 aria-hidden="true" /><span>{ru ? "Настройки ответа" : "Javob sozlamalari"}</span><small>{answerMode === "short" ? (ru ? "Кратко" : "Qisqa") : (ru ? "Подробно" : "Batafsil")} · {reasoningMode === "fast" ? (ru ? "Быстро" : "Tez") : (ru ? "Глубоко" : "Chuqur")}{legalContextDate ? ` · ${formatDate(legalContextDate, ru)}` : ""}</small></summary>
            <div className="ai-modes">
              <div className="ai-mode-field"><span id="ai-answer-mode-label">{ru ? "Формат ответа" : "Javob formati"}</span><div className="ai-segmented" role="group" aria-labelledby="ai-answer-mode-label"><button type="button" aria-pressed={answerMode === "short"} onClick={() => setAnswerMode("short")}>{ru ? "Кратко" : "Qisqa"}</button><button type="button" aria-pressed={answerMode === "detailed"} onClick={() => setAnswerMode("detailed")}>{ru ? "Подробно" : "Batafsil"}</button></div></div>
              <div className="ai-mode-field"><span id="ai-reasoning-mode-label">{ru ? "Глубина анализа" : "Tahlil chuqurligi"}</span><div className="ai-segmented" role="group" aria-labelledby="ai-reasoning-mode-label"><button type="button" aria-pressed={reasoningMode === "fast"} onClick={() => setReasoningMode("fast")}>{ru ? "Быстро" : "Tez"}</button><button type="button" aria-pressed={reasoningMode === "deep"} onClick={() => setReasoningMode("deep")}>{ru ? "Глубоко" : "Chuqur"}</button></div></div>
              <AiDatePicker ru={ru} value={legalContextDate} max={uzbekistanCalendarDate()} onChange={(value) => { pendingAiRequestRef.current = null; setCanRetry(false); setLegalContextDate(value); }} />
            </div>
          </details>
          <div className="ai-composer-input">
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
            <textarea ref={composerRef} id="ai-question" value={question} rows={1} onChange={(event) => { pendingAiRequestRef.current = null; setCanRetry(false); setQuestion(event.target.value); resizeComposer(event.currentTarget); }} onKeyDown={handleComposerKeyDown} disabled={!status?.configured || sending} placeholder={ru ? "Опишите ситуацию или задайте вопрос…" : "Vaziyatni yozing yoki savol bering…"} />
            {sending
              ? <button type="button" onClick={() => streamAbortRef.current?.abort()} aria-label={ru ? "Остановить генерацию" : "Javob yaratishni to‘xtatish"}><Square /></button>
              : <button disabled={!status?.configured || !question.trim()} aria-label={ru ? "Отправить" : "Yuborish"}><Send /></button>}
          </div>
          <small className="ai-composer-hint">{ru ? "Enter — отправить · Shift + Enter — новая строка · не указывайте лишние персональные данные" : "Enter — yuborish · Shift + Enter — yangi satr · ortiqcha shaxsiy ma’lumotlarni kiritmang"}</small>
        </form>
      </section>
      <nav className="ai-mobile-context-bar" aria-label={ru ? "Факты и источники ответа" : "Javob faktlari va manbalari"}><button type="button" onClick={() => { setMobileContextTab("facts"); setMobileContextOpen(true); }}><Check aria-hidden="true" />{ru ? `Факты ${answer?.facts.length ?? 0}` : `Faktlar ${answer?.facts.length ?? 0}`}</button><button type="button" onClick={() => { setMobileContextTab("sources"); setMobileContextOpen(true); }}><BookOpenCheck aria-hidden="true" />{ru ? `Источники ${visibleSources.length}` : `Manbalar ${visibleSources.length}`}</button></nav>
      <aside className={`ai-context ${mobileContextOpen ? "is-mobile-open" : ""}`} id="ai-context-panel" role={mobileContextOpen ? "dialog" : undefined} aria-modal={mobileContextOpen || undefined} aria-label={ru ? "Факты и источники" : "Faktlar va manbalar"}>
        <header><BookOpenCheck /><strong>{ru ? "Контекст ответа" : "Javob konteksti"}</strong><button className="ai-context-close" type="button" aria-label={ru ? "Закрыть факты и источники" : "Faktlar va manbalarni yopish"} onClick={() => setMobileContextOpen(false)}><X /></button></header>
        <div className="ai-context-tabs" role="tablist" aria-label={ru ? "Раздел контекста" : "Kontekst bo‘limi"}><button type="button" role="tab" aria-selected={mobileContextTab === "facts"} onClick={() => setMobileContextTab("facts")}>{ru ? "Факты" : "Faktlar"}</button><button type="button" role="tab" aria-selected={mobileContextTab === "sources"} onClick={() => setMobileContextTab("sources")}>{ru ? "Источники" : "Manbalar"}</button></div>
        <section hidden={mobileContextOpen && mobileContextTab !== "facts"}><h2>{ru ? "Факты для подтверждения" : "Tasdiqlash uchun faktlar"}</h2>{answer?.facts.length ? answer.facts.map((fact) => <div className={`ai-fact ${fact.status}`} key={fact.id}><p>{fact.statement}</p>{fact.status === "proposed" ? <span><button onClick={() => void updateFact(fact.id, "confirmed")} aria-label={ru ? "Подтвердить факт" : "Faktni tasdiqlash"}><Check /></button><button onClick={() => void updateFact(fact.id, "rejected")} aria-label={ru ? "Отклонить факт" : "Faktni rad etish"}><X /></button></span> : <small>{fact.status === "confirmed" ? (ru ? "Подтверждено" : "Tasdiqlandi") : (ru ? "Отклонено" : "Rad etildi")}</small>}</div>) : <p>{ru ? "Предположения появятся после разбора." : "Taxminlar tahlildan keyin paydo bo‘ladi."}</p>}</section>
        <section className="ai-evidence" hidden={mobileContextOpen && mobileContextTab !== "sources"}><h2>{hasPrivateSources || hasSecondarySources ? (ru ? "Источники" : "Manbalar") : (ru ? "Основания в Lex.uz" : "Lex.uz asoslari")}</h2>{answer?.result.coverageStatus && <p className={`ai-coverage ai-coverage-${answer.result.coverageStatus}`}>{coverageLabel(answer.result.coverageStatus, ru)}</p>}{visibleSources.length ? visibleSources.map((source) => <LegalSourceCard key={`${source.sourceId}:${source.article || "source"}`} source={source} messageId={answer?.messageId} retrievedAt={answer?.result.sourcesRetrievedAt} sourceAccessMode={answer?.result.sourceAccessMode} cases={cases} locale={locale} />) : <p>{ru ? "Подтверждённое основание Lex.uz не найдено; статья и ссылка не выдумываются." : "Tasdiqlangan Lex.uz asosi topilmadi; modda va havola o‘ylab topilmaydi."}</p>}</section>
      </aside>
    </section>
  );
}

function AiDatePicker({ ru, value, max, onChange }: { ru: boolean; value: string; max: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState((value || max).slice(0, 7));
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const locale = ru ? "ru" : "uz";
  const monthStart = `${visibleMonth}-01`;
  const firstWeekday = (new Date(`${monthStart}T12:00:00.000Z`).getUTCDay() + 6) % 7;
  const nextMonth = shiftCalendarMonth(visibleMonth, 1);
  const daysInMonth = Math.round((Date.parse(`${nextMonth}-01T12:00:00.000Z`) - Date.parse(`${monthStart}T12:00:00.000Z`)) / 86_400_000);
  const weekdays = ru ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] : ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const displayValue = value ? formatPlatformLongDate(value, locale) : (ru ? "Выберите дату" : "Sanani tanlang");
  const monthLabel = formatPlatformMonth(monthStart, locale);

  return <div className="ai-date-field">
    <span id="ai-legal-date-label">{ru ? "Дата события — если важна редакция закона" : "Voqea sanasi — qonun tahriri muhim bo‘lsa"}</span>
    <div className="ai-date-picker" ref={pickerRef}>
      <div className="ai-date-control">
        <button className="ai-date-trigger" type="button" aria-labelledby="ai-legal-date-label ai-legal-date-value" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setVisibleMonth((value || max).slice(0, 7)); setOpen((current) => !current); }}>
          <CalendarDays /><span id="ai-legal-date-value" className={value ? undefined : "is-placeholder"}>{displayValue}</span>
        </button>
        {value && <button className="ai-date-clear" type="button" aria-label={ru ? "Очистить дату события" : "Voqea sanasini tozalash"} onClick={() => onChange("")}><X /></button>}
      </div>
      {open && <div className="ai-date-popover" role="dialog" aria-label={ru ? "Выбор даты события" : "Voqea sanasini tanlash"}>
        <header>
          <button type="button" aria-label={ru ? "Предыдущий месяц" : "Oldingi oy"} onClick={() => setVisibleMonth((current) => shiftCalendarMonth(current, -1))}><ChevronLeft /></button>
          <strong aria-live="polite">{monthLabel}</strong>
          <button type="button" disabled={visibleMonth >= max.slice(0, 7)} aria-label={ru ? "Следующий месяц" : "Keyingi oy"} onClick={() => setVisibleMonth((current) => shiftCalendarMonth(current, 1))}><ChevronRight /></button>
        </header>
        <div className="ai-date-grid">
          {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <i key={`blank-${index}`} aria-hidden="true" />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = `${visibleMonth}-${String(index + 1).padStart(2, "0")}`;
            const disabled = day > max;
            const fullLabel = formatPlatformDate(day, locale, { dateStyle: "long" });
            return <button type="button" key={day} disabled={disabled} aria-label={fullLabel} aria-current={day === max ? "date" : undefined} aria-pressed={day === value} className={day === value ? "is-selected" : undefined} onClick={() => { onChange(day); setOpen(false); }}>{index + 1}</button>;
          })}
        </div>
        <footer><button type="button" onClick={() => { onChange(max); setOpen(false); }}>{ru ? "Сегодня" : "Bugun"}</button>{value && <button type="button" onClick={() => { onChange(""); setOpen(false); }}>{ru ? "Сбросить" : "Tozalash"}</button>}</footer>
      </div>}
    </div>
  </div>;
}

function shiftCalendarMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function HumanMessage({ question, ru }: { question: string; ru: boolean }) {
  if (!question) return null;
  return <article className="ai-human-message">
    <small>{ru ? "Вы" : "Siz"}</small>
    <p>{question}</p>
  </article>;
}

function ConversationTurnPair({ turn, ru, onCitationSelect }: { turn: ConversationTurn; ru: boolean; onCitationSelect?: (sourceId: string) => void }) {
  return <section className="ai-conversation-turn">
    <HumanMessage question={turn.question} ru={ru} />
    <LegalAnswer result={turn.result} freshness={turn.sourceFreshness} ru={ru} onCitationSelect={onCitationSelect} />
  </section>;
}

function PendingConversationTurn({
  question,
  preliminary,
  status,
  failed,
  ru,
}: {
  question: string;
  preliminary: AiPreliminary | null;
  status: string;
  failed: boolean;
  ru: boolean;
}) {
  return <section className="ai-conversation-turn ai-conversation-turn-pending">
    <HumanMessage question={question} ru={ru} />
    <article className={`ai-assistant-draft ${failed ? "is-failed" : ""}`}>
      <small>JURO · {failed
        ? (ru ? "ответ не завершён" : "javob yakunlanmadi")
        : preliminary
          ? (ru ? "проверенный вывод · завершаю ответ" : "tekshirilgan xulosa · javob yakunlanmoqda")
          : (ru ? "отвечает" : "javob bermoqda")}</small>
      {preliminary
        ? <div className="ai-preliminary" role="status">
          <strong>{preliminary.message}</strong>
          <p className="ai-preliminary-source">
            <span>{preliminary.source.title}{preliminary.source.article ? ` · ${preliminary.source.article}` : ""}</span>
            {safeOfficialUrl(preliminary.source.canonicalUrl)
              ? <a href={preliminary.source.canonicalUrl} target="_blank" rel="noreferrer">Lex.uz</a>
              : null}
          </p>
        </div>
        : <div className="ai-thinking"><LoaderCircle className={failed ? undefined : "spin"} /><span>{failed ? (ru ? "Не удалось завершить ответ. Можно безопасно повторить запрос." : "Javobni yakunlab bo‘lmadi. So‘rovni xavfsiz takrorlash mumkin.") : status || (ru ? "Проверяю факты и источники…" : "Faktlar va manbalarni tekshiryapman…")}</span></div>}
    </article>
  </section>;
}

function LegalSourceCard({
  source,
  messageId,
  retrievedAt,
  sourceAccessMode,
  cases,
  locale,
}: {
  source: Source;
  messageId?: string;
  retrievedAt?: string | null;
  sourceAccessMode?: LegalResult["sourceAccessMode"];
  cases: CaseOption[];
  locale: PlatformLocale;
}) {
  const ru = locale === "ru";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<ArticleDetails | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sourceDialogRef = useRef<HTMLElement | null>(null);
  const sourceReturnFocusRef = useRef<HTMLElement | null>(null);
  const privateSource = isTrustedPrivateSource(source);
  const secondarySource = isSafeSecondarySource(source);

  const closeSourceDialog = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => sourceReturnFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const ownKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSourceDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sourceDialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", ownKeyboard);
    return () => document.removeEventListener("keydown", ownKeyboard);
  }, [closeSourceDialog, open]);

  async function showArticle() {
    sourceReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
    setError("");
    if (details || !messageId) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ sourceUrl: source.originalUrl });
      if (source.article) query.set("article", source.article);
      const response = await fetch(`/api/platform/ai/citations/${encodeURIComponent(messageId)}?${query}`, {
        cache: "no-store",
      });
      const body = await response.json() as ArticleDetails & { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || body.code || "CITATION_UNAVAILABLE");
      setDetails(body);
    } catch {
      setError(privateSource
        ? (ru
          ? "Документ сейчас недоступен. Ниже остаётся фрагмент, проверенный при формировании ответа."
          : "Hujjat hozir mavjud emas. Quyida javob tuzilganda tekshirilgan parcha qoladi.")
        : (ru
          ? "Полный текст сейчас недоступен. Ниже остаётся проверенный фрагмент из ответа."
          : "To‘liq matn hozir mavjud emas. Quyida javobdagi tekshirilgan parcha qoladi."));
    } finally {
      setLoading(false);
    }
  }

  const display = details ?? {
    documentTitle: source.actTitle,
    documentType: source.documentType ?? null,
    documentNumber: source.documentNumber ?? source.actIdentifier ?? null,
    adoptingAuthority: source.adoptingAuthority ?? null,
    sourceClass: source.sourceClass ?? "OFFICIAL_LEGISLATION",
    articleNumber: source.article,
    articleTitle: null,
    part: null,
    chapter: null,
    section: null,
    text: source.excerpt ?? null,
    fullArticle: false,
    fullDocument: false,
    privateSource,
    truncated: false,
    language: source.language ?? locale,
    status: source.status,
    validFrom: source.effectiveDate,
    validTo: null,
    versionDate: source.effectiveDate,
    officialUrl: source.originalUrl,
    verifiedAt: retrievedAt ?? source.verifiedAt,
    availableLanguages: [],
    versionHistory: [],
  } satisfies ArticleDetails;

  const origin = source.sourceOrigin ?? (sourceAccessMode === "direct" ? "live" : "indexed");

  return <article className="ai-source-card" id={sourceCardDomId(source.sourceId)} tabIndex={-1}>
    <div className="ai-source-card-body">
      <strong>{source.actTitle}</strong>
      {source.article && <span>{source.article}</span>}
      {(source.documentType || source.documentNumber) && <small>{[source.documentType, source.documentNumber].filter(Boolean).join(" · ")}</small>}
      {source.adoptingAuthority && <small>{source.adoptingAuthority}</small>}
      {source.excerpt && <q>{source.excerpt}</q>}
      <em>{sourceStatusLabel(source.status, ru)}{source.effectiveDate ? ` · ${formatDate(source.effectiveDate, ru)}` : ""}</em>
      <small>{sourceClassLabel(source.sourceClass, ru)} · {languageLabel(source.language ?? (locale === "uz" ? "uz-Latn" : "ru"), ru)} · {privateSource ? (ru ? "защищённый индекс" : "himoyalangan indeks") : secondarySource ? (ru ? "открытый интернет" : "ochiq internet") : origin === "live" ? "live Lex.uz" : (ru ? "локальный индекс" : "lokal indeks")}</small>
      <small>{privateSource
        ? (ru ? "Доступ и целостность файла проверены для текущего пользователя" : "Faylga kirish va uning yaxlitligi joriy foydalanuvchi uchun tekshirildi")
        : secondarySource
          ? (ru ? "Справочный материал: не заменяет норму Lex.uz" : "Ma’lumotnoma materiali: Lex.uz normasini almashtirmaydi")
        : origin === "live"
          ? (ru ? "Проверено напрямую по Lex.uz" : "Lex.uz orqali bevosita tekshirildi")
          : (ru ? "Проверено по утверждённому пакету источников" : "Tasdiqlangan manbalar paketi bo‘yicha tekshirildi")}</small>
    </div>
    <div className="ai-source-actions">
      {!secondarySource && <button type="button" onClick={() => void showArticle()}><BookOpenCheck aria-hidden="true" />{privateSource ? (ru ? "Текст документа" : "Hujjat matni") : (ru ? "Текст статьи" : "Modda matni")}</button>}
      {!privateSource && <a href={source.originalUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{secondarySource ? (ru ? "Открыть материал" : "Materialni ochish") : (ru ? "Открыть Lex.uz" : "Lex.uz saytini ochish")}</a>}
    </div>
    {!privateSource && !secondarySource && <SourceBookmarkControl source={source} cases={cases} locale={locale} />}
    {open && <div className="ai-source-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSourceDialog(); }}>
      <section ref={sourceDialogRef} className="ai-source-modal" role="dialog" aria-modal="true" aria-labelledby="ai-source-modal-title">
        <header>
          <div><small>{privateSource ? "JURO · PRIVATE DOCUMENT" : "JURO · LEX.UZ"}</small><h2 id="ai-source-modal-title">{privateSource ? (ru ? "Документ пользователя" : "Foydalanuvchi hujjati") : display.fullArticle ? (ru ? "Полный текст статьи" : "Moddaning to‘liq matni") : (ru ? "Проверенный фрагмент" : "Tekshirilgan parcha")}</h2></div>
          <button ref={closeRef} type="button" aria-label={ru ? "Закрыть" : "Yopish"} onClick={closeSourceDialog}><X /></button>
        </header>
        {loading ? <div className="ai-source-modal-state" role="status"><LoaderCircle className="spin" />{ru ? "Загружаем проверенную редакцию…" : "Tekshirilgan tahrir yuklanmoqda…"}</div> : <>
          {error && <p className="ai-source-modal-warning" role="status">{error}</p>}
          {display.truncated && <p className="ai-source-modal-warning" role="status">{privateSource ? (ru ? "Очень длинный документ показан частично." : "Juda uzun hujjat qisman ko‘rsatildi.") : (ru ? "Очень длинная статья показана частично; полная редакция доступна по официальной ссылке." : "Juda uzun modda qisman ko‘rsatildi; to‘liq tahrir rasmiy havolada mavjud.")}</p>}
          <div className="ai-source-modal-heading">
            <strong>{display.documentTitle}</strong>
            {(display.articleNumber || display.articleTitle) && <span>{[display.articleNumber, display.articleTitle].filter(Boolean).join(" · ")}</span>}
            {[display.part, display.chapter, display.section].filter(Boolean).length > 0 && <small>{[display.part, display.chapter, display.section].filter(Boolean).join(" · ")}</small>}
          </div>
          <dl>
            {display.documentType && <div><dt>{ru ? "Тип документа" : "Hujjat turi"}</dt><dd>{display.documentType}</dd></div>}
            {display.documentNumber && <div><dt>{ru ? "Номер документа" : "Hujjat raqami"}</dt><dd>{display.documentNumber}</dd></div>}
            {display.adoptingAuthority && <div><dt>{ru ? "Принявший орган" : "Qabul qilgan organ"}</dt><dd>{display.adoptingAuthority}</dd></div>}
            <div><dt>{ru ? "Тип источника" : "Manba turi"}</dt><dd>{sourceClassLabel(display.sourceClass, ru)}</dd></div>
            <div><dt>{ru ? "Язык" : "Til"}</dt><dd>{display.language}</dd></div>
            <div><dt>{ru ? "Статус" : "Holat"}</dt><dd>{sourceStatusLabel(display.status, ru)}</dd></div>
            <div><dt>{privateSource ? (ru ? "Версия документа" : "Hujjat versiyasi") : (ru ? "Редакция" : "Tahrir")}</dt><dd>{display.versionDate ? formatDate(display.versionDate, ru) : "—"}</dd></div>
            {!privateSource && <div><dt>{ru ? "Действует" : "Amal qiladi"}</dt><dd>{display.validFrom ? formatDate(display.validFrom, ru) : "—"}{display.validTo ? ` — ${formatDate(display.validTo, ru)}` : ""}</dd></div>}
            <div><dt>{ru ? "Проверено" : "Tekshirildi"}</dt><dd>{formatDate(display.verifiedAt, ru)}</dd></div>
          </dl>
          {display.availableLanguages.length > 0 && <section className="ai-source-modal-related" aria-label={ru ? "Доступные языки" : "Mavjud tillar"}>
            <h3>{ru ? "Доступные языки" : "Mavjud tillar"}</h3>
            <div>{display.availableLanguages.map((variant) => <a key={`${variant.language}:${variant.officialUrl}`} href={variant.officialUrl} target="_blank" rel="noreferrer">{languageLabel(variant.language, ru)}{variant.official ? " · official" : ""}</a>)}</div>
          </section>}
          {display.versionHistory.length > 0 && <details className="ai-source-modal-history">
            <summary>{ru ? `История редакций (${display.versionHistory.length})` : `Tahrirlar tarixi (${display.versionHistory.length})`}</summary>
            <ol>{display.versionHistory.map((version) => <li key={`${version.versionNumber}:${version.fetchedAt}`}><strong>#{version.versionNumber}</strong><span>{version.versionDate ? formatDate(version.versionDate, ru) : formatDate(version.fetchedAt, ru)} · {sourceStatusLabel(version.status, ru)}{version.validFrom ? ` · ${formatDate(version.validFrom, ru)}` : ""}{version.validTo ? ` — ${formatDate(version.validTo, ru)}` : ""}</span></li>)}</ol>
          </details>}
          <div className="ai-source-modal-text">{display.text || (ru ? "Текст статьи не сохранён." : "Modda matni saqlanmagan.")}</div>
        </>}
        {!privateSource && <footer><a href={display.officialUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{ru ? "Официальный источник" : "Rasmiy manba"}</a></footer>}
      </section>
    </div>}
  </article>;
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
    <div className="ai-voice-stage-copy">
      <span><AudioLines aria-hidden="true" />{ru ? "Голосовой режим" : "Ovozli rejim"}</span>
      <h2 id="ai-voice-stage-title">{labels[state][ru ? 0 : 1]}</h2>
      <p>{ru
        ? "Микрофон включается только по вашему нажатию. Перед отправкой вы увидите и сможете исправить расшифровку."
        : "Mikrofon faqat siz bosganda yoqiladi. Yuborishdan oldin matnni ko‘rib, tahrirlashingiz mumkin."}</p>
      <small>{ru
        ? "Это AI-инструмент JURO, а не живой юрист."
        : "Bu JURO AI vositasi, tirik yurist emas."}</small>
    </div>
    <output role={state === "error" ? "alert" : "status"} aria-live="polite">{state}</output>
  </section>;
}

type AiStreamStatus = {
  stage?: "accepted" | "document_search_started" | "lex_search_started" | "internet_search_started" | "source_verified" | "provider_started" | "provider_delta" | "preliminary" | "fallback";
  provider?: string;
  model?: string;
  receivedCharacters?: number;
  preliminary?: AiPreliminary;
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

function sourceCardDomId(sourceId: string) {
  return `ai-source-${sourceId.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
}

function focusSourceCard(sourceId: string) {
  const card = document.getElementById(sourceCardDomId(sourceId));
  card?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  card?.focus({ preventScroll: true });
}

function LegalAnswer({
  result,
  freshness,
  ru,
  onQuestionSelect,
  onCitationSelect,
}: {
  result: LegalResult;
  freshness?: SourceFreshness;
  ru: boolean;
  onQuestionSelect?: (question: string) => void;
  onCitationSelect?: (sourceId: string) => void;
}) {
  return <div className="ai-answer-frame">
    {freshness && freshness.status !== "fresh" && result.sourceAccessMode !== "direct" && <div className={`ai-source-freshness ai-source-freshness-${freshness.status}`} role="status">
      <CircleAlert aria-hidden="true" />
      <p>{freshness.status === "unavailable"
        ? (ru
          ? "Проверенные официальные источники Lex.uz ещё не опубликованы полностью в индексе JURO. Пока JURO не показывает правовой вывод как подтверждённый."
          : "Lex.uz rasmiy manbalari JURO tasdiqlangan indeksida hali to‘liq nashr qilinmagan. Shu sabab JURO huquqiy xulosani tasdiqlangan deb ko‘rsatmaydi.")
        : (ru
          ? `Правовая база старше ${freshness.maxAgeDays} дней. Последняя подтверждённая полная синхронизация: ${formatDate(freshness.asOf, true)}.`
          : `Huquqiy baza ${freshness.maxAgeDays} kundan eski. Oxirgi tasdiqlangan to‘liq sinxronlash: ${formatDate(freshness.asOf, false)}.`)}</p>
    </div>}
    <LegalAnswerView
      result={result}
      locale={ru ? "ru" : "uz"}
      className="ai-answer"
      onQuestionSelect={onQuestionSelect}
      onCitationSelect={onCitationSelect}
    />
  </div>;
}

function formatDate(value: string, ru: boolean) {
  return formatPlatformDate(value, ru ? "ru" : "uz");
}

function coverageLabel(
  status: NonNullable<LegalResult["coverageStatus"]>,
  ru: boolean,
): string {
  if (status === "good_coverage") return ru ? "Покрытие: подтверждено" : "Qamrov: tasdiqlangan";
  if (status === "partial_coverage") return ru
    ? "Покрытие: частичное — ответ содержит только подтверждённую часть"
    : "Qamrov: qisman — javob faqat tasdiqlangan qismni o‘z ichiga oladi";
  if (status === "weak_coverage") return ru
    ? "Покрытие: слабое — ближайшая норма не выдается за точный ответ"
    : "Qamrov: zaif — yaqin norma aniq javob sifatida ko‘rsatilmaydi";
  return ru
    ? "Покрытие отсутствует — достаточная норма не найдена"
    : "Qamrov yo‘q — yetarli norma topilmadi";
}

function languageLabel(language: string, ru: boolean): string {
  if (language === "uz-Latn") return ru ? "Узбекский (латиница)" : "O‘zbekcha (lotin)";
  if (language === "uz-Cyrl") return ru ? "Узбекский (кириллица)" : "Ўзбекча (кирилл)";
  if (language === "en") return "English";
  return ru ? "Русский" : "Rus tili";
}

function sourceClassLabel(sourceClass: string | undefined, ru: boolean): string {
  if (sourceClass === "OFFICIAL_GOVERNMENT_GUIDANCE") return ru ? "Официальное разъяснение" : "Rasmiy tushuntirish";
  if (sourceClass === "OWNER_TRUSTED_GLOBAL") return ru ? "Материал JURO" : "JURO materiali";
  if (sourceClass === "TENANT_TRUSTED_PRIVATE") return ru ? "Материал организации" : "Tashkilot materiali";
  if (sourceClass === "USER_TRUSTED_PRIVATE") return ru ? "Личный документ" : "Shaxsiy hujjat";
  if (sourceClass === "DERIVED_TRANSLATION") return ru ? "Производный перевод" : "Hosila tarjima";
  if (sourceClass === "SECONDARY_REFERENCE") return ru ? "Вторичный источник" : "Ikkilamchi manba";
  return ru ? "Официальное законодательство" : "Rasmiy qonunchilik";
}

function sourceStatusLabel(status: string, ru: boolean): string {
  if (status === "user_supplied") return ru ? "Предоставлен пользователем" : "Foydalanuvchi taqdim etgan";
  if (status === "current" || status === "active") return ru ? "Действует" : "Amalda";
  if (status === "historical") return ru ? "Историческая редакция" : "Tarixiy tahrir";
  if (status === "repealed") return ru ? "Утратил силу" : "O‘z kuchini yo‘qotgan";
  if (status === "pending_effect") return ru ? "Ещё не вступил в силу" : "Hali kuchga kirmagan";
  return ru ? "Статус не подтверждён" : "Holat tasdiqlanmagan";
}

function isTrustedPrivateSource(source: Source): boolean {
  if (source.sourceClass !== "USER_TRUSTED_PRIVATE") return false;
  try {
    const url = new URL(source.originalUrl);
    return url.protocol === "juro-private:"
      && url.hostname === "document"
      && /^\/ud_[a-f0-9]{61}$/u.test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function isSafeSecondarySource(source: Source): boolean {
  return source.sourceClass === "SECONDARY_REFERENCE" && safeSecondaryUrl(source.originalUrl);
}

function safeSecondaryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase().replace(/\.$/u, "");
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && hostname.includes(".")
      && !/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(hostname)
      && !hostname.includes(":")
      && !["lex.uz", "www.lex.uz"].includes(hostname)
      && ![".internal", ".invalid", ".local", ".localhost", ".onion", ".test", ".example"].some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function safeOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.port === ""
      && url.username === ""
      && url.password === ""
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz");
  } catch {
    return false;
  }
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

function resizeComposer(textarea: HTMLTextAreaElement) {
  textarea.style.height = "0px";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
}
