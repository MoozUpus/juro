import type {
  AccountType,
  PlatformLocale,
  PlatformModule,
} from "./routing";

export type LawyerEntryProfile = {
  locale: PlatformLocale;
  accountType: AccountType;
  onboardingCompleted: boolean;
  lawyerProfileStatus: string | null;
  lawyerMarketplaceStatus: string | null;
};

type AuthRouteInput = {
  mode: "login" | "register";
  reauth: boolean;
  lawyerHost: boolean;
  profile: LawyerEntryProfile | null;
};

type AccountModuleRouteInput = {
  requestedLocale: PlatformLocale;
  requestedAccountType: AccountType;
  module: PlatformModule;
  lawyerHost: boolean;
  requestHost: string | null;
  profile: LawyerEntryProfile | null;
};

const pendingLawyerModules = new Set<PlatformModule>([
  "profile",
  "settings",
  "security",
]);

export function isLawyerHostRequest(headers: Pick<Headers, "get">): boolean {
  return headers.get("x-juro-lawyer-host") === "1";
}

export function lawyerPublicOrigin(requestHost: string | null): string | null {
  const host = requestHost?.split(":", 1)[0]?.toLowerCase() ?? "";
  if (host === "app.juro.uz" || host === "lawyer.juro.uz") {
    return "https://lawyer.juro.uz";
  }
  if (
    host === "app.staging.juro.uz"
    || host === "lawyer.staging.juro.uz"
  ) {
    return "https://lawyer.staging.juro.uz";
  }
  return null;
}

export function operationalLawyer(profile: LawyerEntryProfile): boolean {
  return profile.accountType === "lawyer"
    && profile.lawyerProfileStatus === "public_approved"
    && profile.lawyerMarketplaceStatus === "public_approved";
}

function lawyerPublicDestination(
  locale: PlatformLocale,
  page: string,
  lawyerHost: boolean,
  requestHost: string | null,
): string {
  const path = `/${locale}/${page}`;
  if (lawyerHost) return path;
  const origin = lawyerPublicOrigin(requestHost);
  return origin ? `${origin}${path}` : path;
}

export function lawyerLandingDestination(
  profile: LawyerEntryProfile,
  lawyerHost: boolean,
  requestHost: string | null,
): string {
  const page = !profile.onboardingCompleted
    ? "onboarding"
    : operationalLawyer(profile)
      ? "dashboard"
      : "application";
  return lawyerPublicDestination(
    profile.locale,
    page,
    lawyerHost,
    requestHost,
  );
}

/**
 * A client session is allowed to see the lawyer login or registration form.
 * It must not be treated as an authenticated lawyer merely because the shared
 * *.juro.uz session cookie is valid.
 */
export function authenticatedAuthRedirect({
  mode,
  reauth,
  lawyerHost,
  profile,
}: AuthRouteInput): string | null {
  if (!profile) return lawyerHost ? null : "/";
  if (!lawyerHost) return mode === "login" && reauth ? null : "/";
  if (profile.accountType !== "lawyer") return null;
  if (mode === "login" && reauth) return null;
  return lawyerLandingDestination(profile, true, null);
}

function accountDashboard(profile: LawyerEntryProfile): string {
  return `/${profile.locale}/${profile.accountType}/dashboard`;
}

function publicPageForModule(
  module: PlatformModule,
  operational: boolean,
): string {
  if (module === "profile" && !operational) return "application";
  if (["dashboard", "consultations", "calendar", "profile", "settings"].includes(module)) {
    return module;
  }
  return `lawyer/${module}`;
}

export function accountModuleRedirect({
  requestedLocale,
  requestedAccountType,
  module,
  lawyerHost,
  requestHost,
  profile,
}: AccountModuleRouteInput): string | null {
  if (!profile) return null;
  if (!profile.onboardingCompleted) {
    return profile.accountType === "lawyer"
      ? lawyerLandingDestination(profile, lawyerHost, requestHost)
      : `/${profile.locale}/onboarding`;
  }
  if (requestedAccountType !== profile.accountType) {
    if (lawyerHost && requestedAccountType === "lawyer") {
      const login = new URL(`https://lawyer.juro.uz/${requestedLocale}/auth/login`);
      login.searchParams.set("accountType", "lawyer");
      login.searchParams.set("reauth", "1");
      login.searchParams.set("returnTo", `/${requestedLocale}/dashboard`);
      return `${login.pathname}${login.search}`;
    }
    return profile.accountType === "lawyer"
      ? lawyerLandingDestination(profile, lawyerHost, requestHost)
      : accountDashboard(profile);
  }
  if (profile.accountType !== "lawyer") return null;

  const operational = operationalLawyer(profile);
  if (!operational && !pendingLawyerModules.has(module)) {
    return lawyerPublicDestination(
      profile.locale,
      "application",
      lawyerHost,
      requestHost,
    );
  }
  if (!lawyerHost && lawyerPublicOrigin(requestHost)) {
    return lawyerPublicDestination(
      profile.locale,
      publicPageForModule(module, operational),
      false,
      requestHost,
    );
  }
  return null;
}
