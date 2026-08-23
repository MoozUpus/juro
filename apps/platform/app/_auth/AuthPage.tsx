import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { localDevelopmentAuthEnabled } from "../../lib/auth/development-auth";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
import {
  authenticatedAuthRedirect,
  isLawyerHostRequest,
  lawyerRoleMismatchHome,
} from "../../lib/platform/lawyer-entry-routing";
import { workspaceProfile } from "../../lib/platform/profile";
import { getChatGPTUser } from "../chatgpt-auth";
import { AuthForm } from "./AuthForm";
import "./auth.css";

export type AuthLocale = "ru" | "uz";
export type RegistrationPersona = "individual" | "entrepreneur" | "lawyer";

export function registrationPersona(value?: string): RegistrationPersona {
  return value === "entrepreneur" || value === "lawyer"
    ? value
    : "individual";
}

export async function AuthPage({
  mode,
  locale,
  accountType,
  returnTo,
  reauth = false,
}: {
  mode: "login" | "register";
  locale: AuthLocale;
  accountType?: string;
  returnTo?: string;
  reauth?: boolean;
}) {
  const initialAccountType = registrationPersona(accountType);
  const authenticated = await getChatGPTUser();
  let accountBoundaryHomeHref: string | undefined;
  if (authenticated) {
    const requestHeaders = await headers();
    const profile = await workspaceProfile(authenticated.email);
    const lawyerHost = isLawyerHostRequest(requestHeaders);
    const destination = authenticatedAuthRedirect({
      mode,
      reauth,
      lawyerHost,
      profile,
    });
    if (destination) redirect(destination);
    accountBoundaryHomeHref = lawyerRoleMismatchHome({
      requestedAccountType: initialAccountType,
      reauth,
      lawyerHost,
      requestHost: requestHeaders.get("host"),
      profile,
    }) ?? undefined;
  }
  const env = runtimeEnv();
  return (
    <AuthForm
      mode={mode}
      initialLocale={locale}
      initialAccountType={initialAccountType}
      accountBoundaryHomeHref={accountBoundaryHomeHref}
      returnTo={returnTo}
      otpEnabled={Boolean(
        env.RESEND_API_KEY
          && env.EMAIL_FROM
          && env.TURNSTILE_SECRET_KEY
          && env.TURNSTILE_SITE_KEY
      )}
      turnstileSiteKey={env.TURNSTILE_SITE_KEY}
      platformAuthEnabled={env.ALLOW_PLATFORM_AUTH_HEADERS === "true"}
      developmentAuthEnabled={localDevelopmentAuthEnabled()}
    />
  );
}
