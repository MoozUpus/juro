"use client";

import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Locale = "ru" | "uz";
type Health = {
  freshness: { state: "fresh" | "stale" | "unknown"; latestSuccessfulAt: string | null; ageDays: number | null };
  latestRuns: Array<{ sourceKind: "lex" | "advice"; status: string; finishedAt: string | null; errorCount: number }>;
  pendingReviewCount: number;
  approvedPendingPublicationCount: number;
  pendingFetchCount: number;
};

const copy = {
  ru: { title: "Состояние источников", refresh: "Обновить статус", fresh: "База источников свежая", stale: "База источников требует проверки", unknown: "Нет успешной синхронизации", review: "На legal review", publication: "Ждут публикации", fetch: "В очереди загрузки", latest: "Последняя успешная синхронизация", unavailable: "Не удалось получить защищённый статус.", lex: "lex.uz", advice: "advice.uz", runs: "Последние запуски", never: "нет данных" },
  uz: { title: "Manbalar holati", refresh: "Holatni yangilash", fresh: "Manbalar bazasi dolzarb", stale: "Manbalar bazasi tekshiruvni talab qiladi", unknown: "Muvaffaqiyatli sinxronlash yo‘q", review: "Legal review’da", publication: "Nashrni kutmoqda", fetch: "Yuklash navbatida", latest: "Oxirgi muvaffaqiyatli sinxronlash", unavailable: "Himoyalangan holatni olish imkoni bo‘lmadi.", lex: "lex.uz", advice: "advice.uz", runs: "Oxirgi ishga tushirishlar", never: "ma’lumot yo‘q" },
} as const;

export function LegalSourceHealthPanel({ locale }: { locale: Locale }) {
  const l = copy[locale];
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/legal-sources/health", { headers: { "x-juro-csrf": "1" }, cache: "no-store" });
      if (!response.ok) throw new Error("health unavailable");
      const result = await response.json() as { ok: true } & Health;
      setHealth(result);
    } catch { setError(l.unavailable); } finally { setBusy(false); }
  }, [l.unavailable]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value)) : l.never;
  const state = health?.freshness.state ?? "unknown";
  const status = state === "fresh" ? l.fresh : state === "stale" ? l.stale : l.unknown;
  return <section className="staff-health" aria-labelledby="source-health-title" aria-busy={busy}>
    <div className="staff-health-heading"><div><span>{l.runs}</span><h2 id="source-health-title">{l.title}</h2></div><button type="button" onClick={() => void load()} disabled={busy}>{busy ? <RefreshCw className="is-spinning" aria-hidden="true"/> : <RefreshCw aria-hidden="true"/>}{l.refresh}</button></div>
    {error ? <p className="staff-health-error" role="status">{error}</p> : <div className="staff-health-grid">
      <div className={`staff-health-state state-${state}`}>{state === "fresh" ? <ShieldCheck aria-hidden="true"/> : <ShieldAlert aria-hidden="true"/>}<div><b>{status}</b><small>{l.latest}: {date(health?.freshness.latestSuccessfulAt ?? null)}</small></div></div>
      <div><span>{l.review}</span><b>{health?.pendingReviewCount ?? "—"}</b></div><div><span>{l.publication}</span><b>{health?.approvedPendingPublicationCount ?? "—"}</b></div><div><span>{l.fetch}</span><b>{health?.pendingFetchCount ?? "—"}</b></div>
      {(health?.latestRuns ?? []).map((run) => <div key={run.sourceKind}><span>{run.sourceKind === "lex" ? l.lex : l.advice}</span><b>{run.status}</b><small>{date(run.finishedAt)} · {run.errorCount}</small></div>)}
    </div>}
  </section>;
}