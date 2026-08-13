"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addCalendarDays, monthStart, nextMonthStart, previousMonthStart, tashkentToday } from "../../lib/platform/calendar";
import { formatPlatformLongDate, formatPlatformMonth } from "../../lib/platform/date-time";
import { usePlatformBasePath } from "./PlatformRouteContext";

type View = "month" | "week" | "day" | "list" | "cases" | "overdue";
type CalendarItem = { planStepId: string; taskId: string | null; title: string; status: string; dueAt: string; safeDueAt: string | null; caseId: string; caseTitle: string; legalArea: string | null; source: "plan_step" | "task" };
type CalendarResponse = { from: string; to: string; serverToday: string; items: CalendarItem[] };

const labels = {
  ru: { title: "Календарь", subtitle: "Сроки из планов и подтверждённых задач текущего пространства.", month: "Месяц", week: "Неделя", day: "День", list: "Список", cases: "По делам", overdue: "Просрочено", previous: "Назад", next: "Вперёд", loading: "Загружаем сроки…", empty: "В этом периоде нет активных сроков.", overdueEmpty: "Просроченных сроков нет.", open: "Открыть план дела", task: "Задача", step: "Шаг плана", more: "ещё", weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] },
  uz: { title: "Kalendar", subtitle: "Joriy makondagi reja va tasdiqlangan vazifalardan muddatlar.", month: "Oy", week: "Hafta", day: "Kun", list: "Ro‘yxat", cases: "Ishlar bo‘yicha", overdue: "Kechikkan", previous: "Orqaga", next: "Keyingi", loading: "Muddatlar yuklanmoqda…", empty: "Bu davrda faol muddatlar yo‘q.", overdueEmpty: "Kechikkan muddatlar yo‘q.", open: "Ish rejasini ochish", task: "Vazifa", step: "Reja qadami", more: "yana", weekdays: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"] },
} as const;

function startOfWeek(value: string) {
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay() || 7;
  return addCalendarDays(value, 1 - weekday);
}
function displayDate(value: string, locale: "ru" | "uz") { return formatPlatformLongDate(value, locale); }
function monthLabel(value: string, locale: "ru" | "uz") { return formatPlatformMonth(value, locale); }

export function CalendarClient({ locale }: { locale: "ru" | "uz" }) {
  const t = labels[locale];
  const base = usePlatformBasePath();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => monthStart(tashkentToday()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState("");
  const range = useMemo(() => {
    if (view === "week") { const from = startOfWeek(anchor); return { from, to: addCalendarDays(from, 7) }; }
    if (view === "day") return { from: anchor, to: addCalendarDays(anchor, 1) };
    if (view === "list" || view === "cases" || view === "overdue") return { from: addCalendarDays(monthStart(anchor), -31), to: addCalendarDays(nextMonthStart(anchor), 92) };
    return { from: monthStart(anchor), to: nextMonthStart(anchor) };
  }, [anchor, view]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/platform/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json() as CalendarResponse & { error?: string }; if (!response.ok) throw new Error(body.error || "CALENDAR_UNAVAILABLE"); return body; })
      .then((body) => { setError(""); setData(body); }).catch((cause: unknown) => { if ((cause as Error).name !== "AbortError") setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [range.from, range.to]);
  const currentData = data?.from === range.from && data.to === range.to ? data : null;
  const items = view === "overdue" && currentData ? currentData.items.filter((item) => item.dueAt < currentData.serverToday) : currentData?.items ?? [];
  const shift = (direction: -1 | 1) => setAnchor((current) => {
    if (view === "week") return addCalendarDays(current, direction * 7);
    if (view === "day") return addCalendarDays(current, direction);
    return direction === 1 ? nextMonthStart(current) : previousMonthStart(current);
  });
  const byDate = new Map<string, CalendarItem[]>(); items.forEach((item) => byDate.set(item.dueAt, [...(byDate.get(item.dueAt) ?? []), item]));
  const byCase = new Map<string, CalendarItem[]>(); items.forEach((item) => byCase.set(item.caseId, [...(byCase.get(item.caseId) ?? []), item]));
  const firstWeekday = (new Date(`${monthStart(anchor)}T00:00:00.000Z`).getUTCDay() || 7) - 1;
  const daysInMonth = Math.round((Date.parse(`${nextMonthStart(anchor)}T00:00:00.000Z`) - Date.parse(`${monthStart(anchor)}T00:00:00.000Z`)) / 86_400_000);
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => addCalendarDays(monthStart(anchor), index));
  return <section className="calendar-page" aria-labelledby="calendar-title">
    <header className="calendar-header"><div><p className="calendar-eyebrow">JURO · {t.title}</p><h1 id="calendar-title">{t.title}</h1><p>{t.subtitle}</p></div><div className="calendar-range"><button type="button" onClick={() => shift(-1)} aria-label={t.previous}><ChevronLeft/></button><strong>{view === "week" ? `${displayDate(range.from, locale)} — ${displayDate(addCalendarDays(range.to, -1), locale)}` : view === "day" ? displayDate(anchor, locale) : monthLabel(anchor, locale)}</strong><button type="button" onClick={() => shift(1)} aria-label={t.next}><ChevronRight/></button></div></header>
    <div className="calendar-tabs" role="tablist" aria-label={t.title}>{(["month", "week", "day", "list", "cases", "overdue"] as View[]).map((name) => <button key={name} type="button" role="tab" aria-selected={view === name} onClick={() => setView(name)}>{t[name]}</button>)}</div>
    {error && !currentData ? <p className="calendar-error" role="alert"><CircleAlert/>{error}</p> : !currentData ? <p className="calendar-loading" aria-live="polite"><LoaderCircle/>{t.loading}</p> : items.length === 0 ? <div className="calendar-empty"><CalendarDays/><h2>{view === "overdue" ? t.overdueEmpty : t.empty}</h2></div> : view === "month" ? <div className="calendar-month" role="grid" aria-label={monthLabel(anchor, locale)}>{t.weekdays.map((day) => <span key={day} role="columnheader">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true"/>)}{monthDays.map((day) => { const dayItems = byDate.get(day) ?? []; return <div key={day} role="gridcell" className={day === currentData.serverToday ? "is-today" : undefined}><time dateTime={day}>{Number(day.slice(-2))}</time>{dayItems.slice(0, 3).map((item) => <CalendarLink key={item.planStepId} item={item} base={base} label={t.open}/>)}{dayItems.length > 3 && <button type="button" className="calendar-more" onClick={() => { setAnchor(day); setView("day"); }}>{`+${dayItems.length - 3} ${t.more}`}</button>}</div>; })}</div> : view === "cases" ? <div className="calendar-case-list">{Array.from(byCase.values()).map((caseItems) => <section key={caseItems[0].caseId}><h2>{caseItems[0].caseTitle}</h2>{caseItems.map((item) => <CalendarRow key={item.planStepId} item={item} base={base} label={t.open} locale={locale} task={t.task} step={t.step}/>)}</section>)}</div> : <div className="calendar-list">{Array.from(byDate.entries()).map(([date, dateItems]) => <section key={date}><h2><time dateTime={date}>{displayDate(date, locale)}</time></h2>{dateItems.map((item) => <CalendarRow key={item.planStepId} item={item} base={base} label={t.open} locale={locale} task={t.task} step={t.step}/>)}</section>)}</div>}
  </section>;
}

function CalendarLink({ item, base, label }: { item: CalendarItem; base: string; label: string }) { return <Link href={`${base}/action-plan/${encodeURIComponent(item.caseId)}`} aria-label={`${label}: ${item.title}`}><span>{item.title}</span></Link>; }
function CalendarRow({ item, base, label, locale, task, step }: { item: CalendarItem; base: string; label: string; locale: "ru" | "uz"; task: string; step: string }) { return <Link className="calendar-row" href={`${base}/action-plan/${encodeURIComponent(item.caseId)}`}><div><strong>{item.title}</strong><span>{item.caseTitle} · {item.source === "task" ? task : step}</span></div><time dateTime={item.dueAt}>{displayDate(item.dueAt, locale)}</time><span className={`calendar-status status-${item.status}`}>{item.status}</span><span className="sr-only">{label}</span></Link>; }
