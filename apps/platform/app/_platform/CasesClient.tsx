"use client";

import { usePlatformBasePath } from "./PlatformRouteContext";
import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, CircleAlert, LoaderCircle, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

type CaseItem = {
  id: string;
  title: string;
  description?: string;
  legalArea: string;
  status: string;
  nextDeadlineAt?: string;
  updatedAt: string;
  progressPercent?: number;
  steps?: Array<{ id: string; status: string }>;
};

export function CasesClient({ locale }: { locale: PlatformLocale; accountType: AccountType }) {
  const [items, setItems] = useState<CaseItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ru = locale === "ru";
  const base = usePlatformBasePath();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/cases", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { cases?: CaseItem[]; error?: string };
        if (!response.ok) throw new Error(body.error || (ru ? "Не удалось загрузить дела." : "Ishlarni yuklab bo‘lmadi."));
        if (!cancelled) setItems(body.cases ?? []);
      })
      .catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : String(value)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ru]);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesSearch = !query || `${item.title} ${item.description ?? ""} ${item.legalArea}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    const matchesStatus = status === "all" || (status === "active" ? !["completed", "cancelled", "archived"].includes(item.status) : item.status === status);
    return matchesSearch && matchesStatus;
  }), [items, query, status]);

  return (
    <section className="cases-live">
      <header>
        <div><small>JURO · {ru ? "Дела" : "Ishlar"}</small><h1>{ru ? "Единая история юридической работы" : "Yuridik ishlarning yagona tarixi"}</h1><p>{ru ? "Дело связывает подтверждённые факты, документы, план, сроки и консультацию." : "Ish tasdiqlangan faktlar, hujjatlar, reja, muddatlar va maslahatni bog‘laydi."}</p></div>
        <Link href={`${base}/action-plan`}><Plus />{ru ? "Создать дело" : "Ish yaratish"}</Link>
      </header>
      <div className="cases-live-tools">
        <label><Search /><span className="sr-only">{ru ? "Поиск дел" : "Ishlarni qidirish"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? "Найти дело" : "Ishni topish"} /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={ru ? "Фильтр статуса" : "Holat filtri"}>
          <option value="active">{ru ? "Активные" : "Faol"}</option>
          <option value="all">{ru ? "Все" : "Barchasi"}</option>
          <option value="open">{ru ? "Открытые" : "Ochiq"}</option>
          <option value="completed">{ru ? "Завершённые" : "Yakunlangan"}</option>
        </select>
      </div>
      {error && <p className="cases-live-error" role="alert"><CircleAlert />{error}</p>}
      {loading ? <div className="cases-live-loading"><LoaderCircle className="spin" /></div> : filtered.length ? (
        <div className="cases-live-list">
          {filtered.map((item) => {
            const complete = item.steps?.filter((step) => step.status === "completed").length ?? 0;
            const total = item.steps?.length ?? 0;
            return (
              <article key={item.id}>
                <div className="cases-live-icon"><BriefcaseBusiness /></div>
                <div className="cases-live-body"><span>{item.legalArea} · {item.status}</span><h2>{item.title}</h2><p>{item.description || (ru ? "Описание пока не добавлено." : "Tavsif hali qo‘shilmagan.")}</p></div>
                <div className="cases-live-progress"><strong>{item.progressPercent ?? 0}%</strong><span>{complete}/{total} {ru ? "шагов" : "qadam"}</span></div>
                <div className="cases-live-meta"><CalendarClock /><span>{item.nextDeadlineAt ? formatDate(item.nextDeadlineAt, ru) : (ru ? "Срок не назначен" : "Muddat belgilanmagan")}</span></div>
                <Link href={`${base}/cases/${item.id}`}>{ru ? "Открыть дело" : "Ishni ochish"} →</Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="cases-live-empty"><BriefcaseBusiness /><h2>{query ? (ru ? "Ничего не найдено" : "Hech narsa topilmadi") : (ru ? "Дел пока нет" : "Hozircha ishlar yo‘q")}</h2><p>{ru ? "Начните с ситуации — JURO создаст дело и связанный план." : "Vaziyatdan boshlang — JURO ish va bog‘langan rejani yaratadi."}</p>{!query && <Link href={`${base}/action-plan`}>{ru ? "Создать первое дело" : "Birinchi ishni yaratish"}</Link>}</div>
      )}
    </section>
  );
}

function formatDate(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(value));
}
