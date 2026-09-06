import { authLocaleFromRequest } from "../../../../lib/auth/request-locale";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { knowledgeBaseQuerySchema, listKnowledgeBaseArticles } from "../../../../lib/platform/knowledge-base";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = knowledgeBaseQuerySchema.safeParse({
    locale: url.searchParams.get("locale") ?? "uz",
    q: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category") ?? "",
  });
  if (!parsed.success) {
    const locale = authLocaleFromRequest(request);
    return Response.json({
      code: "INVALID_INPUT",
      error: {
        ru: "Проверьте параметры поиска.",
        uz: "Qidiruv parametrlarini tekshiring.",
        en: "Check the search parameters.",
      }[locale],
    }, { status: 400 });
  }
  const articles = await listKnowledgeBaseArticles({ db: requireD1(), ...parsed.data });
  return Response.json({ articles }, {
    headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
