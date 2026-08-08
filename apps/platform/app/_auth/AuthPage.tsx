import { redirect } from "next/navigation";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
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
}: {
  mode: "login" | "register";
  locale: AuthLocale;
  accountType?: string;
  returnTo?: string;
}) {
  if (await getChatGPTUser()) redirect("/");
  const env = runtimeEnv();
  return (
    <AuthForm
      mode={mode}
      initialLocale={locale}
      initialAccountType={registrationPersona(accountType)}
      returnTo={returnTo}
      otpEnabled={Boolean(
        env.RESEND_API_KEY
          && env.EMAIL_FROM
          && env.TURNSTILE_SECRET_KEY
          && env.TURNSTILE_SITE_KEY
      )}
      turnstileSiteKey={env.TURNSTILE_SITE_KEY}
      platformAuthEnabled={env.ALLOW_PLATFORM_AUTH_HEADERS === "true"}
    />
  );
}
