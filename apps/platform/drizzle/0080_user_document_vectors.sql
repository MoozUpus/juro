-- Migration 0080: tenant-scoped Vectorize ledger for immutable analysis document versions.
-- Vectorize is an eventually consistent retrieval aid; D1 remains the authorization source of truth.
CREATE TABLE `user_document_index_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`source_hash` text NOT NULL,
	`language` text NOT NULL,
	`access_scope` text DEFAULT 'owner' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`mutation_id` text,
	`error_code` text,
	`started_at` text,
	`submitted_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `analysis_document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `user_document_index_jobs_hash_check` CHECK (length(`source_hash`) = 64),
	CONSTRAINT `user_document_index_jobs_language_check` CHECK (`language` IN ('ru','uz','mixed','unknown')),
	CONSTRAINT `user_document_index_jobs_scope_check` CHECK (`access_scope` IN ('owner','workspace')),
	CONSTRAINT `user_document_index_jobs_status_check` CHECK (`status` IN ('queued','processing','submitted','failed','delete_pending','delete_submitted','deleted')),
	CONSTRAINT `user_document_index_jobs_chunk_count_check` CHECK (`chunk_count` >= 0),
	CONSTRAINT `user_document_index_jobs_attempt_count_check` CHECK (`attempt_count` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_document_index_jobs_version_uidx` ON `user_document_index_jobs` (`document_version_id`);
--> statement-breakpoint
CREATE INDEX `user_document_index_jobs_tenant_status_idx` ON `user_document_index_jobs` (`workspace_id`,`owner_user_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `user_document_vector_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`vector_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`page` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`mutation_id` text,
	`submitted_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `user_document_index_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `user_document_vector_chunks_status_check` CHECK (`status` IN ('submitted','delete_submitted','deleted')),
	CONSTRAINT `user_document_vector_chunks_offsets_check` CHECK (`chunk_index` >= 0 AND `char_start` >= 0 AND `char_end` > `char_start`),
	CONSTRAINT `user_document_vector_chunks_page_check` CHECK (`page` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_document_vector_chunks_vector_uidx` ON `user_document_vector_chunks` (`vector_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_document_vector_chunks_job_index_uidx` ON `user_document_vector_chunks` (`job_id`,`chunk_index`);
--> statement-breakpoint
CREATE INDEX `user_document_vector_chunks_job_status_idx` ON `user_document_vector_chunks` (`job_id`,`status`,`chunk_index`);
--> statement-breakpoint
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
		AND analysis.`status`='completed'
)
BEGIN
	SELECT RAISE(ABORT, 'user document index source unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER `user_document_index_jobs_identity_immutable`
BEFORE UPDATE ON `user_document_index_jobs`
WHEN NEW.`analysis_id` <> OLD.`analysis_id`
	OR NEW.`document_version_id` <> OLD.`document_version_id`
	OR NEW.`workspace_id` <> OLD.`workspace_id`
	OR NEW.`owner_user_id` <> OLD.`owner_user_id`
	OR NEW.`source_hash` <> OLD.`source_hash`
	OR NEW.`created_at` <> OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'user document index identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `user_document_vector_chunks_source_guard`
BEFORE INSERT ON `user_document_vector_chunks`
WHEN NOT EXISTS (
	SELECT 1 FROM `user_document_index_jobs` job
	WHERE job.`id`=NEW.`job_id` AND job.`status`='processing'
)
BEGIN
	SELECT RAISE(ABORT, 'user document vector job unavailable');
END;
