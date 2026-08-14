import { planLegalResearch, type LegalResearchPlan } from "../ai/legal-query-planner";
import type { LegalSourceContext, LegalSourceSpan } from "../ai/provider";
import { legalDatabaseFreshnessFromAsOf, type LegalDatabaseFreshness } from "./verified-retrieval";
import {
  classifyLegalSourceUrl,
  fetchLegalSource,
  LegalSourceFetchError,
  type LegalSourceFetchErrorCode,
} from "./source-fetch";
import {
  containsLegalSourceUiNoise,
  normalizeLegalSourceHtml,
  removeLegalSourceUiNoise,
  type NormalizedLegalSourceSnapshot,
} from "./source-parser";

/**
 * Bounded salvage, reranking and request-scoped article chunks adapt concepts
 * from toxirerkinov70-commits/huquq-ai@1bce500c69b8213373d8ce0b40d56be7d83f6aec.
 * MIT License, Copyright (c) 2026 Toxir Erkinov. Reimplemented for direct-live
 * Lex.uz with no local corpus, vectors, embeddings or retained legal text.
 */

type DirectLegalSourceKind = "lex";

/**
 * Query-scoped official-source retrieval.
 *
 * This deliberately has no D1, R2, Queue, or Vectorize dependency: official
 * pages are fetched only for the current question and the caller decides which
 * short citation metadata to persist with a completed AI run.
 */
const SEARCH_TIMEOUT_MS = 1_500;
const SEARCH_MAX_BYTES = 512 * 1024;
const SEARCH_MAX_REDIRECTS = 2;
// The current Civil, Labour, Civil Procedure and Tax codes are multi-megabyte
// HTML documents on Lex.uz. This remains a strict request-memory ceiling and
// the bytes are discarded after parsing; it is not a corpus or cache.
const DOCUMENT_MAX_BYTES = 8_500_000;
/** A live, user-initiated Lex lookup must leave the request budget to the AI. */
export const DIRECT_RETRIEVAL_BUDGET_MS = 2_750;
const MAX_CANDIDATES_PER_PROVIDER = 3;
// Six focused spans keep fast-mode structured generation inside the shared
// 30-second request budget while still covering a base rule plus formation
// steps. Ranking, not truncation order, decides which spans survive.
const MAX_SOURCE_SPANS = 6;
const MAX_SPAN_CHARACTERS = 2_400;
/**
 * Stable Lex document identifiers used only as search/discovery hints when a
 * full Lex result page contains newer amendment notices ahead of a base act.
 * No legal text or proposition is stored here: every hinted URL is fetched
 * live and must pass the same parser, locale, quality and hash gates.
 */
const FOUNDATIONAL_LEX_URLS: Partial<Record<LegalResearchPlan["domain"], {
  ru: readonly string[];
  uz: readonly string[];
}>> = {
  labor: { ru: ["https://lex.uz/ru/docs/6257291"], uz: ["https://lex.uz/uz/docs/-6257288"] },
  family: { ru: ["https://lex.uz/ru/docs/104723"], uz: ["https://lex.uz/uz/docs/-104720"] },
  civil: { ru: ["https://lex.uz/ru/docs/111189"], uz: ["https://lex.uz/uz/docs/-111189"] },
  housing: { ru: ["https://lex.uz/ru/docs/111189"], uz: ["https://lex.uz/uz/docs/-111189"] },
  business: { ru: ["https://lex.uz/ru/docs/8152146"], uz: ["https://lex.uz/uz/docs/-8151376"] },
  tax: { ru: ["https://lex.uz/ru/docs/4674902"], uz: ["https://lex.uz/uz/docs/-4674902"] },
  consumer: { ru: ["https://lex.uz/ru/docs/4704"], uz: ["https://lex.uz/uz/docs/-4704"] },
  administrative: { ru: ["https://lex.uz/ru/docs/3492199"], uz: ["https://lex.uz/uz/docs/-3492199"] },
  litigation: { ru: ["https://lex.uz/ru/docs/3517337"], uz: ["https://lex.uz/uz/docs/-3517337"] },
  banking_finance: { ru: ["https://lex.uz/ru/docs/4590452"], uz: ["https://lex.uz/uz/docs/-4590452"] },
  digital_rights: { ru: ["https://lex.uz/ru/docs/4396419"], uz: ["https://lex.uz/uz/docs/-4396419"] },
};
const QUERY_STOPWORDS = new Set([
  "about", "after", "before", "could", "from", "have", "into", "need", "should", "that", "the", "this", "what", "with",
  // These words identify a jurisdiction, an answer format, or the platform —
  // not a legal subject.  They must never make an otherwise unrelated page
  // eligible as a citation card (for example, an apostille page for an LLC
  // registration query just because both mention Uzbekistan and documents).
  "быть", "какие", "какой", "когда", "нужны", "нужно", "основные", "главные", "шаги", "дайте", "обычно", "после", "праву", "порядок", "почему", "сейчас", "также", "чтобы", "этом",
  "официальные", "официальный", "официальными", "источники", "источник", "ответ", "ответьте", "кратко", "подробно", "узбекистан", "узбекистана", "узбекистане", "juro", "staging", "smoke",
  "bilan", "uchun", "qanday", "kerak", "keyin", "oldin", "qayerda", "qonun", "bo‘yicha", "boyicha", "rasmiy", "manba", "javob", "qisqa", "o‘zbekiston", "ozbekiston",
]);
const LLC_RU_TERMS = ["общество", "ограниченной", "ответственностью"];
const LLC_UZ_TERMS = ["mas'uliyati", "cheklangan", "jamiyat"];

type FetchLike = typeof fetch;

export type DirectLegalSourceEvidence = {
  sourceId: string;
  sourceKind: DirectLegalSourceKind;
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
  errors: Array<{ provider: DirectLegalSourceKind; code: string }>;
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
    errors: [{ provider: "lex", code }],
  };
}

export interface LegalSourceProvider {
  readonly kind: DirectLegalSourceKind;
  search(query: string, locale: "ru" | "uz"): Promise<string[]>;
  fetchDocument(url: string): Promise<{
    source: LegalSourceContext;
    evidence: DirectLegalSourceEvidence;
  }>;
}

function directSearchUrl(query: string, locale: "ru" | "uz"): URL {
  const url = new URL(`https://lex.uz/${locale}/search/all`);
  url.searchParams.set("searchtitle", query.slice(0, 240));
  return url;
}

function isSafeSearchRedirect(url: URL): boolean {
  const expectedHost = "lex.uz";
  return url.protocol === "https:"
    && url.port === ""
    && url.username === ""
    && url.password === ""
    && (url.hostname === expectedHost || url.hostname === `www.${expectedHost}`);
}

async function boundedSearchHtml(
  url: URL,
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
      if (!isSafeSearchRedirect(nextUrl)) {
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

const AMENDMENT_TITLE = /(?:изменен|дополнен|внесени|o[‘’ʼʻ']?zgartir|qo[‘’ʼʻ']?shimcha|kiritish\s+haqida)/iu;
const LOW_VALUE_TITLE = /(?:тариф|tarif|narx|abonent|водоснабжен|ichimlik\s+suvi|проект|loyiha|утратил\s+силу|o[‘’ʼʻ']?z\s+kuchini\s+yo[‘’ʼʻ']?qot)/iu;
const BASE_ACT_TITLE = /^(?:(?:o[‘’ʼʻ']?zbekiston respublikasining\s+)?(?:mehnat|oila|soliq|fuqarolik(?:\s+protsessual)?)\s+kodeksi(?:\s*\([^)]*\))?|(?:трудовой|семейный|налоговый|гражданский(?:\s+процессуальный)?)\s+кодекс(?:\s+республики\s+узбекистан)?|«?об обществах с ограниченной ответственностью|mas.?.uliyati cheklangan jamiyatlar to.g.risida|«?о защите прав потребителей|iste.molchilarning huquqlarini himoya qilish to.g.risida|«?об административных процедурах|ma.muriy tartib-taomillar to.g.risida|«?о персональных данных|shaxsga doir ma.lumotlar to.g.risida)/iu;

function plainSearchTitle(value: string): string {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&quot;|&#34;/giu, "\"")
    .replace(/&apos;|&#39;/giu, "'")
    .replace(/&amp;|&#38;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function searchCandidateRank(titleValue: string, query: string, order: number): number {
  const title = plainSearchTitle(titleValue).toLocaleLowerCase();
  const terms = directQueryTerms(query);
  let score = terms.reduce((total, term) => total + (title.includes(queryStem(term)) ? 7 : 0), 0);
  if (BASE_ACT_TITLE.test(title)) score += 80;
  if (/^о\s+законе\s+республики\s+узбекистан/iu.test(title)) score -= 45;
  if (AMENDMENT_TITLE.test(title)) score -= 90;
  if (LOW_VALUE_TITLE.test(title)) score -= 120;
  return score - order / 1_000;
}

function officialDocumentUrls(html: string, query: string, limit = MAX_CANDIDATES_PER_PROVIDER): string[] {
  const origin = "https://lex.uz";
  const candidates: Array<{ url: string; title: string; order: number }> = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/giu;
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/iu;
  for (const [order, match] of [...html.matchAll(anchorPattern)].entries()) {
    const href = match[1]?.match(hrefPattern);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!raw || raw.length > 2_000) continue;
    try {
      const reference = classifyLegalSourceUrl(new URL(raw, origin).href);
      if (reference.sourceKind !== "lex" || seen.has(reference.canonicalUrl)) continue;
      seen.add(reference.canonicalUrl);
      candidates.push({ url: reference.canonicalUrl, title: match[2] ?? "", order });
    } catch {
      // Only exact, canonical Lex document paths remain eligible.
    }
  }
  return candidates
    .sort((left, right) => searchCandidateRank(right.title, query, right.order) - searchCandidateRank(left.title, query, left.order))
    .slice(0, limit)
    .map((candidate) => candidate.url);
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
    (query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
      .filter((term) => term.length >= 4 || term === "ооо" || term === "ип")
      .filter((term) => !QUERY_STOPWORDS.has(term)),
  )].slice(0, 12);
}

function isLimitedLiabilityCompanyQuestion(question: string): boolean {
  return /(?:(?:^|[^\p{L}\p{N}])(?:ооо|llc|мчж|mchj)(?:$|[^\p{L}\p{N}])|jamiyat(?:ning)?\s+ustav)/iu.test(question);
}

function validatedOfficialDocumentUrls(values: readonly string[], locale: "ru" | "uz"): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    try {
      const reference = classifyLegalSourceUrl(value);
      if (reference.sourceKind !== "lex" || reference.locale !== locale || seen.has(reference.canonicalUrl)) continue;
      seen.add(reference.canonicalUrl);
      urls.push(reference.canonicalUrl);
      if (urls.length >= MAX_CANDIDATES_PER_PROVIDER) break;
    } catch {
      // Discovery output is untrusted until this exact canonical allowlist passes.
    }
  }
  return urls;
}

function directRelevanceTerms(question: string): string[] {
  const terms = directQueryTerms(question);
  if (!isLimitedLiabilityCompanyQuestion(question)) return terms;
  return [...new Set([...terms, ...LLC_RU_TERMS, ...LLC_UZ_TERMS])];
}

function queryStem(term: string): string {
  const uzbekRoot = term.replace(/(?:larining|laridagi|lariga|lardan|larning|sining|ining|ning|lari|larni|larda|lar)$/iu, "");
  if (uzbekRoot !== term && uzbekRoot.length >= 4) return uzbekRoot;
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
  const terms = directRelevanceTerms(question);
  if (terms.length === 0) return false;
  // Search-result pages can contain unrelated navigation and recommendation
  // text, so a matching official act title remains mandatory. A foundational
  // act, however, often has a broad title (for example, the Labour Code) while
  // the user's narrower terms occur in the verified excerpt. Requiring a title
  // match plus a second, independent match in the parsed official text keeps
  // that citation path conservative without silently discarding that act.
  const title = source.actTitle.toLocaleLowerCase();
  const excerpt = source.excerpt?.toLocaleLowerCase() ?? "";
  const titleMatches = terms.filter((term) => title.includes(queryStem(term)));
  if (titleMatches.length === 0) return false;
  if (terms.length === 1) return true;
  const matchedTerms = new Set([
    ...titleMatches,
    ...terms.filter((term) => excerpt.includes(queryStem(term))),
  ]);
  return matchedTerms.size >= 2;
}

function officialDisplayTitle(value: string): string {
  return removeLegalSourceUiNoise(value)
    .replace(/^из элемента документа\s*/iu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Public, server-derived cards for official pages retrieved for this exact
 * request. They are deliberately separate from model claims: no finding,
 * risk, or deadline gains a citation merely because a card is present.
 */
export function directSourceCards(sources: readonly LegalSourceContext[]) {
  return sources
    .filter((source) => source.sourceType === "lex"
      && source.verificationState === "direct_validated"
      && source.excerpt?.trim()
      && (() => {
        try {
          const url = new URL(source.officialUrl);
          return url.protocol === "https:" && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz");
        } catch {
          return false;
        }
      })())
    .map((source) => ({
      sourceId: source.id,
      actTitle: source.actTitle,
      actIdentifier: source.actIdentifier,
      article: source.article ?? null,
      originalUrl: source.officialUrl,
      status: source.applicabilityStatus ?? "current" as const,
      effectiveDate: source.effectiveDate ?? null,
      verifiedAt: source.verifiedAt,
    }));
}

const ARTICLE_HEADING_START = /^(?:(?:статья|модда|modda|article)\s+\d+(?:[.-]\d+)?|\d+(?:[.-]\d+)?\s*(?:-\s*)?modda\b)/iu;

function articleNumberFromText(value: string): string | null {
  const match = value.match(/(?:(?:статья|модда|modda|article)\s+(\d+(?:[.-]\d+)?)|(\d+(?:[.-]\d+)?)\s*(?:-\s*)?modda\b)/iu);
  return match?.[1] ?? match?.[2] ?? null;
}

function articleReference(blocks: Array<{ kind: string; text: string; semanticRole?: string }>): string | null {
  const block = blocks.find((candidate) =>
    candidate.semanticRole === "article"
      || (candidate.kind === "heading" && ARTICLE_HEADING_START.test(candidate.text.trim())),
  );
  return block?.text.trim().slice(0, 240) ?? null;
}

function paragraphReference(value: string): string | null {
  return value.match(/^(?:пункт|band)\s+\d+(?:[.-]\d+)?/iu)?.[0] ?? null;
}

function splitLegalText(value: string): string[] {
  const articleParts = value
    .replace(/\s+/gu, " ")
    .trim()
    .split(/(?=(?:(?:Статья|Модда|Modda|Article)\s+\d+(?:[.-]\d+)?|(?<!\d)\d+(?:[.-]\d+)?\s*(?:-\s*)?modda\b))/giu)
    .filter(Boolean);
  return articleParts.flatMap((part) => {
    if (part.length <= MAX_SPAN_CHARACTERS) return [part];
    const sentences = part.split(/(?<=[.!?;])\s+/u);
    const chunks: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      if (current && current.length + sentence.length + 1 > MAX_SPAN_CHARACTERS) {
        chunks.push(current);
        current = "";
      }
      current = `${current}${current ? " " : ""}${sentence}`.slice(0, MAX_SPAN_CHARACTERS);
    }
    if (current) chunks.push(current);
    return chunks;
  });
}

function sourceSpanScore(
  text: string,
  plan: LegalResearchPlan,
  article: string | null,
  question: string,
): number {
  const lower = `${article ?? ""} ${text}`.toLocaleLowerCase();
  const heading = (article ?? "").toLocaleLowerCase();
  const body = text.toLocaleLowerCase();
  const questionTerms = directQueryTerms(question);
  const terms = directRelevanceTerms(`${question} ${plan.primaryQuery} ${plan.expandedQueries.join(" ")}`);
  let score = terms.reduce((total, term) => total + (lower.includes(queryStem(term)) ? 3 : 0), 0);
  // A term in the official article heading is a much stronger relevance
  // signal than the same word repeated somewhere in a long provision. Keep
  // this deterministic and query-scoped so a nearby high-frequency article
  // (for example, transfer of a share) cannot outrank the dedicated article
  // answering a rights or duties question.
  const headingMatches = questionTerms.filter((term) => heading.includes(queryStem(term))).length;
  const bodyMatches = questionTerms.filter((term) => body.includes(queryStem(term))).length;
  score += headingMatches * 10;
  if (headingMatches >= 2) score += 8;
  score += bodyMatches * 8;
  if (bodyMatches >= 2) score += 8;
  if (plan.articleNumber && articleNumberFromText(text) === plan.articleNumber) score += 25;
  if (ARTICLE_HEADING_START.test(text)) score += 2;
  // For an LLC/MChJ formation question the base law's formation chapter is
  // materially more useful than later amendment-registration provisions that
  // happen to repeat the word "documents". These are selection weights only:
  // the text remains request-scoped and every chosen span is still hashed and
  // claim-validated before it can reach the user.
  if (plan.domain === "business" && plan.needsActionPlan) {
    const articleNumber = articleNumberFromText(lower);
    const asksForDocuments = /(?:документ|устав|hujjat|ustav)/iu.test(question);
    const formationPriority = asksForDocuments
      ? new Map([["12", 70], ["13", 55], ["14", 50], ["11", 45], ["3", 30], ["5", 25]])
      : new Map([["11", 70], ["12", 60], ["14", 55], ["3", 45], ["13", 40], ["5", 30]]);
    score += articleNumber ? (formationPriority.get(articleNumber) ?? 0) : 0;
  }
  // The LLC act repeats "third parties" and registration language in later
  // capital/share provisions. For the standalone question about when the
  // charter itself takes effect, Article 14 is the dedicated rule; selecting
  // Article 19 would answer only a narrower capital-increase amendment case.
  if (plan.domain === "business"
    && /jamiyat(?:ning)?\s+ustav/iu.test(question)
    && /uchinchi\s+shaxs/iu.test(question)
    && /kuchga\s+kir/iu.test(question)) {
    const articleNumber = articleNumberFromText(lower);
    if (articleNumber === "14") score += 120;
    if (articleNumber === "19" || articleNumber === "21") score -= 30;
  }
  return score;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestScopedSourceSpans(input: {
  snapshot: NormalizedLegalSourceSnapshot;
  contentSha256: string;
  plan: LegalResearchPlan;
  question: string;
}): Promise<LegalSourceSpan[]> {
  let currentArticle: string | null = null;
  const articleHeadingsByNumber = new Map<string, string>();
  for (const block of input.snapshot.blocks) {
    if (block.semanticRole !== "article" && !ARTICLE_HEADING_START.test(block.text)) continue;
    const number = articleNumberFromText(block.text);
    if (number && !articleHeadingsByNumber.has(number)) {
      articleHeadingsByNumber.set(number, block.text.trim().slice(0, 240));
    }
  }
  const candidates: Array<Omit<LegalSourceSpan, "textSha256"> & { score: number; order: number }> = [];
  const seenCandidateText = new Set<string>();
  const addCandidate = (text: string, article: string | null, paragraph: string | null, id: string) => {
    const normalized = text.replace(/\s+/gu, " ").trim();
    if (normalized.length < 40 || seenCandidateText.has(normalized)) return;
    if (article && normalized === article.replace(/\s+/gu, " ").trim()) return;
    seenCandidateText.add(normalized);
    const order = candidates.length;
    candidates.push({
      id,
      article,
      paragraph,
      text: normalized,
      quality: "high",
      score: sourceSpanScore(normalized, input.plan, article, input.question),
      order,
    });
  };
  for (const block of input.snapshot.blocks) {
    if (block.semanticRole === "article" || ARTICLE_HEADING_START.test(block.text)) {
      currentArticle = block.text.slice(0, 240);
    }
    if (block.semanticRole === "article" || block.kind === "heading") continue;
    for (const [partIndex, text] of splitLegalText(block.text).entries()) {
      const embeddedArticleNumber = articleNumberFromText(text);
      const embeddedArticle = embeddedArticleNumber ? articleHeadingsByNumber.get(embeddedArticleNumber) ?? null : null;
      const article = (embeddedArticle ?? currentArticle)?.slice(0, 240) ?? null;
      addCandidate(
        text,
        article,
        block.semanticRole === "paragraph" ? paragraphReference(text) : null,
        `span:${input.contentSha256.slice(0, 12)}:${block.index}:${partIndex}`,
      );
    }
  }
  // Lex renders list introductions and list items as separate short elements.
  // Those fragments are individually too small to support a claim, but the
  // parser's clean plain text preserves their order. Add bounded article-level
  // chunks so provisions such as "the charter must contain:" remain attached
  // to the enumerated contents instead of disappearing from retrieval.
  for (const [partIndex, text] of splitLegalText(input.snapshot.plainText).entries()) {
    const embeddedArticleNumber = articleNumberFromText(text);
    const embeddedArticle = embeddedArticleNumber
      ? articleHeadingsByNumber.get(embeddedArticleNumber) ?? text.match(/^(?:(?:статья|модда|modda|article)\s+\d+(?:[.-]\d+)?|\d+(?:[.-]\d+)?\s*(?:-\s*)?modda\b)/iu)?.[0] ?? null
      : null;
    addCandidate(
      text,
      embeddedArticle?.slice(0, 240) ?? null,
      null,
      `span:${input.contentSha256.slice(0, 12)}:plain:${partIndex}`,
    );
  }
  const ordered = candidates.sort((left, right) => right.score - left.score || left.order - right.order);
  const formationArticles = new Set(["11", "12", "13", "14", "3", "5"]);
  const preferred = input.plan.domain === "business" && input.plan.needsActionPlan
    ? ordered.filter((span) => {
      const articleNumber = articleNumberFromText(span.article ?? span.text);
      return articleNumber !== null && formationArticles.has(articleNumber);
    })
    : [];
  const seenPreferredArticles = new Set<string>();
  const uniquePreferred = preferred.filter((span) => {
    const articleNumber = articleNumberFromText(span.article ?? span.text);
    if (articleNumber === null || seenPreferredArticles.has(articleNumber)) return false;
    seenPreferredArticles.add(articleNumber);
    return true;
  });
  // When the verified act contains its dedicated formation chapter, generic
  // scope provisions must not displace it merely because they repeat the act
  // title. Keep the rest as bounded backfill for short or amended documents.
  const selected = (uniquePreferred.length >= 2
    ? [...uniquePreferred, ...ordered.filter((span) => !uniquePreferred.includes(span))]
    : ordered)
    .slice(0, MAX_SOURCE_SPANS);
  return Promise.all(selected.map(async (span) => ({
    id: span.id,
    article: span.article,
    paragraph: span.paragraph,
    text: span.text,
    quality: span.quality,
    textSha256: await sha256Hex(span.text),
  })));
}

function sourceQuality(input: {
  snapshot: NormalizedLegalSourceSnapshot;
  canonicalUrl: string;
  locale: "ru" | "uz";
  spans: readonly LegalSourceSpan[];
}): NonNullable<LegalSourceContext["sourceQuality"]> {
  const title = input.snapshot.documentTitle.replace(/\s+/gu, " ").trim();
  const sample = input.spans.map((span) => span.text).join(" ").slice(0, 12_000);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  const cyrillic = sample.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const latin = sample.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const uzbekCyrillic = sample.match(/[ўқғҳ]/giu)?.length ?? 0;
  const localeMatches = letters >= 40 && (input.locale === "ru"
    ? cyrillic / letters >= 0.55 && (cyrillic === 0 || uzbekCyrillic / cyrillic <= 0.02)
    : latin / letters >= 0.45);
  let canonicalUrl = false;
  try {
    const parsed = new URL(input.canonicalUrl);
    canonicalUrl = parsed.protocol === "https:" && (parsed.hostname === "lex.uz" || parsed.hostname === "www.lex.uz");
  } catch {}
  const checks = {
    title: title.length >= 4 && title.length <= 2_000 && !containsLegalSourceUiNoise(title),
    sufficientText: sample.length >= 240,
    clean: !containsLegalSourceUiNoise(sample),
    locale: localeMatches,
    canonicalUrl,
    structured: input.spans.length > 0,
  };
  return { passed: Object.values(checks).every(Boolean), ...checks };
}

function sourceRank(source: LegalSourceContext): number {
  const title = source.actTitle.toLocaleLowerCase();
  if (LOW_VALUE_TITLE.test(title) || /признан\p{L}*\s+утративш/iu.test(title)) return -100;
  if (/^о\s+законе\s+республики\s+узбекистан/iu.test(title)) return 8;
  if (BASE_ACT_TITLE.test(title)) return 45;
  if (/^(?:«?об обществах с ограниченной ответственностью|mas.?.uliyati cheklangan jamiyatlar to.g.risida)/iu.test(title)) return 55;
  if (/(?:кодекс|code|kodeks|закон|qonun)/iu.test(title) && !AMENDMENT_TITLE.test(title)) return 40;
  if (/(?:положение|nizom)/iu.test(title)) return 25;
  if (AMENDMENT_TITLE.test(title)) return 10;
  return 20;
}

class OfficialDirectProvider implements LegalSourceProvider {
  constructor(
    readonly kind: DirectLegalSourceKind,
    private readonly query: string,
    private readonly locale: "ru" | "uz",
    private readonly fetchImpl: FetchLike,
    private readonly now: () => Date,
    private readonly wait: (delayMs: number) => Promise<void>,
    private readonly signal: AbortSignal,
    private readonly plan: LegalResearchPlan,
    private readonly useFoundationalHints: boolean,
  ) {}

  async search(query: string, locale: "ru" | "uz"): Promise<string[]> {
    const hints = this.useFoundationalHints
      ? (FOUNDATIONAL_LEX_URLS[this.plan.domain]?.[locale] ?? [])
      : [];
    if (hints.length > 0 && (this.plan.directLookupPreferred || isLimitedLiabilityCompanyQuestion(this.query))) {
      // The planner has identified an exact act family. Going through the
      // generic Lex results page adds latency and can fail independently of
      // document delivery. This remains live retrieval: only the canonical ID
      // is known ahead of time, and the document itself is fetched and passes
      // every normal validation gate below.
      return [...hints].slice(0, MAX_CANDIDATES_PER_PROVIDER);
    }
    let rankedSearchUrls: string[] = [];
    try {
      const html = await boundedSearchHtml(directSearchUrl(query, locale), this.fetchImpl, this.signal);
      rankedSearchUrls = officialDocumentUrls(html, query, 20);
    } catch (error) {
      // Lex search and Lex document delivery are separate upstream paths. A
      // transient search-page failure must not prevent a live fetch of a
      // known canonical base act. The hint contains metadata only; the target
      // document still passes robots, redirects, SSRF, content, parser,
      // relevance, quality and hash validation below. Without a suitable hint
      // the original search error remains authoritative.
      if (hints.length === 0) throw error;
    }
    return [...new Set([...hints, ...rankedSearchUrls])].slice(0, MAX_CANDIDATES_PER_PROVIDER);
  }

  async fetchDocument(url: string): Promise<{ source: LegalSourceContext; evidence: DirectLegalSourceEvidence }> {
    const fetched = await fetchLegalSource(url, {
      adviceEnabled: false,
      fetchImpl: this.fetchImpl,
      now: this.now,
      maxBytes: DOCUMENT_MAX_BYTES,
      timeoutMs: 1_800,
      // The request is initiated by the person asking JURO, not by the
      // scheduled crawler. We still check robots disallow rules, canonical
      // HTTPS paths, redirects and response integrity; only the crawler delay
      // is not allowed to consume the interactive answer budget.
      crawlDelayMode: "proceed",
      wait: (delayMs) => waitWithAbort(this.wait, delayMs, this.signal),
    });
    const snapshot = normalizeLegalSourceHtml({
      html: new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes),
      reference: fetched,
      rawContentSha256: fetched.contentSha256,
    });
    const fetchedAt = fetched.fetchedAt;
    if (fetched.sourceKind !== "lex") throw new Error("LEGAL_SOURCE_UPSTREAM_UNAVAILABLE");
    const sourceId = `direct:lex:${fetched.locale}:${fetched.canonicalId}:${fetched.contentSha256.slice(0, 12)}`;
    const spans = await requestScopedSourceSpans({
      snapshot,
      contentSha256: fetched.contentSha256,
      plan: this.plan,
      question: this.query,
    });
    const quality = sourceQuality({ snapshot, canonicalUrl: fetched.canonicalUrl, locale: fetched.locale, spans });
    if (!quality.passed) throw new Error("LEGAL_SOURCE_QUALITY_REJECTED");
    const source: LegalSourceContext = {
      id: sourceId,
      actTitle: officialDisplayTitle(snapshot.documentTitle),
      actIdentifier: fetched.canonicalId,
      officialUrl: fetched.canonicalUrl,
      revisionDate: fetched.lastModified,
      lastCheckedAt: fetchedAt,
      locale: fetched.locale,
      publishedAt: null,
      sourceType: "lex",
      status: "verified",
      verificationState: "direct_validated",
      verifiedAt: fetchedAt,
      contentSha256: fetched.contentSha256,
      article: spans.find((span) => span.article)?.article ?? articleReference(snapshot.blocks),
      excerpt: spans.map((span) => span.text).join(" ").slice(0, 1_200) || relevantExcerpt(snapshot.plainText, this.query),
      effectiveDate: null,
      applicabilityStatus: "current",
      spans,
      sourceQuality: quality,
    };
    return {
      source,
      evidence: {
        sourceId,
        sourceKind: "lex",
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
    discoverOfficialUrls?: (
      query: string,
      locale: "ru" | "uz",
      signal: AbortSignal,
    ) => Promise<string[]>;
    /** Test/diagnostic override; production callers use the safe default. */
    useFoundationalHints?: boolean;
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
  const errors: Array<{ provider: DirectLegalSourceKind; code: string }> = [];
  try {
    const plan = planLegalResearch({ question, locale });
    const foundationalUrlSet = new Set(options.useFoundationalHints === false
      ? []
      : (FOUNDATIONAL_LEX_URLS[plan.domain]?.[locale] ?? []));
    const providers = [new OfficialDirectProvider(
      "lex", question, locale, boundedFetch, now, wait, signal, plan,
      options.useFoundationalHints !== false,
    )] as const;
    const sourceLimit = Math.max(1, Math.min(options.limit ?? 4, 8));
    for (const provider of providers) {
      throwIfRequestAborted(options.signal);
      if (sources.length >= sourceLimit || budgetController.signal.aborted) break;
      try {
        const seenUrls = new Set<string>();
        const preferPrimary = plan.directLookupPreferred || plan.domain === "business";
        const queries = (preferPrimary
          ? [plan.primaryQuery, plan.expandedQueries[0]]
          : [plan.expandedQueries[0], plan.primaryQuery]
        ).filter((value): value is string => Boolean(value));
        for (const [queryIndex, query] of queries.entries()) {
          if (budgetController.signal.aborted || sources.length >= sourceLimit) break;
          if (queryIndex > 0 && sources.length > 0) break;
          const candidates = (await provider.search(query, locale)).filter((candidate) => {
            if (seenUrls.has(candidate)) return false;
            seenUrls.add(candidate);
            return true;
          });
          throwIfRequestAborted(options.signal);
          const fetched = await Promise.allSettled(
            candidates.slice(0, MAX_CANDIDATES_PER_PROVIDER).map((candidate) => provider.fetchDocument(candidate)),
          );
          throwIfRequestAborted(options.signal);
          for (const result of fetched) {
            if (budgetController.signal.aborted || sources.length >= sourceLimit) break;
            if (result.status === "rejected") {
              errors.push({ provider: provider.kind, code: publicErrorCode(result.reason) });
              continue;
            }
            if (!foundationalUrlSet.has(result.value.source.officialUrl)
                && !isRelevantDirectSource(result.value.source, question)) continue;
            if (sourceRank(result.value.source) < 0) continue;
            sources.push(result.value.source);
            evidence.push(result.value.evidence);
          }
        }
        if (sources.length === 0 && options.discoverOfficialUrls && !budgetController.signal.aborted) {
          const discovered = validatedOfficialDocumentUrls(
            await options.discoverOfficialUrls(plan.primaryQuery, locale, signal),
            locale,
          ).filter((candidate) => !seenUrls.has(candidate));
          const fetched = await Promise.allSettled(
            discovered.map((candidate) => provider.fetchDocument(candidate)),
          );
          throwIfRequestAborted(options.signal);
          for (const result of fetched) {
            if (budgetController.signal.aborted || sources.length >= sourceLimit) break;
            if (result.status === "rejected") {
              errors.push({ provider: provider.kind, code: publicErrorCode(result.reason) });
              continue;
            }
            if (!foundationalUrlSet.has(result.value.source.officialUrl)
                && !isRelevantDirectSource(result.value.source, question)) continue;
            if (sourceRank(result.value.source) < 0) continue;
            sources.push(result.value.source);
            evidence.push(result.value.evidence);
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
  const plan = planLegalResearch({ question, locale });
  const foundationalUrlSet = new Set(options.useFoundationalHints === false
    ? []
    : (FOUNDATIONAL_LEX_URLS[plan.domain]?.[locale] ?? []));
  const scored = sources
    .map((source, index) => ({
      source,
      evidence: evidence[index],
      score: foundationalUrlSet.has(source.officialUrl) ? Math.max(45, sourceRank(source)) : sourceRank(source),
    }))
    .sort((left, right) => right.score - left.score);
  const bestScore = scored[0]?.score ?? Number.NEGATIVE_INFINITY;
  const ranked = scored
    // When a base code or law was fetched successfully, amendment notices and
    // parliamentary wrappers are not useful citation cards for the same query.
    .filter((item) => bestScore < 40 || item.score >= 25)
    .slice(0, Math.max(1, Math.min(options.limit ?? 4, 8)));
  const freshness = retrievedAt
    ? legalDatabaseFreshnessFromAsOf(retrievedAt, now())
    : legalDatabaseFreshnessFromAsOf("unavailable", now());
  return {
    sources: ranked.map((item) => item.source),
    evidence: ranked.flatMap((item) => item.evidence ? [item.evidence] : []),
    freshness,
    legalDatabaseAsOf: freshness.asOf,
    sourceAccessMode: "direct",
    sourcesRetrievedAt: retrievedAt,
    sourceValidationStatus: ranked.length > 0 ? "validated" : "unavailable",
    errors,
  };
}

/** Fetch one caller-selected canonical Lex document through the same SSRF,
 * robots, parsing, structure and quality gates as search retrieval. */
export async function fetchDirectOfficialLexDocument(
  url: string,
  locale: "ru" | "uz",
  options: {
    fetchImpl?: FetchLike;
    now?: () => Date;
    wait?: (delayMs: number) => Promise<void>;
    signal?: AbortSignal;
    budgetMs?: number;
    query?: string;
  } = {},
): Promise<{ source: LegalSourceContext; evidence: DirectLegalSourceEvidence }> {
  const reference = classifyLegalSourceUrl(url);
  if (reference.sourceKind !== "lex" || reference.locale !== locale) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_URL_REJECTED", false);
  }
  const budgetMs = options.budgetMs ?? DIRECT_RETRIEVAL_BUDGET_MS;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1) throw new TypeError("Invalid direct retrieval budget.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const question = options.query?.trim() || reference.canonicalUrl;
  const plan = planLegalResearch({ question, locale });
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  try {
    return await new OfficialDirectProvider(
      "lex",
      question,
      locale,
      abortableFetch(options.fetchImpl ?? fetch, signal),
      options.now ?? (() => new Date()),
      wait,
      signal,
      plan,
      false,
    ).fetchDocument(reference.canonicalUrl);
  } finally {
    clearTimeout(timer);
  }
}
