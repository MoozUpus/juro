"use client";

import {
  Activity,
  Clock3,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  ProductMetricSampleStatus,
  ProductMetricsDashboard,
  ThresholdedRate,
} from "../../lib/platform/product-metrics";

type Locale = "ru" | "uz";

const copy = {
  ru: {
    skip: "К основному содержимому",
    secure: "Защищённая рабочая зона",
    fresh: "Недавняя 2FA",
    eyebrow: "Продуктовая аналитика",
    title: "Ключевые метрики JURO",
    description: "Когортные показатели рассчитываются внутри D1. Идентификаторы аккаунтов не возвращаются и не попадают в Analytics Engine.",
    window: "Период",
    days: "дней",
    refresh: "Обновить",
    activation: "Активация ценности",
    activationHint: "Первый завершённый Legal Answer в течение 7 дней после регистрации",
    progression: "Переход в workflow",
    progressionHint: "Дело, план, запрос юристу или консультация за 7 дней после активации",
    journey: "Путь от вопроса к ответу",
    completionRate: "Завершение первого ответа",
    completionHint: "Первый валидированный ответ не позднее 7 дней после первого вопроса",
    dropOff: "Отток до ответа",
    dropOffHint: "Первый вопрос без валидированного ответа в полном 7-дневном окне",
    returnRate: "Возврат после активации",
    returnHint: "Новый вопрос или практическое действие через 24 часа и не позднее 14 дней",
    workflowOutcomes: "Практические результаты",
    caseCreation: "Создание дела",
    caseCreationHint: "Активированные аккаунты, создавшие дело в течение 7 дней",
    planCompletion: "Завершение плана",
    planCompletionHint: "Планы, завершённые не позднее 14 дней; отменённые шаги остаются в знаменателе",
    lawyerConversion: "Принятие заявки юристом",
    lawyerConversionHint: "Заявки с предоставленным доступом к делу в течение 14 дней",
    userError: "Ошибка по отзыву пользователя",
    userErrorHint: "Валидированные ответы с негативной категорией отзыва в течение 7 дней",
    cost: "Стоимость успешного ответа",
    costHint: "Затраты провайдеров Legal Chat / завершённые валидированные ответы",
    averageAttemptCost: "Средняя стоимость AI-вызова",
    averageAttemptCostHint: "Затраты / успешные вызовы провайдеров; только при полном прайсинге",
    ttfv: "Время до первой ценности",
    median: "Медиана",
    p95: "p95",
    reliability: "Надёжность AI",
    completion: "Завершение ответа",
    fallback: "Переключение провайдера",
    latency: "Задержка AI",
    endToEnd: "Полный ответ",
    firstUseful: "Первая полезная стадия",
    providers: "Доступность провайдеров",
    current: "Текущее состояние",
    observed: "Окно наблюдения",
    privacy: "Малые или выводимые когорты скрываются. Минимум: 10 аккаунтов для продуктовых KPI и 20 технических наблюдений для надёжности.",
    sufficient: "Достаточная выборка",
    insufficient: "Недостаточно данных",
    suppressed: "Скрыто порогом приватности",
    incomplete_pricing: "Не все вызовы имеют цену",
    incomplete_usage: "Учёт вызовов неполный",
    jobs: "Задания",
    costs: "Расходы AI",
    incidents: "Инциденты",
    noProviders: "За выбранный период нет проверок OpenAI или Anthropic.",
    environment: "Среда",
  },
  uz: {
    skip: "Asosiy mazmunga o‘tish",
    secure: "Himoyalangan ish maydoni",
    fresh: "Yaqindagi 2FA",
    eyebrow: "Mahsulot tahlili",
    title: "JURO asosiy ko‘rsatkichlari",
    description: "Kogorta ko‘rsatkichlari D1 ichida hisoblanadi. Hisob identifikatorlari qaytarilmaydi va Analytics Engine’ga yuborilmaydi.",
    window: "Davr",
    days: "kun",
    refresh: "Yangilash",
    activation: "Qiymat faollashuvi",
    activationHint: "Ro‘yxatdan o‘tgandan keyin 7 kun ichidagi birinchi yakunlangan Legal Answer",
    progression: "Workflow’ga o‘tish",
    progressionHint: "Faollashuvdan keyin 7 kun ichida ish, reja, yurist so‘rovi yoki maslahat",
    journey: "Savoldan javobgacha yo‘l",
    completionRate: "Birinchi javobni yakunlash",
    completionHint: "Birinchi savoldan keyin 7 kun ichida tekshirilgan javob",
    dropOff: "Javobgacha chiqib ketish",
    dropOffHint: "To‘liq 7 kunlik oynada tekshirilgan javobsiz qolgan birinchi savol",
    returnRate: "Faollashuvdan keyin qaytish",
    returnHint: "24 soatdan keyin va 14 kun ichida yangi savol yoki amaliy harakat",
    workflowOutcomes: "Amaliy natijalar",
    caseCreation: "Ish yaratish",
    caseCreationHint: "Faollashgan hisoblar 7 kun ichida ish yaratishi",
    planCompletion: "Rejani yakunlash",
    planCompletionHint: "14 kun ichida yakunlangan rejalar; bekor qilingan qadamlar maxrajda qoladi",
    lawyerConversion: "Yurist so‘rovini qabul qilish",
    lawyerConversionHint: "14 kun ichida ishga kirish huquqi berilgan so‘rovlar",
    userError: "Foydalanuvchi bildirgan xato",
    userErrorHint: "7 kun ichida salbiy fikr toifasi olingan tekshirilgan javoblar",
    cost: "Muvaffaqiyatli javob narxi",
    costHint: "Legal Chat provayder xarajati / yakunlangan va tekshirilgan javoblar",
    averageAttemptCost: "AI chaqiruvining o‘rtacha narxi",
    averageAttemptCostHint: "Xarajat / muvaffaqiyatli provayder chaqiruvlari; faqat to‘liq narxlashda",
    ttfv: "Birinchi qiymatgacha vaqt",
    median: "Mediana",
    p95: "p95",
    reliability: "AI ishonchliligi",
    completion: "Javobni yakunlash",
    fallback: "Provayderni almashtirish",
    latency: "AI kechikishi",
    endToEnd: "To‘liq javob",
    firstUseful: "Birinchi foydali bosqich",
    providers: "Provayderlar mavjudligi",
    current: "Joriy holat",
    observed: "Kuzatuv oynasi",
    privacy: "Kichik yoki hisoblab topiladigan kogortalar yashiriladi. Mahsulot KPI uchun kamida 10 hisob, ishonchlilik uchun 20 texnik kuzatuv talab qilinadi.",
    sufficient: "Tanlanma yetarli",
    insufficient: "Ma’lumot yetarli emas",
    suppressed: "Maxfiylik chegarasi bilan yashirilgan",
    incomplete_pricing: "Barcha chaqiruvlar narxlanmagan",
    incomplete_usage: "Chaqiruvlar hisobi to‘liq emas",
    jobs: "Vazifalar",
    costs: "AI xarajatlari",
    incidents: "Hodisalar",
    noProviders: "Tanlangan davrda OpenAI yoki Anthropic tekshiruvi yo‘q.",
    environment: "Muhit",
  },
} as const;

function percentage(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function duration(value: number | null, locale: Locale): string {
  if (value === null) return "—";
  const seconds = Math.round(value / 100) / 10;
  if (seconds < 60) return `${seconds.toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")} ${locale === "ru" ? "с" : "son"}`;
  const minutes = Math.round(seconds / 6) / 10;
  return `${minutes.toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")} ${locale === "ru" ? "мин" : "daq"}`;
}

function providerState(value: string, locale: Locale): string {
  const states = locale === "ru"
    ? { operational: "работает", degraded: "снижение качества", partial_outage: "частичный сбой", outage: "сбой", maintenance: "обслуживание", unknown: "неизвестно", stale: "данные устарели" }
    : { operational: "ishlamoqda", degraded: "sifat pasaygan", partial_outage: "qisman uzilish", outage: "uzilish", maintenance: "texnik xizmat", unknown: "noma’lum", stale: "ma’lumot eskirgan" };
  return states[value as keyof typeof states] ?? value;
}

function cost(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value / 1_000_000);
}

function statusLabel(
  status: ProductMetricSampleStatus,
  t: (typeof copy)[Locale],
): string {
  return t[status];
}

function MetricCard({
  icon,
  title,
  value,
  hint,
  status,
  statusText,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  hint: string;
  status: ProductMetricSampleStatus;
  statusText: string;
}) {
  return <article className="product-metric-card">
    <div className="product-metric-icon" aria-hidden="true">{icon}</div>
    <div><span>{title}</span><strong>{value}</strong><p>{hint}</p></div>
    <small data-status={status}>{statusText}</small>
  </article>;
}

function rateDetail(metric: ThresholdedRate): string {
  return metric.numerator !== null && metric.denominator !== null
    ? `${metric.numerator.toLocaleString("en-US")} / ${metric.denominator.toLocaleString("en-US")}`
    : `k ≥ ${metric.minimumSampleSize}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
  return body;
}

export function ProductMetricsConsole({
  locale,
  staffName,
  initial,
}: {
  locale: Locale;
  staffName: string;
  initial: ProductMetricsDashboard;
}) {
  const t = copy[locale];
  const [dashboard, setDashboard] = useState(initial);
  const [days, setDays] = useState(initial.window.days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh(nextDays = days) {
    setBusy(true);
    try {
      setDashboard(await readJson<ProductMetricsDashboard>(await fetch(
        `/api/platform/admin/product-metrics?days=${nextDays}`,
        { cache: "no-store" },
      )));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "PRODUCT_METRICS_UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  return <div className="staff-console product-metrics-console" aria-busy={busy}>
    <a className="staff-skip" href="#product-metrics-main">{t.skip}</a>
    <header className="staff-topbar">
      <div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div>
      <div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div>
      <a href={`/${locale === "ru" ? "uz" : "ru"}/admin/product-metrics`} hrefLang={locale === "ru" ? "uz" : "ru"}>{locale === "ru" ? "UZ" : "RU"}</a>
    </header>
    <main className="staff-main" id="product-metrics-main">
      <section className="staff-heading product-metrics-heading">
        <div><span>{t.eyebrow} · {t.environment}: {dashboard.environment}</span><h1>{t.title}</h1><p>{t.description}</p></div>
        <div className="product-metrics-actions">
          <nav aria-label="Admin"><a href={`/${locale}/admin/jobs`}>{t.jobs}</a><a href={`/${locale}/admin/costs`}>{t.costs}</a><a href={`/${locale}/admin/system-status`}>{t.incidents}</a></nav>
          <label>{t.window}<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={30}>30 {t.days}</option><option value={60}>60 {t.days}</option><option value={90}>90 {t.days}</option></select></label>
          <button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button>
        </div>
      </section>
      {error ? <p className="staff-error" role="alert">{error}</p> : null}
      <p className="product-metrics-privacy"><ShieldCheck aria-hidden="true"/>{t.privacy}</p>

      <section className="product-metrics-grid" aria-label={t.title}>
        <MetricCard icon={<TrendingUp/>} title={t.activation} value={percentage(dashboard.activation.rate)} hint={`${t.activationHint} · ${rateDetail(dashboard.activation)}`} status={dashboard.activation.status} statusText={statusLabel(dashboard.activation.status, t)}/>
        <MetricCard icon={<Gauge/>} title={t.progression} value={percentage(dashboard.workflowProgression.rate)} hint={`${t.progressionHint} · ${rateDetail(dashboard.workflowProgression)}`} status={dashboard.workflowProgression.status} statusText={statusLabel(dashboard.workflowProgression.status, t)}/>
        <MetricCard icon={<WalletCards/>} title={t.cost} value={cost(dashboard.successfulAnswerCost.microusdPerAnswer)} hint={`${t.costHint} · ${dashboard.successfulAnswerCost.completedAnswers ?? `k ≥ ${dashboard.successfulAnswerCost.minimumSampleSize}`}`} status={dashboard.successfulAnswerCost.status} statusText={statusLabel(dashboard.successfulAnswerCost.status, t)}/>
      </section>

      <section className="product-metrics-section" aria-labelledby="question-journey-title">
        <h2 id="question-journey-title">{t.journey}</h2>
        <div className="product-metrics-grid">
          <MetricCard icon={<Activity/>} title={t.completionRate} value={percentage(dashboard.questionJourney.completion.rate)} hint={`${t.completionHint} · ${rateDetail(dashboard.questionJourney.completion)}`} status={dashboard.questionJourney.completion.status} statusText={statusLabel(dashboard.questionJourney.completion.status, t)}/>
          <MetricCard icon={<Gauge/>} title={t.dropOff} value={percentage(dashboard.questionJourney.dropOff.rate)} hint={`${t.dropOffHint} · ${rateDetail(dashboard.questionJourney.dropOff)}`} status={dashboard.questionJourney.dropOff.status} statusText={statusLabel(dashboard.questionJourney.dropOff.status, t)}/>
          <MetricCard icon={<RefreshCw/>} title={t.returnRate} value={percentage(dashboard.returnRate.rate)} hint={`${t.returnHint} · ${rateDetail(dashboard.returnRate)}`} status={dashboard.returnRate.status} statusText={statusLabel(dashboard.returnRate.status, t)}/>
        </div>
      </section>

      <section className="product-metrics-section" aria-labelledby="workflow-outcomes-title">
        <h2 id="workflow-outcomes-title">{t.workflowOutcomes}</h2>
        <div className="product-metrics-grid product-metrics-grid-wide">
          <MetricCard icon={<TrendingUp/>} title={t.caseCreation} value={percentage(dashboard.caseCreation.rate)} hint={`${t.caseCreationHint} · ${rateDetail(dashboard.caseCreation)}`} status={dashboard.caseCreation.status} statusText={statusLabel(dashboard.caseCreation.status, t)}/>
          <MetricCard icon={<ShieldCheck/>} title={t.planCompletion} value={percentage(dashboard.planCompletion.rate)} hint={`${t.planCompletionHint} · ${rateDetail(dashboard.planCompletion)}`} status={dashboard.planCompletion.status} statusText={statusLabel(dashboard.planCompletion.status, t)}/>
          <MetricCard icon={<Activity/>} title={t.lawyerConversion} value={percentage(dashboard.lawyerConversion.rate)} hint={`${t.lawyerConversionHint} · ${rateDetail(dashboard.lawyerConversion)}`} status={dashboard.lawyerConversion.status} statusText={statusLabel(dashboard.lawyerConversion.status, t)}/>
          <MetricCard icon={<Gauge/>} title={t.userError} value={percentage(dashboard.userReportedError.rate)} hint={`${t.userErrorHint} · ${rateDetail(dashboard.userReportedError)}`} status={dashboard.userReportedError.status} statusText={statusLabel(dashboard.userReportedError.status, t)}/>
        </div>
      </section>

      <section className="product-metrics-secondary">
        <article className="product-metrics-panel">
          <h2><Clock3 aria-hidden="true"/>{t.ttfv}</h2>
          <div><span>{t.median}<strong>{duration(dashboard.timeToFirstValue.p50Ms, locale)}</strong></span><span>{t.p95}<strong>{duration(dashboard.timeToFirstValue.p95Ms, locale)}</strong></span></div>
          <small data-status={dashboard.timeToFirstValue.status}>{statusLabel(dashboard.timeToFirstValue.status, t)}</small>
        </article>
        <article className="product-metrics-panel">
          <h2><Activity aria-hidden="true"/>{t.reliability}</h2>
          <div><span>{t.completion}<strong>{percentage(dashboard.aiReliability.completion.rate)}</strong></span><span>{t.fallback}<strong>{percentage(dashboard.aiReliability.fallback.rate)}</strong></span></div>
          <small>{statusLabel(dashboard.aiReliability.completion.status, t)} · {statusLabel(dashboard.aiReliability.fallback.status, t)}</small>
        </article>
        <article className="product-metrics-panel">
          <h2><Clock3 aria-hidden="true"/>{t.latency}</h2>
          <div><span>{t.endToEnd} p50 / p95<strong>{duration(dashboard.aiReliability.latency.endToEndP50Ms, locale)} / {duration(dashboard.aiReliability.latency.endToEndP95Ms, locale)}</strong></span><span>{t.firstUseful} p50 / p95<strong>{duration(dashboard.aiReliability.latency.firstUsefulP50Ms, locale)} / {duration(dashboard.aiReliability.latency.firstUsefulP95Ms, locale)}</strong></span></div>
          <small data-status={dashboard.aiReliability.latency.status}>{statusLabel(dashboard.aiReliability.latency.status, t)}</small>
        </article>
        <article className="product-metrics-panel">
          <h2><WalletCards aria-hidden="true"/>{t.averageAttemptCost}</h2>
          <div><span>{t.averageAttemptCostHint}<strong>{cost(dashboard.averageAiAttemptCost.microusdPerAttempt)}</strong></span><span>{t.observed}<strong>{dashboard.averageAiAttemptCost.providerAttempts ?? `k ≥ ${dashboard.averageAiAttemptCost.minimumSampleSize}`}</strong></span></div>
          <small data-status={dashboard.averageAiAttemptCost.status}>{statusLabel(dashboard.averageAiAttemptCost.status, t)}</small>
        </article>
      </section>

      <section className="product-provider-panel" aria-labelledby="provider-availability-title">
        <h2 id="provider-availability-title">{t.providers}</h2>
        {dashboard.providerAvailability.length ? <div>{dashboard.providerAvailability.map((item) => <article key={item.provider}>
          <span><b>{item.provider === "openai" ? "OpenAI" : "Anthropic"}</b><small>{t.current}: {providerState(item.currentState, locale)}</small></span>
          <strong>{percentage(item.availability.rate)}</strong>
          <small>{t.observed}: {statusLabel(item.availability.status, t)} · <time dateTime={item.checkedAt}>{new Date(item.checkedAt).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</time></small>
        </article>)}</div> : <p className="staff-empty">{t.noProviders}</p>}
      </section>
    </main>
  </div>;
}
