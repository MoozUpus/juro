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
    return Response.json({ code: "INVALID_INPUT", error: "Проверьте параметры поиска / Qidiruv parametrlarini tekshiring." }, { status: 400 });
  }
  const articles = await listKnowledgeBaseArticles({ db: requireD1(), ...parsed.data });
  return Response.json({ articles }, {
    headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
