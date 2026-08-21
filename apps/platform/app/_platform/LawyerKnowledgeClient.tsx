"use client";

import {
  Archive,
  BookOpen,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type KnowledgeItem = {
  id: string;
  caseId: string | null;
  caseTitle: string | null;
  clientName: string | null;
  kind:
    | "ai_answer"
    | "legal_position"
    | "source"
    | "template"
    | "clause"
    | "monitoring"
    | "note"
    | "document";
  title: string;
  content: string;
  sourceUrl: string | null;
  folder: string;
  tags: string[];
  favorite: number;
  updatedAt: string;
};

type Matter = { id: string; title: string; clientName: string | null };

async function json<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { code?: string };
  if (!response.ok) throw new Error(value.code || `HTTP_${response.status}`);
  return value;
}

const kinds = [
  "note",
  "legal_position",
  "clause",
  "template",
  "source",
  "document",
  "monitoring",
  "ai_answer",
] as const;

export function LawyerKnowledgeClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState(ru ? "Рабочие заметки" : "Ish qaydlari");
  const [tags, setTags] = useState("");
  const [kind, setKind] = useState<KnowledgeItem["kind"]>("note");
  const [caseId, setCaseId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/platform/lawyer-knowledge", { cache: "no-store" }).then(
        (response) => json<{ items: KnowledgeItem[] }>(response),
      ),
      fetch("/api/platform/lawyer-workspace", { cache: "no-store" }).then(
        (response) => json<{ matters: Matter[] }>(response),
      ),
    ])
      .then(([knowledge, workspace]) => {
        setItems(knowledge.items);
        setMatters(workspace.matters);
      })
      .catch((value) =>
        setError(value instanceof Error ? value.message : String(value)),
      );
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      const value = await json<{ items: KnowledgeItem[] }>(
        await fetch("/api/platform/lawyer-knowledge", {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({
            kind,
            title: title.trim(),
            content: content.trim(),
            folder: folder.trim(),
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            favorite,
            ...(caseId ? { caseId } : {}),
            ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          }),
        }),
      );
      setItems(value.items);
      setTitle("");
      setContent("");
      setTags("");
      setSourceUrl("");
      setFavorite(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy("");
    }
  }

  async function update(item: KnowledgeItem, action: "favorite" | "archive") {
    setBusy(item.id);
    setError("");
    try {
      const value = await json<{ items: KnowledgeItem[] }>(
        await fetch("/api/platform/lawyer-knowledge", {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify(
            action === "archive"
              ? { action, itemId: item.id }
              : { action, itemId: item.id, favorite: !item.favorite },
          ),
        }),
      );
      setItems(value.items);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy("");
    }
  }

  const folders = useMemo(
    () => [...new Set(items.map((item) => item.folder))].sort(),
    [items],
  );
  const visible = useMemo(() => {
    const needle = query.normalize("NFKC").toLocaleLowerCase(locale);
    return items.filter((item) => {
      if (folderFilter !== "all" && item.folder !== folderFilter) return false;
      if (favoritesOnly && !item.favorite) return false;
      if (!needle) return true;
      return [
        item.title,
        item.content,
        item.folder,
        item.caseTitle || "",
        ...item.tags,
      ].some((value) =>
        value.normalize("NFKC").toLocaleLowerCase(locale).includes(needle),
      );
    });
  }, [favoritesOnly, folderFilter, items, locale, query]);

  return (
    <main className="lawyer-workspace lawyer-knowledge">
      <header className="lawyer-records-header">
        <BookOpen />
        <div>
          <small>JURO LAWYER</small>
          <h1>{ru ? "База знаний" : "Bilimlar bazasi"}</h1>
          <p>
            {ru
              ? "Личные рабочие позиции, оговорки, шаблоны и официальные источники Lex.uz. Привязка к делу доступна только при действующем доступе клиента."
              : "Shaxsiy ish pozitsiyalari, bandlar, shablonlar va rasmiy Lex.uz manbalari. Ishga bog‘lash faqat mijozning amaldagi ruxsati bilan mumkin."}
          </p>
        </div>
      </header>

      {error && (
        <p role="alert" className="lawyer-workspace-error">
          {error}
        </p>
      )}

      <section className="lawyer-knowledge-create">
        <header>
          <Plus />
          <div>
            <h2>{ru ? "Новая запись" : "Yangi yozuv"}</h2>
            <p>
              {ru
                ? "Не сохраняйте персональные данные без необходимости."
                : "Zaruratsiz shaxsiy ma’lumotlarni saqlamang."}
            </p>
          </div>
        </header>
        <form onSubmit={(event) => void create(event)}>
          <label>
            {ru ? "Тип" : "Turi"}
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as KnowledgeItem["kind"])
              }
            >
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ru ? "Папка" : "Jild"}
            <input
              required
              maxLength={120}
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
            />
          </label>
          <label className="wide">
            {ru ? "Заголовок" : "Sarlavha"}
            <input
              required
              minLength={2}
              maxLength={240}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="wide">
            {ru ? "Содержание" : "Mazmuni"}
            <textarea
              required
              maxLength={20_000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <label>
            {ru ? "Дело (необязательно)" : "Ish (ixtiyoriy)"}
            <select
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
            >
              <option value="">—</option>
              {matters.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.clientName ? `${matter.clientName} · ` : ""}
                  {matter.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ru ? "Теги через запятую" : "Teglar vergul bilan"}
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <label className="wide">
            {ru
              ? "Официальный источник Lex.uz (необязательно)"
              : "Rasmiy Lex.uz manbasi (ixtiyoriy)"}
            <input
              type="url"
              placeholder="https://lex.uz/..."
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
          </label>
          <label className="lawyer-check">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(event) => setFavorite(event.target.checked)}
            />
            {ru ? "В избранное" : "Tanlanganlarga"}
          </label>
          <button disabled={busy === "create"}>
            {busy === "create" ? <LoaderCircle className="spin" /> : <Plus />}
            {ru ? "Сохранить" : "Saqlash"}
          </button>
        </form>
      </section>

      <section className="lawyer-knowledge-library">
        <header>
          <div>
            <FolderOpen />
            <h2>{ru ? "Рабочая библиотека" : "Ish kutubxonasi"}</h2>
          </div>
          <div className="lawyer-knowledge-filters">
            <label>
              <Search />
              <input
                aria-label={ru ? "Поиск" : "Qidiruv"}
                placeholder={
                  ru ? "Поиск по содержанию" : "Mazmun bo‘yicha qidiruv"
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label={ru ? "Папка" : "Jild"}
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.target.value)}
            >
              <option value="all">{ru ? "Все папки" : "Barcha jildlar"}</option>
              {folders.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              <Star fill={favoritesOnly ? "currentColor" : "none"} />
              {ru ? "Избранное" : "Tanlangan"}
            </button>
          </div>
        </header>
        {visible.length ? (
          <div className="lawyer-knowledge-grid">
            {visible.map((item) => (
              <article key={item.id}>
                <header>
                  <span>{item.kind}</span>
                  <div>
                    <button
                      type="button"
                      aria-label={ru ? "Избранное" : "Tanlangan"}
                      disabled={busy === item.id}
                      onClick={() => void update(item, "favorite")}
                    >
                      <Star fill={item.favorite ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      aria-label={ru ? "Архивировать" : "Arxivlash"}
                      disabled={busy === item.id}
                      onClick={() => void update(item, "archive")}
                    >
                      <Archive />
                    </button>
                  </div>
                </header>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
                <footer>
                  <span>
                    {item.folder}
                    {item.clientName ? ` · ${item.clientName}` : ""}
                    {item.caseTitle ? ` · ${item.caseTitle}` : ""}
                  </span>
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      Lex.uz <ExternalLink />
                    </a>
                  )}
                  {item.tags.map((tag) => (
                    <small key={tag}>#{tag}</small>
                  ))}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="lawyer-record-empty">
            <BookOpen />
            <p>
              {ru
                ? "Записей по выбранному фильтру нет."
                : "Tanlangan filtr bo‘yicha yozuvlar yo‘q."}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
