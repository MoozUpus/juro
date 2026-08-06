export type PublicLawyer = {
  id: string;
  displayName: string;
  specialties: string[];
  languages: string[];
  experienceYears: number | null;
  priceDescription: string | null;
  availabilityStatus: "unknown" | "available" | "limited" | "unavailable";
  nextAvailableAt: string | null;
  advocateStatus: "not_declared" | "declared" | "verified";
  firmName: string | null;
  bio: string | null;
  marketplaceStatus: "pending_review" | "public_approved";
  canReceiveRequests: boolean;
  city: string | null;
  region: string | null;
  education: string | null;
  consultationFormats: string[];
  profilePhotoUrl: string | null;
  rating: { reviewCount: number; overallAverage: number | null };
  reviews: Array<{ id: string; overallRating: number; body: string | null; createdAt: string; reply: { body: string; createdAt: string | null } | null }>;
};

function platformOrigin() {
  return (process.env.JURO_PUBLIC_PLATFORM_ORIGIN || "https://app.juro.uz").replace(/\/$/, "");
}

function asLawyer(value: unknown): PublicLawyer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PublicLawyer>;
  if (typeof row.id !== "string" || typeof row.displayName !== "string" || !Array.isArray(row.specialties) || !Array.isArray(row.languages)) return null;
  if (row.marketplaceStatus !== "pending_review" && row.marketplaceStatus !== "public_approved") return null;
  return row as PublicLawyer;
}

export function publicPhotoUrl(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith("/") ? `${platformOrigin()}${value}` : value;
}

export async function getPublicLawyers() {
  try {
    const response = await fetch(`${platformOrigin()}/api/public/lawyers`, { cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) return { lawyers: [] as PublicLawyer[], available: false };
    const payload = await response.json() as { lawyers?: unknown };
    return { lawyers: Array.isArray(payload.lawyers) ? payload.lawyers.map(asLawyer).filter((item): item is PublicLawyer => item !== null) : [], available: true };
  } catch {
    return { lawyers: [] as PublicLawyer[], available: false };
  }
}

export async function getPublicLawyer(id: string) {
  try {
    const response = await fetch(`${platformOrigin()}/api/public/lawyers/${encodeURIComponent(id)}`, { cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json() as { lawyer?: unknown };
    return asLawyer(payload.lawyer);
  } catch {
    return null;
  }
}
