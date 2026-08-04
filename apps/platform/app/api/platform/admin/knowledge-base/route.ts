import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  KnowledgeBaseAdminError,
  getKnowledgeBaseAdminArticle,
  knowledgeBaseAdminMutationSchema,
  knowledgeBaseAdminQuerySchema,
  listKnowledgeBaseAdminArticles,
  publishKnowledgeBaseDraft,
  saveKnowledgeBaseDraft,
  setKnowledgeBaseArticleStatus,
} from "../../../../../lib/platform/knowledge-base-admin";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

export async function GET(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "knowledge.base.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const url = new URL(request.url);
  const parsed = knowledgeBaseAdminQuerySchema.safeParse({
    articleId: url.searchParams.get("articleId") || undefined,
    status: url.searchParams.get("status") || undefined,
  });
  if (!parsed.success) return json({ code: "INVALID_QUERY" }, 400);
  const db = requireD1();
  if (parsed.data.articleId) {
    const article = await getKnowledgeBaseAdminArticle({ db, articleId: parsed.data.articleId });
    return article ? json({ article }) : json({ code: "ARTICLE_UNAVAILABLE" }, 404);
  }
  return json({ articles: await listKnowledgeBaseAdminArticles({ db, status: parsed.data.status }) });
}

export async function POST(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "knowledge.base.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, knowledgeBaseAdminMutationSchema, 128 * 1024);
  if (!parsed.ok) return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1();
  try {
    if (parsed.data.action === "save_draft") {
      return json(await saveKnowledgeBaseDraft({ db, actorUserId: staff.userId, articleId: parsed.data.articleId, versionId: parsed.data.versionId, content: parsed.data.content }), 201);
    }
    if (parsed.data.action === "publish") {
      return json(await publishKnowledgeBaseDraft({ db, actorUserId: staff.userId, articleId: parsed.data.articleId, versionId: parsed.data.versionId }));
    }
    return json(await setKnowledgeBaseArticleStatus({ db, actorUserId: staff.userId, articleId: parsed.data.articleId, status: parsed.data.status }));
  } catch (error) {
    if (error instanceof KnowledgeBaseAdminError) return json({ code: error.code, error: error.message }, error.status);
    throw error;
  }
}
