import { classifyLegalSourceUrl } from "../lib/legal/source-fetch";

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

function exactReference(value: string) {
  const reference = classifyLegalSourceUrl(value);
  return reference.canonicalUrl === value ? reference : null;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Existence checking is complete; cancellation is best effort.
  }
}

export async function verifyPublicCitation(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const expected = exactReference(url);
    if (!expected) return false;
    let current = new URL(expected.canonicalUrl);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const candidate = classifyLegalSourceUrl(current.href);
      if (
        candidate.sourceKind !== expected.sourceKind
        || candidate.locale !== expected.locale
        || candidate.canonicalId !== expected.canonicalId
        || candidate.canonicalUrl !== expected.canonicalUrl
      ) return false;
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "text/html,application/xhtml+xml", Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await cancelBody(response);
        if (!location || redirects === 3) return false;
        current = new URL(location, current);
        continue;
      }
      const mediaType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]?.trim().toLowerCase();
      await cancelBody(response);
      return response.status >= 200
        && response.status < 300
        && (mediaType === "text/html" || mediaType === "application/xhtml+xml");
    }
    return false;
  } catch {
    return false;
  }
}
