-- Migration 0101: permit the durable document-index intent in the same
-- transaction that finalizes an analysis. The queue consumer independently
-- requires a completed analysis before it reads private extracted text.
DROP TRIGGER `user_document_index_jobs_source_guard`;--> statement-breakpoint
CREATE TRIGGER `user_document_index_jobs_source_guard`
BEFORE INSERT ON `user_document_index_jobs`
WHEN NOT EXISTS (
  SELECT 1
  FROM `analysis_document_versions` version
  JOIN `document_analyses` analysis ON analysis.`id`=version.`analysis_id`
  WHERE version.`id`=NEW.`document_version_id`
    AND version.`analysis_id`=NEW.`analysis_id`
    AND version.`workspace_id`=NEW.`workspace_id`
    AND version.`owner_user_id`=NEW.`owner_user_id`
    AND version.`sha256`=NEW.`source_hash`
    AND analysis.`workspace_id`=NEW.`workspace_id`
    AND analysis.`owner_user_id`=NEW.`owner_user_id`
    AND analysis.`status` IN ('persisting','completed')
)
BEGIN
  SELECT RAISE(ABORT, 'user document index source unavailable');
END;
