export type PlatformLocale = "ru" | "uz";
export type AccountType = "individual" | "business";

export const PLATFORM_MODULES = [
  "main",
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
export function isAccountType(value: string): value is AccountType { return value === "individual" || value === "business"; }
export function isPlatformModule(value: string): value is PlatformModule { return PLATFORM_MODULES.includes(value as PlatformModule); }
export function platformPath(locale: PlatformLocale, accountType: AccountType, module: string) { return `/${locale}/${accountType}/${module}`; }
