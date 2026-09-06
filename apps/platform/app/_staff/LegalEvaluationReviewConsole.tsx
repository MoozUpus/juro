"use client";

import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Summary = {
  evaluationRunId: string;
  corpusVersion: string;
  scenarioCount: number;
  scopeDigest: string;
  materializedCount: number;
  existing: null | { eventHash: string; createdAt: string; disposition: string };
};

const copy = {
  ru: {
    secure: "Защищённый контур · свежая 2FA",
    title: "Подтверждение юридической проверки",
    description: "Фиксирует ваше личное решение по неизменяемому составу staging evaluation. Это не AI-оценка и не подтверждение от имени другого лица.",
    refresh: "Обновить",
    scenarios: "Сценариев",
    existing: "Ваше решение уже сохранено в неизменяемом журнале.",
    materialized: (count: number) => `${count} индивидуальных записей review готовы для evidence export.`,
    exportEvidence: "Экспортировать evidence",
    materializationConfirmation: (count: number) => `Я подтверждаю материализацию ${count} индивидуальных технических записей из моего сохранённого решения; новые юридические выводы не создаются.`,
    materialize: "Создать индивидуальные записи",
    reviewConfirmation: (count: number) => `Я лично проверил(а) все ${count} завершённых сценария и подтверждаю корректность.`,
    attest: "Зафиксировать моё решение",
    receipt: (hash: string) => `Решение сохранено. Hash: ${hash}`,
  },
  uz: {
    secure: "Himoyalangan kontur · yangi 2FA",
    title: "Yuridik tekshiruvni tasdiqlash",
    description: "Staging evaluation bo‘yicha shaxsiy qaroringizni o‘zgarmas tarkib bilan qayd etadi. Bu AI bahosi ham, boshqa shaxs nomidan berilgan tasdiq ham emas.",
    refresh: "Yangilash",
    scenarios: "Ssenariylar",
    existing: "Qaroringiz o‘zgarmas jurnalga saqlangan.",
    materialized: (count: number) => `${count} ta individual review yozuvi evidence export uchun tayyor.`,
    exportEvidence: "Evidence faylini eksport qilish",
    materializationConfirmation: (count: number) => `Saqlangan qarorimdan ${count} ta individual texnik yozuv materializatsiyasini tasdiqlayman; yangi yuridik xulosa yaratilmaydi.`,
    materialize: "Individual yozuvlarni yaratish",
    reviewConfirmation: (count: number) => `${count} ta yakunlangan ssenariyni shaxsan tekshirdim va to‘g‘riligini tasdiqlayman.`,
    attest: "Qarorimni qayd etish",
    receipt: (hash: string) => `Qaror saqlandi. Hash: ${hash}`,
  },
  en: {
    secure: "Secure environment · recent 2FA",
    title: "Confirm legal review",
    description: "Records your personal decision for the immutable staging evaluation scope. This is not an AI assessment and does not confirm anything on another person’s behalf.",
    refresh: "Refresh",
    scenarios: "Scenarios",
    existing: "Your decision is already recorded in the immutable audit log.",
    materialized: (count: number) => `${count} individual review records are ready for evidence export.`,
    exportEvidence: "Export evidence",
    materializationConfirmation: (count: number) => `I confirm the materialisation of ${count} individual technical records from my saved decision; no new legal conclusions will be created.`,
    materialize: "Create individual records",
    reviewConfirmation: (count: number) => `I have personally reviewed all ${count} completed scenarios and confirm that they are correct.`,
    attest: "Record my decision",
    receipt: (hash: string) => `Decision recorded. Hash: ${hash}`,
  },
} as const;

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

export function LegalEvaluationReviewConsole({ locale, reviewerName }: { locale: PlatformLocale; reviewerName: string }) {
  const t = copy[locale];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [materializationConfirmed, setMaterializationConfirmed] = useState(false);
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
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const attest = async () => {
    if (!summary || !confirmed) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ eventHash: string; replay: boolean }>({ action: "attest", evaluationRunId: runId, expectedScopeDigest: summary.scopeDigest, disposition: "confirmed_correct", confirmation: "I_CONFIRM_PERSONAL_LEGAL_REVIEW" });
      setReceipt(result.eventHash); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const materialize = async () => {
    if (!summary || !materializationConfirmed) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ eventHash: string; materializedCount: number; replay: boolean }>({ action: "materialize", evaluationRunId: runId, expectedScopeDigest: summary.scopeDigest, confirmation: "I_CONFIRM_MATERIALIZE_PERSONAL_REVIEWS" });
      setReceipt(`${result.materializedCount} records · ${result.eventHash}`); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const exportEvidence = async () => {
    if (!summary || summary.materializedCount !== summary.scenarioCount) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/admin/ai-quality/evaluation-human-evidence", {
        method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ evaluationRunId: runId }),
      });
      const payload = await response.json() as { evidence?: { exportDigest: string }; code?: string };
      if (!response.ok || !payload.evidence) throw new Error(payload.code || `HTTP ${response.status}`);
      const blob = new Blob([JSON.stringify(payload.evidence, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${runId}-human-review-evidence.json`; anchor.click(); URL.revokeObjectURL(url);
      setReceipt(payload.evidence.exportDigest);
    } catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  return <div className="staff-console ai-quality-console">
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>LEGAL EVALUATION REVIEW</small></span></div><div className="staff-session"><span>{t.secure}</span><b>{reviewerName}</b></div></header>
    <main id="staff-main" className="staff-main"><section className="staff-heading"><div><span>JURO · LEGAL QUALITY</span><h1>{t.title}</h1><p>{t.description}</p></div><button type="button" onClick={() => void load()} disabled={busy}>{busy ? <LoaderCircle aria-hidden="true"/> : <ShieldCheck aria-hidden="true"/>}{t.refresh}</button></section>
      {error && <p className="staff-error" role="alert">{error}</p>}
      {summary && <section className="staff-filters"><dl className="ai-quality-facts"><div><dt>Run</dt><dd>{summary.evaluationRunId}</dd></div><div><dt>{t.scenarios}</dt><dd>{summary.scenarioCount}</dd></div><div><dt>Corpus</dt><dd>{summary.corpusVersion}</dd></div></dl>
        {summary.existing ? <><p className="staff-verified"><ShieldCheck aria-hidden="true"/>{t.existing}</p>{summary.materializedCount === summary.scenarioCount ? <><p className="staff-verified"><ShieldCheck aria-hidden="true"/>{t.materialized(summary.materializedCount)}</p><button className="staff-approve" type="button" disabled={busy} onClick={() => void exportEvidence()}><Check aria-hidden="true"/>{t.exportEvidence}</button></> : <><label className="staff-checkbox"><input type="checkbox" checked={materializationConfirmed} onChange={(event) => setMaterializationConfirmed(event.target.checked)}/>{t.materializationConfirmation(summary.scenarioCount)}</label><button className="staff-approve" type="button" disabled={!materializationConfirmed || busy} onClick={() => void materialize()}><Check aria-hidden="true"/>{t.materialize}</button></>}</> : <><label className="staff-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>{t.reviewConfirmation(summary.scenarioCount)}</label><button className="staff-approve" type="button" disabled={!confirmed || busy} onClick={() => void attest()}><Check aria-hidden="true"/>{t.attest}</button></>}
      </section>}
      {receipt && <p className="staff-verified"><ShieldCheck aria-hidden="true"/>{t.receipt(receipt)}</p>}
    </main>
  </div>;
}
