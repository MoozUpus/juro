import { ArrowLeft, ArrowRight, BookOpenCheck } from "lucide-react";
import Link from "next/link";

import type { KnowledgeBaseArticle } from "../../lib/platform/knowledge-base";
import type { PlatformLocale } from "../../lib/platform/routing";
import { KnowledgeBaseFeedback } from "./KnowledgeBaseFeedback";

export function KnowledgeBaseArticleView({ article, locale, backHref, articleBaseHref, feedbackEnabled }: {
  article: KnowledgeBaseArticle;
  locale: PlatformLocale;
  backHref: string;
  articleBaseHref: string;
  feedbackEnabled: boolean;
}) {
  const ru = locale === "ru";
  return <main className="knowledge-article" id="main-content">
    <nav aria-label={ru ? "Навигация по базе знаний" : "Bilimlar bazasi navigatsiyasi"}>
      <Link href={backHref}><ArrowLeft aria-hidden="true" />{ru ? "Все статьи" : "Barcha maqolalar"}</Link>
    </nav>
    <article>
      <header>
        <BookOpenCheck aria-hidden="true" />
        <div>
          <h1>{article.title}</h1>
          <p>{article.summary}</p>
          <dl>
            <div><dt>{ru ? "Версия" : "Versiya"}</dt><dd>{article.versionNumber}</dd></div>
            <div><dt>{ru ? "Обновлено" : "Yangilangan"}</dt><dd>{formatDate(article.updatedAt, locale)}</dd></div>
          </dl>
        </div>
      </header>
      <div className="knowledge-article-body">
        {article.sections.map((section) => <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>)}
      </div>
      {feedbackEnabled && <KnowledgeBaseFeedback articleSlug={article.slug} versionId={article.versionId} locale={locale} />}
    </article>
    {article.related.length > 0 && <aside className="knowledge-related" aria-labelledby="related-title">
      <h2 id="related-title">{ru ? "Связанные статьи" : "Bog‘liq maqolalar"}</h2>
      <ul>{article.related.map((related) => <li key={related.slug}><Link href={`${articleBaseHref}/${related.slug}`}><span><strong>{related.title}</strong><small>{related.summary}</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul>
    </aside>}
  </main>;
}

function formatDate(value: string, locale: PlatformLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}
