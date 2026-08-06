export type PublicLawyerDirectoryRow = {
  id: string;
  displayName: string;
  specialtiesJson: unknown;
  languagesJson: unknown;
  experienceYears: number | null;
  priceDescription: string | null;
  availabilityStatus: string;
  nextAvailableAt: string | null;
  advocateStatus: string;
  firmName: string | null;
  bio: string | null;
  marketplaceStatus?: string;
  city?: string | null;
  region?: string | null;
  education?: string | null;
  consultationFormatsJson?: unknown;
  profilePhotoUrl?: string | null;
};

export type ApprovedReviewAggregateRow = {
  lawyerProfileId: string;
  reviewCount: number;
  overallAverage: number;
  speedAverage: number;
  qualityAverage: number;
  communicationAverage: number;
};

export type ApprovedPublicReviewRow = {
  reviewId?: string;
  lawyerProfileId: string;
  overallRating: number;
  body: string | null;
  createdAt: string;
  replyBody?: string | null;
  replyCreatedAt?: string | null;
};

function stringList(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * A single review is useful to the lawyer and client who completed a matter,
 * but it is not a reliable public marketplace signal. Keep the threshold in
 * one auditable place until the runtime setting is introduced.
 */
export const MINIMUM_PUBLISHED_LAWYER_REVIEWS = 3;

export function projectPublicLawyerDirectory(
  lawyers: PublicLawyerDirectoryRow[],
  aggregates: ApprovedReviewAggregateRow[],
  reviews: ApprovedPublicReviewRow[],
) {
  const aggregateByLawyer = new Map(aggregates.map((item) => [item.lawyerProfileId, item]));
  const reviewsByLawyer = new Map<string, ApprovedPublicReviewRow[]>();
  for (const review of reviews) {
    const list = reviewsByLawyer.get(review.lawyerProfileId) ?? [];
    list.push(review);
    reviewsByLawyer.set(review.lawyerProfileId, list);
  }
  return lawyers.map((lawyer) => {
    const aggregate = aggregateByLawyer.get(lawyer.id);
    const mayPublishReviews = Boolean(aggregate && aggregate.reviewCount >= MINIMUM_PUBLISHED_LAWYER_REVIEWS);
    const hasMarketplaceProjection = lawyer.marketplaceStatus !== undefined
      || lawyer.city !== undefined
      || lawyer.region !== undefined
      || lawyer.education !== undefined
      || lawyer.consultationFormatsJson !== undefined
      || lawyer.profilePhotoUrl !== undefined;
    return {
      id: lawyer.id,
      displayName: lawyer.displayName,
      specialties: stringList(lawyer.specialtiesJson),
      languages: stringList(lawyer.languagesJson),
      experienceYears: lawyer.experienceYears,
      priceDescription: lawyer.priceDescription,
      availabilityStatus: lawyer.availabilityStatus,
      nextAvailableAt: lawyer.nextAvailableAt,
      advocateStatus: lawyer.advocateStatus,
      firmName: lawyer.firmName,
      bio: lawyer.bio,
      ...(hasMarketplaceProjection ? {
        marketplaceStatus: lawyer.marketplaceStatus === "pending_review"
          ? "pending_review"
          : "public_approved",
        canReceiveRequests: lawyer.marketplaceStatus !== "pending_review",
        city: lawyer.city ?? null,
        region: lawyer.region ?? null,
        education: lawyer.education ?? null,
        consultationFormats: stringList(lawyer.consultationFormatsJson),
        profilePhotoUrl: lawyer.profilePhotoUrl ?? null,
      } : {}),
      rating: mayPublishReviews && aggregate ? {
        reviewCount: aggregate.reviewCount,
        overallAverage: rounded(aggregate.overallAverage),
        speedAverage: rounded(aggregate.speedAverage),
        qualityAverage: rounded(aggregate.qualityAverage),
        communicationAverage: rounded(aggregate.communicationAverage),
      } : { reviewCount: 0, overallAverage: null, speedAverage: null, qualityAverage: null, communicationAverage: null },
      reviews: (mayPublishReviews ? reviewsByLawyer.get(lawyer.id) ?? [] : []).slice(0, 3).map((review) => ({
        id: review.reviewId ?? `${review.lawyerProfileId}:${review.createdAt}`,
        overallRating: review.overallRating,
        body: review.body,
        createdAt: review.createdAt,
        reply: review.replyBody ? { body: review.replyBody, createdAt: review.replyCreatedAt } : null,
      })),
    };
  });
}
