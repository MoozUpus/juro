const environmentValues = new Set(["development", "staging", "production"]);
const approvedHosts = new Set(["lex.uz"]);

function crawlWindowName(environment: string, host: string): string {
  return `legal-source-crawl:${environment}:${host}`;
}

/**
 * Atomically reserve an official-source host's robots.txt crawl window. The
 * caller performs the actual request only after this succeeds; no Worker
 * sleeps and no request bypasses a busy window.
 */
export async function reserveLegalSourceCrawlWindow(input: {
  db: D1Database;
  environment: string;
  host: string;
  delayMs: number;
  now: string;
}): Promise<boolean> {
  const host = input.host.toLowerCase();
  const acquiredAt = Date.parse(input.now);
  if (
    !environmentValues.has(input.environment)
    || !approvedHosts.has(host)
    || !Number.isFinite(acquiredAt)
    || !Number.isSafeInteger(input.delayMs)
    || input.delayMs < 1
  ) {
    return false;
  }
  const result = await input.db.prepare(`
    INSERT INTO scheduled_locks (name,holder_id,acquired_at,expires_at,updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET
      holder_id=excluded.holder_id,
      acquired_at=excluded.acquired_at,
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at
    WHERE scheduled_locks.expires_at<=excluded.acquired_at
  `).bind(
    crawlWindowName(input.environment, host),
    crypto.randomUUID(),
    input.now,
    new Date(acquiredAt + input.delayMs).toISOString(),
    input.now,
  ).run();
  return Number(result.meta.changes ?? 0) === 1;
}
