import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LawyerCard } from "./LawyerCard";
import { getPublicLawyers } from "./catalog";
import styles from "./lawyers.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function localeOf(value: string) { return value === "ru" || value === "uz" ? value : null; }
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const ru = locale === "ru";
  return {
    title: ru ? "Юристы и адвокаты" : "Yuristlar va advokatlar",
    description: ru ? "Публичный каталог специалистов JURO: специализации, опыт, язык и доступность." : "JURO mutaxassislari ochiq katalogi: yo‘nalish, tajriba, til va mavjudlik.",
    // Pending profiles share the catalogue but must not enter a search index.
    robots: { index: false, follow: true },
    alternates: { canonical: `https://juro.uz/${locale}/lawyers`, languages: { ru: "https://juro.uz/ru/lawyers", uz: "https://juro.uz/uz/lawyers" } },
  };
}

export default async function LawyersPage({ params, searchParams }: Props) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const ru = locale === "ru";
  const query = await searchParams;
  const term = first(query.q).trim().toLowerCase();
  const specialty = first(query.specialty);
  const language = first(query.language);
  const availability = first(query.availability);
  const minExperience = Number(first(query.experience) || "0");
  const { lawyers, available } = await getPublicLawyers();
  const specialties = [...new Set(lawyers.flatMap((item) => item.specialties))].sort();
  const languages = [...new Set(lawyers.flatMap((item) => item.languages))].sort();
  const results = lawyers.filter((lawyer) => {
    const searchable = [lawyer.displayName, lawyer.firmName, lawyer.bio, lawyer.city, lawyer.region, ...lawyer.specialties, ...lawyer.languages].filter(Boolean).join(" ").toLowerCase();
    return (!term || searchable.includes(term)) && (!specialty || lawyer.specialties.includes(specialty)) && (!language || lawyer.languages.includes(language)) && (!availability || lawyer.availabilityStatus === availability) && (!minExperience || (lawyer.experienceYears || 0) >= minExperience);
  });
  const approved = results.filter((lawyer) => lawyer.canReceiveRequests);
  const pending = results.filter((lawyer) => !lawyer.canReceiveRequests);
  return <main className={styles.page} lang={locale}>
    <header className={styles.header}><Link href="/"><img src="/juro-logo-primary.png" alt="JURO" /></Link><nav><Link href={`/${locale}/lawyers`} aria-current="page">{ru ? "Юристы" : "Yuristlar"}</Link><a href={`https://app.juro.uz/${locale}/auth/login`}>{ru ? "Войти" : "Kirish"}</a><Link href={`/${ru ? "uz" : "ru"}/lawyers`}>{ru ? "O‘zbekcha" : "Русский"}</Link></nav></header>
    <section className={styles.hero}><span>{ru ? "JURO · ЖИВОЙ ЮРИСТ" : "JURO · JONLI YURIST"}</span><h1>{ru ? "Найдите юриста для следующего шага" : "Keyingi qadam uchun yurist toping"}</h1><p>{ru ? "Сравните специализации, опыт и формат консультации. Перед передачей материалов дела JURO всегда запросит ваше отдельное согласие." : "Mutaxassislik, tajriba va maslahat formatini taqqoslang. Ish materiallarini topshirishdan oldin JURO har doim alohida roziligingizni so‘raydi."}</p></section>
    <section className={styles.catalogue} aria-labelledby="catalogue-heading"><h2 id="catalogue-heading" className={styles.srOnly}>{ru ? "Каталог специалистов" : "Mutaxassislar katalogi"}</h2>
      <form className={styles.filters} method="get" aria-label={ru ? "Фильтры каталога" : "Katalog filtrlari"}>
        <label>{ru ? "Поиск" : "Qidiruv"}<input name="q" defaultValue={term} maxLength={160} placeholder={ru ? "Имя, фирма или специализация" : "Ism, firma yoki mutaxassislik"} /></label>
        <label>{ru ? "Специализация" : "Mutaxassislik"}<select name="specialty" defaultValue={specialty}><option value="">{ru ? "Все" : "Barchasi"}</option>{specialties.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>{ru ? "Язык" : "Til"}<select name="language" defaultValue={language}><option value="">{ru ? "Любой" : "Istalgan"}</option>{languages.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>{ru ? "Доступность" : "Mavjudlik"}<select name="availability" defaultValue={availability}><option value="">{ru ? "Любая" : "Istalgan"}</option><option value="available">{ru ? "Доступен" : "Mavjud"}</option><option value="limited">{ru ? "Ограниченная" : "Cheklangan"}</option></select></label>
        <label>{ru ? "Опыт" : "Tajriba"}<select name="experience" defaultValue={minExperience ? String(minExperience) : ""}><option value="">{ru ? "Любой" : "Istalgan"}</option><option value="3">3+</option><option value="5">5+</option><option value="10">10+</option></select></label>
        <button type="submit">{ru ? "Показать" : "Ko‘rsatish"}</button>
      </form>
      {!available ? <p className={styles.notice} role="status">{ru ? "Каталог временно обновляется. Попробуйте позже." : "Katalog vaqtincha yangilanmoqda. Keyinroq urinib ko‘ring."}</p> : <><p className={styles.count}>{ru ? `Найдено специалистов: ${results.length}` : `Topilgan mutaxassislar: ${results.length}`}</p><div className={styles.grid}>{approved.map((lawyer) => <LawyerCard key={lawyer.id} lawyer={lawyer} locale={locale} />)}</div>{pending.length > 0 && <section className={styles.pendingSection} aria-labelledby="pending-heading"><h2 id="pending-heading">{ru ? "Профили на проверке JURO" : "JURO tekshiruvidagi profillar"}</h2><p>{ru ? "Эти специалисты завершили публичный профиль. Пока проверка не завершена, оставить заявку нельзя." : "Bu mutaxassislar ochiq profilini to‘ldirgan. Tekshiruv tugamaguncha so‘rov qoldirib bo‘lmaydi."}</p><div className={styles.grid}>{pending.map((lawyer) => <LawyerCard key={lawyer.id} lawyer={lawyer} locale={locale} />)}</div></section>}{results.length === 0 && <section className={styles.empty}><h2>{ru ? "Подходящих профилей пока нет" : "Mos profillar hozircha yo‘q"}</h2><p>{ru ? "Измените фильтры или вернитесь позже: каталог пополняется после проверки профилей." : "Filtrlarni o‘zgartiring yoki keyinroq qayting: katalog profillar tekshirilgach to‘ldiriladi."}</p></section>}</>}
    </section>
  </main>;
}
