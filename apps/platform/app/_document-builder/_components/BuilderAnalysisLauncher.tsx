"use client";

import { FileSearch, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { ApiClientError, apiFetch } from "./api-client";

type Mode = "quick" | "full" | "expert";

export function BuilderAnalysisLauncher({
  locale,
  reviewPath,
  onPrepare,
}: {
  locale: "ru" | "uz";
  reviewPath: string;
  onPrepare: () => Promise<string>;
}) {
  const ru = locale === "ru";
  const [mode, setMode] = useState<Mode>("quick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const busyRef = useRef(false);

  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const documentId = await onPrepare();
      idempotencyKey.current ??= `builder-analysis-${crypto.randomUUID()}`;
      const result = await apiFetch<{ analysisId: string }>(
        `/api/document-builder/documents/${encodeURIComponent(documentId)}/analysis`,
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey.current },
          body: JSON.stringify({ mode, locale }),
        },
      );
      idempotencyKey.current = null;
      const separator = reviewPath.includes("?") ? "&" : "?";
      window.location.assign(`${reviewPath}${separator}analysisId=${encodeURIComponent(result.analysisId)}`);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === "BUILDER_ANALYSIS_IDEMPOTENCY_CONFLICT") {
        idempotencyKey.current = null;
      }
      setError(caught instanceof Error ? caught.message : (ru ? "Анализ не запущен." : "Tahlil boshlanmadi."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <section className="dbt-builder-analysis" aria-labelledby="builder-analysis-title">
    <div>
      <FileSearch aria-hidden="true" />
      <span>
        <strong id="builder-analysis-title">{ru ? "Проверить текущую версию с AI-юристом JURO" : "Joriy nusxani JURO AI-yuristi bilan tekshirish"}</strong>
        <small>{ru ? "Сохраним неизменяемый снимок этой ревизии и откроем риски, источники и предлагаемые формулировки." : "Ushbu tahrirning o‘zgarmas nusxasini saqlab, xavflar, manbalar va tavsiya etilgan matnlarni ochamiz."}</small>
      </span>
    </div>
    <label>
      <span>{ru ? "Глубина" : "Tahlil darajasi"}</span>
      <select value={mode} onChange={(event) => setMode(event.target.value as Mode)} disabled={busy}>
        <option value="quick">{ru ? "Быстро — основные риски" : "Tez — asosiy xavflar"}</option>
        <option value="full">{ru ? "Полно — по разделам" : "To‘liq — bo‘limlar bo‘yicha"}</option>
        <option value="expert">{ru ? "Экспертно — с редакцией" : "Ekspert — tahrir bilan"}</option>
      </select>
    </label>
    <button type="button" onClick={() => void start()} disabled={busy} aria-busy={busy} aria-describedby="builder-analysis-status">
      {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <FileSearch aria-hidden="true" />}
      {busy ? (ru ? "Сохраняем снимок…" : "Nusxa saqlanmoqda…") : (ru ? "Начать анализ" : "Tahlilni boshlash")}
    </button>
    <p id="builder-analysis-status" className={`dbt-builder-analysis-status${error ? " error" : ""}`} aria-live="polite">
      {error || (busy ? (ru ? "Сохраняем текущую ревизию и ставим анализ в очередь." : "Joriy tahrir saqlanib, tahlil navbatga qo‘yilmoqda.") : "")}
    </p>
  </section>;
}
