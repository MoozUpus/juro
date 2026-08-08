-- Migration 0097: durable R2 write intents for projected Builder versions.
-- The legal text is written to private R2 before the D1 mutation. The D1 batch
-- then atomically advances the document revision, records the revision fence,
-- attaches immutable version metadata and marks the intent attached.
CREATE TABLE `builder_document_version_object_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`target_version` integer NOT NULL,
	`source_revision` integer NOT NULL,
	`target_revision` integer NOT NULL,
	`source` text NOT NULL,
	`source_entity_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`version_id` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`reconciled_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builder_version_write_version_check` CHECK (`target_version`>0 AND `source_revision`>0 AND `target_revision`=`source_revision`+1),
	CONSTRAINT `builder_version_write_source_check` CHECK (`source` IN ('suggestion','analysis_correction')),
	CONSTRAINT `builder_version_write_entity_check` CHECK (length(trim(`source_entity_id`)) BETWEEN 1 AND 200),
	CONSTRAINT `builder_version_write_size_check` CHECK (`size_bytes` BETWEEN 2 AND 4000000),
	CONSTRAINT `builder_version_write_hash_check` CHECK (
		`sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	),
	CONSTRAINT `builder_version_write_key_check` CHECK (`r2_key` GLOB 'builder-document-versions/*' AND instr(`r2_key`,'..')=0),
	CONSTRAINT `builder_version_write_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `builder_version_write_status_check` CHECK (`status` IN ('pending','attaching','attached','deleting','deleted')),
	CONSTRAINT `builder_version_write_evidence_check` CHECK (
		(`status` IN ('pending','attaching','deleting') AND `version_id` IS NULL AND `reconciled_at` IS NULL)
		OR (`status`='attached' AND `version_id` IS NOT NULL AND `reconciled_at` IS NOT NULL AND `last_error_code` IS NULL)
		OR (`status`='deleted' AND `version_id` IS NULL AND `reconciled_at` IS NOT NULL AND `last_error_code` IS NULL)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_r2_uidx` ON `builder_document_version_object_writes` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_version_uidx` ON `builder_document_version_object_writes` (`version_id`) WHERE `version_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_request_uidx` ON `builder_document_version_object_writes` (`workspace_id`,`owner_user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_version_writes_revision_uidx` ON `builder_document_version_object_writes` (`document_id`,`target_revision`);--> statement-breakpoint
CREATE INDEX `builder_version_writes_reconcile_idx` ON `builder_document_version_object_writes` (`status`,`updated_at`,`id`);--> statement-breakpoint
ALTER TABLE `builder_document_versions` ADD COLUMN `object_write_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `builder_document_versions_object_write_uidx` ON `builder_document_versions` (`object_write_id`) WHERE `object_write_id` IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_insert_guard`
BEFORE INSERT ON `builder_document_version_object_writes`
WHEN NEW.`status`<>'pending'
	OR NEW.`version_id` IS NOT NULL
	OR NEW.`attempt_count`<>0
	OR NEW.`last_error_code` IS NOT NULL
	OR NEW.`reconciled_at` IS NOT NULL
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
	OR NEW.`r2_key` NOT LIKE 'builder-document-versions/' || NEW.`workspace_id` || '/' || NEW.`document_id` || '/' || NEW.`id` || '-%'
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
END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_identity_guard`
BEFORE UPDATE ON `builder_document_version_object_writes`
WHEN NEW.`id` IS NOT OLD.`id`
	OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
	OR NEW.`owner_user_id` IS NOT OLD.`owner_user_id`
	OR NEW.`document_id` IS NOT OLD.`document_id`
	OR NEW.`target_version`<>OLD.`target_version`
	OR NEW.`source_revision`<>OLD.`source_revision`
	OR NEW.`target_revision`<>OLD.`target_revision`
	OR NEW.`source` IS NOT OLD.`source`
	OR NEW.`source_entity_id` IS NOT OLD.`source_entity_id`
	OR NEW.`r2_key` IS NOT OLD.`r2_key`
	OR NEW.`size_bytes`<>OLD.`size_bytes`
	OR NEW.`sha256` IS NOT OLD.`sha256`
	OR NEW.`idempotency_key_sha256` IS NOT OLD.`idempotency_key_sha256`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_transition_guard`
BEFORE UPDATE ON `builder_document_version_object_writes`
WHEN NOT (
	(OLD.`status`='pending' AND NEW.`status`='pending'
		AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
		AND NEW.`attempt_count`=OLD.`attempt_count`+1 AND NEW.`last_error_code` IS NOT NULL)
	OR (OLD.`status`='pending' AND NEW.`status`='attaching'
		AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
		AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL)
	OR (OLD.`status` IN ('pending','attaching') AND NEW.`status`='deleting'
		AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
		AND NEW.`attempt_count`=OLD.`attempt_count`+1 AND NEW.`last_error_code` IS NULL)
	OR (OLD.`status` IN ('attaching','deleting') AND NEW.`status`='attached'
		AND NEW.`version_id` IS NOT NULL AND NEW.`reconciled_at` IS NOT NULL
		AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL)
	OR (OLD.`status`='deleting' AND NEW.`status`='deleted'
		AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NOT NULL
		AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NULL)
	OR (OLD.`status`='deleting' AND NEW.`status`='pending'
		AND NEW.`version_id` IS NULL AND NEW.`reconciled_at` IS NULL
		AND NEW.`attempt_count`=OLD.`attempt_count` AND NEW.`last_error_code` IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_projected_write_required`
BEFORE INSERT ON `builder_document_versions`
WHEN NEW.`source` IN ('suggestion','analysis_correction') AND NEW.`object_write_id` IS NULL
BEGIN
	SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_REQUIRED');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_object_write_guard`
BEFORE INSERT ON `builder_document_versions`
WHEN NEW.`object_write_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `builder_document_version_object_writes` write
	WHERE write.`id`=NEW.`object_write_id`
		AND write.`workspace_id`=NEW.`workspace_id`
		AND write.`owner_user_id`=NEW.`owner_user_id`
		AND write.`document_id`=NEW.`document_id`
		AND write.`target_version`=NEW.`version`
		AND write.`target_revision`=NEW.`document_revision`
		AND write.`source`=NEW.`source`
		AND write.`r2_key`=NEW.`r2_key`
		AND write.`size_bytes`=NEW.`size_bytes`
		AND write.`sha256`=NEW.`sha256`
		AND write.`idempotency_key_sha256`=NEW.`idempotency_key_sha256`
		AND write.`status`='attaching'
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_MISMATCH');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_object_write_attach`
AFTER UPDATE OF `status` ON `builder_document_versions`
WHEN NEW.`status`='ready' AND NEW.`object_write_id` IS NOT NULL
BEGIN
	UPDATE `builder_document_version_object_writes`
	SET `status`='attached',`version_id`=NEW.`id`,`last_error_code`=NULL,
		`updated_at`=NEW.`updated_at`,`reconciled_at`=NEW.`updated_at`
	WHERE `id`=NEW.`object_write_id` AND `status`='attaching';
END;--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_attachment_guard`
BEFORE UPDATE ON `builder_document_version_object_writes`
WHEN NEW.`status`='attached' AND (
	NOT EXISTS (
		SELECT 1 FROM `builder_document_versions` version
		WHERE version.`id`=NEW.`version_id`
			AND version.`object_write_id`=NEW.`id`
			AND version.`workspace_id`=NEW.`workspace_id`
			AND version.`owner_user_id`=NEW.`owner_user_id`
			AND version.`document_id`=NEW.`document_id`
			AND version.`version`=NEW.`target_version`
			AND version.`document_revision`=NEW.`target_revision`
			AND version.`source`=NEW.`source`
			AND version.`r2_key`=NEW.`r2_key`
			AND version.`size_bytes`=NEW.`size_bytes`
			AND version.`sha256`=NEW.`sha256`
			AND version.`status`='ready'
	)
	OR NOT EXISTS (
		SELECT 1 FROM `documents` document
		WHERE document.`id`=NEW.`document_id`
			AND document.`workspace_id`=NEW.`workspace_id`
			AND document.`owner_user_id`=NEW.`owner_user_id`
			AND document.`revision`=NEW.`target_revision`
	)
	OR (NEW.`source`='suggestion' AND NOT EXISTS (
		SELECT 1 FROM `document_change_proposals` proposal
		WHERE proposal.`id`=NEW.`source_entity_id`
			AND proposal.`document_id`=NEW.`document_id`
			AND proposal.`status`='applied'
			AND proposal.`owner_accepted`=1
			AND proposal.`collaborator_accepted`=1
	))
	OR (NEW.`source`='analysis_correction' AND NOT EXISTS (
		SELECT 1 FROM `analysis_document_versions` version
		WHERE version.`id`=NEW.`source_entity_id`
			AND version.`workspace_id`=NEW.`workspace_id`
			AND version.`owner_user_id`=NEW.`owner_user_id`
			AND version.`source_kind`='corrected'
	))
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_ATTACHMENT_MISMATCH');
END;--> statement-breakpoint
CREATE TRIGGER `builder_document_versions_object_write_immutable`
BEFORE UPDATE OF `object_write_id` ON `builder_document_versions`
BEGIN
	SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_IMMUTABLE');
END;
