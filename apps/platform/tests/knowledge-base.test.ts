import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  KnowledgeBaseError,
  getKnowledgeBaseArticle,
  knowledgeBaseFeedbackSchema,
  knowledgeBaseQuerySchema,
  listKnowledgeBaseArticles,
  recordKnowledgeBaseFeedback,
} from "../lib/platform/knowledge-base";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const NOW = "2026-08-04T16:00:00.000Z";

test("knowledge base validates bounded public queries and tenant-free feedback input", () => {
  assert.equal(knowledgeBaseQuerySchema.safeParse({ locale: "ru", q: "источники", category: "ai" }).success, true);
  assert.equal(knowledgeBaseQuerySchema.safeParse({ locale: "en", q: "", category: "" }).success, false);
  assert.equal(knowledgeBaseQuerySchema.safeParse({ locale: "uz", q: "x".repeat(121), category: "" }).success, false);
  assert.equal(knowledgeBaseFeedbackSchema.safeParse({ versionId: "kbv-ai-sources-1", helpful: true }).success, true);
  assert.equal(knowledgeBaseFeedbackSchema.safeParse({ versionId: "kbv-ai-sources-1", helpful: true, workspaceId: "foreign" }).success, false);
});

test("published RU/UZ articles support search, related content and immutable versions", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const allRu = await listKnowledgeBaseArticles({ db: d1, locale: "ru" });
    const allUz = await listKnowledgeBaseArticles({ db: d1, locale: "uz" });
    assert.equal(allRu.length, 4);
    assert.equal(allUz.length, 4);
    assert.equal(allRu.find((article) => article.slug === "account-security")?.title, "Как защитить аккаунт JURO");
    assert.equal(allUz.find((article) => article.slug === "account-security")?.title, "JURO hisobini qanday himoya qilish kerak");

    const sourceSearch = await listKnowledgeBaseArticles({ db: d1, locale: "ru", q: "источник" });
    assert.equal(sourceSearch.length, 1);
    assert.equal(sourceSearch[0]?.slug, "ai-lawyer-sources");
    const uzSearch = await listKnowledgeBaseArticles({ db: d1, locale: "uz", q: "xavfsiz" });
    assert.ok(uzSearch.some((article) => article.slug === "document-analysis-files"));

    const article = await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: "ai-lawyer-sources" });
    assert.ok(article);
    assert.equal(article.sections.length, 3);
    assert.deepEqual(article.related.map((item) => item.slug), ["account-security", "cases-and-deadlines"]);
    assert.equal(await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: "../private" }), null);

    const versionRows = sqlite.prepare("SELECT body_ru_json AS ru,body_uz_json AS uz,related_slugs_json AS related,content_sha256 AS hash FROM knowledge_base_article_versions WHERE published_at IS NOT NULL").all() as Array<{ ru: string; uz: string; related: string; hash: string }>;
    for (const version of versionRows) {
      const canonical = JSON.stringify({ ru: JSON.parse(version.ru), uz: JSON.parse(version.uz), related: JSON.parse(version.related) });
      assert.equal(version.hash, createHash("sha256").update(canonical).digest("hex"));
    }

    sqlite.prepare("INSERT INTO knowledge_base_articles(id,slug,category,status,created_at,updated_at) VALUES ('draft','draft-help','ai','draft',?,?)").run(NOW, NOW);
    sqlite.prepare(`INSERT INTO knowledge_base_article_versions
      (id,article_id,version_number,title_ru,title_uz,summary_ru,summary_uz,body_ru_json,body_uz_json,related_slugs_json,content_sha256,created_at)
      VALUES ('draft-v1','draft',1,'Черновик','Qoralama','Не опубликовано','Nashr etilmagan','[]','[]','[]',?,?)`).run("e".repeat(64), NOW);
    assert.equal((await listKnowledgeBaseArticles({ db: d1, locale: "ru", q: "Черновик" })).length, 0);
    assert.throws(
      () => sqlite.prepare("UPDATE knowledge_base_article_versions SET title_ru='Изменено' WHERE id='kbv-ai-sources-1'").run(),
      /knowledge_base_published_version_immutable/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("helpfulness is authenticated-scope ready, idempotent, revisioned and audited", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedTenant(sqlite, "user-a", "workspace-a");
    seedTenant(sqlite, "user-b", "workspace-b");
    const created = await recordKnowledgeBaseFeedback({
      db: d1, workspaceId: "workspace-a", userId: "user-a", articleSlug: "ai-lawyer-sources",
      versionId: "kbv-ai-sources-1", helpful: true, idempotencyKey: "knowledge-feedback-create-001",
    });
    assert.equal(created.revision, 1);
    assert.equal(created.changed, true);
    const replay = await recordKnowledgeBaseFeedback({
      db: d1, workspaceId: "workspace-a", userId: "user-a", articleSlug: "ai-lawyer-sources",
      versionId: "kbv-ai-sources-1", helpful: true, idempotencyKey: "knowledge-feedback-create-001",
    });
    assert.equal(replay.replay, true);
    assert.equal(tableCount(sqlite, "knowledge_base_feedback"), 1);
    assert.equal(tableCount(sqlite, "knowledge_base_feedback_events"), 1);

    const changed = await recordKnowledgeBaseFeedback({
      db: d1, workspaceId: "workspace-a", userId: "user-a", articleSlug: "ai-lawyer-sources",
      versionId: "kbv-ai-sources-1", helpful: false, idempotencyKey: "knowledge-feedback-update-002",
    });
    assert.equal(changed.revision, 2);
    assert.equal(changed.helpful, false);
    assert.equal(tableCount(sqlite, "knowledge_base_feedback_events"), 2);
    assert.equal(tableCount(sqlite, "workspace_audit_events"), 2);

    await assert.rejects(
      recordKnowledgeBaseFeedback({ db: d1, workspaceId: "workspace-a", userId: "user-a", articleSlug: "account-security", versionId: "kbv-account-security-1", helpful: true, idempotencyKey: "knowledge-feedback-update-002" }),
      (error: unknown) => error instanceof KnowledgeBaseError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      recordKnowledgeBaseFeedback({ db: d1, workspaceId: "workspace-b", userId: "user-b", articleSlug: "ai-lawyer-sources", versionId: "foreign-version", helpful: true, idempotencyKey: "knowledge-feedback-foreign-003" }),
      (error: unknown) => error instanceof KnowledgeBaseError && error.code === "ARTICLE_UNAVAILABLE",
    );
    assert.throws(
      () => sqlite.prepare("UPDATE knowledge_base_feedback_events SET helpful=1 WHERE id=(SELECT id FROM knowledge_base_feedback_events LIMIT 1)").run(),
      /knowledge_base_feedback_event_immutable/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("knowledge base routes keep public reads separate from authenticated feedback", async () => {
  const [publicList, publicItem, feedbackRoute, helpClient, articleView, feedbackClient, css] = await Promise.all([
    readFile(new URL("../app/api/help/articles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/help/articles/[articleSlug]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/help/articles/[articleSlug]/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/HelpClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/KnowledgeBaseArticleView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/KnowledgeBaseFeedback.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/help.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(publicList, /requireApiUser/);
  assert.doesNotMatch(publicItem, /requireApiUser/);
  assert.match(feedbackRoute, /requireApiUser\(\)/);
  assert.match(feedbackRoute, /workspaceForUser\(user\)/);
  assert.match(feedbackRoute, /assertSafeWrite\(request\)/);
  assert.match(feedbackRoute, /idempotency-key/);
  assert.doesNotMatch(feedbackRoute, /workspaceId:\s*parsed\.data|userId:\s*parsed\.data/);
  assert.match(helpClient, /База знаний/);
  assert.match(helpClient, /Bilimlar bazasi/);
  assert.match(helpClient, /role="search"/);
  assert.match(articleView, /Связанные статьи/);
  assert.match(articleView, /Bog‘liq maqolalar/);
  assert.match(feedbackClient, /aria-pressed/);
  assert.match(feedbackClient, /aria-live="polite"/);
  assert.doesNotMatch(`${helpClient}${articleView}`, /dangerouslySetInnerHTML/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /max-width:72ch/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

function seedTenant(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], userId: string, workspaceId: string) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)").run(userId, `${userId}@example.test`, NOW, NOW);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?, 'individual', ?, ?, ?)").run(workspaceId, workspaceId, NOW, NOW);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES (?,?,?,'owner','active',?,?,?)").run(`${workspaceId}-member`, workspaceId, userId, NOW, NOW, NOW);
}

function tableCount(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], table: string): number {
  return (sqlite.prepare(`SELECT count(*) AS value FROM ${table}`).get() as { value: number }).value;
}
