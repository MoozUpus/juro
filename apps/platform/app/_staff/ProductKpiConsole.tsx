import { BarChart3, RefreshCw, ShieldCheck } from "lucide-react";

import type { ProductKpiDashboard, ProductKpiReadiness } from "../../lib/analytics/product-kpis";

type Locale = "ru" | "uz";

const copy = {
  ru: {
    skip: "К метрикам",
    secure: "Защищённая рабочая зона",
    fresh: "Недавняя 2FA",
    eyebrow: "Продуктовая аналитика",
    environment: "Среда",
    title: "Активация и подтверждённая ценность",
    intro: "Агрегаты вычисляются внутри D1. Идентификаторы пользователей, контакты и содержимое дел или ответов наружу не возвращаются.",
    refresh: "Обновить",
    costs: "Стоимость AI",
    jobs: "Задачи",
    audit: "Аудит",
    activation: "Зрелая 30-дневная когорта",
    cohort: "Когорта",
    eligible: "Завершили регистрацию",
    activated: "Получили ценность за 7 дней",
    activationRate: "Verified activation rate",
    p50: "TTFV p50",
    p75: "TTFV p75",
    p95: "TTFV p95",
    pathways: "Квалифицирующие пути",
    grounded: "Валидированный AI-ответ с источником",
    analysis: "Завершённый анализ документа",
    casePlan: "Созданные дело и план",
    pathwaysNote: "Один пользователь может попасть в несколько путей; общий activated считается один раз по самому раннему результату.",
    workflows: "Операционные воронки за 30 дней",
    plansCreated: "Планы созданы",
    plansCompleted: "Планы завершены",
    planRate: "Plan completion",
    requestsCreated: "Заявки юристам",
    requestsAccepted: "Приняты или дошли дальше",
    requestsCompleted: "Завершены",
    requestRate: "Acceptance rate",
    method: "Границы доказательства",
    methodText: "Из когорт исключены legal-eval, синтетический investor-demo и действующие сотрудники платформы. Ставки и TTFV скрываются до 5 наблюдений; статус достаточной сопоставимой выборки требует 30. Метрики показывают сохранённые рабочие результаты, но сами по себе не доказывают юридическое качество.",
    noData: "Нет данных",
    privacy: "Скрыто: выборка меньше 5",
    insufficient: "Недостаточная выборка",
    ready: "Сопоставимая выборка",
    asOf: "Срез",
  },
  uz: {
    skip: "Ko‘rsatkichlarga o‘tish",
    secure: "Himoyalangan ish maydoni",
    fresh: "Yaqindagi 2FA",
    eyebrow: "Mahsulot tahlili",
    environment: "Muhit",
    title: "Faollashuv va tasdiqlangan qiymat",
    intro: "Agregatlar D1 ichida hisoblanadi. Foydalanuvchi identifikatorlari, kontaktlar hamda ish yoki javob mazmuni tashqariga qaytarilmaydi.",
    refresh: "Yangilash",
    costs: "AI xarajati",
    jobs: "Vazifalar",
    audit: "Audit",
    activation: "Yetilgan 30 kunlik kohorta",
    cohort: "Kohorta",
    eligible: "Ro‘yxatdan o‘tishni tugatganlar",
    activated: "7 kunda qiymat olganlar",
    activationRate: "Verified activation rate",
    p50: "TTFV p50",
    p75: "TTFV p75",
    p95: "TTFV p95",
    pathways: "Malakali yo‘llar",
    grounded: "Manbali va tekshirilgan AI javobi",
    analysis: "Tugallangan hujjat tahlili",
    casePlan: "Yaratilgan ish va reja",
    pathwaysNote: "Bitta foydalanuvchi bir nechta yo‘lga kirishi mumkin; umumiy activated eng erta natija bo‘yicha bir marta sanaladi.",
    workflows: "30 kunlik operatsion voronkalar",
    plansCreated: "Rejalar yaratildi",
    plansCompleted: "Rejalar tugallandi",
    planRate: "Plan completion",
    requestsCreated: "Yurist so‘rovlari",
    requestsAccepted: "Qabul qilingan yoki keyingi bosqichda",
    requestsCompleted: "Tugallangan",
    requestRate: "Acceptance rate",
    method: "Dalil chegaralari",
    methodText: "Legal-eval, sintetik investor-demo va faol platforma xodimlari kohortadan chiqarilgan. Stavka va TTFV 5 kuzatuvgacha yashiriladi; taqqoslanadigan namuna holati uchun 30 ta kerak. Ko‘rsatkichlar saqlangan ish natijalarini ko‘rsatadi, ammo o‘z-o‘zidan yuridik sifatni isbotlamaydi.",
    noData: "Ma’lumot yo‘q",
    privacy: "Yashirilgan: namuna 5 dan kam",
    insufficient: "Namuna yetarli emas",
    ready: "Taqqoslanadigan namuna",
    asOf: "Kesim",
  },
} as const;

function percent(value: number | null): string {
  return value === null ? "—" : `${(value / 100).toFixed(1)}%`;
}

function duration(value: number | null): string {
  if (value === null) return "—";
  if (value < 60) return `${value}s`;
  if (value < 3_600) return `${Math.round(value / 60)}m`;
  return `${(value / 3_600).toFixed(1)}h`;
}

function dateTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}

export function ProductKpiConsole({
  locale,
  staffName,
  environment,
  dashboard,
}: {
  locale: Locale;
  staffName: string;
  environment: "development" | "staging" | "production";
  dashboard: ProductKpiDashboard;
}) {
  const t = copy[locale];
  const readinessLabel: Record<ProductKpiReadiness, string> = {
    no_data: t.noData,
    privacy_threshold: t.privacy,
    insufficient_sample: t.insufficient,
    ready: t.ready,
  };
  const activation = dashboard.activation;
  const workflows = dashboard.workflows;
  const otherLocale = locale === "ru" ? "uz" : "ru";
  return <div className="staff-console">
    <a className="staff-skip" href="#product-kpis-main">{t.skip}</a>
    <header className="staff-topbar">
      <div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div>
      <div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div>
      <a href={`/${otherLocale}/admin/product-kpis`} hrefLang={otherLocale}>{otherLocale.toUpperCase()}</a>
    </header>
    <main className="staff-main jobs-main" id="product-kpis-main">
      <section className="staff-heading">
        <div>
          <span>{t.eyebrow} · {t.environment}: {environment}</span>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <nav className="jobs-heading-actions" aria-label={t.eyebrow}>
          <a href={`/${locale}/admin/costs`}>{t.costs}</a>
          <a href={`/${locale}/admin/jobs`}>{t.jobs}</a>
          <a href={`/${locale}/admin/audit-log`}>{t.audit}</a>
          <a href={`/${locale}/admin/product-kpis`}><RefreshCw aria-hidden="true"/>{t.refresh}</a>
        </nav>
      </section>

      <section className="jobs-summary" aria-labelledby="activation-heading">
        <h2 id="activation-heading">{t.activation}</h2>
        <p className="staff-count">{t.cohort}: <time dateTime={activation.cohortStartedAt}>{dateTime(activation.cohortStartedAt, locale)}</time> — <time dateTime={activation.cohortEndedAt}>{dateTime(activation.cohortEndedAt, locale)}</time> · {readinessLabel[activation.readiness]}</p>
        <div>
          <article><span>{t.eligible}</span><b>{activation.eligibleSignups}</b></article>
          <article><span>{t.activated}</span><b>{activation.activatedSignups}</b></article>
          <article><span>{t.activationRate}</span><b>{percent(activation.rateBasisPoints)}</b></article>
          <article><span>{t.p50}</span><b>{duration(activation.ttfvSeconds.p50)}</b></article>
          <article><span>{t.p75}</span><b>{duration(activation.ttfvSeconds.p75)}</b></article>
          <article><span>{t.p95}</span><b>{duration(activation.ttfvSeconds.p95)}</b></article>
        </div>
      </section>

      <section className="jobs-summary" aria-labelledby="pathways-heading">
        <h2 id="pathways-heading">{t.pathways}</h2>
        <div>
          <article><BarChart3 aria-hidden="true"/><span>{t.grounded}</span><b>{activation.qualifyingUsers.groundedAnswer}</b></article>
          <article><span>{t.analysis}</span><b>{activation.qualifyingUsers.documentAnalysis}</b></article>
          <article><span>{t.casePlan}</span><b>{activation.qualifyingUsers.caseWithPlan}</b></article>
        </div>
        <p className="staff-count">{t.pathwaysNote}</p>
      </section>

      <section className="jobs-summary" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading">{t.workflows}</h2>
        <div>
          <article><span>{t.plansCreated}</span><b>{workflows.plans.created}</b></article>
          <article><span>{t.plansCompleted}</span><b>{workflows.plans.completed}</b></article>
          <article><span>{t.planRate}</span><b>{percent(workflows.plans.completionRateBasisPoints)}</b></article>
          <article><span>{t.requestsCreated}</span><b>{workflows.lawyerRequests.created}</b></article>
          <article><span>{t.requestsAccepted}</span><b>{workflows.lawyerRequests.acceptedOrLater}</b></article>
          <article><span>{t.requestsCompleted}</span><b>{workflows.lawyerRequests.completed}</b></article>
          <article><span>{t.requestRate}</span><b>{percent(workflows.lawyerRequests.acceptanceRateBasisPoints)}</b></article>
        </div>
      </section>

      <section className="staff-sync" aria-labelledby="method-heading">
        <div><h2 id="method-heading">{t.method}</h2><p>{t.methodText}</p></div>
        <p className="staff-count">{t.asOf}: <time dateTime={dashboard.asOf}>{dateTime(dashboard.asOf, locale)}</time></p>
      </section>
    </main>
  </div>;
}
