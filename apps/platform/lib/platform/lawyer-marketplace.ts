export const lawyerMarketplaceStatuses = [
  "profile_incomplete",
  "pending_review",
  "changes_requested",
  "public_approved",
  "rejected",
  "suspended",
  "blocked",
  "archived",
] as const;

export type LawyerMarketplaceStatus = (typeof lawyerMarketplaceStatuses)[number];

export type LawyerMarketplaceCompletionInput = {
  displayName: string;
  specialties: string[];
  languages: string[];
  experienceYears: number | null;
  education: string | null;
  firmName: string | null;
  city: string | null;
  region: string | null;
  priceDescription: string | null;
  consultationFormats: string[];
  availabilityStatus: string;
  profilePhotoKey: string | null;
  hasPhone: boolean;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * A phone stays in the protected identity record. This predicate only receives
 * its presence, so a public lawyer card never reads or exposes the number.
 */
export function missingLawyerMarketplaceFields(
  profile: LawyerMarketplaceCompletionInput,
): string[] {
  const missing: string[] = [];
  if (!hasText(profile.displayName)) missing.push("displayName");
  if (!profile.specialties.length) missing.push("specialties");
  if (!profile.languages.length) missing.push("languages");
  if (profile.experienceYears === null) missing.push("experienceYears");
  if (!hasText(profile.education)) missing.push("education");
  if (!hasText(profile.firmName)) missing.push("firmName");
  if (!hasText(profile.city)) missing.push("city");
  if (!hasText(profile.region)) missing.push("region");
  if (!hasText(profile.priceDescription)) missing.push("priceDescription");
  if (!profile.consultationFormats.length) missing.push("consultationFormats");
  if (!profilePhotoPresent(profile)) missing.push("profilePhoto");
  if (!profile.hasPhone) missing.push("phone");
  if (!['available', 'limited', 'unavailable'].includes(profile.availabilityStatus)) {
    missing.push("availabilityStatus");
  }
  return missing;
}

function profilePhotoPresent(profile: LawyerMarketplaceCompletionInput): boolean {
  return hasText(profile.profilePhotoKey);
}

export function isLawyerMarketplaceProfileComplete(
  profile: LawyerMarketplaceCompletionInput,
): boolean {
  return missingLawyerMarketplaceFields(profile).length === 0;
}

/**
 * A material profile edit always returns an approved card to the review queue;
 * publication is restored only by the append-only moderation decision.
 */
export function marketplaceStatusAfterProfileEdit(
  profile: LawyerMarketplaceCompletionInput,
): LawyerMarketplaceStatus {
  return isLawyerMarketplaceProfileComplete(profile)
    ? "pending_review"
    : "profile_incomplete";
}

export function mayReceiveLawyerRequests(status: string): boolean {
  return status === "public_approved";
}

export function isRestrictedLawyerMarketplaceStatus(status: string): boolean {
  return status === "suspended" || status === "blocked" || status === "archived";
}
