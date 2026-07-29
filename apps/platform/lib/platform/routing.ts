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

export function isLocale(value: string): value is PlatformLocale { return value === "ru" || value === "uz"; }
export function isPersonalAccountType(
  value: string,
): value is PersonalAccountType {
  return value === "individual" || value === "entrepreneur" || value === "lawyer";
}
export function isAccountType(value: string): value is AccountType {
  return value === "business" || isPersonalAccountType(value);
}
export function workspaceTypeForAccountType(
  value: AccountType,
): "individual" | "business" {
  return value === "business" ? "business" : "individual";
}
export function isPlatformModule(value: string): value is PlatformModule { return PLATFORM_MODULES.includes(value as PlatformModule); }
export function platformPath(locale: PlatformLocale, accountType: AccountType, module: string) { return `/${locale}/${accountType}/${module}`; }
