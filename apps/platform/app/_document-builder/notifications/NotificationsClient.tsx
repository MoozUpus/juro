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
import { builderError, builderIntlLocale, builderText, builderUiLocale } from "../builder-localization";

const EN_NOTIFICATION_COPY: Readonly<Record<string, { title: string; body: string }>> = {
  invitation: { title: "Document invitation", body: "You were invited to review a document." },
  invitation_opened: { title: "Invitation opened", body: "The invited participant opened the document." },
  comment_added: { title: "New comment", body: "A participant added a comment to the document." },
  change_proposed: { title: "Change proposed", body: "A participant proposed a document change." },
  change_confirmed: { title: "Change reviewed", body: "A participant reviewed the proposed change." },
  agreement_rejected: { title: "Change declined", body: "A participant declined the proposed change." },
  agreement_completed: { title: "Document details confirmed", body: "The other party confirmed the document details." },
  lawyer_document_requested: { title: "Document requested", body: "Your lawyer requested a document." },
  lawyer_document_provided: { title: "Document shared", body: "A client shared a requested document." },
  lawyer_task_created: { title: "New lawyer task", body: "Your lawyer added a task." },
  lawyer_task_completed: { title: "Lawyer task completed", body: "A lawyer task was marked as completed." },
};

function notificationPresentation(item: NotificationRecord, locale: string | null) {
  if (locale !== "en") return { title: item.title, body: item.body };
  const translated = EN_NOTIFICATION_COPY[item.type];
  if (translated) return translated;
  const containsLegacyCopy = /[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(`${item.title} ${item.body}`);
  return containsLegacyCopy
    ? { title: "Workspace update", body: "Open the related item to view the latest activity." }
    : { title: item.title, body: item.body };
}

export function NotificationsClient({ user, signInPath }: { user: ChatGPTUser; signInPath: string }) {
  const paths = builderNavigationPaths(usePathname());
  const locale = builderUiLocale(paths.locale);
  const copy = workspaceCopy(locale).notifications;
  const inline = <T,>(ru: T, uz: T, en: T) => builderText(locale, { ru, uz, en });
  const loadError = inline("Не удалось загрузить уведомления.", "Bildirishnomalarni yuklab bo‘lmadi.", "We could not load your notifications.");
  const dateLocale = builderIntlLocale(locale);
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
      setError(builderError(locale, caught, loadError));
    } finally {
      setLoading(false);
    }
  // Locale changes remount this canonical route; notification reload identity stays stable for actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setNotice(inline("Уведомление обновлено.", "Bildirishnoma yangilandi.", "Notification updated."));
      await load();
    } catch (caught) {
      setError(builderError(locale, caught, inline("Не удалось обновить уведомление.", "Bildirishnomani yangilab bo‘lmadi.", "We could not update the notification.")));
    } finally {
      setMarking(null);
    }
  };
  const icon = (type: string) => type.includes("comment") ? MessageSquareText : type.includes("confirm") || type.includes("agreement") ? UserRoundCheck : FileCheck2;
  return <div className="dbt-root" aria-busy={loading || marking !== null}><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-simple-page"><header className="dbt-page-title"><div><span><Bell size={22}/></span><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div></div>{items.some((item) => !item.readAt) && <button type="button" onClick={() => void mark()} disabled={loading || marking !== null}><CheckCheck size={18}/>{copy.readAll}</button>}</header><p className="sr-only" aria-live="polite">{notice}</p>{error && <div className="dbt-global-error" role="alert">{error}<button type="button" onClick={() => void load()} disabled={loading}>{inline("Повторить", "Qayta urinish", "Try again")}</button></div>}{loading ? <div className="dbt-empty-state dbt-notifications-empty" role="status"><Bell size={38}/><h2>{inline("Загружаем уведомления…", "Bildirishnomalar yuklanmoqda…", "Loading notifications…")}</h2></div> : items.length ? <div className="dbt-notification-list">{items.map((item) => { const Icon = icon(item.type); const isMarking = marking === item.id; const presentation = notificationPresentation(item, locale); return <article className={item.readAt ? "read" : "unread"} key={item.id}><span><Icon size={20}/></span><div><h2>{presentation.title}</h2><p>{presentation.body}</p><small>{new Date(item.createdAt).toLocaleString(dateLocale)}</small></div>{item.documentId && <a href={paths.document(item.documentId)}>{copy.openDocument}</a>}{!item.readAt && <button type="button" onClick={() => void mark(item.id)} disabled={marking !== null}>{isMarking ? inline("Сохраняем…", "Saqlanmoqda…", "Saving…") : <><CheckCheck size={17}/>{copy.markRead}</>}</button>}</article>; })}</div> : <div className="dbt-empty-state dbt-notifications-empty"><Bell size={38}/><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><Link href={paths.documents}>{inline("Перейти к документам", "Hujjatlarga o‘tish", "Go to documents")}</Link></div>}</div></div>;
}
