import Link from "next/link";
import { notFound } from "next/navigation";
import type { AppLegalSlug } from "../../../content/app-legal";
import {
  policySlugs,
  verifiedPolicyDocument,
} from "../../../lib/legal/policies";

export const metadata = { robots: { index: false, follow: false } };

export default async function AppLegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  if (!policySlugs.includes(slug as AppLegalSlug)) notFound();
  const locale = query.lang === "uz" ? "uz" : "ru";
  const policy = await verifiedPolicyDocument(
    locale,
    slug as AppLegalSlug,
  );
  const document = policy.content;
  return (
    <main className="app-legal" lang={locale}>
      <header>
        <Link href={`/?lang=${locale}`}>JURO</Link>
        <nav>
          <Link href={`/legal/terms?lang=${locale}`}>
            {locale === "ru" ? "Условия" : "Shartlar"}
          </Link>
          <Link href={`/legal/privacy?lang=${locale}`}>
            {locale === "ru" ? "Приватность" : "Maxfiylik"}
          </Link>
          <Link href={`/legal/ai-rules?lang=${locale}`}>AI</Link>
          <Link href={`/legal/${slug}?lang=${locale === "ru" ? "uz" : "ru"}`}>
            {locale === "ru" ? "UZ" : "RU"}
          </Link>
        </nav>
      </header>
      <article>
        <small>
          {locale === "ru"
            ? "Закрытый кабинет app.juro.uz"
            : "app.juro.uz yopiq kabineti"}
        </small>
        <h1>{document.title}</h1>
        <p className="app-legal-description">{document.description}</p>
        <div className="app-legal-version">
          <strong>
            {locale === "ru"
              ? "Проект для юридического утверждения"
              : "Yuridik tasdiqlash uchun loyiha"}
          </strong>
          <span>
            {locale === "ru" ? "Версия" : "Versiya"}:{" "}
            {policy.documentVersion}
          </span>
          <span>SHA-256: <code>{policy.contentSha256}</code></span>
          <time>
            {locale === "ru" ? "Обновлено: " : "Yangilangan: "}
            {document.updated}
          </time>
        </div>
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
      <footer>
        <p>
          {locale === "ru"
            ? "Эта версия технически зафиксирована, но содержит реквизиты-заглушки и не считается юридически утверждённой. Документы публичного сайта размещены отдельно на juro.uz."
            : "Ushbu versiya texnik jihatdan qayd etilgan, ammo rekvizit o‘rinbosarlarini o‘z ichiga oladi va yuridik tasdiqlangan hisoblanmaydi. Ommaviy sayt hujjatlari juro.uz saytida alohida joylashtirilgan."}
        </p>
      </footer>
    </main>
  );
}
