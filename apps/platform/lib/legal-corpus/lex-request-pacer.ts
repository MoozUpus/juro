type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type RateLimitRow = {
  crawlDelayMs: number;
  lastRequestAt: string | null;
  nextAllowedAt: string;
};

type PersistentRobotsRow = {
  robotsBody: string | null;
  robotsBodyObservedAt: string | null;
};

const LEX_HOST = "lex.uz";
const MAX_CRAWL_DELAY_MS = 60_000;
const MAX_CLAIM_ATTEMPTS = 8;
const MAX_ROBOTS_CACHE_BYTES = 128 * 1024;
const PERSISTENT_ROBOTS_CACHE_MAX_AGE_MS = 5 * 60_000;
const DEFAULT_ROBOTS_CACHE_READ_TIMEOUT_MS = 5_000;

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function observedCrawlDelayMs(value: string): number | null {
  const values = [...value.matchAll(/^\s*crawl-delay\s*:\s*(\d+(?:\.\d+)?)\s*(?:#.*)?$/gimu)]
    .map((match) => Number(match[1]))
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0)
    .map((seconds) => Math.ceil(seconds * 1_000));
  if (values.length === 0) return null;
  return Math.min(MAX_CRAWL_DELAY_MS, Math.max(...values));
}

async function ensureRateLimitRow(db: D1Database, now: string): Promise<void> {
  await db.prepare(`INSERT INTO legal_source_host_rate_limits
      (host,crawl_delay_ms,last_request_at,next_allowed_at,robots_observed_at,updated_at)
    VALUES (?,0,NULL,?,NULL,?)
    ON CONFLICT(host) DO NOTHING`).bind(LEX_HOST, now, now).run();
}

async function claimRequestWindow(input: {
  db: D1Database;
  wait: (delayMs: number) => Promise<void>;
  now: () => Date;
}): Promise<void> {
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const observedAt = input.now();
    const observedIso = observedAt.toISOString();
    await ensureRateLimitRow(input.db, observedIso);
    const row = await input.db.prepare(`SELECT crawl_delay_ms AS crawlDelayMs,
        last_request_at AS lastRequestAt,next_allowed_at AS nextAllowedAt
      FROM legal_source_host_rate_limits WHERE host=? LIMIT 1`)
      .bind(LEX_HOST).first<RateLimitRow>();
    if (!row) throw new Error("LEGAL_SOURCE_RATE_LIMIT_STATE_MISSING");

    const delayMs = Math.max(0, Date.parse(row.nextAllowedAt) - observedAt.getTime());
    if (delayMs > 0) await input.wait(delayMs);

    const claimedAt = input.now();
    const claimedIso = claimedAt.toISOString();
    const intervalMs = Math.max(0, Math.min(MAX_CRAWL_DELAY_MS, Number(row.crawlDelayMs) || 0));
    const nextAllowedAt = new Date(claimedAt.getTime() + intervalMs).toISOString();
    const result = await input.db.prepare(`UPDATE legal_source_host_rate_limits
      SET last_request_at=?,next_allowed_at=?,updated_at=?
      WHERE host=? AND next_allowed_at<=?`).bind(
      claimedIso, nextAllowedAt, claimedIso, LEX_HOST, claimedIso,
    ).run();
    if (Number(result.meta.changes ?? 0) === 1) return;
  }
  throw new Error("LEGAL_SOURCE_RATE_LIMIT_BUSY");
}

async function recordRobotsDelay(input: {
  db: D1Database;
  delayMs: number;
  robotsBody: string;
  now: () => Date;
}): Promise<void> {
  const row = await input.db.prepare(`SELECT crawl_delay_ms AS crawlDelayMs,
      last_request_at AS lastRequestAt,next_allowed_at AS nextAllowedAt
    FROM legal_source_host_rate_limits WHERE host=? LIMIT 1`)
    .bind(LEX_HOST).first<RateLimitRow>();
  if (!row) return;
  const now = input.now().toISOString();
  const boundedDelay = Math.max(0, Math.min(MAX_CRAWL_DELAY_MS, input.delayMs));
  const observedNext = row.lastRequestAt
    ? new Date(Date.parse(row.lastRequestAt) + boundedDelay).toISOString()
    : row.nextAllowedAt;
  const nextAllowedAt = observedNext > row.nextAllowedAt ? observedNext : row.nextAllowedAt;
  await input.db.prepare(`UPDATE legal_source_host_rate_limits
    SET crawl_delay_ms=?,next_allowed_at=?,robots_observed_at=?,robots_body=?,
      robots_body_observed_at=?,updated_at=? WHERE host=?`).bind(
    boundedDelay, nextAllowedAt, now, input.robotsBody, now, now, LEX_HOST,
  ).run();
}

type CachedResponse = {
  body: Uint8Array;
  status: number;
  statusText: string;
  headers: Headers;
};

function responseFromCache(cached: CachedResponse): Response {
  return new Response(cached.body.slice(), {
    status: cached.status,
    statusText: cached.statusText,
    headers: new Headers(cached.headers),
  });
}

function cacheableRobotsText(body: Uint8Array): string | null {
  if (body.byteLength === 0 || body.byteLength > MAX_ROBOTS_CACHE_BYTES) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

/**
 * Caching robots.txt is an optimisation only. A source may send response
 * headers but stall its body, so never let a clone held solely for the cache
 * keep a bounded scheduled crawl alive. The caller still receives the
 * original response and applies the authoritative robots policy itself.
 */
async function readRobotsCacheBytes(
  response: Response,
  timeoutMs: number,
): Promise<Uint8Array | null> {
  let clone: Response;
  try {
    clone = response.clone();
  } catch {
    return null;
  }
  const declared = clone.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_ROBOTS_CACHE_BYTES) {
    void clone.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = clone.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("LEGAL_SOURCE_ROBOTS_CACHE_TIMEOUT")), timeoutMs);
    });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) {
        completed = true;
        break;
      }
      total += value.byteLength;
      if (total > MAX_ROBOTS_CACHE_BYTES) return null;
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    if (completed) reader.releaseLock();
    else void reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function freshPersistentRobotsCache(row: PersistentRobotsRow | null, now: Date): CachedResponse | null {
  if (!row?.robotsBody || !row.robotsBodyObservedAt) return null;
  const observedAt = Date.parse(row.robotsBodyObservedAt);
  const age = now.getTime() - observedAt;
  if (!Number.isFinite(observedAt) || age < 0 || age > PERSISTENT_ROBOTS_CACHE_MAX_AGE_MS) return null;
  const body = new TextEncoder().encode(row.robotsBody);
  if (body.byteLength === 0 || body.byteLength > MAX_ROBOTS_CACHE_BYTES) return null;
  return {
    body,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
  };
}

async function loadPersistentRobotsCache(db: D1Database, now: Date): Promise<CachedResponse | null> {
  const row = await db.prepare(`SELECT robots_body AS robotsBody,
      robots_body_observed_at AS robotsBodyObservedAt
    FROM legal_source_host_rate_limits WHERE host=? LIMIT 1`)
    .bind(LEX_HOST).first<PersistentRobotsRow>();
  return freshPersistentRobotsCache(row, now);
}

export type PacedLexFetchStats = {
  robotsNetworkRequests: number;
  persistentRobotsCacheHits: number;
};

/**
 * Returns one fetch function for a bounded Worker run. Every real Lex.uz
 * request claims a D1-backed host window. robots.txt is fetched once per run,
 * then replayed from memory. A successfully parsed public policy may be
 * replayed by the immediately following run for at most five minutes; it is
 * still parsed and enforced by the caller before every source request. The
 * parsed crawl delay is persisted for the next invocation.
 */
export function createPacedLexFetch(input: {
  db: D1Database;
  wait: (delayMs: number) => Promise<void>;
  fetchImpl?: FetchLike;
  now?: () => Date;
  stats?: PacedLexFetchStats;
  /** Testing hook; production keeps cache reads short and non-blocking. */
  robotsCacheReadTimeoutMs?: number;
}): FetchLike {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  const robotsCacheReadTimeoutMs = input.robotsCacheReadTimeoutMs ?? DEFAULT_ROBOTS_CACHE_READ_TIMEOUT_MS;
  if (!Number.isSafeInteger(robotsCacheReadTimeoutMs) || robotsCacheReadTimeoutMs < 1) {
    throw new TypeError("LEGAL_SOURCE_PACER_ROBOTS_CACHE_TIMEOUT_INVALID");
  }
  let robotsCache: CachedResponse | null = null;

  return async (requestInput, init) => {
    const url = requestUrl(requestInput);
    const isLexHost = url.hostname.toLowerCase() === LEX_HOST
      || url.hostname.toLowerCase() === `www.${LEX_HOST}`;
    if (!isLexHost || url.protocol !== "https:") {
      throw new Error("LEGAL_SOURCE_PACER_URL_REJECTED");
    }
    const isRobots = requestMethod(requestInput, init) === "GET"
      && url.pathname === "/robots.txt"
      && url.search === "";
    if (isRobots && robotsCache) return responseFromCache(robotsCache);
    if (isRobots) {
      const persisted = await loadPersistentRobotsCache(input.db, now());
      if (persisted) {
        robotsCache = persisted;
        if (input.stats) input.stats.persistentRobotsCacheHits += 1;
        return responseFromCache(persisted);
      }
    }

    await claimRequestWindow({ db: input.db, wait: input.wait, now });
    if (isRobots && input.stats) input.stats.robotsNetworkRequests += 1;
    const response = await fetchImpl(requestInput, init);
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
    if (isRobots && response.ok && contentType === "text/plain") {
      const body = await readRobotsCacheBytes(response, robotsCacheReadTimeoutMs);
      const robotsBody = body ? cacheableRobotsText(body) : null;
      if (body && robotsBody !== null) {
        robotsCache = {
          body,
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        };
        const delayMs = observedCrawlDelayMs(robotsBody);
        if (delayMs !== null) await recordRobotsDelay({ db: input.db, delayMs, robotsBody, now });
      }
    }
    return response;
  };
}
