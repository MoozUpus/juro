import { notFound } from "next/navigation";

import { KnowledgeBaseArticleView } from "../../../../../_platform/KnowledgeBaseArticleView";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { getKnowledgeBaseArticle } from "../../../../../../lib/platform/knowledge-base";
import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessHelpArticlePage({ params }: { params: Promise<{ locale: string; workspaceId: string; articleSlug: string }> }) {
  const { locale, workspaceId, articleSlug } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  const base = platformBasePath(locale, "business", workspaceId);
  await requireChatGPTUser(`${base}/help/${articleSlug}`);
  const article = await getKnowledgeBaseArticle({ db: requireD1(), locale, slug: articleSlug });
  if (!article) notFound();
  return <KnowledgeBaseArticleView article={article} locale={locale} backHref={`${base}/help`} articleBaseHref={`${base}/help`} feedbackEnabled />;
}
