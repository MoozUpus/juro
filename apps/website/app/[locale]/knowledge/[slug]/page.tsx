import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "../../../components/public/SiteChrome";
import {
  knowledgeArticles,
  knowledgeSlugs,
  type KnowledgeSlug,
} from "../../../../content/knowledge";
import type { PublicLanguage } from "../../../../content/types";
import styles from "./article.module.css";

type Props = { params: Promise<{ locale: string; slug: string }> };

function parse(locale: string, slug: string): { locale: PublicLanguage; slug: KnowledgeSlug } | null {
  if ((locale !== "ru" && locale !== "uz" && locale !== "en") || !knowledgeSlugs.includes(slug as KnowledgeSlug)) return null;
  return { locale, slug: slug as KnowledgeSlug };
}

export function generateStaticParams() {
  return (["ru", "uz", "en"] as const).flatMap((locale) => knowledgeSlugs.map((slug) => ({ locale, slug })));
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
        en: `https://juro.uz/en/knowledge/${parsed.slug}`,
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
  const en = parsed.locale === "en";
  const labels = en ? { knowledge: "Knowledge base", author: "Author", reviewer: "Reviewer", updated: "Updated", current: "Current as of", language: "Language", languageName: "English", sources: "Applicable official sources", sourceNote: "The specific rules depend on the circumstances. Check the current version before relying on a result.", more: "Read more" } : ru ? { knowledge: "База знаний", author: "Автор", reviewer: "Проверяющий", updated: "Обновлено", current: "Актуально на", language: "Язык", languageName: "Русский", sources: "Применимые официальные источники", sourceNote: "Конкретные нормы зависят от обстоятельств. Перед применением результата проверьте актуальную редакцию.", more: "Читайте также" } : { knowledge: "Bilimlar bazasi", author: "Muallif", reviewer: "Tekshiruvchi", updated: "Yangilangan", current: "Amaldagi sana", language: "Til", languageName: "O‘zbekcha", sources: "Qo‘llaniladigan rasmiy manbalar", sourceNote: "Aniq normalar vaziyatga bog‘liq. Natijani qo‘llashdan oldin amaldagi tahrirni tekshiring.", more: "Shuningdek o‘qing" };
  const platformLocale = en ? "ru" : parsed.locale;
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
      <SiteHeader languageHref={`/ru/knowledge/${parsed.slug}`} locale={parsed.locale} />
      <main id="main-content">
        <article className={styles.article}>
          <div className={styles.breadcrumbs}>
            <Link href={`/${parsed.locale}`}>JURO</Link><span>/</span>
            <Link href={`/${parsed.locale}#resources`}>{labels.knowledge}</Link><span>/</span>
            <span>{article.category}</span>
          </div>
          <span className={styles.category}>{article.category}</span>
          <h1>{article.title}</h1>
          <p className={styles.lead}>{article.intro}</p>
          <div className={styles.meta}>
            <span>{labels.author}: {article.author}</span>
            <span>{labels.reviewer}: {article.reviewer}</span>
            <span>{labels.updated}: {article.updatedAt}</span>
            <span>{labels.current}: {article.currentAsOf}</span>
            <span>{labels.language}: {labels.languageName}</span>
          </div>
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
            </section>
          ))}
          <aside className={styles.sources}>
            <b>{labels.sources}</b>
            <p>{labels.sourceNote}</p>
            {article.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title}</a>)}
          </aside>
          <aside className={styles.disclaimer}>{article.disclaimer}</aside>
          <a className={styles.nextStep} href={`https://app.juro.uz/${platformLocale}/individual${article.relatedTool.path}`}>{article.relatedTool.label}</a>
          <aside className={styles.more}>
            <b>{labels.more}</b>
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
