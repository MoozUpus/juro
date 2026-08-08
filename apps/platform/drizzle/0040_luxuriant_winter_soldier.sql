CREATE TABLE `analysis_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
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
	FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "analysis_exports_format_check" CHECK("analysis_exports"."format" = 'json'),
	CONSTRAINT "analysis_exports_status_check" CHECK("analysis_exports"."status" IN ('queued','processing','retrying','completed','failed')),
	CONSTRAINT "analysis_exports_size_check" CHECK("analysis_exports"."size_bytes" IS NULL OR "analysis_exports"."size_bytes" >= 0),
	CONSTRAINT "analysis_exports_sha_check" CHECK("analysis_exports"."sha256" IS NULL OR length("analysis_exports"."sha256") = 64),
	CONSTRAINT "analysis_exports_completion_check" CHECK(
    ("analysis_exports"."status" = 'completed'
      AND "analysis_exports"."r2_key" IS NOT NULL AND "analysis_exports"."size_bytes" IS NOT NULL
      AND "analysis_exports"."sha256" IS NOT NULL AND "analysis_exports"."completed_at" IS NOT NULL
      AND "analysis_exports"."error_code" IS NULL)
    OR ("analysis_exports"."status" <> 'completed' AND "analysis_exports"."completed_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_exports_idempotency_uidx` ON `analysis_exports` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_exports_r2_key_uidx` ON `analysis_exports` (`r2_key`);--> statement-breakpoint
CREATE INDEX `analysis_exports_analysis_idx` ON `analysis_exports` (`analysis_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_exports_workspace_idx` ON `analysis_exports` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_exports_status_idx` ON `analysis_exports` (`status`,`updated_at`);--> statement-breakpoint
CREATE TRIGGER analysis_exports_insert_guard
BEFORE INSERT ON analysis_exports
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'analysis_export_source_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM document_analyses a
    WHERE a.id = NEW.analysis_id AND a.workspace_id = NEW.workspace_id
      AND a.owner_user_id = NEW.owner_user_id AND a.status = 'completed'
  );
END;
--> statement-breakpoint
CREATE TRIGGER analysis_exports_update_guard
BEFORE UPDATE ON analysis_exports
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'analysis_export_identity_immutable') WHERE NEW.id <> OLD.id OR NEW.analysis_id <> OLD.analysis_id
    OR NEW.workspace_id <> OLD.workspace_id OR NEW.owner_user_id <> OLD.owner_user_id
    OR NEW.format <> OLD.format OR NEW.file_name <> OLD.file_name
    OR NEW.mime_type <> OLD.mime_type OR NEW.idempotency_key <> OLD.idempotency_key
    OR NEW.created_at <> OLD.created_at;
  SELECT RAISE(ABORT, 'analysis_export_transition_invalid') WHERE NOT (
    (OLD.status = 'queued' AND NEW.status IN ('processing','failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('processing','retrying','completed','failed'))
    OR (OLD.status = 'retrying' AND NEW.status IN ('processing','failed'))
  );
  SELECT RAISE(ABORT, 'analysis_export_completion_invalid') WHERE NEW.status = 'completed' AND (
    NEW.r2_key NOT LIKE 'exports/%' OR NEW.mime_type <> 'application/json'
    OR NEW.size_bytes IS NULL OR NEW.size_bytes < 2
    OR NEW.sha256 IS NULL OR length(NEW.sha256) <> 64
    OR NEW.completed_at IS NULL OR NEW.error_code IS NOT NULL
  );
  SELECT RAISE(ABORT, 'analysis_export_incomplete_has_artifact') WHERE NEW.status <> 'completed' AND (
    NEW.r2_key IS NOT NULL OR NEW.size_bytes IS NOT NULL OR NEW.sha256 IS NOT NULL
    OR NEW.completed_at IS NOT NULL
  );
END;
