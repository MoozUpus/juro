import {
  appLegalContent,
  type AppLegalSlug,
  type LegalDocument,
} from "../../content/app-legal";
import { sha256 } from "../auth/crypto";

export type PolicyLocale = "ru" | "uz";
export type PolicyStatus = "draft" | "approved" | "superseded";
export type PolicyDocumentKey =
  | "terms"
  | "privacy-policy"
  | "cookies-policy"
  | "ai-usage-rules"
  | "personal-data-processing";

type PolicyDefinition = {
  slug: AppLegalSlug;
  documentKey: PolicyDocumentKey;
  documentVersion: string;
  status: PolicyStatus;
  mandatoryAtRegistration: boolean;
  contentSha256: Record<PolicyLocale, string>;
};

export type VerifiedPolicyDocument = {
  id: string;
  slug: AppLegalSlug;
  documentKey: PolicyDocumentKey;
  documentVersion: string;
  locale: PolicyLocale;
  contentSha256: string;
  status: PolicyStatus;
  mandatoryAtRegistration: boolean;
  content: LegalDocument;
};

export const MARKETING_CONSENT_VERSION = "2026-07-26.1";

const POLICY_VERSION = "2026-07-26.draft.1";

const policyDefinitions = [
  {
    slug: "terms",
    documentKey: "terms",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "bee1ea543edf4d2ed79025cfaeafb17440640a5c9038855b1e38dccf0d3d0ad1",
      uz: "ac71dc79fb7bf5c44447ceda68b01b46a831a51c0403211e276c495fe2f9b6aa",
    },
  },
  {
    slug: "privacy",
    documentKey: "privacy-policy",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "8f843cededaa10aaa1bcc490ebc7c722645213e967e2a13db37011634d9e2805",
      uz: "d51ac5b4105fc8628e5adf1cfa8b918fc9c96bd24b78a31f05a9e9cebc38491d",
    },
  },
  {
    slug: "cookies",
    documentKey: "cookies-policy",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "2eb817a4de8965ea9239f7558550c19641df6ae056981e33ab00fa83997005a8",
      uz: "00f19dc9e4758119288d8257e775ab3acce71f0c2c4757ddf210cfe88a2bd7ae",
    },
  },
  {
    slug: "ai-rules",
    documentKey: "ai-usage-rules",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "b23ee0d265fd4d50819a793e4f8dfc9f063161221eb071e9eebbd6bd8fe153ef",
      uz: "1cf21a4315a49135156cc7b9cb90d24e6bff203a35043ce6ce6e3a0227edb069",
    },
  },
  {
    slug: "personal-data",
    documentKey: "personal-data-processing",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "672d2020393c98d5392b26cec0e0a42253ba0a1328d5b1e1d9bed3d64b2e4c31",
      uz: "dd07b89ada8fe00113d724af213474076db1ce4ce28847d1bc6dbad6bc0ab291",
    },
  },
] as const satisfies readonly PolicyDefinition[];

function definitionForSlug(slug: AppLegalSlug): PolicyDefinition {
  const definition = policyDefinitions.find((candidate) =>
    candidate.slug === slug
  );
  if (!definition) throw new Error(`UNKNOWN_POLICY_SLUG:${slug}`);
  return definition;
}

export function canonicalPolicyContent(
  locale: PolicyLocale,
  slug: AppLegalSlug,
): string {
  const definition = definitionForSlug(slug);
  const content = appLegalContent[locale][slug];
  return JSON.stringify({
    schema: "juro-policy-content-v1",
    documentKey: definition.documentKey,
    documentVersion: definition.documentVersion,
    locale,
    status: definition.status,
    title: content.title,
    description: content.description,
    updated: content.updated,
    sections: content.sections.map(({ heading, paragraphs }) => ({
      heading,
      paragraphs,
    })),
  });
}

export async function policyContentDigest(
  locale: PolicyLocale,
  slug: AppLegalSlug,
): Promise<string> {
  return sha256(canonicalPolicyContent(locale, slug));
}

export async function verifiedPolicyDocument(
  locale: PolicyLocale,
  slug: AppLegalSlug,
): Promise<VerifiedPolicyDocument> {
  const definition = definitionForSlug(slug);
  const actualDigest = await policyContentDigest(locale, slug);
  const expectedDigest = definition.contentSha256[locale];
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `POLICY_CONTENT_VERSION_MISMATCH:${definition.documentKey}:${locale}`,
    );
  }
  return {
    id: [
      "policy",
      definition.documentKey,
      definition.documentVersion,
      locale,
    ].join(":"),
    slug,
    documentKey: definition.documentKey,
    documentVersion: definition.documentVersion,
    locale,
    contentSha256: actualDigest,
    status: definition.status,
    mandatoryAtRegistration: definition.mandatoryAtRegistration,
    content: appLegalContent[locale][slug],
  };
}

export async function policyRegistry(
  locale: PolicyLocale,
): Promise<VerifiedPolicyDocument[]> {
  return Promise.all(
    policyDefinitions.map(({ slug }) =>
      verifiedPolicyDocument(locale, slug)
    ),
  );
}

export async function registrationPolicies(
  locale: PolicyLocale,
): Promise<VerifiedPolicyDocument[]> {
  return (await policyRegistry(locale)).filter(
    ({ mandatoryAtRegistration }) => mandatoryAtRegistration,
  );
}

export function policyPresentation(slug: AppLegalSlug): {
  documentKey: PolicyDocumentKey;
  documentVersion: string;
  status: PolicyStatus;
} {
  const definition = definitionForSlug(slug);
  return {
    documentKey: definition.documentKey,
    documentVersion: definition.documentVersion,
    status: definition.status,
  };
}

export const policySlugs = policyDefinitions.map(
  ({ slug }) => slug,
) as AppLegalSlug[];
