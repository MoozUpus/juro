"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileCheck2,
  FilePlus2,
  FolderKanban,
  LoaderCircle,
  MessageCircleQuestion,
  Scale,
  UserRound,
  UsersRound,
} from "lucide-react";
import { FormEvent, useState } from "react";
import type {
  AccountPersona,
  OnboardingGoal,
} from "../../lib/platform/onboarding";
import type { PlatformLocale } from "../../lib/platform/routing";
import { ThemeSwitcher } from "../_theme/ThemeSwitcher";

type Locale = PlatformLocale;

type Props = {
  initialLocale: Locale;
  initialAccountPersona: AccountPersona;
  initialLastName: string;
  initialFirstName: string;
  initialMiddleName: string;
  initialPhone: string;
  developmentPolicyBypass: boolean;
};

const personaOptions = [
  ["individual", "Физическое лицо", "Jismoniy shaxs", "Individual", UserRound],
  [
    "entrepreneur",
    "Индивидуальный предприниматель",
    "Yakka tartibdagi tadbirkor",
    "Sole proprietor",
    BriefcaseBusiness,
  ],
  ["lawyer", "Юрист", "Yurist", "Lawyer", Scale],
] as const;

const goalOptions = [
  [
    "legal_answer",
    "Получить юридический ответ",
    "Huquqiy javob olish",
    "Get a legal answer",
    MessageCircleQuestion,
  ],
  [
    "review_document",
    "Проверить документ",
    "Hujjatni tekshirish",
    "Review a document",
    FileCheck2,
  ],
  [
    "create_document",
    "Создать документ",
    "Hujjat yaratish",
    "Create a document",
    FilePlus2,
  ],
  [
    "manage_case",
    "Вести юридическое дело",
    "Huquqiy ishni yuritish",
    "Manage a legal matter",
    FolderKanban,
  ],
  ["find_lawyer", "Найти юриста", "Yurist topish", "Find a lawyer", UsersRound],
  [
    "professional_work",
    "Использовать JURO в профессиональной работе",
    "JURO’dan professional ishda foydalanish",
    "Use JURO for professional work",
    Scale,
  ],
] as const;

function localized(
  locale: Locale,
  russian: string,
  uzbek: string,
  english: string,
): string {
  return locale === "ru" ? russian : locale === "uz" ? uzbek : english;
}

export function OnboardingForm({
  initialLocale,
  initialAccountPersona,
  initialLastName,
  initialFirstName,
  initialMiddleName,
  initialPhone,
  developmentPolicyBypass,
}: Props) {
  const [locale, setLocale] = useState(initialLocale);
  const [accountPersona, setAccountPersona] = useState<AccountPersona>(
    initialAccountPersona,
  );
  const [lastName, setLastName] = useState(initialLastName);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [middleName, setMiddleName] = useState(initialMiddleName);
  const [phone, setPhone] = useState(initialPhone);
  const [primaryGoal, setPrimaryGoal] = useState<OnboardingGoal>(
    initialAccountPersona === "lawyer" ? "professional_work" : "legal_answer",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const text = (russian: string, uzbek: string, english: string) =>
    localized(locale, russian, uzbek, english);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
          "x-juro-locale": locale,
        },
        body: JSON.stringify({
          locale,
          accountPersona,
          lastName,
          firstName,
          middleName,
          phone,
          primaryGoal,
        }),
      });
      const data = await response.json() as {
        redirectTo?: string;
        error?: string;
      };
      if (!response.ok || !data.redirectTo) {
        throw new Error(
          data.error ||
            text(
              "Не удалось сохранить настройки.",
              "Sozlamalarni saqlab bo‘lmadi.",
              "We could not save your settings.",
            ),
        );
      }
      window.location.assign(data.redirectTo);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      setPending(false);
    }
  }

  return (
    <main className="onboarding-page" lang={locale}>
      <section className="onboarding-card">
        <div className="onboarding-theme"><ThemeSwitcher locale={locale} compact persistAccount={false} /></div>
        <div className="onboarding-copy">
          <span>JURO · 01/01</span>
          <h1>{text(
            "Настроим ваш личный кабинет",
            "Shaxsiy kabinetingizni sozlaymiz",
            "Set up your personal workspace",
          )}</h1>
          <p>{text(
            "Укажите данные, необходимые для персональной юридической работы. Бизнес-пространство можно создать отдельно после входа.",
            "Shaxsiy huquqiy ish uchun zarur ma’lumotlarni kiriting. Biznes makonini tizimga kirgandan so‘ng alohida yaratish mumkin.",
            "Add the details needed for your personal legal work. You can create a separate business workspace after signing in.",
          )}</p>
        </div>
        <figure className="onboarding-jurobek">
          <Image
            src="/jurobek-avatar.webp"
            alt={text(
              "Журобек — помощник JURO",
              "Jurobek — JURO yordamchisi",
              "Jurobek, your JURO assistant",
            )}
            width={1024}
            height={1792}
            priority
            unoptimized
          />
        </figure>
        <form onSubmit={submit}>
          <fieldset>
            <legend>{text("Язык", "Til", "Language")}</legend>
            <div className="onboarding-segments onboarding-segments-language">
              {(["ru", "uz", "en"] as const).map((value) => (
                <button
                  type="button"
                  className={locale === value ? "active" : ""}
                  aria-pressed={locale === value}
                  onClick={() => setLocale(value)}
                  key={value}
                >
                  {{ ru: "Русский", uz: "O‘zbekcha", en: "English" }[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{text("Тип профиля", "Profil turi", "Profile type")}</legend>
            {initialAccountPersona === "lawyer" ? <div className="onboarding-fixed-persona"><Scale />{text("Профессиональный кабинет юриста", "Yuristning professional kabineti", "Professional lawyer workspace")}</div> : <div className="onboarding-segments onboarding-personas">
              {personaOptions.map(([id, ruLabel, uzLabel, enLabel, Icon]) => (
                <button
                  type="button"
                  className={accountPersona === id ? "active" : ""}
                  aria-pressed={accountPersona === id}
                  onClick={() => setAccountPersona(id)}
                  key={id}
                >
                  <Icon />
                  <span>{localized(locale, ruLabel, uzLabel, enLabel)}</span>
                </button>
              ))}
            </div>}
          </fieldset>
          <div className="onboarding-row">
            <label>
              {text("Фамилия", "Familiya", "Last name")}
              <input
                value={lastName}
                onChange={(event) =>
                  setLastName(event.target.value.slice(0, 80))}
                required
                autoComplete="family-name"
              />
            </label>
            <label>
              {text("Имя", "Ism", "First name")}
              <input
                value={firstName}
                onChange={(event) =>
                  setFirstName(event.target.value.slice(0, 80))}
                required
                autoComplete="given-name"
              />
            </label>
          </div>
          <div className="onboarding-row">
            <label>
              {text("Отчество, если имеется", "Otasining ismi, agar bo‘lsa", "Middle name, if applicable")}
              <input
                value={middleName}
                onChange={(event) =>
                  setMiddleName(event.target.value.slice(0, 80))}
                autoComplete="additional-name"
              />
            </label>
            <label>
              {text("Телефон", "Telefon", "Phone number")}
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value.slice(0, 40))}
                required
                autoComplete="tel"
                inputMode="tel"
                placeholder="+998 90 123 45 67"
              />
            </label>
          </div>
          <fieldset>
            <legend>{text("Основная цель", "Asosiy maqsad", "Primary goal")}</legend>
            <div className="onboarding-goals">
              {goalOptions.map(([id, ruLabel, uzLabel, enLabel, Icon]) => (
                <button
                  type="button"
                  className={primaryGoal === id ? "active" : ""}
                  aria-pressed={primaryGoal === id}
                  onClick={() => setPrimaryGoal(id)}
                  key={id}
                >
                  <Icon />
                  <span>{localized(locale, ruLabel, uzLabel, enLabel)}</span>
                  {primaryGoal === id && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="onboarding-policy-evidence">
            {developmentPolicyBypass
              ? text(
                "Локальный режим разработки: подтверждение обязательных документов пропущено и не записывается как согласие пользователя. Документы: ",
                "Mahalliy ishlab chiqish rejimi: majburiy hujjatlarni tasdiqlash o‘tkazib yuborildi va foydalanuvchi roziligi sifatida yozilmaydi. Hujjatlar: ",
                "Local development mode: required-policy confirmation was bypassed and is not recorded as user consent. Documents: ",
              )
              : text(
                "Обязательные документы подтверждены при регистрации по email-коду: ",
                "Majburiy hujjatlar email-kod orqali ro‘yxatdan o‘tishda tasdiqlangan: ",
                "Required documents were accepted during email-code registration: ",
              )}
            <Link href={`/legal/terms?lang=${locale}`} target="_blank">
              {text("условия", "shartlar", "terms")}
            </Link>
            {", "}
            <Link href={`/legal/privacy?lang=${locale}`} target="_blank">
              {text("конфиденциальность", "maxfiylik", "privacy policy")}
            </Link>
            {text(" и ", " va ", " and ")}
            <Link
              href={`/legal/personal-data?lang=${locale}`}
              target="_blank"
            >
              {text("обработка данных", "ma’lumotlarni qayta ishlash", "personal data processing")}
            </Link>
            .
          </p>
          {error && (
            <p className="onboarding-error" role="alert">
              {error}
            </p>
          )}
          <button className="onboarding-submit" disabled={pending}>
            {pending
              ? <LoaderCircle className="spin" aria-hidden="true" />
              : <ArrowRight aria-hidden="true" />}
            {text("Открыть личный кабинет", "Shaxsiy kabinetni ochish", "Open my workspace")}
          </button>
        </form>
      </section>
    </main>
  );
}
