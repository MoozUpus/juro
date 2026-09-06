import {
  appLegalContent,
  type AppLegalSlug,
  type LegalDocument,
} from "../../content/app-legal";
import { sha256 } from "../auth/crypto";

export type PolicyLocale = "ru" | "uz" | "en";
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

// Any canonical text change receives a new immutable version. Production
// acceptance rows are append-only and must continue to reference the exact
// text the user accepted.
const POLICY_VERSION = "2026-09-04.draft.2";

const policyDefinitions = [
  {
    slug: "terms",
    documentKey: "terms",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "927d60c81bebe7aa97fc7a19585f738e5dfa4970ac90853f537a2aa2f5b6b73b",
      uz: "cae77f18b62c49d40c041ef357287441153fe47fa635ed398904ce7124917181",
      en: "b7b422f0dd08ba03a0002620a2d71d192012a155af06ff6075d96316b2b1deac",
    },
  },
  {
    slug: "privacy",
    documentKey: "privacy-policy",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "e83be3984be664d174ac76ee137799cf4f5f4631a58be40e538104a8f8c9fc48",
      uz: "66a93f80ef14041dd841a861ab03f795b7527491c177ccc71ed0905d14da81cd",
      en: "7b0e7fe1e1c8f25df8a3d01404f04feb57d5fcce309cfa1a8fa4053f46b14787",
    },
  },
  {
    slug: "cookies",
    documentKey: "cookies-policy",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "adcf7a408de709503ada3dce8f0fa74b2e12f3b4c15af0114d61ae514a168983",
      uz: "370ce0607bd12842f3480b1a9543fd35a8294f0dcf33436631e1871f71790802",
      en: "7e94db6c7e8e2fc72069fb3eb128eea37ef6910ad9b66d7758483a115cbbe7bf",
    },
  },
  {
    slug: "ai-rules",
    documentKey: "ai-usage-rules",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: false,
    contentSha256: {
      ru: "3df570103a71c30c9bd1b86f9a5497c1a5c9c4b05663327c2d904af79ebcc664",
      uz: "45cfb56544660004d434775728505b6445bd6eedb405248285483b6d53a8d24d",
      en: "46f7987bcbb26d99060c8e077f71af2b2f411053dfb734aaf32c38d28e9b0683",
    },
  },
  {
    slug: "personal-data",
    documentKey: "personal-data-processing",
    documentVersion: POLICY_VERSION,
    status: "draft",
    mandatoryAtRegistration: true,
    contentSha256: {
      ru: "7ca0fb1b296ae76dbbaaa29ccb6a2710e4ebf18a993e826e6a97eb14e662fbcc",
      uz: "d0f590789fa279f866028ccaa9af992d58fa3fc2f53e09bc37e73de55478fdae",
      en: "b1383b4fde327c552202248ad4ff96ae840e861ed54e4b123ab25bdff4366233",
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
