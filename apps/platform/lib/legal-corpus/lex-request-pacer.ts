type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type RateLimitRow = {
  crawlDelayMs: number;
  lastRequestAt: string | null;
  nextAllowedAt: string;
};

const LEX_HOST = "lex.uz";
const MAX_CRAWL_DELAY_MS = 60_000;
const MAX_CLAIM_ATTEMPTS = 8;

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
    SET crawl_delay_ms=?,next_allowed_at=?,robots_observed_at=?,updated_at=?
    WHERE host=?`).bind(boundedDelay, nextAllowedAt, now, now, LEX_HOST).run();
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

/**
 * Returns one fetch function for a bounded Worker run. Every real Lex.uz
 * request claims a D1-backed host window. robots.txt is fetched once per run,
 * then replayed from memory so a ten-document batch still makes only one
 * policy request. The parsed crawl delay is persisted for the next invocation.
 */
export function createPacedLexFetch(input: {
  db: D1Database;
  wait: (delayMs: number) => Promise<void>;
  fetchImpl?: FetchLike;
  now?: () => Date;
}): FetchLike {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
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

    await claimRequestWindow({ db: input.db, wait: input.wait, now });
    const response = await fetchImpl(requestInput, init);
    if (isRobots && response.ok) {
      const clone = response.clone();
      const body = new Uint8Array(await clone.arrayBuffer());
      robotsCache = {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      };
      const delayMs = observedCrawlDelayMs(new TextDecoder().decode(body));
      if (delayMs !== null) await recordRobotsDelay({ db: input.db, delayMs, now });
    }
    return response;
  };
}
