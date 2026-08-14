const TRUSTED_LEGAL_SOURCE_HOSTS: Readonly<Record<string, "lex">> = {
  "lex.uz": "lex",
  "www.lex.uz": "lex",
};

export type TrustedLegalSourceKind = "lex";

export type LegalSourceIdentity = {
  officialUrl: string;
  status?: string | null;
  sourceType?: string | null;
  verificationState?: string | null;
  verifiedAt?: string | null;
  contentSha256?: string | null;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

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
  const kind = trustedLegalSourceKind(source.officialUrl);
  return source.status === "verified"
    && source.verificationState === "verified"
    && kind !== null
    && source.sourceType === kind
    && typeof source.verifiedAt === "string"
    && ISO_UTC.test(source.verifiedAt)
    && typeof source.contentSha256 === "string"
    && SHA256_HEX.test(source.contentSha256);
}

export function filterTrustedVerifiedLegalSources<
  Source extends LegalSourceIdentity,
>(sources: readonly Source[]): Source[] {
  return sources.filter(isTrustedVerifiedLegalSource);
}

/** User-facing legal monitoring is restricted to official Lex.uz records. */
export function isVerifiedLexSource(source: LegalSourceIdentity): boolean {
  return isTrustedVerifiedLegalSource(source)
    && trustedLegalSourceKind(source.officialUrl) === "lex";
}

export function filterVerifiedLexSources<Source extends LegalSourceIdentity>(
  sources: readonly Source[],
): Source[] {
  return sources.filter(isVerifiedLexSource);
}
