CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`actor_user_id` text,
	`type` text NOT NULL,
	`metadata_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_events_document_idx` ON `activity_events` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `consultation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`consultation_type` text NOT NULL,
	`context_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requester_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consultation_requests_user_idx` ON `consultation_requests` (`requester_user_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`label` text NOT NULL,
	`full_name` text NOT NULL,
	`birth_date` text,
	`id_document_type` text,
	`id_document_number` text,
	`id_issued_by` text,
	`id_issue_date` text,
	`pinfl` text,
	`registered_address` text,
	`phone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_owner_idx` ON `contacts` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `document_answers` (
	`document_id` text PRIMARY KEY NOT NULL,
	`answers_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`file_id` text NOT NULL,
	`visible_to_collaborator` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_attachments_document_idx` ON `document_attachments` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_change_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`old_text` text NOT NULL,
	`new_text` text NOT NULL,
	`anchor` text,
	`owner_accepted` integer DEFAULT false NOT NULL,
	`collaborator_accepted` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_change_proposals_document_idx` ON `document_change_proposals` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_collaborators` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`role` text NOT NULL,
	`can_view` integer DEFAULT true NOT NULL,
	`can_download` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`opened_at` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_collaborators_uidx` ON `document_collaborators` (`document_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `document_collaborators_user_idx` ON `document_collaborators` (`user_id`);--> statement-breakpoint
CREATE TABLE `document_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`anchor` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_comments_document_idx` ON `document_comments` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_current_content` (
	`document_id` text PRIMARY KEY NOT NULL,
	`auto_content` text NOT NULL,
	`final_content` text NOT NULL,
	`manually_edited` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_files` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text,
	`owner_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_files_r2_key_unique` ON `document_files` (`r2_key`);--> statement-breakpoint
CREATE INDEX `document_files_document_idx` ON `document_files` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_files_owner_idx` ON `document_files` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `document_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_share_links_token_hash_unique` ON `document_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `document_share_links_document_idx` ON `document_share_links` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_template_locales` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	`source_object_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `document_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_locales_uidx` ON `document_template_locales` (`template_id`,`language`);--> statement-breakpoint
CREATE TABLE `document_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`category` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_templates_key_unique` ON `document_templates` (`key`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`language` text NOT NULL,
	`participant_mode` text NOT NULL,
	`acting_side` text,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`lender_name` text,
	`borrower_name` text,
	`is_favorite` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`generated_at` text,
	`signed_file_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `document_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_owner_idx` ON `documents` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `documents_status_idx` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `documents_updated_idx` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `signed_document_access` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`collaborator_user_id` text NOT NULL,
	`view_allowed` integer DEFAULT false NOT NULL,
	`download_allowed` integer DEFAULT false NOT NULL,
	`opened` integer DEFAULT false NOT NULL,
	`restored_view_only` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collaborator_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signed_document_access_uidx` ON `signed_document_access` (`document_id`,`collaborator_user_id`);--> statement-breakpoint
CREATE TABLE `signed_share_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `standalone_signed_pdf_shares`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signed_share_sessions_session_hash_unique` ON `signed_share_sessions` (`session_hash`);--> statement-breakpoint
CREATE INDEX `signed_share_sessions_share_idx` ON `signed_share_sessions` (`share_id`);--> statement-breakpoint
CREATE TABLE `standalone_signed_pdf_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`access_code` text NOT NULL,
	`access_code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`deactivated_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `standalone_signed_pdf_shares_token_hash_unique` ON `standalone_signed_pdf_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `standalone_signed_pdf_shares_file_idx` ON `standalone_signed_pdf_shares` (`file_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`birth_date` text,
	`id_document_type` text,
	`id_document_number` text,
	`id_issued_by` text,
	`id_issue_date` text,
	`pinfl` text,
	`registered_address` text,
	`phone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_email_uidx` ON `user_profiles` (`email`);