import type { LegalSourceContext } from "../ai/provider";

type ReturnedCitation = {
  sourceId: string;
  actTitle: string;
  actIdentifier: string | null;
  article: string | null;
  excerpt: string | null;
  originalUrl: string;
  status: string;
  effectiveDate: string | null;
  verifiedAt: string;
};

/**
 * Persists only source metadata already exposed in a completed answer. The
 * direct retrieval implementation never provides this helper with raw HTML or
 * a complete legal document.
 */
export function directCitationStatements(input: {
  db: D1Database;
  sources: readonly LegalSourceContext[];
  citations: readonly ReturnedCitation[];
  aiRunId?: string;
  guestRunId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  now: string;
}): D1PreparedStatement[] {
  if ((!input.aiRunId && !input.guestRunId) || (input.aiRunId && input.guestRunId)) {
    throw new TypeError("A direct citation must belong to exactly one AI run.");
  }
  const contexts = new Map(input.sources.map((source) => [source.id, source]));
  const seen = new Set<string>();
  return input.citations.flatMap((citation) => {
    const source = contexts.get(citation.sourceId);
    if (!source || source.verificationState !== "direct_validated" || seen.has(source.officialUrl)) return [];
    seen.add(source.officialUrl);
    return [input.db.prepare(
      `INSERT INTO legal_source_references (
        id,ai_run_id,guest_run_id,conversation_id,message_id,source_kind,source_locale,
        canonical_id,source_url,canonical_url,title,act_identifier,article_reference,
        excerpt,document_status,effective_date,retrieved_at,validated_at,content_sha256,
        fetch_status,citation_validation_status,source_access_mode,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      input.aiRunId ?? null,
      input.guestRunId ?? null,
      input.conversationId ?? null,
      input.messageId ?? null,
      source.sourceType,
      source.locale,
      source.actIdentifier,
      source.officialUrl,
      source.officialUrl,
      citation.actTitle.slice(0, 500),
      citation.actIdentifier,
      citation.article,
      citation.excerpt?.slice(0, 1_200) ?? null,
      citation.status,
      citation.effectiveDate,
      source.lastCheckedAt,
      citation.verifiedAt,
      source.contentSha256,
      "success",
      "validated",
      "direct",
      input.now,
    )];
  });
}
