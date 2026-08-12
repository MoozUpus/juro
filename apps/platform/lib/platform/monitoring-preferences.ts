import type { AccountType } from "./routing";

/**
 * The monitoring API stores only workspace audiences. Older personal route
 * segments (entrepreneur and lawyer) are still valid navigation routes, but
 * they must never become invalid values in monitoring_preferences.
 */
export type MonitoringAudience = "individual" | "business";

export type MonitoringDeliveryStatus = {
  automaticPublication: boolean;
  controlledBeta: boolean;
  freshnessState: "fresh" | "stale" | "unavailable";
};

export function normalizeMonitoringAudience(
  value: AccountType | string | null | undefined,
): MonitoringAudience {
  return value === "business" ? "business" : "individual";
}

/**
 * Preferences remain informational until the source is fresh and an operator
 * has explicitly moved the monitored feed out of controlled beta. This keeps
 * a future configuration change from exposing delivery controls prematurely.
 */
export function monitoringPreferencesAreInformationalOnly(
  status: MonitoringDeliveryStatus,
): boolean {
  return status.controlledBeta !== false
    || status.automaticPublication !== true
    || status.freshnessState !== "fresh";
}
