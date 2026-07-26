"use client";

/* eslint-disable react-hooks/set-state-in-effect -- private dashboard data is loaded after authentication */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  FileDiff,
  FilePenLine,
  Files,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { dashboardCopy } from "../../content/platform-ui";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

type DashboardData = {
  serverNow: string;
  counts: {
    activeCases: number;
    documents: number;
    consultations: number;
    unreadNotifications: number;
  };
  cases: Array<{ id: string; title: string; status: string; updatedAt: string; progressPercent: number | null }>;
  documents: Array<{ id: string; title: string; status: string; category: string; updatedAt: string }>;
  deadlines: Array<{ id: string; title: string; dueAt: string; caseId: string; caseTitle: string }>;
  notifications: Array<{ id: string; title: string; body: string; createdAt: string }>;
  analyses: Array<{ id: string; status: string; errorCode: string | null; fileName: string; updatedAt: string }>;
  comparisons: Array<{
    id: string;
    status: string;
    stage: string;
    errorCode: string | null;
    versionOneName: string;
    versionTwoName: string;
    updatedAt: string;
  }>;
};

type DashboardProps = {
  locale: PlatformLocale;
  accountType: AccountType;
  userName: string;
};

export function DashboardClient({ locale, accountType, userName }: DashboardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copy = dashboardCopy(locale);
  const ru = locale === "ru";
  const base = `/${locale}/${accountType}`;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/platform/dashboard", { cache: "no-store" });
      const body = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(body.error || copy.loadError);
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [copy.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startTask(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() && !file) return;
    if (file) {
      if (!consent) return;
      setSubmitting(true);
      setError("");
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("consent", "true");
        form.set("locale", locale);
        const response = await fetch("/api/platform/document-review", {
          method: "POST",
          headers: { "x-juro-csrf": "1" },
          body: form,
        });
        const body = await response.json() as { analysis?: { id: string }; error?: string };
        if (!response.ok && response.status !== 202) throw new Error(body.error || copy.uploadError);
        const search = body.analysis?.id ? `?analysis=${encodeURIComponent(body.analysis.id)}` : "";
        router.push(`${base}/document-review${search}`);
      } catch (value) {
        setError(value instanceof Error ? value.message : String(value));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    router.push(`${base}/ai-chat?prompt=${encodeURIComponent(prompt.trim())}`);
  }

  function chooseFile(next: File | null) {
    if (next && next.size > 10 * 1024 * 1024) {
      setError(copy.fileTooLarge);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(next);
    setConsent(false);
    setError("");
  }

  const quickActions = [
    { href: `${base}/ai-chat`, icon: Bot, copy: copy.actions.ask },
    { href: `${base}/document-review`, icon: ShieldCheck, copy: copy.actions.review },
    { href: `${base}/document-review?mode=compare`, icon: FileDiff, copy: copy.actions.compare },
    { href: `${base}/document-builder`, icon: FilePenLine, copy: copy.actions.create },
    { href: `${base}/action-plan`, icon: CalendarClock, copy: copy.actions.plan },
    { href: `${base}/consultations`, icon: MessageSquareText, copy: copy.actions.lawyer },
  ];
  const attention = data ? [
    ...data.comparisons
      .filter((item) => !["completed", "completed_partial"].includes(item.status))
      .map((item) => ({
        id: `comparison-${item.id}`,
        href: `${base}/documents/comparisons/${item.id}`,
        icon: FileDiff,
        title: `${item.versionOneName} ↔ ${item.versionTwoName}`,
        detail: item.status === "failed"
          ? (ru ? "Сравнение остановлено — можно повторить этап" : "Taqqoslash to‘xtadi — bosqichni takrorlash mumkin")
          : (ru ? "Сравнение обрабатывается" : "Taqqoslash qayta ishlanmoqda"),
        time: item.updatedAt,
        importance: item.status === "failed" ? "high" : "medium",
      })),
    ...data.analyses
      .filter((item) => item.status !== "completed")
      .map((item) => ({
        id: `analysis-${item.id}`,
        href: `${base}/document-review?analysis=${encodeURIComponent(item.id)}`,
        icon: Upload,
        title: item.fileName,
        detail: item.status === "awaiting_ai_configuration"
          ? (ru ? "Файл сохранён; AI-анализ ожидает подключения" : "Fayl saqlandi; AI-tahlil ulanishni kutmoqda")
          : (ru ? "Анализ документа не завершён" : "Hujjat tahlili yakunlanmagan"),
        time: item.updatedAt,
        importance: item.errorCode ? "high" : "medium",
      })),
    ...data.deadlines.map((item) => ({
      id: `deadline-${item.id}`,
      href: `${base}/action-plan/${item.caseId}`,
      icon: CalendarClock,
      title: item.title,
      detail: item.caseTitle,
      time: item.dueAt,
      importance: new Date(item.dueAt).getTime() < new Date(data.serverNow).getTime() + 3 * 86_400_000 ? "high" : "medium",
    })),
    ...data.notifications.slice(0, 3).map((item) => ({
      id: `notification-${item.id}`,
      href: `${base}/notifications`,
      icon: Bell,
      title: item.title,
      detail: item.body,
      time: item.createdAt,
      importance: "low",
    })),
  ].slice(0, 7) : [];
  const recent = data ? [
    ...data.cases.map((item) => ({
      id: `case-${item.id}`,
      href: `${base}/cases/${item.id}`,
      icon: BriefcaseBusiness,
      title: item.title,
      detail: `${item.status} · ${item.progressPercent ?? 0}%`,
      time: item.updatedAt,
    })),
    ...data.documents.map((item) => ({
      id: `document-${item.id}`,
      href: `${base}/documents/${item.id}`,
      icon: Files,
      title: item.title,
      detail: `${item.category} · ${item.status}`,
      time: item.updatedAt,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 7) : [];

  return (
    <div className="dashboard-command">
      <section className="dashboard-command-hero">
        <div className="dashboard-command-intro">
          <div className="dashboard-command-context">
            {accountType === "business" ? <BriefcaseBusiness /> : <ShieldCheck />}
            <span>{accountType === "business" ? copy.contextBusiness : copy.contextPersonal}</span>
          </div>
          <p>{copy.greeting}, {userName}</p>
          <h1>{copy.question}</h1>
          <form className="dashboard-command-form" onSubmit={startTask}>
            <label className="sr-only" htmlFor="dashboard-legal-task">{copy.prompt}</label>
            <Sparkles aria-hidden="true" />
            <textarea
              id="dashboard-legal-task"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy.prompt}
              rows={2}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              hidden
            />
            <button
              type="button"
              className="dashboard-attach"
              onClick={() => fileInputRef.current?.click()}
              aria-label={copy.attach}
            >
              <Paperclip />
            </button>
            <button className="dashboard-start" disabled={submitting || (!prompt.trim() && !file) || Boolean(file && !consent)}>
              {submitting ? <LoaderCircle className="spin" /> : <Send />}
              <span>{copy.send}</span>
            </button>
            {file && (
              <div className="dashboard-file-chip">
                <Files />
                <span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span>
                <button type="button" onClick={() => chooseFile(null)} aria-label={copy.removeFile}><X /></button>
              </div>
            )}
            {file && (
              <label className="dashboard-upload-consent">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{copy.consent}</span>
              </label>
            )}
          </form>
        </div>
        <GoldenRoute locale={locale} label={copy.journeyLabel} steps={copy.journeySteps} />
      </section>

      {error && (
        <div className="dashboard-command-error" role="alert">
          <CircleAlert />
          <span>{error}</span>
          <button onClick={() => { setLoading(true); void load(); }}>{ru ? "Повторить" : "Qayta urinish"}</button>
        </div>
      )}

      <section className="dashboard-quick">
        <div className="dashboard-section-heading"><h2>{copy.quickTitle}</h2></div>
        <div className="dashboard-quick-grid">
          {quickActions.map(({ href, icon: Icon, copy: item }) => (
            <Link href={href} key={href}>
              <span className="dashboard-action-icon"><Icon /></span>
              <span><strong>{item.title}</strong><small>{item.description}</small></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-continuation">
        <div className="dashboard-section-heading">
          <h2>{copy.continueTitle}</h2>
          <button onClick={() => { setLoading(true); void load(); }} aria-label={copy.refresh}>
            <RotateCcw className={loading ? "spin" : ""} />
          </button>
        </div>
        {loading && !data ? (
          <div className="dashboard-command-loading" role="status"><LoaderCircle className="spin" /><span>{ru ? "Загружаем рабочий контекст" : "Ish konteksti yuklanmoqda"}</span></div>
        ) : (
          <div className="dashboard-continuation-grid">
            <section className="dashboard-work-list">
              <header><span><CircleAlert /></span><div><h3>{copy.attentionTitle}</h3><p>{ru ? "Сроки, незавершённая обработка и новые события" : "Muddatlar, tugallanmagan qayta ishlash va yangi voqealar"}</p></div></header>
              {attention.length ? attention.map((item) => (
                <Link href={item.href} key={item.id} data-importance={item.importance}>
                  <item.icon />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <time>{formatDateTime(item.time, ru)}</time>
                  <ArrowRight />
                </Link>
              )) : <DashboardEmpty text={copy.emptyAttention} />}
            </section>
            <section className="dashboard-work-list">
              <header><span><Files /></span><div><h3>{copy.recentTitle}</h3><p>{ru ? "Дела и документы, изменённые последними" : "Oxirgi o‘zgartirilgan ish va hujjatlar"}</p></div></header>
              {recent.length ? recent.map((item) => (
                <Link href={item.href} key={item.id}>
                  <item.icon />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <time>{formatDateTime(item.time, ru)}</time>
                  <ArrowRight />
                </Link>
              )) : <DashboardEmpty text={copy.emptyRecent} />}
            </section>
          </div>
        )}
      </section>

      {data && (
        <section className="dashboard-context-summary" aria-label={ru ? "Сводка пространства" : "Makon xulosasi"}>
          <span><BriefcaseBusiness /><b>{data.counts.activeCases}</b>{ru ? "активных дел" : "faol ish"}</span>
          <span><Files /><b>{data.counts.documents}</b>{ru ? "документов" : "hujjat"}</span>
          <span><MessageSquareText /><b>{data.counts.consultations}</b>{ru ? "консультаций" : "maslahat"}</span>
          <span><Bell /><b>{data.counts.unreadNotifications}</b>{ru ? "новых событий" : "yangi voqea"}</span>
        </section>
      )}
    </div>
  );
}

function GoldenRoute({ locale, label, steps }: { locale: PlatformLocale; label: string; steps: readonly string[] }) {
  const [motionState, setMotionState] = useState<"pending" | "animate" | "static">("pending");
  useEffect(() => {
    const key = "juro-golden-route-seen";
    if (sessionStorage.getItem(key)) {
      setMotionState("static");
      return;
    }
    sessionStorage.setItem(key, "1");
    setMotionState("animate");
  }, []);
  return (
    <div className="golden-route" aria-label={label}>
      <div className="golden-route-heading">
        <span>JURO</span>
        <p>{locale === "ru" ? "От проблемы к обоснованному действию" : "Muammodan asoslangan harakatgacha"}</p>
      </div>
      <div className={`golden-route-track ${motionState}`}>
        <svg viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true">
          <path className="golden-route-base" d="M42 40 H558" />
          <path className="golden-route-progress" d="M42 40 H558" pathLength="1" />
        </svg>
        {steps.map((step, index) => (
          <div className="golden-route-step" key={step}>
            <span>{index === steps.length - 1 ? <CheckCircle2 /> : index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
      <p className="golden-route-note">
        {locale === "ru"
          ? "Источники и уровень уверенности остаются видимыми на каждом этапе."
          : "Manbalar va ishonch darajasi har bir bosqichda ko‘rinib turadi."}
      </p>
    </div>
  );
}

function DashboardEmpty({ text }: { text: string }) {
  return <div className="dashboard-list-empty"><CheckCircle2 /><p>{text}</p></div>;
}

function formatDateTime(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}
