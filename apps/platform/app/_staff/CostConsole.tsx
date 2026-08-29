"use client";

import {
  BarChart3,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UnlockKeyhole,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AiCostDashboard } from "../../lib/ai/provider-usage";

type Locale = "ru" | "uz";
type Provider = "openai" | "anthropic";

const copy = {
  ru: {
    title: "Стоимость и защита AI",
    eyebrow: "Операционная наблюдаемость",
    secure: "Защищённая рабочая зона",
    fresh: "Недавняя 2FA",
    refresh: "Обновить",
    productKpis: "Продуктовые KPI",
    unpriced: "Вызовы без цены",
    measurement: "Готовность измерения",
    coverage: "Покрытие ценами",
    costPerSuccess: "Стоимость успешного вызова",
    sample: "Сопоставимая выборка",
    measurementNoData: "Нет данных после начала окна цен",
    measurementIncomplete: "Есть успешные вызовы без цены",
    measurementPricingMismatch: "Расчёт использует неверную цену",
    measurementInsufficient: "Выборка ещё недостаточна",
    measurementReady: "Выборка собрана",
    measurementCaveat: "Готовая выборка позволяет сравнивать стоимость, но сама по себе не доказывает сохранение качества.",
    priceVerification: "Проверка цен OpenAI",
    priceVerificationReady: "Активные цены подтверждены",
    priceVerificationNeedsReview: "Нужна коррекция или повторная проверка",
    priceVerificationCaveat: "Проверка сопоставляет активные append-only версии с model-specific официальными источниками. Исторические оценки не переписываются.",
    expectedRate: "Официально input / cached / output, µUSD / 1 млн",
    activeRate: "Активно input / cached / output, µUSD / 1 млн",
    verificationStatus: "Проверка",
    verificationVerified: "Подтверждено",
    verificationMissing: "Активной версии нет",
    verificationSourceMissing: "Нет официального источника",
    verificationMismatch: "Тариф не совпадает",
    verificationReviewDue: "Срок повторной проверки",
    historicalMispriced: "Исторические вызовы с неверной оценкой",
    signals: "Операционные сигналы за окно",
    cacheHitRate: "Cache hit rate запросов",
    cachedTokenShare: "Доля cached input",
    cacheWrites: "Записано в prompt cache",
    deepEscalations: "Deep escalation",
    providerFallbacks: "Provider fallback",
    providerErrors: "Ошибки providers",
    averageLatency: "Средняя latency provider",
    signalCaveat: "Cache hit считается среди успешных вызовов с input tokens. Cache writes — только количество токенов статических системных инструкций, записанных Anthropic в 5-минутный кэш; пользовательский контент не кэшируется. Escalation и fallback считаются среди завершённых AI-чатов после входа; гостевой AI и анализ документов в этот знаменатель не входят.",
    protectionMissing: "Автозащита не настроена",
    protectionMissingDetail: "Укажите согласованный дневной бюджет и порог ошибок — без политики circuit не откроется автоматически.",
    prices: "Версии цен",
    usage: "Дневное использование",
    planUsage: "Расходы по тарифам",
    userUsage: "Расходы по пользователям",
    currentPlan: "Текущий тариф",
    users: "Пользователи",
    user: "Пользователь",
    workspace: "Workspace",
    guestOrSystem: "Гость / системный контур",
    unassignedPlan: "Тариф не назначен",
    planSnapshot: "Тариф — текущий снимок workspace на {date}; это не историческая атрибуция тарифа в момент вызова.",
    addPrice: "Добавить версию цены",
    provider: "Провайдер",
    model: "Модель",
    operation: "Операция",
    inputRate: "Input, µUSD / 1 млн токенов",
    outputRate: "Output, µUSD / 1 млн токенов",
    cachedRate: "Cached input, µUSD / 1 млн",
    effective: "Действует с",
    source: "Официальный URL цены",
    savePrice: "Сохранить неизменяемую цену",
    date: "Дата",
    feature: "Функция",
    requests: "Запросы",
    failures: "Ошибки",
    tokens: "Токены",
    cost: "Оценка, USD",
    noData: "Данных пока нет",
    priceSuccess: "Версия цены добавлена",
    protection: "Circuit breaker",
    policy: "Новая версия порогов",
    dailyLimit: "Дневной лимит, USD",
    failureLimit: "Ошибок за окно",
    window: "Окно, минут",
    enabled: "Автоматическая защита включена",
    savePolicy: "Сохранить версию порогов",
    policySuccess: "Версия порогов добавлена",
    scopePolicy: "Бюджет пользователя или функции",
    scopeType: "Область бюджета",
    scopeUser: "Технический пользователь",
    scopeFeature: "Функция",
    scopeKey: "Технический ID пользователя",
    monthlyLimit: "Месячный лимит, USD",
    enforcement: "Действие при достижении",
    alertOnly: "Только уведомить",
    disableDeep: "Отключить только Deep",
    blockCalls: "Остановить вызовы области",
    saveScopePolicy: "Сохранить scoped-бюджет",
    scopePolicySuccess: "Версия scoped-бюджета добавлена",
    scopedBudgets: "Активные бюджеты областей",
    dailySpend: "Сегодня / лимит",
    monthlySpend: "Месяц / лимит",
    pricingIncomplete: "Есть вызовы без цены",
    budgetEvents: "Срабатывания scoped-бюджетов",
    period: "Период",
    action: "Действие",
    open: "Открыт — вызовы заблокированы",
    closed: "Закрыт — вызовы разрешены",
    openAction: "Остановить провайдера",
    closeAction: "Возобновить после проверки",
    circuitSuccess: "Состояние circuit обновлено",
    latestPolicy: "Текущий порог",
    alerts: "Операционные уведомления",
    status: "Статус",
    reason: "Причина",
  },
  uz: {
    title: "AI xarajati va himoyasi",
    eyebrow: "Operatsion kuzatuv",
    secure: "Himoyalangan ish maydoni",
    fresh: "Yaqindagi 2FA",
    refresh: "Yangilash",
    productKpis: "Mahsulot KPI",
    unpriced: "Narxsiz chaqiruvlar",
    measurement: "O‘lchash tayyorligi",
    coverage: "Narx bilan qamrov",
    costPerSuccess: "Muvaffaqiyatli chaqiruv narxi",
    sample: "Taqqoslanadigan namuna",
    measurementNoData: "Narx oynasi boshlanganidan keyin ma’lumot yo‘q",
    measurementIncomplete: "Narxsiz muvaffaqiyatli chaqiruvlar bor",
    measurementPricingMismatch: "Hisob noto‘g‘ri narxdan foydalanmoqda",
    measurementInsufficient: "Namuna hali yetarli emas",
    measurementReady: "Namuna yig‘ildi",
    measurementCaveat: "Tayyor namuna xarajatni taqqoslashga imkon beradi, ammo sifat saqlanganini o‘zi isbotlamaydi.",
    priceVerification: "OpenAI narxlarini tekshirish",
    priceVerificationReady: "Faol narxlar tasdiqlangan",
    priceVerificationNeedsReview: "Tuzatish yoki qayta tekshirish kerak",
    priceVerificationCaveat: "Tekshiruv faol append-only versiyalarni modelga xos rasmiy manbalar bilan solishtiradi. Tarixiy baholar qayta yozilmaydi.",
    expectedRate: "Rasmiy input / cached / output, µUSD / 1 mln",
    activeRate: "Faol input / cached / output, µUSD / 1 mln",
    verificationStatus: "Tekshiruv",
    verificationVerified: "Tasdiqlangan",
    verificationMissing: "Faol versiya yo‘q",
    verificationSourceMissing: "Rasmiy manba yo‘q",
    verificationMismatch: "Tarif mos emas",
    verificationReviewDue: "Qayta tekshirish muddati",
    historicalMispriced: "Noto‘g‘ri baholangan tarixiy chaqiruvlar",
    signals: "Oyna bo‘yicha operatsion signallar",
    cacheHitRate: "So‘rovlar cache hit rate",
    cachedTokenShare: "Cached input ulushi",
    cacheWrites: "Prompt cache yozuvlari",
    deepEscalations: "Deep escalation",
    providerFallbacks: "Provider fallback",
    providerErrors: "Provider xatolari",
    averageLatency: "O‘rtacha provider latency",
    signalCaveat: "Cache hit input tokenlari bor muvaffaqiyatli chaqiruvlar orasida hisoblanadi. Cache writes faqat Anthropic 5 daqiqalik keshiga yozilgan statik tizim yo‘riqnomalari tokenlaridir; foydalanuvchi kontenti keshlanmaydi. Escalation va fallback faqat tizimga kirgandan keyingi yakunlangan AI-chatlar orasida hisoblanadi; mehmon AI va hujjat tahlili maxrajga kirmaydi.",
    protectionMissing: "Avtohimoya sozlanmagan",
    protectionMissingDetail: "Kelishilgan kunlik budjet va xato chegarasini kiriting — siyosatsiz circuit avtomatik ochilmaydi.",
    prices: "Narx versiyalari",
    usage: "Kunlik foydalanish",
    planUsage: "Tariflar bo‘yicha xarajat",
    userUsage: "Foydalanuvchilar bo‘yicha xarajat",
    currentPlan: "Joriy tarif",
    users: "Foydalanuvchilar",
    user: "Foydalanuvchi",
    workspace: "Workspace",
    guestOrSystem: "Mehmon / tizim konturi",
    unassignedPlan: "Tarif biriktirilmagan",
    planSnapshot: "Tarif {date} vaqtidagi workspace joriy holatidir; bu chaqiruv paytidagi tarixiy tarif atributsiyasi emas.",
    addPrice: "Narx versiyasini qo‘shish",
    provider: "Provayder",
    model: "Model",
    operation: "Operatsiya",
    inputRate: "Input, µUSD / 1 mln token",
    outputRate: "Output, µUSD / 1 mln token",
    cachedRate: "Cached input, µUSD / 1 mln",
    effective: "Amal qilish vaqti",
    source: "Rasmiy narx URL manzili",
    savePrice: "O‘zgarmas narxni saqlash",
    date: "Sana",
    feature: "Funksiya",
    requests: "So‘rovlar",
    failures: "Xatolar",
    tokens: "Tokenlar",
    cost: "Baholash, USD",
    noData: "Hozircha ma’lumot yo‘q",
    priceSuccess: "Narx versiyasi qo‘shildi",
    protection: "Circuit breaker",
    policy: "Yangi limit versiyasi",
    dailyLimit: "Kunlik limit, USD",
    failureLimit: "Oynadagi xatolar",
    window: "Oyna, daqiqa",
    enabled: "Avtomatik himoya yoqilgan",
    savePolicy: "Limit versiyasini saqlash",
    policySuccess: "Limit versiyasi qo‘shildi",
    scopePolicy: "Foydalanuvchi yoki funksiya budjeti",
    scopeType: "Budjet sohasi",
    scopeUser: "Texnik foydalanuvchi",
    scopeFeature: "Funksiya",
    scopeKey: "Foydalanuvchining texnik ID-si",
    monthlyLimit: "Oylik limit, USD",
    enforcement: "Limitga yetgandagi amal",
    alertOnly: "Faqat xabar berish",
    disableDeep: "Faqat Deep rejimini o‘chirish",
    blockCalls: "Soha chaqiruvlarini to‘xtatish",
    saveScopePolicy: "Scoped budjetni saqlash",
    scopePolicySuccess: "Scoped budjet versiyasi qo‘shildi",
    scopedBudgets: "Faol soha budjetlari",
    dailySpend: "Bugun / limit",
    monthlySpend: "Oy / limit",
    pricingIncomplete: "Narxsiz chaqiruvlar bor",
    budgetEvents: "Scoped budjet ishga tushishlari",
    period: "Davr",
    action: "Amal",
    open: "Ochiq — chaqiruvlar bloklangan",
    closed: "Yopiq — chaqiruvlarga ruxsat",
    openAction: "Provayderni to‘xtatish",
    closeAction: "Tekshiruvdan keyin tiklash",
    circuitSuccess: "Circuit holati yangilandi",
    latestPolicy: "Joriy limit",
    alerts: "Operatsion bildirishnomalar",
    status: "Holat",
    reason: "Sabab",
  },
} as const;

function usd(microusd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(microusd / 1_000_000);
}

function percent(basisPoints: number | null): string {
  return basisPoints === null ? "—" : `${(basisPoints / 100).toFixed(2)}%`;
}

function shortId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}…` : value;
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(body.code || `HTTP_${response.status}`);
  return body;
}

export function CostConsole({
  locale,
  staffName,
  initial,
}: {
  locale: Locale;
  staffName: string;
  initial: AiCostDashboard;
}) {
  const t = copy[locale];
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scopeType, setScopeType] = useState<"user" | "feature">("feature");

  async function reload() {
    setData(await json<AiCostDashboard>(await fetch("/api/platform/admin/costs", { cache: "no-store" })));
  }

  async function mutate(body: unknown, success: string): Promise<boolean> {
    setBusy(true);
    setNotice("");
    try {
      await json(await fetch("/api/platform/admin/costs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify(body),
      }));
      await reload();
      setNotice(success);
      setError("");
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : "ERROR");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await reload();
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await mutate({
      action: "price",
      value: {
        provider: form.get("provider"),
        model: form.get("model"),
        operation: form.get("operation"),
        inputMicrousdPerMillionTokens: Number(form.get("inputRate")),
        outputMicrousdPerMillionTokens: Number(form.get("outputRate")),
        cachedInputMicrousdPerMillionTokens: Number(form.get("cachedRate")),
        effectiveFrom: new Date(String(form.get("effectiveFrom"))).toISOString(),
        sourceUrl: String(form.get("sourceUrl") || "") || null,
      },
    }, t.priceSuccess);
    if (saved) formElement.reset();
  }

  async function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await mutate({
      action: "policy",
      value: {
        provider: form.get("provider"),
        dailyCostLimitMicrousd: Math.round(Number(form.get("dailyLimit")) * 1_000_000),
        rollingFailureLimit: Number(form.get("failureLimit")),
        rollingWindowMinutes: Number(form.get("window")),
        enabled: form.get("enabled") === "on",
        effectiveFrom: new Date(String(form.get("effectiveFrom"))).toISOString(),
      },
    }, t.policySuccess);
    if (saved) formElement.reset();
  }

  async function submitScopePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await mutate({
      action: "scope_policy",
      value: {
        scopeType: form.get("scopeType"),
        scopeKey: form.get("scopeKey"),
        dailyCostLimitMicrousd: Math.round(Number(form.get("dailyLimit")) * 1_000_000),
        monthlyCostLimitMicrousd: Math.round(Number(form.get("monthlyLimit")) * 1_000_000),
        action: form.get("enforcement"),
        enabled: form.get("enabled") === "on",
        effectiveFrom: new Date(String(form.get("effectiveFrom"))).toISOString(),
      },
    }, t.scopePolicySuccess);
    if (saved) {
      formElement.reset();
      setScopeType("feature");
    }
  }

  const currentPolicy = (provider: Provider) => data.policies.find((policy) => policy.provider === provider);
  const measurementStatus = {
    no_data: t.measurementNoData,
    incomplete_pricing: t.measurementIncomplete,
    pricing_mismatch: t.measurementPricingMismatch,
    insufficient_sample: t.measurementInsufficient,
    ready: t.measurementReady,
  }[data.measurement.status];
  const verificationStatus = {
    verified: t.verificationVerified,
    missing: t.verificationMissing,
    source_missing: t.verificationSourceMissing,
    rate_mismatch: t.verificationMismatch,
    review_due: t.verificationReviewDue,
  } as const;
  const coverage = `${(data.measurement.pricingCoverageBps / 100).toFixed(2)}%`;

  return <div className="staff-console cost-console" aria-busy={busy}>
    <a className="staff-skip" href="#main-content">{t.title}</a>
    <header className="staff-topbar">
      <div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div>
      <div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div>
    </header>
    <main className="staff-main" id="main-content">
      <section className="staff-heading">
        <div><p>{t.eyebrow}</p><h1>{t.title}</h1></div>
        <div className="jobs-heading-actions">
          <a href={`/${locale}/admin/product-kpis`}>{t.productKpis}</a>
          <button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button>
        </div>
      </section>
      <section className={`cost-measurement cost-measurement--${data.measurement.status}`} aria-labelledby="cost-measurement-title">
        <div className="cost-measurement-heading">
          <div><BarChart3 aria-hidden="true"/><h2 id="cost-measurement-title">{t.measurement}</h2></div>
          <strong>{measurementStatus}</strong>
        </div>
        <div className="cost-summary-grid" role="status">
          <div className="cost-summary"><span>{t.coverage}</span><b>{coverage}</b></div>
          <div className="cost-summary"><span>{t.costPerSuccess}</span><b>{data.measurement.costPerPricedSuccessMicrousd === null ? "—" : usd(data.measurement.costPerPricedSuccessMicrousd)}</b></div>
          <div className="cost-summary"><span>{t.sample}</span><b>{data.measurement.pricedSuccessfulRequests}/{data.measurement.minimumPricedSuccessfulRequests}</b></div>
          <div className="cost-summary"><span>{t.unpriced}</span><b>{data.measurement.unpricedSuccessfulRequests}</b></div>
        </div>
        <p>{t.measurementCaveat}</p>
      </section>
      <section
        className={`cost-measurement cost-measurement--${data.priceVerification.status === "verified" ? "ready" : "pricing_mismatch"}`}
        aria-labelledby="cost-price-verification-title"
      >
        <div className="cost-measurement-heading">
          <div><ShieldCheck aria-hidden="true"/><h2 id="cost-price-verification-title">{t.priceVerification}</h2></div>
          <strong>{data.priceVerification.status === "verified" ? t.priceVerificationReady : t.priceVerificationNeedsReview}</strong>
        </div>
        <div className="cost-table-wrap">
          <table>
            <thead><tr><th>{t.model}</th><th>{t.expectedRate}</th><th>{t.activeRate}</th><th>{t.verificationStatus}</th></tr></thead>
            <tbody>{data.priceVerification.checks.map((check) => <tr key={`${check.provider}:${check.model}:${check.operation}`}>
              <td><a href={check.referenceSourceUrl} target="_blank" rel="noreferrer"><code>{check.model}</code></a></td>
              <td>{[check.expectedInputMicrousdPerMillionTokens, check.expectedCachedInputMicrousdPerMillionTokens, check.expectedOutputMicrousdPerMillionTokens].map((value) => value.toLocaleString("en-US")).join(" / ")}</td>
              <td>{check.activeInputMicrousdPerMillionTokens === null ? "—" : [check.activeInputMicrousdPerMillionTokens, check.activeCachedInputMicrousdPerMillionTokens, check.activeOutputMicrousdPerMillionTokens].map((value) => value?.toLocaleString("en-US")).join(" / ")}</td>
              <td>{verificationStatus[check.status]}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p>{t.historicalMispriced}: <b>{data.priceVerification.historicalMispricedRequestCount}</b>. {t.priceVerificationCaveat}</p>
      </section>
      <section className="cost-measurement" aria-labelledby="cost-signals-title">
        <div className="cost-measurement-heading">
          <div><BarChart3 aria-hidden="true"/><h2 id="cost-signals-title">{t.signals}</h2></div>
        </div>
        <div className="cost-summary-grid">
          <div className="cost-summary"><span>{t.cacheHitRate}</span><b>{percent(data.operational.cacheHitRateBps)}</b></div>
          <div className="cost-summary"><span>{t.cachedTokenShare}</span><b>{percent(data.operational.cachedInputTokenShareBps)}</b></div>
          <div className="cost-summary"><span>{t.cacheWrites}</span><b>{data.operational.cacheCreationInputTokens.toLocaleString("en-US")}</b></div>
          <div className="cost-summary"><span>{t.deepEscalations}</span><b>{data.operational.deepEscalationCount} · {percent(data.operational.deepEscalationRateBps)}</b></div>
          <div className="cost-summary"><span>{t.providerFallbacks}</span><b>{data.operational.providerFallbackCount} · {percent(data.operational.providerFallbackRateBps)}</b></div>
          <div className="cost-summary"><span>{t.providerErrors}</span><b>{data.operational.providerFailures} · {percent(data.operational.providerFailureRateBps)}</b></div>
          <div className="cost-summary"><span>{t.averageLatency}</span><b>{data.operational.averageProviderLatencyMs === null ? "—" : `${data.operational.averageProviderLatencyMs.toLocaleString("en-US")} ms`}</b></div>
        </div>
        <p>{t.signalCaveat}</p>
      </section>
      {error && <p className="staff-error" role="alert">{error}</p>}
      {notice && <p className="cost-success" role="status">{notice}</p>}

      <section className="cost-circuits" aria-labelledby="cost-protection-title">
        <h2 id="cost-protection-title"><ShieldAlert aria-hidden="true"/>{t.protection}</h2>
        <div className="cost-circuit-grid">
          {data.circuits.map((circuit) => {
            const policy = currentPolicy(circuit.provider);
            return <article className={`cost-circuit cost-circuit--${policy ? circuit.state : "unconfigured"}`} key={circuit.provider}>
              <div><strong>{circuit.provider === "openai" ? "OpenAI" : "Anthropic"}</strong><span>{policy ? (circuit.state === "open" ? t.open : t.closed) : t.protectionMissing}</span></div>
              <p>{policy ? `${t.latestPolicy}: ${usd(policy.dailyCostLimitMicrousd)} · ${policy.rollingFailureLimit}/${policy.rollingWindowMinutes}m` : t.protectionMissingDetail}</p>
              <button
                type="button"
                disabled={busy}
                className={circuit.state === "open" ? "staff-approve" : "staff-danger"}
                onClick={() => void mutate({ action: "circuit", value: { provider: circuit.provider, state: circuit.state === "open" ? "closed" : "open" } }, t.circuitSuccess)}
              >
                {circuit.state === "open" ? <UnlockKeyhole aria-hidden="true"/> : <LockKeyhole aria-hidden="true"/>}
                {circuit.state === "open" ? t.closeAction : t.openAction}
              </button>
            </article>;
          })}
        </div>
      </section>

      <section className="cost-layout">
        <form className="cost-price-form" onSubmit={(event) => void submitPolicy(event)}>
          <h2><ShieldAlert aria-hidden="true"/>{t.policy}</h2>
          <label>{t.provider}<select name="provider" defaultValue="openai"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
          <label>{t.dailyLimit}<input name="dailyLimit" type="number" min="0.000001" max="1000000000" step="0.000001" required/></label>
          <label>{t.failureLimit}<input name="failureLimit" type="number" min="2" max="100000" step="1" defaultValue="5" required/></label>
          <label>{t.window}<input name="window" type="number" min="1" max="1440" step="1" defaultValue="15" required/></label>
          <label>{t.effective}<input name="effectiveFrom" type="datetime-local" required/></label>
          <label className="cost-checkbox"><input name="enabled" type="checkbox" defaultChecked/>{t.enabled}</label>
          <button className="staff-approve" disabled={busy}><Plus aria-hidden="true"/>{t.savePolicy}</button>
        </form>

        <form className="cost-price-form" onSubmit={(event) => void submitPrice(event)}>
          <h2><Plus aria-hidden="true"/>{t.addPrice}</h2>
          <label>{t.provider}<select name="provider" defaultValue="openai"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
          <label>{t.model}<input name="model" defaultValue="text-embedding-3-large" required maxLength={120}/></label>
          <label>{t.operation}<input name="operation" defaultValue="embeddings" required pattern="[a-z0-9._-]+" maxLength={64}/></label>
          <label>{t.inputRate}<input name="inputRate" type="number" min="0" step="1" required/></label>
          <label>{t.outputRate}<input name="outputRate" type="number" min="0" step="1" defaultValue="0" required/></label>
          <label>{t.cachedRate}<input name="cachedRate" type="number" min="0" step="1" defaultValue="0" required/></label>
          <label>{t.effective}<input name="effectiveFrom" type="datetime-local" required/></label>
          <label>{t.source}<input name="sourceUrl" type="url" inputMode="url" placeholder="https://openai.com/api/pricing/"/></label>
          <button className="staff-approve" disabled={busy}><Plus aria-hidden="true"/>{t.savePrice}</button>
        </form>

        <form className="cost-price-form" onSubmit={(event) => void submitScopePolicy(event)}>
          <h2><ShieldAlert aria-hidden="true"/>{t.scopePolicy}</h2>
          <label>{t.scopeType}<select name="scopeType" value={scopeType} onChange={(event) => setScopeType(event.target.value as "user" | "feature")}><option value="feature">{t.scopeFeature}</option><option value="user">{t.scopeUser}</option></select></label>
          {scopeType === "feature"
            ? <label>{t.scopeFeature}<select name="scopeKey" defaultValue="legal_chat"><option value="legal_chat">legal_chat</option><option value="guest_legal_chat">guest_legal_chat</option><option value="document_analysis">document_analysis</option><option value="document_indexing">document_indexing</option><option value="document_search">document_search</option></select></label>
            : <label>{t.scopeKey}<input name="scopeKey" required minLength={1} maxLength={120} pattern="[A-Za-z0-9._:-]+" autoComplete="off"/></label>}
          <label>{t.dailyLimit}<input name="dailyLimit" type="number" min="0.000001" max="1000000000" step="0.000001" required/></label>
          <label>{t.monthlyLimit}<input name="monthlyLimit" type="number" min="0.000001" max="1000000000" step="0.000001" required/></label>
          <label>{t.enforcement}<select name="enforcement" defaultValue="disable_deep"><option value="alert_only">{t.alertOnly}</option><option value="disable_deep">{t.disableDeep}</option><option value="block_calls">{t.blockCalls}</option></select></label>
          <label>{t.effective}<input name="effectiveFrom" type="datetime-local" required/></label>
          <label className="cost-checkbox"><input name="enabled" type="checkbox" defaultChecked/>{t.enabled}</label>
          <button className="staff-approve" disabled={busy}><Plus aria-hidden="true"/>{t.saveScopePolicy}</button>
        </form>
      </section>

      <section className="cost-usage" aria-labelledby="cost-scope-status-title">
        <h2 id="cost-scope-status-title">{t.scopedBudgets}</h2>
        {data.scopeBudgetStatuses.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.scopeType}</th><th>{t.action}</th><th>{t.dailySpend}</th><th>{t.monthlySpend}</th><th>{t.status}</th></tr></thead><tbody>{data.scopeBudgetStatuses.map((row) => <tr key={row.id}><td>{row.scopeType === "feature" ? <code>{row.scopeKey}</code> : <code title={row.scopeKey}>{shortId(row.scopeKey)}</code>}</td><td>{row.action}</td><td>{usd(row.dailyCostMicrousd)} / {usd(row.dailyCostLimitMicrousd)}</td><td>{usd(row.monthlyCostMicrousd)} / {usd(row.monthlyCostLimitMicrousd)}</td><td>{row.pricingIncomplete ? t.pricingIncomplete : row.dailyLimitReached || row.monthlyLimitReached ? t.open : t.closed}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.protectionMissing}</p>}
      </section>

      <section className="cost-usage" aria-labelledby="cost-scope-events-title">
        <h2 id="cost-scope-events-title">{t.budgetEvents}</h2>
        {data.scopeBudgetEvents.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.date}</th><th>{t.scopeType}</th><th>{t.period}</th><th>{t.reason}</th><th>{t.action}</th><th>{t.status}</th></tr></thead><tbody>{data.scopeBudgetEvents.map((event) => <tr key={event.id}><td><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</time></td><td><code title={event.scopeKey}>{event.scopeType === "user" ? shortId(event.scopeKey) : event.scopeKey}</code></td><td>{event.periodType} · {event.periodKey}</td><td>{event.reason}</td><td>{event.action}</td><td>{event.thresholdValue === null ? event.observedValue : `${usd(event.observedValue)} / ${usd(event.thresholdValue)}`}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}
      </section>

      <section className="cost-prices" aria-labelledby="cost-prices-title">
        <h2 id="cost-prices-title">{t.prices}</h2>
        {data.prices.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.provider}</th><th>{t.model}</th><th>{t.operation}</th><th>{t.inputRate}</th><th>{t.effective}</th></tr></thead><tbody>{data.prices.map((price) => <tr key={price.id}><td>{price.provider}</td><td><code>{price.model}</code></td><td>{price.operation}</td><td>{price.inputMicrousdPerMillionTokens.toLocaleString("en-US")}</td><td><time dateTime={price.effectiveFrom}>{new Date(price.effectiveFrom).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</time></td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}
      </section>

      <section className="cost-usage" aria-labelledby="cost-usage-title">
        <h2 id="cost-usage-title">{t.usage}</h2>
        {data.daily.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.date}</th><th>{t.feature}</th><th>{t.provider}</th><th>{t.model}</th><th>{t.requests}</th><th>{t.failures}</th><th>{t.tokens}</th><th>{t.cost}</th></tr></thead><tbody>{data.daily.map((row) => <tr key={`${row.usageDay}:${row.feature}:${row.operation}:${row.provider}:${row.model}`}><td>{row.usageDay}</td><td>{row.feature}</td><td>{row.provider}</td><td><code>{row.model}</code></td><td>{row.requestCount}</td><td>{row.failedRequestCount}</td><td>{row.inputTokens + row.outputTokens}</td><td>{usd(row.estimatedCostMicrousd)}{row.unpricedRequestCount > 0 ? ` · ${t.unpriced}: ${row.unpricedRequestCount}` : ""}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}
      </section>

      <section className="cost-usage" aria-labelledby="cost-plan-usage-title">
        <h2 id="cost-plan-usage-title">{t.planUsage}</h2>
        <p>{t.planSnapshot.replace("{date}", new Date(data.planSnapshotAt).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ"))}</p>
        {data.byPlan.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.currentPlan}</th><th>{t.users}</th><th>{t.requests}</th><th>{t.failures}</th><th>{t.cost}</th></tr></thead><tbody>{data.byPlan.map((row) => <tr key={`${row.attribution}:${row.planCode ?? "none"}`}><td>{row.attribution === "guest_or_system" ? t.guestOrSystem : row.attribution === "unassigned" ? t.unassignedPlan : <code>{row.planCode}</code>}</td><td>{row.userCount}</td><td>{row.requestCount}</td><td>{row.failedRequestCount}</td><td>{usd(row.estimatedCostMicrousd)}{row.unpricedRequestCount > 0 ? ` · ${t.unpriced}: ${row.unpricedRequestCount}` : ""}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}
      </section>

      <section className="cost-usage" aria-labelledby="cost-user-usage-title">
        <h2 id="cost-user-usage-title">{t.userUsage}</h2>
        {data.byUser.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.user}</th><th>{t.workspace}</th><th>{t.currentPlan}</th><th>{t.requests}</th><th>{t.failures}</th><th>{t.tokens}</th><th>{t.cost}</th></tr></thead><tbody>{data.byUser.map((row) => <tr key={`${row.workspaceId}:${row.userId}`}><td><code title={row.userId}>{shortId(row.userId)}</code></td><td><code title={row.workspaceId}>{shortId(row.workspaceId)}</code></td><td>{row.currentPlanCode ? <code>{row.currentPlanCode}</code> : t.unassignedPlan}</td><td>{row.requestCount}</td><td>{row.failedRequestCount}</td><td>{row.inputTokens + row.outputTokens}</td><td>{usd(row.estimatedCostMicrousd)}{row.unpricedRequestCount > 0 ? ` · ${t.unpriced}: ${row.unpricedRequestCount}` : ""}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}
      </section>

      <section className="cost-usage" aria-labelledby="cost-alerts-title">
        <h2 id="cost-alerts-title">{t.alerts}</h2>
        {data.alerts.length || data.scopeBudgetAlerts.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.date}</th><th>{t.provider}</th><th>{t.reason}</th><th>{t.status}</th></tr></thead><tbody>{data.alerts.map((alert) => <tr key={alert.id}><td><time dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</time></td><td>{alert.provider}</td><td>{alert.reason}</td><td>{alert.status}{alert.errorCode ? ` · ${alert.errorCode}` : ""}</td></tr>)}{data.scopeBudgetAlerts.map((alert) => <tr key={alert.id}><td><time dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</time></td><td><code title={alert.scopeKey}>{alert.scopeType === "user" ? shortId(alert.scopeKey) : alert.scopeKey}</code></td><td>{alert.periodType} · {alert.reason}</td><td>{alert.status}{alert.errorCode ? ` · ${alert.errorCode}` : ""}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}
      </section>
    </main>
  </div>;
}
