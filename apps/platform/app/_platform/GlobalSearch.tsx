"use client";

import { usePlatformBasePath } from "./PlatformRouteContext";

/* eslint-disable react-hooks/set-state-in-effect -- search state is synchronized with a debounced authenticated request */

import {
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CheckSquare,
  FileDiff,
  FilePenLine,
  Files,
  FileSearch,
  LoaderCircle,
  Search,
  X,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AccountType, PlatformLocale } from "../../lib/platform/routing";

type SearchResult = {
  id: string;
  type: "case" | "document" | "document-content" | "conversation" | "comparison" | "task" | "analysis" | "template" | "lawyer" | "source";
  title: string;
  subtitle: string | null;
  updatedAt: string;
  caseId?: string;
  analysisId?: string;
  officialUrl?: string;
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

export function GlobalSearch({
  locale,
}: {
  locale: PlatformLocale;
  accountType: AccountType;
}) {
  const ru = locale === "ru";
  const router = useRouter();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const base = usePlatformBasePath();

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
    return () => document.removeEventListener("keydown", trapFocus);
  }, [open]);

  useEffect(() => {
    if (!open && wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/platform/search?q=${encodeURIComponent(query.trim())}&locale=${locale}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json() as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error || (ru ? "Поиск недоступен." : "Qidiruv mavjud emas."));
        setResults(body.results ?? []);
        setActive(0);
      } catch (value) {
        if (value instanceof DOMException && value.name === "AbortError") return;
        setError(value instanceof Error ? value.message : String(value));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locale, open, query, ru]);

  const resultLinks = useMemo(() => results.map((result) => ({
    result,
    href: resultHref(result, base, query),
  })), [base, query, results]);

  function openActive() {
    const item = resultLinks[active];
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

  return (
    <>
      <button ref={triggerRef} className="global-search-trigger" type="button" onClick={() => setOpen(true)} aria-label={ru ? "Глобальный поиск" : "Global qidiruv"} aria-expanded={open} aria-controls={open ? "global-search-workspace" : undefined}>
        <Search /><span>{ru ? "Поиск" : "Qidiruv"}</span><kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="global-search-layer">
          <button className="global-search-backdrop" type="button" onClick={() => setOpen(false)} aria-label={ru ? "Закрыть поиск" : "Qidiruvni yopish"} />
          <section id="global-search-workspace" ref={dialogRef} className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
            <header>
              <Search />
              <h2 id="global-search-title" className="sr-only">{ru ? "Поиск по JURO" : "JURO bo‘yicha qidiruv"}</h2>
              <input
                ref={inputRef}
                type="text"
                inputMode="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 120))}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(current + 1, resultLinks.length - 1)); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); }
                  if (event.key === "Enter") { event.preventDefault(); openActive(); }
                }}
                placeholder={ru ? "Чаты, документы, дела, задачи, анализы, юристы, источники" : "Chatlar, hujjatlar, ishlar, vazifalar, tahlillar, yuristlar, manbalar"}
                aria-controls="global-search-results"
                aria-activedescendant={resultLinks[active] ? `global-search-result-${active}` : undefined}
              />
              {loading ? <LoaderCircle className="spin" /> : <button type="button" onClick={() => setOpen(false)} aria-label={ru ? "Закрыть" : "Yopish"}><X /></button>}
            </header>
            <div id="global-search-results" className="global-search-results" role="listbox">
              {error ? <p className="global-search-message error" role="alert">{error}</p> : query.trim().length < 2 ? (
                <p className="global-search-message">{ru ? "Введите минимум два символа." : "Kamida ikki belgi kiriting."}</p>
              ) : !loading && !resultLinks.length ? (
                <p className="global-search-message">{ru ? "Ничего не найдено в доступном вам пространстве." : "Sizga ochiq makonda hech narsa topilmadi."}</p>
              ) : resultLinks.map(({ result, href }, index) => {
                const Icon = icons[result.type as keyof typeof icons] ?? Search;
                const external = result.type === "source";
                return (
                  <Link
                    id={`global-search-result-${index}`}
                    role="option"
                    aria-selected={active === index}
                    className={active === index ? "active" : ""}
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer" : undefined}
                    key={`${result.type}-${result.id}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => setOpen(false)}
                  >
                    <span><Icon /></span>
                    <div><strong>{result.title}</strong><small>{typeLabel(result.type, ru)}{result.subtitle ? ` · ${result.subtitle}` : ""}</small></div>
                  </Link>
                );
              })}
            </div>
            <footer><span>↑↓ {ru ? "выбор" : "tanlash"}</span><span>Enter {ru ? "открыть" : "ochish"}</span><span>Esc {ru ? "закрыть" : "yopish"}</span></footer>
          </section>
        </div>
      )}
    </>
  );
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
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function typeLabel(type: SearchResult["type"], ru: boolean) {
  const labels = {
    case: ["Дело", "Ish"],
    document: ["Документ", "Hujjat"],
    "document-content": ["В документе", "Hujjat ichida"],
    conversation: ["Диалог", "Suhbat"],
    comparison: ["Сравнение", "Taqqoslash"],
    task: ["Задача", "Vazifa"],
    analysis: ["Анализ", "Tahlil"],
    template: ["Шаблон", "Shablon"],
    lawyer: ["Юрист", "Yurist"],
    source: ["Официальный источник", "Rasmiy manba"],
  } as const;
  return (labels[type as keyof typeof labels] ?? ["Результат", "Natija"])[ru ? 0 : 1];
}
