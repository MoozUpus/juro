CREATE TABLE `file_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`file_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text NOT NULL,
	`method` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`source_sha256` text NOT NULL,
	`r2_key` text,
	`text_sha256` text,
	`size_bytes` integer,
	`token_estimate` integer,
	`detected_mime_type` text,
	`detected_language` text,
	`text_quality` text,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_extractions_status_check" CHECK("file_extractions"."status" IN ('queued','processing','retrying','completed','failed')),
	CONSTRAINT "file_extractions_method_check" CHECK("file_extractions"."method" = 'workers_ai_markdown'),
	CONSTRAINT "file_extractions_source_sha_check" CHECK(length("file_extractions"."source_sha256") = 64),
	CONSTRAINT "file_extractions_text_sha_check" CHECK("file_extractions"."text_sha256" IS NULL OR length("file_extractions"."text_sha256") = 64),
	CONSTRAINT "file_extractions_size_check" CHECK("file_extractions"."size_bytes" IS NULL OR "file_extractions"."size_bytes" >= 0),
	CONSTRAINT "file_extractions_token_check" CHECK("file_extractions"."token_estimate" IS NULL OR "file_extractions"."token_estimate" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_extractions_analysis_uidx` ON `file_extractions` (`analysis_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `file_extractions_r2_key_uidx` ON `file_extractions` (`r2_key`);--> statement-breakpoint
CREATE INDEX `file_extractions_workspace_idx` ON `file_extractions` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `file_extractions_status_idx` ON `file_extractions` (`status`,`updated_at`);--> statement-breakpoint
CREATE TRIGGER file_extractions_source_insert_guard
BEFORE INSERT ON file_extractions
WHEN NOT EXISTS (
  SELECT 1
  FROM document_analyses analysis
  JOIN document_files file ON file.id = analysis.uploaded_file_id
  WHERE analysis.id = NEW.analysis_id
    AND analysis.workspace_id = NEW.workspace_id
    AND analysis.owner_user_id = NEW.owner_user_id
    AND file.id = NEW.file_id
    AND file.workspace_id = NEW.workspace_id
    AND file.owner_user_id = NEW.owner_user_id
    AND file.kind = 'analysis_safe'
    AND lower(file.sha256) = lower(NEW.source_sha256)
)
BEGIN
  SELECT RAISE(ABORT, 'file_extraction_source_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER file_extractions_identity_update_guard
BEFORE UPDATE ON file_extractions
WHEN NEW.id IS NOT OLD.id
  OR NEW.analysis_id IS NOT OLD.analysis_id
  OR NEW.file_id IS NOT OLD.file_id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.owner_user_id IS NOT OLD.owner_user_id
  OR NEW.method IS NOT OLD.method
  OR NEW.provider IS NOT OLD.provider
  OR NEW.source_sha256 IS NOT OLD.source_sha256
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'file_extraction_identity_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER file_extractions_lifecycle_update_guard
BEFORE UPDATE ON file_extractions
WHEN NOT (
  (OLD.status = 'queued' AND NEW.status IN ('queued','processing','retrying','failed'))
  OR (OLD.status = 'processing' AND NEW.status IN ('processing','completed','retrying','failed'))
  OR (OLD.status = 'retrying' AND NEW.status IN ('retrying','processing','failed'))
  OR (OLD.status = 'failed' AND NEW.status IN ('failed','queued'))
  OR (OLD.status = 'completed' AND NEW.status = 'completed')
)
BEGIN
  SELECT RAISE(ABORT, 'file_extraction_lifecycle_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER file_extractions_completion_insert_guard
BEFORE INSERT ON file_extractions
WHEN (
  NEW.status = 'completed' AND (
    NEW.r2_key IS NULL OR NEW.text_sha256 IS NULL OR NEW.size_bytes IS NULL
    OR NEW.token_estimate IS NULL OR NEW.detected_mime_type IS NULL
    OR NEW.detected_language IS NULL OR NEW.text_quality IS NULL
    OR NEW.completed_at IS NULL OR NEW.error_code IS NOT NULL
  )
) OR (
  NEW.status <> 'completed' AND (
    NEW.r2_key IS NOT NULL OR NEW.text_sha256 IS NOT NULL OR NEW.completed_at IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'file_extraction_completion_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER file_extractions_completion_update_guard
BEFORE UPDATE ON file_extractions
WHEN (
  NEW.status = 'completed' AND (
    NEW.r2_key IS NULL OR NEW.text_sha256 IS NULL OR NEW.size_bytes IS NULL
    OR NEW.token_estimate IS NULL OR NEW.detected_mime_type IS NULL
    OR NEW.detected_language IS NULL OR NEW.text_quality IS NULL
    OR NEW.completed_at IS NULL OR NEW.error_code IS NOT NULL
  )
) OR (
  NEW.status <> 'completed' AND (
    NEW.r2_key IS NOT NULL OR NEW.text_sha256 IS NOT NULL OR NEW.completed_at IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'file_extraction_completion_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER file_extractions_completed_immutable
BEFORE UPDATE ON file_extractions
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'file_extraction_completed_immutable');
END;
