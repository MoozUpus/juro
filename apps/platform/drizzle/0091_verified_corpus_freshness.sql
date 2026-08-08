-- Migration 0091: a corpus run is fresh only when every fetched source is the
-- currently activated, staff-published and verified version.
DROP TRIGGER `source_sync_runs_insert_guard`;
--> statement-breakpoint
DROP TRIGGER `source_sync_runs_update_guard`;
--> statement-breakpoint
CREATE TRIGGER `source_sync_runs_insert_guard`
BEFORE INSERT ON `source_sync_runs`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'source sync scope invalid')
  WHERE NEW.`source_kind` NOT IN ('lex','advice')
     OR NEW.`environment` NOT IN ('development','staging','production');
  SELECT RAISE(ABORT, 'source sync status invalid')
  WHERE NEW.`status` NOT IN ('running','success','partial','failed','cancelled');
  SELECT RAISE(ABORT, 'source sync completion evidence invalid')
  WHERE (NEW.`status`='running' AND NEW.`finished_at` IS NOT NULL)
     OR (NEW.`status`<>'running' AND NEW.`finished_at` IS NULL);
  SELECT RAISE(ABORT, 'SOURCE_SYNC_COUNTERS_INVALID')
  WHERE NEW.`discovered_count`<0 OR NEW.`fetched_count`<0
     OR NEW.`changed_count`<0 OR NEW.`verified_count`<0
     OR NEW.`error_count`<0 OR NEW.`fetched_count`>NEW.`discovered_count`
     OR NEW.`changed_count`+NEW.`verified_count`>NEW.`fetched_count`;
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_SUCCESS_UNVERIFIED')
  WHERE NEW.`run_type` IN ('initial_corpus','scheduled_corpus','manual_corpus')
    AND NEW.`status`='success'
    AND (
      NEW.`discovered_count`=0
      OR NEW.`fetched_count`<>NEW.`discovered_count`
      OR NEW.`verified_count`<>NEW.`discovered_count`
      OR NEW.`changed_count`<>0
      OR NEW.`error_count`<>0
    );
END;
--> statement-breakpoint
CREATE TRIGGER `source_sync_runs_update_guard`
BEFORE UPDATE ON `source_sync_runs`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'SOURCE_SYNC_IDENTITY_IMMUTABLE')
  WHERE NEW.`id`<>OLD.`id`
     OR NEW.`environment`<>OLD.`environment`
     OR NEW.`source_kind`<>OLD.`source_kind`
     OR NEW.`run_type`<>OLD.`run_type`
     OR NEW.`lock_key`<>OLD.`lock_key`
     OR NEW.`started_at`<>OLD.`started_at`
     OR NEW.`created_at`<>OLD.`created_at`;
  SELECT RAISE(ABORT, 'SOURCE_SYNC_TERMINAL_IMMUTABLE')
  WHERE OLD.`status`<>'running' AND (
    NEW.`status`<>OLD.`status`
    OR NEW.`discovered_count`<>OLD.`discovered_count`
    OR NEW.`fetched_count`<>OLD.`fetched_count`
    OR NEW.`changed_count`<>OLD.`changed_count`
    OR NEW.`verified_count`<>OLD.`verified_count`
    OR NEW.`error_count`<>OLD.`error_count`
    OR coalesce(NEW.`finished_at`,'')<>coalesce(OLD.`finished_at`,'')
    OR coalesce(NEW.`error_summary`,'')<>coalesce(OLD.`error_summary`,'')
  );
  SELECT RAISE(ABORT, 'source sync status invalid')
  WHERE NEW.`status` NOT IN ('running','success','partial','failed','cancelled');
  SELECT RAISE(ABORT, 'source sync completion evidence invalid')
  WHERE (NEW.`status`='running' AND NEW.`finished_at` IS NOT NULL)
     OR (NEW.`status`<>'running' AND NEW.`finished_at` IS NULL);
  SELECT RAISE(ABORT, 'SOURCE_SYNC_COUNTERS_INVALID')
  WHERE NEW.`discovered_count`<0 OR NEW.`fetched_count`<0
     OR NEW.`changed_count`<0 OR NEW.`verified_count`<0
     OR NEW.`error_count`<0 OR NEW.`fetched_count`>NEW.`discovered_count`
     OR NEW.`changed_count`+NEW.`verified_count`>NEW.`fetched_count`;
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_SUCCESS_UNVERIFIED')
  WHERE NEW.`run_type` IN ('initial_corpus','scheduled_corpus','manual_corpus')
    AND NEW.`status`='success'
    AND (
      NEW.`discovered_count`=0
      OR NEW.`fetched_count`<>NEW.`discovered_count`
      OR NEW.`verified_count`<>NEW.`discovered_count`
      OR NEW.`changed_count`<>0
      OR NEW.`error_count`<>0
    );
END;
--> statement-breakpoint
CREATE TRIGGER `source_sync_runs_delete_guard`
BEFORE DELETE ON `source_sync_runs`
BEGIN
  SELECT RAISE(ABORT, 'SOURCE_SYNC_RUN_IMMUTABLE');
END;
