import { runtimeEnv } from "../document-builder/storage/runtime";

export function localDevelopmentAuthEnabled(): boolean {
  const env = runtimeEnv();
  return process.env.NODE_ENV !== "production"
    && env.APP_ENV === "development"
    && env.LOCAL_AUTH_BYPASS === "true";
}

export function isLocalDevelopmentSession(
  session: { authMethod: string } | null,
): boolean {
  return localDevelopmentAuthEnabled()
    && session?.authMethod === "development_bypass";
}
