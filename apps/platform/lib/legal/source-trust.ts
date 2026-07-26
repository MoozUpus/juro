const TRUSTED_LEGAL_SOURCE_HOSTS: Readonly<Record<string, "lex" | "advice">> = {
  "lex.uz": "lex",
  "www.lex.uz": "lex",
  "advice.uz": "advice",
  "www.advice.uz": "advice",
};

export type TrustedLegalSourceKind = "lex" | "advice";

export type LegalSourceIdentity = {
  officialUrl: string;
  status?: string | null;
};

export function trustedLegalSourceKind(
  value: string,
): TrustedLegalSourceKind | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
  ) {
    return null;
  }
  return TRUSTED_LEGAL_SOURCE_HOSTS[url.hostname.toLowerCase()] ?? null;
}

export function isTrustedVerifiedLegalSource(
  source: LegalSourceIdentity,
): boolean {
  return source.status === "verified"
    && trustedLegalSourceKind(source.officialUrl) !== null;
}

export function filterTrustedVerifiedLegalSources<
  Source extends LegalSourceIdentity,
>(sources: readonly Source[]): Source[] {
  return sources.filter(isTrustedVerifiedLegalSource);
}
