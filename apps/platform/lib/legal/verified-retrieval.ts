import type { LegalSourceContext } from "../ai/provider";
import { filterTrustedVerifiedLegalSources } from "./source-trust";

export type VerifiedLegalRetrieval = {
  sources: LegalSourceContext[];
  legalDatabaseAsOf: string;
};

export function legalSearchKeywords(
  value: string,
  locale: "ru" | "uz",
  limit = 8,
): string[] {
  return [...new Set(
    value
      .slice(0, 80_000)
      .toLocaleLowerCase(locale === "ru" ? "ru" : "uz")
      .match(/[\p{L}\p{N}]{5,}/gu) ?? [],
  )].slice(0, Math.max(1, Math.min(12, limit)));
}

/**
 * Exact lexical retrieval over only activated, verified official versions.
 * The trust filter is applied again after D1 so SQL status flags never become
 * the sole authorization/trust boundary.
 */
export async function retrieveVerifiedLegalSources(
  db: D1Database,
  query: string,
  locale: "ru" | "uz",
  limit = 8,
): Promise<VerifiedLegalRetrieval> {
  const freshness = await db.prepare(
    "SELECT MAX(finished_at) AS asOf FROM source_sync_runs WHERE status='completed'",
  ).first<{ asOf: string | null }>();
  const legalDatabaseAsOf = freshness?.asOf || "unavailable";
  const keywords = legalSearchKeywords(query, locale);
  if (!keywords.length) return { sources: [], legalDatabaseAsOf };

  const conditions = keywords.map(() => "lower(ss.body_text) LIKE ?").join(" OR ");
  const rows = await db.prepare(
    `SELECT s.id,s.official_url AS officialUrl,s.act_title AS actTitle,s.act_identifier AS actIdentifier,
      s.published_at AS publishedAt,s.revision_date AS revisionDate,s.last_checked_at AS lastCheckedAt,
      s.locale,s.source_type AS sourceType,s.status,s.verification_state AS verificationState,
      s.verified_at AS verifiedAt,s.content_sha256 AS contentSha256,
      ss.article,substr(ss.body_text,1,1200) AS excerpt,
      COALESCE(v.effective_at,s.effective_at) AS effectiveDate
     FROM legal_sources s
     JOIN legal_source_current_activations a ON a.source_id=s.id
     JOIN legal_source_versions v ON v.id=a.version_id AND v.status='verified'
     JOIN legal_source_sections ss ON ss.version_id=a.version_id
     WHERE s.status='verified' AND s.verification_state='verified'
       AND s.verified_at IS NOT NULL AND s.content_sha256 IS NOT NULL AND s.locale=?
       AND (${conditions})
     ORDER BY s.last_checked_at DESC,ss.sequence ASC LIMIT 24`,
  ).bind(locale, ...keywords.map((keyword) => `%${keyword}%`)).all();

  const trusted = filterTrustedVerifiedLegalSources(
    rows.results as unknown as LegalSourceContext[],
  );
  const unique = new Map<string, LegalSourceContext>();
  for (const source of trusted) {
    if (source.excerpt?.trim() && !unique.has(source.id)) unique.set(source.id, source);
  }
  return {
    sources: [...unique.values()].slice(0, Math.max(1, Math.min(12, limit))),
    legalDatabaseAsOf,
  };
}
