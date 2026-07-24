import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { legalDocuments, legalSlugs, type LegalLocale, type LegalSlug } from "../../legal-content";
import styles from "./legal.module.css";

type Props = { params: Promise<{ locale: string; legalSlug: string }> };

function parse(locale: string, legalSlug: string) {
  if ((locale !== "ru" && locale !== "uz") || !legalSlugs.includes(legalSlug as LegalSlug)) return null;
  return { locale: locale as LegalLocale, slug: legalSlug as LegalSlug };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const values = await params;
  const parsed = parse(values.locale, values.legalSlug);
  if (!parsed) return {};
  const document = legalDocuments[parsed.locale][parsed.slug];
  const canonical = `https://juro.uz/${parsed.locale}/${parsed.slug}`;
  return { title: document.title, description: document.description, alternates: { canonical, languages: { ru: `https://juro.uz/ru/${parsed.slug}`, uz: `https://juro.uz/uz/${parsed.slug}` } } };
}

export default async function LegalPage({ params }: Props) {
  const values = await params;
  const parsed = parse(values.locale, values.legalSlug);
  if (!parsed) notFound();
  const document = legalDocuments[parsed.locale][parsed.slug];
  const ru = parsed.locale === "ru";
  return <main className={styles.page} lang={parsed.locale}><header className={styles.header}><Link href="/"><img src="/juro-logo-primary.png" alt="JURO"/></Link><Link href={`/${ru ? "uz" : "ru"}/${parsed.slug}`}>{ru ? "O‘zbekcha" : "Русский"}</Link></header><article className={styles.content}><span className={styles.eyebrow}>{ru ? "ПРАВОВАЯ ИНФОРМАЦИЯ" : "HUQUQIY MA’LUMOT"}</span><h1>{document.title}</h1><p className={styles.lead}>{document.description}</p><div className={styles.meta}><span>{ru ? "Вступает в силу" : "Kuchga kiradi"}: 24.07.2026</span><span>{ru ? "Последнее обновление" : "Oxirgi yangilanish"}: 24.07.2026</span></div>{document.sections.map(section=><section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</section>)}<aside className={styles.links}><b>{ru ? "Связанные документы" : "Bog‘liq hujjatlar"}</b><div>{legalSlugs.filter(slug=>slug!==parsed.slug).map(slug=><Link href={`/${parsed.locale}/${slug}`} key={slug}>{legalDocuments[parsed.locale][slug].title}</Link>)}</div></aside></article><footer className={styles.footer}>© {new Date().getFullYear()} JURO</footer></main>;
}
