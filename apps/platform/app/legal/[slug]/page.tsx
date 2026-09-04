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
  const locale = query.lang === "uz" || query.lang === "en"
    ? query.lang
    : "ru";
  const copy = {
    ru: {
      terms: "Условия",
      privacy: "Приватность",
      cabinet: "Закрытый кабинет app.juro.uz",
      draft: "Проект для юридического утверждения",
      version: "Версия",
      updated: "Обновлено: ",
      footer: "Эта версия технически зафиксирована и отражает предварительный режим запуска JURO; юридическое утверждение до регистрации оператора не завершено. Документы публичного сайта размещены отдельно на juro.uz.",
    },
    uz: {
      terms: "Shartlar",
      privacy: "Maxfiylik",
      cabinet: "app.juro.uz yopiq kabineti",
      draft: "Yuridik tasdiqlash uchun loyiha",
      version: "Versiya",
      updated: "Yangilangan: ",
      footer: "Ushbu versiya texnik jihatdan qayd etilgan va JUROning dastlabki ishga tushirish rejimini aks ettiradi; operator ro‘yxatdan o‘tkazilguniga qadar yuridik tasdiqlash yakunlanmagan. Ommaviy sayt hujjatlari juro.uz saytida alohida joylashtirilgan.",
    },
    en: {
      terms: "Terms",
      privacy: "Privacy",
      cabinet: "Private account area at app.juro.uz",
      draft: "Draft pending legal approval",
      version: "Version",
      updated: "Updated: ",
      footer: "This version is technically fixed and reflects JURO’s pre-launch status; legal approval remains pending until the operator is incorporated. The public website documents are published separately at juro.uz.",
    },
  }[locale];
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
            {copy.terms}
          </Link>
          <Link href={`/legal/privacy?lang=${locale}`}>
            {copy.privacy}
          </Link>
          <Link href={`/legal/ai-rules?lang=${locale}`}>AI</Link>
          {(["ru", "uz", "en"] as const).filter((language) => language !== locale).map((language) => (
            <Link key={language} href={`/legal/${slug}?lang=${language}`}>
              {language.toUpperCase()}
            </Link>
          ))}
        </nav>
      </header>
      <article>
        <small>
          {copy.cabinet}
        </small>
        <h1>{document.title}</h1>
        <p className="app-legal-description">{document.description}</p>
        <div className="app-legal-version">
          <strong>
            {copy.draft}
          </strong>
          <span>
            {copy.version}: {" "}
            {policy.documentVersion}
          </span>
          <span>SHA-256: <code>{policy.contentSha256}</code></span>
          <time>
            {copy.updated}
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
          {copy.footer}
        </p>
      </footer>
    </main>
  );
}
