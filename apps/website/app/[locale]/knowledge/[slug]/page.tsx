import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "../../../components/public/SiteChrome";
import {
  knowledgeArticles,
  knowledgeSlugs,
  type KnowledgeSlug,
} from "../../../../content/knowledge";
import type { Language } from "../../../../content/types";
import styles from "./article.module.css";

type Props = { params: Promise<{ locale: string; slug: string }> };

function parse(locale: string, slug: string): { locale: Language; slug: KnowledgeSlug } | null {
  if ((locale !== "ru" && locale !== "uz") || !knowledgeSlugs.includes(slug as KnowledgeSlug)) return null;
  return { locale, slug: slug as KnowledgeSlug };
}

export function generateStaticParams() {
  return (["ru", "uz"] as const).flatMap((locale) => knowledgeSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const values = await params;
  const parsed = parse(values.locale, values.slug);
  if (!parsed) return {};
  const article = knowledgeArticles[parsed.locale][parsed.slug];
  const canonical = `https://juro.uz/${parsed.locale}/knowledge/${parsed.slug}`;
  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical,
      languages: {
        ru: `https://juro.uz/ru/knowledge/${parsed.slug}`,
        uz: `https://juro.uz/uz/knowledge/${parsed.slug}`,
        "x-default": `https://juro.uz/ru/knowledge/${parsed.slug}`,
      },
    },
    openGraph: {
      title: article.title,
      description: article.description,
      url: canonical,
      type: "article",
      siteName: "JURO",
      modifiedTime: "2026-08-09T00:00:00+05:00",
      images: ["/juro-og.png"],
    },
  };
}

export default async function KnowledgeArticlePage({ params }: Props) {
  const values = await params;
  const parsed = parse(values.locale, values.slug);
  if (!parsed) notFound();
  const article = knowledgeArticles[parsed.locale][parsed.slug];
  const ru = parsed.locale === "ru";
  const others = knowledgeSlugs.filter((slug) => slug !== parsed.slug);
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    dateModified: "2026-08-09",
    inLanguage: parsed.locale,
    author: { "@type": "Organization", name: "JURO" },
    publisher: { "@type": "Organization", name: "JURO", url: "https://juro.uz" },
    mainEntityOfPage: `https://juro.uz/${parsed.locale}/knowledge/${parsed.slug}`,
  };

  return (
    <div className={styles.page} lang={parsed.locale}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <SiteHeader languageHref={`/${parsed.locale === "ru" ? "uz" : "ru"}/knowledge/${parsed.slug}`} locale={parsed.locale} />
      <main id="main-content">
        <article className={styles.article}>
          <div className={styles.breadcrumbs}>
            <Link href={`/${parsed.locale}`}>JURO</Link><span>/</span>
            <Link href={`/${parsed.locale}#resources`}>{ru ? "База знаний" : "Bilimlar bazasi"}</Link><span>/</span>
            <span>{article.category}</span>
          </div>
          <span className={styles.category}>{article.category}</span>
          <h1>{article.title}</h1>
          <p className={styles.lead}>{article.intro}</p>
          <div className={styles.meta}>
            <span>{ru ? "Автор" : "Muallif"}: {article.author}</span>
            <span>{ru ? "Проверяющий" : "Tekshiruvchi"}: {article.reviewer}</span>
            <span>{ru ? "Обновлено" : "Yangilangan"}: {article.updatedAt}</span>
            <span>{ru ? "Актуально на" : "Amaldagi sana"}: {article.currentAsOf}</span>
            <span>{ru ? "Язык" : "Til"}: {ru ? "Русский" : "O‘zbekcha"}</span>
          </div>
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
            </section>
          ))}
          <aside className={styles.sources}>
            <b>{ru ? "Применимые официальные источники" : "Qo‘llaniladigan rasmiy manbalar"}</b>
            <p>{ru ? "Конкретные нормы зависят от обстоятельств. Перед применением результата проверьте актуальную редакцию." : "Aniq normalar vaziyatga bog‘liq. Natijani qo‘llashdan oldin amaldagi tahrirni tekshiring."}</p>
            {article.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title}</a>)}
          </aside>
          <aside className={styles.disclaimer}>{article.disclaimer}</aside>
          <a className={styles.nextStep} href={`https://app.juro.uz/${parsed.locale}/individual${article.relatedTool.path}`}>{article.relatedTool.label}</a>
          <aside className={styles.more}>
            <b>{ru ? "Читайте также" : "Shuningdek o‘qing"}</b>
            {others.map((slug) => (
              <Link href={`/${parsed.locale}/knowledge/${slug}`} key={slug}>
                {knowledgeArticles[parsed.locale][slug].title}
              </Link>
            ))}
          </aside>
        </article>
      </main>
      <SiteFooter locale={parsed.locale} />
    </div>
  );
}
