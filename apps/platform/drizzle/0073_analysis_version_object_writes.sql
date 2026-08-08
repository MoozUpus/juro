-- Migration 0073: durable R2 write intents for immutable analysis versions.
-- Expand-only. New writes are fenced before R2 attachment; stale unreferenced
-- objects can be reconciled without guessing from bucket listings.
CREATE TABLE `analysis_version_object_writes` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `target_version` integer NOT NULL,
  `source_kind` text NOT NULL,
  `r2_key` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `sha256` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `version_id` text,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `last_error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `reconciled_at` text,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `analysis_version_object_writes_version_check` CHECK (`target_version` >= 1),
  CONSTRAINT `analysis_version_object_writes_kind_check` CHECK (`source_kind` IN ('extracted','corrected')),
  CONSTRAINT `analysis_version_object_writes_size_check` CHECK (`size_bytes` > 0),
  CONSTRAINT `analysis_version_object_writes_sha_check` CHECK (length(`sha256`) = 64),
  CONSTRAINT `analysis_version_object_writes_attempt_check` CHECK (`attempt_count` >= 0),
  CONSTRAINT `analysis_version_object_writes_status_check` CHECK (`status` IN ('pending','attaching','attached','deleting','deleted')),
  CONSTRAINT `analysis_version_object_writes_evidence_check` CHECK (
    (`status` IN ('pending','attaching','deleting') AND `version_id` IS NULL AND `reconciled_at` IS NULL)
    OR (`status` = 'attached' AND `version_id` IS NOT NULL AND `reconciled_at` IS NOT NULL AND `last_error_code` IS NULL)
    OR (`status` = 'deleted' AND `version_id` IS NULL AND `reconciled_at` IS NOT NULL AND `last_error_code` IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_version_object_writes_r2_uidx` ON `analysis_version_object_writes` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_version_object_writes_version_uidx` ON `analysis_version_object_writes` (`version_id`) WHERE `version_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `analysis_version_object_writes_reconcile_idx` ON `analysis_version_object_writes` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `analysis_version_object_writes_owner_idx` ON `analysis_version_object_writes` (`owner_user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `analysis_document_versions` ADD COLUMN `object_write_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_document_versions_object_write_uidx` ON `analysis_document_versions` (`object_write_id`) WHERE `object_write_id` IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `analysis_version_object_writes_insert_guard`
BEFORE INSERT ON `analysis_version_object_writes`
WHEN NEW.`status` <> 'pending'
  OR NEW.`version_id` IS NOT NULL
  OR NEW.`attempt_count` <> 0
  OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`reconciled_at` IS NOT NULL
  OR NOT EXISTS (
    SELECT 1 FROM `document_analyses` analysis
    WHERE analysis.`id` = NEW.`analysis_id`
      AND analysis.`workspace_id` = NEW.`workspace_id`
      AND analysis.`owner_user_id` = NEW.`owner_user_id`
      AND analysis.`status` IN ('processing','persisting','completed')
      AND NEW.`r2_key` LIKE
        'analysis-versions/' || NEW.`workspace_id` || '/' || NEW.`analysis_id` || '/' || NEW.`id` || '-%'
  )
BEGIN
  SELECT RAISE(ABORT, 'analysis_version_object_write_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_version_object_writes_identity_guard`
BEFORE UPDATE ON `analysis_version_object_writes`
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`analysis_id` IS NOT OLD.`analysis_id`
  OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
  OR NEW.`owner_user_id` IS NOT OLD.`owner_user_id`
  OR NEW.`target_version` <> OLD.`target_version`
  OR NEW.`source_kind` IS NOT OLD.`source_kind`
  OR NEW.`r2_key` IS NOT OLD.`r2_key`
  OR NEW.`size_bytes` <> OLD.`size_bytes`
  OR NEW.`sha256` IS NOT OLD.`sha256`
  OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'analysis_version_object_write_identity_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_version_object_writes_transition_guard`
BEFORE UPDATE ON `analysis_version_object_writes`
WHEN NOT (
  (OLD.`status` = 'pending' AND NEW.`status` = 'pending'
    AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
    AND NEW.`attempt_count` = OLD.`attempt_count` + 1
    AND NEW.`last_error_code` IS NOT NULL)
  OR (OLD.`status` = 'pending' AND NEW.`status` = 'attaching'
    AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
    AND NEW.`attempt_count` = OLD.`attempt_count`
    AND NEW.`last_error_code` IS NULL)
  OR (OLD.`status` IN ('pending','attaching') AND NEW.`status` = 'deleting'
    AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
    AND NEW.`attempt_count` = OLD.`attempt_count` + 1
    AND NEW.`last_error_code` IS NULL)
  OR (OLD.`status` IN ('attaching','deleting') AND NEW.`status` = 'attached'
    AND NEW.`version_id` IS NOT NULL AND NEW.`reconciled_at` IS NOT NULL
    AND NEW.`attempt_count` = OLD.`attempt_count`
    AND NEW.`last_error_code` IS NULL)
  OR (OLD.`status` = 'deleting' AND NEW.`status` = 'deleted'
    AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NOT NULL
    AND NEW.`attempt_count` = OLD.`attempt_count`
    AND NEW.`last_error_code` IS NULL)
  OR (OLD.`status` = 'deleting' AND NEW.`status` = 'pending'
    AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
    AND NEW.`attempt_count` = OLD.`attempt_count`
    AND NEW.`last_error_code` IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_version_object_write_transition_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_object_write_guard`
BEFORE INSERT ON `analysis_document_versions`
WHEN NEW.`object_write_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `analysis_version_object_writes` write
  WHERE write.`id` = NEW.`object_write_id`
    AND write.`analysis_id` = NEW.`analysis_id`
    AND write.`workspace_id` = NEW.`workspace_id`
    AND write.`owner_user_id` = NEW.`owner_user_id`
    AND write.`target_version` = NEW.`version`
    AND write.`source_kind` = NEW.`source_kind`
    AND write.`r2_key` = NEW.`r2_key`
    AND write.`size_bytes` = NEW.`size_bytes`
    AND write.`sha256` = NEW.`sha256`
    AND write.`status` = 'attaching'
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_document_version_object_write_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_object_write_attach`
AFTER INSERT ON `analysis_document_versions`
WHEN NEW.`object_write_id` IS NOT NULL
BEGIN
  UPDATE `analysis_version_object_writes`
  SET `status` = 'attached',
      `version_id` = NEW.`id`,
      `last_error_code` = NULL,
      `updated_at` = NEW.`created_at`,
      `reconciled_at` = NEW.`created_at`
  WHERE `id` = NEW.`object_write_id` AND `status` = 'attaching';
END;--> statement-breakpoint
CREATE TRIGGER `analysis_version_object_writes_attachment_guard`
BEFORE UPDATE ON `analysis_version_object_writes`
WHEN NEW.`status` = 'attached' AND NOT EXISTS (
  SELECT 1 FROM `analysis_document_versions` version
  WHERE version.`id` = NEW.`version_id`
    AND version.`object_write_id` = NEW.`id`
    AND version.`analysis_id` = NEW.`analysis_id`
    AND version.`workspace_id` = NEW.`workspace_id`
    AND version.`owner_user_id` = NEW.`owner_user_id`
    AND version.`version` = NEW.`target_version`
    AND version.`source_kind` = NEW.`source_kind`
    AND version.`r2_key` = NEW.`r2_key`
    AND version.`size_bytes` = NEW.`size_bytes`
    AND version.`sha256` = NEW.`sha256`
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_version_object_write_attachment_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_object_write_immutable`
BEFORE UPDATE OF `object_write_id` ON `analysis_document_versions`
BEGIN
  SELECT RAISE(ABORT, 'analysis_document_version_object_write_immutable');
END;
