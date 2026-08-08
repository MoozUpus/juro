import { notFound } from "next/navigation";

import { KnowledgeBaseArticleView } from "../../../../_platform/KnowledgeBaseArticleView";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { getKnowledgeBaseArticle } from "../../../../../lib/platform/knowledge-base";
import { isAccountType, isLocale, platformBasePath } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function AccountHelpArticlePage({ params }: { params: Promise<{ locale: string; accountType: string; articleSlug: string }> }) {
  const { locale, accountType, articleSlug } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();
  const base = platformBasePath(locale, accountType);
  await requireChatGPTUser(`${base}/help/${articleSlug}`);
  const article = await getKnowledgeBaseArticle({ db: requireD1(), locale, slug: articleSlug });
  if (!article) notFound();
  return <KnowledgeBaseArticleView article={article} locale={locale} backHref={`${base}/help`} articleBaseHref={`${base}/help`} feedbackEnabled />;
}
