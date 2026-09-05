import type { DatabaseSync } from "node:sqlite";

export function countTicket29ProvenanceGaps(database: DatabaseSync, runId: string): number {
  return (database.prepare(`WITH source_versions AS MATERIALIZED (
      SELECT DISTINCT source_version_id FROM legal_complete_corpus_records WHERE run_id=?
    ), alias_evidence AS MATERIALIZED (
      SELECT owner_id,
        max(CASE WHEN alias_kind='raw_capture' THEN 1 ELSE 0 END) AS has_raw,
        max(CASE WHEN alias_kind='normalized_revision' THEN 1 ELSE 0 END) AS has_normalized
      FROM legal_complete_corpus_aliases WHERE run_id=? GROUP BY owner_id
    ), lineage_evidence AS MATERIALIZED (
      SELECT DISTINCT source_version_id FROM legal_complete_corpus_lineage_refs WHERE run_id=?
    ) SELECT count(*) AS count FROM source_versions source
      LEFT JOIN alias_evidence alias ON alias.owner_id=source.source_version_id
      LEFT JOIN lineage_evidence lineage ON lineage.source_version_id=source.source_version_id
      WHERE coalesce(alias.has_raw,0)<>1 OR coalesce(alias.has_normalized,0)<>1
        OR lineage.source_version_id IS NULL`).get(runId, runId, runId) as { count: number }).count;
}
