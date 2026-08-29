export type LawyerProfilePreviewEnvironment = {
  APP_ENV?: string;
  LAWYER_PROFILE_DIRECTORY_ENABLED?: string;
  DB?: unknown;
};

/**
 * Lawyer profile and moderation surfaces are available only when the explicit
 * environment flag and a real D1 binding are both present. This keeps unknown
 * preview environments fail-closed while allowing an approved production
 * release to opt in through version-controlled Cloudflare configuration.
 */
export function isLawyerProfileDirectoryPreviewEnabled(
  environment: LawyerProfilePreviewEnvironment,
): boolean {
  return ["development", "staging", "production"].includes(
    environment.APP_ENV ?? "",
  )
    && environment.LAWYER_PROFILE_DIRECTORY_ENABLED === "true"
    && Boolean(environment.DB);
}
