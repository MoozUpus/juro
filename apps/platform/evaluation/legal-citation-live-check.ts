type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export async function verifyPublicCitation(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const initial = new URL(url);
    const sourceHost = initial.hostname.toLowerCase().replace(/^www\./, "");
    if (initial.protocol !== "https:" || !["lex.uz", "advice.uz"].includes(sourceHost)) return false;
    let current = initial;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const currentHost = current.hostname.toLowerCase().replace(/^www\./, "");
      if (current.protocol !== "https:" || currentHost !== sourceHost) return false;
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html,application/xhtml+xml", Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects === 3) return false;
        current = new URL(location, current);
        continue;
      }
      await response.body?.cancel();
      return response.status >= 200 && response.status < 300;
    }
    return false;
  } catch {
    return false;
  }
}
