export type LawyerProfilePreviewEnvironment = {
  APP_ENV?: string;
  LAWYER_PROFILE_DIRECTORY_ENABLED?: string;
  DB?: unknown;
};

/**
 * The directory is available in local development and staging only when the
 * explicit flag and a real D1 binding are both present. Production remains
 * fail-closed until its separate release approval changes the environment.
 */
export function isLawyerProfileDirectoryPreviewEnabled(
  environment: LawyerProfilePreviewEnvironment,
): boolean {
  return (environment.APP_ENV === "development" || environment.APP_ENV === "staging")
    && environment.LAWYER_PROFILE_DIRECTORY_ENABLED === "true"
    && Boolean(environment.DB);
}
