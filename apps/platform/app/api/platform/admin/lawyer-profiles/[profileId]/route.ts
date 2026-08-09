import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerProfileModerationSchema } from "../../../../../../lib/platform/lawyer-profile";
import { isLawyerProfileDirectoryPreviewEnabled } from "../../../../../../lib/platform/lawyer-profile-preview";
import { LawyerProfileModerationError, moderateLawyerProfile } from "../../../../../../lib/platform/lawyer-profile-moderation-service";
import { z } from "zod";

type Context = { params: Promise<{ profileId: string }> };

async function patchLawyerProfile(request: Request, context: Context) {
  const runtime = runtimeEnv();
  if (!isLawyerProfileDirectoryPreviewEnabled(runtime)) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, lawyerProfileModerationSchema, 4_096);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const result = await moderateLawyerProfile(requireD1(), {
      profileId: profileId.data,
      moderatorUserId: staff.userId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    return Response.json({ ok: true, status: result.status }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LawyerProfileModerationError) {
      return Response.json({ code: error.code }, { status: 409 });
    }
    return Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 409 });
  }
}

export const PATCH = withPlatformStaffErrors(patchLawyerProfile);
