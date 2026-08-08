import { notFound } from "next/navigation";

import { PublicKnowledgeBaseIndex } from "../../_platform/PublicKnowledgeBaseIndex";
import { requireD1 } from "../../../lib/document-builder/storage/runtime";
import { listKnowledgeBaseArticles } from "../../../lib/platform/knowledge-base";
import { isLocale } from "../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function PublicHelpPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const queryValue = (await searchParams).q;
  const query = typeof queryValue === "string" ? queryValue.slice(0, 120) : "";
  const articles = await listKnowledgeBaseArticles({ db: requireD1(), locale, q: query });
  return <PublicKnowledgeBaseIndex locale={locale} articles={articles} query={query} />;
}
