"use client";

import { usePlatformBasePath } from "./PlatformRouteContext";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, Bot, ExternalLink, FilePenLine, HelpCircle, LoaderCircle, Scale, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

type SupportCategory = "technical" | "ai_error" | "wrong_norm" | "document" | "ocr" | "tariff" | "lawyer" | "privacy" | "security" | "deletion" | "workspace" | "feedback" | "other";
type SupportSeverity = "low" | "normal" | "high" | "critical";
type SupportStatus = "open" | "waiting_user" | "resolved";
type KnowledgeArticle = { slug: string; category: string; versionNumber: number; title: string; summary: string; updatedAt: string };

const supportCopy = {
  ru: { category: "Категория", severity: "Срочность", technical: "Техническая проблема", ai_error: "Ошибка AI", wrong_norm: "Неверная норма", document: "Документ", ocr: "Распознавание", tariff: "Тариф", lawyer: "Юрист", privacy: "Приватность", security: "Безопасность", deletion: "Удаление данных", workspace: "Рабочее пространство", feedback: "Отзыв", other: "Другое", low: "Низкая", normal: "Обычная", high: "Высокая", critical: "Критическая", open: "Открыто", waiting_user: "Ожидается ваш ответ", resolved: "Решено", historyLoading: "Загружаем обращения…", historyUpdated: "Список обращений обновлён", detailsLoaded: "Детали обращения загружены" },
  uz: { category: "Kategoriya", severity: "Muhimlik", technical: "Texnik muammo", ai_error: "AI xatosi", wrong_norm: "Noto‘g‘ri norma", document: "Hujjat", ocr: "Matnni tanish", tariff: "Tarif", lawyer: "Yurist", privacy: "Maxfiylik", security: "Xavfsizlik", deletion: "Ma’lumotlarni o‘chirish", workspace: "Ish maydoni", feedback: "Fikr-mulohaza", other: "Boshqa", low: "Past", normal: "Oddiy", high: "Yuqori", critical: "Muhim", open: "Ochiq", waiting_user: "Javobingiz kutilmoqda", resolved: "Hal qilindi", historyLoading: "Murojaatlar yuklanmoqda…", historyUpdated: "Murojaatlar ro‘yxati yangilandi", detailsLoaded: "Murojaat tafsilotlari yuklandi" },
} as const;

const supportCategories: SupportCategory[] = ["technical", "ai_error", "wrong_norm", "document", "ocr", "tariff", "lawyer", "privacy", "security", "deletion", "workspace", "feedback", "other"];
const supportSeverities: SupportSeverity[] = ["low", "normal", "high", "critical"];

export function HelpClient({ locale }: { locale: PlatformLocale; accountType: AccountType }) {
  const ru = locale === "ru";
  const support = supportCopy[locale];
  const base = usePlatformBasePath();
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState(""); const [category, setCategory] = useState<SupportCategory>("technical"); const [severity, setSeverity] = useState<SupportSeverity>("normal"); const [sending, setSending] = useState(false); const [loadingTickets, setLoadingTickets] = useState(false); const [supportStatus, setSupportStatus] = useState("");
  const [tickets, setTickets] = useState<Array<{ id: string; subject: string; status: SupportStatus }>>([]);
  const [selectedTicket, setSelectedTicket] = useState<{ id: string; subject: string; status: SupportStatus; messages: Array<{ id: string; authorType: "requester" | "staff"; body: string }> } | null>(null);
  const [reply, setReply] = useState(""); const [replying, setReplying] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  const [knowledgeError, setKnowledgeError] = useState("");
  const loadKnowledge = useCallback(async (query = "") => {
    setLoadingKnowledge(true); setKnowledgeError("");
    try {
      const params = new URLSearchParams({ locale });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/help/articles?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as { articles?: KnowledgeArticle[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Knowledge base unavailable");
      setKnowledgeArticles(body.articles ?? []);
    } catch {
      setKnowledgeError(ru ? "Не удалось загрузить базу знаний. Повторите попытку." : "Bilimlar bazasini yuklab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally { setLoadingKnowledge(false); }
  }, [locale, ru]);
  const loadTickets = useCallback(async () => { setLoadingTickets(true); try { const response = await fetch("/api/platform/support-tickets", { cache: "no-store" }); const body = await response.json() as { tickets?: Array<{ id: string; subject: string; status: SupportStatus }> }; if (!response.ok) throw new Error(); setTickets(body.tickets ?? []); setSupportStatus(support.historyUpdated); } catch { setSupportStatus(ru ? "Не удалось загрузить обращения." : "Murojaatlarni yuklab bo‘lmadi."); } finally { setLoadingTickets(false); } }, [ru, support.historyUpdated]);
  useEffect(() => { const timer = window.setTimeout(() => void loadTickets(), 0); return () => window.clearTimeout(timer); }, [loadTickets]);
  useEffect(() => { const timer = window.setTimeout(() => void loadKnowledge(), 0); return () => window.clearTimeout(timer); }, [loadKnowledge]);
  async function openTicket(ticketId: string) { setLoadingTickets(true); try { const response = await fetch(`/api/platform/support-tickets/${encodeURIComponent(ticketId)}`, { cache: "no-store" }); const body = await response.json() as { ticket?: { id: string; subject: string; status: SupportStatus }; messages?: Array<{ id: string; authorType: "requester" | "staff"; body: string }> }; if (!response.ok || !body.ticket) throw new Error(); setSelectedTicket({ ...body.ticket, messages: body.messages ?? [] }); setReply(""); setSupportStatus(support.detailsLoaded); } catch { setSupportStatus(ru ? "Не удалось открыть обращение." : "Murojaatni ochib bo‘lmadi."); } finally { setLoadingTickets(false); } }

  async function submitSupport(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSending(true); setSupportStatus(""); try { const response = await fetch("/api/platform/support-tickets", { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ category, severity, subject, message, locale }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Ошибка"); setSubject(""); setMessage(""); setSupportStatus(ru ? "Обращение отправлено." : "Murojaat yuborildi."); await loadTickets(); } catch (value) { setSupportStatus(value instanceof Error ? value.message : String(value)); } finally { setSending(false); } }
  async function submitReply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selectedTicket || !reply.trim()) return; setReplying(true); try { const response = await fetch(`/api/platform/support-tickets/${encodeURIComponent(selectedTicket.id)}`, { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ message: reply.trim() }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Ошибка"); setReply(""); await openTicket(selectedTicket.id); await loadTickets(); setSupportStatus(ru ? "Ответ отправлен в поддержку." : "Javob qo‘llab-quvvatlashga yuborildi."); } catch (value) { setSupportStatus(value instanceof Error ? value.message : String(value)); } finally { setReplying(false); } }
  return (
    <section className="help-workspace">
      <header>
        <HelpCircle />
        <div>
          <small>JURO · HELP</small>
          <h1>{ru ? "Помощь" : "Yordam"}</h1>
          <p>{ru ? "Короткие маршруты к рабочим функциям и правилам платформы — без декоративных кнопок и вымышленного статуса поддержки." : "Ish funksiyalari va platforma qoidalariga qisqa yo‘llar — bezak tugmalari va soxta qo‘llab-quvvatlash holatisiz."}</p>
        </div>
      </header>
      <section className="help-knowledge" aria-labelledby="knowledge-title">
        <div className="help-knowledge-heading">
          <div>
            <h2 id="knowledge-title">{ru ? "База знаний" : "Bilimlar bazasi"}</h2>
            <p>{ru ? "Проверенные инструкции по функциям JURO. У каждой статьи есть версия и дата обновления." : "JURO funksiyalari bo‘yicha tekshirilgan yo‘riqnomalar. Har bir maqolada versiya va yangilanish sanasi bor."}</p>
          </div>
          <form role="search" onSubmit={(event) => { event.preventDefault(); void loadKnowledge(knowledgeQuery); }}>
            <label className="sr-only" htmlFor="knowledge-search">{ru ? "Поиск по базе знаний" : "Bilimlar bazasidan qidirish"}</label>
            <Search aria-hidden="true" />
            <input id="knowledge-search" type="search" value={knowledgeQuery} maxLength={120} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder={ru ? "Например, источники или 2FA" : "Masalan, manbalar yoki 2FA"} />
            <button type="submit" disabled={loadingKnowledge}>{ru ? "Найти" : "Qidirish"}</button>
          </form>
        </div>
        <div className="help-knowledge-status" role="status" aria-live="polite">
          {loadingKnowledge ? (ru ? "Загружаем статьи…" : "Maqolalar yuklanmoqda…") : knowledgeError || (knowledgeArticles.length === 0 ? (ru ? "По вашему запросу статей нет." : "So‘rovingiz bo‘yicha maqola topilmadi.") : "")}
        </div>
        {!loadingKnowledge && knowledgeError && <button className="help-retry" type="button" onClick={() => void loadKnowledge(knowledgeQuery)}>{ru ? "Повторить" : "Qayta urinish"}</button>}
        {!loadingKnowledge && !knowledgeError && knowledgeArticles.length > 0 && <ul className="help-knowledge-list">
          {knowledgeArticles.map((article) => <li key={article.slug}>
            <Link href={`${base}/help/${article.slug}`}>
              <span><strong>{article.title}</strong><small>{article.summary}</small></span>
              <span className="help-knowledge-meta">{ru ? `Версия ${article.versionNumber} · ${formatKnowledgeDate(article.updatedAt, locale)}` : `${article.versionNumber}-versiya · ${formatKnowledgeDate(article.updatedAt, locale)}`}<ArrowRight aria-hidden="true" /></span>
            </Link>
          </li>)}
        </ul>}
      </section>
      <div className="help-grid">
        <article>
          <Bot />
          <h2>{ru ? "Начать с ситуации" : "Vaziyatdan boshlash"}</h2>
          <p>{ru ? "AI-модуль собирает факты и показывает только проверяемые следующие шаги. Если провайдер не настроен, интерфейс честно сообщает об этом." : "AI moduli faktlarni yig‘adi va faqat tekshiriladigan keyingi qadamlarni ko‘rsatadi. Provayder sozlanmagan bo‘lsa, interfeys bu haqda ochiq xabar beradi."}</p>
          <Link href={`${base}/ai-chat`}>{ru ? "Открыть AI-юриста" : "AI-yuristni ochish"}</Link>
        </article>
        <article>
          <FilePenLine />
          <h2>{ru ? "Создать документ" : "Hujjat yaratish"}</h2>
          <p>{ru ? "Выберите шаблон, заполните вопросы, сохраните черновик и сформируйте DOCX или PDF. Язык итогового документа показывается до экспорта." : "Shablonni tanlang, savollarga javob bering, qoralamani saqlang va DOCX yoki PDF yarating. Yakuniy hujjat tili eksportdan oldin ko‘rsatiladi."}</p>
          <Link href={`${base}/document-builder`}>{ru ? "Открыть конструктор" : "Konstruktorni ochish"}</Link>
        </article>
        <article>
          <Scale />
          <h2>{ru ? "Передать специалисту" : "Mutaxassisga topshirish"}</h2>
          <p>{ru ? "В консультации передаётся только выбранный контекст после отдельного согласия. Заявка не считается назначенной до подтверждения специалистом." : "Maslahatda faqat alohida rozilik bilan tanlangan kontekst beriladi. Mutaxassis tasdiqlamaguncha so‘rov tayinlangan hisoblanmaydi."}</p>
          <Link href={`${base}/consultations`}>{ru ? "Посмотреть консультации" : "Maslahatlarni ko‘rish"}</Link>
        </article>
        <article>
          <ShieldCheck />
          <h2>{ru ? "Данные и безопасность" : "Ma’lumot va xavfsizlik"}</h2>
          <p>{ru ? "Управляйте активными сессиями, экспортом данных, согласиями и запросом удаления в настройках." : "Sozlamalarda faol sessiyalar, ma’lumot eksporti, roziliklar va o‘chirish so‘rovini boshqaring."}</p>
          <Link href={`${base}/settings/privacy`}>{ru ? "Открыть приватность" : "Maxfiylikni ochish"}</Link>
        </article>
      </div>
      <form className="help-support" onSubmit={(event) => void submitSupport(event)} aria-busy={sending}>
        <h2>{ru ? "Написать в поддержку" : "Qo‘llab-quvvatlashga yozish"}</h2>
        <div className="help-support-selects"><label>{support.category}<select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}>{supportCategories.map((value) => <option key={value} value={value}>{support[value]}</option>)}</select></label><label>{support.severity}<select value={severity} onChange={(event) => setSeverity(event.target.value as SupportSeverity)}>{supportSeverities.map((value) => <option key={value} value={value}>{support[value]}</option>)}</select></label></div>
        <label>{ru ? "Тема" : "Mavzu"}<input value={subject} minLength={4} maxLength={180} required onChange={(event) => setSubject(event.target.value)} /></label>
        <label>{ru ? "Сообщение" : "Xabar"}<textarea value={message} minLength={10} maxLength={8000} required onChange={(event) => setMessage(event.target.value)} /></label>
        {supportStatus && <p role="status" aria-live="polite">{supportStatus}</p>}
        <button disabled={sending}>{sending && <LoaderCircle className="spin" />}{ru ? "Отправить" : "Yuborish"}</button>
      </form>
      <section className="help-ticket-history" aria-labelledby="support-history-title">
        <div className="help-ticket-heading"><h2 id="support-history-title">{ru ? "Мои обращения" : "Mening murojaatlarim"}</h2><button type="button" onClick={() => void loadTickets()} disabled={loadingTickets}>{ru ? "Обновить" : "Yangilash"}</button></div>
        {loadingTickets && tickets.length === 0 ? <p role="status">{support.historyLoading}</p> : tickets.length === 0 ? <p>{ru ? "Здесь появится статус и ответ поддержки." : "Bu yerda qo‘llab-quvvatlash holati va javobi ko‘rinadi."}</p> : <ul>{tickets.map((ticket) => <li key={ticket.id}><button type="button" onClick={() => void openTicket(ticket.id)} disabled={loadingTickets} aria-label={`${ticket.subject}: ${support[ticket.status]}`}><strong>{ticket.subject}</strong><span>{support[ticket.status]}</span></button></li>)}</ul>}
        {selectedTicket && <section className="help-ticket-thread" aria-live="polite"><h3>{selectedTicket.subject}</h3><p>{support[selectedTicket.status]}</p>{selectedTicket.messages.map((item) => <article key={item.id} data-author={item.authorType}><strong>{item.authorType === "staff" ? (ru ? "Поддержка JURO" : "JURO qo‘llab-quvvatlash") : (ru ? "Вы" : "Siz")}</strong><p>{item.body}</p></article>)}{selectedTicket.status !== "resolved" && <form className="help-ticket-reply" onSubmit={(event) => void submitReply(event)} aria-busy={replying}><label>{ru ? "Ответить" : "Javob berish"}<textarea required minLength={1} maxLength={8000} value={reply} onChange={(event) => setReply(event.target.value)} /></label><button disabled={replying || !reply.trim()}>{replying && <LoaderCircle className="spin" />}{ru ? "Отправить ответ" : "Javobni yuborish"}</button></form>}</section>}
      </section>
      <aside className="help-legal">
        <BookOpenCheck />
        <div>
          <h2>{ru ? "Правила и ответы" : "Qoidalar va javoblar"}</h2>
          <p>{ru ? "Условия приложения, политика конфиденциальности и правила AI опубликованы отдельно от документов публичного сайта." : "Ilova shartlari, maxfiylik siyosati va AI qoidalari ommaviy sayt hujjatlaridan alohida e’lon qilingan."}</p>
        </div>
        <span>
          <Link href={`/legal/terms?lang=${locale}`}>{ru ? "Условия" : "Shartlar"}</Link>
          <Link href={`/legal/ai-rules?lang=${locale}`}>{ru ? "Правила AI" : "AI qoidalari"}</Link>
          <a href={`https://juro.uz/${locale}#faq`} target="_blank" rel="noreferrer">{ru ? "FAQ сайта" : "Sayt FAQ"}<ExternalLink /></a>
        </span>
      </aside>
    </section>
  );
}

function formatKnowledgeDate(value: string, locale: PlatformLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
