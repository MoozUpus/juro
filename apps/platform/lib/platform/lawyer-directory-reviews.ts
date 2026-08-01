export type PublicLawyerDirectoryRow = {
  id: string;
  displayName: string;
  specialtiesJson: unknown;
  languagesJson: unknown;
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
  lawyerProfileId: string;
  overallRating: number;
  body: string | null;
  createdAt: string;
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
    return {
      id: lawyer.id,
      displayName: lawyer.displayName,
      specialties: stringList(lawyer.specialtiesJson),
      languages: stringList(lawyer.languagesJson),
      rating: aggregate ? {
        reviewCount: aggregate.reviewCount,
        overallAverage: rounded(aggregate.overallAverage),
        speedAverage: rounded(aggregate.speedAverage),
        qualityAverage: rounded(aggregate.qualityAverage),
        communicationAverage: rounded(aggregate.communicationAverage),
      } : { reviewCount: 0, overallAverage: null, speedAverage: null, qualityAverage: null, communicationAverage: null },
      reviews: (reviewsByLawyer.get(lawyer.id) ?? []).slice(0, 3).map((review) => ({
        overallRating: review.overallRating,
        body: review.body,
        createdAt: review.createdAt,
      })),
    };
  });
}
