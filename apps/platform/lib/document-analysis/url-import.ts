import dns from "node:dns";
import { z } from "zod";
import { sanitizeFileName } from "../document-builder/storage/file-validation";
import { arrayBufferHex, DOCUMENT_ANALYSIS_MAX_FILE_SIZE } from "./upload-pipeline";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 12_000;
const blockedHostSuffixes = [".internal", ".invalid", ".local", ".localhost", ".onion", ".test", ".example"];
const mimeExtensions = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["application/zip", "zip"],
]);

export const publicDocumentUrlIntentSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  locale: z.enum(["ru", "uz"]),
  mode: z.enum(["quick", "full", "expert"]).default("quick"),
  caseId: z.string().uuid().nullable().optional().default(null),
  consent: z.literal(true),
}).strict();

export type PublicDocumentUrlIntent = z.infer<typeof publicDocumentUrlIntentSchema>;
export type PublicDocumentResolver = (hostname: string) => Promise<string[]>;
export type PublicDocumentFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type StoredPublicDocument = {
  temporaryKey: string;
  canonicalUrl: string;
  sourceOrigin: string;
  sourceUrlSha256: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export class PublicDocumentUrlError extends Error {
  constructor(
    public readonly code:
      | "INVALID_URL"
      | "URL_TARGET_BLOCKED"
      | "URL_UNAVAILABLE"
      | "URL_REDIRECT_LIMIT"
      | "URL_FILE_TOO_LARGE"
      | "URL_CONTENT_TYPE_UNSUPPORTED"
      | "URL_INTEGRITY_FAILED",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PublicDocumentUrlError";
  }
}

export function parsePublicDocumentUrlIntent(value: unknown): PublicDocumentUrlIntent {
  const parsed = publicDocumentUrlIntentSchema.safeParse(value);
  if (!parsed.success) throw new PublicDocumentUrlError("INVALID_URL", "Проверьте публичную ссылку и параметры анализа.", 400);
  return { ...parsed.data, url: canonicalPublicUrl(parsed.data.url).toString() };
}

export function canonicalPublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicDocumentUrlError("INVALID_URL", "Укажите корректную публичную HTTPS-ссылку.", 400);
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
    throw new PublicDocumentUrlError("URL_TARGET_BLOCKED", "Разрешены только публичные HTTPS-ссылки на стандартном порту.", 400);
  }
  if (url.username || url.password) {
    throw new PublicDocumentUrlError("URL_TARGET_BLOCKED", "Ссылки со встроенными учётными данными не поддерживаются.", 400);
  }
  if ([...url.searchParams.keys()].some((name) => /^(?:access_token|auth|authorization|credential|password|secret|signature|token|api[-_]?key|x-amz-.+|x-goog-.+)$/i.test(name))) {
    throw new PublicDocumentUrlError("URL_TARGET_BLOCKED", "Подписанные ссылки и учётные данные в параметрах не поддерживаются.", 400);
  }
  url.hash = "";
  const hostname = url.hostname.toLocaleLowerCase().replace(/\.$/, "");
  if (!hostname || !hostname.includes(".") || hostname === "localhost" || blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new PublicDocumentUrlError("URL_TARGET_BLOCKED", "Локальный или непубличный адрес заблокирован.", 400);
  }
  if (parseIpv4(hostname) || parseIpv6(hostname.replace(/^\[|\]$/g, ""))) {
    throw new PublicDocumentUrlError("URL_TARGET_BLOCKED", "Прямые IP-адреса не поддерживаются.", 400);
  }
  url.hostname = hostname;
  return url;
}

export async function assertPublicUrlTarget(url: URL, resolver: PublicDocumentResolver = resolvePublicAddresses): Promise<void> {
  const addresses = await resolver(url.hostname).catch(() => []);
  if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address))) {
    throw new PublicDocumentUrlError("URL_TARGET_BLOCKED", "Адрес ссылки не прошёл проверку публичной сети.", 400);
  }
}

export async function fetchPublicDocumentToQuarantine(input: {
  bucket: R2Bucket;
  workspaceId: string;
  userId: string;
  url: string;
  fetcher?: PublicDocumentFetcher;
  resolver?: PublicDocumentResolver;
}): Promise<StoredPublicDocument> {
  const fetcher = input.fetcher ?? fetch;
  const resolver = input.resolver ?? resolvePublicAddresses;
  let current = canonicalPublicUrl(input.url);
  let response: Response | null = null;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrlTarget(current, resolver);
    response = await timedFetch(fetcher, current);
    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new PublicDocumentUrlError("URL_UNAVAILABLE", "Источник вернул некорректное перенаправление.", 422);
      if (redirect === MAX_REDIRECTS) throw new PublicDocumentUrlError("URL_REDIRECT_LIMIT", "Ссылка содержит слишком много перенаправлений.", 422);
      current = canonicalPublicUrl(new URL(location, current).toString());
      continue;
    }
    break;
  }

  if (!response || !response.ok || !response.body) {
    await response?.body?.cancel();
    throw new PublicDocumentUrlError("URL_UNAVAILABLE", "Публичный файл временно недоступен.", 422);
  }
  await assertPublicUrlTarget(current, resolver);
  const encoding = response.headers.get("content-encoding")?.trim().toLocaleLowerCase();
  if (encoding && encoding !== "identity") {
    await response.body.cancel();
    throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Сжатый HTTP-ответ нельзя безопасно проверить по размеру.", 422);
  }
  const sizeBytes = Number(response.headers.get("content-length"));
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > DOCUMENT_ANALYSIS_MAX_FILE_SIZE) {
    await response.body.cancel();
    throw new PublicDocumentUrlError("URL_FILE_TOO_LARGE", "Источник должен сообщить размер файла от 1 байта до 50 МБ.", 422);
  }
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "";
  const extension = mimeExtensions.get(mimeType);
  if (!extension) {
    await response.body.cancel();
    throw new PublicDocumentUrlError("URL_CONTENT_TYPE_UNSUPPORTED", "Ссылка должна вести на PDF, DOCX, JPG, PNG или ZIP.", 415);
  }
  const fileName = remoteFileName(current, response.headers.get("content-disposition"), extension);
  const temporaryKey = `url-import-v1/${input.workspaceId}/${crypto.randomUUID()}`;
  let stored: R2Object | null;
  try {
    stored = await input.bucket.put(temporaryKey, response.body, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" },
      customMetadata: { workspaceId: input.workspaceId, ownerUserId: input.userId, lifecycle: "url-import-temporary" },
    });
  } catch {
    await input.bucket.delete(temporaryKey).catch(() => undefined);
    throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Файл не удалось безопасно сохранить в приватный карантин.", 422);
  }
  const sha256 = stored ? arrayBufferHex(stored.checksums.sha256) : null;
  if (!stored || stored.size !== sizeBytes || !sha256) {
    await input.bucket.delete(temporaryKey);
    throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Размер или контрольная сумма полученного файла не подтверждены.", 422);
  }
  return {
    temporaryKey,
    canonicalUrl: current.toString(),
    sourceOrigin: current.origin,
    sourceUrlSha256: await sha256Text(current.toString()),
    fileName,
    mimeType,
    sizeBytes,
    sha256,
  };
}

export function isPublicIpAddress(address: string): boolean {
  // Treat every IPv4-mapped IPv6 address as non-public. This closes an
  // alternate textual form for private/metadata IPv4 targets without relying
  // on a resolver to normalize the embedded address first.
  if (/^::ffff:/i.test(address.split("%")[0])) return false;
  const ipv4 = parseIpv4(address);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113));
  }
  const ipv6 = parseIpv6(address);
  if (!ipv6) return false;
  const first = (ipv6[0] << 8) | ipv6[1];
  if (first < 0x2000 || first > 0x3fff) return false;
  if (ipv6[0] === 0x20 && ipv6[1] === 0x01 && ipv6[2] === 0x0d && ipv6[3] === 0xb8) return false;
  if (ipv6[0] === 0x20 && ipv6[1] === 0x02) return false;
  return true;
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const [v4, v6] = await Promise.all([
    dns.promises.resolve4(hostname).catch(() => []),
    dns.promises.resolve6(hostname).catch(() => []),
  ]);
  return [...v4, ...v6];
}

async function timedFetch(fetcher: PublicDocumentFetcher, url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetcher(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        accept: "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,application/zip",
        "accept-encoding": "identity",
      },
    });
  } catch {
    throw new PublicDocumentUrlError("URL_UNAVAILABLE", "Публичный файл не ответил вовремя.", 422);
  } finally {
    clearTimeout(timer);
  }
}

function remoteFileName(url: URL, disposition: string | null, extension: string): string {
  const dispositionName = disposition?.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1];
  const pathName = url.pathname.split("/").filter(Boolean).at(-1);
  let candidate = decodeURIComponentSafely(dispositionName ?? pathName ?? `document.${extension}`);
  candidate = sanitizeFileName(candidate);
  const suffix = candidate.split(".").at(-1)?.toLocaleLowerCase();
  if (suffix !== extension && !(extension === "jpg" && suffix === "jpeg")) candidate = `${candidate}.${extension}`;
  return sanitizeFileName(candidate).slice(0, 240);
}

function decodeURIComponentSafely(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
}

function parseIpv6(value: string): Uint8Array | null {
  const normalized = value.toLocaleLowerCase().split("%")[0];
  if (!normalized.includes(":")) return null;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[a-f0-9]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right].map((part) => Number.parseInt(part, 16));
  if (groups.length !== 8) return null;
  return Uint8Array.from(groups.flatMap((group) => [group >> 8, group & 0xff]));
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
