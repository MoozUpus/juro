-- Migration 0100: replace dynamic LIKE key guards with exact immutable keys.
-- D1 rejects sufficiently long dynamic LIKE patterns with SQLITE_ERROR
-- ("LIKE or GLOB pattern too complex"). The generated object key is fully
-- deterministic, so equality is both compatible and stricter than a prefix
-- match. No stored object, table, or tenant relationship is changed.
DROP TRIGGER `analysis_version_object_writes_insert_guard`;--> statement-breakpoint
CREATE TRIGGER `analysis_version_object_writes_insert_guard`
BEFORE INSERT ON `analysis_version_object_writes`
WHEN NEW.`status` <> 'pending'
  OR NEW.`version_id` IS NOT NULL
  OR NEW.`attempt_count` <> 0
  OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`reconciled_at` IS NOT NULL
  OR NEW.`r2_key` <>
    'analysis-versions/' || NEW.`workspace_id` || '/' || NEW.`analysis_id` || '/' ||
    NEW.`id` || '-' || NEW.`target_version` || '-' || NEW.`sha256` || '.md'
  OR NOT EXISTS (
    SELECT 1 FROM `document_analyses` analysis
    WHERE analysis.`id` = NEW.`analysis_id`
      AND analysis.`workspace_id` = NEW.`workspace_id`
      AND analysis.`owner_user_id` = NEW.`owner_user_id`
      AND analysis.`status` IN ('processing','persisting','completed')
  )
BEGIN
  SELECT RAISE(ABORT, 'analysis_version_object_write_source_mismatch');
END;--> statement-breakpoint

DROP TRIGGER `builder_version_writes_insert_guard`;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_insert_guard`
BEFORE INSERT ON `builder_document_version_object_writes`
WHEN NEW.`status`<>'pending'
  OR NEW.`version_id` IS NOT NULL
  OR NEW.`attempt_count`<>0
  OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`reconciled_at` IS NOT NULL
  OR NEW.`r2_key` <>
    'builder-document-versions/' || NEW.`workspace_id` || '/' || NEW.`document_id` || '/' ||
    NEW.`id` || '-' || NEW.`target_revision` || '-' || NEW.`sha256` || '.json'
  OR NOT EXISTS (
    SELECT 1 FROM `workspace_members` member
    JOIN `documents` document ON document.`workspace_id`=member.`workspace_id`
    WHERE member.`workspace_id`=NEW.`workspace_id`
      AND member.`user_id`=NEW.`owner_user_id`
      AND member.`status`='active'
      AND document.`id`=NEW.`document_id`
      AND document.`workspace_id`=NEW.`workspace_id`
      AND document.`owner_user_id`=NEW.`owner_user_id`
      AND document.`revision`=NEW.`source_revision`
      AND document.`archived_at` IS NULL
  )
  OR (NEW.`source`='suggestion' AND NOT EXISTS (
    SELECT 1 FROM `document_change_proposals` proposal
    WHERE proposal.`id`=NEW.`source_entity_id`
      AND proposal.`document_id`=NEW.`document_id`
      AND proposal.`status`='pending'
      AND proposal.`old_text`<>proposal.`new_text`
  ))
  OR (NEW.`source`='analysis_correction' AND NOT EXISTS (
    SELECT 1 FROM `builder_document_analysis_handoffs` handoff
    JOIN `analysis_document_versions` version ON version.`analysis_id`=handoff.`analysis_id`
    WHERE version.`id`=NEW.`source_entity_id`
      AND version.`workspace_id`=NEW.`workspace_id`
      AND version.`owner_user_id`=NEW.`owner_user_id`
      AND version.`source_kind`='corrected'
      AND handoff.`document_id`=NEW.`document_id`
      AND handoff.`status`='ready'
  ))
BEGIN
  SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_SOURCE_MISMATCH');
END;
