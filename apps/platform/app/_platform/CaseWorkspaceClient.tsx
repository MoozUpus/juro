"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleAlert, FilePenLine, ListChecks, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Step = { id: string; title: string; status: string; dueAt?: string | null };
type CaseRecord = { id: string; title: string; description?: string | null; legalArea: string; status: string; nextDeadlineAt?: string | null; progressPercent?: number; steps?: Step[] };
type Task = { id: string; title: string; status: string; dueAt?: string | null; safeDueAt?: string | null };

function date(value: string | null | undefined, locale: PlatformLocale) {
  if (!value) return locale === "ru" ? "Не назначен" : "Belgilanmagan";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(`${value.slice(0, 10)}T12:00:00.000Z`));
}

export function CaseWorkspaceClient({ locale, caseId }: { locale: PlatformLocale; caseId: string }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [item, setItem] = useState<CaseRecord | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/platform/cases?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" }).then(async (response) => { const body = await response.json() as { cases?: CaseRecord[]; error?: string }; if (!response.ok) throw new Error(body.error || "CASE_UNAVAILABLE"); return body.cases?.[0] ?? null; }),
      fetch(`/api/platform/cases/${encodeURIComponent(caseId)}/tasks`, { cache: "no-store" }).then(async (response) => { const body = await response.json() as { tasks?: Task[]; error?: string }; if (!response.ok) throw new Error(body.error || "TASKS_UNAVAILABLE"); return body.tasks ?? []; }),
    ]).then(([record, caseTasks]) => { if (!cancelled) { setItem(record); setTasks(caseTasks); } })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [caseId]);
  if (loading) return <div className="case-workspace-loading" aria-live="polite"><LoaderCircle/>{ru ? "Загружаем дело…" : "Ish yuklanmoqda…"}</div>;
  if (error || !item) return <section className="case-workspace-empty"><CircleAlert/><h1>{ru ? "Дело недоступно" : "Ish mavjud emas"}</h1><p>{ru ? "Оно не найдено в текущем пространстве или доступ к нему изменён." : "U joriy makonda topilmadi yoki unga kirish o‘zgardi."}</p><Link href={`${base}/cases`}>{ru ? "К списку дел" : "Ishlar ro‘yxatiga"}</Link></section>;
  const complete = item.steps?.filter((step) => step.status === "completed").length ?? 0;
  return <section className="case-workspace" aria-labelledby="case-title">
    <header><div><p>JURO · {ru ? "Дело" : "Ish"}</p><h1 id="case-title">{item.title}</h1><span>{item.legalArea} · {item.status}</span>{item.description && <p className="case-workspace-description">{item.description}</p>}</div><div className="case-workspace-actions"><Link href={`${base}/action-plan/${encodeURIComponent(item.id)}`}><ListChecks/>{ru ? "План действий" : "Harakatlar rejasi"}</Link><Link href={`${base}/calendar`}><CalendarDays/>{ru ? "Календарь" : "Kalendar"}</Link></div></header>
    <div className="case-workspace-summary"><article><small>{ru ? "Прогресс плана" : "Reja jarayoni"}</small><strong>{item.progressPercent ?? 0}%</strong><span>{complete}/{item.steps?.length ?? 0} {ru ? "шагов завершено" : "qadam yakunlandi"}</span></article><article><small>{ru ? "Ближайший срок" : "Eng yaqin muddat"}</small><strong>{date(item.nextDeadlineAt, locale)}</strong><span>{ru ? "из активного плана" : "faol rejadan"}</span></article><article><small>{ru ? "Подтверждённые задачи" : "Tasdiqlangan vazifalar"}</small><strong>{tasks.length}</strong><span>{ru ? "реальные записи дела" : "ishning haqiqiy yozuvlari"}</span></article></div>
    <div className="case-workspace-grid"><section><div className="case-workspace-section-head"><div><FilePenLine/><h2>{ru ? "Следующие шаги" : "Keyingi qadamlar"}</h2></div><Link href={`${base}/action-plan/${encodeURIComponent(item.id)}`}>{ru ? "Открыть план" : "Rejani ochish"}</Link></div>{item.steps?.length ? <ol className="case-workspace-steps">{item.steps.slice(0, 5).map((step) => <li key={step.id}><CheckCircle2 className={step.status === "completed" ? "done" : undefined}/><div><strong>{step.title}</strong><span>{date(step.dueAt, locale)} · {step.status}</span></div></li>)}</ol> : <p className="case-workspace-muted">{ru ? "В плане пока нет шагов." : "Rejada hozircha qadam yo‘q."}</p>}</section><section><div className="case-workspace-section-head"><div><ListChecks/><h2>{ru ? "Задачи" : "Vazifalar"}</h2></div></div>{tasks.length ? <ul className="case-workspace-tasks">{tasks.slice(0, 6).map((task) => <li key={task.id}><div><strong>{task.title}</strong><span>{date(task.dueAt, locale)}</span></div><b>{task.status}</b></li>)}</ul> : <p className="case-workspace-muted">{ru ? "Подтвердите план, чтобы создать задачи и напоминания." : "Vazifalar va eslatmalar yaratish uchun rejani tasdiqlang."}</p>}</section></div>
  </section>;
}
