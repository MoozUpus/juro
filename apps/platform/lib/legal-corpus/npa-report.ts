import { NPA_MASTER_TARGETS, npaAsOfDate } from "./npa-master-registry";

export type NpaIngestionReport = Readonly<{
  targetNpas: number;
  located: number;
  verified: number;
  active: number;
  future: number;
  manualReview: number;
  documentsIngested: number;
  articlesIngested: number;
  chunksGenerated: number;
  embeddingsCreated: number;
  errors: number;
  warnings: number;
  asOfDate: string;
  lastVerification: string | null;
}>;

function count(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** A read-only, auditable report; it never turns a partial corpus into success. */
export async function buildNpaIngestionReport(
  db: D1Database,
  asOfDate = npaAsOfDate(),
): Promise<NpaIngestionReport> {
  const row = await db.prepare(`SELECT
      count(target.document_key) AS targetNpas,
      sum(CASE WHEN state.candidate_source_url IS NOT NULL THEN 1 ELSE 0 END) AS located,
      sum(CASE WHEN registry.document_key IS NOT NULL AND registry.status<>'manual_review' THEN 1 ELSE 0 END) AS verified,
      sum(CASE WHEN registry.status='active' THEN 1 ELSE 0 END) AS active,
      sum(CASE WHEN registry.status='future' THEN 1 ELSE 0 END) AS future,
      sum(CASE WHEN state.status='manual_review' OR registry.status='manual_review' THEN 1 ELSE 0 END) AS manualReview,
      count(registry.document_key) AS documentsIngested,
      coalesce(sum(registry.article_count),0) AS articlesIngested,
      coalesce(sum(registry.chunk_count),0) AS chunksGenerated,
      (SELECT count(*) FROM npa_chunk_metadata AS npaChunk
        INNER JOIN npa_document_versions AS version ON version.id=npaChunk.npa_document_version_id
        INNER JOIN npa_master_targets AS embeddingTarget ON embeddingTarget.document_key=version.document_key
        INNER JOIN legal_corpus_chunks AS chunk ON chunk.id=npaChunk.chunk_id
        WHERE embeddingTarget.target_set='mandatory' AND version.status='active'
          AND chunk.dense_vector_id IS NOT NULL) AS embeddingsCreated,
      (SELECT count(*) FROM npa_manual_review_report WHERE resolved_at IS NULL) AS errors,
      (SELECT count(*) FROM npa_manual_review_report WHERE resolved_at IS NOT NULL) AS warnings,
      max(registry.last_checked_at) AS lastVerification
    FROM npa_master_targets AS target
    LEFT JOIN npa_discovery_state AS state ON state.document_key=target.document_key
    LEFT JOIN npa_master_registry AS registry ON registry.document_key=target.document_key
    WHERE target.target_set='mandatory'`).first<Record<string, unknown>>();
  if (!row || count(row.targetNpas) !== NPA_MASTER_TARGETS.length) {
    throw new TypeError("NPA_REPORT_TARGET_SET_INTEGRITY_REJECTED");
  }
  return {
    targetNpas: count(row.targetNpas),
    located: count(row.located), verified: count(row.verified),
    active: count(row.active), future: count(row.future), manualReview: count(row.manualReview),
    documentsIngested: count(row.documentsIngested), articlesIngested: count(row.articlesIngested),
    chunksGenerated: count(row.chunksGenerated), embeddingsCreated: count(row.embeddingsCreated),
    errors: count(row.errors), warnings: count(row.warnings), asOfDate,
    lastVerification: typeof row.lastVerification === "string" ? row.lastVerification : null,
  };
}

export async function npaMasterRegistryRows(db: D1Database): Promise<unknown[]> {
  const rows = await db.prepare(`SELECT registry.*, target.target_set,
      coalesce(group_concat(language.language, ','),'') AS languages
    FROM npa_master_registry AS registry
    INNER JOIN npa_master_targets AS target ON target.document_key=registry.document_key
    LEFT JOIN npa_language_records AS language ON language.document_key=registry.document_key
    GROUP BY registry.document_key
    ORDER BY target.target_set,registry.document_key`).all();
  return rows.results;
}

export async function npaVersionRows(db: D1Database): Promise<unknown[]> {
  const rows = await db.prepare(`SELECT * FROM npa_document_versions
    ORDER BY document_key,language,version_effective_from`).all();
  return rows.results;
}

export async function npaManualReviewRows(db: D1Database): Promise<unknown[]> {
  const rows = await db.prepare(`SELECT * FROM npa_manual_review_report
    ORDER BY resolved_at IS NOT NULL,created_at,document_key`).all();
  return rows.results;
}
