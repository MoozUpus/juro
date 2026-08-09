import {
  requireD1,
} from "../document-builder/storage/runtime";
import {
  localSessionForRequest,
  mfaErrorResponse,
} from "./mfa-http";
import {
  PlatformStaffAccessError,
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

function staffRequestLocale(request: Request): "ru" | "uz" {
  const url = new URL(request.url);
  if (url.searchParams.get("lang") === "uz") return "uz";
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return language.startsWith("uz") ? "uz" : "ru";
}

/**
 * Converts the shared local-session and staff-capability failures into typed,
 * no-store HTTP responses. Staff routes must use this wrapper so an absent,
 * expired, non-MFA, or unauthorized session never becomes an empty 500.
 */
export function withPlatformStaffErrors<TArgs extends [Request, ...unknown[]]>(
  handler: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const mfa = mfaErrorResponse(error, staffRequestLocale(args[0]));
      if (mfa) return mfa;
      if (error instanceof PlatformStaffAccessError) {
        return Response.json(
          { code: "PLATFORM_STAFF_ACCESS_DENIED" },
          {
            status: 403,
            headers: {
              "cache-control": "private, no-store",
              pragma: "no-cache",
            },
          },
        );
      }
      throw error;
    }
  };
}
