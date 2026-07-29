export type PlatformLocale = "ru" | "uz";
export type PersonalAccountType = "individual" | "entrepreneur" | "lawyer";
export type AccountType = PersonalAccountType | "business";

export const PLATFORM_MODULES = [
  "dashboard",
  "ai-chat",
  "cases",
  "document-review",
  "monitoring",
  "action-plan",
  "consultations",
  "history",
  "archive",
  "team",
  "billing",
  "security",
  "help",
  "profile",
  "settings",
] as const;
export type PlatformModule = typeof PLATFORM_MODULES[number];

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

export function isLocale(value: string): value is PlatformLocale {
  return value === "ru" || value === "uz";
}

export function isPersonalAccountType(
  value: string,
): value is PersonalAccountType {
  return value === "individual" || value === "entrepreneur" || value === "lawyer";
}

export function isAccountType(value: string): value is AccountType {
  return value === "business" || isPersonalAccountType(value);
}

export function isWorkspaceId(value: string): boolean {
  return WORKSPACE_ID_PATTERN.test(value);
}

export function workspaceTypeForAccountType(
  value: AccountType,
): "individual" | "business" {
  return value === "business" ? "business" : "individual";
}

export function isPlatformModule(value: string): value is PlatformModule {
  return PLATFORM_MODULES.includes(value as PlatformModule);
}

export function platformBasePath(
  locale: PlatformLocale,
  accountType: AccountType,
  workspaceId?: string,
): string {
  if (accountType === "business" && workspaceId) {
    if (!isWorkspaceId(workspaceId)) throw new Error("INVALID_WORKSPACE_ID");
    return `/${locale}/business/${encodeURIComponent(workspaceId)}`;
  }
  return `/${locale}/${accountType}`;
}

export function platformPath(
  locale: PlatformLocale,
  accountType: AccountType,
  module: string,
  workspaceId?: string,
): string {
  return `${platformBasePath(locale, accountType, workspaceId)}/${module}`;
}
