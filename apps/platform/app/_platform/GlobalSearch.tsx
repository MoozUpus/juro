"use client";

/* eslint-disable react-hooks/set-state-in-effect -- search state is synchronized with a debounced authenticated request */

import {
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CheckSquare,
  Clock3,
  FileDiff,
  FilePenLine,
  Files,
  FileSearch,
  LoaderCircle,
  Search,
  Sparkles,
  X,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { globalSearchGroupScore, globalSearchQueryMode } from "../../lib/platform/global-search-policy";
import { usePlatformBasePath } from "./PlatformRouteContext";

type SearchResult = {
  id: string;
  type: "case" | "document" | "document-content" | "conversation" | "comparison" | "task" | "analysis" | "template" | "lawyer" | "source";
  title: string;
  subtitle: string | null;
  updatedAt: string;
  caseId?: string;
  analysisId?: string;
  officialUrl?: string;
  searchScore?: number;
};

const icons = {
  case: BriefcaseBusiness,
  document: Files,
  "document-content": FileSearch,
  conversation: Bot,
  comparison: FileDiff,
  task: CheckSquare,
  analysis: FileSearch,
  template: FilePenLine,
  lawyer: UserRound,
  source: BookOpenCheck,
} as const;

const groupOrder: Array<{ key: string; types: SearchResult["type"][] }> = [
  { key: "conversations", types: ["conversation"] },
  { key: "cases", types: ["case", "task"] },
  { key: "documents", types: ["document", "document-content", "comparison", "analysis", "template"] },
  { key: "people", types: ["lawyer"] },
  { key: "sources", types: ["source"] },
];

export function GlobalSearch({ locale }: { locale: PlatformLocale; accountType: AccountType }) {
  const ru = locale === "ru";
  const router = useRouter();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  const base = usePlatformBasePath();
  const queryMode = globalSearchQueryMode(query);
  const expectedResultsQuery = queryMode === "recent" ? "" : queryMode === "search" ? query.trim() : null;
  const visibleResults = useMemo(
    () => resultsQuery === expectedResultsQuery ? results : [],
    [expectedResultsQuery, results, resultsQuery],
  );

  useEffect(() => {
    setShortcutLabel(/Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘K" : "Ctrl K");
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector<HTMLElement>(".platform-shell");
    const previousOverflow = document.body.style.overflow;
    const previousAriaHidden = shell?.getAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
    inputRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        "input,a[href],button:not(:disabled),[tabindex]:not([tabindex='-1'])",
      ) ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      shell?.removeAttribute("inert");
      if (previousAriaHidden === null || previousAriaHidden === undefined) shell?.removeAttribute("aria-hidden");
      else shell?.setAttribute("aria-hidden", previousAriaHidden);
    };
  }, [open]);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      setQuery("");
      setResults([]);
      setResultsQuery(null);
      setLoading(false);
      setError("");
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const normalizedQuery = query.trim();
    const mode = globalSearchQueryMode(normalizedQuery);
    setResults([]);
    setResultsQuery(null);
    setError("");
    if (mode === "incomplete") {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ locale });
        if (mode === "search") params.set("q", normalizedQuery);
        const response = await fetch(`/api/platform/search?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error || (ru ? "Поиск недоступен." : "Qidiruv mavjud emas."));
        setResults(body.results ?? []);
        setResultsQuery(mode === "recent" ? "" : normalizedQuery);
      } catch (value) {
        if (value instanceof DOMException && value.name === "AbortError") return;
        setError(value instanceof Error ? value.message : String(value));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, mode === "search" ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locale, open, query, ru]);

  const groupedLinks = useMemo(() => {
    const links = visibleResults.map((result) => ({
      result,
      href: resultHref(result, base, query),
    }));
    const groups = groupOrder.map((group) => ({
      ...group,
      items: links.filter(({ result }) => group.types.includes(result.type)),
    })).filter((group) => group.items.length > 0);
    if (queryMode === "search") {
      for (const group of groups) {
        group.items.sort((left, right) => (right.result.searchScore ?? 0) - (left.result.searchScore ?? 0));
      }
      groups.sort((left, right) => globalSearchGroupScore(right.items.map(({ result }) => result))
        - globalSearchGroupScore(left.items.map(({ result }) => result)));
    }
    return groups;
  }, [base, query, queryMode, visibleResults]);

  const resultLinks = useMemo(() => groupedLinks.flatMap((group) => group.items), [groupedLinks]);

  function openResult(item: (typeof resultLinks)[number] | undefined) {
    if (!item) return;
    if (item.result.type === "source") {
      if (safeOfficialUrl(item.href)) {
        window.open(item.href, "_blank", "noopener,noreferrer");
        setOpen(false);
      }
    } else {
      router.push(item.href);
      setOpen(false);
    }
  }

  function focusRelativeItem(direction: -1 | 1) {
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("[data-global-search-item]") ?? []);
    if (!items.length) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = currentIndex < 0
      ? (direction === 1 ? 0 : items.length - 1)
      : Math.min(items.length - 1, Math.max(0, currentIndex + direction));
    items[nextIndex]?.focus();
    items[nextIndex]?.scrollIntoView({ block: "nearest" });
  }

  const palette = open ? createPortal(
    <div className="global-search-layer">
      <button className="global-search-backdrop" type="button" onClick={() => setOpen(false)} aria-label={ru ? "Закрыть поиск" : "Qidiruvni yopish"} />
      <section
        id="global-search-workspace"
        ref={dialogRef}
        className="global-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            focusRelativeItem(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && event.target === inputRef.current) {
            event.preventDefault();
            if (!loading && queryMode === "search") openResult(resultLinks[0]);
          }
        }}
      >
        <header>
          <Search aria-hidden="true" />
          <h2 id="global-search-title" className="sr-only">{ru ? "Поиск по JURO" : "JURO bo‘yicha qidiruv"}</h2>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            aria-label={ru ? "Поиск по рабочему пространству JURO" : "JURO ish maydoni bo‘yicha qidiruv"}
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            placeholder={ru ? "Чаты, документы, дела, юристы и источники" : "Chatlar, hujjatlar, ishlar, yuristlar va manbalar"}
            aria-controls="global-search-results"
          />
          <span className="global-search-header-actions">
            {loading ? <LoaderCircle className="spin" aria-label={ru ? "Поиск" : "Qidiruv"} /> : null}
            {query ? <button type="button" onClick={() => setQuery("")} aria-label={ru ? "Очистить запрос" : "So‘rovni tozalash"}><X /></button> : null}
            <button type="button" onClick={() => setOpen(false)} aria-label={ru ? "Закрыть" : "Yopish"}><X /></button>
          </span>
        </header>
        <div id="global-search-results" className="global-search-results" aria-live="polite" aria-busy={loading}>
          {queryMode === "recent" && <nav className="global-search-destinations" aria-label={ru ? "Быстрые действия" : "Tezkor amallar"}>
            <Link data-global-search-item href={`${base}/ai-chat`} onClick={() => setOpen(false)}><Sparkles /><span><strong>{ru ? "Спросить AI" : "AI’dan so‘rash"}</strong><small>{ru ? "Новый юридический вопрос" : "Yangi huquqiy savol"}</small></span></Link>
            <Link data-global-search-item href={`${base}/cases`} onClick={() => setOpen(false)}><BriefcaseBusiness /><span><strong>{ru ? "Мои дела" : "Mening ishlarim"}</strong><small>{ru ? "Открыть дела и задачи" : "Ishlar va vazifalarni ochish"}</small></span></Link>
            <Link data-global-search-item href={`${base}/documents`} onClick={() => setOpen(false)}><Files /><span><strong>{ru ? "Документы" : "Hujjatlar"}</strong><small>{ru ? "Создать или открыть документ" : "Hujjat yaratish yoki ochish"}</small></span></Link>
          </nav>}
          {error ? <p className="global-search-message error" role="alert">{error}</p> : queryMode === "incomplete" ? (
            <p className="global-search-message">{ru ? "Введите минимум два буквенно-цифровых символа." : "Kamida ikkita harf yoki raqam kiriting."}</p>
          ) : !loading && !resultLinks.length ? (
            <p className="global-search-message">{queryMode === "search" ? (ru ? "Ничего не найдено в доступном вам пространстве." : "Sizga ochiq makonda hech narsa topilmadi.") : (ru ? "Недавние элементы появятся здесь." : "So‘nggi elementlar shu yerda paydo bo‘ladi.")}</p>
          ) : groupedLinks.map((group) => <section className="global-search-group" key={group.key} aria-labelledby={`global-search-group-${group.key}`}>
            <h3 id={`global-search-group-${group.key}`}>{queryMode === "search" ? <Search aria-hidden="true" /> : <Clock3 aria-hidden="true" />}{groupLabel(group.key, ru, queryMode === "search")}</h3>
            <div>{group.items.map(({ result, href }) => {
              const Icon = icons[result.type] ?? Search;
              const external = result.type === "source";
              return <Link
                data-global-search-item
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                key={`${result.type}-${result.id}`}
                onClick={() => setOpen(false)}
              >
                <span><Icon /></span>
                <div><strong>{result.title}</strong><small>{typeLabel(result.type, ru)}{result.subtitle ? ` · ${result.subtitle}` : ""}</small></div>
              </Link>;
            })}</div>
          </section>)}
        </div>
        <footer><span>↑↓ {ru ? "выбор" : "tanlash"}</span><span>Enter {ru ? "открыть" : "ochish"}</span><span>Esc {ru ? "закрыть" : "yopish"}</span></footer>
      </section>
    </div>,
    document.body,
  ) : null;

  return <>
    <button ref={triggerRef} className="global-search-trigger" type="button" onClick={() => setOpen(true)} aria-label={ru ? "Глобальный поиск" : "Global qidiruv"} aria-expanded={open} aria-controls="global-search-workspace">
      <Search /><span>{ru ? "Поиск" : "Qidiruv"}</span><kbd>{shortcutLabel}</kbd>
    </button>
    {palette}
  </>;
}

function resultHref(result: SearchResult, base: string, query: string) {
  if (result.type === "case") return `${base}/cases/${encodeURIComponent(result.id)}`;
  if (result.type === "document") return `${base}/documents/${encodeURIComponent(result.id)}`;
  if (result.type === "document-content") return result.analysisId ? `${base}/document-review?analysisId=${encodeURIComponent(result.analysisId)}` : `${base}/documents`;
  if (result.type === "conversation") return `${base}/ai-chat?conversationId=${encodeURIComponent(result.id)}`;
  if (result.type === "comparison") return `${base}/documents/comparisons/${encodeURIComponent(result.id)}`;
  if (result.type === "task") return result.caseId ? `${base}/cases/${encodeURIComponent(result.caseId)}` : `${base}/cases`;
  if (result.type === "analysis") return `${base}/document-review?analysisId=${encodeURIComponent(result.id)}`;
  if (result.type === "template") return `${base}/document-builder?q=${encodeURIComponent(query)}`;
  if (result.type === "lawyer") return `${base}/lawyers/${encodeURIComponent(result.id)}`;
  return safeOfficialUrl(result.officialUrl || "") ? result.officialUrl! : `${base}/monitoring`;
}

function safeOfficialUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function groupLabel(key: string, ru: boolean, searching: boolean) {
  const labels: Record<string, [string, string]> = {
    conversations: ["Диалоги", "Suhbatlar"],
    cases: ["Дела и задачи", "Ishlar va vazifalar"],
    documents: ["Документы", "Hujjatlar"],
    people: ["Юристы", "Yuristlar"],
    sources: ["Официальные источники", "Rasmiy manbalar"],
  };
  const label = labels[key] ?? ["Результаты", "Natijalar"];
  return `${searching ? "" : (ru ? "Недавние · " : "So‘nggi · ")}${label[ru ? 0 : 1]}`;
}

function typeLabel(type: SearchResult["type"], ru: boolean) {
  const labels = {
    case: ["Дело", "Ish"], document: ["Документ", "Hujjat"], "document-content": ["В документе", "Hujjat ichida"],
    conversation: ["Диалог", "Suhbat"], comparison: ["Сравнение", "Taqqoslash"], task: ["Задача", "Vazifa"],
    analysis: ["Анализ", "Tahlil"], template: ["Шаблон", "Shablon"], lawyer: ["Юрист", "Yurist"], source: ["Официальный источник", "Rasmiy manba"],
  } as const;
  return labels[type][ru ? 0 : 1];
}
