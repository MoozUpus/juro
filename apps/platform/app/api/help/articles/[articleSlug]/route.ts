import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { getKnowledgeBaseArticle } from "../../../../../lib/platform/knowledge-base";
import { isLocale } from "../../../../../lib/platform/routing";

export async function GET(request: Request, { params }: { params: Promise<{ articleSlug: string }> }) {
  const localeValue = new URL(request.url).searchParams.get("locale") ?? "uz";
  if (!isLocale(localeValue)) {
    return Response.json({ code: "INVALID_INPUT", error: "Неверный язык / Noto‘g‘ri til." }, { status: 400 });
  }
  const { articleSlug } = await params;
  const article = await getKnowledgeBaseArticle({ db: requireD1(), locale: localeValue, slug: articleSlug });
  if (!article) {
    return Response.json({ code: "ARTICLE_UNAVAILABLE", error: "Статья не найдена / Maqola topilmadi." }, { status: 404 });
  }
  return Response.json({ article }, {
    headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
