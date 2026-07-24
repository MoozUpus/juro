CREATE TABLE `__backup_20260724_manifest` (`table_name` text PRIMARY KEY NOT NULL, `row_count` integer NOT NULL, `created_at` text NOT NULL);--> statement-breakpoint
CREATE TABLE `__backup_20260724_activity_events` AS SELECT * FROM `activity_events`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_consultation_requests` AS SELECT * FROM `consultation_requests`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_contacts` AS SELECT * FROM `contacts`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_answers` AS SELECT * FROM `document_answers`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_attachments` AS SELECT * FROM `document_attachments`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_approvals` AS SELECT * FROM `document_approvals`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_change_proposals` AS SELECT * FROM `document_change_proposals`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_collaborators` AS SELECT * FROM `document_collaborators`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_comments` AS SELECT * FROM `document_comments`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_comment_threads` AS SELECT * FROM `document_comment_threads`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_current_content` AS SELECT * FROM `document_current_content`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_files` AS SELECT * FROM `document_files`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_invitations` AS SELECT * FROM `document_invitations`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_permissions` AS SELECT * FROM `document_permissions`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_revisions` AS SELECT * FROM `document_revisions`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_share_links` AS SELECT * FROM `document_share_links`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_suggestions` AS SELECT * FROM `document_suggestions`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_template_locales` AS SELECT * FROM `document_template_locales`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_document_templates` AS SELECT * FROM `document_templates`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_documents` AS SELECT * FROM `documents`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_notifications` AS SELECT * FROM `notifications`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_signed_document_access` AS SELECT * FROM `signed_document_access`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_signed_share_sessions` AS SELECT * FROM `signed_share_sessions`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_standalone_signed_pdf_shares` AS SELECT * FROM `standalone_signed_pdf_shares`;--> statement-breakpoint
CREATE TABLE `__backup_20260724_user_profiles` AS SELECT * FROM `user_profiles`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'activity_events', count(*), datetime('now') FROM `activity_events`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'consultation_requests', count(*), datetime('now') FROM `consultation_requests`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'contacts', count(*), datetime('now') FROM `contacts`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_answers', count(*), datetime('now') FROM `document_answers`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_attachments', count(*), datetime('now') FROM `document_attachments`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_approvals', count(*), datetime('now') FROM `document_approvals`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_change_proposals', count(*), datetime('now') FROM `document_change_proposals`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_collaborators', count(*), datetime('now') FROM `document_collaborators`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_comments', count(*), datetime('now') FROM `document_comments`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_comment_threads', count(*), datetime('now') FROM `document_comment_threads`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_current_content', count(*), datetime('now') FROM `document_current_content`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_files', count(*), datetime('now') FROM `document_files`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_invitations', count(*), datetime('now') FROM `document_invitations`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_permissions', count(*), datetime('now') FROM `document_permissions`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_revisions', count(*), datetime('now') FROM `document_revisions`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_share_links', count(*), datetime('now') FROM `document_share_links`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_suggestions', count(*), datetime('now') FROM `document_suggestions`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_template_locales', count(*), datetime('now') FROM `document_template_locales`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'document_templates', count(*), datetime('now') FROM `document_templates`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'documents', count(*), datetime('now') FROM `documents`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'notifications', count(*), datetime('now') FROM `notifications`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'signed_document_access', count(*), datetime('now') FROM `signed_document_access`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'signed_share_sessions', count(*), datetime('now') FROM `signed_share_sessions`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'standalone_signed_pdf_shares', count(*), datetime('now') FROM `standalone_signed_pdf_shares`;--> statement-breakpoint
INSERT INTO `__backup_20260724_manifest` SELECT 'user_profiles', count(*), datetime('now') FROM `user_profiles`;--> statement-breakpoint

ALTER TABLE `user_profiles` ADD `locale` text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `account_type` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `company_name` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `onboarding_completed_at` text;--> statement-breakpoint

CREATE TABLE `auth_otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`locale` text DEFAULT 'ru' NOT NULL,
	`account_type` text DEFAULT 'individual' NOT NULL,
	`code_salt` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`invalidated_at` text,
	`request_ip_hash` text,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `auth_otp_email_idx` ON `auth_otp_challenges` (`email_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_otp_expiry_idx` ON `auth_otp_challenges` (`expires_at`);--> statement-breakpoint

CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_uidx` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`,`expires_at`);--> statement-breakpoint

CREATE TABLE `user_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_key` text NOT NULL,
	`document_version` text NOT NULL,
	`accepted_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `user_acceptances_uidx` ON `user_acceptances` (`user_id`,`document_key`,`document_version`);--> statement-breakpoint

CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`account_type` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`legal_area` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`current_revision` integer DEFAULT 1 NOT NULL,
	`next_deadline_at` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `cases_owner_idx` ON `cases` (`owner_user_id`,`updated_at`);--> statement-breakpoint

CREATE TABLE `case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`metadata_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `case_events_case_idx` ON `case_events` (`case_id`,`created_at`);--> statement-breakpoint

CREATE TABLE `action_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`current_revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `action_plans_case_uidx` ON `action_plans` (`case_id`);--> statement-breakpoint

CREATE TABLE `action_plan_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`deadline_type` text DEFAULT 'calendar_days' NOT NULL,
	`due_at` text,
	`assignee_user_id` text,
	`action_type` text,
	`template_code` text,
	`completed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `action_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `action_plan_steps_order_uidx` ON `action_plan_steps` (`plan_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `action_plan_steps_due_idx` ON `action_plan_steps` (`due_at`,`status`);--> statement-breakpoint

CREATE TABLE `consultation_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`specialist_type` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Tashkent' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `consultation_slots_time_uidx` ON `consultation_slots` (`specialist_type`,`starts_at`,`ends_at`);--> statement-breakpoint

CREATE TABLE `consultation_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`case_id` text,
	`plan_step_id` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`context_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `consultation_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_step_id`) REFERENCES `action_plan_steps`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `consultation_bookings_slot_uidx` ON `consultation_bookings` (`slot_id`);--> statement-breakpoint
CREATE INDEX `consultation_bookings_user_idx` ON `consultation_bookings` (`requester_user_id`,`created_at`);--> statement-breakpoint

ALTER TABLE `documents` ADD `case_id` text REFERENCES cases(id);--> statement-breakpoint
ALTER TABLE `documents` ADD `plan_step_id` text REFERENCES action_plan_steps(id);--> statement-breakpoint
CREATE INDEX `documents_case_idx` ON `documents` (`case_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `documents_plan_step_idx` ON `documents` (`plan_step_id`);--> statement-breakpoint
