export type LawyerProfilePreviewEnvironment = {
  APP_ENV?: string;
  LAWYER_PROFILE_DIRECTORY_ENABLED?: string;
  DB?: unknown;
};

/**
 * This is deliberately stricter than a feature flag alone: a profile preview
 * must never be exposed outside staging or without the real D1 binding.
 */
export function isLawyerProfileDirectoryPreviewEnabled(
  environment: LawyerProfilePreviewEnvironment,
): boolean {
  return environment.APP_ENV === "staging"
    && environment.LAWYER_PROFILE_DIRECTORY_ENABLED === "true"
    && Boolean(environment.DB);
}
