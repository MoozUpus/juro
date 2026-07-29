"use client";

import { usePlatformBasePath } from "./PlatformRouteContext";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated archive data is hydrated after the first browser render */

import Link from "next/link";
import { Archive, CircleAlert, FileCheck2, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

type Item = { id: string; title: string; category?: string; legalArea?: string; archivedAt: string; canRestore?: number };

export function ArchiveClient({ locale }: { locale: PlatformLocale; accountType: AccountType }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [documents, setDocuments] = useState<Item[]>([]);
  const [cases, setCases] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/archive", { cache: "no-store" });
      const body = await response.json() as { documents?: Item[]; cases?: Item[]; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Архив не загрузился." : "Arxiv yuklanmadi."));
      setDocuments(body.documents ?? []);
      setCases(body.cases ?? []);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  }, [ru]);
  useEffect(() => { void load(); }, [load]);
  async function restore(type: "document" | "case", id: string) {
    const response = await fetch("/api/platform/archive", { method: "PATCH", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ type, id }) });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Объект не восстановлен." : "Obyekt tiklanmadi.")); return; }
    await load();
  }
  return <section className="archive-workspace"><header><Archive /><div><small>JURO</small><h1>{ru ? "Архив" : "Arxiv"}</h1><p>{ru ? "Архив скрывает объект из рабочих списков, но не удаляет его. Старые публичные ссылки не активируются при восстановлении." : "Arxiv obyektni ish ro‘yxatlaridan yashiradi, ammo o‘chirmaydi. Eski ommaviy havolalar tiklanganda faollashmaydi."}</p></div></header>{error && <p className="archive-error"><CircleAlert />{error}</p>}{loading ? <div className="archive-loading"><LoaderCircle className="spin" /></div> : <div className="archive-grid"><section><h2>{ru ? "Документы" : "Hujjatlar"}</h2>{documents.length ? documents.map(item => <article key={item.id}><FileCheck2 /><div><strong>{item.title}</strong><small>{item.category} · {formatDate(item.archivedAt, ru)}</small></div><Link href={`${base}/documents/${item.id}`}>{ru ? "Открыть" : "Ochish"}</Link>{Boolean(item.canRestore) && <button onClick={() => void restore("document", item.id)}><RotateCcw />{ru ? "Восстановить" : "Tiklash"}</button>}</article>) : <p>{ru ? "Архивных документов нет." : "Arxiv hujjatlari yo‘q."}</p>}</section><section><h2>{ru ? "Дела" : "Ishlar"}</h2>{cases.length ? cases.map(item => <article key={item.id}><Archive /><div><strong>{item.title}</strong><small>{item.legalArea} · {formatDate(item.archivedAt, ru)}</small></div><button onClick={() => void restore("case", item.id)}><RotateCcw />{ru ? "Восстановить" : "Tiklash"}</button></article>) : <p>{ru ? "Архивных дел нет." : "Arxiv ishlar yo‘q."}</p>}</section></div>}</section>;
}
function formatDate(value: string, ru: boolean) { return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(value)); }
