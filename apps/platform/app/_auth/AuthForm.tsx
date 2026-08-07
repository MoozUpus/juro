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
  Scale,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { TurnstileWidget } from "./TurnstileWidget";

type AccountType = "individual" | "entrepreneur" | "lawyer";
type Locale = "ru" | "uz";

type Props = {
  mode: "login" | "register";
  initialLocale: Locale;
  initialAccountType?: AccountType;
  returnTo?: string;
  otpEnabled: boolean;
  platformAuthEnabled: boolean;
  turnstileSiteKey?: string;
};

type OtpResponse = {
  challengeId?: string;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  retryAfterSeconds?: number;
  redirectTo?: string;
  requiresTwoFactor?: boolean;
  error?: string;
  code?: string;
};

function safeReturnPath(value?: string): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "https://app.juro.uz");
    if (url.origin !== "https://app.juro.uz") return null;
    if (["/login", "/register", "/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname)) return null;
    if (/^\/(?:ru|uz)\/auth\/(?:login|register)\/?$/.test(url.pathname)) return null;
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
  turnstileSiteKey,
}: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const [step, setStep] = useState<"details" | "code" | "mfa">("details");
  const [challengeId, setChallengeId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptPersonalData, setAcceptPersonalData] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const previousStep = useRef(step);
  const emailInput = useRef<HTMLInputElement>(null);
  const otpInput = useRef<HTMLInputElement>(null);
  const mfaInput = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const target = step === "details"
      ? emailInput.current
      : step === "code"
        ? otpInput.current
        : mfaInput.current;
    target?.focus();
  }, [step]);

  async function sendCode() {
    setError("");
    if (!turnstileToken) {
      setError(ru
        ? "Дождитесь завершения проверки безопасности."
        : "Xavfsizlik tekshiruvi tugashini kuting.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({
          email,
          purpose: mode,
          locale,
          accountType,
          turnstileToken,
        }),
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
      setTurnstileToken("");
      setTurnstileReset((value) => value + 1);
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
          acceptTerms,
          acceptPrivacy,
          acceptPersonalData,
          marketing,
          rememberMe,
        }),
      });
      const data = await response.json() as OtpResponse;
      if (!response.ok) {
        if (data.code === "ACCOUNT_NOT_FOUND" || data.code === "OTP_USED") {
          // A one-time code is intentionally non-retryable. Return to the
          // email step instead of leaving a stale code form on screen.
          setChallengeId("");
          setCode("");
          setCooldown(0);
          setTurnstileToken("");
          setTurnstileReset((value) => value + 1);
          setStep("details");
        }
        throw new Error(data.error || (ru ? "Не удалось подтвердить код." : "Kodni tasdiqlab bo‘lmadi."));
      }
      if (data.requiresTwoFactor) {
        setMfaCode("");
        setStep("mfa");
        return;
      }
      if (!data.redirectTo) {
        throw new Error(ru
          ? "Сервер не вернул безопасный маршрут продолжения."
          : "Server xavfsiz davom etish yo‘lini qaytarmadi.");
      }
      window.location.assign(explicitReturnTo ?? data.redirectTo);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setPending(false);
    }
  }

  async function verifySecondFactor(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/verify-mfa", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({ code: mfaCode.trim(), locale, rememberMe }),
      });
      const data = await response.json() as OtpResponse;
      if (!response.ok || !data.redirectTo) {
        const message = data.error || (ru
          ? "Не удалось подтвердить второй фактор."
          : "Ikkinchi omilni tasdiqlab bo‘lmadi.");
        if ([
          "MFA_CHALLENGE_INVALID",
          "MFA_CHALLENGE_EXPIRED",
          "MFA_CHALLENGE_USED",
          "MFA_ATTEMPTS_EXCEEDED",
        ].includes(data.code ?? "")) {
          setStep("details");
          setChallengeId("");
          setCode("");
          setMfaCode("");
          setCooldown(0);
          setError(message);
          return;
        }
        throw new Error(message);
      }
      window.location.assign(explicitReturnTo ?? data.redirectTo);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
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
            : <p className="auth-error" role="status">{ru ? "Владелец проекта должен подключить Resend и Cloudflare Turnstile через защищённое хранилище." : "Loyiha egasi Resend va Cloudflare Turnstile xizmatlarini himoyalangan saqlash orqali ulashi kerak."}</p>}
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
                <div className="auth-account-type" aria-label={ru ? "Тип профиля" : "Profil turi"}>
                  <button type="button" className={accountType === "individual" ? "active" : ""} aria-pressed={accountType === "individual"} onClick={() => setAccountType("individual")}>
                    <UserRound />{ru ? "Физлицо" : "Jismoniy shaxs"}
                  </button>
                  <button type="button" className={accountType === "entrepreneur" ? "active" : ""} aria-pressed={accountType === "entrepreneur"} onClick={() => setAccountType("entrepreneur")}>
                    <BriefcaseBusiness />{ru ? "ИП" : "Yakka tartibdagi tadbirkor"}
                  </button>
                  <button type="button" className={accountType === "lawyer" ? "active" : ""} aria-pressed={accountType === "lawyer"} onClick={() => setAccountType("lawyer")}>
                    <Scale />{ru ? "Юрист" : "Yurist"}
                  </button>
                </div>
                <div className="auth-row">
                  <label>{ru ? "Имя" : "Ism"}<input value={firstName} onChange={(event) => setFirstName(event.target.value.slice(0, 80))} required autoComplete="given-name" /></label>
                  <label>{ru ? "Фамилия" : "Familiya"}<input value={lastName} onChange={(event) => setLastName(event.target.value.slice(0, 80))} required autoComplete="family-name" /></label>
                </div>
              </>
            )}

            <label>Email<input ref={emailInput} type="email" value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} required autoComplete="email" inputMode="email" placeholder="name@example.com" /></label>

            <label className="auth-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              <span>{ru
                ? "Запомнить меня на этом устройстве на 30 дней"
                : "Meni ushbu qurilmada 30 kun eslab qolish"}</span>
            </label>

            {mode === "register" && (
              <div className="auth-consents">
                <Consent checked={acceptTerms} onChange={setAcceptTerms} required href={`/legal/terms?lang=${locale}`} label={ru ? "Принимаю условия использования приложения" : "Ilovadan foydalanish shartlarini qabul qilaman"} />
                <Consent checked={acceptPrivacy} onChange={setAcceptPrivacy} required href={`/legal/privacy?lang=${locale}`} label={ru ? "Ознакомлен(а) с политикой конфиденциальности приложения" : "Ilova maxfiylik siyosati bilan tanishdim"} />
                <Consent checked={acceptPersonalData} onChange={setAcceptPersonalData} required href={`/legal/personal-data?lang=${locale}`} label={ru ? "Согласен(на) с обработкой персональных данных" : "Shaxsiy ma’lumotlarni qayta ishlashga roziman"} />
                <label><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} /><span>{ru ? "Получать полезные новости (необязательно)" : "Foydali yangiliklarni olish (ixtiyoriy)"}</span></label>
              </div>
            )}

            {turnstileSiteKey && (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                locale={locale}
                resetSignal={turnstileReset}
                onToken={setTurnstileToken}
              />
            )}

            <button className="auth-submit" disabled={pending || !turnstileToken} aria-busy={pending}>
              {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {ru ? "Получить код" : "Kodni olish"}
            </button>
          </form>
        ) : step === "code" ? (
          <form onSubmit={verifyCode}>
            <header>
              <CheckCircle2 />
              <div>
                <h2>{ru ? "Введите код из письма" : "Xatdagi kodni kiriting"}</h2>
                <p>{ru ? `Мы отправили код на ${masked}` : `Kod ${masked} manziliga yuborildi`}</p>
              </div>
            </header>
            <label>{ru ? "Шестизначный код" : "Olti xonali kod"}
              <input ref={otpInput} className="auth-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="otp-hint" />
            </label>
            <small id="otp-hint" className="auth-hint">{ru ? "Не передавайте этот код другим людям." : "Bu kodni boshqa odamlarga bermang."}</small>
            <button className="auth-submit" disabled={pending || code.length !== 6} aria-busy={pending}>
              {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {ru ? "Подтвердить" : "Tasdiqlash"}
            </button>
            <div className="auth-code-actions">
              <button type="button" className="auth-back" onClick={() => { setStep("details"); setCode(""); setChallengeId(""); setError(""); }}>
                {ru ? "Изменить email" : "Emailni o‘zgartirish"}
              </button>
              {cooldown <= 0 && turnstileSiteKey && (
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  locale={locale}
                  resetSignal={turnstileReset}
                  onToken={setTurnstileToken}
                />
              )}
              <button type="button" className="auth-resend" onClick={() => void sendCode()} disabled={pending || cooldown > 0 || !turnstileToken}>
                <RotateCcw aria-hidden="true" />{cooldown > 0
                  ? (ru ? `Повторить через ${cooldown} с` : `${cooldown} s dan keyin`)
                  : (ru ? "Отправить код повторно" : "Kodni qayta yuborish")}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verifySecondFactor}>
            <header>
              <ShieldCheck aria-hidden="true" />
              <div>
                <h2>{ru
                  ? "Подтвердите второй фактор"
                  : "Ikkinchi omilni tasdiqlang"}</h2>
                <p>{ru
                  ? "Введите код из приложения-аутентификатора или один резервный код."
                  : "Autentifikator ilovasidagi kodni yoki bitta zaxira kodni kiriting."}</p>
              </div>
            </header>
            <label>{ru ? "Код подтверждения" : "Tasdiqlash kodi"}
              <input
                ref={mfaInput}
                className="auth-code auth-mfa-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9 -]/g, "")
                    .slice(0, 64),
                )}
                required
                inputMode="text"
                autoComplete="one-time-code"
                maxLength={64}
                aria-describedby="mfa-hint"
              />
            </label>
            <small id="mfa-hint" className="auth-hint">{ru
              ? "TOTP-код содержит 6 цифр. Резервный код можно вводить с дефисами или без."
              : "TOTP kodi 6 raqamdan iborat. Zaxira kodni chiziqcha bilan yoki chiziqchasiz kiriting."}</small>
            <button className="auth-submit" disabled={pending || mfaCode.trim().length < 6} aria-busy={pending}>
              {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {ru ? "Завершить вход" : "Kirishni yakunlash"}
            </button>
            <button
              type="button"
              className="auth-back"
              disabled={pending}
              onClick={() => {
                setStep("details");
                setChallengeId("");
                setCode("");
                setMfaCode("");
                setError("");
              }}
            >
              {ru ? "Начать вход заново" : "Kirishni qaytadan boshlash"}
            </button>
          </form>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="auth-switch">
          {mode === "register"
            ? <>{ru ? "Уже есть аккаунт?" : "Hisobingiz bormi?"} <Link href={`/${locale}/auth/login`}>{ru ? "Войти" : "Kirish"}</Link></>
            : <>{ru ? "Нет аккаунта?" : "Hisob yo‘qmi?"} <Link href={`/${locale}/auth/register?accountType=${accountType}`}>{ru ? "Создать" : "Yaratish"}</Link></>}
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
