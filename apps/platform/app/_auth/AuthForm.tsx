"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  KeyRound,
  Languages,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type AccountType = "individual" | "business";
type Locale = "ru" | "uz";

type Props = {
  mode: "login" | "register";
  initialLocale: Locale;
  initialAccountType?: AccountType;
  returnTo?: string;
  otpEnabled: boolean;
  platformAuthEnabled: boolean;
};

type OtpResponse = {
  challengeId?: string;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  retryAfterSeconds?: number;
  redirectTo?: string;
  error?: string;
  code?: string;
};

function safeReturnPath(value?: string): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "https://app.juro.uz");
    if (url.origin !== "https://app.juro.uz") return null;
    if (["/login", "/register", "/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function AuthForm({
  mode,
  initialLocale,
  initialAccountType = "individual",
  returnTo,
  otpEnabled,
  platformAuthEnabled,
}: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const [step, setStep] = useState<"details" | "code">("details");
  const [challengeId, setChallengeId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptPersonalData, setAcceptPersonalData] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const ru = locale === "ru";
  const explicitReturnTo = safeReturnPath(returnTo);
  const protectedReturnTo = explicitReturnTo ?? "/";
  const masked = useMemo(() => {
    const [name, domain] = email.split("@");
    return domain ? `${name.slice(0, 2)}•••@${domain}` : email;
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({ email, purpose: mode, locale, accountType }),
      });
      const data = await response.json() as OtpResponse;
      if (!response.ok || !data.challengeId) {
        if (data.retryAfterSeconds) setCooldown(data.retryAfterSeconds);
        throw new Error(data.error || (ru ? "Не удалось отправить код." : "Kod yuborilmadi."));
      }
      setChallengeId(data.challengeId);
      setCode("");
      setStep("code");
      setCooldown(data.resendAfterSeconds ?? 60);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setPending(false);
    }
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    await sendCode();
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({
          challengeId,
          email,
          code,
          purpose: mode,
          locale,
          accountType,
          firstName,
          lastName,
          companyName,
          acceptTerms,
          acceptPrivacy,
          acceptPersonalData,
          marketing,
        }),
      });
      const data = await response.json() as OtpResponse;
      if (!response.ok || !data.redirectTo) {
        throw new Error(data.error || (ru ? "Не удалось подтвердить код." : "Kodni tasdiqlab bo‘lmadi."));
      }
      window.location.assign(explicitReturnTo ?? data.redirectTo);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      setPending(false);
    }
  }

  if (!otpEnabled) {
    return (
      <main className="auth-page" lang={locale}>
        <BrandPanel locale={locale} mode={mode} />
        <section className="auth-card">
          <LanguageSwitch locale={locale} onChange={setLocale} />
          <header className="auth-unavailable">
            <KeyRound />
            <div>
              <h2>{ru ? "Защищённый вход" : "Himoyalangan kirish"}</h2>
              <p>{ru
                ? "Email-код недоступен, потому что сервер отправки не настроен. Ложное сообщение об отправке не показывается."
                : "Server yuborish xizmati sozlanmagani uchun email-kod mavjud emas. Yuborildi degan soxta xabar ko‘rsatilmaydi."}</p>
            </div>
          </header>
          {platformAuthEnabled
            ? <Link className="auth-submit" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(protectedReturnTo)}`}><ArrowRight />{ru ? "Продолжить защищённый вход" : "Himoyalangan kirishni davom ettirish"}</Link>
            : <p className="auth-error" role="status">{ru ? "Владелец проекта должен подключить RESEND_API_KEY и EMAIL_FROM." : "Loyiha egasi RESEND_API_KEY va EMAIL_FROM ni ulashi kerak."}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page" lang={locale}>
      <BrandPanel locale={locale} mode={mode} />
      <section className="auth-card">
        <LanguageSwitch locale={locale} onChange={setLocale} />
        {step === "details" ? (
          <form onSubmit={requestCode}>
            <header>
              <KeyRound />
              <div>
                <h2>{mode === "register"
                  ? (ru ? "Регистрация по email" : "Email orqali ro‘yxatdan o‘tish")
                  : (ru ? "Вход по одноразовому коду" : "Bir martalik kod orqali kirish")}</h2>
                <p>{ru ? "Код действует 10 минут. Пароль не требуется." : "Kod 10 daqiqa amal qiladi. Parol kerak emas."}</p>
              </div>
            </header>

            {mode === "register" && (
              <>
                <div className="auth-account-type" aria-label={ru ? "Тип пространства" : "Makon turi"}>
                  <button type="button" className={accountType === "individual" ? "active" : ""} aria-pressed={accountType === "individual"} onClick={() => setAccountType("individual")}>
                    <UserRound />{ru ? "Личное" : "Shaxsiy"}
                  </button>
                  <button type="button" className={accountType === "business" ? "active" : ""} aria-pressed={accountType === "business"} onClick={() => setAccountType("business")}>
                    <BriefcaseBusiness />{ru ? "Бизнес" : "Biznes"}
                  </button>
                </div>
                <div className="auth-row">
                  <label>{ru ? "Имя" : "Ism"}<input value={firstName} onChange={(event) => setFirstName(event.target.value.slice(0, 80))} required autoComplete="given-name" /></label>
                  <label>{ru ? "Фамилия" : "Familiya"}<input value={lastName} onChange={(event) => setLastName(event.target.value.slice(0, 80))} required autoComplete="family-name" /></label>
                </div>
                {accountType === "business" && (
                  <label>{ru ? "Название организации" : "Tashkilot nomi"}<input value={companyName} onChange={(event) => setCompanyName(event.target.value.slice(0, 180))} required autoComplete="organization" /></label>
                )}
              </>
            )}

            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} required autoComplete="email" inputMode="email" placeholder="name@example.com" /></label>

            {mode === "register" && (
              <div className="auth-consents">
                <Consent checked={acceptTerms} onChange={setAcceptTerms} required href={`/legal/terms?lang=${locale}`} label={ru ? "Принимаю условия использования приложения" : "Ilovadan foydalanish shartlarini qabul qilaman"} />
                <Consent checked={acceptPrivacy} onChange={setAcceptPrivacy} required href={`/legal/privacy?lang=${locale}`} label={ru ? "Ознакомлен(а) с политикой конфиденциальности приложения" : "Ilova maxfiylik siyosati bilan tanishdim"} />
                <Consent checked={acceptPersonalData} onChange={setAcceptPersonalData} required href={`/legal/personal-data?lang=${locale}`} label={ru ? "Согласен(на) с обработкой персональных данных" : "Shaxsiy ma’lumotlarni qayta ishlashga roziman"} />
                <label><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} /><span>{ru ? "Получать полезные новости (необязательно)" : "Foydali yangiliklarni olish (ixtiyoriy)"}</span></label>
              </div>
            )}

            <button className="auth-submit" disabled={pending}>
              {pending ? <LoaderCircle className="spin" /> : <ArrowRight />}
              {ru ? "Получить код" : "Kodni olish"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <header>
              <CheckCircle2 />
              <div>
                <h2>{ru ? "Введите код из письма" : "Xatdagi kodni kiriting"}</h2>
                <p>{ru ? `Мы отправили код на ${masked}` : `Kod ${masked} manziliga yuborildi`}</p>
              </div>
            </header>
            <label>{ru ? "Шестизначный код" : "Olti xonali kod"}
              <input className="auth-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="otp-hint" />
            </label>
            <small id="otp-hint" className="auth-hint">{ru ? "Не передавайте этот код другим людям." : "Bu kodni boshqa odamlarga bermang."}</small>
            <button className="auth-submit" disabled={pending || code.length !== 6}>
              {pending ? <LoaderCircle className="spin" /> : <ArrowRight />}
              {ru ? "Подтвердить" : "Tasdiqlash"}
            </button>
            <div className="auth-code-actions">
              <button type="button" className="auth-back" onClick={() => { setStep("details"); setCode(""); setChallengeId(""); setError(""); }}>
                {ru ? "Изменить email" : "Emailni o‘zgartirish"}
              </button>
              <button type="button" className="auth-resend" onClick={() => void sendCode()} disabled={pending || cooldown > 0}>
                <RotateCcw />{cooldown > 0
                  ? (ru ? `Повторить через ${cooldown} с` : `${cooldown} s dan keyin`)
                  : (ru ? "Отправить код повторно" : "Kodni qayta yuborish")}
              </button>
            </div>
          </form>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="auth-switch">
          {mode === "register"
            ? <>{ru ? "Уже есть аккаунт?" : "Hisobingiz bormi?"} <Link href={`/login?lang=${locale}`}>{ru ? "Войти" : "Kirish"}</Link></>
            : <>{ru ? "Нет аккаунта?" : "Hisob yo‘qmi?"} <Link href={`/register?lang=${locale}&accountType=${accountType}`}>{ru ? "Создать" : "Yaratish"}</Link></>}
        </div>
        {platformAuthEnabled && <Link className="auth-siwc" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(protectedReturnTo)}`}>
          {ru ? "Войти через защищённую учётную запись" : "Himoyalangan hisob orqali kirish"}
        </Link>}
      </section>
    </main>
  );
}

function BrandPanel({ locale, mode }: { locale: Locale; mode: "login" | "register" }) {
  const ru = locale === "ru";
  return (
    <section className="auth-brand">
      <Link href={`https://juro.uz/${locale}`} aria-label="JURO">
        <Image src="/juro-logo-light.png" alt="JURO" width={1268} height={1240} unoptimized />
      </Link>
      <div>
        <span><ShieldCheck />{ru ? "Защищённое юридическое пространство" : "Himoyalangan yuridik makon"}</span>
        <h1>{mode === "register"
          ? (ru ? "Начните работу в JURO" : "JURO bilan ishlashni boshlang")
          : (ru ? "С возвращением" : "Qaytganingizdan xursandmiz")}</h1>
        <p>{ru
          ? "Документы, дела и планы связаны с вашей учётной записью и открываются только после серверной проверки сессии."
          : "Hujjatlar, ishlar va rejalar hisobingizga bog‘langan va faqat server sessiyani tekshirgandan keyin ochiladi."}</p>
      </div>
      <small>{ru ? "JURO не является государственным органом или нотариусом." : "JURO davlat organi yoki notarius emas."}</small>
    </section>
  );
}

function LanguageSwitch({ locale, onChange }: { locale: Locale; onChange: (value: Locale) => void }) {
  return (
    <div className="auth-language" aria-label="RU / UZ">
      <Languages aria-hidden="true" />
      <button type="button" className={locale === "ru" ? "active" : ""} aria-pressed={locale === "ru"} onClick={() => onChange("ru")}>RU</button>
      <button type="button" className={locale === "uz" ? "active" : ""} aria-pressed={locale === "uz"} onClick={() => onChange("uz")}>UZ</button>
    </div>
  );
}

function Consent({ checked, onChange, required, href, label }: { checked: boolean; onChange: (value: boolean) => void; required?: boolean; href: string; label: string }) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} required={required} />
      <span><a href={href} target="_blank" rel="noreferrer">{label}</a></span>
    </label>
  );
}
