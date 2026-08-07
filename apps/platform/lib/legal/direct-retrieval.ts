import type { LegalSourceContext } from "../ai/provider";
import { legalDatabaseFreshnessFromAsOf, type LegalDatabaseFreshness } from "./verified-retrieval";
import {
  classifyLegalSourceUrl,
  fetchLegalSource,
  type LegalSourceFetchErrorCode,
  type LegalSourceKind,
} from "./source-fetch";
import { normalizeLegalSourceHtml } from "./source-parser";

/**
 * Query-scoped official-source retrieval.
 *
 * This deliberately has no D1, R2, Queue, or Vectorize dependency: official
 * pages are fetched only for the current question and the caller decides which
 * short citation metadata to persist with a completed AI run.
 */
const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_MAX_BYTES = 512 * 1024;
const SEARCH_MAX_REDIRECTS = 2;
const DOCUMENT_MAX_BYTES = 1_500_000;
// Interactive chat must leave a bounded window for the AI provider. A direct
// source miss is safe: the answer is constrained to clarification rather than
// spending the full request lifetime retrying public websites.
const DIRECT_RETRIEVAL_BUDGET_MS = 15_000;
const MAX_CANDIDATES_PER_PROVIDER = 3;
const MAX_SOURCES_PER_PROVIDER = 2;
const QUERY_STOPWORDS = new Set([
  "about", "after", "before", "could", "from", "have", "into", "need", "should", "that", "the", "this", "what", "with",
  // These words identify a jurisdiction, an answer format, or the platform —
  // not a legal subject.  They must never make an otherwise unrelated page
  // eligible as a citation card (for example, an apostille page for an LLC
  // registration query just because both mention Uzbekistan and documents).
  "быть", "какие", "какой", "когда", "нужны", "обычно", "после", "права", "праву", "порядок", "почему", "сейчас", "также", "чтобы", "этом",
  "официальные", "официальный", "источники", "источник", "ответ", "ответьте", "кратко", "подробно", "узбекистан", "узбекистана", "juro", "staging", "smoke",
  "bilan", "uchun", "qanday", "kerak", "keyin", "oldin", "qayerda", "qonun", "bo‘yicha", "boyicha", "rasmiy", "manba", "javob", "qisqa", "o‘zbekiston", "ozbekiston",
]);

type FetchLike = typeof fetch;

export type DirectLegalSourceEvidence = {
  sourceId: string;
  sourceKind: LegalSourceKind;
  canonicalUrl: string;
  contentSha256: string;
  retrievedAt: string;
  validatedAt: string;
  validationStatus: "validated";
};

export type DirectLegalRetrieval = {
  sources: LegalSourceContext[];
  evidence: DirectLegalSourceEvidence[];
  freshness: LegalDatabaseFreshness;
  legalDatabaseAsOf: string;
  sourceAccessMode: "direct";
  sourcesRetrievedAt: string | null;
  sourceValidationStatus: "validated" | "unavailable";
  errors: Array<{ provider: LegalSourceKind; code: string }>;
};

export function unavailableDirectLegalRetrieval(
  now = new Date(),
  code = "LEGAL_SOURCE_DIRECT_RETRIEVAL_DISABLED",
): DirectLegalRetrieval {
  const freshness = legalDatabaseFreshnessFromAsOf("unavailable", now);
  return {
    sources: [], evidence: [], freshness, legalDatabaseAsOf: freshness.asOf,
    sourceAccessMode: "direct", sourcesRetrievedAt: null,
    sourceValidationStatus: "unavailable",
    errors: [{ provider: "lex", code }, { provider: "advice", code }],
  };
}

export interface LegalSourceProvider {
  readonly kind: LegalSourceKind;
  search(query: string, locale: "ru" | "uz"): Promise<string[]>;
  fetchDocument(url: string): Promise<{
    source: LegalSourceContext;
    evidence: DirectLegalSourceEvidence;
  }>;
}

function directSearchUrl(kind: LegalSourceKind, query: string, locale: "ru" | "uz"): URL {
  if (kind === "lex") {
    const url = new URL(`https://lex.uz/${locale}/search/all`);
    url.searchParams.set("searchtitle", query.slice(0, 240));
    return url;
  }
  const url = new URL(`https://advice.uz/${locale === "ru" ? "ru" : "oz"}/search`);
  url.searchParams.set("q", query.slice(0, 240));
  return url;
}

function isSafeSearchRedirect(url: URL, kind: LegalSourceKind): boolean {
  const expectedHost = kind === "lex" ? "lex.uz" : "advice.uz";
  return url.protocol === "https:"
    && url.port === ""
    && url.username === ""
    && url.password === ""
    && (url.hostname === expectedHost || url.hostname === `www.${expectedHost}`);
}

async function boundedSearchHtml(
  url: URL,
  kind: LegalSourceKind,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const requestSignal = signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal;
  try {
    let searchUrl = url;
    let response: Response | null = null;
    for (let redirects = 0; redirects <= SEARCH_MAX_REDIRECTS; redirects += 1) {
      response = await fetchImpl(searchUrl, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: requestSignal,
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9",
          "user-agent": "JURO-LegalSourceDirect/1.0 (+https://juro.uz)",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      try { await response.body?.cancel(); } catch { /* best effort */ }
      if (!location || redirects === SEARCH_MAX_REDIRECTS) {
        throw new Error("LEGAL_SOURCE_SEARCH_REDIRECT_REJECTED");
      }
      const nextUrl = new URL(location, searchUrl);
      if (!isSafeSearchRedirect(nextUrl, kind)) {
        throw new Error("LEGAL_SOURCE_SEARCH_REDIRECT_REJECTED");
      }
      searchUrl = nextUrl;
    }
    if (!response) throw new Error("LEGAL_SOURCE_SEARCH_UNAVAILABLE");
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const length = Number(response.headers.get("content-length") ?? "0");
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* best effort */ }
      throw new Error(`LEGAL_SOURCE_SEARCH_HTTP_${response.status}`);
    }
    if (!contentType.includes("text/html")) {
      try { await response.body?.cancel(); } catch { /* best effort */ }
      throw new Error("LEGAL_SOURCE_SEARCH_CONTENT_TYPE_REJECTED");
    }
    if (length && length > SEARCH_MAX_BYTES) {
      try { await response.body?.cancel(); } catch { /* best effort */ }
      throw new Error("LEGAL_SOURCE_SEARCH_TOO_LARGE");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("LEGAL_SOURCE_SEARCH_UNAVAILABLE");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > SEARCH_MAX_BYTES) throw new Error("LEGAL_SOURCE_SEARCH_TOO_LARGE");
        parts.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("LEGAL_SOURCE_SEARCH_")) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new Error("LEGAL_SOURCE_SEARCH_TIMEOUT");
    }
    throw new Error("LEGAL_SOURCE_SEARCH_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

function abortError(signal: AbortSignal): DOMException {
  return signal.reason instanceof DOMException
    ? signal.reason
    : new DOMException("Request was aborted", "AbortError");
}

function throwIfRequestAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function abortableFetch(fetchImpl: FetchLike, signal: AbortSignal): FetchLike {
  return (input, init) => fetchImpl(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
  });
}

async function waitWithAbort(
  wait: (delayMs: number) => Promise<void>,
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  throwIfRequestAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    void wait(delayMs).then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function officialDocumentUrls(html: string, kind: LegalSourceKind): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const origin = kind === "lex" ? "https://lex.uz" : "https://advice.uz";
  const pattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/giu;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3];
    if (!raw || raw.length > 2_000) continue;
    try {
      const candidate = new URL(raw, origin);
      const reference = classifyLegalSourceUrl(candidate.href);
      if (reference.sourceKind !== kind || seen.has(reference.canonicalUrl)) continue;
      seen.add(reference.canonicalUrl);
      urls.push(reference.canonicalUrl);
      if (urls.length >= MAX_CANDIDATES_PER_PROVIDER) break;
    } catch {
      // Search markup can contain unrelated links. Only exact official document
      // paths pass the canonical URL classifier.
    }
  }
  return urls;
}

function relevantExcerpt(plainText: string, query: string): string {
  const normalized = plainText.replace(/\s+/gu, " ").trim();
  const terms = directQueryTerms(query);
  const lower = normalized.toLocaleLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term))
    .find((value) => value >= 0) ?? 0;
  const start = Math.max(0, index - 220);
  return normalized.slice(start, start + 1_200);
}

function directQueryTerms(query: string): string[] {
  return [...new Set(
    (query.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])
      .filter((term) => !QUERY_STOPWORDS.has(term)),
  )].slice(0, 12);
}

function queryStem(term: string): string {
  if (term.length >= 11) return term.slice(0, -3);
  if (term.length >= 8) return term.slice(0, -2);
  if (term.length >= 6) return term.slice(0, -1);
  return term;
}

/**
 * A direct page is a source card only when its parsed, official text matches
 * the question. This deliberately runs after URL validation and does not use
 * model output, so an unrelated search result cannot become a citation.
 */
function isRelevantDirectSource(source: LegalSourceContext, question: string): boolean {
  const terms = directQueryTerms(question);
  if (terms.length === 0) return false;
  // Search-result pages can contain unrelated navigation and recommendation
  // text. Relevance therefore relies on the parsed document title only, which
  // is a deliberately conservative source-card criterion.
  const searchable = source.actTitle.toLocaleLowerCase();
  const matched = terms.filter((term) => searchable.includes(queryStem(term)));
  return terms.length === 1 ? matched.length === 1 : matched.length >= 2;
}

function officialDisplayTitle(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  // Lex can prepend reader controls inside the ACT_TITLE element. A quoted act
  // title is the authoritative visible portion and avoids exposing those UI
  // controls as the title of a source card.
  const quoted = normalized.match(/«[^»]{3,1800}»/u)?.[0];
  return (quoted ?? normalized).slice(0, 500);
}

/**
 * Public, server-derived cards for official pages retrieved for this exact
 * request. They are deliberately separate from model claims: no finding,
 * risk, or deadline gains a citation merely because a card is present.
 */
export function directSourceCards(sources: readonly LegalSourceContext[]) {
  return sources
    .filter((source) => source.verificationState === "direct_validated" && source.excerpt?.trim())
    .map((source) => ({
      sourceId: source.id,
      actTitle: source.actTitle,
      actIdentifier: source.actIdentifier,
      article: source.article ?? null,
      excerpt: source.excerpt ?? null,
      originalUrl: source.officialUrl,
      status: source.applicabilityStatus ?? "current" as const,
      effectiveDate: source.effectiveDate ?? null,
      verifiedAt: source.verifiedAt,
    }));
}

function articleReference(blocks: Array<{ kind: string; text: string }>): string | null {
  const block = blocks.find((candidate) =>
    candidate.kind === "heading" && /^(статья|модда|article)\s+\d+/iu.test(candidate.text.trim()),
  );
  return block?.text.trim().slice(0, 240) ?? null;
}

class OfficialDirectProvider implements LegalSourceProvider {
  constructor(
    readonly kind: LegalSourceKind,
    private readonly query: string,
    private readonly locale: "ru" | "uz",
    private readonly fetchImpl: FetchLike,
    private readonly now: () => Date,
    private readonly wait: (delayMs: number) => Promise<void>,
    private readonly signal: AbortSignal,
  ) {}

  async search(query: string, locale: "ru" | "uz"): Promise<string[]> {
    return officialDocumentUrls(
      await boundedSearchHtml(directSearchUrl(this.kind, query, locale), this.kind, this.fetchImpl, this.signal),
      this.kind,
    );
  }

  async fetchDocument(url: string): Promise<{ source: LegalSourceContext; evidence: DirectLegalSourceEvidence }> {
    const fetched = await fetchLegalSource(url, {
      adviceEnabled: true,
      fetchImpl: this.fetchImpl,
      now: this.now,
      maxBytes: DOCUMENT_MAX_BYTES,
      // Advice.uz asks for a short crawl delay. This is a single query-scoped
      // request, so wait rather than bypassing its published request policy.
      wait: (delayMs) => waitWithAbort(this.wait, delayMs, this.signal),
    });
    const snapshot = normalizeLegalSourceHtml({
      html: new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes),
      reference: fetched,
      rawContentSha256: fetched.contentSha256,
    });
    const fetchedAt = fetched.fetchedAt;
    const sourceId = `direct:${fetched.sourceKind}:${fetched.locale}:${fetched.canonicalId}:${fetched.contentSha256.slice(0, 12)}`;
    const source: LegalSourceContext = {
      id: sourceId,
      actTitle: officialDisplayTitle(snapshot.documentTitle),
      actIdentifier: fetched.canonicalId,
      officialUrl: fetched.canonicalUrl,
      revisionDate: fetched.lastModified,
      lastCheckedAt: fetchedAt,
      locale: fetched.locale,
      publishedAt: null,
      sourceType: fetched.sourceKind,
      status: "verified",
      verificationState: "direct_validated",
      verifiedAt: fetchedAt,
      contentSha256: fetched.contentSha256,
      article: articleReference(snapshot.blocks),
      excerpt: relevantExcerpt(snapshot.plainText, this.query),
      effectiveDate: null,
      applicabilityStatus: "current",
    };
    return {
      source,
      evidence: {
        sourceId,
        sourceKind: fetched.sourceKind,
        canonicalUrl: fetched.canonicalUrl,
        contentSha256: fetched.contentSha256,
        retrievedAt: fetchedAt,
        validatedAt: fetchedAt,
        validationStatus: "validated",
      },
    };
  }
}

function publicErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE";
  const permitted: LegalSourceFetchErrorCode[] = [
    "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE", "LEGAL_SOURCE_ROBOTS_UNAVAILABLE",
    "LEGAL_SOURCE_ROBOTS_DISALLOWED", "LEGAL_SOURCE_ROBOTS_RATE_POLICY",
    "LEGAL_SOURCE_CRAWL_WINDOW_REQUIRED", "LEGAL_SOURCE_CONTENT_TYPE_REJECTED",
    "LEGAL_SOURCE_EMPTY_CONTENT", "LEGAL_SOURCE_TOO_LARGE", "LEGAL_SOURCE_TIMEOUT",
  ];
  return permitted.includes(code as LegalSourceFetchErrorCode)
    ? code
    : code.startsWith("LEGAL_SOURCE_SEARCH_")
      ? code
      : "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE";
}

export async function retrieveDirectLegalSources(
  question: string,
  locale: "ru" | "uz",
  options: {
    fetchImpl?: FetchLike;
    now?: () => Date;
    limit?: number;
    wait?: (delayMs: number) => Promise<void>;
    signal?: AbortSignal;
    budgetMs?: number;
  } = {},
): Promise<DirectLegalRetrieval> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const budgetMs = options.budgetMs ?? DIRECT_RETRIEVAL_BUDGET_MS;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1) throw new TypeError("Invalid direct retrieval budget.");
  throwIfRequestAborted(options.signal);
  const budgetController = new AbortController();
  const budgetTimer = setTimeout(() => budgetController.abort(), budgetMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, budgetController.signal])
    : budgetController.signal;
  const boundedFetch = abortableFetch(fetchImpl, signal);
  const sources: LegalSourceContext[] = [];
  const evidence: DirectLegalSourceEvidence[] = [];
  const errors: Array<{ provider: LegalSourceKind; code: string }> = [];
  try {
    const providers = [
      new OfficialDirectProvider("lex", question, locale, boundedFetch, now, wait, signal),
      new OfficialDirectProvider("advice", question, locale, boundedFetch, now, wait, signal),
    ] as const;
    const sourceLimit = Math.max(1, Math.min(options.limit ?? 4, 8));
    for (const provider of providers) {
      throwIfRequestAborted(options.signal);
      if (sources.length >= sourceLimit || budgetController.signal.aborted) break;
      try {
        const candidates = await provider.search(question, locale);
        throwIfRequestAborted(options.signal);
        let accepted = 0;
        for (const candidate of candidates) {
          throwIfRequestAborted(options.signal);
          if (budgetController.signal.aborted || sources.length >= sourceLimit || accepted >= MAX_SOURCES_PER_PROVIDER) break;
          try {
            const item = await provider.fetchDocument(candidate);
            throwIfRequestAborted(options.signal);
            if (!isRelevantDirectSource(item.source, question)) continue;
            sources.push(item.source);
            evidence.push(item.evidence);
            accepted += 1;
          } catch (error) {
            throwIfRequestAborted(options.signal);
            errors.push({ provider: provider.kind, code: publicErrorCode(error) });
          }
        }
      } catch (error) {
        throwIfRequestAborted(options.signal);
        errors.push({ provider: provider.kind, code: publicErrorCode(error) });
      }
    }
  } finally {
    clearTimeout(budgetTimer);
  }
  const retrievedAt = evidence.map((item) => item.retrievedAt).sort()[0] ?? null;
  const freshness = retrievedAt
    ? legalDatabaseFreshnessFromAsOf(retrievedAt, now())
    : legalDatabaseFreshnessFromAsOf("unavailable", now());
  return {
    sources,
    evidence,
    freshness,
    legalDatabaseAsOf: freshness.asOf,
    sourceAccessMode: "direct",
    sourcesRetrievedAt: retrievedAt,
    sourceValidationStatus: sources.length > 0 ? "validated" : "unavailable",
    errors,
  };
}
