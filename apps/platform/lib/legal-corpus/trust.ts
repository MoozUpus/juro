import { z } from "zod";

export const legalCorpusSourceClassSchema = z.enum([
  "OFFICIAL_LEGISLATION",
  "OFFICIAL_GOVERNMENT_GUIDANCE",
  "OWNER_TRUSTED_GLOBAL",
  "TENANT_TRUSTED_PRIVATE",
  "USER_TRUSTED_PRIVATE",
  "DERIVED_TRANSLATION",
  "SECONDARY_REFERENCE",
]);

export const legalCorpusLanguageSchema = z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]);
export const legalCorpusScopeSchema = z.enum(["global", "tenant", "user"]);

export type LegalCorpusSourceClass = z.infer<typeof legalCorpusSourceClassSchema>;
export type LegalCorpusLanguage = z.infer<typeof legalCorpusLanguageSchema>;
export type LegalCorpusScope = z.infer<typeof legalCorpusScopeSchema>;

export type LegalCorpusTrustProfile = {
  provider: "lex_uz" | "juro_owner" | "tenant_upload" | "user_upload";
  sourceClass: LegalCorpusSourceClass;
  scope: LegalCorpusScope;
  visibility: "global" | "tenant" | "private";
  trusted: true;
  verificationStatus:
    | "official_source"
    | "official_live_source"
    | "owner_approved"
    | "tenant_supplied"
    | "user_supplied";
  approvalRequired: false;
  tenantId: string | null;
  ownerUserId: string | null;
  matterId: string | null;
};

const identifier = z.string().trim().min(1).max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);

function isOfficialLexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
      && /^\/(?:ru|uz|uzc)\/docs\/-?\d+/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function autoTrustLexSource(input: {
  officialUrl: string;
  live?: boolean;
}): LegalCorpusTrustProfile {
  if (!isOfficialLexUrl(input.officialUrl)) {
    throw new TypeError("LEGAL_CORPUS_OFFICIAL_URL_REJECTED");
  }
  return {
    provider: "lex_uz",
    sourceClass: "OFFICIAL_LEGISLATION",
    scope: "global",
    visibility: "global",
    trusted: true,
    verificationStatus: input.live ? "official_live_source" : "official_source",
    approvalRequired: false,
    tenantId: null,
    ownerUserId: null,
    matterId: null,
  };
}

export function autoTrustOwnerUpload(input: {
  ownerUserId: string;
  tenantId?: string | null;
  matterId?: string | null;
}): LegalCorpusTrustProfile {
  const ownerUserId = identifier.parse(input.ownerUserId);
  const tenantId = input.tenantId ? identifier.parse(input.tenantId) : null;
  const matterId = input.matterId ? identifier.parse(input.matterId) : null;
  return {
    provider: tenantId ? "tenant_upload" : "juro_owner",
    sourceClass: tenantId ? "TENANT_TRUSTED_PRIVATE" : "OWNER_TRUSTED_GLOBAL",
    scope: tenantId ? "tenant" : "global",
    visibility: tenantId ? "tenant" : "global",
    trusted: true,
    verificationStatus: tenantId ? "tenant_supplied" : "owner_approved",
    approvalRequired: false,
    tenantId,
    ownerUserId: tenantId ? ownerUserId : null,
    matterId,
  };
}

export function autoTrustUserUpload(input: {
  ownerUserId: string;
  tenantId?: string | null;
  matterId?: string | null;
}): LegalCorpusTrustProfile {
  return {
    provider: "user_upload",
    sourceClass: "USER_TRUSTED_PRIVATE",
    scope: "user",
    visibility: "private",
    trusted: true,
    verificationStatus: "user_supplied",
    approvalRequired: false,
    tenantId: input.tenantId ? identifier.parse(input.tenantId) : null,
    ownerUserId: identifier.parse(input.ownerUserId),
    matterId: input.matterId ? identifier.parse(input.matterId) : null,
  };
}

export function canAccessCorpusScope(input: {
  source: Pick<LegalCorpusTrustProfile, "scope" | "tenantId" | "ownerUserId" | "matterId">;
  tenantId?: string | null;
  userId?: string | null;
  matterId?: string | null;
}): boolean {
  if (input.source.scope === "global") return true;
  if (input.source.scope === "tenant") {
    return Boolean(input.tenantId && input.source.tenantId === input.tenantId);
  }
  return Boolean(
    input.userId
    && input.source.ownerUserId === input.userId
    && (!input.source.tenantId || input.source.tenantId === input.tenantId)
    && (!input.source.matterId || input.source.matterId === input.matterId),
  );
}

export const LEGAL_CORPUS_FEATURE_FLAGS = [
  "LEGAL_CORPUS_ENABLED",
  "LEGAL_CORPUS_LIVE_LEXUZ_ENABLED",
  "LEGAL_CORPUS_AUTO_INGEST_ENABLED",
  "LEGAL_CORPUS_MULTILINGUAL_ENABLED",
  "LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST",
  "LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST",
  "LEGAL_CORPUS_HISTORICAL_ENABLED",
  "LEGAL_CORPUS_SHADOW_MODE",
] as const;

export type LegalCorpusFeatureFlag = (typeof LEGAL_CORPUS_FEATURE_FLAGS)[number];

export function featureEnabled(
  env: Partial<Record<LegalCorpusFeatureFlag, string | undefined>>,
  name: LegalCorpusFeatureFlag,
): boolean {
  return env[name] === "true";
}
