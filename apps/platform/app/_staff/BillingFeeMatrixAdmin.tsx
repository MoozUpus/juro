"use client";

import { Check, CircleDollarSign, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type Locale = "ru" | "uz";
type Policy = { id: string; version: number; mode: string; consultationFeeBasisPoints: number; installmentServiceMarkupBasisPoints: number; installmentWaivesCaseTransfer: number; effectiveFrom: string; reason: string; source: string; createdAt: string };
type Rule = { id: string; version: number; labelRu: string; labelUz: string; legalArea: string | null; caseType: string | null; feeBasisPoints: 200 | 500; priority: number; effectiveFrom: string; reason: string; createdAt: string };
type Event = { entityType: string; entityId: string; action: string; reason: string; actorUserId: string | null; createdAt: string };
type Transaction = { id: string; externalId: string; demoAccountKey: string | null; flowType: string; serviceKind: string | null; amountMinor: number; consultationFeeAmountMinor: number | null; caseTransferFeeAmountMinor: number | null; clientTotalMinor: number | null; lawyerPayoutMinor: number | null; status: string; provider: "demo"; isSimulation: 1; createdAt: string };
type Snapshot = { policies: Policy[]; rules: Rule[]; events: Event[]; transactions: Transaction[] };

async function body<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(value.code || `HTTP_${response.status}`);
  return value;
}

function localNow() {
  const value = new Date(Date.now() + 60_000);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function BillingFeeMatrixAdmin({ locale, reviewerName }: { locale: Locale; reviewerName: string }) {
  const ru = locale === "ru";
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [markup, setMarkup] = useState("0");
  const [policyFrom, setPolicyFrom] = useState(localNow);
  const [policyReason, setPolicyReason] = useState("");
  const [labelRu, setLabelRu] = useState("");
  const [labelUz, setLabelUz] = useState("");
  const [legalArea, setLegalArea] = useState("");
  const [caseType, setCaseType] = useState("");
  const [feePercent, setFeePercent] = useState<2 | 5>(2);
  const [priority, setPriority] = useState("100");
  const [ruleFrom, setRuleFrom] = useState(localNow);
  const [ruleReason, setRuleReason] = useState("");
  useEffect(() => {
    void fetch("/api/platform/admin/billing-fees", { cache: "no-store" })
      .then((response) => body<Snapshot>(response))
      .then(setData)
      .catch((value) => setError(value instanceof Error ? value.message : String(value)));
  }, []);

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await body<Snapshot>(await fetch("/api/platform/admin/billing-fees", {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify(payload),
      }));
      setData(next); setNotice(ru ? "Новая версия сохранена в неизменяемом журнале." : "Yangi versiya o‘zgarmas jurnalga saqlandi.");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  async function createPolicy(event: FormEvent) {
    event.preventDefault();
    await post({ action: "create_policy", consultationFeePercent: 1, installmentServiceMarkupPercent: Number(markup), installmentWaivesCaseTransfer: true, effectiveFrom: new Date(policyFrom).toISOString(), reason: policyReason.trim() });
    setPolicyReason("");
  }

  async function createRule(event: FormEvent) {
    event.preventDefault();
    await post({ action: "create_case_transfer_rule", labelRu: labelRu.trim(), labelUz: labelUz.trim(), ...(legalArea.trim() ? { legalArea: legalArea.trim() } : {}), ...(caseType.trim() ? { caseType: caseType.trim() } : {}), feePercent, priority: Number(priority), effectiveFrom: new Date(ruleFrom).toISOString(), reason: ruleReason.trim() });
    setRuleReason("");
  }

  const current = data?.policies[0];
  const date = (value: string) => new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
  const money = (value: number | null) => `${new Intl.NumberFormat(ru ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 0 }).format(Number(value ?? 0) / 100)} ${ru ? "сум" : "so‘m"}`;
  return <div className="staff-console"><header className="staff-topbar"><div className="staff-brand"><ShieldCheck /><span><b>JURO</b><small>BILLING CONTROL</small></span></div><div className="staff-session"><span>{ru ? "Защищённый контур · свежая 2FA" : "Himoyalangan kontur · yangi 2FA"}</span><b>{reviewerName}</b></div><a href={`/${locale}/admin/lawyer-profiles`}>{ru ? "Профили" : "Profillar"}</a><a href={`/${ru ? "uz" : "ru"}/admin/billing`} hrefLang={ru ? "uz" : "ru"}>{ru ? "UZ" : "RU"}</a></header><main className="staff-main billing-fee-admin">
    <section className="staff-heading"><div><span>JURO · FEE MATRIX</span><h1>{ru ? "Комиссии и sandbox billing" : "Komissiyalar va sandbox billing"}</h1><p>{ru ? "Версионные правила: 1% консультации, явный выбор 2%/5% для передачи дела и запрет двойной комиссии при рассрочке." : "Versiyalangan qoidalar: maslahat uchun 1%, ishni topshirish uchun aniq 2%/5% va bo‘lib to‘lashda ikki karra komissiyani taqiqlash."}</p></div></section>
    {error && <p className="staff-error" role="alert">{error}</p>}{notice && <p className="staff-verified" role="status"><Check />{notice}</p>}
    {current && <section className="fee-current"><CircleDollarSign /><div><small>{ru ? `Политика v${current.version}` : `Siyosat v${current.version}`}</small><h2>{ru ? `Консультация ${current.consultationFeeBasisPoints / 100}%` : `Maslahat ${current.consultationFeeBasisPoints / 100}%`}</h2><p>{ru ? `Рассрочка: сервисная стоимость ${current.installmentServiceMarkupBasisPoints / 100}%; case-transfer fee с юриста не удерживается.` : `Bo‘lib to‘lash: xizmat narxi ${current.installmentServiceMarkupBasisPoints / 100}%; yuristdan case-transfer fee ushlanmaydi.`}</p></div><time>{date(current.effectiveFrom)}</time></section>}
    <div className="fee-admin-grid"><form className="staff-decision" onSubmit={(event) => void createPolicy(event)}><h2>{ru ? "Новая версия политики" : "Yangi siyosat versiyasi"}</h2><label>{ru ? "Комиссия консультации" : "Maslahat komissiyasi"}<input value="1%" disabled /></label><label>{ru ? "Сервисная стоимость рассрочки, %" : "Bo‘lib to‘lash xizmat narxi, %"}<input type="number" min="0" max="100" step="1" value={markup} onChange={(event) => setMarkup(event.target.value)} /></label><label>{ru ? "Начало действия" : "Amal boshlanishi"}<input type="datetime-local" required value={policyFrom} onChange={(event) => setPolicyFrom(event.target.value)} /></label><label>{ru ? "Причина" : "Sabab"}<textarea required minLength={3} maxLength={2000} value={policyReason} onChange={(event) => setPolicyReason(event.target.value)} /></label><button className="staff-approve" disabled={busy || policyReason.trim().length < 3}>{busy ? <LoaderCircle className="spin" /> : <Plus />}{ru ? "Создать версию" : "Versiya yaratish"}</button></form>
      <form className="staff-decision" onSubmit={(event) => void createRule(event)}><h2>{ru ? "Правило передачи дела" : "Ishni topshirish qoidasi"}</h2><label>RU<input required minLength={3} maxLength={160} value={labelRu} onChange={(event) => setLabelRu(event.target.value)} /></label><label>UZ<input required minLength={3} maxLength={160} value={labelUz} onChange={(event) => setLabelUz(event.target.value)} /></label><label>{ru ? "Область права" : "Huquq sohasi"}<input maxLength={120} value={legalArea} onChange={(event) => setLegalArea(event.target.value)} /></label><label>{ru ? "Тип дела" : "Ish turi"}<input maxLength={120} value={caseType} onChange={(event) => setCaseType(event.target.value)} /></label><label>{ru ? "Комиссия" : "Komissiya"}<select value={feePercent} onChange={(event) => setFeePercent(Number(event.target.value) as 2 | 5)}><option value="2">2%</option><option value="5">5%</option></select></label><label>{ru ? "Приоритет" : "Ustuvorlik"}<input type="number" min="0" max="10000" value={priority} onChange={(event) => setPriority(event.target.value)} /></label><label>{ru ? "Начало действия" : "Amal boshlanishi"}<input type="datetime-local" required value={ruleFrom} onChange={(event) => setRuleFrom(event.target.value)} /></label><label>{ru ? "Причина" : "Sabab"}<textarea required minLength={3} maxLength={2000} value={ruleReason} onChange={(event) => setRuleReason(event.target.value)} /></label><button className="staff-approve" disabled={busy || (!legalArea.trim() && !caseType.trim()) || ruleReason.trim().length < 3}>{busy ? <LoaderCircle className="spin" /> : <Plus />}{ru ? "Добавить правило" : "Qoida qo‘shish"}</button></form></div>
    <section className="fee-rule-list"><h2>{ru ? "Действующая матрица 2%/5%" : "Amaldagi 2%/5% matritsa"}</h2>{data?.rules.length ? data.rules.map((rule) => <article key={rule.id}><strong>{ru ? rule.labelRu : rule.labelUz}</strong><span>{rule.feeBasisPoints / 100}%</span><p>{[rule.legalArea, rule.caseType].filter(Boolean).join(" · ")}</p><small>v{rule.version} · {date(rule.effectiveFrom)} · {rule.reason}</small></article>) : <p>{ru ? "Правила ещё не созданы: система не угадывает, когда применять 2% или 5%." : "Qoidalar hali yaratilmagan: tizim 2% yoki 5% qachon qo‘llanishini taxmin qilmaydi."}</p>}</section>
    <section className="fee-rule-list"><h2>{ru ? "Demo-транзакции" : "Demo tranzaksiyalar"}</h2><p>{ru ? "Только sandbox-записи: без списания денег и без активации реальных расчётов." : "Faqat sandbox yozuvlari: pul yechilmaydi va haqiqiy hisob-kitob yoqilmaydi."}</p>{data?.transactions.length ? data.transactions.map((run) => <article key={run.id}><strong>{run.demoAccountKey ? `Investor Demo · ${run.demoAccountKey}` : run.externalId}</strong><span>{run.status}</span><p>{run.serviceKind || run.flowType} · {money(run.clientTotalMinor ?? run.amountMinor)} · {ru ? "юристу" : "yuristga"} {money(run.lawyerPayoutMinor)}</p><small>{run.provider} · simulation={run.isSimulation} · {date(run.createdAt)}</small></article>) : <p>{ru ? "Demo-транзакций пока нет." : "Demo tranzaksiyalar hali yo‘q."}</p>}</section>
    <section className="fee-rule-list"><h2>{ru ? "Неизменяемый audit log" : "O‘zgarmas audit log"}</h2>{data?.events.length ? data.events.map((event) => <article key={`${event.entityType}:${event.entityId}:${event.createdAt}`}><strong>{event.action}</strong><span>{event.entityType}</span><p>{event.reason}</p><small>{date(event.createdAt)} · {event.actorUserId || "system"}</small></article>) : <p>{ru ? "Событий конфигурации пока нет." : "Konfiguratsiya hodisalari hali yo‘q."}</p>}</section>
  </main></div>;
}
