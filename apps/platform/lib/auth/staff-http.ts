import {
  requireD1,
} from "../document-builder/storage/runtime";
import {
  localSessionForRequest,
} from "./mfa-http";
import {
  requirePlatformStaffAccess,
  type PlatformStaffAccess,
  type PlatformStaffCapability,
} from "./staff-access";

export async function requirePlatformStaffRequest(
  request: Request,
  capability: PlatformStaffCapability,
  options: {
    now?: Date;
    freshMfaWithinMs?: number;
  } = {},
): Promise<PlatformStaffAccess> {
  const session = await localSessionForRequest(request, {
    now: options.now,
  });
  return requirePlatformStaffAccess(
    requireD1(),
    session,
    capability,
    options,
  );
}
