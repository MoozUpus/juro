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

const POLICY_VERSION = "2026-08-23.1";

const policyDefinitions = [
  {
    slug: "terms",
    documentKey: "terms",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "6868550ffe75d126c2d64471781cfa1bf2c6cda51ffe58fb2bdc02f2f60a8328",
      uz: "f8bfdcfcf27f8a0509ef5ad39cffc47857590be626f8b46114c388a9512bd4f9",
    },
  },
  {
    slug: "privacy",
    documentKey: "privacy-policy",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "1763f9df1c03fc9793f9295d713c3a1c8f3706c30d24e111f996524b60ebdf06",
      uz: "3b5da247cc512cd80dbb648b9e53c97936bba11ed451614355bb86dc66f6c3a3",
    },
  },
  {
    slug: "cookies",
    documentKey: "cookies-policy",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "cb8cba617c90aaadde6d0e5ae2949b9bcccb6e5a19c9035a24557ffee345e28d",
      uz: "a455973df28c8a19657dac9297a37feaa3d18a44aadd2ebae9a622096e9dea4a",
    },
  },
  {
    slug: "ai-rules",
    documentKey: "ai-usage-rules",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "f8938adaa396591b5e5e3bd9a3a484100c36a0114ae0f7f88130f2d03cf58e13",
      uz: "24394fa46a23b0a2731b3ea40688857abac03c4e4a4eb955947239c304f8b09c",
    },
  },
  {
    slug: "personal-data",
    documentKey: "personal-data-processing",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "933f3fc6ecc9413374a939b43c6d2364699b9a5850ff4a02840fc9e4a7181820",
      uz: "09f9e8b6f35fa623860aec0faefb4f536c1557bd9c3343e25c793dbbae6bf382",
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
