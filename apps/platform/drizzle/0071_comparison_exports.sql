-- Migration 0071: durable comparison PDF/DOCX exports.
-- Expand-only. Existing comparison rows and synchronous source artifacts are unchanged.
CREATE TABLE `comparison_exports` (
  `id` text PRIMARY KEY NOT NULL,
  `comparison_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `format` text NOT NULL,
  `status` text NOT NULL,
  `r2_key` text,
  `file_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer,
  `sha256` text,
  `idempotency_key` text NOT NULL,
  `error_code` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`comparison_id`) REFERENCES `document_comparisons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `comparison_exports_format_check` CHECK (`format` IN ('pdf','docx')),
  CONSTRAINT `comparison_exports_status_check` CHECK (`status` IN ('queued','processing','retrying','completed','failed')),
  CONSTRAINT `comparison_exports_mime_check` CHECK (
    (`format`='pdf' AND `mime_type`='application/pdf')
    OR (`format`='docx' AND `mime_type`='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ),
  CONSTRAINT `comparison_exports_size_check` CHECK (`size_bytes` IS NULL OR `size_bytes` >= 0),
  CONSTRAINT `comparison_exports_sha_check` CHECK (`sha256` IS NULL OR length(`sha256`)=64),
  CONSTRAINT `comparison_exports_completion_check` CHECK (
    (`status`='completed' AND `r2_key` IS NOT NULL AND `size_bytes` IS NOT NULL
      AND `sha256` IS NOT NULL AND `completed_at` IS NOT NULL AND `error_code` IS NULL)
    OR (`status`<>'completed' AND `completed_at` IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `comparison_exports_idempotency_uidx` ON `comparison_exports` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `comparison_exports_r2_key_uidx` ON `comparison_exports` (`r2_key`);--> statement-breakpoint
CREATE INDEX `comparison_exports_comparison_idx` ON `comparison_exports` (`comparison_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comparison_exports_workspace_idx` ON `comparison_exports` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comparison_exports_status_idx` ON `comparison_exports` (`status`,`updated_at`);--> statement-breakpoint
CREATE TRIGGER `comparison_exports_insert_guard`
BEFORE INSERT ON `comparison_exports`
WHEN NOT EXISTS (
  SELECT 1 FROM `document_comparisons` comparison
  WHERE comparison.`id`=NEW.`comparison_id`
    AND comparison.`workspace_id`=NEW.`workspace_id`
    AND comparison.`owner_user_id`=NEW.`owner_user_id`
    AND comparison.`status` IN ('completed','completed_partial')
    AND comparison.`deleted_at` IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'comparison_export_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `comparison_exports_update_guard`
BEFORE UPDATE ON `comparison_exports`
BEGIN
  SELECT RAISE(ABORT, 'comparison_export_identity_immutable') WHERE NEW.`id`<>OLD.`id`
    OR NEW.`comparison_id`<>OLD.`comparison_id` OR NEW.`workspace_id`<>OLD.`workspace_id`
    OR NEW.`owner_user_id`<>OLD.`owner_user_id` OR NEW.`format`<>OLD.`format`
    OR NEW.`file_name`<>OLD.`file_name` OR NEW.`mime_type`<>OLD.`mime_type`
    OR NEW.`idempotency_key`<>OLD.`idempotency_key` OR NEW.`created_at`<>OLD.`created_at`;
  SELECT RAISE(ABORT, 'comparison_export_transition_invalid') WHERE NOT (
    (OLD.`status`='queued' AND NEW.`status` IN ('processing','failed'))
    OR (OLD.`status`='processing' AND NEW.`status` IN ('processing','retrying','completed','failed'))
    OR (OLD.`status`='retrying' AND NEW.`status` IN ('processing','failed'))
  );
  SELECT RAISE(ABORT, 'comparison_export_completion_invalid') WHERE NEW.`status`='completed' AND (
    NEW.`r2_key` NOT LIKE 'comparison-exports/%'
    OR (NEW.`format`='pdf' AND (NEW.`mime_type`<>'application/pdf' OR NEW.`r2_key` NOT LIKE '%.pdf'))
    OR (NEW.`format`='docx' AND (NEW.`mime_type`<>'application/vnd.openxmlformats-officedocument.wordprocessingml.document' OR NEW.`r2_key` NOT LIKE '%.docx'))
    OR NEW.`size_bytes` IS NULL OR NEW.`size_bytes`<1000
    OR NEW.`sha256` IS NULL OR length(NEW.`sha256`)<>64
    OR NEW.`completed_at` IS NULL OR NEW.`error_code` IS NOT NULL
  );
  SELECT RAISE(ABORT, 'comparison_export_incomplete_has_artifact') WHERE NEW.`status`<>'completed' AND (
    NEW.`r2_key` IS NOT NULL OR NEW.`size_bytes` IS NOT NULL OR NEW.`sha256` IS NOT NULL OR NEW.`completed_at` IS NOT NULL
  );
END;
