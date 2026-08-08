-- Migration 0105: D1-compatible hash guards for Builder snapshots and restore evidence.
-- Cloudflare D1 rejects the previous zeroblob()/replace() GLOB construction during
-- INSERT. Rebuild the three metadata-only tables without weakening their fixed
-- lowercase SHA-256 and idempotency-hash validation. Restore evidence is copied
-- through a transaction-local staging table so checkpoints stay referentially intact.
DROP TRIGGER IF EXISTS `builder_document_version_restore_immutable_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_version_restore_insert_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_object_write_immutable`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_version_writes_attachment_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_object_write_attach`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_object_write_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_projected_write_required`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_version_writes_transition_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_version_writes_identity_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_version_writes_insert_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_transition_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_identity_immutable`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `builder_document_versions_insert_guard`;--> statement-breakpoint
CREATE TABLE `builder_document_version_restore_events__0105_copy` AS SELECT * FROM `builder_document_version_restore_events`;--> statement-breakpoint
DROP TABLE `builder_document_version_restore_events`;--> statement-breakpoint
CREATE TABLE `builder_document_versions__0105` (
	`id` text PRIMARY KEY NOT NULL, `workspace_id` text NOT NULL, `owner_user_id` text NOT NULL, `document_id` text NOT NULL,
	`version` integer NOT NULL, `document_revision` integer NOT NULL, `source` text NOT NULL, `r2_key` text NOT NULL,
	`size_bytes` integer NOT NULL, `sha256` text NOT NULL, `idempotency_key_sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL, `attempt_count` integer DEFAULT 0 NOT NULL, `last_error_code` text,
	`created_at` text NOT NULL, `updated_at` text NOT NULL, `object_write_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builder_document_versions_version_check` CHECK (`version`>0 AND `document_revision`>0),
	CONSTRAINT `builder_document_versions_source_check` CHECK (`source` IN ('user_checkpoint','restore_checkpoint','analysis_correction','suggestion','review','approval','signature','finalize')),
	CONSTRAINT `builder_document_versions_size_check` CHECK (`size_bytes` BETWEEN 2 AND 4000000),
	CONSTRAINT `builder_document_versions_status_check` CHECK (`status` IN ('pending','ready')),
	CONSTRAINT `builder_document_versions_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `builder_document_versions_hash_check` CHECK (length(`sha256`)=64 AND `sha256` NOT GLOB '*[^0-9a-f]*' AND length(`idempotency_key_sha256`)=64 AND `idempotency_key_sha256` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `builder_document_versions_key_check` CHECK (`r2_key` GLOB 'builder-document-versions/*' AND instr(`r2_key`,'..')=0),
	CONSTRAINT `builder_document_versions_state_check` CHECK ((`status`='pending') OR (`status`='ready' AND `last_error_code` IS NULL))
);--> statement-breakpoint
INSERT INTO `builder_document_versions__0105` SELECT * FROM `builder_document_versions`;--> statement-breakpoint
DROP TABLE `builder_document_versions`;--> statement-breakpoint
ALTER TABLE `builder_document_versions__0105` RENAME TO `builder_document_versions`;--> statement-breakpoint
CREATE TABLE `builder_document_version_object_writes__0105` (
	`id` text PRIMARY KEY NOT NULL, `workspace_id` text NOT NULL, `owner_user_id` text NOT NULL, `document_id` text NOT NULL,
	`target_version` integer NOT NULL, `source_revision` integer NOT NULL, `target_revision` integer NOT NULL,
	`source` text NOT NULL, `source_entity_id` text NOT NULL, `r2_key` text NOT NULL, `size_bytes` integer NOT NULL,
	`sha256` text NOT NULL, `idempotency_key_sha256` text NOT NULL, `status` text DEFAULT 'pending' NOT NULL,
	`version_id` text, `attempt_count` integer DEFAULT 0 NOT NULL, `last_error_code` text, `created_at` text NOT NULL,
	`updated_at` text NOT NULL, `reconciled_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builder_version_write_version_check` CHECK (`target_version`>0 AND `source_revision`>0 AND `target_revision`=`source_revision`+1),
	CONSTRAINT `builder_version_write_source_check` CHECK (`source` IN ('suggestion','analysis_correction')),
	CONSTRAINT `builder_version_write_entity_check` CHECK (length(trim(`source_entity_id`)) BETWEEN 1 AND 200),
	CONSTRAINT `builder_version_write_size_check` CHECK (`size_bytes` BETWEEN 2 AND 4000000),
	CONSTRAINT `builder_version_write_hash_check` CHECK (length(`sha256`)=64 AND `sha256` NOT GLOB '*[^0-9a-f]*' AND length(`idempotency_key_sha256`)=64 AND `idempotency_key_sha256` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `builder_version_write_key_check` CHECK (`r2_key` GLOB 'builder-document-versions/*' AND instr(`r2_key`,'..')=0),
	CONSTRAINT `builder_version_write_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `builder_version_write_status_check` CHECK (`status` IN ('pending','attaching','attached','deleting','deleted')),
	CONSTRAINT `builder_version_write_evidence_check` CHECK ((`status` IN ('pending','attaching','deleting') AND `version_id` IS NULL AND `reconciled_at` IS NULL) OR (`status`='attached' AND `version_id` IS NOT NULL AND `reconciled_at` IS NOT NULL AND `last_error_code` IS NULL) OR (`status`='deleted' AND `version_id` IS NULL AND `reconciled_at` IS NOT NULL AND `last_error_code` IS NULL))
);--> statement-breakpoint
INSERT INTO `builder_document_version_object_writes__0105` SELECT * FROM `builder_document_version_object_writes`;--> statement-breakpoint
DROP TABLE `builder_document_version_object_writes`;--> statement-breakpoint
ALTER TABLE `builder_document_version_object_writes__0105` RENAME TO `builder_document_version_object_writes`;--> statement-breakpoint
CREATE TABLE `builder_document_version_restore_events` (
	`id` text PRIMARY KEY NOT NULL, `workspace_id` text NOT NULL, `owner_user_id` text NOT NULL, `document_id` text NOT NULL,
	`source_version_id` text NOT NULL, `from_revision` integer NOT NULL, `to_revision` integer NOT NULL,
	`content_sha256` text NOT NULL, `idempotency_key_sha256` text NOT NULL, `created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_version_id`) REFERENCES `builder_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `builder_document_version_restore_revision_check` CHECK (`from_revision`>0 AND `to_revision`=`from_revision`+1),
	CONSTRAINT `builder_document_version_restore_hash_check` CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*' AND length(`idempotency_key_sha256`)=64 AND `idempotency_key_sha256` NOT GLOB '*[^0-9a-f]*')
);--> statement-breakpoint
INSERT INTO `builder_document_version_restore_events` SELECT * FROM `builder_document_version_restore_events__0105_copy`;--> statement-breakpoint
DROP TABLE `builder_document_version_restore_events__0105_copy`;--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_number_uidx` ON `builder_document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_revision_uidx` ON `builder_document_versions` (`document_id`,`document_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_r2_uidx` ON `builder_document_versions` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_request_uidx` ON `builder_document_versions` (`workspace_id`,`owner_user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE INDEX `builder_document_versions_list_idx` ON `builder_document_versions` (`document_id`,`status`,`version` DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_object_write_uidx` ON `builder_document_versions` (`object_write_id`) WHERE `object_write_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_r2_uidx` ON `builder_document_version_object_writes` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_version_uidx` ON `builder_document_version_object_writes` (`version_id`) WHERE `version_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_request_uidx` ON `builder_document_version_object_writes` (`workspace_id`,`owner_user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_revision_uidx` ON `builder_document_version_object_writes` (`document_id`,`target_revision`);--> statement-breakpoint
CREATE INDEX `builder_version_writes_reconcile_idx` ON `builder_document_version_object_writes` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_version_restore_request_uidx` ON `builder_document_version_restore_events` (`workspace_id`,`owner_user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_version_restore_revision_uidx` ON `builder_document_version_restore_events` (`document_id`,`to_revision`);--> statement-breakpoint
CREATE INDEX `builder_document_version_restore_document_idx` ON `builder_document_version_restore_events` (`document_id`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_insert_guard` BEFORE INSERT ON `builder_document_versions`
WHEN NEW.`status`<>'pending' OR NEW.`attempt_count`<>0 OR NEW.`last_error_code` IS NOT NULL
	OR NOT EXISTS (SELECT 1 FROM `workspace_members` member WHERE member.`workspace_id`=NEW.`workspace_id` AND member.`user_id`=NEW.`owner_user_id` AND member.`status`='active')
	OR NOT EXISTS (SELECT 1 FROM `documents` document JOIN `document_answers` answers ON answers.`document_id`=document.`id` JOIN `document_current_content` content ON content.`document_id`=document.`id` WHERE document.`id`=NEW.`document_id` AND document.`workspace_id`=NEW.`workspace_id` AND document.`owner_user_id`=NEW.`owner_user_id` AND document.`revision`=NEW.`document_revision` AND document.`archived_at` IS NULL)
BEGIN SELECT RAISE(ABORT,'BUILDER_DOCUMENT_VERSION_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_identity_immutable` BEFORE UPDATE ON `builder_document_versions`
WHEN NEW.`id` IS NOT OLD.`id` OR NEW.`workspace_id` IS NOT OLD.`workspace_id` OR NEW.`owner_user_id` IS NOT OLD.`owner_user_id` OR NEW.`document_id` IS NOT OLD.`document_id` OR NEW.`version`<>OLD.`version` OR NEW.`document_revision`<>OLD.`document_revision` OR NEW.`source` IS NOT OLD.`source` OR NEW.`r2_key` IS NOT OLD.`r2_key` OR NEW.`size_bytes`<>OLD.`size_bytes` OR NEW.`sha256` IS NOT OLD.`sha256` OR NEW.`idempotency_key_sha256` IS NOT OLD.`idempotency_key_sha256` OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN SELECT RAISE(ABORT,'BUILDER_DOCUMENT_VERSION_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_transition_guard` BEFORE UPDATE ON `builder_document_versions`
WHEN NOT ((OLD.`status`='pending' AND NEW.`status`='pending' AND NEW.`attempt_count`=OLD.`attempt_count`+1 AND NEW.`last_error_code` IS NOT NULL) OR (OLD.`status`='pending' AND NEW.`status`='ready' AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL))
BEGIN SELECT RAISE(ABORT,'BUILDER_DOCUMENT_VERSION_TRANSITION_INVALID'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_version_restore_insert_guard` BEFORE INSERT ON `builder_document_version_restore_events`
WHEN NOT EXISTS (SELECT 1 FROM `workspace_members` member WHERE member.`workspace_id`=NEW.`workspace_id` AND member.`user_id`=NEW.`owner_user_id` AND member.`status`='active')
	OR NOT EXISTS (SELECT 1 FROM `documents` document WHERE document.`id`=NEW.`document_id` AND document.`workspace_id`=NEW.`workspace_id` AND document.`owner_user_id`=NEW.`owner_user_id` AND document.`revision`=NEW.`from_revision` AND document.`archived_at` IS NULL)
	OR NOT EXISTS (SELECT 1 FROM `builder_document_versions` version WHERE version.`id`=NEW.`source_version_id` AND version.`workspace_id`=NEW.`workspace_id` AND version.`owner_user_id`=NEW.`owner_user_id` AND version.`document_id`=NEW.`document_id` AND version.`sha256`=NEW.`content_sha256` AND version.`status`='ready')
BEGIN SELECT RAISE(ABORT,'BUILDER_DOCUMENT_RESTORE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_version_restore_immutable_update` BEFORE UPDATE ON `builder_document_version_restore_events`
BEGIN SELECT RAISE(ABORT,'BUILDER_DOCUMENT_RESTORE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_insert_guard` BEFORE INSERT ON `builder_document_version_object_writes`
WHEN NEW.`status`<>'pending' OR NEW.`version_id` IS NOT NULL OR NEW.`attempt_count`<>0 OR NEW.`last_error_code` IS NOT NULL OR NEW.`reconciled_at` IS NOT NULL
	OR NOT EXISTS (SELECT 1 FROM `workspace_members` member JOIN `documents` document ON document.`workspace_id`=member.`workspace_id` WHERE member.`workspace_id`=NEW.`workspace_id` AND member.`user_id`=NEW.`owner_user_id` AND member.`status`='active' AND document.`id`=NEW.`document_id` AND document.`workspace_id`=NEW.`workspace_id` AND document.`owner_user_id`=NEW.`owner_user_id` AND document.`revision`=NEW.`source_revision` AND document.`archived_at` IS NULL)
	OR NEW.`r2_key` NOT LIKE 'builder-document-versions/' || NEW.`workspace_id` || '/' || NEW.`document_id` || '/' || NEW.`id` || '-%'
	OR (NEW.`source`='suggestion' AND NOT EXISTS (SELECT 1 FROM `document_change_proposals` proposal WHERE proposal.`id`=NEW.`source_entity_id` AND proposal.`document_id`=NEW.`document_id` AND proposal.`status`='pending' AND proposal.`old_text`<>proposal.`new_text`))
	OR (NEW.`source`='analysis_correction' AND NOT EXISTS (SELECT 1 FROM `builder_document_analysis_handoffs` handoff JOIN `analysis_document_versions` version ON version.`analysis_id`=handoff.`analysis_id` WHERE version.`id`=NEW.`source_entity_id` AND version.`workspace_id`=NEW.`workspace_id` AND version.`owner_user_id`=NEW.`owner_user_id` AND version.`source_kind`='corrected' AND handoff.`document_id`=NEW.`document_id` AND handoff.`status`='ready'))
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_SOURCE_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_identity_guard` BEFORE UPDATE ON `builder_document_version_object_writes`
WHEN NEW.`id` IS NOT OLD.`id` OR NEW.`workspace_id` IS NOT OLD.`workspace_id` OR NEW.`owner_user_id` IS NOT OLD.`owner_user_id` OR NEW.`document_id` IS NOT OLD.`document_id` OR NEW.`target_version`<>OLD.`target_version` OR NEW.`source_revision`<>OLD.`source_revision` OR NEW.`target_revision`<>OLD.`target_revision` OR NEW.`source` IS NOT OLD.`source` OR NEW.`source_entity_id` IS NOT OLD.`source_entity_id` OR NEW.`r2_key` IS NOT OLD.`r2_key` OR NEW.`size_bytes`<>OLD.`size_bytes` OR NEW.`sha256` IS NOT OLD.`sha256` OR NEW.`idempotency_key_sha256` IS NOT OLD.`idempotency_key_sha256` OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_IDENTITY_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_transition_guard` BEFORE UPDATE ON `builder_document_version_object_writes`
WHEN NOT ((OLD.`status`='pending' AND NEW.`status`='pending' AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL AND NEW.`attempt_count`=OLD.`attempt_count`+1 AND NEW.`last_error_code` IS NOT NULL) OR (OLD.`status`='pending' AND NEW.`status`='attaching' AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL) OR (OLD.`status` IN ('pending','attaching') AND NEW.`status`='deleting' AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL AND NEW.`attempt_count`=OLD.`attempt_count`+1 AND NEW.`last_error_code` IS NULL) OR (OLD.`status` IN ('attaching','deleting') AND NEW.`status`='attached' AND NEW.`version_id` IS NOT NULL AND NEW.`reconciled_at` IS NOT NULL AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL) OR (OLD.`status`='deleting' AND NEW.`status`='deleted' AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NOT NULL AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL) OR (OLD.`status`='deleting' AND NEW.`status`='pending' AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_TRANSITION_INVALID'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_projected_write_required` BEFORE INSERT ON `builder_document_versions`
WHEN NEW.`source` IN ('suggestion','analysis_correction') AND NEW.`object_write_id` IS NULL
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_REQUIRED'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_object_write_guard` BEFORE INSERT ON `builder_document_versions`
WHEN NEW.`object_write_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `builder_document_version_object_writes` write WHERE write.`id`=NEW.`object_write_id` AND write.`workspace_id`=NEW.`workspace_id` AND write.`owner_user_id`=NEW.`owner_user_id` AND write.`document_id`=NEW.`document_id` AND write.`target_version`=NEW.`version` AND write.`target_revision`=NEW.`document_revision` AND write.`source`=NEW.`source` AND write.`r2_key`=NEW.`r2_key` AND write.`size_bytes`=NEW.`size_bytes` AND write.`sha256`=NEW.`sha256` AND write.`idempotency_key_sha256`=NEW.`idempotency_key_sha256` AND write.`status`='attaching')
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_object_write_attach` AFTER UPDATE OF `status` ON `builder_document_versions`
WHEN NEW.`status`='ready' AND NEW.`object_write_id` IS NOT NULL
BEGIN UPDATE `builder_document_version_object_writes` SET `status`='attached',`version_id`=NEW.`id`,`last_error_code`=NULL,`updated_at`=NEW.`updated_at`,`reconciled_at`=NEW.`updated_at` WHERE `id`=NEW.`object_write_id` AND `status`='attaching'; END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_attachment_guard` BEFORE UPDATE ON `builder_document_version_object_writes`
WHEN NEW.`status`='attached' AND (NOT EXISTS (SELECT 1 FROM `builder_document_versions` version WHERE version.`id`=NEW.`version_id` AND version.`object_write_id`=NEW.`id` AND version.`workspace_id`=NEW.`workspace_id` AND version.`owner_user_id`=NEW.`owner_user_id` AND version.`document_id`=NEW.`document_id` AND version.`version`=NEW.`target_version` AND version.`document_revision`=NEW.`target_revision` AND version.`source`=NEW.`source` AND version.`r2_key`=NEW.`r2_key` AND version.`size_bytes`=NEW.`size_bytes` AND version.`sha256`=NEW.`sha256` AND version.`status`='ready') OR NOT EXISTS (SELECT 1 FROM `documents` document WHERE document.`id`=NEW.`document_id` AND document.`workspace_id`=NEW.`workspace_id` AND document.`owner_user_id`=NEW.`owner_user_id` AND document.`revision`=NEW.`target_revision`) OR (NEW.`source`='suggestion' AND NOT EXISTS (SELECT 1 FROM `document_change_proposals` proposal WHERE proposal.`id`=NEW.`source_entity_id` AND proposal.`document_id`=NEW.`document_id` AND proposal.`status`='applied' AND proposal.`owner_accepted`=1 AND proposal.`collaborator_accepted`=1)) OR (NEW.`source`='analysis_correction' AND NOT EXISTS (SELECT 1 FROM `analysis_document_versions` version WHERE version.`id`=NEW.`source_entity_id` AND version.`workspace_id`=NEW.`workspace_id` AND version.`owner_user_id`=NEW.`owner_user_id` AND version.`source_kind`='corrected')))
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_ATTACHMENT_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_object_write_immutable` BEFORE UPDATE OF `object_write_id` ON `builder_document_versions`
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_IMMUTABLE'); END;
