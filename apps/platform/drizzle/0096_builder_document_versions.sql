-- Migration 0096: immutable Builder document checkpoints in private R2.
-- D1 stores only tenant identity, revision, object identity and restore evidence;
-- document answers and legal text remain in the ordinary document rows/R2 object.
CREATE TABLE `builder_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`document_revision` integer NOT NULL,
	`source` text NOT NULL,
	`r2_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builder_document_versions_version_check` CHECK (`version`>0 AND `document_revision`>0),
	CONSTRAINT `builder_document_versions_source_check` CHECK (`source` IN ('user_checkpoint','restore_checkpoint','analysis_correction','suggestion','review','approval','signature','finalize')),
	CONSTRAINT `builder_document_versions_size_check` CHECK (`size_bytes` BETWEEN 2 AND 4000000),
	CONSTRAINT `builder_document_versions_status_check` CHECK (`status` IN ('pending','ready')),
	CONSTRAINT `builder_document_versions_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `builder_document_versions_hash_check` CHECK (
		`sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	),
	CONSTRAINT `builder_document_versions_key_check` CHECK (`r2_key` GLOB 'builder-document-versions/*' AND instr(`r2_key`,'..')=0),
	CONSTRAINT `builder_document_versions_state_check` CHECK ((`status`='pending') OR (`status`='ready' AND `last_error_code` IS NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_number_uidx` ON `builder_document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_revision_uidx` ON `builder_document_versions` (`document_id`,`document_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_r2_uidx` ON `builder_document_versions` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_request_uidx` ON `builder_document_versions` (`workspace_id`,`owner_user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE INDEX `builder_document_versions_list_idx` ON `builder_document_versions` (`document_id`,`status`,`version` DESC);--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_insert_guard`
BEFORE INSERT ON `builder_document_versions`
WHEN NEW.`status`<>'pending'
	OR NEW.`attempt_count`<>0
	OR NEW.`last_error_code` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `workspace_members` AS member
		WHERE member.`workspace_id`=NEW.`workspace_id`
			AND member.`user_id`=NEW.`owner_user_id`
			AND member.`status`='active'
	)
	OR NOT EXISTS (
		SELECT 1 FROM `documents` AS document
		JOIN `document_answers` AS answers ON answers.`document_id`=document.`id`
		JOIN `document_current_content` AS content ON content.`document_id`=document.`id`
		WHERE document.`id`=NEW.`document_id`
			AND document.`workspace_id`=NEW.`workspace_id`
			AND document.`owner_user_id`=NEW.`owner_user_id`
			AND document.`revision`=NEW.`document_revision`
			AND document.`archived_at` IS NULL
	)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_DOCUMENT_VERSION_CONFLICT');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_identity_immutable`
BEFORE UPDATE ON `builder_document_versions`
WHEN NEW.`id` IS NOT OLD.`id`
	OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
	OR NEW.`owner_user_id` IS NOT OLD.`owner_user_id`
	OR NEW.`document_id` IS NOT OLD.`document_id`
	OR NEW.`version`<>OLD.`version`
	OR NEW.`document_revision`<>OLD.`document_revision`
	OR NEW.`source` IS NOT OLD.`source`
	OR NEW.`r2_key` IS NOT OLD.`r2_key`
	OR NEW.`size_bytes`<>OLD.`size_bytes`
	OR NEW.`sha256` IS NOT OLD.`sha256`
	OR NEW.`idempotency_key_sha256` IS NOT OLD.`idempotency_key_sha256`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'BUILDER_DOCUMENT_VERSION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_transition_guard`
BEFORE UPDATE ON `builder_document_versions`
WHEN NOT (
	(OLD.`status`='pending' AND NEW.`status`='pending'
		AND NEW.`attempt_count`=OLD.`attempt_count`+1
		AND NEW.`last_error_code` IS NOT NULL)
	OR (OLD.`status`='pending' AND NEW.`status`='ready'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`last_error_code` IS NULL)
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_DOCUMENT_VERSION_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TABLE `builder_document_version_restore_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`source_version_id` text NOT NULL,
	`from_revision` integer NOT NULL,
	`to_revision` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_version_id`) REFERENCES `builder_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `builder_document_version_restore_revision_check` CHECK (`from_revision`>0 AND `to_revision`=`from_revision`+1),
	CONSTRAINT `builder_document_version_restore_hash_check` CHECK (
		`content_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_version_restore_request_uidx` ON `builder_document_version_restore_events` (`workspace_id`,`owner_user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_version_restore_revision_uidx` ON `builder_document_version_restore_events` (`document_id`,`to_revision`);--> statement-breakpoint
CREATE INDEX `builder_document_version_restore_document_idx` ON `builder_document_version_restore_events` (`document_id`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `builder_document_version_restore_insert_guard`
BEFORE INSERT ON `builder_document_version_restore_events`
WHEN NOT EXISTS (
	SELECT 1 FROM `workspace_members` AS member
	WHERE member.`workspace_id`=NEW.`workspace_id`
		AND member.`user_id`=NEW.`owner_user_id`
		AND member.`status`='active'
)
OR NOT EXISTS (
	SELECT 1 FROM `documents` AS document
	WHERE document.`id`=NEW.`document_id`
		AND document.`workspace_id`=NEW.`workspace_id`
		AND document.`owner_user_id`=NEW.`owner_user_id`
		AND document.`revision`=NEW.`from_revision`
		AND document.`archived_at` IS NULL
)
OR NOT EXISTS (
	SELECT 1 FROM `builder_document_versions` AS version
	WHERE version.`id`=NEW.`source_version_id`
		AND version.`workspace_id`=NEW.`workspace_id`
		AND version.`owner_user_id`=NEW.`owner_user_id`
		AND version.`document_id`=NEW.`document_id`
		AND version.`sha256`=NEW.`content_sha256`
		AND version.`status`='ready'
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_DOCUMENT_RESTORE_CONFLICT');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_version_restore_immutable_update`
BEFORE UPDATE ON `builder_document_version_restore_events`
BEGIN
	SELECT RAISE(ABORT,'BUILDER_DOCUMENT_RESTORE_IMMUTABLE');
END;
