"use client";

import { Archive, BookOpenCheck, Check, FilePlus2, Plus, RefreshCw, Save, ShieldCheck, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Locale = "ru" | "uz";
type Status = "draft" | "published" | "archived";
type Section = { heading: string; paragraphs: string[] };
type Content = {
  slug: string; category: string; titleRu: string; titleUz: string; summaryRu: string; summaryUz: string;
  bodyRu: Section[]; bodyUz: Section[]; relatedSlugs: string[];
};
type Summary = {
  articleId: string; slug: string; category: string; status: Status; titleRu: string; titleUz: string;
  latestVersionNumber: number; draftVersionId: string | null; publishedVersionId: string | null;
  helpfulCount: number; notHelpfulCount: number; updatedAt: string;
};
type Version = Omit<Content, "slug" | "category"> & {
  versionId: string; versionNumber: number; contentSha256: string; createdAt: string; updatedAt: string; publishedAt: string | null;
};
type Article = { articleId: string; slug: string; category: string; status: Status; updatedAt: string; versions: Version[] };
type PendingAction = "publish" | "archive" | "restore" | null;

const blank = (): Content => ({
  slug: "", category: "", titleRu: "", titleUz: "", summaryRu: "", summaryUz: "",
  bodyRu: [{ heading: "", paragraphs: [""] }], bodyUz: [{ heading: "", paragraphs: [""] }], relatedSlugs: [],
});
const copy = {
  ru: { title: "База знаний", description: "Версионная публикация справочных материалов на русском и узбекском языках.", secure: "LEGAL OPERATIONS", fresh: "Свежая 2FA", refresh: "Обновить", create: "Новая статья", list: "Статьи", empty: "Статей нет", edit: "Открыть", draft: "Черновик", published: "Опубликовано", archived: "Архив", version: "Версия", useful: "Полезно", notUseful: "Не помогло", slug: "Slug", category: "Категория", ru: "Русский", uz: "O‘zbekcha", titleField: "Заголовок", summary: "Краткое описание", sections: "Разделы статьи", heading: "Заголовок раздела", paragraphs: "Абзацы — разделяйте пустой строкой", addSection: "Добавить раздел", removeSection: "Удалить раздел", related: "Связанные slug через запятую", save: "Сохранить черновик", publish: "Опубликовать", archive: "Архивировать", restore: "Восстановить", cancel: "Отмена", confirmPublish: "После публикации эта версия станет неизменяемой и сразу появится у пользователей.", confirmArchive: "Статья исчезнет из публичной базы, но версии и оценки сохранятся.", confirmRestore: "Статья снова станет доступной, если у неё есть опубликованная версия.", confirm: "Подтвердить", saved: "Черновик сохранён", publishedDone: "Статья опубликована", statusDone: "Статус статьи изменён", invalid: "Заполните обе языковые версии и минимум один раздел.", loading: "Загрузка…" },
  uz: { title: "Bilimlar bazasi", description: "Rus va o‘zbek tillaridagi yordam materiallarini versiyali nashr qilish.", secure: "LEGAL OPERATIONS", fresh: "Yaqindagi 2FA", refresh: "Yangilash", create: "Yangi maqola", list: "Maqolalar", empty: "Maqolalar yo‘q", edit: "Ochish", draft: "Qoralama", published: "Nashr etilgan", archived: "Arxiv", version: "Versiya", useful: "Foydali", notUseful: "Yordam bermadi", slug: "Slug", category: "Toifa", ru: "Русский", uz: "O‘zbekcha", titleField: "Sarlavha", summary: "Qisqa tavsif", sections: "Maqola bo‘limlari", heading: "Bo‘lim sarlavhasi", paragraphs: "Abzatslarni bo‘sh satr bilan ajrating", addSection: "Bo‘lim qo‘shish", removeSection: "Bo‘limni o‘chirish", related: "Bog‘liq sluglar, vergul bilan", save: "Qoralamani saqlash", publish: "Nashr qilish", archive: "Arxivlash", restore: "Tiklash", cancel: "Bekor qilish", confirmPublish: "Nashrdan keyin bu versiya o‘zgarmaydi va darhol foydalanuvchilarga ko‘rinadi.", confirmArchive: "Maqola ommaviy bazadan yashiriladi, versiyalar va baholar saqlanadi.", confirmRestore: "Nashr qilingan versiya bo‘lsa, maqola yana ochiladi.", confirm: "Tasdiqlash", saved: "Qoralama saqlandi", publishedDone: "Maqola nashr qilindi", statusDone: "Maqola holati o‘zgardi", invalid: "Ikkala tilni va kamida bitta bo‘limni to‘ldiring.", loading: "Yuklanmoqda…" },
} as const;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new Error(body.error || body.code || `HTTP ${response.status}`);
  return body;
}

export function KnowledgeBaseAdmin({ locale, staffName }: { locale: Locale; staffName: string }) {
  const t = copy[locale];
  const [articles, setArticles] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [versionId, setVersionId] = useState<string | undefined>();
  const [content, setContent] = useState<Content>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await readJson<{ articles: Summary[] }>(await fetch("/api/platform/admin/knowledge-base", { cache: "no-store" }));
      setArticles(data.articles); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ERROR"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const currentSummary = useMemo(() => articles.find((item) => item.articleId === selected?.articleId) ?? null, [articles, selected]);

  async function open(articleId: string) {
    setBusy(true); setPendingAction(null);
    try {
      const data = await readJson<{ article: Article }>(await fetch(`/api/platform/admin/knowledge-base?articleId=${encodeURIComponent(articleId)}`, { cache: "no-store" }));
      const draft = data.article.versions.find((version) => !version.publishedAt);
      const source = draft ?? data.article.versions[0];
      setSelected(data.article); setVersionId(draft?.versionId);
      setContent(source ? { slug: data.article.slug, category: data.article.category, titleRu: source.titleRu, titleUz: source.titleUz, summaryRu: source.summaryRu, summaryUz: source.summaryUz, bodyRu: source.bodyRu, bodyUz: source.bodyUz, relatedSlugs: source.relatedSlugs } : blank());
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ERROR"); }
    finally { setBusy(false); }
  }

  function startNew() { setSelected(null); setVersionId(undefined); setContent(blank()); setPendingAction(null); setAnnouncement(""); setError(""); }

  function setField<K extends keyof Content>(key: K, value: Content[K]) { setContent((current) => ({ ...current, [key]: value })); }
  function setSection(language: "bodyRu" | "bodyUz", index: number, patch: Partial<Section>) {
    setContent((current) => ({ ...current, [language]: current[language].map((section, position) => position === index ? { ...section, ...patch } : section) }));
  }
  function addSection() {
    setContent((current) => ({ ...current, bodyRu: [...current.bodyRu, { heading: "", paragraphs: [""] }], bodyUz: [...current.bodyUz, { heading: "", paragraphs: [""] }] }));
  }
  function removeSection(index: number) {
    if (content.bodyRu.length <= 1) return;
    setContent((current) => ({ ...current, bodyRu: current.bodyRu.filter((_, position) => position !== index), bodyUz: current.bodyUz.filter((_, position) => position !== index) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setAnnouncement("");
    try {
      const result = await readJson<{ articleId: string }>(await fetch("/api/platform/admin/knowledge-base", {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ action: "save_draft", articleId: selected?.articleId, versionId, content }),
      }));
      await load(); await open(result.articleId); setAnnouncement(t.saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.invalid); }
    finally { setBusy(false); }
  }

  async function confirmAction() {
    if (!pendingAction || !selected) return;
    setBusy(true); setAnnouncement("");
    try {
      const payload = pendingAction === "publish"
        ? { action: "publish", articleId: selected.articleId, versionId }
        : { action: "set_status", articleId: selected.articleId, status: pendingAction === "archive" ? "archived" : "restored" };
      await readJson(await fetch("/api/platform/admin/knowledge-base", { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify(payload) }));
      setPendingAction(null); await load(); await open(selected.articleId); setAnnouncement(pendingAction === "publish" ? t.publishedDone : t.statusDone);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ERROR"); }
    finally { setBusy(false); }
  }

  const actionMessage = pendingAction === "publish" ? t.confirmPublish : pendingAction === "archive" ? t.confirmArchive : t.confirmRestore;
  return <div className="staff-console" aria-busy={busy}>
    <a className="staff-skip" href="#knowledge-editor">{t.title}</a>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div><div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div><a href={`/${locale === "ru" ? "uz" : "ru"}/admin/knowledge-base`} hrefLang={locale === "ru" ? "uz" : "ru"}>{locale === "ru" ? "UZ" : "RU"}</a></header>
    <main id="knowledge-editor" className="staff-main kb-admin-main">
      <section className="staff-heading"><div><span>JURO · KNOWLEDGE OPERATIONS</span><h1>{t.title}</h1><p>{t.description}</p></div><div className="kb-heading-actions"><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button><button type="button" onClick={startNew} disabled={busy}><FilePlus2 aria-hidden="true"/>{t.create}</button></div></section>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      {error && <p className="staff-error" role="alert">{error}<button type="button" onClick={() => setError("")}>{t.cancel}</button></p>}
      <div className="kb-admin-layout">
        <section className="kb-article-list" aria-label={t.list}><header><h2>{t.list}</h2><small>{articles.length}</small></header>{busy && !articles.length ? <p>{t.loading}</p> : articles.length ? articles.map((article) => <button type="button" key={article.articleId} onClick={() => void open(article.articleId)} aria-current={selected?.articleId === article.articleId ? "true" : undefined}><span><b>{locale === "ru" ? article.titleRu : article.titleUz}</b><small>{article.slug} · {t.version} {article.latestVersionNumber}</small></span><span className={`staff-status status-${article.status}`}>{t[article.status]}</span><span><small>{t.useful}: {article.helpfulCount}</small><small>{t.notUseful}: {article.notHelpfulCount}</small></span></button>) : <p className="staff-empty">{t.empty}</p>}</section>
        <form className="kb-editor" onSubmit={(event) => void submit(event)}>
          <header><div><BookOpenCheck aria-hidden="true"/><span><b>{selected ? (locale === "ru" ? currentSummary?.titleRu : currentSummary?.titleUz) : t.create}</b><small>{selected ? `${selected.slug} · ${t.version} ${currentSummary?.latestVersionNumber ?? 0}` : t.draft}</small></span></div>{selected && <span className={`staff-status status-${selected.status}`}>{t[selected.status]}</span>}</header>
          <fieldset className="kb-identity"><legend className="sr-only">Identity</legend><label>{t.slug}<input required minLength={3} maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={content.slug} disabled={Boolean(currentSummary?.publishedVersionId)} onChange={(event) => setField("slug", event.target.value)}/></label><label>{t.category}<input required minLength={2} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={content.category} disabled={Boolean(currentSummary?.publishedVersionId)} onChange={(event) => setField("category", event.target.value)}/></label></fieldset>
          <div className="kb-language-grid"><LanguageFields language="ru" label={t.ru} titleLabel={t.titleField} summaryLabel={t.summary} content={content} setField={setField}/><LanguageFields language="uz" label={t.uz} titleLabel={t.titleField} summaryLabel={t.summary} content={content} setField={setField}/></div>
          <section className="kb-sections"><header><h2>{t.sections}</h2><button type="button" onClick={addSection}><Plus aria-hidden="true"/>{t.addSection}</button></header>{content.bodyRu.map((ruSection, index) => <fieldset key={index}><legend>{index + 1}</legend><div className="kb-language-grid"><SectionFields label={t.ru} headingLabel={t.heading} paragraphsLabel={t.paragraphs} section={ruSection} onChange={(patch) => setSection("bodyRu", index, patch)}/><SectionFields label={t.uz} headingLabel={t.heading} paragraphsLabel={t.paragraphs} section={content.bodyUz[index] ?? { heading: "", paragraphs: [""] }} onChange={(patch) => setSection("bodyUz", index, patch)}/></div><button type="button" onClick={() => removeSection(index)} disabled={content.bodyRu.length <= 1}><X aria-hidden="true"/>{t.removeSection}</button></fieldset>)}</section>
          <label className="kb-related">{t.related}<input value={content.relatedSlugs.join(", ")} onChange={(event) => setField("relatedSlugs", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))}/></label>
          {pendingAction && <section className="kb-confirm" role="alertdialog" aria-modal="false" aria-labelledby="kb-confirm-title"><h2 id="kb-confirm-title">{pendingAction === "publish" ? t.publish : pendingAction === "archive" ? t.archive : t.restore}</h2><p>{actionMessage}</p><div><button type="button" onClick={() => setPendingAction(null)} disabled={busy}><X aria-hidden="true"/>{t.cancel}</button><button type="button" className={pendingAction === "archive" ? "staff-reject" : "staff-approve"} onClick={() => void confirmAction()} disabled={busy || (pendingAction === "publish" && !versionId)}><Check aria-hidden="true"/>{t.confirm}</button></div></section>}
          <footer><button type="submit" className="staff-approve" disabled={busy || selected?.status === "archived"}><Save aria-hidden="true"/>{t.save}</button>{selected && selected.status !== "archived" && <button type="button" disabled={busy || !versionId} onClick={() => setPendingAction("publish")}><BookOpenCheck aria-hidden="true"/>{t.publish}</button>}{selected && <button type="button" className={selected.status === "archived" ? "" : "staff-reject"} disabled={busy} onClick={() => setPendingAction(selected.status === "archived" ? "restore" : "archive")}>{selected.status === "archived" ? <Undo2 aria-hidden="true"/> : <Archive aria-hidden="true"/>}{selected.status === "archived" ? t.restore : t.archive}</button>}</footer>
        </form>
      </div>
    </main>
  </div>;
}

function LanguageFields({ language, label, titleLabel, summaryLabel, content, setField }: { language: "ru" | "uz"; label: string; titleLabel: string; summaryLabel: string; content: Content; setField: <K extends keyof Content>(key: K, value: Content[K]) => void }) {
  const titleKey = language === "ru" ? "titleRu" : "titleUz";
  const summaryKey = language === "ru" ? "summaryRu" : "summaryUz";
  return <fieldset><legend>{label}</legend><label>{titleLabel}<input required minLength={3} maxLength={180} value={content[titleKey]} onChange={(event) => setField(titleKey, event.target.value)}/></label><label>{summaryLabel}<textarea required minLength={10} maxLength={500} rows={3} value={content[summaryKey]} onChange={(event) => setField(summaryKey, event.target.value)}/></label></fieldset>;
}

function SectionFields({ label, headingLabel, paragraphsLabel, section, onChange }: { label: string; headingLabel: string; paragraphsLabel: string; section: Section; onChange: (patch: Partial<Section>) => void }) {
  return <div className="kb-section-language"><b>{label}</b><label>{headingLabel}<input required minLength={1} maxLength={180} value={section.heading} onChange={(event) => onChange({ heading: event.target.value })}/></label><label>{paragraphsLabel}<textarea required rows={5} value={section.paragraphs.join("\n\n")} onChange={(event) => onChange({ paragraphs: event.target.value.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean) })}/></label></div>;
}
