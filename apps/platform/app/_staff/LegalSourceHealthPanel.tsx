"use client";

import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { platformIntlLocale } from "../../lib/platform/date-time";
import type { PlatformLocale } from "../../lib/platform/routing";

type Locale = PlatformLocale;
type Health = {
  state: "fresh" | "degraded" | "stale" | "unknown";
  checkedAt: string | null;
  sources: Array<{
    sourceKind: "lex";
    status: "healthy" | "unavailable";
    checkedAt: string;
    latencyMs: number;
    errorCode: string | null;
  }>;
};

const copy = {
  ru: {
    title: "Доступность официальных endpoints",
    refresh: "Обновить статус",
    fresh: "Endpoints доступны",
    degraded: "Один или несколько endpoints недоступны",
    stale: "Проверка устарела",
    unknown: "Проверка ещё не запускалась",
    last: "Последняя проверка",
    latency: "Задержка",
    description: "Это техническая проверка robots endpoints, а не подтверждение правового содержания, актуальности закона или полноты базы.",
    unavailable: "Не удалось получить защищённый статус.",
    never: "нет данных",
    healthy: "Доступен",
    sourceUnavailable: "Недоступен",
  },
  uz: {
    title: "Rasmiy endpointlar mavjudligi",
    refresh: "Holatni yangilash",
    fresh: "Endpointlar mavjud",
    degraded: "Bir yoki bir nechta endpoint mavjud emas",
    stale: "Tekshiruv eskirgan",
    unknown: "Tekshiruv hali boshlanmagan",
    last: "Oxirgi tekshiruv",
    latency: "Kechikish",
    description: "Bu robots endpointlarining texnik tekshiruvi bo‘lib, huquqiy mazmun, qonun dolzarbligi yoki baza to‘liqligini tasdiqlamaydi.",
    unavailable: "Himoyalangan holatni olish imkoni bo‘lmadi.",
    never: "ma’lumot yo‘q",
    healthy: "Mavjud",
    sourceUnavailable: "Mavjud emas",
  },
  en: {
    title: "Official endpoint availability",
    refresh: "Refresh status",
    fresh: "Endpoints are available",
    degraded: "One or more endpoints are unavailable",
    stale: "The check is stale",
    unknown: "The check has not run yet",
    last: "Last check",
    latency: "Latency",
    description: "This is a technical check of robots endpoints, not confirmation of legal content, legislative currency or corpus coverage.",
    unavailable: "Secure status could not be retrieved.",
    never: "no data",
    healthy: "Available",
    sourceUnavailable: "Unavailable",
  },
} as const;

export function LegalSourceHealthPanel({ locale }: { locale: Locale }) {
  const l = copy[locale];
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/legal-sources/health", {
        headers: { "x-juro-csrf": "1" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("health unavailable");
      setHealth(await response.json() as { ok: true } & Health);
    } catch {
      setError(l.unavailable);
    } finally {
      setBusy(false);
    }
  }, [l.unavailable]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat(platformIntlLocale(locale), {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent",
    }).format(new Date(value))
    : l.never;
  const state = health?.state ?? "unknown";
  const stateLabel = state === "fresh" ? l.fresh
    : state === "degraded" ? l.degraded
      : state === "stale" ? l.stale
        : l.unknown;

  return <section className="staff-health" aria-labelledby="source-health-title" aria-busy={busy}>
    <div className="staff-health-heading">
      <div><span>TECHNICAL SOURCE CHECK</span><h2 id="source-health-title">{l.title}</h2></div>
      <button type="button" onClick={() => void load()} disabled={busy}>
        <RefreshCw className={busy ? "is-spinning" : undefined} aria-hidden="true" />
        {l.refresh}
      </button>
    </div>
    {error ? <p className="staff-health-error" role="status">{error}</p> : <div className="staff-health-grid">
      <div className={`staff-health-state state-${state}`}>
        {state === "fresh" ? <ShieldCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
        <div><b>{stateLabel}</b><small>{l.last}: {date(health?.checkedAt ?? null)}</small></div>
      </div>
      {(health?.sources ?? []).map((source) => <div key={source.sourceKind}>
        <span>lex.uz</span>
        <b>{source.status === "healthy" ? l.healthy : l.sourceUnavailable}</b>
        <small>{date(source.checkedAt)} · {l.latency}: {source.latencyMs} ms{source.errorCode ? ` · ${source.errorCode}` : ""}</small>
      </div>)}
      <div><small>{l.description}</small></div>
    </div>}
  </section>;
}
