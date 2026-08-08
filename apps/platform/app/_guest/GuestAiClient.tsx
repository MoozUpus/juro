"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";

import { TurnstileWidget } from "../_auth/TurnstileWidget";

type GuestResult = {
  responseKind: "answer" | "clarification_required";
  summary: string;
  answer: string;
  clarificationQuestions: string[];
  confirmedFindings: Array<{ title: string; explanation: string }>;
  risks: Array<{ title: string; explanation: string; level: "low" | "medium" | "high" | "critical" }>;
  actionPlan: Array<{ title: string; description: string }>;
  sources: Array<{
    sourceId: string;
    actTitle: string;
    article?: string | null;
    originalUrl: string;
  }>;
  legalDatabaseAsOf: string;
  sourceAccessMode?: "direct" | "approved_package";
  sourcesRetrievedAt?: string | null;
};

type Bootstrap = {
  enabled: boolean;
  providerConfigured: boolean;
  siteKey: string | null;
  session: null | {
    state: "available" | "reserved" | "consumed";
    requestCount: number;
    answerCount: number;
    expiresAt: string;
  };
  result: GuestResult | null;
  code?: string;
  error?: string;
};

type SubmitResponse = {
  result?: GuestResult;
  session?: Bootstrap["session"];
  code?: string;
  error?: string;
};

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

async function fetchBootstrap(locale: "ru" | "uz"): Promise<Bootstrap> {
  const response = await fetch(`/api/guest/ai?locale=${locale}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json() as Bootstrap;
  if (!response.ok) throw new Error(body.error || "GUEST_AI_UNAVAILABLE");
  return body;
}

export function GuestAiClient({ locale }: { locale: "ru" | "uz" }) {
  const ru = locale === "ru";
  const labelId = useId();
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [question, setQuestion] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [result, setResult] = useState<GuestResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const body = await fetchBootstrap(locale);
      setBootstrap(body);
      setResult(body.result);
      setMessage("");
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ru ? "Сервис временно недоступен." : "Xizmat vaqtincha mavjud emas."));
      setState("error");
    }
  }, [locale, ru]);

  useEffect(() => {
    let active = true;
    void fetchBootstrap(locale).then((body) => {
      if (!active) return;
      setBootstrap(body);
      setResult(body.result);
      setMessage("");
      setState("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : (ru ? "Сервис временно недоступен." : "Xizmat vaqtincha mavjud emas."));
      setState("error");
    });
    return () => { active = false; };
  }, [locale, ru]);

  const needsTurnstile = !bootstrap?.session;
  const consumed = bootstrap?.session?.state === "consumed"
    || (result?.responseKind === "answer" && bootstrap?.session?.answerCount === 1);
  const canSubmit = state === "ready"
    && question.trim().length >= 5
    && !consumed
    && (!needsTurnstile || Boolean(turnstileToken));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setState("submitting");
    setMessage(ru ? "JURO проверяет источники и готовит ответ…" : "JURO manbalarni tekshirib, javob tayyorlamoqda…");
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch("/api/guest/ai", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({
          question: question.trim(),
          locale,
          turnstileToken: needsTurnstile ? turnstileToken : undefined,
        }),
      });
      const body = await response.json() as SubmitResponse;
      if (!response.ok) {
        if (["GUEST_SESSION_INVALID", "GUEST_SESSION_EXPIRED", "GUEST_SESSION_REQUIRED"].includes(body.code ?? "")) {
          setBootstrap((current) => current ? { ...current, session: null } : current);
          setTurnstileToken("");
          setTurnstileReset((value) => value + 1);
        }
        throw new Error(body.error || (ru ? "Не удалось получить ответ." : "Javobni olish imkoni bo‘lmadi."));
      }
      if (body.result) setResult(body.result);
      if (body.session) {
        setBootstrap((current) => current ? { ...current, session: body.session ?? null } : current);
      } else {
        await load();
        return;
      }
      setQuestion("");
      setTurnstileToken("");
      setMessage(body.result?.responseKind === "clarification_required"
        ? (ru ? "Нужно уточнить несколько фактов. Гостевой ответ пока не использован." : "Bir nechta faktni aniqlashtirish kerak. Mehmon javobi hali ishlatilmadi.")
        : (ru ? "Ответ получен. Для продолжения сохраните работу в аккаунте." : "Javob olindi. Davom etish uchun ishni akkauntda saqlang."));
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ru ? "Не удалось получить ответ." : "Javobni olish imkoni bo‘lmadi."));
      setState("error");
    }
  }

  return (
    <main className="guest-ai-page">
      <header className="guest-ai-header">
        <Link className="guest-ai-brand" href="/">JURO</Link>
        <nav aria-label={ru ? "Язык и вход" : "Til va kirish"}>
          <Link href={`/${ru ? "uz" : "ru"}/guest/ai-lawyer`}>{ru ? "UZ" : "RU"}</Link>
          <Link href={`/${locale}/auth/login`}>{ru ? "Войти" : "Kirish"}</Link>
        </nav>
      </header>

      <section className="guest-ai-shell" aria-labelledby={labelId}>
        <div className="guest-ai-intro">
          <p className="guest-ai-eyebrow">{ru ? "Юрист в кармане" : "Cho‘ntakdagi yurist"}</p>
          <h1 id={labelId}>{ru ? "Задайте один вопрос AI-юристу JURO" : "AI-yurist JUROga bitta savol bering"}</h1>
          <p>{ru
            ? "JURO проверит доступные официальные источники Узбекистана, отделит подтверждённые выводы от предположений и предложит следующий шаг."
            : "JURO O‘zbekistonning mavjud rasmiy manbalarini tekshiradi, tasdiqlangan xulosalarni taxminlardan ajratadi va keyingi qadamni taklif qiladi."}</p>
          <ul>
            <li>{ru ? "Один итоговый ответ без регистрации" : "Ro‘yxatdan o‘tmasdan bitta yakuniy javob"}</li>
            <li>{ru ? "Уточняющий вопрос не расходует ответ" : "Aniqlashtiruvchi savol javobni sarflamaydi"}</li>
            <li>{ru ? "Гостевые данные удаляются через 24 часа" : "Mehmon ma’lumotlari 24 soatdan keyin o‘chiriladi"}</li>
          </ul>
        </div>

        <div className="guest-ai-workspace">
          {state === "loading" ? (
            <div className="guest-ai-skeleton" role="status">{ru ? "Загрузка защищённой формы…" : "Himoyalangan shakl yuklanmoqda…"}</div>
          ) : null}

          {bootstrap && !bootstrap.providerConfigured ? (
            <div className="guest-ai-alert" role="alert">{ru ? "AI-провайдер временно недоступен." : "AI-provayder vaqtincha mavjud emas."}</div>
          ) : null}

          {!consumed && bootstrap?.providerConfigured ? (
            <form onSubmit={submit} className="guest-ai-form">
              <label htmlFor="guest-question">{ru ? "Опишите юридическую ситуацию" : "Huquqiy vaziyatni yozing"}</label>
              <textarea
                id="guest-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={4_000}
                rows={7}
                placeholder={ru ? "Например: работодатель задерживает зарплату два месяца. Какие действия доступны по законодательству Узбекистана?" : "Masalan: ish beruvchi ikki oydan beri ish haqini kechiktirmoqda. O‘zbekiston qonunchiligiga ko‘ra qanday yo‘l tutish mumkin?"}
                disabled={state === "submitting"}
              />
              <div className="guest-ai-counter">{question.length}/4000</div>
              {needsTurnstile && bootstrap.siteKey ? (
                <TurnstileWidget
                  siteKey={bootstrap.siteKey}
                  locale={locale}
                  action="guest_ai"
                  resetSignal={turnstileReset}
                  onToken={setTurnstileToken}
                />
              ) : null}
              {needsTurnstile && !bootstrap.siteKey ? (
                <div className="guest-ai-alert" role="alert">{ru ? "Защитная проверка не настроена." : "Himoya tekshiruvi sozlanmagan."}</div>
              ) : null}
              <button type="submit" disabled={!canSubmit}>
                {state === "submitting" ? (ru ? "Готовим ответ…" : "Javob tayyorlanmoqda…") : (ru ? "Получить гостевой ответ" : "Mehmon javobini olish")}
              </button>
            </form>
          ) : null}

          {message ? <p className={state === "error" ? "guest-ai-message is-error" : "guest-ai-message"} role={state === "error" ? "alert" : "status"}>{message}</p> : null}

          {result ? <GuestResultView result={result} locale={locale} /> : null}

          {consumed ? (
            <div className="guest-ai-register">
              <h2>{ru ? "Продолжите в личном кабинете" : "Shaxsiy kabinetda davom eting"}</h2>
              <p>{ru ? "Сохраняйте историю, документы, дела и планы действий после регистрации." : "Ro‘yxatdan o‘tgach tarix, hujjatlar, ishlar va harakatlar rejasini saqlang."}</p>
              <Link href={`/${locale}/auth/register`}>{ru ? "Зарегистрироваться" : "Ro‘yxatdan o‘tish"}</Link>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function GuestResultView({ result, locale }: { result: GuestResult; locale: "ru" | "uz" }) {
  const ru = locale === "ru";
  const sourceTimestamp = result.sourcesRetrievedAt || result.legalDatabaseAsOf;
  const sourceDate = new Date(sourceTimestamp);
  const hasSourceDate = Number.isFinite(sourceDate.getTime());
  return (
    <article className="guest-ai-result" aria-labelledby="guest-result-title">
      <div className="guest-ai-result-heading">
        <span>{ru ? "AI-ответ" : "AI javobi"}</span>
        {hasSourceDate && <time dateTime={sourceTimestamp}>{result.sourceAccessMode === "direct" ? (ru ? "Получено напрямую" : "Bevosita olindi") : (ru ? "База на" : "Baza sanasi")}: {sourceDate.toLocaleDateString(ru ? "ru-RU" : "uz-UZ")}</time>}
      </div>
      <h2 id="guest-result-title">{result.summary}</h2>
      {paragraphs(result.answer).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}

      {result.clarificationQuestions.length > 0 ? <section>
        <h3>{ru ? "Уточните" : "Aniqlashtiring"}</h3>
        <ol>{result.clarificationQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
      </section> : null}

      {result.confirmedFindings.length > 0 ? <section>
        <h3>{ru ? "Подтверждено источниками" : "Manbalar bilan tasdiqlangan"}</h3>
        <ul>{result.confirmedFindings.map((item) => <li key={item.title}><strong>{item.title}.</strong> {item.explanation}</li>)}</ul>
      </section> : null}

      {result.risks.length > 0 ? <section>
        <h3>{ru ? "Риски" : "Xavflar"}</h3>
        <ul>{result.risks.map((risk) => <li key={`${risk.level}:${risk.title}`}><strong>{risk.title}.</strong> {risk.explanation}</li>)}</ul>
      </section> : null}

      {result.actionPlan.length > 0 ? <section>
        <h3>{ru ? "Следующие шаги" : "Keyingi qadamlar"}</h3>
        <ol>{result.actionPlan.map((step) => <li key={step.title}><strong>{step.title}</strong>{step.description ? ` — ${step.description}` : ""}</li>)}</ol>
      </section> : null}

      {result.sources.length > 0 ? <section>
        <h3>{ru ? "Официальные источники" : "Rasmiy manbalar"}</h3>
        <ul>{result.sources.map((source) => <li key={source.sourceId}>
          <a href={source.originalUrl} target="_blank" rel="noreferrer noopener">{source.actTitle}{source.article ? ` — ${source.article}` : ""}</a>
        </li>)}</ul>
      </section> : null}
    </article>
  );
}
