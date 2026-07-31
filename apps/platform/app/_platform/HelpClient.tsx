"use client";

import { usePlatformBasePath } from "./PlatformRouteContext";
import Link from "next/link";
import { BookOpenCheck, Bot, ExternalLink, FilePenLine, HelpCircle, LoaderCircle, Scale, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

export function HelpClient({ locale }: { locale: PlatformLocale; accountType: AccountType }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false); const [supportStatus, setSupportStatus] = useState("");
  const [tickets, setTickets] = useState<Array<{ id: string; subject: string; status: string }>>([]);
  const [selectedTicket, setSelectedTicket] = useState<{ subject: string; status: string; messages: Array<{ id: string; authorType: "requester" | "staff"; body: string }> } | null>(null);
  async function loadTickets() { try { const response = await fetch("/api/platform/support-tickets", { cache: "no-store" }); const body = await response.json() as { tickets?: Array<{ id: string; subject: string; status: string }> }; if (!response.ok) throw new Error(); setTickets(body.tickets ?? []); } catch { setSupportStatus(ru ? "Не удалось загрузить обращения." : "Murojaatlarni yuklab bo‘lmadi."); } }
  async function openTicket(ticketId: string) { try { const response = await fetch(`/api/platform/support-tickets/${encodeURIComponent(ticketId)}`, { cache: "no-store" }); const body = await response.json() as { ticket?: { subject: string; status: string }; messages?: Array<{ id: string; authorType: "requester" | "staff"; body: string }> }; if (!response.ok || !body.ticket) throw new Error(); setSelectedTicket({ ...body.ticket, messages: body.messages ?? [] }); } catch { setSupportStatus(ru ? "Не удалось открыть обращение." : "Murojaatni ochib bo‘lmadi."); } }

  async function submitSupport(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSending(true); setSupportStatus(""); try { const response = await fetch("/api/platform/support-tickets", { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ category: "technical", severity: "normal", subject, message, locale }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Ошибка"); setSubject(""); setMessage(""); setSupportStatus(ru ? "Обращение отправлено." : "Murojaat yuborildi."); await loadTickets(); } catch (value) { setSupportStatus(value instanceof Error ? value.message : String(value)); } finally { setSending(false); } }
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
      <form className="help-support" onSubmit={(event) => void submitSupport(event)}>
        <h2>{ru ? "Написать в поддержку" : "Qo‘llab-quvvatlashga yozish"}</h2>
        <label>{ru ? "Тема" : "Mavzu"}<input value={subject} minLength={4} maxLength={180} required onChange={(event) => setSubject(event.target.value)} /></label>
        <label>{ru ? "Сообщение" : "Xabar"}<textarea value={message} minLength={10} maxLength={8000} required onChange={(event) => setMessage(event.target.value)} /></label>
        {supportStatus && <p role="status">{supportStatus}</p>}
        <button disabled={sending}>{sending && <LoaderCircle className="spin" />}{ru ? "Отправить" : "Yuborish"}</button>
      </form>
      <section className="help-ticket-history" aria-labelledby="support-history-title">
        <div className="help-ticket-heading"><h2 id="support-history-title">{ru ? "Мои обращения" : "Mening murojaatlarim"}</h2><button type="button" onClick={() => void loadTickets()}>{ru ? "Обновить" : "Yangilash"}</button></div>
        {tickets.length === 0 ? <p>{ru ? "Здесь появится статус и ответ поддержки." : "Bu yerda qo‘llab-quvvatlash holati va javobi ko‘rinadi."}</p> : <ul>{tickets.map((ticket) => <li key={ticket.id}><button type="button" onClick={() => void openTicket(ticket.id)}><strong>{ticket.subject}</strong><span>{ticket.status}</span></button></li>)}</ul>}
        {selectedTicket && <section className="help-ticket-thread" aria-live="polite"><h3>{selectedTicket.subject}</h3><p>{selectedTicket.status}</p>{selectedTicket.messages.map((item) => <article key={item.id} data-author={item.authorType}><strong>{item.authorType === "staff" ? (ru ? "Поддержка JURO" : "JURO qo‘llab-quvvatlash") : (ru ? "Вы" : "Siz")}</strong><p>{item.body}</p></article>)}</section>}
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
