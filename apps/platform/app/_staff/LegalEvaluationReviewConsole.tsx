"use client";

import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Summary = {
  evaluationRunId: string;
  corpusVersion: string;
  scenarioCount: number;
  scopeDigest: string;
  existing: null | { eventHash: string; createdAt: string; disposition: string };
};

async function request<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/platform/admin/ai-quality/evaluation-review", {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", "x-juro-csrf": "1" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(payload.code || `HTTP ${response.status}`);
  return payload;
}

export function LegalEvaluationReviewConsole({ locale, reviewerName }: { locale: "ru" | "uz"; reviewerName: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const runId = "staging-20260814-canonical";
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { setSummary(await request<Summary>({ action: "summary", evaluationRunId: runId })); }
    catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const attest = async () => {
    if (!summary || !confirmed) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ eventHash: string; replay: boolean }>({ action: "attest", evaluationRunId: runId, expectedScopeDigest: summary.scopeDigest, disposition: "confirmed_correct", confirmation: "I_CONFIRM_PERSONAL_LEGAL_REVIEW" });
      setReceipt(result.eventHash); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const ru = locale === "ru";
  return <div className="staff-console ai-quality-console">
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>LEGAL EVALUATION REVIEW</small></span></div><div className="staff-session"><span>{ru ? "Защищённый контур · свежая 2FA" : "Himoyalangan kontur · yangi 2FA"}</span><b>{reviewerName}</b></div></header>
    <main id="staff-main" className="staff-main"><section className="staff-heading"><div><span>JURO · LEGAL QUALITY</span><h1>{ru ? "Подтверждение юридической проверки" : "Yuridik tekshiruvni tasdiqlash"}</h1><p>{ru ? "Фиксирует ваше личное решение по неизменяемому составу staging evaluation. Это не AI-оценка и не подтверждение от имени другого лица." : "Staging evaluation bo‘yicha shaxsiy qaroringizni o‘zgarmas tarkib bilan qayd etadi."}</p></div><button type="button" onClick={() => void load()} disabled={busy}>{busy ? <LoaderCircle aria-hidden="true"/> : <ShieldCheck aria-hidden="true"/>}{ru ? "Обновить" : "Yangilash"}</button></section>
      {error && <p className="staff-error" role="alert">{error}</p>}
      {summary && <section className="staff-filters"><dl className="ai-quality-facts"><div><dt>Run</dt><dd>{summary.evaluationRunId}</dd></div><div><dt>{ru ? "Сценариев" : "Ssenariylar"}</dt><dd>{summary.scenarioCount}</dd></div><div><dt>Corpus</dt><dd>{summary.corpusVersion}</dd></div></dl>
        {summary.existing ? <p className="staff-verified"><ShieldCheck aria-hidden="true"/>{ru ? "Ваше решение уже сохранено в неизменяемом журнале." : "Qaroringiz o‘zgarmas jurnalga saqlangan."}</p> : <><label className="staff-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>{ru ? `Я лично проверил(а) все ${summary.scenarioCount} завершённых сценария и подтверждаю корректность.` : `${summary.scenarioCount} ta yakunlangan ssenariyni shaxsan tekshirdim va to‘g‘riligini tasdiqlayman.`}</label><button className="staff-approve" type="button" disabled={!confirmed || busy} onClick={() => void attest()}><Check aria-hidden="true"/>{ru ? "Зафиксировать моё решение" : "Qarorimni qayd etish"}</button></>}
      </section>}
      {receipt && <p className="staff-verified"><ShieldCheck aria-hidden="true"/>{ru ? `Решение сохранено. Hash: ${receipt}` : `Qaror saqlandi. Hash: ${receipt}`}</p>}
    </main>
  </div>;
}
