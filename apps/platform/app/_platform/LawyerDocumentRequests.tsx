"use client";

/* eslint-disable react-hooks/set-state-in-effect -- request records are loaded from the authenticated handoff API */

import Link from "next/link";
import { FileCheck2, FileQuestion, LoaderCircle, Send, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type DocumentRequest = {
  id: string;
  title: string;
  description: string;
  status: "requested" | "provided" | "cancelled";
  providedDocumentId: string | null;
  providedDocumentTitle: string | null;
  createdAt: string;
};

type DocumentOption = { id: string; title: string; status: string; updatedAt: string };

export function LawyerDocumentRequests({
  requestId,
  locale,
  role,
}: {
  requestId: string;
  locale: PlatformLocale;
  role: "client" | "lawyer";
}) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/platform/lawyer-document-requests?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
    const body = await response.json() as { requests?: DocumentRequest[]; documents?: DocumentOption[]; error?: string };
    if (!response.ok) throw new Error(body.error || "DOCUMENT_REQUESTS_UNAVAILABLE");
    setRequests(body.requests ?? []);
    setDocuments(body.documents ?? []);
  }, [requestId]);

  useEffect(() => {
    void load().catch((value) => setError(value instanceof Error ? value.message : String(value))).finally(() => setLoading(false));
  }, [load]);

  async function mutate(payload: Record<string, unknown>, actionId: string) {
    setBusyId(actionId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/lawyer-document-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId, locale, ...payload }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "DOCUMENT_REQUEST_ACTION_FAILED");
      setNotice(role === "lawyer"
        ? (ru ? "Запрос документов обновлён." : "Hujjat so‘rovi yangilandi.")
        : (ru ? "Документ предоставлен юристу." : "Hujjat yuristga taqdim etildi."));
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await mutate({ action: "request", title, description }, "new");
      setTitle("");
      setDescription("");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  }

  return <section className="lawyer-document-requests" aria-label={ru ? "Запросы документов" : "Hujjat so‘rovlari"}>
    <header><FileQuestion aria-hidden="true" /><div><strong>{ru ? "Документы по заявке" : "So‘rov hujjatlari"}</strong><small>{ru ? "Запрос и передача фиксируются в журнале дела" : "So‘rov va taqdim etish ish jurnalida qayd etiladi"}</small></div></header>
    {error && <p className="lawyer-inline-error" role="alert">{error}</p>}
    {notice && <p className="lawyer-inline-notice" role="status">{notice}</p>}
    {role === "lawyer" && <form className="lawyer-document-request-form" onSubmit={(event) => void create(event)}>
      <label>{ru ? "Что требуется" : "Nima kerak"}<input required minLength={2} maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>{ru ? "Пояснение клиенту" : "Mijoz uchun izoh"}<textarea required minLength={4} maxLength={2_000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <button type="submit" disabled={busyId === "new" || title.trim().length < 2 || description.trim().length < 4}>{busyId === "new" ? <LoaderCircle className="spin" /> : <Send />}{ru ? "Запросить документ" : "Hujjatni so‘rash"}</button>
    </form>}
    {loading ? <div className="lawyer-inline-loading"><LoaderCircle className="spin" /></div> : <div className="lawyer-document-request-list">
      {requests.map((item) => <article key={item.id} data-status={item.status}>
        <FileCheck2 aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.description}</p><small>{documentRequestStatus(item.status, ru)} · {new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(item.createdAt))}</small></div>
        {item.providedDocumentId && <Link href={`${base}/documents/${encodeURIComponent(item.providedDocumentId)}`}>{item.providedDocumentTitle || (ru ? "Открыть документ" : "Hujjatni ochish")}</Link>}
        {role === "client" && item.status === "requested" && <div className="lawyer-document-provide"><select aria-label={ru ? "Выберите документ" : "Hujjatni tanlang"} value={selection[item.id] || ""} onChange={(event) => setSelection((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">{documents.length ? (ru ? "Выберите документ дела" : "Ish hujjatini tanlang") : (ru ? "В деле пока нет документов" : "Ishda hujjat yo‘q")}</option>{documents.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}</select><button type="button" disabled={!selection[item.id] || busyId === item.id} onClick={() => void mutate({ action: "provide", documentRequestId: item.id, documentId: selection[item.id] }, item.id).catch((value) => setError(value instanceof Error ? value.message : String(value)))}>{busyId === item.id ? <LoaderCircle className="spin" /> : <FileCheck2 />}{ru ? "Предоставить" : "Taqdim etish"}</button></div>}
        {role === "lawyer" && item.status === "requested" && <button className="lawyer-document-request-cancel" type="button" disabled={busyId === item.id} onClick={() => void mutate({ action: "cancel", documentRequestId: item.id }, item.id).catch((value) => setError(value instanceof Error ? value.message : String(value)))}><X />{ru ? "Отменить" : "Bekor qilish"}</button>}
      </article>)}
      {!requests.length && <p className="lawyer-inline-empty">{ru ? "Запросов документов пока нет." : "Hujjat so‘rovlari hozircha yo‘q."}</p>}
    </div>}
  </section>;
}

function documentRequestStatus(status: DocumentRequest["status"], ru: boolean) {
  const labels: Record<DocumentRequest["status"], [string, string]> = {
    requested: ["Ожидается документ", "Hujjat kutilmoqda"],
    provided: ["Документ предоставлен", "Hujjat taqdim etildi"],
    cancelled: ["Запрос отменён", "So‘rov bekor qilindi"],
  };
  return labels[status][ru ? 0 : 1];
}
