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

export type LegalCitationAccessMode = "direct" | "approved_package";

/**
 * Persists only source metadata already exposed in a completed answer. It is
 * shared by direct staff retrieval and the interactive verified corpus path;
 * neither path supplies raw HTML or a complete legal document here.
 */
export function legalCitationStatements(input: {
  db: D1Database;
  sources: readonly LegalSourceContext[];
  citations: readonly ReturnedCitation[];
  aiRunId?: string;
  guestRunId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  now: string;
  sourceAccessMode: LegalCitationAccessMode;
}): D1PreparedStatement[] {
  if ((!input.aiRunId && !input.guestRunId) || (input.aiRunId && input.guestRunId)) {
    throw new TypeError("A direct citation must belong to exactly one AI run.");
  }
  const contexts = new Map(input.sources.map((source) => [source.id, source]));
  const seen = new Set<string>();
  return input.citations.flatMap((citation) => {
    const source = contexts.get(citation.sourceId);
    const validated = input.sourceAccessMode === "direct"
      ? source?.verificationState === "direct_validated"
      : source?.verificationState === "verified";
    const officialLex = (() => {
      try {
        const url = new URL(source?.officialUrl ?? "");
        return url.protocol === "https:" && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz");
      } catch { return false; }
    })();
    if (!source || source.sourceType !== "lex" || !officialLex || !validated || seen.has(source.officialUrl)) return [];
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
      null,
      citation.status,
      citation.effectiveDate,
      source.lastCheckedAt,
      citation.verifiedAt,
      source.contentSha256,
      "success",
      "validated",
      input.sourceAccessMode,
      input.now,
    )];
  });
}

/** Compatibility wrapper for staff-only live direct retrieval callers. */
export function directCitationStatements(input: Omit<Parameters<typeof legalCitationStatements>[0], "sourceAccessMode">) {
  return legalCitationStatements({ ...input, sourceAccessMode: "direct" });
}
