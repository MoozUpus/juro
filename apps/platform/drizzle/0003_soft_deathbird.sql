CREATE TABLE `document_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`participant_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer NOT NULL,
	`approved_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_approvals_uidx` ON `document_approvals` (`document_id`,`participant_user_id`,`revision`);--> statement-breakpoint
CREATE TABLE `document_comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`anchor_type` text DEFAULT 'document' NOT NULL,
	`anchor_key` text,
	`created_by_user_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by_user_id` text,
	`resolved_at` text,
	`reopened_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_comment_threads_document_idx` ON `document_comment_threads` (`document_id`,`status`);--> statement-breakpoint
CREATE TABLE `document_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`target_user_id` text,
	`target_identifier_hash` text,
	`role` text NOT NULL,
	`party_number` integer,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`declined_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_invitations_token_hash_unique` ON `document_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `document_invitations_document_idx` ON `document_invitations` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_invitations_target_idx` ON `document_invitations` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `document_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_permissions_uidx` ON `document_permissions` (`document_id`,`user_id`,`permission`);--> statement-breakpoint
CREATE TABLE `document_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_user_id` text,
	`source` text NOT NULL,
	`changes_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_revisions_uidx` ON `document_revisions` (`document_id`,`revision`);--> statement-breakpoint
CREATE TABLE `document_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`field_key` text,
	`original_json` text NOT NULL,
	`proposed_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by_user_id` text,
	`decided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_suggestions_document_idx` ON `document_suggestions` (`document_id`,`status`);--> statement-breakpoint
ALTER TABLE `document_collaborators` ADD `party_number` integer;--> statement-breakpoint
ALTER TABLE `document_collaborators` ADD `permission_set_json` text;--> statement-breakpoint
ALTER TABLE `document_collaborators` ADD `invitation_status` text DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_collaborators` ADD `approval_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_collaborators` ADD `joined_at` text;--> statement-breakpoint
ALTER TABLE `document_collaborators` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `document_comments` ADD `thread_id` text REFERENCES document_comment_threads(id);--> statement-breakpoint
ALTER TABLE `document_comments` ADD `parent_comment_id` text;--> statement-breakpoint
ALTER TABLE `document_comments` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `document_comments` ADD `updated_at` text;