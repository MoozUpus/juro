import { enqueueOfficialLexCorpusDocument, type LegalCorpusQueueEnv } from "./ingestion";
import {
  discoverLexDocumentLinks,
  lexCatalogSearchUrl,
  LEX_CORPUS_CATEGORIES,
  LEX_CORPUS_LANGUAGES,
  type LexCorpusCategoryKey,
  type LexDiscoveredDocument,
} from "./lex-discovery";
import { featureEnabled, type LegalCorpusFeatureFlag, type LegalCorpusLanguage } from "./trust";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type DiscoveryEnv = Pick<Env, "DB"> & { APP_ENV?: Env["APP_ENV"] }
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

const USER_AGENT = "JURO-LegalSourceSync/1.0 (+https://juro.uz)";
const USER_AGENT_TOKEN = "juro-legalsourcesync";
const ROBOTS_URL = "https://lex.uz/robots.txt";
const MAX_ROBOTS_BYTES = 128 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIEW_STATE = 256 * 1024;
const MAX_CRAWL_DELAY_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 12_000;

export class LexCatalogDiscoveryError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = "LexCatalogDiscoveryError";
  }
}

type RobotsGroup = {
  agents: string[];
  rules: Array<{ allow: boolean; pattern: string }>;
  crawlDelay: number | null;
};

export type ParsedLexCatalogPage = {
  documents: LexDiscoveredDocument[];
  expectedDocumentCount: number | null;
  currentPage: number;
  nextEventTarget: string | null;
  viewState: string | null;
  viewStateGenerator: string | null;
};

type DiscoveryCheckpoint = {
  id: string;
  categoryKey: LexCorpusCategoryKey;
  language: LegalCorpusLanguage;
  searchUrl: string;
  pageNumber: number;
  expectedDocumentCount: number | null;
  nextEventTarget: string | null;
  viewState: string | null;
  viewStateGenerator: string | null;
  attemptCount: number;
};

export type LexCatalogPageRunResult = {
  claimed: boolean;
  status: "disabled" | "empty" | "page_completed" | "category_completed" | "retrying" | "failed";
  checkpointId: string | null;
  pageNumber: number | null;
  discoveredOnPage: number;
  queuedOnPage: number;
  safeErrorCode: string | null;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu").exec(tag);
  return match ? decodeHtml(match[1] ?? match[2] ?? "") : null;
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function expectedDocumentCount(html: string): number | null {
  const block = /<[^>]+class\s*=\s*["'][^"']*\brefind__result-export__title\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/iu.exec(html)?.[1];
  if (!block) return null;
  const values = stripTags(block).match(/\d[\d\s\u00a0]*/gu) ?? [];
  const counts = values.map((value) => Number(value.replace(/[\s\u00a0]/gu, "")))
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
  return counts.length > 0 ? Math.max(...counts) : null;
}

function hiddenValue(html: string, name: "__VIEWSTATE" | "__VIEWSTATEGENERATOR"): string | null {
  for (const match of html.matchAll(/<input\b[^>]*>/giu)) {
    if (attribute(match[0], "name") !== name) continue;
    const value = attribute(match[0], "value") ?? "";
    if (value.length > MAX_VIEW_STATE) throw new LexCatalogDiscoveryError("LEX_CATALOG_VIEWSTATE_TOO_LARGE", false);
    return value;
  }
  return null;
}

function pager(html: string): { currentPage: number; nextEventTarget: string | null } {
  let currentPage = 1;
  const candidates: Array<{ page: number; target: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/giu)) {
    const tag = match[0];
    const text = stripTags(tag);
    if (!/^\d{1,7}$/u.test(text)) continue;
    const page = Number(text);
    const className = attribute(tag, "class") ?? "";
    if (/\baspNetDisabled\b/u.test(className)) {
      currentPage = page;
      continue;
    }
    const href = attribute(tag, "href") ?? "";
    const target = /__doPostBack\(\s*['"]([^'"]+)['"]/iu.exec(href)?.[1];
    if (target) candidates.push({ page, target });
  }
  return {
    currentPage,
    nextEventTarget: candidates.find((candidate) => candidate.page === currentPage + 1)?.target ?? null,
  };
}

export function parseLexCatalogPage(html: string, searchUrl: string): ParsedLexCatalogPage {
  const page = pager(html);
  return {
    documents: discoverLexDocumentLinks(html, searchUrl),
    expectedDocumentCount: expectedDocumentCount(html),
    currentPage: page.currentPage,
    nextEventTarget: page.nextEventTarget,
    viewState: hiddenValue(html, "__VIEWSTATE"),
    viewStateGenerator: hiddenValue(html, "__VIEWSTATEGENERATOR"),
  };
}

function parseRobots(value: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let hasDirectives = false;
  for (const rawLine of value.split(/\r?\n/gu)) {
    const line = rawLine.replace(/#.*/u, "").trim();
    if (!line) {
      if (current && hasDirectives) { current = null; hasDirectives = false; }
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase();
    const directive = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!current || hasDirectives) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
        hasDirectives = false;
      }
      current.agents.push(directive.toLocaleLowerCase());
      continue;
    }
    if (!current || current.agents.length === 0) continue;
    if (key === "allow" || key === "disallow") {
      hasDirectives = true;
      if (key === "disallow" && !directive) continue;
      current.rules.push({ allow: key === "allow", pattern: directive });
    } else if (key === "crawl-delay") {
      hasDirectives = true;
      const seconds = Number(directive);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }
  return groups;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
}

function robotsPolicy(robots: string, target: URL): { allowed: boolean; crawlDelaySeconds: number } {
  const groups = parseRobots(robots);
  const exact = groups.filter((group) => group.agents.includes(USER_AGENT_TOKEN));
  const selected = exact.length > 0 ? exact : groups.filter((group) => group.agents.includes("*"));
  if (selected.length === 0) return { allowed: true, crawlDelaySeconds: 0 };
  const targetValue = `${target.pathname}${target.search}`;
  const matches = selected.flatMap((group) => group.rules).filter((rule) => {
    const anchored = rule.pattern.endsWith("$");
    const body = anchored ? rule.pattern.slice(0, -1) : rule.pattern;
    const expression = escapeRegex(body).replaceAll("*", ".*");
    return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(targetValue);
  }).sort((left, right) => {
    const specificity = (value: string) => value.replaceAll("*", "").replace(/\$$/u, "").length;
    return specificity(right.pattern) - specificity(left.pattern) || Number(right.allow) - Number(left.allow);
  });
  return {
    allowed: matches[0]?.allow ?? true,
    crawlDelaySeconds: Math.max(0, ...selected.map((group) => group.crawlDelay ?? 0)),
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new LexCatalogDiscoveryError("LEX_CATALOG_RESPONSE_TOO_LARGE", false);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new LexCatalogDiscoveryError("LEX_CATALOG_RESPONSE_TOO_LARGE", false);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new LexCatalogDiscoveryError("LEX_CATALOG_ENCODING_REJECTED", false); }
}

async function boundedFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": USER_AGENT, ...init.headers },
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new LexCatalogDiscoveryError("LEX_CATALOG_REDIRECT_REJECTED", false);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new LexCatalogDiscoveryError(
        "LEX_CATALOG_UPSTREAM_UNAVAILABLE",
        response.status === 403 || response.status === 408 || response.status === 425
          || response.status === 429 || response.status >= 500,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof LexCatalogDiscoveryError) throw error;
    throw new LexCatalogDiscoveryError(
      controller.signal.aborted ? "LEX_CATALOG_TIMEOUT" : "LEX_CATALOG_UPSTREAM_UNAVAILABLE",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLexCatalogPage(input: {
  searchUrl: string;
  eventTarget?: string | null;
  viewState?: string | null;
  viewStateGenerator?: string | null;
  fetchImpl?: FetchLike;
  wait?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
}): Promise<ParsedLexCatalogPage> {
  const allowedUrls = new Set(LEX_CORPUS_CATEGORIES.flatMap((category) =>
    LEX_CORPUS_LANGUAGES.map((language) => lexCatalogSearchUrl(category.key, language.language))));
  if (!allowedUrls.has(input.searchUrl)) throw new LexCatalogDiscoveryError("LEX_CATALOG_URL_REJECTED", false);
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Lex.uz currently rejects robots.txt with HTTP 406 when a narrow Accept
  // header is supplied, while the same public resource is available with the
  // ordinary wildcard request header. Keep the transparent crawler user agent
  // and override only content negotiation for this text resource.
  const robotsResponse = await boundedFetch(fetchImpl, ROBOTS_URL, {
    method: "GET",
    headers: { Accept: "*/*" },
  }, timeoutMs);
  const robotsType = (robotsResponse.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLocaleLowerCase();
  if (robotsType !== "text/plain") {
    await robotsResponse.body?.cancel();
    throw new LexCatalogDiscoveryError("LEX_CATALOG_ROBOTS_REJECTED", false);
  }
  const policy = robotsPolicy(await readBoundedText(robotsResponse, MAX_ROBOTS_BYTES), new URL(input.searchUrl));
  if (!policy.allowed) throw new LexCatalogDiscoveryError("LEX_CATALOG_ROBOTS_DISALLOWED", false);
  if (policy.crawlDelaySeconds > MAX_CRAWL_DELAY_SECONDS) {
    throw new LexCatalogDiscoveryError("LEX_CATALOG_RATE_POLICY", false);
  }
  if (policy.crawlDelaySeconds > 0) {
    if (!input.wait) throw new LexCatalogDiscoveryError("LEX_CATALOG_CRAWL_WINDOW_REQUIRED", true);
    await input.wait(Math.ceil(policy.crawlDelaySeconds * 1_000));
  }
  const postback = Boolean(input.eventTarget && input.viewState);
  const body = postback ? new URLSearchParams({
    __EVENTTARGET: input.eventTarget!,
    __EVENTARGUMENT: "",
    __VIEWSTATE: input.viewState!,
    ...(input.viewStateGenerator ? { __VIEWSTATEGENERATOR: input.viewStateGenerator } : {}),
  }).toString() : undefined;
  const response = await boundedFetch(fetchImpl, input.searchUrl, {
    method: postback ? "POST" : "GET",
    body,
    headers: postback ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
  }, timeoutMs);
  const mediaType = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLocaleLowerCase();
  if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
    await response.body?.cancel();
    throw new LexCatalogDiscoveryError("LEX_CATALOG_CONTENT_TYPE_REJECTED", false);
  }
  return parseLexCatalogPage(await readBoundedText(response, MAX_PAGE_BYTES), input.searchUrl);
}

function checkpointId(categoryKey: LexCorpusCategoryKey, language: LegalCorpusLanguage): string {
  return `lex-catalog:${categoryKey}:${language}`;
}

export async function seedLexCatalogDiscoveryCheckpoints(
  env: DiscoveryEnv,
  now = new Date(),
): Promise<{ considered: number; created: number }> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { considered: 0, created: 0 };
  }
  const timestamp = now.toISOString();
  let created = 0;
  for (const category of LEX_CORPUS_CATEGORIES) {
    for (const language of LEX_CORPUS_LANGUAGES) {
      const result = await env.DB.prepare(`INSERT INTO legal_corpus_discovery_checkpoints
        (id,category_key,language,search_url,status,page_number,expected_document_count,discovered_document_count,next_event_target,view_state,view_state_generator,attempt_count,next_attempt_at,last_error_code,started_at,completed_at,created_at,updated_at)
        VALUES (?,?,?,?,'queued',0,NULL,0,NULL,NULL,NULL,0,?,NULL,NULL,NULL,?,?)
        ON CONFLICT(category_key,language) DO NOTHING
      `).bind(
        checkpointId(category.key, language.language), category.key, language.language,
        lexCatalogSearchUrl(category.key, language.language), timestamp, timestamp, timestamp,
      ).run();
      if (Number(result.meta.changes ?? 0) === 1) created += 1;
    }
  }
  // A catalog edge can temporarily refuse Cloudflare egress while the same
  // allowlisted URL remains reachable elsewhere. Older Worker versions
  // classified such a 403 as terminal. Recover only that bounded error and
  // retain the attempt counter so five consecutive failures still stop.
  await env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints
    SET status='retrying',next_attempt_at=?,updated_at=?
    WHERE status='dead_letter' AND last_error_code='LEX_CATALOG_UPSTREAM_UNAVAILABLE'
      AND attempt_count<5`).bind(timestamp, timestamp).run();
  // Lex does not expose a total on every catalogue route. Once pagination has
  // ended, the deduplicated discovery ledger is the authoritative expected
  // set. Persist it so coverage can prove indexed + unavailable = discovered
  // instead of leaving a terminal checkpoint permanently unverifiable.
  await env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints
    SET expected_document_count=discovered_document_count,updated_at=?
    WHERE status='completed' AND expected_document_count IS NULL
      AND next_event_target IS NULL`).bind(timestamp).run();
  return { considered: LEX_CORPUS_CATEGORIES.length * LEX_CORPUS_LANGUAGES.length, created };
}

function retryAt(now: Date, attempt: number): string {
  return new Date(now.getTime() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1))).toISOString();
}

export async function runNextLexCatalogDiscoveryPage(
  env: DiscoveryEnv,
  input: { now?: Date; fetchImpl?: FetchLike; wait?: (delayMs: number) => Promise<void> } = {},
): Promise<LexCatalogPageRunResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { claimed: false, status: "disabled", checkpointId: null, pageNumber: null, discoveredOnPage: 0, queuedOnPage: 0, safeErrorCode: null };
  }
  const nowDate = input.now ?? new Date();
  const now = nowDate.toISOString();
  const stale = new Date(nowDate.getTime() - 15 * 60_000).toISOString();
  await env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints
    SET status='retrying',next_attempt_at=?,last_error_code='LEX_CATALOG_STALE_CLAIM',updated_at=?
    WHERE status='running' AND updated_at<?`).bind(now, now, stale).run();
  const candidate = await env.DB.prepare(`SELECT id,category_key AS categoryKey,language,search_url AS searchUrl,
      page_number AS pageNumber,expected_document_count AS expectedDocumentCount,
      next_event_target AS nextEventTarget,view_state AS viewState,
      view_state_generator AS viewStateGenerator,attempt_count AS attemptCount
    FROM legal_corpus_discovery_checkpoints
    WHERE status IN ('queued','retrying') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY CASE status WHEN 'retrying' THEN 0 ELSE 1 END,
      COALESCE(next_attempt_at,created_at),attempt_count,created_at,id LIMIT 1`)
    .bind(now).first<DiscoveryCheckpoint>();
  if (!candidate) {
    return { claimed: false, status: "empty", checkpointId: null, pageNumber: null, discoveredOnPage: 0, queuedOnPage: 0, safeErrorCode: null };
  }
  const claimed = await env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints
    SET status='running',attempt_count=attempt_count+1,started_at=COALESCE(started_at,?),updated_at=?
    WHERE id=? AND status IN ('queued','retrying')`).bind(now, now, candidate.id).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    return { claimed: false, status: "empty", checkpointId: candidate.id, pageNumber: null, discoveredOnPage: 0, queuedOnPage: 0, safeErrorCode: null };
  }
  const attempt = candidate.attemptCount + 1;
  try {
    const page = await fetchLexCatalogPage({
      searchUrl: candidate.searchUrl,
      eventTarget: candidate.pageNumber > 0 ? candidate.nextEventTarget : null,
      viewState: candidate.pageNumber > 0 ? candidate.viewState : null,
      viewStateGenerator: candidate.pageNumber > 0 ? candidate.viewStateGenerator : null,
      fetchImpl: input.fetchImpl,
      wait: input.wait,
    });
    const expectedPage = candidate.pageNumber + 1;
    if (page.currentPage !== expectedPage) throw new LexCatalogDiscoveryError("LEX_CATALOG_PAGE_SEQUENCE_REJECTED", true);
    if (page.documents.some((document) => document.language !== candidate.language)) {
      throw new LexCatalogDiscoveryError("LEX_CATALOG_LANGUAGE_MISMATCH", false);
    }
    const inserts = page.documents.map((document) => env.DB.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES (?,?,?,?,?) ON CONFLICT(checkpoint_id,source_url) DO NOTHING
    `).bind(candidate.id, document.sourceUrl, document.canonicalDocumentId, document.language, now));
    if (inserts.length > 0) await env.DB.batch(inserts);
    let queued = 0;
    for (const document of page.documents) {
      const result = await enqueueOfficialLexCorpusDocument(env as LegalCorpusQueueEnv, {
        sourceUrl: document.sourceUrl,
        now: nowDate,
        correlationId: candidate.id,
      });
      if (result.created) queued += 1;
    }
    const countRow = await env.DB.prepare(`SELECT count(*) AS count FROM legal_corpus_discovery_documents WHERE checkpoint_id=?`)
      .bind(candidate.id).first<{ count: number }>();
    const discovered = Number(countRow?.count ?? 0);
    const expected = page.expectedDocumentCount ?? candidate.expectedDocumentCount;
    if (page.nextEventTarget === null && expected !== null && discovered < expected) {
      throw new LexCatalogDiscoveryError("LEX_CATALOG_INCOMPLETE_RESULT_SET", true);
    }
    const completed = expected === 0
      || (expected !== null && discovered >= expected)
      || (page.nextEventTarget === null && (expected === null || discovered >= expected));
    const persistedExpected = completed ? (expected ?? discovered) : expected;
    await env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      status=?,page_number=?,expected_document_count=?,discovered_document_count=?,
      next_event_target=?,view_state=?,view_state_generator=?,attempt_count=0,
      next_attempt_at=NULL,last_error_code=NULL,completed_at=?,updated_at=? WHERE id=?
    `).bind(
      completed ? "completed" : "queued", page.currentPage, persistedExpected, discovered,
      completed ? null : page.nextEventTarget, completed ? null : page.viewState,
      completed ? null : page.viewStateGenerator, completed ? now : null, now, candidate.id,
    ).run();
    return {
      claimed: true,
      status: completed ? "category_completed" : "page_completed",
      checkpointId: candidate.id,
      pageNumber: page.currentPage,
      discoveredOnPage: page.documents.length,
      queuedOnPage: queued,
      safeErrorCode: null,
    };
  } catch (error) {
    const code = error instanceof LexCatalogDiscoveryError ? error.code : "LEX_CATALOG_DISCOVERY_FAILED";
    const retryable = error instanceof LexCatalogDiscoveryError && error.retryable && attempt < 5;
    await env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      status=?,next_attempt_at=?,last_error_code=?,updated_at=? WHERE id=?
    `).bind(retryable ? "retrying" : "dead_letter", retryable ? retryAt(nowDate, attempt) : null, code, now, candidate.id).run();
    return {
      claimed: true,
      status: retryable ? "retrying" : "failed",
      checkpointId: candidate.id,
      pageNumber: candidate.pageNumber,
      discoveredOnPage: 0,
      queuedOnPage: 0,
      safeErrorCode: code,
    };
  }
}
