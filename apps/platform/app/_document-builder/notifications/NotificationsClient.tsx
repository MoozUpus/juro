"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, CheckCheck, FileCheck2, MessageSquareText, UserRoundCheck } from "lucide-react";
import type { ChatGPTUser } from "../../chatgpt-auth";
import type { NotificationRecord } from "../../../lib/document-builder/types";
import { builderNavigationPaths } from "../../../lib/platform/builder-paths";
import { workspaceCopy } from "../../../lib/platform/builder-workspace-copy";
import { BuilderHeader } from "../_components/BuilderHeader";
import { apiFetch } from "../_components/api-client";

export function NotificationsClient({ user, signInPath }: { user: ChatGPTUser; signInPath: string }) {
  const paths = builderNavigationPaths(usePathname());
  const copy = workspaceCopy(paths.locale).notifications;
  const dateLocale = paths.locale === "uz" ? "uz-UZ" : "ru-RU";
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | "all" | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ notifications: NotificationRecord[] }>("/api/document-builder/notifications");
      setItems(result.notifications);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить уведомления.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const mark = async (id?: string) => {
    const target = id ?? "all";
    setMarking(target);
    try {
      await apiFetch("/api/document-builder/notifications", { method: "PATCH", body: JSON.stringify(id ? { id } : { all: true }) });
      setNotice(paths.locale === "uz" ? "Bildirishnoma yangilandi." : "Уведомление обновлено.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить уведомление.");
    } finally {
      setMarking(null);
    }
  };
  const icon = (type: string) => type.includes("comment") ? MessageSquareText : type.includes("confirm") || type.includes("agreement") ? UserRoundCheck : FileCheck2;
  return <div className="dbt-root" aria-busy={loading || marking !== null}><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-simple-page"><header className="dbt-page-title"><div><span><Bell size={22}/></span><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div></div>{items.some((item) => !item.readAt) && <button type="button" onClick={() => void mark()} disabled={loading || marking !== null}><CheckCheck size={18}/>{copy.readAll}</button>}</header><p className="sr-only" aria-live="polite">{notice}</p>{error && <div className="dbt-global-error" role="alert">{error}<button type="button" onClick={() => void load()} disabled={loading}>{paths.locale === "uz" ? "Qayta urinish" : "Повторить"}</button></div>}{loading ? <div className="dbt-empty-state" role="status"><Bell size={38}/><h2>{paths.locale === "uz" ? "Bildirishnomalar yuklanmoqda…" : "Загружаем уведомления…"}</h2></div> : items.length ? <div className="dbt-notification-list">{items.map((item) => { const Icon = icon(item.type); const isMarking = marking === item.id; return <article className={item.readAt ? "read" : "unread"} key={item.id}><span><Icon size={20}/></span><div><h2>{item.title}</h2><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString(dateLocale)}</small></div>{item.documentId && <a href={paths.document(item.documentId)}>{copy.openDocument}</a>}{!item.readAt && <button type="button" onClick={() => void mark(item.id)} disabled={marking !== null}>{isMarking ? (paths.locale === "uz" ? "Saqlanmoqda…" : "Сохраняем…") : <><CheckCheck size={17}/>{copy.markRead}</>}</button>}</article>; })}</div> : <div className="dbt-empty-state"><Bell size={38}/><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p></div>}</div></div>;
}
