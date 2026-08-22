"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCheck, FileCheck2, MessageSquareText, UserRoundCheck } from "lucide-react";
import type { ChatGPTUser } from "../../chatgpt-auth";
import type { NotificationRecord } from "../../../lib/document-builder/types";
import { builderNavigationPaths } from "../../../lib/platform/builder-paths";
import { workspaceCopy } from "../../../lib/platform/builder-workspace-copy";
import { BuilderHeader } from "../_components/BuilderHeader";
import { apiFetch } from "../_components/api-client";

function notificationHref(item: NotificationRecord, paths: ReturnType<typeof builderNavigationPaths>): string | null {
  if (item.documentId || item.targetType === "document") {
    const documentId = item.documentId || item.targetId;
    return documentId ? paths.document(documentId) : null;
  }
  if (!paths.locale || !item.targetType) return null;
  const base = paths.notifications.replace(/\/notifications$/, "");
  const id = item.targetId ? encodeURIComponent(item.targetId) : "";
  switch (item.targetType) {
    case "lawyer_request":
      return `${base}/consultations?view=requests${id ? `&requestId=${id}` : ""}`;
    case "lawyer_request_message":
      return `${base}/consultations?view=messages${id ? `&requestId=${id}` : ""}`;
    case "lawyer_consultation":
      return `${base}/consultations?view=schedule${id ? `&consultationId=${id}` : ""}`;
    case "lawyer_profile":
      return base.split("/")[2] === "lawyer" || !id
        ? `${base}/profile`
        : `${base}/lawyers/${id}`;
    case "lawyer_profile_deletion":
      return `${base}/profile`;
    case "admin_lawyer_profile_deletion":
      return `/${paths.locale}/admin/lawyer-profiles${id ? `?deletionRequest=${id}` : ""}`;
    case "billing":
      return `${base}/billing`;
    case "monitoring":
      return `${base}/monitoring`;
    case "case_task":
      return id ? `${base}/cases/${id}/plan` : `${base}/cases`;
    default:
      return null;
  }
}

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
  return <div className="dbt-root" aria-busy={loading || marking !== null}><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-simple-page"><header className="dbt-page-title"><div><span><Bell size={22}/></span><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div></div>{items.some((item) => !item.readAt) && <button type="button" onClick={() => void mark()} disabled={loading || marking !== null}><CheckCheck size={18}/>{copy.readAll}</button>}</header><p className="sr-only" aria-live="polite">{notice}</p>{error && <div className="dbt-global-error" role="alert">{error}<button type="button" onClick={() => void load()} disabled={loading}>{paths.locale === "uz" ? "Qayta urinish" : "Повторить"}</button></div>}{loading ? <div className="dbt-empty-state dbt-notifications-empty" role="status"><Bell size={38}/><h2>{paths.locale === "uz" ? "Bildirishnomalar yuklanmoqda…" : "Загружаем уведомления…"}</h2></div> : items.length ? <div className="dbt-notification-list">{items.map((item) => { const Icon = icon(item.type); const isMarking = marking === item.id; const href = notificationHref(item, paths); return <article className={item.readAt ? "read" : "unread"} key={item.id}><span><Icon size={20}/></span><div><h2>{item.title}</h2><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString(dateLocale)}</small></div>{href && <Link href={href}>{item.documentId || item.targetType === "document" ? copy.openDocument : (paths.locale === "uz" ? "Obyektni ochish" : "Открыть объект")}</Link>}{!item.readAt && <button type="button" onClick={() => void mark(item.id)} disabled={marking !== null}>{isMarking ? (paths.locale === "uz" ? "Saqlanmoqda…" : "Сохраняем…") : <><CheckCheck size={17}/>{copy.markRead}</>}</button>}</article>; })}</div> : <div className="dbt-empty-state dbt-notifications-empty"><Bell size={38}/><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><Link href={paths.documents}>{paths.locale === "uz" ? "Hujjatlarga o‘tish" : "Перейти к документам"}</Link></div>}</div></div>;
}
