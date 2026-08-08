-- Migration 0095: durable, content-free Builder -> document analysis handoff.
-- The document text remains in the existing tenant document and a private R2
-- snapshot. This row records only immutable identities, revision and hashes.
CREATE TABLE `builder_document_analysis_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_revision` integer NOT NULL,
	`document_content_sha256` text NOT NULL,
	`file_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`mode` text NOT NULL,
	`locale` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builder_analysis_revision_check` CHECK (`document_revision`>0),
	CONSTRAINT `builder_analysis_mode_check` CHECK (`mode` IN ('quick','full','expert')),
	CONSTRAINT `builder_analysis_locale_check` CHECK (`locale` IN ('ru','uz')),
	CONSTRAINT `builder_analysis_status_check` CHECK (`status` IN ('pending','ready')),
	CONSTRAINT `builder_analysis_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `builder_analysis_hash_check` CHECK (
		`document_content_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	),
	CONSTRAINT `builder_analysis_state_check` CHECK (
		(`status`='pending')
		OR (`status`='ready' AND `last_error_code` IS NULL)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_analysis_request_uidx` ON `builder_document_analysis_handoffs` (`workspace_id`,`user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_analysis_file_uidx` ON `builder_document_analysis_handoffs` (`file_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_analysis_analysis_uidx` ON `builder_document_analysis_handoffs` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `builder_analysis_document_idx` ON `builder_document_analysis_handoffs` (`document_id`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `builder_analysis_handoff_insert_guard`
BEFORE INSERT ON `builder_document_analysis_handoffs`
WHEN NEW.`status`<>'pending'
	OR NEW.`attempt_count`<>0
	OR NEW.`last_error_code` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `workspace_members` AS member
		WHERE member.`workspace_id`=NEW.`workspace_id`
			AND member.`user_id`=NEW.`user_id`
			AND member.`status`='active'
	)
	OR NOT EXISTS (
		SELECT 1 FROM `documents` AS document
		JOIN `document_current_content` AS content ON content.`document_id`=document.`id`
		WHERE document.`id`=NEW.`document_id`
			AND document.`workspace_id`=NEW.`workspace_id`
			AND document.`owner_user_id`=NEW.`user_id`
			AND document.`revision`=NEW.`document_revision`
			AND document.`archived_at` IS NULL
			AND length(trim(content.`final_content`))>=24
	)
	OR NOT EXISTS (
		SELECT 1 FROM `document_files` AS file
		WHERE file.`id`=NEW.`file_id`
			AND file.`workspace_id`=NEW.`workspace_id`
			AND file.`owner_user_id`=NEW.`user_id`
			AND file.`document_id`=NEW.`document_id`
			AND file.`kind`='analysis_snapshot_pending'
			AND file.`sha256`=NEW.`document_content_sha256`
			AND file.`mime_type`='text/markdown; charset=utf-8'
			AND file.`archived_at` IS NULL
	)
	OR NOT EXISTS (
		SELECT 1 FROM `document_analyses` AS analysis
		WHERE analysis.`id`=NEW.`analysis_id`
			AND analysis.`workspace_id`=NEW.`workspace_id`
			AND analysis.`owner_user_id`=NEW.`user_id`
			AND analysis.`uploaded_file_id`=NEW.`file_id`
			AND analysis.`status`='initiated'
	)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_ANALYSIS_HANDOFF_CONFLICT');
END;--> statement-breakpoint
CREATE TRIGGER `builder_analysis_handoff_identity_immutable`
BEFORE UPDATE ON `builder_document_analysis_handoffs`
WHEN NEW.`id` IS NOT OLD.`id`
	OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`document_id` IS NOT OLD.`document_id`
	OR NEW.`document_revision`<>OLD.`document_revision`
	OR NEW.`document_content_sha256` IS NOT OLD.`document_content_sha256`
	OR NEW.`file_id` IS NOT OLD.`file_id`
	OR NEW.`analysis_id` IS NOT OLD.`analysis_id`
	OR NEW.`mode` IS NOT OLD.`mode`
	OR NEW.`locale` IS NOT OLD.`locale`
	OR NEW.`idempotency_key_sha256` IS NOT OLD.`idempotency_key_sha256`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'BUILDER_ANALYSIS_HANDOFF_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `builder_analysis_handoff_transition_guard`
BEFORE UPDATE ON `builder_document_analysis_handoffs`
WHEN NOT (
	(OLD.`status`='pending' AND NEW.`status`='pending'
		AND NEW.`attempt_count`=OLD.`attempt_count`+1
		AND NEW.`last_error_code` IS NOT NULL)
	OR (OLD.`status`='pending' AND NEW.`status`='ready'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`last_error_code` IS NULL
		AND EXISTS (
			SELECT 1 FROM `document_files` AS file
			JOIN `document_analyses` AS analysis ON analysis.`uploaded_file_id`=file.`id`
			JOIN `job_outbox` AS outbox ON outbox.`subject_id`=analysis.`id`
			WHERE file.`id`=NEW.`file_id`
				AND file.`kind`='analysis_safe'
				AND file.`sha256`=NEW.`document_content_sha256`
				AND analysis.`id`=NEW.`analysis_id`
				AND analysis.`status`='ready'
				AND outbox.`job_type`='document.analyze'
				AND outbox.`workspace_id`=NEW.`workspace_id`
				AND outbox.`status`='pending'
		)
	)
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_ANALYSIS_HANDOFF_TRANSITION_INVALID');
END;
