"use client";

import { Activity, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import type {
  StatusComponentKey,
  StatusImpact,
  StatusIncidentAdminView,
  StatusIncidentState,
  StatusLocale,
} from "../../lib/operations/system-status";

const componentKeys: StatusComponentKey[] = [
  "platform", "otp", "ai", "document_analysis", "upload", "document_builder", "email", "lawyer_area",
];
const componentLabels = {
  ru: { platform: "Платформа", otp: "Вход и OTP", ai: "AI-юрист", document_analysis: "Анализ документов", upload: "Загрузка файлов", document_builder: "Конструктор документов", email: "Email", lawyer_area: "Работа с юристами" },
  uz: { platform: "Platforma", otp: "Kirish va OTP", ai: "AI-yurist", document_analysis: "Hujjatlar tahlili", upload: "Fayllarni yuklash", document_builder: "Hujjat konstruktori", email: "Email", lawyer_area: "Yuristlar bilan ishlash" },
} as const;
const copy = {
  ru: { title: "Статус и инциденты", eyebrow: "Операционный центр", secure: "Защищённая рабочая зона", fresh: "Недавняя 2FA", refresh: "Обновить", create: "Создать инцидент", titleRu: "Заголовок на русском", titleUz: "Заголовок на узбекском", summaryRu: "Публичное описание на русском", summaryUz: "Публичное описание на узбекском", messageRu: "Первое обновление на русском", messageUz: "Первое обновление на узбекском", startedAt: "Начало события", impact: "Влияние", components: "Затронутые компоненты", submit: "Опубликовать инцидент", active: "Активные", resolved: "Завершённые", empty: "Инцидентов нет", update: "Добавить обновление", state: "Следующий статус", send: "Опубликовать обновление", investigating: "Изучаем", identified: "Причина определена", monitoring: "Наблюдаем", resolvedState: "Устранено", degraded: "Сниженная производительность", partial_outage: "Частичная недоступность", outage: "Недоступно", maintenance: "Технические работы", saved: "Изменение сохранено", publicLink: "Открыть публичный статус" },
  uz: { title: "Holat va hodisalar", eyebrow: "Operatsion markaz", secure: "Himoyalangan ish maydoni", fresh: "Yaqindagi 2FA", refresh: "Yangilash", create: "Hodisa yaratish", titleRu: "Ruscha sarlavha", titleUz: "O‘zbekcha sarlavha", summaryRu: "Ruscha ochiq tavsif", summaryUz: "O‘zbekcha ochiq tavsif", messageRu: "Ruscha birinchi yangilanish", messageUz: "O‘zbekcha birinchi yangilanish", startedAt: "Hodisa boshlangan vaqt", impact: "Ta’sir", components: "Ta’sirlangan komponentlar", submit: "Hodisani e’lon qilish", active: "Faol", resolved: "Yakunlangan", empty: "Hodisalar yo‘q", update: "Yangilanish qo‘shish", state: "Keyingi holat", send: "Yangilanishni e’lon qilish", investigating: "O‘rganilmoqda", identified: "Sabab aniqlandi", monitoring: "Kuzatilmoqda", resolvedState: "Bartaraf etildi", degraded: "Ishlash sifati pasaygan", partial_outage: "Qisman ishlamayapti", outage: "Ishlamayapti", maintenance: "Texnik ishlar", saved: "O‘zgarish saqlandi", publicLink: "Ochiq holatni ko‘rish" },
} as const;

type Dashboard = { incidents: StatusIncidentAdminView[] };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
  return body;
}

function localInputNow(): string {
  const value = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return value.toISOString().slice(0, 16);
}

function nextStates(state: StatusIncidentState): Array<Exclude<StatusIncidentState, "investigating">> {
  if (state === "investigating") return ["identified", "monitoring", "resolved"];
  if (state === "identified") return ["monitoring", "resolved"];
  if (state === "monitoring") return ["resolved"];
  return [];
}

export function SystemStatusConsole({ locale, staffName, initial }: { locale: StatusLocale; staffName: string; initial: Dashboard }) {
  const t = copy[locale];
  const [dashboard, setDashboard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedComponents, setSelectedComponents] = useState<StatusComponentKey[]>(["platform"]);
  const [impact, setImpact] = useState<StatusImpact>("degraded");
  const [selectedIncident, setSelectedIncident] = useState<string>("");
  const [nextState, setNextState] = useState<Exclude<StatusIncidentState, "investigating">>("identified");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setDashboard(await readJson<Dashboard>(await fetch("/api/platform/admin/system-status", { cache: "no-store" })));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "STATUS_LOAD_FAILED");
    } finally { setBusy(false); }
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedComponents.length) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const startedAtMs = Date.parse(String(form.get("startedAt")));
    if (!Number.isFinite(startedAtMs)) {
      setError("SYSTEM_STATUS_INVALID");
      return;
    }
    const startedAt = new Date(startedAtMs).toISOString();
    setBusy(true);
    try {
      await readJson(await fetch("/api/platform/admin/system-status", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ action: "create", value: {
          titleRu: form.get("titleRu"), titleUz: form.get("titleUz"),
          summaryRu: form.get("summaryRu"), summaryUz: form.get("summaryUz"),
          messageRu: form.get("messageRu"), messageUz: form.get("messageUz"), startedAt,
          components: selectedComponents.map((key) => ({ key, impact })),
        } }),
      }));
      formElement.reset();
      setSelectedComponents(["platform"]);
      setNotice(t.saved);
      setError("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "STATUS_CREATE_FAILED");
    } finally { setBusy(false); }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!selectedIncident) return;
    setBusy(true);
    try {
      await readJson(await fetch("/api/platform/admin/system-status", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ action: "update", value: {
          incidentId: selectedIncident, state: nextState,
          messageRu: form.get("updateMessageRu"), messageUz: form.get("updateMessageUz"),
        } }),
      }));
      formElement.reset();
      setSelectedIncident("");
      setNotice(t.saved);
      setError("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "STATUS_UPDATE_FAILED");
    } finally { setBusy(false); }
  }

  const active = dashboard.incidents.filter((incident) => incident.state !== "resolved");
  const resolved = dashboard.incidents.filter((incident) => incident.state === "resolved");
  const selected = active.find((incident) => incident.id === selectedIncident);
  const allowedNext = selected ? nextStates(selected.state) : [];
  const stateLabel = (state: StatusIncidentState) => state === "resolved" ? t.resolvedState : t[state];

  return <div className="staff-console" aria-busy={busy}>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div><div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div></header>
    <main className="staff-main status-admin-main">
      <section className="staff-heading"><div><p>{t.eyebrow}</p><h1>{t.title}</h1></div><div className="status-admin-heading-actions"><a href={`/${locale}/status`} target="_blank" rel="noreferrer">{t.publicLink}</a><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></div></section>
      <p className="sr-only" aria-live="polite">{notice}</p>{error ? <p className="staff-error" role="alert">{error}</p> : null}
      <div className="status-admin-grid">
        <form className="staff-decision status-admin-form" onSubmit={(event) => void create(event)}>
          <h2><Plus aria-hidden="true"/>{t.create}</h2>
          <label>{t.titleRu}<input name="titleRu" required minLength={3} maxLength={140}/></label>
          <label>{t.titleUz}<input name="titleUz" required minLength={3} maxLength={140}/></label>
          <label>{t.summaryRu}<textarea name="summaryRu" required minLength={10} maxLength={2000}/></label>
          <label>{t.summaryUz}<textarea name="summaryUz" required minLength={10} maxLength={2000}/></label>
          <label>{t.messageRu}<textarea name="messageRu" required minLength={10} maxLength={2000}/></label>
          <label>{t.messageUz}<textarea name="messageUz" required minLength={10} maxLength={2000}/></label>
          <label>{t.startedAt}<input name="startedAt" type="datetime-local" defaultValue={localInputNow()} required/></label>
          <label>{t.impact}<select value={impact} onChange={(event) => setImpact(event.target.value as StatusImpact)}>{(["degraded", "partial_outage", "outage", "maintenance"] as StatusImpact[]).map((value) => <option key={value} value={value}>{t[value]}</option>)}</select></label>
          <fieldset><legend>{t.components}</legend><div className="status-component-checks">{componentKeys.map((key) => <label key={key}><input type="checkbox" checked={selectedComponents.includes(key)} onChange={(event) => setSelectedComponents((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))}/>{componentLabels[locale][key]}</label>)}</div></fieldset>
          <button className="staff-approve" disabled={busy || !selectedComponents.length}><Activity aria-hidden="true"/>{t.submit}</button>
        </form>
        <section className="status-admin-list" aria-label={t.active}>
          <h2>{t.active}</h2>
          {active.length ? active.map((incident) => <button type="button" className={selectedIncident === incident.id ? "selected" : ""} key={incident.id} onClick={() => { const candidates = nextStates(incident.state); setSelectedIncident(incident.id); setNextState(candidates[0] ?? "resolved"); }}><span>{incident.publicReference}</span><b>{locale === "uz" ? incident.titleUz : incident.titleRu}</b><small>{stateLabel(incident.state)} · {t[incident.severity]}</small></button>) : <p className="staff-empty">{t.empty}</p>}
          <h2>{t.resolved}</h2>
          {resolved.slice(0, 10).map((incident) => <article key={incident.id}><span>{incident.publicReference}</span><b>{locale === "uz" ? incident.titleUz : incident.titleRu}</b><small>{t.resolvedState}</small></article>)}
        </section>
      </div>
      {selected && allowedNext.length ? <form className="staff-decision status-update-form" onSubmit={(event) => void update(event)}>
        <h2><Send aria-hidden="true"/>{t.update}: {selected.publicReference}</h2>
        <label>{t.state}<select value={nextState} onChange={(event) => setNextState(event.target.value as typeof nextState)}>{allowedNext.map((state) => <option key={state} value={state}>{stateLabel(state)}</option>)}</select></label>
        <label>{t.messageRu}<textarea name="updateMessageRu" required minLength={10} maxLength={2000}/></label>
        <label>{t.messageUz}<textarea name="updateMessageUz" required minLength={10} maxLength={2000}/></label>
        <button className="staff-approve" disabled={busy}><Send aria-hidden="true"/>{t.send}</button>
      </form> : null}
    </main>
  </div>;
}
