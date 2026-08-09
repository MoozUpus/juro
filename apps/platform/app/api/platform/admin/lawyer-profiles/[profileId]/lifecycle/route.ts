import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../../../lib/document-builder/storage/runtime";
import { lawyerProfileLifecycleSchema } from "../../../../../../../lib/platform/lawyer-profile";
import { isLawyerProfileDirectoryPreviewEnabled } from "../../../../../../../lib/platform/lawyer-profile-preview";
import {
  LawyerProfileLifecycleError,
  transitionLawyerProfileLifecycle,
} from "../../../../../../../lib/platform/lawyer-profile-lifecycle-service";
import { z } from "zod";

type Context = { params: Promise<{ profileId: string }> };

async function postLawyerProfileLifecycle(request: Request, context: Context) {
  const runtime = runtimeEnv();
  if (!isLawyerProfileDirectoryPreviewEnabled(runtime)) {
    return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
  }
  assertSafeWrite(request);
  const parsed = await parseJsonRequest(request, lawyerProfileLifecycleSchema, 4_096);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const capability = parsed.data.action === "block" ? "staff.operations.manage" : "lawyer.profiles.moderate";
  const staff = await requirePlatformStaffRequest(request, capability, { freshMfaWithinMs: 15 * 60 * 1_000 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const result = await transitionLawyerProfileLifecycle(requireD1(), {
      profileId: profileId.data,
      actorUserId: staff.userId,
      action: parsed.data.action,
      reason: parsed.data.reason,
    });
    return Response.json({ ok: true, status: result.status, profileRevision: result.profileRevision }, {
      headers: { "cache-control": "private, no-store", pragma: "no-cache" },
    });
  } catch (error) {
    if (error instanceof LawyerProfileLifecycleError) return Response.json({ code: error.code }, { status: 409 });
    return Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 409 });
  }
}

export const POST = withPlatformStaffErrors(postLawyerProfileLifecycle);
