"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, CheckCheck, FileCheck2, MessageSquareText, UserRoundCheck } from "lucide-react";
import type { ChatGPTUser } from "../../chatgpt-auth";
import type { NotificationRecord } from "../../../lib/document-builder/types";
import { builderNavigationPaths } from "../../../lib/platform/builder-paths";
import { BuilderHeader } from "../_components/BuilderHeader";
import { apiFetch } from "../_components/api-client";

export function NotificationsClient({ user, signInPath }: { user: ChatGPTUser; signInPath: string }) {
  const paths = builderNavigationPaths(usePathname());
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState("");
  const load = () => apiFetch<{ notifications: NotificationRecord[] }>("/api/document-builder/notifications").then((result) => setItems(result.notifications)).catch((caught: Error) => setError(caught.message));
  useEffect(() => { void load(); }, []);
  const mark = async (id?: string) => { await apiFetch("/api/document-builder/notifications", { method: "PATCH", body: JSON.stringify(id ? { id } : { all: true }) }); await load(); };
  const icon = (type: string) => type.includes("comment") ? MessageSquareText : type.includes("confirm") || type.includes("agreement") ? UserRoundCheck : FileCheck2;
  return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-simple-page"><header className="dbt-page-title"><div><span><Bell size={22}/></span><div><h1>Уведомления</h1><p>Только внутренние события JURO</p></div></div>{items.some((item) => !item.readAt) && <button type="button" onClick={() => void mark()}><CheckCheck size={18}/>Прочитать все</button>}</header>{error && <div className="dbt-global-error" role="alert">{error}</div>}{items.length ? <div className="dbt-notification-list">{items.map((item) => { const Icon = icon(item.type); return <article className={item.readAt ? "read" : "unread"} key={item.id} onClick={() => { if (!item.readAt) void mark(item.id); }}><span><Icon size={20}/></span><div><h2>{item.title}</h2><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString("ru-RU")}</small></div>{item.documentId && <a href={paths.document(item.documentId)}>Открыть документ</a>}</article>; })}</div> : <div className="dbt-empty-state"><Bell size={38}/><h2>Новых уведомлений нет</h2><p>Здесь появятся действия второй стороны по вашим документам.</p></div>}</div></div>;
}
