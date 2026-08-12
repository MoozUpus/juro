import type { AccountType } from "./routing";

/**
 * The monitoring API stores only workspace audiences. Older personal route
 * segments (entrepreneur and lawyer) are still valid navigation routes, but
 * they must never become invalid values in monitoring_preferences.
 */
export type MonitoringAudience = "individual" | "business";

export function normalizeMonitoringAudience(
  value: AccountType | string | null | undefined,
): MonitoringAudience {
  return value === "business" ? "business" : "individual";
}
