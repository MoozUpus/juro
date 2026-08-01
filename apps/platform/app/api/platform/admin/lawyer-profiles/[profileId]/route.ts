import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest } from "../../../../../../lib/auth/staff-http";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerProfileModerationSchema } from "../../../../../../lib/platform/lawyer-profile";
import { z } from "zod";

type Context = { params: Promise<{ profileId: string }> };
type PendingProfile = { id: string; workspaceId: string | null; profileRevision: number; displayName: string; specialtiesJson: string; languagesJson: string; experienceYears: number | null; priceDescription: string | null; availabilityStatus: string; nextAvailableAt: string | null; advocateStatus: string; firmName: string | null; bio: string | null };

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function PATCH(request: Request, context: Context) {
  const runtime = runtimeEnv();
  if (runtime.APP_ENV !== "staging" || runtime.LAWYER_PROFILE_DIRECTORY_ENABLED !== "true" || !runtime.DB) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, lawyerProfileModerationSchema, 4_096);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const db = requireD1();
  const profile = await db.prepare(`SELECT p.id,u.default_workspace_id AS workspaceId,p.profile_revision AS profileRevision,p.display_name AS displayName,p.specialties_json AS specialtiesJson,p.languages_json AS languagesJson,p.experience_years AS experienceYears,p.price_description AS priceDescription,p.availability_status AS availabilityStatus,p.next_available_at AS nextAvailableAt,p.advocate_status AS advocateStatus,p.firm_name AS firmName,p.bio FROM lawyer_profiles p JOIN user_profiles u ON u.id=p.user_id WHERE p.id=? AND p.status='pending' LIMIT 1`).bind(profileId.data).first<PendingProfile>();
  if (!profile?.workspaceId) return Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 409 });
  const now = isoNow();
  const moderationId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const profileSha256 = await sha256(JSON.stringify({ id: profile.id, revision: profile.profileRevision, displayName: profile.displayName, specialtiesJson: profile.specialtiesJson, languagesJson: profile.languagesJson, experienceYears: profile.experienceYears, priceDescription: profile.priceDescription, availabilityStatus: profile.availabilityStatus, nextAvailableAt: profile.nextAvailableAt, advocateStatus: profile.advocateStatus, firmName: profile.firmName, bio: profile.bio }));
  try {
    const results = await db.batch([
      db.prepare("INSERT INTO lawyer_profile_moderation (id,lawyer_profile_id,profile_revision,moderator_user_id,decision,reason,profile_sha256,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM lawyer_profiles WHERE id=? AND profile_revision=? AND status='pending')").bind(moderationId, profile.id, profile.profileRevision, staff.userId, parsed.data.decision, parsed.data.reason, profileSha256, now, profile.id, profile.profileRevision),
      db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) SELECT ?,?,?,'lawyer_profile',?,'lawyer_profile_moderated',?,? WHERE EXISTS (SELECT 1 FROM lawyer_profile_moderation WHERE id=? AND lawyer_profile_id=? AND profile_revision=? AND moderator_user_id=? AND decision=?)").bind(auditId, profile.workspaceId, staff.userId, profile.id, JSON.stringify({ decision: parsed.data.decision, profileRevision: profile.profileRevision, profileSha256 }), now, moderationId, profile.id, profile.profileRevision, staff.userId, parsed.data.decision),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) !== 1 || Number(results[1]?.meta.changes ?? 0) !== 1) return Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 409 });
  } catch {
    return Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 409 });
  }
  return Response.json({ ok: true, status: parsed.data.decision === "approved" ? "public_approved" : "rejected" }, { headers: { "cache-control": "private, no-store" } });
}
