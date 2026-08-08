import { z } from "zod";

import type { PlatformLocale } from "./routing";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const knowledgeBaseArticleSectionSchema = z.object({
  heading: z.string().min(1).max(180),
  paragraphs: z.array(z.string().min(1).max(2_000)).min(1).max(8),
}).strict();

export const knowledgeBaseArticleBodySchema = z.array(knowledgeBaseArticleSectionSchema).min(1).max(20);
export const knowledgeBaseRelatedSlugsSchema = z.array(z.string().regex(slugPattern)).max(12);

export const knowledgeBaseQuerySchema = z.object({
  locale: z.enum(["ru", "uz"]),
  q: z.string().trim().max(120).default(""),
  category: z.string().trim().max(60).regex(/^[a-z0-9-]*$/).default(""),
}).strict();

export const knowledgeBaseFeedbackSchema = z.object({
  versionId: z.string().min(3).max(160).regex(/^[A-Za-z0-9._:-]+$/),
  helpful: z.boolean(),
}).strict();

type ArticleRow = {
  articleId: string;
  slug: string;
  category: string;
  versionId: string;
  versionNumber: number;
  title: string;
  summary: string;
  bodyJson: string;
  relatedSlugsJson: string;
  contentSha256: string;
  publishedAt: string;
  updatedAt: string;
};

export type KnowledgeBaseArticleSummary = Omit<ArticleRow, "bodyJson" | "relatedSlugsJson">;

export type KnowledgeBaseArticle = KnowledgeBaseArticleSummary & {
  sections: z.infer<typeof knowledgeBaseArticleBodySchema>;
  related: KnowledgeBaseArticleSummary[];
};

export type KnowledgeBaseFeedbackResult = {
  feedbackId: string;
  articleId: string;
  versionId: string;
  helpful: boolean;
  revision: number;
  replay: boolean;
  changed: boolean;
};

export class KnowledgeBaseError extends Error {
  constructor(
    public readonly code: "ARTICLE_UNAVAILABLE" | "INVALID_IDEMPOTENCY_KEY" | "IDEMPOTENCY_CONFLICT" | "FEEDBACK_CONFLICT",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "KnowledgeBaseError";
  }
}

export async function listKnowledgeBaseArticles(input: {
  db: D1Database;
  locale: PlatformLocale;
  q?: string;
  category?: string;
}): Promise<KnowledgeBaseArticleSummary[]> {
  const parsed = knowledgeBaseQuerySchema.parse({
    locale: input.locale,
    q: input.q ?? "",
    category: input.category ?? "",
  });
  const language = parsed.locale === "ru" ? "ru" : "uz";
  const title = `version.title_${language}`;
  const summary = `version.summary_${language}`;
  const filters = ["article.status='published'", "version.published_at IS NOT NULL"];
  const bindings: unknown[] = [];
  if (parsed.category) {
    filters.push("article.category=?");
    bindings.push(parsed.category);
  }
  if (parsed.q) {
    filters.push(`(lower(${title}) LIKE ? ESCAPE '\\' OR lower(${summary}) LIKE ? ESCAPE '\\')`);
    const term = `%${escapeLike(parsed.q.toLocaleLowerCase(language === "ru" ? "ru" : "uz"))}%`;
    bindings.push(term, term);
  }
  const rows = await input.db.prepare(
    `SELECT article.id AS articleId,article.slug,article.category,
      version.id AS versionId,version.version_number AS versionNumber,
      ${title} AS title,${summary} AS summary,
      version.body_${language}_json AS bodyJson,
      version.related_slugs_json AS relatedSlugsJson,
      version.content_sha256 AS contentSha256,
      version.published_at AS publishedAt,article.updated_at AS updatedAt
     FROM knowledge_base_articles article
     INNER JOIN knowledge_base_article_versions version ON version.article_id=article.id
     WHERE ${filters.join(" AND ")}
       AND version.version_number=(
         SELECT max(candidate.version_number)
         FROM knowledge_base_article_versions candidate
         WHERE candidate.article_id=article.id AND candidate.published_at IS NOT NULL
       )
     ORDER BY article.updated_at DESC,article.slug ASC LIMIT 100`,
  ).bind(...bindings).all<ArticleRow>();
  return rows.results.map(summaryFromRow);
}

export async function getKnowledgeBaseArticle(input: {
  db: D1Database;
  locale: PlatformLocale;
  slug: string;
}): Promise<KnowledgeBaseArticle | null> {
  if (!slugPattern.test(input.slug)) return null;
  const language = input.locale === "ru" ? "ru" : "uz";
  const row = await input.db.prepare(
    `SELECT article.id AS articleId,article.slug,article.category,
      version.id AS versionId,version.version_number AS versionNumber,
      version.title_${language} AS title,version.summary_${language} AS summary,
      version.body_${language}_json AS bodyJson,
      version.related_slugs_json AS relatedSlugsJson,
      version.content_sha256 AS contentSha256,
      version.published_at AS publishedAt,article.updated_at AS updatedAt
     FROM knowledge_base_articles article
     INNER JOIN knowledge_base_article_versions version ON version.article_id=article.id
     WHERE article.slug=? AND article.status='published' AND version.published_at IS NOT NULL
       AND version.version_number=(
         SELECT max(candidate.version_number)
         FROM knowledge_base_article_versions candidate
         WHERE candidate.article_id=article.id AND candidate.published_at IS NOT NULL
       ) LIMIT 1`,
  ).bind(input.slug).first<ArticleRow>();
  if (!row) return null;
  const sections = knowledgeBaseArticleBodySchema.safeParse(JSON.parse(row.bodyJson));
  const relatedSlugs = knowledgeBaseRelatedSlugsSchema.safeParse(JSON.parse(row.relatedSlugsJson));
  if (!sections.success || !relatedSlugs.success) return null;
  const related = await relatedArticles(input.db, language, relatedSlugs.data);
  return { ...summaryFromRow(row), sections: sections.data, related };
}

export async function recordKnowledgeBaseFeedback(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  articleSlug: string;
  versionId: string;
  helpful: boolean;
  idempotencyKey: string;
}): Promise<KnowledgeBaseFeedbackResult> {
  const key = parseIdempotencyKey(input.idempotencyKey);
  const replay = await feedbackReplay(input.db, input.workspaceId, input.userId, key);
  if (replay) {
    if (replay.articleSlug !== input.articleSlug || replay.versionId !== input.versionId || replay.helpful !== input.helpful) {
      throw new KnowledgeBaseError("IDEMPOTENCY_CONFLICT", "Этот Idempotency-Key уже использован для другого ответа.", 409);
    }
    return { ...replay, replay: true, changed: true };
  }
  const article = await input.db.prepare(
    `SELECT article.id AS articleId
     FROM knowledge_base_articles article
     INNER JOIN knowledge_base_article_versions version ON version.article_id=article.id
     WHERE article.slug=? AND article.status='published' AND version.id=? AND version.published_at IS NOT NULL LIMIT 1`,
  ).bind(input.articleSlug, input.versionId).first<{ articleId: string }>();
  if (!article) throw new KnowledgeBaseError("ARTICLE_UNAVAILABLE", "Статья недоступна.", 404);
  const current = await input.db.prepare(
    `SELECT id AS feedbackId,helpful,revision FROM knowledge_base_feedback
     WHERE article_id=? AND version_id=? AND workspace_id=? AND user_id=? LIMIT 1`,
  ).bind(article.articleId, input.versionId, input.workspaceId, input.userId).first<{ feedbackId: string; helpful: number; revision: number }>();
  if (current && Boolean(current.helpful) === input.helpful) {
    return { feedbackId: current.feedbackId, articleId: article.articleId, versionId: input.versionId, helpful: input.helpful, revision: current.revision, replay: false, changed: false };
  }
  const feedbackId = current?.feedbackId ?? crypto.randomUUID();
  const revision = (current?.revision ?? 0) + 1;
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const projection = current
    ? input.db.prepare(
      `UPDATE knowledge_base_feedback SET helpful=?,revision=?,updated_at=?
       WHERE id=? AND workspace_id=? AND user_id=? AND revision=?`,
    ).bind(Number(input.helpful), revision, now, feedbackId, input.workspaceId, input.userId, current.revision)
    : input.db.prepare(
      `INSERT INTO knowledge_base_feedback
       (id,article_id,version_id,workspace_id,user_id,helpful,revision,created_at,updated_at)
       VALUES (?,?,?,?,?,?,1,?,?)`,
    ).bind(feedbackId, article.articleId, input.versionId, input.workspaceId, input.userId, Number(input.helpful), now, now);
  try {
    await input.db.batch([
      projection,
      input.db.prepare(
        `INSERT INTO knowledge_base_feedback_events
         (id,feedback_id,article_id,version_id,workspace_id,user_id,helpful,revision,idempotency_key,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(eventId, feedbackId, article.articleId, input.versionId, input.workspaceId, input.userId, Number(input.helpful), revision, key, now),
    ]);
  } catch {
    const concurrentReplay = await feedbackReplay(input.db, input.workspaceId, input.userId, key);
    if (concurrentReplay) return { ...concurrentReplay, replay: true, changed: true };
    throw new KnowledgeBaseError("FEEDBACK_CONFLICT", "Оценка уже изменилась. Обновите страницу и повторите действие.", 409);
  }
  return { feedbackId, articleId: article.articleId, versionId: input.versionId, helpful: input.helpful, revision, replay: false, changed: true };
}

function summaryFromRow(row: ArticleRow): KnowledgeBaseArticleSummary {
  return {
    articleId: row.articleId,
    slug: row.slug,
    category: row.category,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    title: row.title,
    summary: row.summary,
    contentSha256: row.contentSha256,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

async function relatedArticles(db: D1Database, language: "ru" | "uz", slugs: string[]): Promise<KnowledgeBaseArticleSummary[]> {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT article.id AS articleId,article.slug,article.category,
      version.id AS versionId,version.version_number AS versionNumber,
      version.title_${language} AS title,version.summary_${language} AS summary,
      version.body_${language}_json AS bodyJson,version.related_slugs_json AS relatedSlugsJson,
      version.content_sha256 AS contentSha256,version.published_at AS publishedAt,
      article.updated_at AS updatedAt
     FROM knowledge_base_articles article
     INNER JOIN knowledge_base_article_versions version ON version.article_id=article.id
     WHERE article.status='published' AND article.slug IN (${placeholders})
       AND version.published_at IS NOT NULL
       AND version.version_number=(SELECT max(candidate.version_number) FROM knowledge_base_article_versions candidate WHERE candidate.article_id=article.id AND candidate.published_at IS NOT NULL)
     ORDER BY article.slug ASC`,
  ).bind(...slugs).all<ArticleRow>();
  const bySlug = new Map(rows.results.map((row) => [row.slug, summaryFromRow(row)]));
  return slugs.flatMap((slug) => bySlug.get(slug) ? [bySlug.get(slug)!] : []);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function parseIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9._:-]{16,180}$/.test(key)) {
    throw new KnowledgeBaseError("INVALID_IDEMPOTENCY_KEY", "Для оценки требуется корректный Idempotency-Key.", 400);
  }
  return key;
}

async function feedbackReplay(db: D1Database, workspaceId: string, userId: string, key: string): Promise<{
  feedbackId: string;
  articleId: string;
  articleSlug: string;
  versionId: string;
  helpful: boolean;
  revision: number;
} | null> {
  const row = await db.prepare(
    `SELECT event.feedback_id AS feedbackId,event.article_id AS articleId,
      article.slug AS articleSlug,event.version_id AS versionId,event.helpful,event.revision
     FROM knowledge_base_feedback_events event
     INNER JOIN knowledge_base_articles article ON article.id=event.article_id
     WHERE event.workspace_id=? AND event.user_id=? AND event.idempotency_key=? LIMIT 1`,
  ).bind(workspaceId, userId, key).first<{ feedbackId: string; articleId: string; articleSlug: string; versionId: string; helpful: number; revision: number }>();
  return row ? { ...row, helpful: Boolean(row.helpful) } : null;
}
