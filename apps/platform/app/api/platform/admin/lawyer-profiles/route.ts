import { requirePlatformStaffRequest } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { lawyerProfileModerationListSchema } from "../../../../../lib/platform/lawyer-profile";

export async function GET(request: Request) {
  await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const url = new URL(request.url);
  const parsed = lawyerProfileModerationListSchema.safeParse({ status: url.searchParams.get("status") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const profiles = await requireD1().prepare(`SELECT p.id,p.display_name AS displayName,p.specialties_json AS specialtiesJson,p.languages_json AS languagesJson,p.status,p.profile_revision AS profileRevision,p.experience_years AS experienceYears,p.price_description AS priceDescription,p.availability_status AS availabilityStatus,p.next_available_at AS nextAvailableAt,p.advocate_status AS advocateStatus,p.firm_name AS firmName,p.bio,p.created_at AS createdAt,p.updated_at AS updatedAt FROM lawyer_profiles p WHERE p.status=? ORDER BY p.updated_at ASC,p.id ASC LIMIT ?`).bind(parsed.data.status, parsed.data.limit).all();
  return Response.json({ profiles: profiles.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}
