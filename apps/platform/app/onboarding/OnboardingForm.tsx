"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Check, LoaderCircle, Scale, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

type Locale = "ru" | "uz";
type AccountType = "individual" | "business";

type Props = {
  initialLocale: Locale;
  initialAccountType: AccountType;
  initialName: string;
  initialCompanyName: string;
};

const goalOptions = [
  ["personal_issue", "Решить личный вопрос", "Shaxsiy masalani hal qilish"],
  ["review_document", "Проверить документ", "Hujjatni tekshirish"],
  ["create_document", "Создать документ", "Hujjat yaratish"],
  ["business_cases", "Вести дела бизнеса", "Biznes ishlarini yuritish"],
  ["legal_automation", "Автоматизировать работу юриста", "Yurist ishini avtomatlashtirish"],
] as const;
type Goal = (typeof goalOptions)[number][0];

export function OnboardingForm({ initialLocale, initialAccountType, initialName, initialCompanyName }: Props) {
  const [locale, setLocale] = useState(initialLocale);
  const [accountType, setAccountType] = useState(initialAccountType);
  const [displayName, setDisplayName] = useState(initialName);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [organizationRole, setOrganizationRole] = useState("owner");
  const [primaryGoal, setPrimaryGoal] = useState<Goal>(goalOptions[accountType === "business" ? 3 : 0][0]);
  const [acceptPolicies, setAcceptPolicies] = useState(false);
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
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ locale, accountType, displayName, companyName, organizationRole, primaryGoal, acceptPolicies }),
      });
      const data = await response.json() as { redirectTo?: string; error?: string };
      if (!response.ok || !data.redirectTo) throw new Error(data.error || (ru ? "Не удалось сохранить настройки." : "Sozlamalarni saqlab bo‘lmadi."));
      window.location.assign(data.redirectTo);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      setPending(false);
    }
  }

  return (
    <main className="onboarding-page" lang={locale}>
      <section className="onboarding-card">
        <div className="onboarding-copy">
          <span>JURO · 01/01</span>
          <h1>{ru ? "Настроим рабочее пространство" : "Ish makonini sozlaymiz"}</h1>
          <p>{ru ? "Только данные, необходимые для первого действия. Коллег и дополнительные настройки можно добавить позже." : "Faqat birinchi harakat uchun zarur ma’lumotlar. Hamkasblar va qo‘shimcha sozlamalarni keyin qo‘shish mumkin."}</p>
        </div>
        <figure className="onboarding-jurobek">
          <Image src="/jurobek-avatar.webp" alt={ru ? "Jurobek — помощник JURO" : "Jurobek — JURO yordamchisi"} width={1024} height={1792} priority unoptimized />
        </figure>
        <form onSubmit={submit}>
          <fieldset>
            <legend>{ru ? "Язык" : "Til"}</legend>
            <div className="onboarding-segments">
              <button type="button" className={locale === "ru" ? "active" : ""} aria-pressed={locale === "ru"} onClick={() => setLocale("ru")}>Русский</button>
              <button type="button" className={locale === "uz" ? "active" : ""} aria-pressed={locale === "uz"} onClick={() => setLocale("uz")}>O‘zbekcha</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>{ru ? "Тип пространства" : "Makon turi"}</legend>
            <div className="onboarding-segments">
              <button type="button" className={accountType === "individual" ? "active" : ""} aria-pressed={accountType === "individual"} onClick={() => { setAccountType("individual"); setPrimaryGoal("personal_issue"); }}><UserRound />{ru ? "Личное" : "Shaxsiy"}</button>
              <button type="button" className={accountType === "business" ? "active" : ""} aria-pressed={accountType === "business"} onClick={() => { setAccountType("business"); setPrimaryGoal("business_cases"); }}><BriefcaseBusiness />{ru ? "Бизнес" : "Biznes"}</button>
            </div>
          </fieldset>
          <label>{ru ? "Как к вам обращаться" : "Sizga qanday murojaat qilamiz"}<input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 160))} required autoComplete="name" /></label>
          {accountType === "business" && (
            <div className="onboarding-row">
              <label>{ru ? "Организация" : "Tashkilot"}<input value={companyName} onChange={(event) => setCompanyName(event.target.value.slice(0, 180))} required autoComplete="organization" /></label>
              <label>{ru ? "Ваша роль" : "Sizning rolingiz"}<select value={organizationRole} onChange={(event) => setOrganizationRole(event.target.value)}><option value="owner">{ru ? "Владелец" : "Egasi"}</option><option value="director">{ru ? "Руководитель" : "Rahbar"}</option><option value="lawyer">{ru ? "Юрист" : "Yurist"}</option><option value="employee">{ru ? "Сотрудник" : "Xodim"}</option><option value="other">{ru ? "Другая" : "Boshqa"}</option></select></label>
            </div>
          )}
          <fieldset>
            <legend>{ru ? "С чего хотите начать" : "Nimadan boshlamoqchisiz"}</legend>
            <div className="onboarding-goals">
              {goalOptions.map(([id, ruLabel, uzLabel]) => (
                <button type="button" className={primaryGoal === id ? "active" : ""} aria-pressed={primaryGoal === id} onClick={() => setPrimaryGoal(id)} key={id}>
                  <Scale /><span>{ru ? ruLabel : uzLabel}</span>{primaryGoal === id && <Check />}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="onboarding-consent"><input type="checkbox" checked={acceptPolicies} onChange={(event) => setAcceptPolicies(event.target.checked)} required /><span>{ru ? "Подтверждаю настройки и принимаю " : "Sozlamalarni tasdiqlayman va "}<Link href={`/legal/terms?lang=${locale}`} target="_blank">{ru ? "условия приложения" : "ilova shartlarini"}</Link>{ru ? " и правила AI." : " hamda AI qoidalarini qabul qilaman."}</span></label>
          {error && <p className="onboarding-error" role="alert">{error}</p>}
          <button className="onboarding-submit" disabled={pending || !acceptPolicies}>{pending ? <LoaderCircle className="spin" /> : <ArrowRight />}{ru ? "Открыть моё пространство" : "Mening makonimni ochish"}</button>
        </form>
      </section>
    </main>
  );
}
