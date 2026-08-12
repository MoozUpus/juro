import {
  isTrustedVerifiedLegalSource,
  type LegalSourceIdentity,
} from "./source-trust";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/**
 * Legislation-monitoring entries are only useful while the exact official
 * source they point to has a recent recorded check. This deliberately does
 * not claim that JURO has exhaustive coverage of Lex.uz or Advice.uz.
 */
export const MONITORING_SOURCE_MAX_AGE_DAYS = 7;

export type MonitoringSourceIdentity = LegalSourceIdentity & {
  lastCheckedAt?: string | null;
};

export type MonitoringFreshness = {
  state: "fresh" | "stale" | "unavailable";
  latestCheckedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  freshSourceCount: number;
  trustedSourceCount: number;
};

function checkedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isFreshTrustedMonitoringSource(
  source: MonitoringSourceIdentity,
  now = new Date(),
): boolean {
  if (!isTrustedVerifiedLegalSource(source)) return false;
  const sourceCheckedAt = checkedAt(source.lastCheckedAt);
  if (sourceCheckedAt === null || sourceCheckedAt > now.getTime() + MAX_CLOCK_SKEW_MS) {
    return false;
  }
  return now.getTime() - sourceCheckedAt <= MONITORING_SOURCE_MAX_AGE_DAYS * DAY_MS;
}

export function summarizeMonitoringFreshness(
  sources: readonly MonitoringSourceIdentity[],
  now = new Date(),
): MonitoringFreshness {
  const trusted = sources.filter(isTrustedVerifiedLegalSource);
  const dated = trusted
    .map((source) => ({ source, timestamp: checkedAt(source.lastCheckedAt) }))
    .filter((item): item is { source: MonitoringSourceIdentity; timestamp: number } =>
      item.timestamp !== null && item.timestamp <= now.getTime() + MAX_CLOCK_SKEW_MS,
    );
  const latestTimestamp = dated.reduce<number | null>(
    (latest, item) => latest === null || item.timestamp > latest ? item.timestamp : latest,
    null,
  );
  const freshSourceCount = trusted.filter((source) =>
    isFreshTrustedMonitoringSource(source, now),
  ).length;
  const ageDays = latestTimestamp === null
    ? null
    : Math.floor(Math.max(0, now.getTime() - latestTimestamp) / DAY_MS);

  return {
    state: freshSourceCount > 0 ? "fresh" : trusted.length > 0 ? "stale" : "unavailable",
    latestCheckedAt: latestTimestamp === null ? null : new Date(latestTimestamp).toISOString(),
    ageDays,
    maxAgeDays: MONITORING_SOURCE_MAX_AGE_DAYS,
    freshSourceCount,
    trustedSourceCount: trusted.length,
  };
}
