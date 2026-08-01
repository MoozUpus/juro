import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { lawyerProfileCreateSchema, lawyerProfileError, lawyerProfileUpdateSchema } from "../../../../lib/platform/lawyer-profile";
import { workspaceForUser } from "../../../../lib/platform/workspace";

type LawyerProfile = {
  id: string; displayName: string; specialtiesJson: string; languagesJson: string; status: string; publicApprovedAt: string | null;
  experienceYears: number | null; priceDescription: string | null; availabilityStatus: string; nextAvailableAt: string | null;
  advocateStatus: string; firmName: string | null; bio: string | null; profileRevision: number;
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function profileDirectoryPreviewEnabled() {
  const runtime = runtimeEnv();
  return runtime.APP_ENV === "staging" && runtime.LAWYER_PROFILE_DIRECTORY_ENABLED === "true" && Boolean(runtime.DB);
}

function serialize(profile: LawyerProfile) {
  return {
    id: profile.id, displayName: profile.displayName, specialties: JSON.parse(profile.specialtiesJson) as string[],
    languages: JSON.parse(profile.languagesJson) as string[], status: profile.status, publicApprovedAt: profile.publicApprovedAt,
    experienceYears: profile.experienceYears, priceDescription: profile.priceDescription, availabilityStatus: profile.availabilityStatus,
    nextAvailableAt: profile.nextAvailableAt, advocateStatus: profile.advocateStatus, firmName: profile.firmName, bio: profile.bio, profileRevision: profile.profileRevision,
  };
}

async function accountIsLawyer(userId: string) {
  return requireD1().prepare("SELECT 1 AS permitted FROM user_profiles WHERE id=? AND account_type='lawyer' LIMIT 1").bind(userId).first<{ permitted: number }>();
}

async function ownProfile(userId: string) {
  return requireD1().prepare(`SELECT id,display_name AS displayName,specialties_json AS specialtiesJson,languages_json AS languagesJson,status,public_approved_at AS publicApprovedAt,experience_years AS experienceYears,price_description AS priceDescription,availability_status AS availabilityStatus,next_available_at AS nextAvailableAt,advocate_status AS advocateStatus,firm_name AS firmName,bio,profile_revision AS profileRevision FROM lawyer_profiles WHERE user_id=? LIMIT 1`).bind(userId).first<LawyerProfile>();
}

export const GET = withApiErrors(async function GET() {
  if (!profileDirectoryPreviewEnabled()) return response({ code: "NOT_AVAILABLE" }, 404);
  const user = await requireApiUser();
  if (!await accountIsLawyer(user.id)) return response({ code: "PROFILE_FORBIDDEN", error: lawyerProfileError("ru", "PROFILE_FORBIDDEN") }, 403);
  const profile = await ownProfile(user.id);
  return response({ profile: profile ? serialize(profile) : null });
});

export const POST = withApiErrors(async function POST(request: Request) {
  if (!profileDirectoryPreviewEnabled()) return response({ code: "NOT_AVAILABLE" }, 404);
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, lawyerProfileCreateSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerProfileError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);
  if (!await accountIsLawyer(user.id)) return response({ code: "PROFILE_FORBIDDEN", error: lawyerProfileError(locale, "PROFILE_FORBIDDEN") }, 403);
  if (await ownProfile(user.id)) return response({ code: "PROFILE_UNAVAILABLE", error: lawyerProfileError(locale, "PROFILE_UNAVAILABLE") }, 409);
  const workspace = await workspaceForUser(user); const now = isoNow(); const id = crypto.randomUUID(); const db = requireD1(); const value = parsed.data;
  await db.batch([
    db.prepare("INSERT INTO lawyer_profiles (id,user_id,display_name,specialties_json,languages_json,status,experience_years,price_description,availability_status,next_available_at,advocate_status,firm_name,bio,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?)").bind(id, user.id, value.displayName, JSON.stringify(value.specialties), JSON.stringify(value.languages), value.experienceYears ?? null, value.priceDescription ?? null, value.availabilityStatus, value.nextAvailableAt ?? null, value.advocateStatus, value.firmName ?? null, value.bio ?? null, now, now),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_profile',?,'lawyer_profile_created',?,?)").bind(crypto.randomUUID(), workspace.id, user.id, id, JSON.stringify({ status: "pending" }), now),
  ]);
  const profile = await ownProfile(user.id);
  return response({ profile: profile ? serialize(profile) : null }, 201);
});

export const PATCH = withApiErrors(async function PATCH(request: Request) {
  if (!profileDirectoryPreviewEnabled()) return response({ code: "NOT_AVAILABLE" }, 404);
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, lawyerProfileUpdateSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale ?? "ru" : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerProfileError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);
  if (!await accountIsLawyer(user.id)) return response({ code: "PROFILE_FORBIDDEN", error: lawyerProfileError(locale, "PROFILE_FORBIDDEN") }, 403);
  const profile = await ownProfile(user.id);
  if (!profile) return response({ code: "PROFILE_UNAVAILABLE", error: lawyerProfileError(locale, "PROFILE_UNAVAILABLE") }, 404);
  const value = parsed.data; const next = {
    displayName: value.displayName ?? profile.displayName, specialties: value.specialties ?? (JSON.parse(profile.specialtiesJson) as string[]), languages: value.languages ?? (JSON.parse(profile.languagesJson) as string[]), experienceYears: value.experienceYears === undefined ? profile.experienceYears : value.experienceYears, priceDescription: value.priceDescription === undefined ? profile.priceDescription : value.priceDescription, availabilityStatus: value.availabilityStatus ?? profile.availabilityStatus, nextAvailableAt: value.nextAvailableAt === undefined ? profile.nextAvailableAt : value.nextAvailableAt, advocateStatus: profile.advocateStatus === "verified" ? "verified" : (value.advocateStatus ?? profile.advocateStatus), firmName: value.firmName === undefined ? profile.firmName : value.firmName, bio: value.bio === undefined ? profile.bio : value.bio,
  };
  if (next.displayName === profile.displayName && JSON.stringify(next.specialties) === profile.specialtiesJson && JSON.stringify(next.languages) === profile.languagesJson && next.experienceYears === profile.experienceYears && next.priceDescription === profile.priceDescription && next.availabilityStatus === profile.availabilityStatus && next.nextAvailableAt === profile.nextAvailableAt && next.advocateStatus === profile.advocateStatus && next.firmName === profile.firmName && next.bio === profile.bio) return response({ profile: serialize(profile) });
  const workspace = await workspaceForUser(user); const now = isoNow(); const db = requireD1(); const auditId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare("UPDATE lawyer_profiles SET display_name=?,specialties_json=?,languages_json=?,experience_years=?,price_description=?,availability_status=?,next_available_at=?,advocate_status=?,firm_name=?,bio=?,profile_revision=profile_revision+1,status='pending',public_approved_at=NULL,updated_at=? WHERE id=? AND user_id=? AND profile_revision=?").bind(next.displayName, JSON.stringify(next.specialties), JSON.stringify(next.languages), next.experienceYears, next.priceDescription, next.availabilityStatus, next.nextAvailableAt, next.advocateStatus, next.firmName, next.bio, now, profile.id, user.id, profile.profileRevision),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) SELECT ?,?,?,'lawyer_profile',?,'lawyer_profile_reapproval_requested',?,? WHERE EXISTS (SELECT 1 FROM lawyer_profiles WHERE id=? AND user_id=? AND profile_revision=? AND status='pending' AND updated_at=?)").bind(auditId, workspace.id, user.id, profile.id, JSON.stringify({ previousRevision: profile.profileRevision }), now, profile.id, user.id, profile.profileRevision + 1, now),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1 || Number(results[1]?.meta.changes ?? 0) !== 1) return response({ code: "PROFILE_UNAVAILABLE", error: lawyerProfileError(locale, "PROFILE_UNAVAILABLE") }, 409);
  const updated = await ownProfile(user.id);
  return response({ profile: updated ? serialize(updated) : null });
});
