ALTER TABLE `document_analyses` ADD `resource_scope` text CHECK (`resource_scope` IS NULL OR `resource_scope` = 'interactive_analysis');--> statement-breakpoint
ALTER TABLE `document_analyses` ADD `abandoned_after` text;--> statement-breakpoint
ALTER TABLE `document_analyses` ADD `deletion_requested_at` text;--> statement-breakpoint
ALTER TABLE `document_analyses` ADD `deletion_reason` text CHECK (`deletion_reason` IS NULL OR `deletion_reason` IN ('owner_request','abandoned_upload'));--> statement-breakpoint
ALTER TABLE `document_analyses` ADD `purge_attempt_count` integer DEFAULT 0 NOT NULL CHECK (`purge_attempt_count` >= 0);--> statement-breakpoint
ALTER TABLE `document_analyses` ADD `last_purge_error` text;--> statement-breakpoint

UPDATE `document_analyses`
SET `resource_scope` = 'interactive_analysis',
    `abandoned_after` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+24 hours')
WHERE EXISTS (
  SELECT 1
  FROM `idempotency_keys` allocation
  WHERE allocation.`result_ref` = `document_analyses`.`id`
    AND allocation.`scope` LIKE 'document-analysis-upload:%'
)
OR EXISTS (
  SELECT 1
  FROM `builder_document_analysis_handoffs` handoff
  WHERE handoff.`analysis_id` = `document_analyses`.`id`
);--> statement-breakpoint

CREATE INDEX `document_analyses_resource_quota_idx`
  ON `document_analyses` (`workspace_id`,`owner_user_id`,`resource_scope`,`deletion_requested_at`);--> statement-breakpoint
CREATE INDEX `document_analyses_abandoned_idx`
  ON `document_analyses` (`resource_scope`,`deletion_requested_at`,`abandoned_after`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `document_analyses_purge_retry_idx`
  ON `document_analyses` (`deletion_requested_at`,`updated_at`,`id`);--> statement-breakpoint

CREATE TABLE `analysis_export_idempotency_registry` (
  `idempotency_key` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `export_kind` text NOT NULL CHECK (`export_kind` IN ('json','report')),
  `created_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `analysis_export_idempotency_registry_analysis_idx`
  ON `analysis_export_idempotency_registry` (`analysis_id`,`created_at`);--> statement-breakpoint

INSERT OR IGNORE INTO `analysis_export_idempotency_registry`
  (`idempotency_key`,`analysis_id`,`export_kind`,`created_at`)
SELECT export.`idempotency_key`,export.`analysis_id`,'json',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `analysis_exports` export;--> statement-breakpoint

INSERT OR IGNORE INTO `analysis_export_idempotency_registry`
  (`idempotency_key`,`analysis_id`,`export_kind`,`created_at`)
SELECT export.`idempotency_key`,export.`analysis_id`,'report',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `analysis_report_exports` export;--> statement-breakpoint

CREATE TRIGGER `document_analyses_interactive_retention_guard`
BEFORE INSERT ON `document_analyses`
WHEN NEW.`resource_scope` = 'interactive_analysis' AND NEW.`abandoned_after` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_RETENTION_REQUIRED');
END;--> statement-breakpoint

CREATE TRIGGER `document_analyses_interactive_count_quota_guard`
BEFORE INSERT ON `document_analyses`
WHEN NEW.`resource_scope` = 'interactive_analysis' AND (
    SELECT count(*)
    FROM `document_analyses` analysis
    WHERE analysis.`workspace_id` = NEW.`workspace_id`
      AND analysis.`owner_user_id` = NEW.`owner_user_id`
      AND analysis.`resource_scope` = 'interactive_analysis'
  ) >= 20
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_COUNT_QUOTA_EXCEEDED');
END;--> statement-breakpoint

CREATE TRIGGER `document_analyses_interactive_byte_quota_guard`
BEFORE INSERT ON `document_analyses`
WHEN NEW.`resource_scope` = 'interactive_analysis' AND (
    SELECT coalesce(sum(file.`size_bytes`), 0)
    FROM `document_analyses` analysis
    JOIN `document_files` file ON file.`id` = analysis.`uploaded_file_id`
    WHERE analysis.`workspace_id` = NEW.`workspace_id`
      AND analysis.`owner_user_id` = NEW.`owner_user_id`
      AND analysis.`resource_scope` = 'interactive_analysis'
  ) + coalesce((
    SELECT file.`size_bytes`
    FROM `document_files` file
    WHERE file.`id` = NEW.`uploaded_file_id`
      AND file.`workspace_id` = NEW.`workspace_id`
      AND file.`owner_user_id` = NEW.`owner_user_id`
  ), 1073741825) > 1073741824
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_BYTE_QUOTA_EXCEEDED');
END;--> statement-breakpoint

CREATE TRIGGER `document_analyses_deletion_reference_guard`
BEFORE UPDATE OF `deletion_requested_at` ON `document_analyses`
WHEN OLD.`deletion_requested_at` IS NULL AND NEW.`deletion_requested_at` IS NOT NULL AND (
  EXISTS (
    SELECT 1 FROM `legal_corpus_owner_upload_requests` owner_upload
    WHERE owner_upload.`analysis_id`=OLD.`id` OR owner_upload.`file_id`=OLD.`uploaded_file_id`
  )
  OR EXISTS (
    SELECT 1 FROM `document_comparisons` comparison
    WHERE comparison.`version_one_file_id`=OLD.`uploaded_file_id`
       OR comparison.`version_two_file_id`=OLD.`uploaded_file_id`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_IN_USE');
END;--> statement-breakpoint

CREATE TRIGGER `document_comparisons_analysis_deletion_guard`
BEFORE INSERT ON `document_comparisons`
WHEN EXISTS (
  SELECT 1 FROM `document_analyses` analysis
  WHERE analysis.`deletion_requested_at` IS NOT NULL
    AND analysis.`uploaded_file_id` IN (NEW.`version_one_file_id`,NEW.`version_two_file_id`)
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_DELETION_PENDING');
END;--> statement-breakpoint

CREATE TRIGGER `document_comparisons_analysis_deletion_update_guard`
BEFORE UPDATE OF `version_one_file_id`,`version_two_file_id` ON `document_comparisons`
WHEN EXISTS (
  SELECT 1 FROM `document_analyses` analysis
  WHERE analysis.`deletion_requested_at` IS NOT NULL
    AND analysis.`uploaded_file_id` IN (NEW.`version_one_file_id`,NEW.`version_two_file_id`)
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_DELETION_PENDING');
END;--> statement-breakpoint

CREATE TRIGGER `owner_corpus_analysis_deletion_guard`
BEFORE INSERT ON `legal_corpus_owner_upload_requests`
WHEN EXISTS (
  SELECT 1 FROM `document_analyses` analysis
  WHERE analysis.`deletion_requested_at` IS NOT NULL
    AND (analysis.`id`=NEW.`analysis_id` OR analysis.`uploaded_file_id`=NEW.`file_id`)
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_DELETION_PENDING');
END;--> statement-breakpoint

CREATE TRIGGER `owner_corpus_analysis_deletion_update_guard`
BEFORE UPDATE OF `analysis_id`,`file_id` ON `legal_corpus_owner_upload_requests`
WHEN EXISTS (
  SELECT 1 FROM `document_analyses` analysis
  WHERE analysis.`deletion_requested_at` IS NOT NULL
    AND (analysis.`id`=NEW.`analysis_id` OR analysis.`uploaded_file_id`=NEW.`file_id`)
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_DELETION_PENDING');
END;--> statement-breakpoint

CREATE TRIGGER `analysis_exports_resource_quota_guard`
BEFORE INSERT ON `analysis_exports`
WHEN (
  (
    (SELECT count(*) FROM `analysis_exports` export WHERE export.`analysis_id`=NEW.`analysis_id`)
    + (SELECT count(*) FROM `analysis_report_exports` export WHERE export.`analysis_id`=NEW.`analysis_id`)
  ) >= 20
  OR (
    SELECT count(*) FROM `workspace_audit_events` event
    WHERE event.`entity_type`='analysis_export' AND event.`action`='export_requested'
      AND CASE WHEN json_valid(event.`metadata_json`)
        THEN json_extract(event.`metadata_json`,'$.analysisId') END=NEW.`analysis_id`
  ) >= 20
)
BEGIN
  SELECT RAISE(ABORT, 'ANALYSIS_EXPORT_CAPACITY_EXCEEDED');
END;--> statement-breakpoint

CREATE TRIGGER `analysis_exports_cross_idempotency_guard`
BEFORE INSERT ON `analysis_exports`
WHEN EXISTS (
  SELECT 1 FROM `analysis_report_exports` export
  WHERE export.`idempotency_key`=NEW.`idempotency_key`
)
BEGIN
  SELECT RAISE(ABORT, 'ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT');
END;--> statement-breakpoint

CREATE TRIGGER `analysis_exports_registry_guard`
BEFORE INSERT ON `analysis_exports`
WHEN EXISTS (
  SELECT 1 FROM `analysis_export_idempotency_registry` registry
  WHERE registry.`idempotency_key`=NEW.`idempotency_key`
    AND (registry.`analysis_id`<>NEW.`analysis_id` OR registry.`export_kind`<>'json')
)
BEGIN
  SELECT RAISE(ABORT, 'ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT');
END;--> statement-breakpoint

CREATE TRIGGER `analysis_report_exports_resource_quota_guard`
BEFORE INSERT ON `analysis_report_exports`
WHEN (
  (
    (SELECT count(*) FROM `analysis_exports` export WHERE export.`analysis_id`=NEW.`analysis_id`)
    + (SELECT count(*) FROM `analysis_report_exports` export WHERE export.`analysis_id`=NEW.`analysis_id`)
  ) >= 20
  OR (
    SELECT count(*) FROM `workspace_audit_events` event
    WHERE event.`entity_type`='analysis_export' AND event.`action`='export_requested'
      AND CASE WHEN json_valid(event.`metadata_json`)
        THEN json_extract(event.`metadata_json`,'$.analysisId') END=NEW.`analysis_id`
  ) >= 20
)
BEGIN
  SELECT RAISE(ABORT, 'ANALYSIS_EXPORT_CAPACITY_EXCEEDED');
END;--> statement-breakpoint

CREATE TRIGGER `analysis_report_exports_cross_idempotency_guard`
BEFORE INSERT ON `analysis_report_exports`
WHEN EXISTS (
  SELECT 1 FROM `analysis_exports` export
  WHERE export.`idempotency_key`=NEW.`idempotency_key`
)
BEGIN
  SELECT RAISE(ABORT, 'ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT');
END;--> statement-breakpoint

CREATE TRIGGER `analysis_report_exports_registry_guard`
BEFORE INSERT ON `analysis_report_exports`
WHEN EXISTS (
  SELECT 1 FROM `analysis_export_idempotency_registry` registry
  WHERE registry.`idempotency_key`=NEW.`idempotency_key`
    AND (registry.`analysis_id`<>NEW.`analysis_id` OR registry.`export_kind`<>'report')
)
BEGIN
  SELECT RAISE(ABORT, 'ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT');
END;--> statement-breakpoint

CREATE TRIGGER `user_document_index_deletion_guard`
BEFORE UPDATE OF `status` ON `user_document_index_jobs`
WHEN NEW.`status`='processing' AND EXISTS (
  SELECT 1 FROM `document_analyses` analysis
  WHERE analysis.`id`=NEW.`analysis_id` AND analysis.`deletion_requested_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_DELETION_PENDING');
END;
