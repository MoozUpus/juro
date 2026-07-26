"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated remote data is hydrated after the first browser render */

import { BookOpenCheck, Bot, Check, CircleAlert, FileQuestion, LoaderCircle, Send, ShieldAlert, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type ProviderStatus = { configured: boolean; provider: string | null; model: string | null };
type Conversation = { id: string; title: string; locale: string; status: string; updatedAt: string; lastAnswer: string | null; facts: Fact[] };
type Fact = { id: string; statement: string; status: string };
type Source = {
  id: string;
  actTitle: string;
  actIdentifier: string | null;
  officialUrl: string;
  publishedAt: string | null;
  revisionDate: string | null;
  lastCheckedAt: string;
  locale: string;
  sourceType: string;
  status: string;
};
type IntakeResult = {
  understanding: string;
  clarificationQuestions: string[];
  nextSteps: string[];
  cautions: string[];
  sourceMode: "verified_sources" | "intake_only";
  confidencePercent: number;
  sourceConflict: boolean;
  sourceWarning: string | null;
};
type Answer = { conversationId: string; result: IntakeResult; facts: Fact[]; sources: Source[] };

export function AiLawyerClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedConversationId = searchParams.get("conversationId") || "";
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [question, setQuestion] = useState(() => (searchParams.get("prompt") || "").slice(0, 4_000));
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/platform/ai${selectedConversationId ? `?conversationId=${encodeURIComponent(selectedConversationId)}` : ""}`, { cache: "no-store" });
      const body = await response.json() as { status?: ProviderStatus; conversations?: Conversation[]; selected?: Answer | null; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "AI-модуль не загрузился." : "AI moduli yuklanmadi."));
      setStatus(body.status ?? null);
      setConversations(body.conversations ?? []);
      if (body.selected) setAnswer(body.selected);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru, selectedConversationId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim() || sending || !status?.configured) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ai", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ question, locale }),
      });
      const body = await response.json() as Answer & { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Не удалось получить ответ." : "Javob olinmadi."));
      setAnswer(body);
      setQuestion("");
      router.replace(`${pathname}?conversationId=${encodeURIComponent(body.conversationId)}`, { scroll: false });
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function updateFact(factId: string, nextStatus: "confirmed" | "rejected") {
    const response = await fetch(`/api/platform/ai/facts/${encodeURIComponent(factId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Факт не обновлён." : "Fakt yangilanmadi.")); return; }
    setAnswer(current => current ? { ...current, facts: current.facts.map(fact => fact.id === factId ? { ...fact, status: nextStatus } : fact) } : current);
  }

  if (loading) return <div className="ai-workspace-loading"><LoaderCircle className="spin" /></div>;
  return (
    <section className="ai-workspace">
      <aside className="ai-conversations">
        <header><Bot /><div><small>JURO</small><strong>{ru ? "Диалоги" : "Suhbatlar"}</strong></div></header>
        <button className="ai-new" onClick={() => { setAnswer(null); router.replace(pathname, { scroll: false }); }}>{ru ? "+ Новый вопрос" : "+ Yangi savol"}</button>
        <div>{conversations.length ? conversations.map(item => <button key={item.id} onClick={() => router.replace(`${pathname}?conversationId=${encodeURIComponent(item.id)}`, { scroll: false })}><strong>{item.title}</strong><small>{formatDate(item.updatedAt, ru)}</small></button>) : <p>{ru ? "История появится после первого обработанного вопроса." : "Tarix birinchi qayta ishlangan savoldan keyin paydo bo‘ladi."}</p>}</div>
      </aside>
      <main className="ai-dialog">
        <header><span><Bot /></span><div><h1>{ru ? "AI-юрист" : "AI-yurist"}</h1><p>{status?.configured ? (ru ? "Первичный разбор · юрисдикция Узбекистан" : "Dastlabki tahlil · O‘zbekiston yurisdiksiyasi") : (ru ? "Провайдер не подключён" : "Provayder ulanmagan")}</p></div></header>
        {!status?.configured && <div className="ai-unavailable" role="status"><ShieldAlert /><div><strong>{ru ? "AI пока недоступен" : "AI hozircha ishlamaydi"}</strong><p>{ru ? "На сервере отсутствует ключ AI-провайдера. JURO не имитирует ответ и не показывает ложный success. Остальные модули продолжают работать." : "Serverda AI-provayder kaliti yo‘q. JURO javobni taqlid qilmaydi va soxta muvaffaqiyatni ko‘rsatmaydi. Boshqa modullar ishlashda davom etadi."}</p></div></div>}
        {error && <div className="ai-error" role="alert"><CircleAlert />{error}</div>}
        <div className="ai-answer-stream">
          {!answer ? (
            <div className="ai-start"><FileQuestion /><h2>{ru ? "Опишите юридическую ситуацию" : "Yuridik vaziyatni yozing"}</h2><p>{ru ? "Не указывайте лишние персональные данные. AI отделит факты от предположений и задаст уточняющие вопросы." : "Ortiqcha shaxsiy ma’lumotlarni yozmang. AI faktlarni taxminlardan ajratadi va aniqlashtiruvchi savollar beradi."}</p></div>
          ) : (
            <article className="ai-answer">
              <small>JURO · {answer.result.sourceMode === "verified_sources" ? (ru ? "проверенные источники" : "tekshirilgan manbalar") : (ru ? "только первичный разбор" : "faqat dastlabki tahlil")}</small>
              <h2>{ru ? "Как JURO понял ситуацию" : "JURO vaziyatni qanday tushundi"}</h2>
              <p>{answer.result.understanding}</p>
              <div className="ai-confidence">
                <span>{ru ? "Уверенность в понимании фактов" : "Faktlarni tushunish ishonchi"}</span>
                <div aria-hidden="true"><i style={{ width: `${answer.result.confidencePercent}%` }} /></div>
                <strong>{answer.result.confidencePercent}%</strong>
              </div>
              {(answer.result.sourceConflict || answer.result.sourceWarning) && <div className="ai-cautions"><ShieldAlert /><p>{answer.result.sourceWarning || (ru ? "Источники требуют дополнительной проверки." : "Manbalar qo‘shimcha tekshiruvni talab qiladi.")}</p></div>}
              <h3>{ru ? "Что уточнить" : "Nimani aniqlashtirish kerak"}</h3>
              <ol>{answer.result.clarificationQuestions.map(item => <li key={item}>{item}</li>)}</ol>
              <h3>{ru ? "Безопасные следующие шаги" : "Xavfsiz keyingi qadamlar"}</h3>
              <ul>{answer.result.nextSteps.map(item => <li key={item}>{item}</li>)}</ul>
              {answer.result.cautions.length > 0 && <div className="ai-cautions"><ShieldAlert /><ul>{answer.result.cautions.map(item => <li key={item}>{item}</li>)}</ul></div>}
            </article>
          )}
        </div>
        <form className="ai-composer" onSubmit={submit}><label className="sr-only" htmlFor="ai-question">{ru ? "Юридический вопрос" : "Yuridik savol"}</label><textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleComposerKeyDown} disabled={!status?.configured || sending} placeholder={ru ? "Что произошло? Enter — отправить, Shift+Enter — новая строка" : "Nima bo‘ldi? Enter — yuborish, Shift+Enter — yangi qator"} /><button disabled={!status?.configured || !question.trim() || sending} aria-label={ru ? "Отправить" : "Yuborish"}>{sending ? <LoaderCircle className="spin" /> : <Send />}</button><small>{ru ? "AI может ошибаться. Для важных решений проверьте результат у специалиста." : "AI xato qilishi mumkin. Muhim qarorlar uchun natijani mutaxassis bilan tekshiring."}</small></form>
      </main>
      <aside className="ai-context">
        <header><BookOpenCheck /><strong>{ru ? "Контекст" : "Kontekst"}</strong></header>
        <section><h2>{ru ? "Подтверждённые факты" : "Tasdiqlangan faktlar"}</h2>{answer?.facts.length ? answer.facts.map(fact => <div className={`ai-fact ${fact.status}`} key={fact.id}><p>{fact.statement}</p>{fact.status === "proposed" ? <span><button onClick={() => void updateFact(fact.id, "confirmed")} aria-label={ru ? "Подтвердить факт" : "Faktni tasdiqlash"}><Check /></button><button onClick={() => void updateFact(fact.id, "rejected")} aria-label={ru ? "Отклонить факт" : "Faktni rad etish"}><X /></button></span> : <small>{fact.status === "confirmed" ? (ru ? "Подтверждено" : "Tasdiqlandi") : (ru ? "Отклонено" : "Rad etildi")}</small>}</div>) : <p>{ru ? "Предложенные факты появятся после разбора." : "Taklif qilingan faktlar tahlildan keyin paydo bo‘ladi."}</p>}</section>
        <section className="ai-evidence">
          <h2>{ru ? "Доказательность" : "Dalillilik"}</h2>
          {answer?.sources.length ? answer.sources.map(source => safeOfficialUrl(source.officialUrl) ? (
            <a key={source.id} href={source.officialUrl} target="_blank" rel="noreferrer">
              <strong>{source.actTitle}</strong>
              <small>{source.actIdentifier || (ru ? "Официальный источник" : "Rasmiy manba")}</small>
              <span>{ru ? "Актуальность" : "Dolzarblik"}: {formatDate(source.revisionDate || source.lastCheckedAt, ru)} · {source.locale.toUpperCase()} · {ru ? "действие проверено" : "amal qilishi tekshirilgan"}</span>
              <em>{ru ? "Конкретная статья и цитата временно не проверены" : "Aniq modda va iqtibos vaqtincha tekshirilmagan"}</em>
            </a>
          ) : null) : <p>{ru ? "Источник временно не проверен. JURO не придумывает статью, цитату или ссылку." : "Manba vaqtincha tekshirilmagan. JURO modda, iqtibos yoki havolani o‘ylab topmaydi."}</p>}
        </section>
      </aside>
    </section>
  );
}

function formatDate(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(value));
}

function safeOfficialUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
