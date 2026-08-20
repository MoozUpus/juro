import type { LegalSourceContext } from "../ai/provider";
import {
  searchUserDocumentEvidence,
  type UserDocumentSearchEvidence,
  type UserDocumentVectorEnv,
} from "./user-document-vectors";
import { privateDocumentLocator } from "./private-document-locator";

export type TrustedUserDocumentEvidence = {
  sourceId: string;
  sourceKind: "internal";
  canonicalLocator: string;
  contentSha256: string;
  retrievedAt: string;
  validatedAt: string;
  validationStatus: "validated";
};

export type TrustedUserDocumentRetrieval = {
  sources: LegalSourceContext[];
  evidence: TrustedUserDocumentEvidence[];
  errors: Array<{ code: string }>;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sourceLocale(value: UserDocumentSearchEvidence["language"], fallback: "ru" | "uz"): "ru" | "uz" {
  if (value === "ru" || value === "uz") return value;
  return fallback;
}

async function toContext(
  item: UserDocumentSearchEvidence,
  locale: "ru" | "uz",
  retrievedAt: string,
): Promise<LegalSourceContext> {
  const locator = privateDocumentLocator(item.id);
  const spanText = item.snippet.trim().slice(0, 3_200);
  return {
    id: `private:${item.id}`,
    actTitle: item.title.slice(0, 500),
    actIdentifier: null,
    officialUrl: locator,
    revisionDate: item.uploadedAt,
    lastCheckedAt: retrievedAt,
    locale: sourceLocale(item.language, locale),
    publishedAt: item.uploadedAt,
    sourceType: "internal",
    status: "user_supplied",
    verificationState: "user_supplied",
    verifiedAt: retrievedAt,
    contentSha256: item.sourceHash,
    article: null,
    excerpt: spanText.slice(0, 1_200),
    effectiveDate: null,
    applicabilityStatus: "current",
    documentType: "uploaded_document",
    documentNumber: null,
    adoptingAuthority: null,
    sourceClass: "USER_TRUSTED_PRIVATE",
    spans: [{
      id: `${item.id}:span`,
      article: null,
      paragraph: item.page ? `page:${item.page}` : null,
      text: spanText,
      textSha256: await sha256(spanText),
      quality: "high",
    }],
    sourceQuality: {
      passed: true,
      title: item.title.trim().length > 0,
      sufficientText: spanText.length > 0,
      clean: true,
      locale: true,
      canonicalUrl: true,
      structured: true,
    },
  };
}

export async function retrieveTrustedUserDocumentSources(
  env: UserDocumentVectorEnv,
  input: {
    workspaceId: string;
    userId: string;
    query: string;
    locale: "ru" | "uz";
    limit?: number;
  },
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; now?: Date } = {},
): Promise<TrustedUserDocumentRetrieval> {
  const retrievedAt = (options.now ?? new Date()).toISOString();
  const evidence = await searchUserDocumentEvidence(env, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    query: input.query,
    limit: Math.min(Math.max(input.limit ?? 3, 1), 4),
  }, {
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
  const sources = await Promise.all(evidence.map((item) => toContext(item, input.locale, retrievedAt)));
  return {
    sources,
    evidence: sources.map((source) => ({
      sourceId: source.id,
      sourceKind: "internal",
      canonicalLocator: source.officialUrl,
      contentSha256: source.contentSha256,
      retrievedAt: source.lastCheckedAt,
      validatedAt: source.verifiedAt,
      validationStatus: "validated",
    })),
    errors: [],
  };
}
