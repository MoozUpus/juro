import { notFound } from "next/navigation";

import { KnowledgeBaseArticleView } from "../../../_platform/KnowledgeBaseArticleView";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { getKnowledgeBaseArticle } from "../../../../lib/platform/knowledge-base";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function PublicHelpArticlePage({ params }: { params: Promise<{ locale: string; articleSlug: string }> }) {
  const { locale, articleSlug } = await params;
  if (!isLocale(locale)) notFound();
  const article = await getKnowledgeBaseArticle({ db: requireD1(), locale, slug: articleSlug });
  if (!article) notFound();
  return <KnowledgeBaseArticleView article={article} locale={locale} backHref={`/${locale}/help`} articleBaseHref={`/${locale}/help`} feedbackEnabled={false} />;
}
