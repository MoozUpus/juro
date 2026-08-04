"use client";

import { CheckCircle2, CircleOff, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  OperationalFeatureKey,
  OperationalFeatureVersion,
  OperationalLocale,
} from "../../lib/operations/operational-feature-flags";

type Dashboard = {
  environment: "development" | "staging" | "production";
  integrity: { valid: boolean; checked: number };
  features: OperationalFeatureVersion[];
  history: OperationalFeatureVersion[];
};

const labels: Record<OperationalLocale, Record<OperationalFeatureKey, string>> = {
  ru: { ai_chat: "AI-чат", document_analysis_upload: "Загрузка для анализа", lawyer_handoff: "Передача юристу", voice_mode: "Голосовой режим" },
  uz: { ai_chat: "AI-chat", document_analysis_upload: "Tahlil uchun yuklash", lawyer_handoff: "Yuristga topshirish", voice_mode: "Ovozli rejim" },
};

const copy = {
  ru: { skip: "К основному содержимому", title: "Аварийное управление функциями", secure: "Защищённая рабочая зона", fresh: "Недавняя 2FA", environment: "Среда", refresh: "Обновить", enabled: "Работает", disabled: "Приостановлено", disable: "Приостановить", enable: "Возобновить", reason: "Причина изменения", reasonHint: "Не менее 10 символов. Не указывайте секреты или пользовательские данные.", save: "Записать изменение", saved: "Изменение записано в неизменяемую историю", integrityOk: "Цепочка истории подтверждена", integrityBad: "Нарушена целостность истории. Изменения заблокированы.", history: "История изменений", noHistory: "Изменений пока нет. Все функции используют безопасное состояние по умолчанию.", version: "Версия", actor: "Оператор" },
  uz: { skip: "Asosiy mazmunga o‘tish", title: "Funksiyalarni favqulodda boshqarish", secure: "Himoyalangan ish maydoni", fresh: "Yaqindagi 2FA", environment: "Muhit", refresh: "Yangilash", enabled: "Ishlayapti", disabled: "Vaqtincha to‘xtatilgan", disable: "To‘xtatish", enable: "Qayta yoqish", reason: "O‘zgarish sababi", reasonHint: "Kamida 10 ta belgi. Sirlar yoki foydalanuvchi ma’lumotlarini kiritmang.", save: "O‘zgarishni yozish", saved: "O‘zgarish o‘zgarmas tarixga yozildi", integrityOk: "Tarix zanjiri tasdiqlandi", integrityBad: "Tarix yaxlitligi buzilgan. O‘zgarishlar bloklandi.", history: "O‘zgarishlar tarixi", noHistory: "Hali o‘zgarish yo‘q. Barcha funksiyalar xavfsiz standart holatda.", version: "Versiya", actor: "Operator" },
} as const;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
  return body;
}

export function FeatureFlagConsole({ locale, staffName, initial }: { locale: OperationalLocale; staffName: string; initial: Dashboard }) {
  const t = copy[locale];
  const [dashboard, setDashboard] = useState(initial);
  const [selectedKey, setSelectedKey] = useState<OperationalFeatureKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedKey) reasonRef.current?.focus();
  }, [selectedKey]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setDashboard(await readJson<Dashboard>(await fetch("/api/platform/admin/feature-flags", { cache: "no-store" })));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FEATURE_FLAGS_LOAD_FAILED");
    } finally { setBusy(false); }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedKey || !dashboard.integrity.valid) return;
    const form = new FormData(event.currentTarget);
    const current = dashboard.features.find((feature) => feature.key === selectedKey);
    if (!current) return;
    setBusy(true);
    try {
      await readJson(await fetch("/api/platform/admin/feature-flags", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ key: selectedKey, enabled: !current.enabled, reason: form.get("reason") }),
      }));
      setSelectedKey(null);
      setNotice(t.saved);
      setError("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FEATURE_FLAG_SAVE_FAILED");
    } finally { setBusy(false); }
  }

  const selected = dashboard.features.find((feature) => feature.key === selectedKey);
  return <div className="staff-console" aria-busy={busy}>
    <a className="staff-skip" href="#feature-flags-main">{t.skip}</a>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div><div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div><a href={`/${locale === "ru" ? "uz" : "ru"}/admin/feature-flags`} hrefLang={locale === "ru" ? "uz" : "ru"}>{locale === "ru" ? "UZ" : "RU"}</a></header>
    <main id="feature-flags-main" className="staff-main feature-flags-main">
      <section className="staff-heading"><div><span>{t.environment}: {dashboard.environment}</span><h1>{t.title}</h1><p className={dashboard.integrity.valid ? "feature-integrity-ok" : "feature-integrity-error"}>{dashboard.integrity.valid ? t.integrityOk : t.integrityBad} ({dashboard.integrity.checked})</p></div><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></section>
      <p className="sr-only" aria-live="polite">{notice}</p>{error ? <p className="staff-error" role="alert">{error}</p> : null}
      <section className="feature-flag-list" aria-label={t.title}>
        {dashboard.features.map((feature) => <article className={feature.enabled ? "is-enabled" : "is-disabled"} key={feature.key}>
          <div>{feature.enabled ? <CheckCircle2 aria-hidden="true"/> : <CircleOff aria-hidden="true"/>}<span><b>{labels[locale][feature.key]}</b><small>{feature.enabled ? t.enabled : t.disabled} · {t.version} {feature.version}</small></span></div>
          <button type="button" onClick={() => { setNotice(""); setSelectedKey(feature.key); }} disabled={busy || !dashboard.integrity.valid}>{feature.enabled ? t.disable : t.enable}</button>
        </article>)}
      </section>
      {selected ? <form className="staff-decision feature-flag-form" onSubmit={(event) => void submit(event)}>
        <h2>{selected.enabled ? t.disable : t.enable}: {labels[locale][selected.key]}</h2>
        <label>{t.reason}<textarea ref={reasonRef} name="reason" required minLength={10} maxLength={500} aria-describedby="feature-reason-hint"/></label>
        <small id="feature-reason-hint">{t.reasonHint}</small>
        <div><button type="button" className="staff-reject" onClick={() => setSelectedKey(null)} disabled={busy}>{locale === "ru" ? "Отмена" : "Bekor qilish"}</button><button className="staff-approve" disabled={busy || !dashboard.integrity.valid}>{t.save}</button></div>
      </form> : null}
      <section className="feature-history"><h2>{t.history}</h2>{dashboard.history.length ? <div role="table"><div className="feature-history-head" role="row"><span role="columnheader">{t.version}</span><span role="columnheader">{t.title}</span><span role="columnheader">{t.actor}</span><span role="columnheader">UTC</span></div>{dashboard.history.slice(0, 100).map((item) => <div className="feature-history-row" role="row" key={item.id}><span role="cell">{item.version}</span><span role="cell"><b>{labels[locale][item.key]}</b><small>{item.enabled ? t.enabled : t.disabled}: {item.reason}</small></span><span role="cell"><code>{item.actorUserId}</code></span><time role="cell" dateTime={item.createdAt ?? undefined}>{item.createdAt ?? "-"}</time></div>)}</div> : <p className="staff-empty">{t.noHistory}</p>}</section>
    </main>
  </div>;
}
