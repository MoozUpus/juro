import { classifyLegalSourceUrl, type LegalSourceReference } from "./source-fetch";

export const LEGAL_SOURCE_DISCOVERY_ERROR_CODES = [
  "LEGAL_SOURCE_DISCOVERY_UNAVAILABLE",
  "LEGAL_SOURCE_DISCOVERY_REDIRECT_REJECTED",
  "LEGAL_SOURCE_DISCOVERY_CONTENT_TYPE_REJECTED",
  "LEGAL_SOURCE_DISCOVERY_TOO_LARGE",
  "LEGAL_SOURCE_DISCOVERY_ENCODING_REJECTED",
  "LEGAL_SOURCE_DISCOVERY_TIMEOUT",
] as const;

export type LegalSourceDiscoveryErrorCode =
  (typeof LEGAL_SOURCE_DISCOVERY_ERROR_CODES)[number];

export class LegalSourceDiscoveryError extends Error {
  constructor(readonly code: LegalSourceDiscoveryErrorCode, readonly retryable: boolean) {
    super(code);
    this.name = "LegalSourceDiscoveryError";
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AdviceSitemapDiscovery = {
  candidates: LegalSourceReference[];
  robotsUrl: string;
  sitemapUrls: string[];
  fetchedAt: string;
};

const USER_AGENT = "JURO-LegalSourceSync/1.0 (+https://juro.uz)";
const ROBOTS_URL = "https://advice.uz/robots.txt";
const MAX_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DOCUMENTS = 20;
const ACCEPT_XML = "application/xml, text/xml;q=0.9, */*;q=0.1";

function isAllowedSitemapUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "advice.uz"
      && url.port === ""
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && (url.pathname === "/sitemap.xml" || /^\/documents_(?:ru|uz)\.xml$/.test(url.pathname));
  } catch {
    return false;
  }
}

function contentType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

async function readText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_TOO_LARGE", false);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_TOO_LARGE", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_ENCODING_REJECTED", false);
  }
}

async function fetchBounded(
  fetchImpl: FetchLike,
  url: string,
  accept: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: accept, "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_REDIRECT_REJECTED", false);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new LegalSourceDiscoveryError(
        "LEGAL_SOURCE_DISCOVERY_UNAVAILABLE",
        response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof LegalSourceDiscoveryError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_TIMEOUT", true);
    }
    throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_UNAVAILABLE", true);
  } finally {
    clearTimeout(timeout);
  }
}

function sitemapLocations(xml: string): string[] {
  const locations: string[] = [];
  const expression = /<loc(?:\s[^>]*)?>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  for (const match of xml.matchAll(expression)) {
    const value = match[1]?.trim();
    if (value) locations.push(value);
  }
  return locations;
}

function robotsSitemaps(robots: string): string[] {
  return robots.split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .flatMap((line) => {
      const match = /^sitemap\s*:\s*(\S+)$/i.exec(line);
      return match?.[1] ? [match[1]] : [];
    });
}

export async function discoverAdviceSitemapDocuments(options: {
  fetchImpl?: FetchLike;
  now?: () => Date;
  maxDocuments?: number;
  timeoutMs?: number;
} = {}): Promise<AdviceSitemapDiscovery> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 100 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("Invalid legal source discovery limits.");
  }
  const robotsResponse = await fetchBounded(fetchImpl, ROBOTS_URL, "text/plain, */*;q=0.1", timeoutMs);
  if (contentType(robotsResponse) !== "text/plain") {
    await robotsResponse.body?.cancel();
    throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_CONTENT_TYPE_REJECTED", false);
  }
  const robots = await readText(robotsResponse, MAX_BYTES);
  const roots = robotsSitemaps(robots).filter(isAllowedSitemapUrl);
  if (roots.length === 0) {
    throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_UNAVAILABLE", false);
  }

  const sitemapUrls: string[] = [];
  const candidates = new Map<string, LegalSourceReference>();
  const pending = [...new Set(roots)];
  while (pending.length > 0 && candidates.size < maxDocuments && sitemapUrls.length < 3) {
    const sitemap = pending.shift()!;
    if (!isAllowedSitemapUrl(sitemap) || sitemapUrls.includes(sitemap)) continue;
    const response = await fetchBounded(fetchImpl, sitemap, ACCEPT_XML, timeoutMs);
    const mediaType = contentType(response);
    if (mediaType !== "application/xml" && mediaType !== "text/xml") {
      await response.body?.cancel();
      throw new LegalSourceDiscoveryError("LEGAL_SOURCE_DISCOVERY_CONTENT_TYPE_REJECTED", false);
    }
    sitemapUrls.push(sitemap);
    for (const location of sitemapLocations(await readText(response, MAX_BYTES))) {
      if (isAllowedSitemapUrl(location) && sitemapUrls.length + pending.length < 3) {
        pending.push(location);
        continue;
      }
      try {
        const source = classifyLegalSourceUrl(location);
        if (source.sourceKind === "advice") candidates.set(source.canonicalUrl, source);
      } catch {
        // Sitemap entries outside JURO's strict source allowlist are ignored.
      }
      if (candidates.size >= maxDocuments) break;
    }
  }
  return {
    candidates: [...candidates.values()],
    robotsUrl: ROBOTS_URL,
    sitemapUrls,
    fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}
