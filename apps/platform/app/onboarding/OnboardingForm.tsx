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
import { ThemeSwitcher } from "../_theme/ThemeSwitcher";

type Locale = "ru" | "uz";

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
  ["individual", "Физическое лицо", "Jismoniy shaxs", UserRound],
  [
    "entrepreneur",
    "Индивидуальный предприниматель",
    "Yakka tartibdagi tadbirkor",
    BriefcaseBusiness,
  ],
  ["lawyer", "Юрист", "Yurist", Scale],
] as const;

const goalOptions = [
  [
    "legal_answer",
    "Получить юридический ответ",
    "Huquqiy javob olish",
    MessageCircleQuestion,
  ],
  [
    "review_document",
    "Проверить документ",
    "Hujjatni tekshirish",
    FileCheck2,
  ],
  [
    "create_document",
    "Создать документ",
    "Hujjat yaratish",
    FilePlus2,
  ],
  [
    "manage_case",
    "Вести юридическое дело",
    "Huquqiy ishni yuritish",
    FolderKanban,
  ],
  ["find_lawyer", "Найти юриста", "Yurist topish", UsersRound],
  [
    "professional_work",
    "Использовать JURO в профессиональной работе",
    "JURO’dan professional ishda foydalanish",
    Scale,
  ],
] as const;

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
  const ru = locale === "ru";

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
            (ru
              ? "Не удалось сохранить настройки."
              : "Sozlamalarni saqlab bo‘lmadi."),
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
          <h1>
            {ru
              ? "Настроим ваш личный кабинет"
              : "Shaxsiy kabinetingizni sozlaymiz"}
          </h1>
          <p>
            {ru
              ? "Укажите данные, необходимые для персональной юридической работы. Бизнес-пространство можно создать отдельно после входа."
              : "Shaxsiy huquqiy ish uchun zarur ma’lumotlarni kiriting. Biznes makonini tizimga kirgandan so‘ng alohida yaratish mumkin."}
          </p>
        </div>
        <figure className="onboarding-jurobek">
          <Image
            src="/jurobek-avatar.webp"
            alt={ru
              ? "Журобек — помощник JURO"
              : "Jurobek — JURO yordamchisi"}
            width={1024}
            height={1792}
            priority
            unoptimized
          />
        </figure>
        <form onSubmit={submit}>
          <fieldset>
            <legend>{ru ? "Язык" : "Til"}</legend>
            <div className="onboarding-segments onboarding-segments-language">
              <button
                type="button"
                className={locale === "ru" ? "active" : ""}
                aria-pressed={locale === "ru"}
                onClick={() => setLocale("ru")}
              >
                Русский
              </button>
              <button
                type="button"
                className={locale === "uz" ? "active" : ""}
                aria-pressed={locale === "uz"}
                onClick={() => setLocale("uz")}
              >
                O‘zbekcha
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend>{ru ? "Тип профиля" : "Profil turi"}</legend>
            {initialAccountPersona === "lawyer" ? <div className="onboarding-fixed-persona"><Scale />{ru ? "Профессиональный кабинет юриста" : "Yuristning professional kabineti"}</div> : <div className="onboarding-segments onboarding-personas">
              {personaOptions.map(([id, ruLabel, uzLabel, Icon]) => (
                <button
                  type="button"
                  className={accountPersona === id ? "active" : ""}
                  aria-pressed={accountPersona === id}
                  onClick={() => setAccountPersona(id)}
                  key={id}
                >
                  <Icon />
                  <span>{ru ? ruLabel : uzLabel}</span>
                </button>
              ))}
            </div>}
          </fieldset>
          <div className="onboarding-row">
            <label>
              {ru ? "Фамилия" : "Familiya"}
              <input
                value={lastName}
                onChange={(event) =>
                  setLastName(event.target.value.slice(0, 80))}
                required
                autoComplete="family-name"
              />
            </label>
            <label>
              {ru ? "Имя" : "Ism"}
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
              {ru ? "Отчество, если имеется" : "Otasining ismi, agar bo‘lsa"}
              <input
                value={middleName}
                onChange={(event) =>
                  setMiddleName(event.target.value.slice(0, 80))}
                autoComplete="additional-name"
              />
            </label>
            <label>
              {ru ? "Телефон" : "Telefon"}
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
            <legend>
              {ru ? "Основная цель" : "Asosiy maqsad"}
            </legend>
            <div className="onboarding-goals">
              {goalOptions.map(([id, ruLabel, uzLabel, Icon]) => (
                <button
                  type="button"
                  className={primaryGoal === id ? "active" : ""}
                  aria-pressed={primaryGoal === id}
                  onClick={() => setPrimaryGoal(id)}
                  key={id}
                >
                  <Icon />
                  <span>{ru ? ruLabel : uzLabel}</span>
                  {primaryGoal === id && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="onboarding-policy-evidence">
            {developmentPolicyBypass
              ? (ru
                ? "Локальный режим разработки: подтверждение обязательных документов пропущено и не записывается как согласие пользователя. Документы: "
                : "Mahalliy ishlab chiqish rejimi: majburiy hujjatlarni tasdiqlash o‘tkazib yuborildi va foydalanuvchi roziligi sifatida yozilmaydi. Hujjatlar: ")
              : (ru
                ? "Обязательные документы подтверждены при регистрации по email-коду: "
                : "Majburiy hujjatlar email-kod orqali ro‘yxatdan o‘tishda tasdiqlangan: ")}
            <Link href={`/legal/terms?lang=${locale}`} target="_blank">
              {ru ? "условия" : "shartlar"}
            </Link>
            {", "}
            <Link href={`/legal/privacy?lang=${locale}`} target="_blank">
              {ru ? "конфиденциальность" : "maxfiylik"}
            </Link>
            {ru ? " и " : " va "}
            <Link
              href={`/legal/personal-data?lang=${locale}`}
              target="_blank"
            >
              {ru ? "обработка данных" : "ma’lumotlarni qayta ishlash"}
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
            {ru ? "Открыть личный кабинет" : "Shaxsiy kabinetni ochish"}
          </button>
        </form>
      </section>
    </main>
  );
}
