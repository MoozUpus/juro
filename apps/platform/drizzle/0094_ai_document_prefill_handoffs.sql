-- Migration 0094: content-free provenance for an explicit AI answer ->
-- configurable document draft handoff. Values remain only in the ordinary
-- tenant-owned document_answers row; this evidence stores field identifiers
-- and hashes, never answer/profile content or a caller-supplied raw key.
CREATE TABLE `ai_document_prefill_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assistant_message_id` text NOT NULL,
	`template_code` text NOT NULL,
	`document_id` text NOT NULL,
	`locale` text NOT NULL,
	`selected_field_ids_json` text NOT NULL,
	`selection_sha256` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ai_document_prefill_handoffs_locale_check` CHECK (`locale` IN ('ru','uz')),
	CONSTRAINT `ai_document_prefill_handoffs_fields_check` CHECK (
		json_valid(`selected_field_ids_json`)
		AND json_type(`selected_field_ids_json`)='array'
		AND length(`selected_field_ids_json`) BETWEEN 2 AND 10000
	),
	CONSTRAINT `ai_document_prefill_handoffs_hash_check` CHECK (
		`selection_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_document_prefill_handoffs_request_uidx` ON `ai_document_prefill_handoffs` (`workspace_id`,`user_id`,`idempotency_key_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_document_prefill_handoffs_document_uidx` ON `ai_document_prefill_handoffs` (`document_id`);--> statement-breakpoint
CREATE INDEX `ai_document_prefill_handoffs_source_idx` ON `ai_document_prefill_handoffs` (`assistant_message_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `ai_document_prefill_handoffs_insert_guard`
BEFORE INSERT ON `ai_document_prefill_handoffs`
WHEN NOT EXISTS (
	SELECT 1 FROM `workspace_members` AS member
	WHERE member.`workspace_id`=NEW.`workspace_id`
		AND member.`user_id`=NEW.`user_id`
		AND member.`status`='active'
)
OR NOT EXISTS (
	SELECT 1 FROM `conversation_messages` AS message
	JOIN `conversations` AS conversation ON conversation.`id`=message.`conversation_id`
	WHERE message.`id`=NEW.`assistant_message_id`
		AND message.`author_type`='assistant'
		AND message.`structured_json` IS NOT NULL
		AND conversation.`workspace_id`=NEW.`workspace_id`
		AND conversation.`owner_user_id`=NEW.`user_id`
)
OR NOT EXISTS (
	SELECT 1 FROM `documents` AS document
	WHERE document.`id`=NEW.`document_id`
		AND document.`workspace_id`=NEW.`workspace_id`
		AND document.`owner_user_id`=NEW.`user_id`
		AND document.`template_code`=NEW.`template_code`
		AND document.`status`='Черновик'
)
BEGIN
	SELECT RAISE(ABORT,'AI_DOCUMENT_HANDOFF_CONFLICT');
END;--> statement-breakpoint
CREATE TRIGGER `ai_document_prefill_handoffs_immutable_update`
BEFORE UPDATE ON `ai_document_prefill_handoffs`
BEGIN
	SELECT RAISE(ABORT,'AI_DOCUMENT_HANDOFF_IMMUTABLE');
END;
