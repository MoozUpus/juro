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
    status: "approved",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "a6c7b5b67e3c93cd745118dc4b7b1dbf8b21864596ff8da3efcc70e546dd39dc",
      uz: "fd60fc686a5a61b97ab01a6516b1ef5db1640b3e29011c1319b0f13775e91e1f",
    },
  },
  {
    slug: "privacy",
    documentKey: "privacy-policy",
    documentVersion: POLICY_VERSION,
    status: "approved",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "94784b91686ef8b7c87a8ba7694ffe9004be2aa0242c7fd44c19daffd58d7188",
      uz: "bf9c69f2dbe4979aa4345347081d2e1c3339c5193716b1fe9270b7097e84e88d",
    },
  },
  {
    slug: "cookies",
    documentKey: "cookies-policy",
    documentVersion: POLICY_VERSION,
    status: "approved",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "9b3e8ddd5317b77acc66a7f1ff997ec123677e7b99b6551896224e0bda9a4123",
      uz: "1c039fc465caa478adf5582c2b973091b7e1a9367028c57300e7b62533b116b0",
    },
  },
  {
    slug: "ai-rules",
    documentKey: "ai-usage-rules",
    documentVersion: POLICY_VERSION,
    status: "approved",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "449d15bdf9d4a18a2c8dc5bc112afc1e1ecc98f03f8393ff43a00a59dfd9b44b",
      uz: "a52e3074addbcde501bc297a62c643512176ee85ec0c1890850844a3cc475ff7",
    },
  },
  {
    slug: "personal-data",
    documentKey: "personal-data-processing",
    documentVersion: POLICY_VERSION,
    status: "approved",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "e21e0b74fdaebac9ce72d60edab705d68431bda77641c8e47905277b2c78ada3",
      uz: "3cdc04be88c68611ac8827823f52110df036fe308e4bda2deecc015bc73ebb3a",
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
