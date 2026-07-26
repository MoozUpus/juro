"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated profile data is hydrated after the first browser render */

import Link from "next/link";
import { CircleAlert, Copy, Database, Download, KeyRound, Languages, LoaderCircle, LogOut, MailCheck, MonitorSmartphone, RefreshCcw, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  acceptances: Array<{
    type: string;
    version: string;
    locale: string | null;
    contentSha256: string | null;
    acceptedAt: string;
    status: string;
  }>;
  deletionRequest: {
    id: string;
    status: string;
    requestedAt: string;
    verifiedAt: string | null;
  } | null;
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
type MfaStatus = {
  available: boolean;
  canManage: boolean;
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
  reason?: string;
};
type MfaSetup = {
  credentialId: string;
  secret: string;
  otpauthUri: string;
  expiresAt: string;
};
type DeletionChallenge = {
  challengeId: string;
  destination: string;
  expiresInSeconds: number;
};
type EmailChangeStatus = {
  available: boolean;
  canManage: boolean;
  reason?: string | null;
  currentEmail?: string;
  active: {
    challengeId: string;
    currentDestination: string;
    newDestination: string;
    expiresAt: string;
  } | null;
};

export function ProfileSettingsClient({ locale, accountType, view }: { locale: PlatformLocale; accountType: AccountType; view: View }) {
  const ru = locale === "ru";
  const base = `/${locale}/${accountType}`;
  const [data, setData] = useState<ProfileData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ fullName: "", phone: "", locale, timezone: "Asia/Tashkent", companyName: "", organizationRole: "" });
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletionCode, setDeletionCode] = useState("");
  const [deletionChallenge, setDeletionChallenge] = useState<DeletionChallenge | null>(null);
  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [emailChange, setEmailChange] = useState<EmailChangeStatus | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [currentEmailCode, setCurrentEmailCode] = useState("");
  const [newEmailCode, setNewEmailCode] = useState("");
  const mfaSetupRegion = useRef<HTMLDivElement>(null);
  const backupCodesRegion = useRef<HTMLDivElement>(null);
  const emailChangeRegion = useRef<HTMLDivElement>(null);

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
      if (view === "profile" || view === "settings") {
        const emailChangeResponse = await fetch(
          "/api/platform/security/email-change",
          { cache: "no-store" },
        );
        const emailChangeBody = await emailChangeResponse.json() as
          EmailChangeStatus & { error?: string };
        if (!emailChangeResponse.ok) {
          throw new Error(emailChangeBody.error || (ru
            ? "Настройки смены email не загрузились."
            : "Emailni almashtirish sozlamalari yuklanmadi."));
        }
        setEmailChange(emailChangeBody);
      }
      if (view === "security") {
        const sessionResponse = await fetch("/api/platform/security/sessions", { cache: "no-store" });
        const sessionBody = await sessionResponse.json() as { sessions?: Session[]; error?: string };
        if (!sessionResponse.ok) throw new Error(sessionBody.error || (ru ? "Сессии не загрузились." : "Sessiyalar yuklanmadi."));
        setSessions(sessionBody.sessions ?? []);
        const mfaResponse = await fetch("/api/platform/security/mfa", { cache: "no-store" });
        const mfaBody = await mfaResponse.json() as MfaStatus & { error?: string };
        if (!mfaResponse.ok) throw new Error(mfaBody.error || (ru ? "Настройки 2FA не загрузились." : "2FA sozlamalari yuklanmadi."));
        setMfa(mfaBody);
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru, view]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (mfaSetup) mfaSetupRegion.current?.focus();
  }, [mfaSetup]);
  useEffect(() => {
    if (backupCodes.length > 0) backupCodesRegion.current?.focus();
  }, [backupCodes.length]);
  useEffect(() => {
    if (emailChange?.active) emailChangeRegion.current?.focus();
  }, [emailChange?.active]);

  async function retryLoad() {
    setRetrying(true);
    try {
      await load();
    } finally {
      setRetrying(false);
    }
  }

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

  async function submitEmailChange(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/platform/security/email-change",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-csrf": "1",
          },
          body: JSON.stringify(emailChange?.active
            ? {
              action: "confirm",
              challengeId: emailChange.active.challengeId,
              currentCode: currentEmailCode,
              newCode: newEmailCode,
              locale,
            }
            : {
              action: "request_codes",
              newEmail,
              locale,
            }),
        },
      );
      const body = await response.json() as {
        code?: string;
        error?: string;
        challengeId?: string;
        currentDestination?: string;
        newDestination?: string;
        expiresInSeconds?: number;
        email?: string;
        revokedSessions?: number;
      };
      if (!response.ok) {
        setError(body.error || (ru
          ? "Email не изменён."
          : "Email o‘zgartirilmadi."));
        if ([
          "EMAIL_CHANGE_EXPIRED",
          "EMAIL_CHANGE_REPLACED",
          "EMAIL_CHANGE_ATTEMPTS_EXCEEDED",
          "EMAIL_CHANGE_ADDRESS_UNAVAILABLE",
          "EMAIL_CHANGE_STATE_CHANGED",
        ].includes(body.code ?? "")) {
          await load();
        }
      } else if (
        body.challengeId
        && body.currentDestination
        && body.newDestination
        && body.expiresInSeconds
      ) {
        setEmailChange(previous => ({
          available: previous?.available ?? true,
          canManage: true,
          reason: null,
          currentEmail: previous?.currentEmail ?? data?.profile.email,
          active: {
            challengeId: body.challengeId!,
            currentDestination: body.currentDestination!,
            newDestination: body.newDestination!,
            expiresAt: new Date(
              Date.now() + body.expiresInSeconds! * 1_000,
            ).toISOString(),
          },
        }));
        setCurrentEmailCode("");
        setNewEmailCode("");
        setNotice(ru
          ? "Почтовый сервис принял два разных письма для текущего и нового адресов."
          : "Pochta xizmati joriy va yangi manzillar uchun ikki xil xatni qabul qildi.");
      } else if (body.email) {
        setNewEmail("");
        setCurrentEmailCode("");
        setNewEmailCode("");
        setNotice(ru
          ? `Email изменён. Завершено других сессий: ${body.revokedSessions ?? 0}.`
          : `Email o‘zgartirildi. Boshqa yakunlangan sessiyalar: ${body.revokedSessions ?? 0}.`);
        await load();
      }
    } catch {
      setError(ru
        ? "Не удалось связаться с сервером. Повторите запрос."
        : "Server bilan bog‘lanib bo‘lmadi. So‘rovni takrorlang.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelEmailChange() {
    if (!emailChange?.active) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/platform/security/email-change",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-csrf": "1",
          },
          body: JSON.stringify({
            action: "cancel",
            challengeId: emailChange.active.challengeId,
            locale,
          }),
        },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || (ru
          ? "Проверка не отменена."
          : "Tekshiruv bekor qilinmadi."));
      }
      setEmailChange(previous => previous
        ? { ...previous, active: null }
        : previous);
      setNewEmail("");
      setCurrentEmailCode("");
      setNewEmailCode("");
      setNotice(ru
        ? "Смена email отменена."
        : "Emailni almashtirish bekor qilindi.");
    } catch (value) {
      setError(value instanceof Error
        ? value.message
        : (ru
          ? "Проверка не отменена."
          : "Tekshiruv bekor qilinmadi."));
    } finally {
      setSaving(false);
    }
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

  async function startMfaSetup() {
    setSaving(true);
    setError("");
    setNotice("");
    setBackupCodes([]);
    try {
      const response = await fetch(
        `/api/platform/security/mfa/setup?lang=${locale}`,
        {
          method: "POST",
          headers: { "x-juro-csrf": "1" },
        },
      );
      const body = await response.json() as MfaSetup & { error?: string };
      if (!response.ok || !body.credentialId) {
        throw new Error(body.error || (ru
          ? "Настройка 2FA не началась."
          : "2FA sozlash boshlanmadi."));
      }
      setMfaSetup(body);
      setMfaCode("");
    } catch (value) {
      setError(value instanceof Error
        ? value.message
        : (ru ? "Настройка 2FA не началась." : "2FA sozlash boshlanmadi."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmMfaSetup() {
    if (!mfaSetup) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/security/mfa/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({
          credentialId: mfaSetup.credentialId,
          code: mfaCode,
          locale,
        }),
      });
      const body = await response.json() as {
        backupCodes?: string[];
        error?: string;
      };
      if (!response.ok || !body.backupCodes?.length) {
        throw new Error(body.error || (ru
          ? "2FA не включена."
          : "2FA yoqilmadi."));
      }
      setBackupCodes(body.backupCodes);
      setMfaSetup(null);
      setMfaCode("");
      setNotice(ru
        ? "2FA включена. Сохраните резервные коды сейчас."
        : "2FA yoqildi. Zaxira kodlarni hozir saqlang.");
      await load();
    } catch (value) {
      setError(value instanceof Error
        ? value.message
        : (ru ? "2FA не включена." : "2FA yoqilmadi."));
    } finally {
      setSaving(false);
    }
  }

  async function manageMfa(action: "disable" | "regenerate") {
    if (!mfaCode.trim()) return;
    if (action === "disable" && !window.confirm(ru
      ? "Отключить двухфакторную защиту и завершить остальные сессии?"
      : "Ikki bosqichli himoyani o‘chirib, boshqa sessiyalarni yakunlaysizmi?")) return;
    setSaving(true);
    setError("");
    setNotice("");
    if (action === "regenerate") setBackupCodes([]);
    try {
      const response = await fetch(
        action === "disable"
          ? "/api/platform/security/mfa"
          : "/api/platform/security/mfa/backup-codes",
        {
          method: action === "disable" ? "DELETE" : "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-csrf": "1",
          },
          body: JSON.stringify({ code: mfaCode, locale }),
        },
      );
      const body = await response.json() as {
        backupCodes?: string[];
        error?: string;
      };
      if (!response.ok || (action === "regenerate" && !body.backupCodes?.length)) {
        throw new Error(body.error || (ru
          ? "Операция не выполнена."
          : "Amal bajarilmadi."));
      }
      setMfaCode("");
      if (action === "regenerate" && body.backupCodes?.length) {
        setBackupCodes(body.backupCodes);
        setNotice(ru
          ? "Создан новый набор. Старые резервные коды отозваны."
          : "Yangi to‘plam yaratildi. Eski zaxira kodlar bekor qilindi.");
      } else {
        setBackupCodes([]);
        setNotice(ru ? "2FA отключена." : "2FA o‘chirildi.");
      }
      await load();
    } catch (value) {
      setError(value instanceof Error
        ? value.message
        : (ru ? "Операция не выполнена." : "Amal bajarilmadi."));
    } finally {
      setSaving(false);
    }
  }

  async function copyBackupCodes() {
    setError("");
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setNotice(ru ? "Резервные коды скопированы." : "Zaxira kodlar nusxalandi.");
    } catch {
      setError(ru
        ? "Не удалось скопировать. Сохраните коды вручную."
        : "Nusxalab bo‘lmadi. Kodlarni qo‘lda saqlang.");
    }
  }

  async function requestDeletion(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/platform/privacy/deletion-request",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-csrf": "1",
          },
          body: JSON.stringify(deletionChallenge
            ? {
              action: "confirm",
              challengeId: deletionChallenge.challengeId,
              code: deletionCode,
              confirmation: deleteConfirmation,
              locale,
            }
            : { action: "request_code", locale }),
        },
      );
      const body = await response.json() as {
        error?: string;
        challengeId?: string;
        destination?: string;
        expiresInSeconds?: number;
        logout?: boolean;
      };
      if (!response.ok) {
        setError(body.error || (ru
          ? "Запрос не создан."
          : "So‘rov yaratilmadi."));
      } else if (body.logout) {
        setNotice(ru
          ? "Проверенный запрос зарегистрирован. Сессии завершены."
          : "Tasdiqlangan so‘rov ro‘yxatdan o‘tdi. Sessiyalar yakunlandi.");
        window.location.assign("/signout-with-chatgpt?return_to=/login");
      } else if (
        body.challengeId
        && body.destination
        && body.expiresInSeconds
      ) {
        setDeletionChallenge({
          challengeId: body.challengeId,
          destination: body.destination,
          expiresInSeconds: body.expiresInSeconds,
        });
        setNotice(ru
          ? `Код отправлен на ${body.destination}.`
          : `Kod ${body.destination} manziliga yuborildi.`);
      }
    } catch {
      setError(ru
        ? "Не удалось связаться с сервером. Повторите запрос."
        : "Server bilan bog‘lanib bo‘lmadi. So‘rovni takrorlang.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="profile-loading" role="status"><LoaderCircle className="spin" aria-hidden="true" /><span className="sr-only">{ru ? "Загрузка настроек" : "Sozlamalar yuklanmoqda"}</span></div>;
  const title = view === "profile" ? (ru ? "Профиль" : "Profil") : view === "security" ? (ru ? "Безопасность" : "Xavfsizlik") : view === "privacy" ? (ru ? "Приватность и данные" : "Maxfiylik va ma’lumotlar") : (ru ? "Настройки" : "Sozlamalar");
  const Icon = view === "profile" ? UserRound : view === "security" ? ShieldCheck : view === "privacy" ? Database : Languages;
  return <section className="profile-workspace"><header><Icon /><div><small>JURO</small><h1>{title}</h1><p>{ru ? "Данные и права изменяются через защищённые серверные операции." : "Ma’lumotlar va huquqlar himoyalangan server amallari orqali o‘zgartiriladi."}</p></div></header><nav aria-label={ru ? "Настройки аккаунта" : "Hisob sozlamalari"}><Link className={view === "profile" ? "active" : ""} href={`${base}/profile`}>{ru ? "Профиль" : "Profil"}</Link><Link className={view === "settings" ? "active" : ""} href={`${base}/settings`}>{ru ? "Настройки" : "Sozlamalar"}</Link><Link className={view === "security" ? "active" : ""} href={`${base}/settings/security`}>{ru ? "Безопасность" : "Xavfsizlik"}</Link><Link className={view === "privacy" ? "active" : ""} href={`${base}/settings/privacy`}>{ru ? "Приватность" : "Maxfiylik"}</Link></nav>{error && <p className="profile-message error" role="alert"><CircleAlert aria-hidden="true" />{error}</p>}{view === "security" && error && !mfa && <button className="profile-retry" type="button" disabled={retrying} aria-busy={retrying} onClick={() => void retryLoad()}>{retrying && <LoaderCircle className="spin" aria-hidden="true" />}{ru ? "Повторить загрузку" : "Qayta yuklash"}</button>}{notice && <p className="profile-message success" role="status"><ShieldCheck aria-hidden="true" />{notice}</p>}
    {(view === "profile" || view === "settings") && data && <form className="profile-form" onSubmit={save}><section><h2>{ru ? "Основные данные" : "Asosiy ma’lumotlar"}</h2><label>{ru ? "Имя" : "Ism"}<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Email<input disabled value={data.profile.email} /><small>{ru ? "Смена email требует отдельного подтверждения." : "Emailni o‘zgartirish alohida tasdiqni talab qiladi."}</small></label><label>{ru ? "Телефон" : "Telefon"}<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></label></section><section><h2>{ru ? "Пространство" : "Makon"}</h2><label>{ru ? "Язык" : "Til"}<select value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value as PlatformLocale })}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></select></label><label>{ru ? "Часовой пояс" : "Vaqt mintaqasi"}<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option value="Asia/Tashkent">Asia/Tashkent</option><option value="UTC">UTC</option></select></label>{accountType === "business" && <><label>{ru ? "Организация" : "Tashkilot"}<input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label><label>{ru ? "Роль в организации" : "Tashkilotdagi rol"}<input value={form.organizationRole} onChange={(event) => setForm({ ...form, organizationRole: event.target.value })} /></label></>}</section><button disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />}{ru ? "Сохранить изменения" : "O‘zgarishlarni saqlash"}</button></form>}
    {(view === "profile" || view === "settings") && data && emailChange && <section className="email-change-panel">
      <h2><MailCheck aria-hidden="true" />{ru ? "Защищённая смена email" : "Himoyalangan email almashtirish"}</h2>
      <p id="email-change-description">{ru
        ? "JURO отправит разные коды на текущий и новый адреса. Изменение применяется только после проверки обоих кодов и завершает остальные JURO email-сессии."
        : "JURO joriy va yangi manzillarga turli kodlarni yuboradi. O‘zgarish faqat ikkala kod tekshirilgach qo‘llanadi va boshqa JURO email sessiyalarini yakunlaydi."}</p>
      {!emailChange.canManage && <p>{ru
        ? "Смена email доступна только из локальной JURO email-сессии."
        : "Emailni almashtirish faqat mahalliy JURO email sessiyasida mavjud."}</p>}
      {emailChange.canManage && !emailChange.available && !emailChange.active && <p>{ru
        ? "Почтовая отправка ещё не настроена. Незавершённая проверка не создаётся."
        : "Pochta yuborish hali sozlanmagan. Tugallanmagan tekshiruv yaratilmaydi."}</p>}
      {emailChange.canManage && emailChange.available && !emailChange.active && <form onSubmit={submitEmailChange}>
        <label>{ru ? "Новый email" : "Yangi email"}
          <input
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value.slice(0, 254))}
            autoComplete="email"
            maxLength={254}
            aria-describedby="email-change-description"
            required
          />
        </label>
        <button type="submit" disabled={saving || newEmail.trim().length < 3} aria-busy={saving}>
          {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <MailCheck aria-hidden="true" />}
          {ru ? "Отправить два кода" : "Ikki kodni yuborish"}
        </button>
      </form>}
      {emailChange.canManage && emailChange.active && <div
        ref={emailChangeRegion}
        className="email-change-verification"
        role="region"
        tabIndex={-1}
        aria-label={ru ? "Подтверждение смены email" : "Emailni almashtirishni tasdiqlash"}
        aria-describedby="email-change-description"
      >
        <p role="status">{ru
          ? `Почтовый сервис принял письма для ${emailChange.active.currentDestination} и ${emailChange.active.newDestination}. Коды действуют до ${formatDateTime(emailChange.active.expiresAt, ru)}.`
          : `Pochta xizmati ${emailChange.active.currentDestination} va ${emailChange.active.newDestination} uchun xatlarni qabul qildi. Kodlar ${formatDateTime(emailChange.active.expiresAt, ru)} gacha amal qiladi.`}</p>
        <form onSubmit={submitEmailChange}>
          <label>{ru ? "Код с текущего email" : "Joriy email kodi"}
            <input
              value={currentEmailCode}
              onChange={(event) => setCurrentEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          <label>{ru ? "Код с нового email" : "Yangi email kodi"}
            <input
              value={newEmailCode}
              onChange={(event) => setNewEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          <div className="email-change-actions">
            <button
              type="submit"
              disabled={saving || currentEmailCode.length !== 6 || newEmailCode.length !== 6}
              aria-busy={saving}
            >
              {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              {ru ? "Проверить и изменить" : "Tekshirish va almashtirish"}
            </button>
            <button
              className="danger-outline"
              type="button"
              disabled={saving}
              onClick={() => void cancelEmailChange()}
            >
              {ru ? "Отмена" : "Bekor qilish"}
            </button>
          </div>
        </form>
      </div>}
    </section>}
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
      <section className="mfa-panel">
        <h2><KeyRound aria-hidden="true" />{ru ? "Двухфакторная защита" : "Ikki bosqichli himoya"}</h2>
        {mfa && !mfa.canManage && <p>{ru
          ? "Управление 2FA доступно только из локальной JURO email-сессии. Внешняя защищённая сессия не считается вторым фактором JURO."
          : "2FA boshqaruvi faqat mahalliy JURO email sessiyasida mavjud. Tashqi himoyalangan sessiya JURO ikkinchi omili hisoblanmaydi."}</p>}
        {mfa?.canManage && !mfa.available && <p>{ru
          ? "Серверный ключ шифрования 2FA ещё не подключён. Настройка скрыта и не создаёт незавершённый фактор."
          : "2FA server shifrlash kaliti hali ulanmagan. Sozlash yashirilgan va tugallanmagan omil yaratmaydi."}</p>}
        {mfa?.available && !mfa.enabled && !mfaSetup && <div className="mfa-state">
          <span>{ru ? "Статус: выключена" : "Holat: o‘chirilgan"}</span>
          <p>{ru
            ? "После включения каждый вход по email потребует шестизначный TOTP-код или одноразовый резервный код."
            : "Yoqilgandan so‘ng har bir email orqali kirish olti xonali TOTP yoki bir martalik zaxira kodni talab qiladi."}</p>
          <button type="button" disabled={saving} aria-busy={saving} onClick={() => void startMfaSetup()}>
            {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            {ru ? "Подключить 2FA" : "2FA ni ulash"}
          </button>
        </div>}
        {mfaSetup && <div
          ref={mfaSetupRegion}
          className="mfa-setup"
          role="region"
          tabIndex={-1}
          aria-label={ru ? "Настройка 2FA" : "2FA sozlash"}
          aria-describedby="mfa-setup-description"
        >
          <p id="mfa-setup-description">{ru
            ? "Добавьте JURO в приложение-аутентификатор. Секрет показан только во время этой настройки."
            : "JURO ni autentifikator ilovasiga qo‘shing. Sir faqat shu sozlash vaqtida ko‘rsatiladi."}</p>
          <a href={mfaSetup.otpauthUri}>{ru ? "Открыть в аутентификаторе" : "Autentifikatorda ochish"}</a>
          <code>{mfaSetup.secret}</code>
          <small>{ru ? "Настройка действует до" : "Sozlash muddati"}: {formatDateTime(mfaSetup.expiresAt, ru)}</small>
          <label>{ru ? "Код из приложения" : "Ilovadagi kod"}
            <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="mfa-setup-description" />
          </label>
          <div className="mfa-actions">
            <button type="button" disabled={saving || mfaCode.length !== 6} aria-busy={saving} onClick={() => void confirmMfaSetup()}>
              {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              {ru ? "Подтвердить и включить" : "Tasdiqlash va yoqish"}
            </button>
            <button className="danger-outline" type="button" disabled={saving} onClick={() => { setMfaSetup(null); setMfaCode(""); }}>
              {ru ? "Отмена" : "Bekor qilish"}
            </button>
          </div>
        </div>}
        {mfa?.enabled && <div className="mfa-state">
          <span className="mfa-enabled"><ShieldCheck aria-hidden="true" />{ru ? "2FA включена" : "2FA yoqilgan"}</span>
          <p id="mfa-manage-description">{ru
            ? `Неиспользованных резервных кодов: ${mfa.backupCodesRemaining}. Для изменения введите свежий TOTP или резервный код.`
            : `Ishlatilmagan zaxira kodlar: ${mfa.backupCodesRemaining}. O‘zgartirish uchun yangi TOTP yoki zaxira kodni kiriting.`}</p>
          <label>{ru ? "Код подтверждения" : "Tasdiqlash kodi"}
            <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 64))} autoComplete="one-time-code" maxLength={64} aria-describedby="mfa-manage-description" />
          </label>
          <div className="mfa-actions">
            <button type="button" disabled={saving || mfaCode.trim().length < 6} aria-busy={saving} onClick={() => void manageMfa("regenerate")}>
              <RefreshCcw aria-hidden="true" />{ru ? "Новые резервные коды" : "Yangi zaxira kodlar"}
            </button>
            <button className="danger-outline" type="button" disabled={saving || mfaCode.trim().length < 6} aria-busy={saving} onClick={() => void manageMfa("disable")}>
              {ru ? "Отключить 2FA" : "2FA ni o‘chirish"}
            </button>
          </div>
        </div>}
        {backupCodes.length > 0 && <div
          ref={backupCodesRegion}
          className="backup-codes"
          role="region"
          tabIndex={-1}
          aria-label={ru ? "Новые резервные коды" : "Yangi zaxira kodlar"}
          aria-describedby="backup-codes-description"
        >
          <strong>{ru ? "Сохраните эти коды сейчас" : "Bu kodlarni hozir saqlang"}</strong>
          <p id="backup-codes-description">{ru
            ? "После закрытия страницы JURO больше не покажет этот набор. Каждый код работает один раз."
            : "Sahifa yopilgach JURO bu to‘plamni qayta ko‘rsatmaydi. Har bir kod bir marta ishlaydi."}</p>
          <div>{backupCodes.map(code => <code key={code}>{code}</code>)}</div>
          <button type="button" onClick={() => void copyBackupCodes()}><Copy aria-hidden="true" />{ru ? "Скопировать коды" : "Kodlarni nusxalash"}</button>
        </div>}
      </section>
      <section>
        <h2><ShieldCheck />{ru ? "Механизмы защиты" : "Himoya mexanizmlari"}</h2>
        <ul>
          <li>{ru ? "HttpOnly, Secure, SameSite=Lax cookie" : "HttpOnly, Secure, SameSite=Lax cookie"}</li>
          <li>{ru ? "Абсолютный и семидневный idle-срок сессии" : "Mutlaq va yetti kunlik idle sessiya muddati"}</li>
          <li>{ru ? "TOTP replay-fence и одноразовые резервные коды" : "TOTP replay-fence va bir martalik zaxira kodlar"}</li>
          <li>{ru ? "Append-only цепочка событий безопасности" : "Append-only xavfsizlik hodisalari zanjiri"}</li>
        </ul>
      </section>
    </div>}
    {view === "privacy" && data && <div className="profile-panels">
      <section>
        <h2><Download />{ru ? "Экспорт данных" : "Ma’lumotlarni eksport qilish"}</h2>
        <p>{ru
          ? "Скачайте переносимый JSON с данными профиля, делами, метаданными документов, согласиями и вашей историей действий. Содержимое приватных файлов не включается автоматически."
          : "Profil, ishlar, hujjat metama’lumotlari, roziliklar va harakatlar tarixini JSON formatida yuklab oling. Maxfiy fayllar mazmuni avtomatik kiritilmaydi."}</p>
        <Link className="profile-download" href="/api/platform/privacy/export" prefetch={false}>
          <Download />{ru ? "Скачать экспорт" : "Eksportni yuklab olish"}
        </Link>
      </section>
      <section>
        <h2>{ru ? "История согласий" : "Roziliklar tarixi"}</h2>
        {data.acceptances.map(acceptance => <div className="consent-row" key={`${acceptance.type}-${acceptance.version}`}>
          <strong>{acceptance.type}</strong>
          <span>
            v{acceptance.version} · {acceptance.locale || "—"} · {acceptance.status}
          </span>
          <time>{formatDateTime(acceptance.acceptedAt, ru)}</time>
        </div>)}
        {data.consents.map(consent => <div className="consent-row" key={`${consent.type}-${consent.grantedAt}`}>
          <strong>{consent.type}</strong>
          <span>v{consent.version}</span>
          <time>{formatDateTime(consent.grantedAt, ru)}</time>
        </div>)}
        {!data.acceptances.length && !data.consents.length && <p>
          {ru ? "Записей пока нет." : "Hozircha yozuvlar yo‘q."}
        </p>}
      </section>
      {data.deletionRequest
        ? <section className="deletion-request-status">
          <h2><Trash2 />{ru ? "Запрос на удаление зарегистрирован" : "O‘chirish so‘rovi ro‘yxatdan o‘tgan"}</h2>
          <p>{ru
            ? "JURO принял проверенный запрос. Данные не стираются автоматически: оператор должен проверить обязательные сроки хранения и последующие действия."
            : "JURO tasdiqlangan so‘rovni qabul qildi. Ma’lumotlar avtomatik o‘chirilmaydi: operator majburiy saqlash muddati va keyingi amallarni tekshiradi."}</p>
          <div className="consent-row">
            <strong>{data.deletionRequest.status}</strong>
            <span>{data.deletionRequest.id}</span>
            <time>{formatDateTime(data.deletionRequest.requestedAt, ru)}</time>
          </div>
        </section>
        : <form className="delete-request" onSubmit={requestDeletion}>
        <Trash2 />
        <div>
          <h2>{ru ? "Запросить удаление аккаунта" : "Hisobni o‘chirishni so‘rash"}</h2>
          <p id="deletion-request-description">{ru
            ? "Это проверенный запрос, а не немедленное стирание: после подтверждения JURO завершит все email-сессии, а оператор проверит обязательные сроки хранения. Архивирование документов к этому процессу не относится."
            : "Bu darhol o‘chirish emas, tasdiqlangan so‘rov: tasdiqlangach JURO barcha email sessiyalarini yakunlaydi, operator esa majburiy saqlash muddatlarini tekshiradi. Hujjatlarni arxivlash bu jarayonga kirmaydi."}</p>
          {!deletionChallenge
            ? <button type="submit" disabled={saving} aria-busy={saving}>
              {saving && <LoaderCircle className="spin" aria-hidden="true" />}
              {ru ? "Получить код по email" : "Email orqali kod olish"}
            </button>
            : <>
              <p className="deletion-code-destination" role="status">{ru
                ? `Код отправлен на ${deletionChallenge.destination} и действует ${Math.floor(deletionChallenge.expiresInSeconds / 60)} минут.`
                : `Kod ${deletionChallenge.destination} manziliga yuborildi va ${Math.floor(deletionChallenge.expiresInSeconds / 60)} daqiqa amal qiladi.`}</p>
              <label>{ru ? "Код из письма" : "Xatdagi kod"}
                <input
                  value={deletionCode}
                  onChange={(event) => setDeletionCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  aria-describedby="deletion-request-description"
                  required
                />
              </label>
              <label>{ru ? "Контрольное подтверждение" : "Nazorat tasdig‘i"}
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  required
                />
              </label>
              <div className="deletion-actions">
                <button
                  type="submit"
                  disabled={saving || deletionCode.length !== 6 || deleteConfirmation !== "DELETE"}
                  aria-busy={saving}
                >
                  {saving && <LoaderCircle className="spin" aria-hidden="true" />}
                  {ru ? "Подтвердить запрос" : "So‘rovni tasdiqlash"}
                </button>
                <button
                  className="danger-outline"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDeletionChallenge(null);
                    setDeletionCode("");
                    setDeleteConfirmation("");
                  }}
                >
                  {ru ? "Отмена" : "Bekor qilish"}
                </button>
              </div>
            </>}
        </div>
        </form>}
    </div>}
  </section>;
}

function formatDateTime(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
}
