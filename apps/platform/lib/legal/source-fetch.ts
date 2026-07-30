import { z } from "zod";

const localeSchema = z.enum(["ru", "uz"]);

export type LegalSourceKind = "lex" | "advice";
export type LegalSourceLocale = z.infer<typeof localeSchema>;

export const LEGAL_SOURCE_FETCH_ERROR_CODES = [
  "LEGAL_SOURCE_URL_REJECTED",
  "LEGAL_SOURCE_POLICY_DISABLED",
  "LEGAL_SOURCE_REDIRECT_REJECTED",
  "LEGAL_SOURCE_REDIRECT_LIMIT",
  "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
  "LEGAL_SOURCE_ROBOTS_UNAVAILABLE",
  "LEGAL_SOURCE_ROBOTS_DISALLOWED",
  "LEGAL_SOURCE_ROBOTS_RATE_POLICY",
  "LEGAL_SOURCE_CONTENT_TYPE_REJECTED",
  "LEGAL_SOURCE_EMPTY_CONTENT",
  "LEGAL_SOURCE_TOO_LARGE",
  "LEGAL_SOURCE_ENCODING_REJECTED",
  "LEGAL_SOURCE_TIMEOUT",
] as const;

export type LegalSourceFetchErrorCode =
  (typeof LEGAL_SOURCE_FETCH_ERROR_CODES)[number];

export class LegalSourceFetchError extends Error {
  constructor(
    readonly code: LegalSourceFetchErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "LegalSourceFetchError";
  }
}

export type LegalSourceReference = {
  sourceKind: LegalSourceKind;
  locale: LegalSourceLocale;
  canonicalId: string;
  canonicalUrl: string;
  host: string;
};

export type FetchedLegalSource = LegalSourceReference & {
  bytes: Uint8Array;
  contentSha256: string;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
  robotsUrl: string;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type FetchOptions = {
  adviceEnabled: boolean;
  fetchImpl?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  wait?: (delayMs: number) => Promise<void>;
};

type RobotsRule = {
  allow: boolean;
  pattern: string;
};

type RobotsGroup = {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
};

const SOURCE_USER_AGENT =
  "JURO-LegalSourceBot/0.1 (+https://juro.uz/legal-sources)";
const SOURCE_USER_AGENT_TOKEN = "juro-legalsourcebot";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const ROBOTS_MAX_BYTES = 128 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;
const MAX_ROBOTS_CRAWL_DELAY_SECONDS = 60;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function sourceHostKind(hostname: string): LegalSourceKind | null {
  const host = hostname.toLowerCase();
  if (host === "lex.uz" || host === "www.lex.uz") return "lex";
  if (host === "advice.uz" || host === "www.advice.uz") return "advice";
  return null;
}

function parseSourcePath(url: URL, sourceKind: LegalSourceKind): {
  locale: LegalSourceLocale;
  canonicalId: string;
} | null {
  const pattern = sourceKind === "lex"
    ? /^\/(ru|uz)\/docs\/(-?\d+)\/?$/
    : /^\/(ru|uz)\/questions\/(\d+)\/?$/;
  const match = pattern.exec(url.pathname);
  if (!match) return null;
  const locale = localeSchema.safeParse(match[1]);
  if (!locale.success || !match[2]) return null;
  return { locale: locale.data, canonicalId: match[2] };
}

export function classifyLegalSourceUrl(value: string): LegalSourceReference {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LegalSourceFetchError("LEGAL_SOURCE_URL_REJECTED", false);
  }

  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.search !== ""
  ) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_URL_REJECTED", false);
  }

  const sourceKind = sourceHostKind(url.hostname);
  if (!sourceKind) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_URL_REJECTED", false);
  }
  const path = parseSourcePath(url, sourceKind);
  if (!path) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_URL_REJECTED", false);
  }

  const canonicalHost = sourceKind === "lex" ? "lex.uz" : "advice.uz";
  const canonicalPath = sourceKind === "lex"
    ? `/${path.locale}/docs/${path.canonicalId}`
    : `/${path.locale}/questions/${path.canonicalId}`;
  return {
    sourceKind,
    locale: path.locale,
    canonicalId: path.canonicalId,
    canonicalUrl: `https://${canonicalHost}${canonicalPath}`,
    host: canonicalHost,
  };
}

function sameSourceReference(
  expected: LegalSourceReference,
  candidate: LegalSourceReference,
): boolean {
  return expected.sourceKind === candidate.sourceKind
    && expected.locale === candidate.locale
    && expected.canonicalId === candidate.canonicalId;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation is best effort after a rejected response.
  }
}

function timeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(handle),
  };
}

async function fetchOnce(
  fetchImpl: FetchLike,
  url: URL,
  timeoutMs: number,
  accept: string,
): Promise<Response> {
  const timeout = timeoutSignal(timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: accept,
        "User-Agent": SOURCE_USER_AGENT,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (
      timeout.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new LegalSourceFetchError("LEGAL_SOURCE_TIMEOUT", true);
    }
    throw new LegalSourceFetchError("LEGAL_SOURCE_UPSTREAM_UNAVAILABLE", true);
  } finally {
    timeout.clear();
  }
}

async function fetchFollowingRedirects(
  initialUrl: URL,
  options: {
    fetchImpl: FetchLike;
    timeoutMs: number;
    maxRedirects: number;
    accept: string;
    validateUrl: (url: URL) => boolean;
    unavailableCode:
      | "LEGAL_SOURCE_ROBOTS_UNAVAILABLE"
      | "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE";
  },
): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = initialUrl;
  for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
    const response = await fetchOnce(
      options.fetchImpl,
      currentUrl,
      options.timeoutMs,
      options.accept,
    );
    if (!REDIRECT_STATUSES.has(response.status)) {
      if (!response.ok) {
        await cancelBody(response);
        const retryable = response.status === 408
          || response.status === 425
          || response.status === 429
          || response.status >= 500;
        throw new LegalSourceFetchError(options.unavailableCode, retryable);
      }
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    await cancelBody(response);
    if (!location) {
      throw new LegalSourceFetchError("LEGAL_SOURCE_REDIRECT_REJECTED", false);
    }
    if (redirects === options.maxRedirects) {
      throw new LegalSourceFetchError("LEGAL_SOURCE_REDIRECT_LIMIT", false);
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new LegalSourceFetchError("LEGAL_SOURCE_REDIRECT_REJECTED", false);
    }
    if (!options.validateUrl(nextUrl)) {
      throw new LegalSourceFetchError("LEGAL_SOURCE_REDIRECT_REJECTED", false);
    }
    currentUrl = nextUrl;
  }
  throw new LegalSourceFetchError("LEGAL_SOURCE_REDIRECT_LIMIT", false);
}

function responseContentType(response: Response): {
  mediaType: string;
  charset: string | null;
  raw: string;
} {
  const raw = response.headers.get("content-type")?.trim() ?? "";
  const [mediaTypePart = "", ...parameters] = raw.split(";");
  let charset: string | null = null;
  for (const parameter of parameters) {
    const [name, value] = parameter.trim().split("=", 2);
    if (name?.toLowerCase() === "charset" && value) {
      charset = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
    }
  }
  return { mediaType: mediaTypePart.trim().toLowerCase(), charset, raw };
}

async function readBoundedBytes(
  response: Response,
  maxBytes: number,
  timeoutMs: number,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await cancelBody(response);
    throw new LegalSourceFetchError("LEGAL_SOURCE_TOO_LARGE", false);
  }
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          const timeoutHandle = setTimeout(() => {
            reject(new LegalSourceFetchError("LEGAL_SOURCE_TIMEOUT", true));
          }, timeoutMs);
          reader.read().then(
            (result) => {
              clearTimeout(timeoutHandle);
              resolve(result);
            },
            () => {
              clearTimeout(timeoutHandle);
              reject(new LegalSourceFetchError(
                "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
                true,
              ));
            },
          );
        },
      );
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new LegalSourceFetchError("LEGAL_SOURCE_TOO_LARGE", false);
      }
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Cancellation is best effort after a body read failure.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LegalSourceFetchError("LEGAL_SOURCE_ENCODING_REJECTED", false);
  }
}

function parseRobots(value: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let hasDirectives = false;

  for (const rawLine of value.split(/\r?\n/)) {
    const withoutComment = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!withoutComment) {
      if (current && hasDirectives) {
        current = null;
        hasDirectives = false;
      }
      continue;
    }
    const separator = withoutComment.indexOf(":");
    if (separator <= 0) continue;
    const key = withoutComment.slice(0, separator).trim().toLowerCase();
    const directive = withoutComment.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!current || hasDirectives) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
        hasDirectives = false;
      }
      current.agents.push(directive.toLowerCase());
      continue;
    }
    if (!current || current.agents.length === 0) continue;
    if (key === "allow" || key === "disallow") {
      hasDirectives = true;
      if (key === "disallow" && directive === "") continue;
      current.rules.push({ allow: key === "allow", pattern: directive });
      continue;
    }
    if (key === "crawl-delay") {
      hasDirectives = true;
      const seconds = Number(directive);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelay = seconds;
      }
    }
  }
  return groups;
}

function selectedRobotsGroups(groups: RobotsGroup[]): RobotsGroup[] {
  const exact = groups.filter((group) =>
    group.agents.includes(SOURCE_USER_AGENT_TOKEN)
  );
  if (exact.length > 0) return exact;
  return groups.filter((group) => group.agents.includes("*"));
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function robotsPattern(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = escapeRegex(body).replaceAll("*", ".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`);
}

function robotsAllows(groups: RobotsGroup[], url: URL): {
  allowed: boolean;
  crawlDelay: number;
} {
  const selected = selectedRobotsGroups(groups);
  if (selected.length === 0) return { allowed: true, crawlDelay: 0 };
  const target = `${url.pathname}${url.search}`;
  const matchingRules = selected.flatMap((group) => group.rules)
    .filter((rule) => robotsPattern(rule.pattern).test(target))
    .sort((left, right) => {
      const specificity = (value: string) =>
        value.replaceAll("*", "").replace(/\$$/, "").length;
      const difference = specificity(right.pattern) - specificity(left.pattern);
      if (difference !== 0) return difference;
      return Number(right.allow) - Number(left.allow);
    });
  const crawlDelay = Math.max(
    0,
    ...selected.map((group) => group.crawlDelay ?? 0),
  );
  return { allowed: matchingRules[0]?.allow ?? true, crawlDelay };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function fetchLegalSource(
  value: string,
  options: FetchOptions,
): Promise<FetchedLegalSource> {
  const reference = classifyLegalSourceUrl(value);
  if (reference.sourceKind === "advice" && !options.adviceEnabled) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_POLICY_DISABLED", false);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (
    timeoutMs < 1 || maxBytes < 1 || maxRedirects < 0
    || !Number.isSafeInteger(timeoutMs)
    || !Number.isSafeInteger(maxBytes)
    || !Number.isSafeInteger(maxRedirects)
  ) {
    throw new TypeError("Invalid legal source fetch limits.");
  }

  const robotsInitialUrl = new URL(`https://${reference.host}/robots.txt`);
  const robotsResult = await fetchFollowingRedirects(robotsInitialUrl, {
    fetchImpl,
    timeoutMs,
    maxRedirects,
    accept: "text/plain, */*;q=0.1",
    unavailableCode: "LEGAL_SOURCE_ROBOTS_UNAVAILABLE",
    validateUrl(candidate) {
      return candidate.protocol === "https:"
        && candidate.port === ""
        && candidate.username === ""
        && candidate.password === ""
        && sourceHostKind(candidate.hostname) === reference.sourceKind
        && candidate.pathname === "/robots.txt"
        && candidate.search === ""
        && candidate.hash === "";
    },
  });
  const robotsType = responseContentType(robotsResult.response);
  if (
    robotsType.mediaType !== "text/plain"
    || (robotsType.charset && !["utf-8", "utf8"].includes(robotsType.charset))
  ) {
    await cancelBody(robotsResult.response);
    throw new LegalSourceFetchError("LEGAL_SOURCE_ROBOTS_UNAVAILABLE", false);
  }
  const robotsBytes = await readBoundedBytes(
    robotsResult.response,
    ROBOTS_MAX_BYTES,
    timeoutMs,
  );
  const robots = robotsAllows(
    parseRobots(decodeUtf8(robotsBytes)),
    new URL(reference.canonicalUrl),
  );
  if (!robots.allowed) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_ROBOTS_DISALLOWED", false);
  }
  if (robots.crawlDelay > MAX_ROBOTS_CRAWL_DELAY_SECONDS) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_ROBOTS_RATE_POLICY", false);
  }
  if (robots.crawlDelay > 0) {
    const wait = options.wait ?? ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
    await wait(Math.ceil(robots.crawlDelay * 1_000));
  }

  const contentResult = await fetchFollowingRedirects(
    new URL(reference.canonicalUrl),
    {
      fetchImpl,
      timeoutMs,
      maxRedirects,
      accept: "text/html;charset=UTF-8",
      unavailableCode: "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
      validateUrl(candidate) {
        if (
          candidate.protocol !== "https:"
          || candidate.port !== ""
          || candidate.username !== ""
          || candidate.password !== ""
          || candidate.search !== ""
          || candidate.hash !== ""
        ) return false;
        try {
          return sameSourceReference(reference, classifyLegalSourceUrl(candidate.href));
        } catch {
          return false;
        }
      },
    },
  );
  const contentReference = classifyLegalSourceUrl(contentResult.finalUrl.href);
  if (!sameSourceReference(reference, contentReference)) {
    await cancelBody(contentResult.response);
    throw new LegalSourceFetchError("LEGAL_SOURCE_REDIRECT_REJECTED", false);
  }
  const contentType = responseContentType(contentResult.response);
  if (
    contentType.mediaType !== "text/html"
    || (contentType.charset && !["utf-8", "utf8"].includes(contentType.charset))
  ) {
    await cancelBody(contentResult.response);
    throw new LegalSourceFetchError(
      "LEGAL_SOURCE_CONTENT_TYPE_REJECTED",
      false,
    );
  }

  const bytes = await readBoundedBytes(
    contentResult.response,
    maxBytes,
    timeoutMs,
  );
  if (bytes.byteLength === 0) {
    throw new LegalSourceFetchError("LEGAL_SOURCE_EMPTY_CONTENT", false);
  }
  decodeUtf8(bytes);
  return {
    ...reference,
    canonicalUrl: contentReference.canonicalUrl,
    bytes,
    contentSha256: await sha256(bytes),
    contentType: contentType.raw || "text/html; charset=utf-8",
    etag: contentResult.response.headers.get("etag"),
    lastModified: contentResult.response.headers.get("last-modified"),
    fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
    robotsUrl: robotsResult.finalUrl.href,
  };
}
