const blockedHostSuffixes = [
  ".internal", ".invalid", ".local", ".localhost", ".onion", ".test", ".example",
];

const sensitiveQueryParameter = /^(?:access_token|auth|authorization|credential|password|secret|signature|token|api[-_]?key|x-amz-.+|x-goog-.+)$/iu;

function literalIp(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(":");
}

/** Canonicalizes provider-observed public HTTPS citation URLs. */
export function canonicalSecondaryInternetUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase().replace(/\.$/u, "");
    if (
      url.protocol !== "https:"
      || Boolean(url.username || url.password || (url.port && url.port !== "443"))
      || !hostname.includes(".")
      || literalIp(hostname)
      || blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix))
      || hostname === "lex.uz"
      || hostname === "www.lex.uz"
      || [...url.searchParams.keys()].some((name) => sensitiveQueryParameter.test(name))
    ) return null;
    url.hostname = hostname;
    url.port = "";
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid)$/iu.test(name)) url.searchParams.delete(name);
    }
    return url.toString();
  } catch {
    return null;
  }
}
