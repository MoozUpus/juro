"use client";

import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Locale = "ru" | "uz";
type Health = {
  state: "fresh" | "degraded" | "stale" | "unknown";
  alertCode: string | null;
  checkedAt: string | null;
  ageMinutes: number | null;
  sources: Array<{ sourceKind: "lex" | "advice"; status: "healthy" | "unavailable"; checkedAt: string; latencyMs: number; errorCode: string | null }>;
};

const copy = {
  ru: {
    eyebrow: "Query-scoped direct retrieval", title: "Доступность официальных endpoints", description: "Проверка касается только доступности robots endpoints. Она не подтверждает актуальность закона, содержание страницы или полноту правовой базы; страницы законов и сценариев не сохраняются.", check: "Проверить сейчас", fresh: "Endpoints доступны", degraded: "Один или несколько endpoints недоступны", stale: "Проверка устарела", unknown: "Проверка ещё не запускалась", last: "Последняя проверка", latency: "Задержка", unavailable: "Защищённый status сейчас недоступен.", never: "нет данных", noAlert: "Активных предупреждений нет", alert: "Требуется проверка источника",
  },
  uz: {
    eyebrow: "So‘rov doirasidagi bevosita olish", title: "Rasmiy endpointlar mavjudligi", description: "Tekshiruv faqat robots endpointlari mavjudligini ko‘rsatadi. U qonunning dolzarbligi, sahifa mazmuni yoki huquqiy baza to‘liqligini tasdiqlamaydi; qonun va ssenariy sahifalari saqlanmaydi.", check: "Hozir tekshirish", fresh: "Endpointlar mavjud", degraded: "Bir yoki bir nechta endpoint mavjud emas", stale: "Tekshiruv eskirgan", unknown: "Tekshiruv hali boshlanmagan", last: "Oxirgi tekshiruv", latency: "Kechikish", unavailable: "Himoyalangan holat hozir mavjud emas.", never: "ma’lumot yo‘q", noAlert: "Faol ogohlantirish yo‘q", alert: "Manbani tekshirish kerak",
  },
} as const;

export function DirectLegalSourceHealthPanel({ locale }: { locale: Locale }) {
  const l = copy[locale];
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (run = false) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/legal-sources/health", {
        method: run ? "POST" : "GET",
        headers: run ? { "x-juro-csrf": "1" } : undefined,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("health unavailable");
      setHealth(await response.json() as { ok: true } & Health);
    } catch { setError(l.unavailable); } finally { setBusy(false); }
  }, [l.unavailable]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value)) : l.never;
  const status = health?.state ?? "unknown";
  const title = status === "fresh" ? l.fresh : status === "degraded" ? l.degraded : status === "stale" ? l.stale : l.unknown;
  return <main className="staff-console"><a className="staff-skip" href="#direct-source-health">{locale === "ru" ? "К содержанию" : "Tarkibga"}</a><div className="staff-main" id="direct-source-health">
    <section className="staff-heading"><div><span>{l.eyebrow}</span><h1>{l.title}</h1><p>{l.description}</p></div><button type="button" onClick={() => void load(true)} disabled={busy}>{busy ? <RefreshCw className="is-spinning" aria-hidden="true"/> : <RefreshCw aria-hidden="true"/>}{l.check}</button></section>
    {error ? <p className="staff-error" role="alert">{error}</p> : <section className="staff-health" aria-busy={busy} aria-live="polite"><div className={`staff-health-state state-${status}`}>{status === "fresh" ? <ShieldCheck aria-hidden="true"/> : <ShieldAlert aria-hidden="true"/>}<div><b>{title}</b><small>{l.last}: {date(health?.checkedAt ?? null)}</small></div></div><div className={health?.alertCode ? "staff-health-alert" : "staff-health-clear"}><b>{health?.alertCode ? l.alert : l.noAlert}</b><small>{health?.alertCode ?? "—"}</small></div><div className="staff-health-grid">{health?.sources.map((source) => <article key={source.sourceKind}><span>{source.sourceKind === "lex" ? "lex.uz" : "advice.uz"}</span><b>{source.status}</b><small>{date(source.checkedAt)} · {l.latency}: {source.latencyMs} ms{source.errorCode ? ` · ${source.errorCode}` : ""}</small></article>)}</div></section>}
  </div></main>;
}
