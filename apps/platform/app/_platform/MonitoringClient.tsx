"use client";

import { usePlatformBasePath } from "./PlatformRouteContext";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated monitoring preferences are hydrated after the first browser render */

import {
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Gavel,
  LoaderCircle,
  Mail,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import {
  monitoringPreferencesAreInformationalOnly,
  normalizeMonitoringAudience,
  type MonitoringAudience,
} from "../../lib/platform/monitoring-preferences";

const topicKeys = [
  "civil",
  "contract",
  "labor",
  "family",
  "tax",
  "entrepreneurship",
  "corporate",
  "administrative",
  "consumer",
  "personal_data_it",
  "banking_finance",
] as const;

type Topic = typeof topicKeys[number];
type Preference = {
  audience: MonitoringAudience;
  topics: string[];
  channels: string[];
  frequency: "immediate" | "daily" | "weekly";
  locale: PlatformLocale;
  documentImpactConsent: boolean;
  updatedAt?: string;
  lastDeliveredAt?: string | null;
};
type MonitoringStatus = {
  integration: "not_configured" | "adapter_pending";
  automaticPublication: boolean;
  controlledBeta: boolean;
  emailConfigured: boolean;
  lastCheckedAt: string | null;
  verifiedSourceCount: number;
  trustedSourceCount: number;
  freshness: {
    state: "fresh" | "stale" | "unavailable";
    latestCheckedAt: string | null;
    ageDays: number | null;
    maxAgeDays: number;
    freshSourceCount: number;
    trustedSourceCount: number;
  };
};
type LegislationUpdate = {
  id: string;
  title: string;
  summary: string | null;
  changeSummary: string | null;
  recommendedAction: string | null;
  originalLanguage: string;
  topics: string[];
  affectedAudiences: string[];
  adoptedAt: string | null;
  effectiveAt: string | null;
  publishedAt: string;
  sourceTitle: string;
  sourceIdentifier: string | null;
  officialUrl: string;
  sourceRevisionDate: string | null;
  sourceLastCheckedAt: string | null;
  sourceStatus: string;
};

const copy = {
  ru: {
    eyebrow: "JURO · проверяемые обновления",
    title: "Мониторинг законодательства",
    intro: "Выберите области права. В контролируемой бета-версии JURO показывает только опубликованные записи с недавно проверенным официальным источником.",
    settings: "Настройки мониторинга",
    preferences: "Предпочтения мониторинга",
    preferencesHint: "Сохраняются только темы, аудитория и желаемая частота для текущего пространства.",
    preferenceOnlyNotice: "Автоматическая публикация или свежие проверенные источники сейчас недоступны. JURO не отправляет уведомления и не запускает проверку документов автоматически.",
    audience: "Кого затрагивают обновления",
    individual: "Физическое лицо",
    business: "Бизнес",
    topics: "Области права",
    channels: "Каналы",
    deliveryWhenActive: "Каналы доставки после включения мониторинга",
    deliveryInactive: "Автоматическая доставка отключена",
    inAppInactive: "Уведомления в приложении появятся только после включения мониторинга.",
    emailInactive: "Email не будет отправляться, пока мониторинг не станет активен.",
    inApp: "В приложении",
    email: "Email",
    emailUnavailable: "Email станет доступен после подключения почтовой инфраструктуры.",
    frequency: "Частота",
    frequencyWhenActive: "Желаемая частота после включения доставки",
    immediate: "Немедленно",
    daily: "Ежедневно",
    weekly: "Еженедельно",
    documentConsent: "Разрешить предлагать проверку выбранных мной документов при релевантном изменении закона.",
    consentHint: "JURO не сканирует все документы автоматически. Каждая проверка требует ваших прав доступа и отдельного запуска.",
    save: "Сохранить настройки",
    savePreferences: "Сохранить предпочтения",
    saved: "Настройки мониторинга сохранены.",
    savedPreferenceOnly: "Предпочтения сохранены. Автоматическая доставка пока отключена.",
    integrationOff: "Автоматическая интеграция с официальной лентой пока не подключена.",
    integrationPending: "Адаптер официальной ленты настроен, но автоматическая публикация ещё не разрешена.",
    honestStatus: "Автопубликация отключена. Лента — контролируемая бета-версия: она не доказывает полноту законодательства и показывает только записи с актуальной ручной проверкой источника.",
    controlledBeta: "Контролируемая бета-версия",
    fresh: "Показаны только свежие проверенные источники",
    stale: "Публикация скрыта: проверка источников устарела",
    unavailable: "Публикация скрыта: свежих проверенных источников нет",
    coverage: "Покрытие не является полным реестром законодательства.",
    feed: "Обновления · бета-версия",
    empty: "Свежих проверенных обновлений по выбранным темам пока нет",
    emptyHint: "JURO не создаёт демонстрационную ленту и не подставляет вымышленные даты.",
    lastCheck: "Последняя проверка источников",
    never: "ещё не выполнялась",
    sources: "Свежих проверенных источников",
    adopted: "Принят",
    effective: "Вступает в силу",
    changed: "Что изменилось",
    action: "Рекомендуемое действие",
    original: "Язык оригинала",
    official: "Официальный источник",
    checkDocuments: "Проверить мои документы",
    createTask: "Создать задачу",
    lawyer: "Передать юристу",
    retry: "Повторить",
  },
  uz: {
    eyebrow: "JURO · tekshiriladigan yangilanishlar",
    title: "Qonunchilik monitoringi",
    intro: "Huquq sohalarini tanlang. Nazorat qilinadigan beta-versiyada JURO faqat yaqinda tekshirilgan rasmiy manbaga bog‘langan e’lon qilingan yozuvlarni ko‘rsatadi.",
    settings: "Monitoring sozlamalari",
    preferences: "Monitoring afzalliklari",
    preferencesHint: "Faqat joriy makon uchun mavzular, auditoriya va kerakli tezlik sifatida saqlanadi.",
    preferenceOnlyNotice: "Avtomatik e’lon qilish yoki yangi tekshirilgan manbalar hozir mavjud emas. JURO bildirishnomalarni yubormaydi va hujjatlarni avtomatik tekshirmaydi.",
    audience: "Yangilanishlar kimga taalluqli",
    individual: "Jismoniy shaxs",
    business: "Biznes",
    topics: "Huquq sohalari",
    channels: "Kanallar",
    deliveryWhenActive: "Monitoring faollashgandagi yetkazib berish kanallari",
    deliveryInactive: "Avtomatik yetkazib berish o‘chirilgan",
    inAppInactive: "Monitoring faollashmaguncha ilova ichida bildirishnomalar kelmaydi.",
    emailInactive: "Monitoring faollashmaguncha email yuborilmaydi.",
    inApp: "Ilova ichida",
    email: "Email",
    emailUnavailable: "Email pochta infratuzilmasi ulangandan keyin mavjud bo‘ladi.",
    frequency: "Tezlik",
    frequencyWhenActive: "Yetkazib berish yoqilgandan keyingi kerakli tezlik",
    immediate: "Darhol",
    daily: "Har kuni",
    weekly: "Har hafta",
    documentConsent: "Qonundagi tegishli o‘zgarishda men tanlagan hujjatlarni tekshirishni taklif qilishga ruxsat berish.",
    consentHint: "JURO barcha hujjatlarni avtomatik skanerlamaydi. Har bir tekshiruv kirish huquqlaringiz va alohida ishga tushirishni talab qiladi.",
    save: "Sozlamalarni saqlash",
    savePreferences: "Afzalliklarni saqlash",
    saved: "Monitoring sozlamalari saqlandi.",
    savedPreferenceOnly: "Afzalliklar saqlandi. Avtomatik yetkazib berish hozir o‘chirilgan.",
    integrationOff: "Rasmiy lenta bilan avtomatik integratsiya hali ulanmagan.",
    integrationPending: "Rasmiy lenta adapteri sozlangan, ammo avtomatik e’lon qilishga hali ruxsat berilmagan.",
    honestStatus: "Avtomatik e’lon o‘chirilgan. Lenta — nazorat qilinadigan beta-versiya: u qonunchilik to‘liqligini isbotlamaydi va faqat manbasi yaqinda qo‘lda tekshirilgan yozuvlarni ko‘rsatadi.",
    controlledBeta: "Nazorat qilinadigan beta-versiya",
    fresh: "Faqat yangi tekshirilgan manbalar ko‘rsatiladi",
    stale: "Nashr yashirilgan: manbalar tekshiruvi eskirgan",
    unavailable: "Nashr yashirilgan: yangi tekshirilgan manbalar yo‘q",
    coverage: "Qamrov qonunchilikning to‘liq reyestri emas.",
    feed: "Yangilanishlar · beta-versiya",
    empty: "Tanlangan mavzular bo‘yicha yangi tekshirilgan yangilanishlar hozircha yo‘q",
    emptyHint: "JURO namoyish lentasini yaratmaydi va soxta sanalarni qo‘ymaydi.",
    lastCheck: "Manbalar oxirgi tekshirilgan vaqt",
    never: "hali bajarilmagan",
    sources: "Yangi tekshirilgan manbalar",
    adopted: "Qabul qilingan",
    effective: "Kuchga kiradi",
    changed: "Nima o‘zgardi",
    action: "Tavsiya etilgan harakat",
    original: "Asl til",
    official: "Rasmiy manba",
    checkDocuments: "Hujjatlarimni tekshirish",
    createTask: "Vazifa yaratish",
    lawyer: "Yuristga yuborish",
    retry: "Qayta urinish",
  },
} as const;

const topicLabels: Record<Topic, { ru: string; uz: string }> = {
  civil: { ru: "Гражданское право", uz: "Fuqarolik huquqi" },
  contract: { ru: "Договорное право", uz: "Shartnoma huquqi" },
  labor: { ru: "Трудовое право", uz: "Mehnat huquqi" },
  family: { ru: "Семейное право", uz: "Oila huquqi" },
  tax: { ru: "Налоговое право", uz: "Soliq huquqi" },
  entrepreneurship: { ru: "Предпринимательство", uz: "Tadbirkorlik" },
  corporate: { ru: "Корпоративное право", uz: "Korporativ huquq" },
  administrative: { ru: "Административное право", uz: "Ma’muriy huquq" },
  consumer: { ru: "Защита прав потребителей", uz: "Iste’molchilar huquqlarini himoya qilish" },
  personal_data_it: { ru: "Персональные данные и IT", uz: "Shaxsiy ma’lumotlar va IT" },
  banking_finance: { ru: "Банковское и финансовое регулирование", uz: "Bank va moliyaviy tartibga solish" },
};

const defaultStatus: MonitoringStatus = {
  integration: "not_configured",
  automaticPublication: false,
  controlledBeta: true,
  emailConfigured: false,
  lastCheckedAt: null,
  verifiedSourceCount: 0,
  trustedSourceCount: 0,
  freshness: {
    state: "unavailable",
    latestCheckedAt: null,
    ageDays: null,
    maxAgeDays: 7,
    freshSourceCount: 0,
    trustedSourceCount: 0,
  },
};

export function MonitoringClient({ locale, accountType }: { locale: PlatformLocale; accountType: AccountType }) {
  const t = copy[locale];
  const [preference, setPreference] = useState<Preference>({
    audience: normalizeMonitoringAudience(accountType),
    topics: ["civil", "contract"],
    channels: ["in_app"],
    frequency: "weekly",
    locale,
    documentImpactConsent: false,
  });
  const [status, setStatus] = useState<MonitoringStatus>(defaultStatus);
  const [updates, setUpdates] = useState<LegislationUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/platform/monitoring?locale=${locale}`, { cache: "no-store" });
      const body = await response.json() as {
        preference?: Preference | null;
        updates?: LegislationUpdate[];
        status?: MonitoringStatus;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || (locale === "ru" ? "Мониторинг не загрузился." : "Monitoring yuklanmadi."));
      if (body.preference) {
        setPreference({
          ...body.preference,
          audience: normalizeMonitoringAudience(body.preference.audience),
        });
      }
      setUpdates(body.updates ?? []);
      setStatus(body.status ?? defaultStatus);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  const selectedTopics = useMemo(() => new Set(preference.topics), [preference.topics]);
  const preferenceOnly = monitoringPreferencesAreInformationalOnly({
    automaticPublication: status.automaticPublication,
    controlledBeta: status.controlledBeta,
    freshnessState: status.freshness.state,
  });
  function toggleTopic(topic: Topic) {
    setPreference(current => ({
      ...current,
      topics: current.topics.includes(topic)
        ? current.topics.filter(item => item !== topic)
        : [...current.topics, topic],
    }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preference.topics.length) {
      setError(locale === "ru" ? "Выберите хотя бы одну область права." : "Kamida bitta huquq sohasini tanlang.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/monitoring", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ ...preference, locale }),
      });
      const body = await response.json() as { preference?: Preference; error?: string };
      if (!response.ok) throw new Error(body.error || (locale === "ru" ? "Настройки не сохранены." : "Sozlamalar saqlanmadi."));
      if (body.preference) {
        setPreference({
          ...body.preference,
          audience: normalizeMonitoringAudience(body.preference.audience),
        });
      }
      setNotice(preferenceOnly ? t.savedPreferenceOnly : t.saved);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="monitoring-workspace">
      <header>
        <Scale aria-hidden="true" />
        <div><small>{t.eyebrow}</small><h1>{t.title}</h1><p>{t.intro}</p></div>
      </header>

      {error && <p className="monitoring-message error" role="alert"><CircleAlert />{error}<button onClick={() => void load()}><RefreshCw />{t.retry}</button></p>}
      {notice && <p className="monitoring-message success" role="status"><CheckCircle2 />{notice}</p>}

      <section className="monitoring-status" aria-label={locale === "ru" ? "Статус интеграции" : "Integratsiya holati"}>
        <div className="monitoring-status-copy">
          {status.freshness.state === "fresh" ? <ShieldCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
          <div>
            <small>{t.controlledBeta}</small>
            <strong>{status.freshness.state === "fresh" ? t.fresh : status.freshness.state === "stale" ? t.stale : t.unavailable}</strong>
            <p>{status.integration === "not_configured" ? t.integrationOff : t.integrationPending} {t.honestStatus}</p>
          </div>
        </div>
        <dl>
          <div><dt>{t.lastCheck}</dt><dd>{status.lastCheckedAt ? formatDate(status.lastCheckedAt, locale, true) : t.never}</dd></div>
          <div><dt>{t.sources}</dt><dd>{status.verifiedSourceCount}</dd></div>
        </dl>
      </section>

      <div className="monitoring-layout">
        <form className="monitoring-settings" onSubmit={save}>
          <div className="monitoring-section-heading"><BellRing /><div><h2>{preferenceOnly ? t.preferences : t.settings}</h2><p>{preferenceOnly ? t.preferencesHint : (locale === "ru" ? "Настройки сохраняются только для текущего пространства." : "Sozlamalar faqat joriy makon uchun saqlanadi.")}</p></div></div>
          {preferenceOnly && <p className="monitoring-preference-note" role="note">{t.preferenceOnlyNotice}</p>}

          <fieldset>
            <legend>{t.audience}</legend>
            <div className="monitoring-segmented">
              <label className={preference.audience === "individual" ? "selected" : ""}><input type="radio" name="audience" value="individual" checked={preference.audience === "individual"} onChange={() => setPreference(current => ({ ...current, audience: "individual" }))} /><UserRound />{t.individual}</label>
              <label className={preference.audience === "business" ? "selected" : ""}><input type="radio" name="audience" value="business" checked={preference.audience === "business"} onChange={() => setPreference(current => ({ ...current, audience: "business" }))} /><BriefcaseBusiness />{t.business}</label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{t.topics}</legend>
            <div className="monitoring-topics">
              {topicKeys.map(topic => <label key={topic} className={selectedTopics.has(topic) ? "selected" : ""}><input type="checkbox" checked={selectedTopics.has(topic)} onChange={() => toggleTopic(topic)} /><span>{topicLabels[topic][locale]}</span></label>)}
            </div>
          </fieldset>

          <fieldset>
            <legend>{preferenceOnly ? t.deliveryWhenActive : t.channels}</legend>
            {preferenceOnly && <p className="monitoring-field-hint">{t.deliveryInactive}</p>}
            <div className="monitoring-channels">
              <label className={preferenceOnly ? "disabled" : ""}><input type="checkbox" checked={!preferenceOnly} readOnly disabled={preferenceOnly} /><BellRing /><span><strong>{t.inApp}</strong>{preferenceOnly && <small>{t.inAppInactive}</small>}</span></label>
              <label className={preferenceOnly || !status.emailConfigured ? "disabled" : ""}><input type="checkbox" checked={!preferenceOnly && preference.channels.includes("email")} disabled={preferenceOnly || !status.emailConfigured} onChange={event => setPreference(current => ({ ...current, channels: event.target.checked ? ["in_app", "email"] : ["in_app"] }))} /><Mail /><span><strong>{t.email}</strong>{preferenceOnly ? <small>{t.emailInactive}</small> : !status.emailConfigured && <small>{t.emailUnavailable}</small>}</span></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{preferenceOnly ? t.frequencyWhenActive : t.frequency}</legend>
            <div className="monitoring-segmented three">
              {(["immediate", "daily", "weekly"] as const).map(frequency => <label key={frequency} className={preference.frequency === frequency ? "selected" : ""}><input type="radio" name="frequency" value={frequency} checked={preference.frequency === frequency} onChange={() => setPreference(current => ({ ...current, frequency }))} /><CalendarClock />{t[frequency]}</label>)}
            </div>
          </fieldset>

          <label className="monitoring-consent"><input type="checkbox" checked={preference.documentImpactConsent} onChange={event => setPreference(current => ({ ...current, documentImpactConsent: event.target.checked }))} /><span><strong>{t.documentConsent}</strong><small>{t.consentHint}</small></span></label>
          <button className="monitoring-save" disabled={saving || loading}>{saving ? <LoaderCircle className="spin" /> : <Save />}{preferenceOnly ? t.savePreferences : t.save}</button>
        </form>

        <section className="monitoring-feed">
          <div className="monitoring-section-heading"><Gavel /><div><h2>{t.feed}</h2><p>{t.coverage}</p></div></div>
          {loading ? <div className="monitoring-loading"><LoaderCircle className="spin" /><span>{locale === "ru" ? "Проверяем сохранённые записи…" : "Saqlangan yozuvlar tekshirilmoqda…"}</span></div>
            : updates.length ? <div className="monitoring-updates">{updates.map(update => <UpdateCard key={update.id} update={update} locale={locale} />)}</div>
              : <div className="monitoring-empty"><Scale /><h3>{t.empty}</h3><p>{t.emptyHint}</p></div>}
        </section>
      </div>
    </section>
  );
}

function UpdateCard({ update, locale }: { update: LegislationUpdate; locale: PlatformLocale }) {
  const t = copy[locale];
  const base = usePlatformBasePath();
  return <article className="monitoring-update">
    <div className="monitoring-update-meta">
      {update.topics.map(topic => <span key={topic}>{topicLabels[topic as Topic]?.[locale] ?? topic}</span>)}
      <time>{formatDate(update.publishedAt, locale)}</time>
    </div>
    <h3>{update.title}</h3>
    {update.summary && <p>{update.summary}</p>}
    <dl>
      {update.adoptedAt && <div><dt>{t.adopted}</dt><dd>{formatDate(update.adoptedAt, locale)}</dd></div>}
      {update.effectiveAt && <div><dt>{t.effective}</dt><dd>{formatDate(update.effectiveAt, locale)}</dd></div>}
      <div><dt>{t.original}</dt><dd>{update.originalLanguage.toUpperCase()}</dd></div>
    </dl>
    {update.changeSummary && <section><h4>{t.changed}</h4><p>{update.changeSummary}</p></section>}
    {update.recommendedAction && <section><h4>{t.action}</h4><p>{update.recommendedAction}</p></section>}
    <a className="monitoring-source" href={update.officialUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /><span><strong>{t.official}</strong><small>{update.sourceTitle}{update.sourceIdentifier ? ` · ${update.sourceIdentifier}` : ""}</small></span></a>
    <div className="monitoring-update-actions">
      <Link href={`${base}/document-review`}><FileSearch />{t.checkDocuments}</Link>
      <Link href={`${base}/action-plan`}>{t.createTask}</Link>
      <Link href={`${base}/consultations`}>{t.lawyer}</Link>
    </div>
  </article>;
}

function formatDate(value: string, locale: PlatformLocale, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }
    : { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(date);
}
