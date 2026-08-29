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
    engagedReturn: "Возврат после первой ценности",
    returnCohort: "Зрелая когорта",
    returnActivated: "Получили первую ценность",
    returned: "Вернулись к осмысленному действию",
    returnRate: "7-day engaged return",
    returnNote: "Возврат — новое явное действие пользователя в другой UTC-день в течение 7 дней после первой ценности. Фоновое обновление сессии и пассивный просмотр не засчитываются.",
    answerFunnel: "Первый вопрос → ответ → открытый источник",
    questionCohort: "Когорта первого вопроса",
    firstQuestions: "Задали первый вопрос",
    answeredQuestions: "Получили валидированный ответ",
    openedSources: "Открыли источник",
    answerCompletion: "Question-to-answer completion",
    answerDropOff: "Отсев до ответа",
    sourceOpenRate: "Answer-to-source open",
    sourceDropOff: "Отсев до открытия источника",
    answerFunnelNote: "Воронка связывает первый вопрос с его точным завершённым ответом за 7 дней, а ответ — с первым авторизованным открытием его источника ещё за 7 дней. Исторические обезличенные события не выдаются за пользователей.",
    feedbackQuality: "Пользовательские сигналы качества за 30 дней",
    feedbackWindow: "Окно отзывов",
    feedbackSubmitted: "Сохранённые типы отзывов",
    feedbackHelpful: "Полезно",
    feedbackPartial: "Частичные замечания",
    feedbackErrors: "Сообщения об ошибках",
    feedbackErrorRate: "User-reported error rate",
    feedbackOutdated: "Сигналы «устарело»",
    feedbackQualityNote: "Один тип отзыва на один ответ считается один раз. Комментарии и содержимое ответов не читаются и не возвращаются. Сигнал «устарело» — сообщение пользователя, а не подтверждённое состояние источника.",
    lawyerEscalation: "Первый результат → заявка юристу",
    escalationCohort: "Когорта первого результата",
    eligibleOutcomes: "Получили первый результат",
    escalatingUsers: "Создали заявку за 7 дней",
    escalationRate: "Lawyer escalation rate",
    firstGrounded: "Первый результат: AI-ответ",
    firstAnalysis: "Первый результат: анализ",
    firstCase: "Первый результат: дело",
    escalationNote: "Когорта закрепляется самым ранним валидированным AI-ответом, завершённым анализом или созданным делом. Повторные результаты её не сдвигают; заявка должна принадлежать тому же пользователю и появиться не позже 7 дней.",
    workflows: "Операционные воронки за 30 дней",
    plansCreated: "Планы созданы",
    plansCompleted: "Планы завершены",
    planRate: "Plan completion",
    requestsCreated: "Заявки юристам",
    requestsAccepted: "Приняты или дошли дальше",
    requestsCompleted: "Завершены",
    requestRate: "Acceptance rate",
    marketplace: "Каталог юристов → заявка",
    marketplaceCohort: "Когорта первого просмотра",
    directoryVisitors: "Уникально открыли каталог",
    requestingVisitors: "Создали заявку за 7 дней",
    marketplaceRate: "Browse-to-request conversion",
    marketplaceNote: "Просмотр дедуплицируется по пользователю и UTC-дню; в отчёт попадают только агрегаты. Первый просмотр закрепляет когорту, повторный вход её не переносит.",
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
    engagedReturn: "Birinchi qiymatdan keyingi qaytish",
    returnCohort: "Yetilgan kohorta",
    returnActivated: "Birinchi qiymatni olganlar",
    returned: "Mazmunli harakatga qaytganlar",
    returnRate: "7-day engaged return",
    returnNote: "Qaytish — birinchi qiymatdan keyin 7 kun ichida boshqa UTC kunida foydalanuvchining yangi aniq harakati. Fon seansi yangilanishi va passiv ko‘rish hisoblanmaydi.",
    answerFunnel: "Birinchi savol → javob → ochilgan manba",
    questionCohort: "Birinchi savol kohortasi",
    firstQuestions: "Birinchi savolni berganlar",
    answeredQuestions: "Tekshirilgan javob olganlar",
    openedSources: "Manbani ochganlar",
    answerCompletion: "Question-to-answer completion",
    answerDropOff: "Javobgacha chiqib ketish",
    sourceOpenRate: "Answer-to-source open",
    sourceDropOff: "Manba ochilishigacha chiqib ketish",
    answerFunnelNote: "Voronka birinchi savolni 7 kun ichidagi uning aniq tugallangan javobiga, javobni esa keyingi 7 kun ichidagi birinchi ruxsatli manba ochilishiga bog‘laydi. Tarixiy anonim hodisalar foydalanuvchi sifatida ko‘rsatilmaydi.",
    feedbackQuality: "30 kunlik foydalanuvchi sifat signallari",
    feedbackWindow: "Fikr-mulohaza oynasi",
    feedbackSubmitted: "Saqlangan fikr turlari",
    feedbackHelpful: "Foydali",
    feedbackPartial: "Qisman e’tirozlar",
    feedbackErrors: "Xato haqidagi xabarlar",
    feedbackErrorRate: "User-reported error rate",
    feedbackOutdated: "«Eskirgan» signallari",
    feedbackQualityNote: "Bitta javob uchun bitta fikr turi bir marta sanaladi. Izohlar va javob mazmuni o‘qilmaydi hamda qaytarilmaydi. «Eskirgan» signali — foydalanuvchi xabari, manba holatining tasdig‘i emas.",
    lawyerEscalation: "Birinchi natija → yurist so‘rovi",
    escalationCohort: "Birinchi natija kohortasi",
    eligibleOutcomes: "Birinchi natijani olganlar",
    escalatingUsers: "7 kunda so‘rov yaratganlar",
    escalationRate: "Lawyer escalation rate",
    firstGrounded: "Birinchi natija: AI javobi",
    firstAnalysis: "Birinchi natija: tahlil",
    firstCase: "Birinchi natija: ish",
    escalationNote: "Kohorta eng erta tekshirilgan AI javobi, tugallangan tahlil yoki yaratilgan ish bilan belgilanadi. Takroriy natijalar uni ko‘chirmaydi; so‘rov ayni foydalanuvchiga tegishli bo‘lib, 7 kundan kech yaratilmasligi kerak.",
    workflows: "30 kunlik operatsion voronkalar",
    plansCreated: "Rejalar yaratildi",
    plansCompleted: "Rejalar tugallandi",
    planRate: "Plan completion",
    requestsCreated: "Yurist so‘rovlari",
    requestsAccepted: "Qabul qilingan yoki keyingi bosqichda",
    requestsCompleted: "Tugallangan",
    requestRate: "Acceptance rate",
    marketplace: "Yuristlar katalogi → so‘rov",
    marketplaceCohort: "Birinchi ko‘rish kohortasi",
    directoryVisitors: "Katalogni noyob ochganlar",
    requestingVisitors: "7 kunda so‘rov yaratganlar",
    marketplaceRate: "Browse-to-request conversion",
    marketplaceNote: "Ko‘rish foydalanuvchi va UTC kuni bo‘yicha deduplikatsiya qilinadi; hisobotga faqat agregatlar chiqadi. Birinchi ko‘rish kohortani belgilaydi, takroriy kirish uni ko‘chirmaydi.",
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
  const engagedReturn = dashboard.engagedReturn;
  const answerFunnel = dashboard.answerFunnel;
  const feedbackQuality = dashboard.feedbackQuality;
  const lawyerEscalation = dashboard.lawyerEscalation;
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

      <section className="jobs-summary" aria-labelledby="engaged-return-heading">
        <h2 id="engaged-return-heading">{t.engagedReturn}</h2>
        <p className="staff-count">{t.returnCohort}: <time dateTime={engagedReturn.cohortStartedAt}>{dateTime(engagedReturn.cohortStartedAt, locale)}</time> — <time dateTime={engagedReturn.cohortEndedAt}>{dateTime(engagedReturn.cohortEndedAt, locale)}</time> · {readinessLabel[engagedReturn.readiness]}</p>
        <div>
          <article><span>{t.returnActivated}</span><b>{engagedReturn.activatedUsers}</b></article>
          <article><span>{t.returned}</span><b>{engagedReturn.returningUsers}</b></article>
          <article><span>{t.returnRate}</span><b>{percent(engagedReturn.rateBasisPoints)}</b></article>
        </div>
        <p className="staff-count">{t.returnNote}</p>
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

      <section className="jobs-summary" aria-labelledby="answer-funnel-heading">
        <h2 id="answer-funnel-heading">{t.answerFunnel}</h2>
        <p className="staff-count">{t.questionCohort}: <time dateTime={answerFunnel.cohortStartedAt}>{dateTime(answerFunnel.cohortStartedAt, locale)}</time> — <time dateTime={answerFunnel.cohortEndedAt}>{dateTime(answerFunnel.cohortEndedAt, locale)}</time> · {readinessLabel[answerFunnel.answerReadiness]} / {readinessLabel[answerFunnel.sourceReadiness]}</p>
        <div>
          <article><span>{t.firstQuestions}</span><b>{answerFunnel.firstQuestionUsers}</b></article>
          <article><span>{t.answeredQuestions}</span><b>{answerFunnel.answeredUsers}</b></article>
          <article><span>{t.openedSources}</span><b>{answerFunnel.sourceOpeningUsers}</b></article>
          <article><span>{t.answerCompletion}</span><b>{percent(answerFunnel.answerCompletionRateBasisPoints)}</b></article>
          <article><span>{t.answerDropOff}</span><b>{percent(answerFunnel.answerDropOffRateBasisPoints)}</b></article>
          <article><span>{t.sourceOpenRate}</span><b>{percent(answerFunnel.sourceOpenRateBasisPoints)}</b></article>
          <article><span>{t.sourceDropOff}</span><b>{percent(answerFunnel.sourceDropOffRateBasisPoints)}</b></article>
        </div>
        <p className="staff-count">{t.answerFunnelNote}</p>
      </section>

      <section className="jobs-summary" aria-labelledby="feedback-quality-heading">
        <h2 id="feedback-quality-heading">{t.feedbackQuality}</h2>
        <p className="staff-count">{t.feedbackWindow}: <time dateTime={feedbackQuality.windowStartedAt}>{dateTime(feedbackQuality.windowStartedAt, locale)}</time> — <time dateTime={feedbackQuality.windowEndedAt}>{dateTime(feedbackQuality.windowEndedAt, locale)}</time> · {readinessLabel[feedbackQuality.readiness]}</p>
        <div>
          <article><span>{t.feedbackSubmitted}</span><b>{feedbackQuality.submitted}</b></article>
          <article><span>{t.feedbackHelpful}</span><b>{feedbackQuality.helpful}</b></article>
          <article><span>{t.feedbackPartial}</span><b>{feedbackQuality.partial}</b></article>
          <article><span>{t.feedbackErrors}</span><b>{feedbackQuality.reportedErrors}</b></article>
          <article><span>{t.feedbackErrorRate}</span><b>{percent(feedbackQuality.userReportedErrorRateBasisPoints)}</b></article>
          <article><span>{t.feedbackOutdated}</span><b>{feedbackQuality.outdatedReports}</b></article>
        </div>
        <p className="staff-count">{t.feedbackQualityNote}</p>
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

      <section className="jobs-summary" aria-labelledby="lawyer-escalation-heading">
        <h2 id="lawyer-escalation-heading">{t.lawyerEscalation}</h2>
        <p className="staff-count">{t.escalationCohort}: <time dateTime={lawyerEscalation.cohortStartedAt}>{dateTime(lawyerEscalation.cohortStartedAt, locale)}</time> — <time dateTime={lawyerEscalation.cohortEndedAt}>{dateTime(lawyerEscalation.cohortEndedAt, locale)}</time> · {readinessLabel[lawyerEscalation.readiness]}</p>
        <div>
          <article><span>{t.eligibleOutcomes}</span><b>{lawyerEscalation.eligibleOutcomeUsers}</b></article>
          <article><span>{t.escalatingUsers}</span><b>{lawyerEscalation.escalatingUsers}</b></article>
          <article><span>{t.escalationRate}</span><b>{percent(lawyerEscalation.rateBasisPoints)}</b></article>
          <article><span>{t.firstGrounded}</span><b>{lawyerEscalation.firstOutcomeUsers.groundedAnswer}</b></article>
          <article><span>{t.firstAnalysis}</span><b>{lawyerEscalation.firstOutcomeUsers.documentAnalysis}</b></article>
          <article><span>{t.firstCase}</span><b>{lawyerEscalation.firstOutcomeUsers.caseCreated}</b></article>
        </div>
        <p className="staff-count">{t.escalationNote}</p>
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

      <section className="jobs-summary" aria-labelledby="marketplace-heading">
        <h2 id="marketplace-heading">{t.marketplace}</h2>
        <p className="staff-count">{t.marketplaceCohort}: <time dateTime={workflows.lawyerMarketplace.cohortStartedAt}>{dateTime(workflows.lawyerMarketplace.cohortStartedAt, locale)}</time> — <time dateTime={workflows.lawyerMarketplace.cohortEndedAt}>{dateTime(workflows.lawyerMarketplace.cohortEndedAt, locale)}</time> · {readinessLabel[workflows.lawyerMarketplace.readiness]}</p>
        <div>
          <article><span>{t.directoryVisitors}</span><b>{workflows.lawyerMarketplace.directoryVisitors}</b></article>
          <article><span>{t.requestingVisitors}</span><b>{workflows.lawyerMarketplace.requestingVisitors}</b></article>
          <article><span>{t.marketplaceRate}</span><b>{percent(workflows.lawyerMarketplace.conversionRateBasisPoints)}</b></article>
        </div>
        <p className="staff-count">{t.marketplaceNote}</p>
      </section>

      <section className="staff-sync" aria-labelledby="method-heading">
        <div><h2 id="method-heading">{t.method}</h2><p>{t.methodText}</p></div>
        <p className="staff-count">{t.asOf}: <time dateTime={dashboard.asOf}>{dateTime(dashboard.asOf, locale)}</time></p>
      </section>
    </main>
  </div>;
}
