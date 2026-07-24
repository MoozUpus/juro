"use client";

/* eslint-disable react-hooks/set-state-in-effect -- UI language is restored from the existing JURO preference after hydration */

import Link from "next/link";
import { ArrowRight, Bell, Clock3, FileCheck2, FilePenLine, Search, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DocumentCategory, DocumentLibraryItem } from "../../../lib/document-builder/registry";
import { localize, type BuilderLanguage } from "../../../lib/document-builder/registry/engine";

const LANGUAGE_KEY = "juro-builder-language";

function initialLanguage(): BuilderLanguage {
  if (typeof window === "undefined") return "ru";
  return window.localStorage.getItem(LANGUAGE_KEY) === "uz" || window.localStorage.getItem("juro-lang") === "uz" ? "uz" : "ru";
}

export function LanguageToggle({ language, onChange }: { language: BuilderLanguage; onChange: (language: BuilderLanguage) => void }) {
  return <div className="dbt-language-toggle" role="group" aria-label="Til / Язык">
    <button type="button" className={language === "ru" ? "active" : ""} onClick={() => onChange("ru")}>RU</button>
    <button type="button" className={language === "uz" ? "active" : ""} onClick={() => onChange("uz")}>UZ</button>
  </div>;
}

function TemplateCard({ document, language }: { document: DocumentLibraryItem; language: BuilderLanguage }) {
  const title = language === "uz" && document.titleUz ? document.titleUz : document.titleRu;
  const description = language === "uz" && document.descriptionUz ? document.descriptionUz : document.descriptionRu;
  const available = document.status === "published";
  const verified = document.editorialStatus === "Published";
  return <article className={`dbt-template-card ${available ? "published" : "review"}`}>
    <div className="dbt-template-card-top"><span className={`dbt-template-state ${verified ? "ready" : "pending"}`}>{verified ? (language === "uz" ? "Tekshirilgan" : "Проверен") : (language === "uz" ? "Beta · tekshiruvda" : "Бета · на проверке")}</span><small>№ {document.code}</small></div>
    <h3>{title}</h3>
    <p>{description}</p>
    <div className="dbt-template-meta"><span><Clock3 size={15}/>{document.estimatedMinutes ?? 10} {language === "uz" ? "daqiqa" : "мин"}</span><span><FileCheck2 size={15}/>DOCX · PDF</span></div>
    {!verified && <p className="dbt-translation-note"><ShieldCheck size={15}/>{language === "uz" ? "Topshirishdan oldin yurist tekshiruvi talab etiladi." : "Перед подачей требуется проверка юристом."}</p>}
    {available ? <Link href={`/document-builder/${document.categorySlug}/${document.code}`}>{language === "uz" ? "Hujjat yaratish" : "Создать документ"}<ArrowRight size={17}/></Link> : <span className="dbt-template-disabled"><ShieldCheck size={16}/>{language === "uz" ? "Vaqtincha mavjud emas" : "Временно недоступен"}</span>}
  </article>;
}

export function DocumentLibraryClient({ categories, documents, activeCategory, signedIn = false }: { categories: readonly DocumentCategory[]; documents: readonly DocumentLibraryItem[]; activeCategory?: DocumentCategory; signedIn?: boolean }) {
  const [language, setLanguage] = useState<BuilderLanguage>("ru");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "verified" | "beta">("all");
  const [limit, setLimit] = useState(48);
  useEffect(() => setLanguage(initialLanguage()), []);
  const changeLanguage = (next: BuilderLanguage) => { setLanguage(next); window.localStorage.setItem(LANGUAGE_KEY, next); };
  const filtered = useMemo(() => documents.filter((document) => {
    const text = `${document.titleRu} ${document.titleUz} ${document.descriptionRu} ${document.descriptionUz} ${document.code}`.toLocaleLowerCase();
    const statusMatches = status === "all" || (status === "verified" ? document.editorialStatus === "Published" : document.editorialStatus !== "Published");
    return text.includes(search.trim().toLocaleLowerCase()) && statusMatches;
  }), [documents, search, status]);
  const visible = filtered.slice(0, limit);
  const publishedCount = documents.filter((document) => document.status === "published").length;
  return <main className="dbt-library-page">
    <section className="dbt-library-hero">
      <div><span className="dbt-eyebrow">JURO DOCUMENTS</span><h1>{activeCategory ? localize(activeCategory.title, language) : language === "uz" ? "Hujjatlar kutubxonasi" : "Библиотека документов"}</h1><p>{activeCategory ? localize(activeCategory.description, language) : language === "uz" ? "O‘zbekiston qonunchiligi asosida bosqichma-bosqich hujjat yarating." : "Создавайте документы пошагово на основе законодательства Узбекистана."}</p></div>
      <div className="dbt-library-summary"><strong>{documents.length}</strong><span>{language === "uz" ? "reyestrdagi shablon" : "шаблонов в реестре"}</span><small>{publishedCount} {language === "uz" ? "foydalanish uchun ochiq" : "доступны для заполнения"}</small></div>
      <LanguageToggle language={language} onChange={changeLanguage}/>
    </section>
    {!activeCategory && <section className="dbt-workspace-links" aria-label={language === "uz" ? "Hujjatlar bilan ishlash" : "Работа с документами"}>
      <Link href="/document-builder/debt/0602001"><FilePenLine size={21}/><span><strong>{language === "uz" ? "Tilxat konstruktori" : "Конструктор расписки"}</strong><small>{language === "uz" ? "Maxsus bosqichma-bosqich shakl" : "Специализированная пошаговая форма"}</small></span><ArrowRight size={18}/></Link>
      <Link href="/document-builder/documents"><FileCheck2 size={21}/><span><strong>{language === "uz" ? "Mening hujjatlarim" : "Мои документы"}</strong><small>{signedIn ? (language === "uz" ? "Qoralamalar va tayyor fayllar" : "Черновики и готовые файлы") : (language === "uz" ? "Kirish talab etiladi" : "Потребуется вход")}</small></span><ArrowRight size={18}/></Link>
      <Link href="/document-builder/notifications"><Bell size={21}/><span><strong>{language === "uz" ? "Takliflar va harakatlar" : "Приглашения и действия"}</strong><small>{language === "uz" ? "Kelishuvni kutayotgan hujjatlar" : "Документы, ожидающие согласования"}</small></span><ArrowRight size={18}/></Link>
      <Link href="/document-builder/contacts"><UsersRound size={21}/><span><strong>{language === "uz" ? "Tomonlar va kontaktlar" : "Стороны и контакты"}</strong><small>{language === "uz" ? "Ishtirokchilar ma’lumotlarini qayta ishlatish" : "Повторное использование данных участников"}</small></span><ArrowRight size={18}/></Link>
    </section>}
    {!activeCategory && <nav className="dbt-category-grid" aria-label={language === "uz" ? "Hujjat toifalari" : "Категории документов"}>{categories.map((category) => {
      const count = documents.filter((document) => document.categorySlug === category.slug).length;
      return <Link href={`/document-builder/${category.slug}`} key={category.slug}><span>{category.code}</span><div><h2>{localize(category.title, language)}</h2><p>{localize(category.description, language)}</p><small>{count} {language === "uz" ? "shablon" : "шаблонов"}</small></div><ArrowRight size={20}/></Link>;
    })}</nav>}
    {activeCategory && <div className="dbt-library-breadcrumb"><Link href="/document-builder">{language === "uz" ? "Barcha toifalar" : "Все категории"}</Link><span>/</span><b>{localize(activeCategory.title, language)}</b></div>}
    <div className="dbt-library-tools"><label><Search size={18}/><input value={search} onChange={(event) => { setSearch(event.target.value); setLimit(48); }} placeholder={language === "uz" ? "Nomi yoki kodi bo‘yicha qidirish" : "Поиск по названию или коду"}/></label><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setLimit(48); }} aria-label={language === "uz" ? "Holat" : "Статус"}><option value="all">{language === "uz" ? "Barcha holatlar" : "Все статусы"}</option><option value="verified">{language === "uz" ? "Tekshirilgan" : "Проверены"}</option><option value="beta">{language === "uz" ? "Beta · tekshiruvda" : "Бета · на проверке"}</option></select></div>
    {activeCategory && publishedCount > 0 && <section className="dbt-popular-section"><h2>{language === "uz" ? "Mashhur hujjatlar" : "Популярные документы"}</h2><div className="dbt-template-grid">{filtered.filter((document) => document.popular).map((document) => <TemplateCard document={document} language={language} key={`popular-${document.code}`}/>)}</div></section>}
    <section className="dbt-all-templates"><div className="dbt-section-heading"><h2>{activeCategory ? (language === "uz" ? "Barcha hujjatlar" : "Все документы") : (language === "uz" ? "Reyestr" : "Реестр")}</h2><span>{filtered.length}</span></div><div className="dbt-template-grid">{visible.map((document) => <TemplateCard document={document} language={language} key={document.code}/>)}</div>{visible.length < filtered.length && <button type="button" className="dbt-load-more" onClick={() => setLimit((current) => current + 48)}>{language === "uz" ? "Yana ko‘rsatish" : "Показать ещё"}</button>}{filtered.length === 0 && <div className="dbt-library-empty">{language === "uz" ? "So‘rov bo‘yicha hujjatlar topilmadi." : "По вашему запросу документы не найдены."}</div>}</section>
  </main>;
}
