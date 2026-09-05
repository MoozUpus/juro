import type { DatabaseSync } from "node:sqlite";

const ORPHAN_OBJECT_COUNT_SQL = `WITH selected_run(run_id) AS (VALUES (?)),
  referenced_objects(object_kind,r2_key) AS (
    SELECT 'raw_capture',raw_object_r2_key FROM legal_complete_corpus_records
      WHERE run_id=(SELECT run_id FROM selected_run)
    UNION SELECT 'normalized_revision',normalized_object_r2_key
      FROM legal_complete_corpus_records WHERE run_id=(SELECT run_id FROM selected_run)
    UNION SELECT 'provision_rendition',provision_object_r2_key
      FROM legal_complete_corpus_records WHERE run_id=(SELECT run_id FROM selected_run)
    UNION SELECT 'raw_capture',raw_object_r2_key FROM legal_complete_corpus_quarantines
      WHERE run_id=(SELECT run_id FROM selected_run)
    UNION SELECT 'normalized_revision',normalized_object_r2_key
      FROM legal_complete_corpus_quarantines WHERE run_id=(SELECT run_id FROM selected_run)
    UNION SELECT 'plan',plan_r2_key FROM legal_complete_corpus_pages
      WHERE run_id=(SELECT run_id FROM selected_run)
    UNION SELECT 'plan',r2_key FROM legal_complete_corpus_lane_reports
      WHERE run_id=(SELECT run_id FROM selected_run) AND report_kind='plan'
    UNION SELECT 'plan',plan_r2_key FROM legal_complete_corpus_runs
      WHERE id=(SELECT run_id FROM selected_run)
    UNION SELECT 'reconstruction',r2_key FROM legal_complete_corpus_lane_reports
      WHERE run_id=(SELECT run_id FROM selected_run) AND report_kind='reconstruction'
    UNION SELECT 'reconstruction',final_reconstruction_r2_key
      FROM legal_complete_corpus_runs WHERE id=(SELECT run_id FROM selected_run)
    UNION SELECT 'corpus_snapshot',r2_key FROM legal_complete_corpus_snapshots
      WHERE run_id=(SELECT run_id FROM selected_run)
  )
  SELECT count(*) AS count FROM legal_complete_corpus_objects object
  LEFT JOIN referenced_objects referenced
    ON referenced.object_kind=object.object_kind AND referenced.r2_key=object.r2_key
  WHERE object.run_id=(SELECT run_id FROM selected_run)
    AND object.object_kind<>'manifest' AND referenced.r2_key IS NULL`;

export function countTicket29OrphanObjects(database: DatabaseSync, runId: string): number {
  return (database.prepare(ORPHAN_OBJECT_COUNT_SQL).get(runId) as { count: number }).count;
}
