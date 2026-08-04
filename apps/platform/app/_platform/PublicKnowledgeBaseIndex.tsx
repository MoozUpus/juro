import { ArrowRight, BookOpenCheck, Search } from "lucide-react";
import Link from "next/link";

import type { KnowledgeBaseArticleSummary } from "../../lib/platform/knowledge-base";
import type { PlatformLocale } from "../../lib/platform/routing";

export function PublicKnowledgeBaseIndex({ locale, articles, query }: { locale: PlatformLocale; articles: KnowledgeBaseArticleSummary[]; query: string }) {
  const ru = locale === "ru";
  return <main className="public-knowledge" id="main-content">
    <header><BookOpenCheck aria-hidden="true" /><div><h1>{ru ? "База знаний JURO" : "JURO bilimlar bazasi"}</h1><p>{ru ? "Инструкции по AI-юристу, документам, делам и безопасности на русском и узбекском языках." : "AI-yurist, hujjatlar, ishlar va xavfsizlik bo‘yicha rus va o‘zbek tillaridagi yo‘riqnomalar."}</p></div></header>
    <form role="search" method="get">
      <label className="sr-only" htmlFor="public-knowledge-search">{ru ? "Поиск по статьям" : "Maqolalardan qidirish"}</label>
      <Search aria-hidden="true" /><input id="public-knowledge-search" type="search" name="q" defaultValue={query} maxLength={120} placeholder={ru ? "Поиск по статьям" : "Maqolalardan qidirish"} /><button>{ru ? "Найти" : "Qidirish"}</button>
    </form>
    {articles.length === 0 ? <section className="public-knowledge-empty"><h2>{ru ? "Статьи не найдены" : "Maqolalar topilmadi"}</h2><p>{ru ? "Измените запрос или откройте полный список." : "So‘rovni o‘zgartiring yoki to‘liq ro‘yxatni oching."}</p>{query && <Link href={`/${locale}/help`}>{ru ? "Сбросить поиск" : "Qidiruvni tozalash"}</Link>}</section> : <ul>{articles.map((article) => <li key={article.slug}><Link href={`/${locale}/help/${article.slug}`}><span><strong>{article.title}</strong><small>{article.summary}</small></span><span>{ru ? `Версия ${article.versionNumber}` : `${article.versionNumber}-versiya`}<ArrowRight aria-hidden="true" /></span></Link></li>)}</ul>}
    <footer><Link href={`/${locale}/auth/login`}>{ru ? "Войти в JURO" : "JURO ga kirish"}</Link><Link href={`/${locale === "ru" ? "uz" : "ru"}/help`}>{locale === "ru" ? "O‘zbekcha" : "Русский"}</Link></footer>
  </main>;
}
