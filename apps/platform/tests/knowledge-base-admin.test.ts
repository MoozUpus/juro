import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  KnowledgeBaseAdminError,
  getKnowledgeBaseAdminArticle,
  knowledgeBaseAdminMutationSchema,
  listKnowledgeBaseAdminArticles,
  publishKnowledgeBaseDraft,
  saveKnowledgeBaseDraft,
  setKnowledgeBaseArticleStatus,
  type KnowledgeBaseDraftContent,
} from "../lib/platform/knowledge-base-admin";
import { getKnowledgeBaseArticle, listKnowledgeBaseArticles } from "../lib/platform/knowledge-base";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const NOW = new Date("2026-08-04T17:00:00.000Z");
const LATER = new Date("2026-08-04T17:01:00.000Z");
const content = (suffix = ""): KnowledgeBaseDraftContent => ({
  slug: "safe-upload-guide",
  category: "documents",
  titleRu: `Безопасная загрузка документов${suffix}`,
  titleUz: `Hujjatlarni xavfsiz yuklash${suffix}`,
  titleEn: null,
  summaryRu: "Как подготовить и безопасно загрузить материалы для анализа.",
  summaryUz: "Tahlil uchun materiallarni tayyorlash va xavfsiz yuklash tartibi.",
  summaryEn: null,
  bodyRu: [{ heading: "До загрузки", paragraphs: ["Проверьте формат, размер и читаемость документа."] }],
  bodyUz: [{ heading: "Yuklashdan oldin", paragraphs: ["Hujjat formati, hajmi va o‘qilishini tekshiring."] }],
  bodyEn: null,
  relatedSlugs: ["account-security"],
});

const translatedContent = (suffix = ""): KnowledgeBaseDraftContent => ({
  ...content(suffix),
  titleEn: `Uploading documents securely${suffix}`,
  summaryEn: "How to prepare and securely upload material for document analysis.",
  bodyEn: [{ heading: "Before uploading", paragraphs: ["Check the document format, size and legibility."] }],
});

test("admin knowledge mutation schema is strict, preserves legacy bilingual drafts and requires complete English", () => {
  assert.equal(knowledgeBaseAdminMutationSchema.safeParse({ action: "save_draft", content: content() }).success, true);
  assert.equal(knowledgeBaseAdminMutationSchema.safeParse({ action: "save_draft", content: translatedContent() }).success, true);
  assert.equal(knowledgeBaseAdminMutationSchema.safeParse({ action: "save_draft", content: { ...content(), titleEn: "English title" } }).success, false);
  assert.equal(knowledgeBaseAdminMutationSchema.safeParse({ action: "save_draft", content: { ...content(), actorUserId: "attacker" } }).success, false);
  assert.equal(knowledgeBaseAdminMutationSchema.safeParse({ action: "save_draft", content: { ...content(), bodyUz: [] } }).success, false);
  assert.equal(knowledgeBaseAdminMutationSchema.safeParse({ action: "save_draft", content: { ...content(), relatedSlugs: ["safe-upload-guide"] } }).success, false);
});

test("staff authoring creates, edits, publishes, versions, archives and restores with immutable evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedUser(sqlite, "staff-author");
    const created = await saveKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", content: content(), now: NOW });
    assert.equal(created.versionNumber, 1);
    assert.equal((await listKnowledgeBaseArticles({ db: d1, locale: "ru", q: "Безопасная загрузка" })).length, 0);
    assert.deepEqual(actions(sqlite, created.articleId), ["article_created", "draft_created"]);

    const updatedContent = content(" — JURO");
    const updated = await saveKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, versionId: created.versionId, content: updatedContent, now: LATER });
    assert.equal(updated.created, false);
    assert.equal(sqlite.prepare("SELECT content_hash_version AS value FROM knowledge_base_article_versions WHERE id=?").get(created.versionId)?.value, "full-v2");
    assert.deepEqual(actions(sqlite, created.articleId), ["article_created", "draft_created", "draft_updated"]);

    await publishKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, versionId: created.versionId, now: new Date("2026-08-04T17:02:00.000Z") });
    const publicRu = await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: updatedContent.slug });
    const publicUz = await getKnowledgeBaseArticle({ db: d1, locale: "uz", slug: updatedContent.slug });
    assert.equal(publicRu?.title, updatedContent.titleRu);
    assert.equal(publicUz?.title, updatedContent.titleUz);
    assert.equal(await getKnowledgeBaseArticle({ db: d1, locale: "en", slug: updatedContent.slug }), null);
    assert.deepEqual(actions(sqlite, created.articleId), ["article_created", "draft_created", "draft_updated", "published", "status_changed"]);
    assert.throws(() => sqlite.prepare("UPDATE knowledge_base_article_versions SET title_ru='tampered' WHERE id=?").run(created.versionId), /knowledge_base_published_version_immutable/);

    const englishVersion = translatedContent(" — v2");
    const second = await saveKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, content: englishVersion, now: new Date("2026-08-04T17:03:00.000Z") });
    assert.equal(second.versionNumber, 2);
    assert.equal((await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: updatedContent.slug }))?.title, updatedContent.titleRu);
    await publishKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, versionId: second.versionId, now: new Date("2026-08-04T17:04:00.000Z") });
    assert.match((await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: updatedContent.slug }))?.title ?? "", /v2/);
    assert.equal((await getKnowledgeBaseArticle({ db: d1, locale: "en", slug: updatedContent.slug }))?.title, englishVersion.titleEn);

    await setKnowledgeBaseArticleStatus({ db: d1, actorUserId: "staff-author", articleId: created.articleId, status: "archived", now: new Date("2026-08-04T17:05:00.000Z") });
    assert.equal(await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: updatedContent.slug }), null);
    await setKnowledgeBaseArticleStatus({ db: d1, actorUserId: "staff-author", articleId: created.articleId, status: "restored", now: new Date("2026-08-04T17:06:00.000Z") });
    assert.ok(await getKnowledgeBaseArticle({ db: d1, locale: "ru", slug: updatedContent.slug }));

    const detail = await getKnowledgeBaseAdminArticle({ db: d1, articleId: created.articleId });
    assert.equal(detail?.versions.length, 2);
    const list = await listKnowledgeBaseAdminArticles({ db: d1 });
    assert.equal(list.find((article) => article.articleId === created.articleId)?.latestVersionNumber, 2);
    assert.throws(() => sqlite.prepare("UPDATE knowledge_base_authoring_events SET action='draft_updated' WHERE article_id=?").run(created.articleId), /knowledge_base_authoring_event_immutable/);
    assert.throws(() => sqlite.prepare("DELETE FROM knowledge_base_articles WHERE id=?").run(created.articleId), /knowledge_base_article_delete_forbidden/);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("authoring rejects duplicate drafts, unstable identity and unpublished related articles", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedUser(sqlite, "staff-author");
    const created = await saveKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", content: content(), now: NOW });
    await assert.rejects(
      saveKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, content: content(" duplicate"), now: LATER }),
      (error: unknown) => error instanceof KnowledgeBaseAdminError && error.code === "DRAFT_CONFLICT",
    );
    const broken = { ...content(), relatedSlugs: ["missing-article"] };
    await saveKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, versionId: created.versionId, content: broken, now: LATER });
    await assert.rejects(
      publishKnowledgeBaseDraft({ db: d1, actorUserId: "staff-author", articleId: created.articleId, versionId: created.versionId, now: new Date("2026-08-04T17:02:00.000Z") }),
      (error: unknown) => error instanceof KnowledgeBaseAdminError && error.code === "RELATED_ARTICLE_UNAVAILABLE",
    );
  } finally { sqlite.close(); }
});

test("admin route and UI require fresh MFA capability and expose explicit confirmation without unsafe rendering", async () => {
  const [route, page, ui, css, staffAccess] = await Promise.all([
    readFile(new URL("../app/api/platform/admin/knowledge-base/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/admin/knowledge-base/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_staff/KnowledgeBaseAdmin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_staff/legal-source-reviews.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth/staff-access.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requirePlatformStaffRequest\(request, "knowledge\.base\.manage", \{ freshMfaWithinMs: 15 \* 60 \* 1000 \}\)/);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.doesNotMatch(route, /actorUserId:\s*parsed\.data/);
  assert.match(page, /requirePlatformStaffAccess\(runtime\.DB, session, "knowledge\.base\.manage"/);
  assert.match(staffAccess, /"knowledge\.base\.manage"/);
  assert.match(ui, /confirmPublish/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /Русский/);
  assert.match(ui, /O‘zbekcha/);
  assert.match(ui, /English \(optional\)/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|window\.confirm/);
  assert.match(css, /kb-admin-layout/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

function seedUser(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], userId: string): void {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)").run(userId, `${userId}@example.test`, NOW.toISOString(), NOW.toISOString());
}

function actions(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], articleId: string): string[] {
  return (sqlite.prepare("SELECT action FROM knowledge_base_authoring_events WHERE article_id=? ORDER BY rowid").all(articleId) as Array<{ action: string }>).map((row) => row.action);
}
