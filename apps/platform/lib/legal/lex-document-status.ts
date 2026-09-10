import { fetchLegalSource } from "./source-fetch";

/** Read the publisher's document-level banner, never repeal language inside
 * an operative provision (which may repeal a different instrument). */
export function lexDocumentIsRepealed(html: string): boolean {
  const header = html.match(/<header\b[^>]*\bid=["']doc_header["'][^>]*>([\s\S]*?)<\/header>/iu)?.[1];
  if (!header) return false;
  const text = header.replace(/<[^>]+>/gu, " ").replace(/&nbsp;|&#160;/gu, " ")
    .replace(/\s+/gu, " ");
  return /(?:документ\s+утратил\s+силу|hujjat\s+kuchini\s+yo[‘’ʼʻ']?qotgan|ҳужжат\s+кучини\s+йўқотган|document\s+(?:has\s+)?(?:lost\s+(?:its\s+)?force|ceased\s+to\s+be\s+in\s+force))/iu.test(text);
}

const statusCache = new Map<string, { expiresAt: number; current: boolean }>();

/** Cross-check a current indexed document against its official status banner.
 * Only public document status is cached; no question or user data is retained. */
export async function verifyCurrentLexDocument(url: string, signal?: AbortSignal): Promise<boolean> {
  const cached = statusCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.current;
  const fetched = await fetchLegalSource(url, {
    adviceEnabled: false,
    crawlDelayMode: "proceed",
    timeoutMs: 4_000,
    maxBytes: 16 * 1024 * 1024,
    fetchImpl: (input, init) => fetch(input, { ...init,
      signal: signal && init?.signal ? AbortSignal.any([signal, init.signal]) : signal ?? init?.signal }),
  });
  const html = new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes);
  if (!/<header\b[^>]*\bid=["']doc_header["']/iu.test(html)) {
    throw new Error("LEX_DOCUMENT_STATUS_UNAVAILABLE");
  }
  const current = !lexDocumentIsRepealed(html);
  if (statusCache.size >= 256) statusCache.delete(statusCache.keys().next().value!);
  statusCache.set(url, { current, expiresAt: Date.now() + 5 * 60_000 });
  return current;
}
