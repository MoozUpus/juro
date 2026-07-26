"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated audit data is hydrated after the first browser render */

import { CircleAlert, Filter, History, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type EventItem = { id: string; source: string; entityType: string; entityId: string | null; action: string; createdAt: string };

export function HistoryClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/history", { cache: "no-store" });
      const body = await response.json() as { events?: EventItem[]; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "История не загрузилась." : "Tarix yuklanmadi."));
      setEvents(body.events ?? []);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  }, [ru]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => filter === "all" ? events : events.filter(event => event.source === filter), [events, filter]);
  return <section className="history-workspace"><header><History /><div><small>JURO · AUDIT</small><h1>{ru ? "История действий" : "Harakatlar tarixi"}</h1><p>{ru ? "Хронология формируется из серверных событий, а не из декоративных записей интерфейса." : "Xronologiya interfeysdagi bezak yozuvlaridan emas, server voqealaridan tuziladi."}</p></div></header>{error && <p className="history-error"><CircleAlert />{error}</p>}<div className="history-filter"><Filter /><label><span className="sr-only">{ru ? "Фильтр истории" : "Tarix filtri"}</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{ru ? "Все события" : "Barcha voqealar"}</option><option value="workspace">{ru ? "Пространство" : "Makon"}</option><option value="document">{ru ? "Документы" : "Hujjatlar"}</option><option value="case">{ru ? "Дела" : "Ishlar"}</option></select></label></div>{loading ? <div className="history-loading"><LoaderCircle className="spin" /></div> : visible.length ? <ol className="history-list">{visible.map(event => <li key={`${event.source}-${event.id}`}><span>{sourceLabel(event.source, ru)}</span><div><strong>{actionLabel(event.action, ru)}</strong><small>{event.entityType}{event.entityId ? ` · ${event.entityId}` : ""}</small></div><time>{formatDateTime(event.createdAt, ru)}</time></li>)}</ol> : <div className="history-empty"><History /><h2>{ru ? "Событий пока нет" : "Hozircha voqealar yo‘q"}</h2></div>}</section>;
}

function sourceLabel(source: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { workspace: ["Пространство", "Makon"], document: ["Документ", "Hujjat"], case: ["Дело", "Ish"] };
  return labels[source]?.[ru ? 0 : 1] ?? source;
}
function actionLabel(action: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    workspace_created: ["Создано пространство", "Makon yaratildi"], onboarding_completed: ["Завершён onboarding", "Onboarding yakunlandi"],
    profile_updated: ["Обновлён профиль", "Profil yangilandi"], document_created: ["Создан документ", "Hujjat yaratildi"],
    document_archived: ["Документ архивирован", "Hujjat arxivlandi"], document_restored: ["Документ восстановлен", "Hujjat tiklandi"],
    case_created: ["Создано дело", "Ish yaratildi"], ai_intake_completed: ["Завершён AI-разбор", "AI tahlili yakunlandi"],
    invitation_sent: ["Отправлено приглашение", "Taklif yuborildi"], invitation_accepted: ["Приглашение принято", "Taklif qabul qilindi"],
  };
  return labels[action]?.[ru ? 0 : 1] ?? action.replaceAll("_", " ");
}
function formatDateTime(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
}
