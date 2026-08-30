"use client";

import { Activity, CircleCheckBig, Plus, RefreshCw, Send, ServerCog, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import type {
  StatusComponentKey,
  StatusImpact,
  StatusIncidentAdminDashboard,
  StatusIncidentState,
  StatusLocale,
} from "../../lib/operations/system-status";
import type {
  DependencyHealthEvidenceKind,
  DependencyHealthKey,
  DependencyHealthSnapshot,
  DependencyHealthState,
} from "../../lib/operations/dependency-health";

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

const dependencyLabels: Readonly<Record<DependencyHealthKey, { ru: string; uz: string }>> = {
  d1: { ru: "Основная база данных", uz: "Asosiy ma’lumotlar bazasi" },
  private_r2: { ru: "Защищённое файловое хранилище", uz: "Himoyalangan fayl ombori" },
  queues: { ru: "Фоновые очереди", uz: "Fon navbatlari" },
  queue_dlq: { ru: "Очередь ошибок", uz: "Xatolar navbati" },
  malware_scanner: { ru: "Проверка файлов", uz: "Fayllarni tekshirish" },
  openai: { ru: "OpenAI", uz: "OpenAI" },
  anthropic: { ru: "Anthropic", uz: "Anthropic" },
  resend: { ru: "Email-доставка", uz: "Email yetkazib berish" },
  legal_source_sync: { ru: "Синхронизация правовых источников", uz: "Huquqiy manbalarni sinxronlash" },
  document_analysis: { ru: "Анализ документов", uz: "Hujjatlarni tahlil qilish" },
  document_builder: { ru: "Генерация документов", uz: "Hujjatlarni yaratish" },
  lawyer_area: { ru: "Рабочая зона юристов", uz: "Yuristlar ish maydoni" },
};

const dependencyStateLabels: Readonly<Record<DependencyHealthState, { ru: string; uz: string }>> = {
  operational: { ru: "Работает", uz: "Ishlamoqda" },
  degraded: { ru: "Есть ограничение", uz: "Cheklov mavjud" },
  partial_outage: { ru: "Частично недоступно", uz: "Qisman ishlamayapti" },
  outage: { ru: "Недоступно", uz: "Ishlamayapti" },
  maintenance: { ru: "Технические работы", uz: "Texnik ishlar" },
  unknown: { ru: "Не проверено", uz: "Tekshirilmagan" },
  stale: { ru: "Проверка устарела", uz: "Tekshiruv eskirgan" },
};

const evidenceLabels: Readonly<Record<DependencyHealthEvidenceKind, { ru: string; uz: string }>> = {
  probe: { ru: "техническая проверка", uz: "texnik tekshiruv" },
  synthetic_probe: { ru: "синтетическая проверка", uz: "sintetik tekshiruv" },
  scheduled_job: { ru: "плановая задача", uz: "rejalashtirilgan vazifa" },
  manual_verification: { ru: "ручная проверка", uz: "qo‘lda tekshiruv" },
  integration_event: { ru: "подтверждённая операция", uz: "tasdiqlangan amal" },
};

const healthCopy = {
  ru: { title: "Автоматические проверки", intro: "Содержит только технические коды без текстов запросов, ответов, ключей и идентификаторов клиентов.", updated: "Снимок", working: "Работают", attention: "Требуют внимания", unverified: "Нет свежего подтверждения", checked: "Проверено", lastSuccess: "Последний успех", latency: "Задержка", evidence: "Основание", action: "Что сделать", noAction: "Действий не требуется. Следующая проверка подтвердит состояние автоматически.", never: "нет данных", lessMinute: "меньше минуты назад" },
  uz: { title: "Avtomatik tekshiruvlar", intro: "Faqat texnik kodlar ko‘rsatiladi; so‘rovlar, javoblar, kalitlar va mijoz identifikatorlari saqlanmaydi.", updated: "Holat vaqti", working: "Ishlamoqda", attention: "E’tibor talab qiladi", unverified: "Yangi tasdiq yo‘q", checked: "Tekshirildi", lastSuccess: "Oxirgi muvaffaqiyat", latency: "Kechikish", evidence: "Asos", action: "Nima qilish kerak", noAction: "Amal talab qilinmaydi. Keyingi tekshiruv holatni avtomatik tasdiqlaydi.", never: "ma’lumot yo‘q", lessMinute: "bir daqiqadan kam oldin" },
} as const;

type Dashboard = StatusIncidentAdminDashboard;

const dependencyStateRank: Readonly<Record<DependencyHealthState, number>> = {
  outage: 0,
  partial_outage: 1,
  degraded: 2,
  maintenance: 3,
  unknown: 4,
  stale: 5,
  operational: 6,
};

function formatDate(locale: StatusLocale, value: string | null, fallback: string): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}

function formatAge(locale: StatusLocale, ageMs: number | null, fallback: string, lessMinute: string): string {
  if (ageMs === null) return fallback;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return lessMinute;
  if (minutes < 60) return locale === "ru" ? `${minutes} мин назад` : `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "ru" ? `${hours} ч назад` : `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  return locale === "ru" ? `${days} дн назад` : `${days} kun oldin`;
}

function remediation(locale: StatusLocale, dependency: DependencyHealthSnapshot): string {
  const ru = locale === "ru";
  switch (dependency.safeErrorCode) {
    case "PROVIDER_CREDIT_BALANCE_LOW":
      return ru ? "Пополните баланс организации, которой принадлежит активный API-ключ, или подключите ключ оплаченной организации. Затем дождитесь следующей проверки." : "Faol API kaliti tegishli tashkilot balansini to‘ldiring yoki to‘langan tashkilot kalitini ulang. So‘ng keyingi tekshiruvni kuting.";
    case "PROVIDER_SPEND_LIMIT_REACHED":
      return ru ? "Проверьте лимит расходов организации и рабочей области провайдера. После изменения лимита дождитесь следующей проверки." : "Provayder tashkiloti va ish maydoni xarajat limitini tekshiring. Limit o‘zgargach, keyingi tekshiruvni kuting.";
    case "PROVIDER_BILLING_CONFIGURATION":
      return ru ? "Проверьте платёжный профиль и доступность биллинга в организации провайдера, связанной с активным ключом." : "Faol kalit bog‘langan provayder tashkilotining to‘lov profili va billing holatini tekshiring.";
    case "PROVIDER_WORKSPACE_CONFIGURATION":
      return ru ? "Сверьте рабочую область, права ключа и политику организации провайдера. Секреты на этом экране не показываются." : "Provayder ish maydoni, kalit huquqlari va tashkilot siyosatini tekshiring. Bu ekranda sirlar ko‘rsatilmaydi.";
    case "PROVIDER_REQUEST_CONFIGURATION":
      return ru ? "Проверьте разрешённую модель и технические параметры синтетической проверки перед следующим запуском." : "Keyingi ishga tushirishdan oldin ruxsat etilgan model va sintetik tekshiruv parametrlarini tekshiring.";
    case "PROBE_AUTH_ERROR":
      return ru ? "Проверьте срок действия и права активного ключа в защищённом хранилище, не копируя его в интерфейс или журнал." : "Faol kalitning amal qilish muddati va huquqlarini himoyalangan saqlash joyida tekshiring; uni interfeys yoki jurnalga ko‘chirmang.";
    case "PROBE_CONFIGURATION_ERROR":
      return ru ? "Проверьте обязательные настройки и привязки окружения, затем повторите безопасную проверку." : "Majburiy sozlamalar va muhit bog‘lanishlarini tekshiring, so‘ng xavfsiz tekshiruvni takrorlang.";
    case "PROVIDER_TIMEOUT":
    case "PROBE_TIMEOUT":
      return ru ? "Проверьте задержку провайдера и сеть. Если следующий замер не восстановится, создайте публичный инцидент." : "Provayder kechikishi va tarmoqni tekshiring. Keyingi o‘lchov tiklanmasa, ochiq hodisa yarating.";
    default:
      return dependency.state === "operational"
        ? healthCopy[locale].noAction
        : ru ? "Изучите связанный технический сервис. Если влияние подтверждено, создайте или обновите публичный инцидент." : "Bog‘liq texnik xizmatni tekshiring. Ta’sir tasdiqlansa, ochiq hodisa yarating yoki yangilang.";
  }
}

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
  const h = healthCopy[locale];
  const workingCount = dashboard.dependencies.filter((dependency) => dependency.state === "operational").length;
  const unverifiedCount = dashboard.dependencies.filter((dependency) => dependency.state === "unknown" || dependency.state === "stale").length;
  const attentionCount = dashboard.dependencies.length - workingCount - unverifiedCount;
  const sortedDependencies = [...dashboard.dependencies].sort((left, right) =>
    dependencyStateRank[left.state] - dependencyStateRank[right.state]
    || left.key.localeCompare(right.key));

  return <div className="staff-console" aria-busy={busy}>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div><div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div></header>
    <main className="staff-main status-admin-main">
      <section className="staff-heading"><div><p>{t.eyebrow}</p><h1>{t.title}</h1></div><div className="status-admin-heading-actions"><a href={`/${locale}/status`} target="_blank" rel="noreferrer">{t.publicLink}</a><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></div></section>
      <p className="sr-only" aria-live="polite">{notice}</p>{error ? <p className="staff-error" role="alert">{error}</p> : null}
      <section className="status-dependency-health" aria-labelledby="status-dependency-health-title" aria-live="polite">
        <header><div><span><ServerCog aria-hidden="true"/>{h.title}</span><h2 id="status-dependency-health-title">{h.title}</h2><p>{h.intro}</p></div><time dateTime={dashboard.generatedAt}>{h.updated}: {formatDate(locale, dashboard.generatedAt, h.never)}</time></header>
        <div className="status-dependency-summary">
          <article className="is-operational"><CircleCheckBig aria-hidden="true"/><span>{h.working}</span><b>{workingCount}</b></article>
          <article className="needs-attention"><TriangleAlert aria-hidden="true"/><span>{h.attention}</span><b>{attentionCount}</b></article>
          <article className="is-unverified"><RefreshCw aria-hidden="true"/><span>{h.unverified}</span><b>{unverifiedCount}</b></article>
        </div>
        <div className="status-dependency-list">
          {sortedDependencies.map((dependency) => <article className={`dependency-state-${dependency.state}`} key={dependency.key}>
            <header><div><b>{dependencyLabels[dependency.key][locale]}</b><code>{dependency.key}</code></div><span>{dependencyStateLabels[dependency.state][locale]}</span></header>
            <dl>
              <div><dt>{h.checked}</dt><dd><time dateTime={dependency.checkedAt ?? undefined}>{formatDate(locale, dependency.checkedAt, h.never)}</time><small>{formatAge(locale, dependency.checkAgeMs, h.never, h.lessMinute)}</small></dd></div>
              <div><dt>{h.lastSuccess}</dt><dd>{formatDate(locale, dependency.lastSuccessfulAt, h.never)}</dd></div>
              <div><dt>{h.latency}</dt><dd>{dependency.latencyMs === null ? "—" : `${dependency.latencyMs} ms`}</dd></div>
              <div><dt>{h.evidence}</dt><dd>{dependency.evidenceKind ? evidenceLabels[dependency.evidenceKind][locale] : h.never}</dd></div>
            </dl>
            <div className="status-dependency-action"><span>{h.action}</span>{dependency.safeErrorCode ? <code>{dependency.safeErrorCode}</code> : null}<p>{remediation(locale, dependency)}</p></div>
          </article>)}
        </div>
      </section>
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
