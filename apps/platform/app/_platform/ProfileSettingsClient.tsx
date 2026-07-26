"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated profile data is hydrated after the first browser render */

import Link from "next/link";
import { CircleAlert, Database, Download, Languages, LoaderCircle, LogOut, MonitorSmartphone, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

type View = "profile" | "settings" | "security" | "privacy";
type ProfileData = {
  profile: {
    email: string; fullName: string | null; phone: string | null; locale: string; accountType: string;
    companyName: string | null; organizationRole: string | null; primaryGoal: string | null; timezone: string; createdAt: string;
  };
  workspace: { name: string; type: string; locale: string };
  role: string;
  consents: Array<{ type: string; version: string; grantedAt: string; revokedAt: string | null }>;
};
type Session = {
  id: string;
  createdAt: string;
  authenticatedAt: string | null;
  lastSeenAt: string;
  expiresAt: string;
  idleExpiresAt: string | null;
  authMethod: string;
  assuranceLevel: string;
  deviceName: string;
  isCurrent: number | boolean;
};

export function ProfileSettingsClient({ locale, accountType, view }: { locale: PlatformLocale; accountType: AccountType; view: View }) {
  const ru = locale === "ru";
  const base = `/${locale}/${accountType}`;
  const [data, setData] = useState<ProfileData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ fullName: "", phone: "", locale, timezone: "Asia/Tashkent", companyName: "", organizationRole: "" });
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const profileResponse = await fetch("/api/platform/profile", { cache: "no-store" });
      const profileBody = await profileResponse.json() as ProfileData & { error?: string };
      if (!profileResponse.ok) throw new Error(profileBody.error || (ru ? "Профиль не загрузился." : "Profil yuklanmadi."));
      setData(profileBody);
      setForm({
        fullName: profileBody.profile.fullName || "",
        phone: profileBody.profile.phone || "",
        locale: profileBody.profile.locale === "uz" ? "uz" : "ru",
        timezone: profileBody.profile.timezone,
        companyName: profileBody.profile.companyName || "",
        organizationRole: profileBody.profile.organizationRole || "",
      });
      if (view === "security") {
        const sessionResponse = await fetch("/api/platform/security/sessions", { cache: "no-store" });
        const sessionBody = await sessionResponse.json() as { sessions?: Session[]; error?: string };
        if (!sessionResponse.ok) throw new Error(sessionBody.error || (ru ? "Сессии не загрузились." : "Sessiyalar yuklanmadi."));
        setSessions(sessionBody.sessions ?? []);
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru, view]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/platform/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify(form),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error || (ru ? "Изменения не сохранены." : "O‘zgarishlar saqlanmadi."));
    else {
      setNotice(ru ? "Изменения сохранены." : "O‘zgarishlar saqlandi.");
      if (form.locale !== locale) window.location.assign(`/${form.locale}/${accountType}/${view === "profile" ? "profile" : "settings"}`);
      else await load();
    }
    setSaving(false);
  }

  async function closeAllSessions() {
    if (!window.confirm(ru ? "Завершить все JURO email-сессии и выйти?" : "Barcha JURO email sessiyalarini yakunlab chiqasizmi?")) return;
    const response = await fetch("/api/platform/security/sessions?scope=all", { method: "DELETE", headers: { "x-juro-csrf": "1" } });
    if (!response.ok) { const body = await response.json() as { error?: string }; setError(body.error || (ru ? "Сессии не завершены." : "Sessiyalar yakunlanmadi.")); return; }
    window.location.assign("/signout-with-chatgpt?return_to=/login");
  }

  async function closeOtherSessions() {
    setError("");
    setNotice("");
    const response = await fetch("/api/platform/security/sessions?scope=others", { method: "DELETE", headers: { "x-juro-csrf": "1" } });
    const body = await response.json() as { error?: string; revoked?: number };
    if (!response.ok) {
      setError(body.error || (ru ? "Другие сессии не завершены." : "Boshqa sessiyalar yakunlanmadi."));
      return;
    }
    setNotice(ru
      ? `Завершено сессий: ${body.revoked ?? 0}.`
      : `Yakunlangan sessiyalar: ${body.revoked ?? 0}.`);
    await load();
  }

  async function closeSession(session: Session) {
    if (!window.confirm(session.isCurrent
      ? (ru ? "Завершить текущую JURO email-сессию?" : "Joriy JURO email sessiyasini yakunlaysizmi?")
      : (ru ? `Завершить сессию «${session.deviceName}»?` : `“${session.deviceName}” sessiyasini yakunlaysizmi?`))) return;
    setError("");
    setNotice("");
    const response = await fetch(`/api/platform/security/sessions/${encodeURIComponent(session.id)}`, {
      method: "DELETE",
      headers: { "x-juro-csrf": "1" },
    });
    const body = await response.json() as { error?: string; revokedCurrent?: boolean };
    if (!response.ok) {
      setError(body.error || (ru ? "Сессия не завершена." : "Sessiya yakunlanmadi."));
      return;
    }
    if (body.revokedCurrent) {
      window.location.assign("/signout-with-chatgpt?return_to=/login");
      return;
    }
    setNotice(ru ? "Сессия завершена." : "Sessiya yakunlandi.");
    await load();
  }

  async function requestDeletion(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const response = await fetch("/api/platform/privacy/deletion-request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ confirmation: deleteConfirmation }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error || (ru ? "Запрос не создан." : "So‘rov yaratilmadi."));
    else { setNotice(ru ? "Запрос на удаление зарегистрирован." : "O‘chirish so‘rovi ro‘yxatdan o‘tkazildi."); setDeleteConfirmation(""); }
  }

  if (loading) return <div className="profile-loading"><LoaderCircle className="spin" /></div>;
  const title = view === "profile" ? (ru ? "Профиль" : "Profil") : view === "security" ? (ru ? "Безопасность" : "Xavfsizlik") : view === "privacy" ? (ru ? "Приватность и данные" : "Maxfiylik va ma’lumotlar") : (ru ? "Настройки" : "Sozlamalar");
  const Icon = view === "profile" ? UserRound : view === "security" ? ShieldCheck : view === "privacy" ? Database : Languages;
  return <section className="profile-workspace"><header><Icon /><div><small>JURO</small><h1>{title}</h1><p>{ru ? "Данные и права изменяются через защищённые серверные операции." : "Ma’lumotlar va huquqlar himoyalangan server amallari orqali o‘zgartiriladi."}</p></div></header><nav aria-label={ru ? "Настройки аккаунта" : "Hisob sozlamalari"}><Link className={view === "profile" ? "active" : ""} href={`${base}/profile`}>{ru ? "Профиль" : "Profil"}</Link><Link className={view === "settings" ? "active" : ""} href={`${base}/settings`}>{ru ? "Настройки" : "Sozlamalar"}</Link><Link className={view === "security" ? "active" : ""} href={`${base}/settings/security`}>{ru ? "Безопасность" : "Xavfsizlik"}</Link><Link className={view === "privacy" ? "active" : ""} href={`${base}/settings/privacy`}>{ru ? "Приватность" : "Maxfiylik"}</Link></nav>{error && <p className="profile-message error" role="alert"><CircleAlert />{error}</p>}{notice && <p className="profile-message success" role="status"><ShieldCheck />{notice}</p>}
    {(view === "profile" || view === "settings") && data && <form className="profile-form" onSubmit={save}><section><h2>{ru ? "Основные данные" : "Asosiy ma’lumotlar"}</h2><label>{ru ? "Имя" : "Ism"}<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Email<input disabled value={data.profile.email} /><small>{ru ? "Смена email требует отдельного подтверждения." : "Emailni o‘zgartirish alohida tasdiqni talab qiladi."}</small></label><label>{ru ? "Телефон" : "Telefon"}<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></label></section><section><h2>{ru ? "Пространство" : "Makon"}</h2><label>{ru ? "Язык" : "Til"}<select value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value as PlatformLocale })}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></select></label><label>{ru ? "Часовой пояс" : "Vaqt mintaqasi"}<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option value="Asia/Tashkent">Asia/Tashkent</option><option value="UTC">UTC</option></select></label>{accountType === "business" && <><label>{ru ? "Организация" : "Tashkilot"}<input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label><label>{ru ? "Роль в организации" : "Tashkilotdagi rol"}<input value={form.organizationRole} onChange={(event) => setForm({ ...form, organizationRole: event.target.value })} /></label></>}</section><button disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />}{ru ? "Сохранить изменения" : "O‘zgarishlarni saqlash"}</button></form>}
    {view === "security" && <div className="profile-panels">
      <section>
        <h2><MonitorSmartphone />{ru ? "JURO email-сессии" : "JURO email sessiyalari"}</h2>
        <p>{ru
          ? "Здесь показаны только входы по email-коду JURO. Сессии внешнего защищённого провайдера управляются у него и в этот список не входят."
          : "Bu yerda faqat JURO email-kodi orqali kirishlar ko‘rsatiladi. Tashqi himoyalangan provayder sessiyalari uning tizimida boshqariladi va bu ro‘yxatga kirmaydi."}</p>
        {sessions.length
          ? sessions.map(session => <div className="session-row" key={session.id}>
            <span>
              <strong>{session.deviceName}{Boolean(session.isCurrent) && <em>{ru ? "Текущая" : "Joriy"}</em>}</strong>
              <small>{ru ? "Последняя активность" : "Oxirgi faollik"}: {formatDateTime(session.lastSeenAt, ru)}</small>
              <small>{ru ? "Вход" : "Kirish"}: {formatDateTime(session.authenticatedAt || session.createdAt, ru)} · {session.authMethod === "email_otp" ? "Email OTP" : session.authMethod}</small>
            </span>
            <div className="session-actions">
              <time>{ru ? "до" : "gacha"} {formatDateTime(session.idleExpiresAt || session.expiresAt, ru)}</time>
              <button type="button" onClick={() => void closeSession(session)} aria-label={ru ? `Завершить сессию ${session.deviceName}` : `${session.deviceName} sessiyasini yakunlash`}><LogOut />{ru ? "Завершить" : "Yakunlash"}</button>
            </div>
          </div>)
          : <p>{ru ? "Активные JURO email-сессии не найдены." : "Faol JURO email sessiyalari topilmadi."}</p>}
        <div className="session-bulk-actions">
          {sessions.some(session => !Boolean(session.isCurrent)) && <button className="danger-outline" type="button" onClick={() => void closeOtherSessions()}>{ru ? "Завершить остальные" : "Boshqalarini yakunlash"}</button>}
          <button className="danger-outline" type="button" onClick={() => void closeAllSessions()}>{ru ? "Завершить все email-сессии" : "Barcha email sessiyalarini yakunlash"}</button>
        </div>
      </section>
      <section>
        <h2><ShieldCheck />{ru ? "Механизмы защиты" : "Himoya mexanizmlari"}</h2>
        <ul>
          <li>{ru ? "HttpOnly, Secure, SameSite=Lax cookie" : "HttpOnly, Secure, SameSite=Lax cookie"}</li>
          <li>{ru ? "Абсолютный и семидневный idle-срок сессии" : "Mutlaq va yetti kunlik idle sessiya muddati"}</li>
          <li>{ru ? "Точечный отзыв с серверной проверкой владельца" : "Egani serverda tekshirish bilan alohida bekor qilish"}</li>
          <li>{ru ? "Append-only цепочка событий безопасности" : "Append-only xavfsizlik hodisalari zanjiri"}</li>
        </ul>
        <p>{ru
          ? "TOTP и резервные коды пока не включены: они появятся только вместе с обязательной проверкой второго фактора при входе."
          : "TOTP va zaxira kodlari hozircha yoqilmagan: ular faqat kirishda ikkinchi omil majburiy tekshirilishi bilan birga paydo bo‘ladi."}</p>
      </section>
    </div>}
    {view === "privacy" && data && <div className="profile-panels"><section><h2><Download />{ru ? "Экспорт данных" : "Ma’lumotlarni eksport qilish"}</h2><p>{ru ? "Скачайте переносимый JSON с данными профиля, делами, метаданными документов, согласиями и вашей историей действий. Содержимое приватных файлов не включается автоматически." : "Profil, ishlar, hujjat metama’lumotlari, roziliklar va harakatlar tarixini JSON formatida yuklab oling. Maxfiy fayllar mazmuni avtomatik kiritilmaydi."}</p><Link className="profile-download" href="/api/platform/privacy/export" prefetch={false}><Download />{ru ? "Скачать экспорт" : "Eksportni yuklab olish"}</Link></section><section><h2>{ru ? "История согласий" : "Roziliklar tarixi"}</h2>{data.consents.length ? data.consents.map(consent => <div className="consent-row" key={`${consent.type}-${consent.grantedAt}`}><strong>{consent.type}</strong><span>v{consent.version}</span><time>{formatDateTime(consent.grantedAt, ru)}</time></div>) : <p>{ru ? "Записей пока нет." : "Hozircha yozuvlar yo‘q."}</p>}</section><form className="delete-request" onSubmit={requestDeletion}><Trash2 /><div><h2>{ru ? "Запросить удаление аккаунта" : "Hisobni o‘chirishni so‘rash"}</h2><p>{ru ? "Это отдельный процесс, а не архивирование документов. Введите DELETE, чтобы зарегистрировать запрос." : "Bu hujjatlarni arxivlash emas, alohida jarayon. So‘rovni ro‘yxatdan o‘tkazish uchun DELETE yozing."}</p><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" /><button disabled={deleteConfirmation !== "DELETE"}>{ru ? "Создать запрос" : "So‘rov yaratish"}</button></div></form></div>}
  </section>;
}

function formatDateTime(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
}
