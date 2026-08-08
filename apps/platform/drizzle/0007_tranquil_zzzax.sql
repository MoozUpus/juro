CREATE TABLE `account_deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`reason` text,
	`requested_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_deletion_requests_user_idx` ON `account_deletion_requests` (`user_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `confirmed_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`case_id` text,
	`statement` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`confirmed_by_user_id` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `confirmed_facts_case_idx` ON `confirmed_facts` (`case_id`,`status`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author_type` text NOT NULL,
	`content` text NOT NULL,
	`structured_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_conversation_idx` ON `conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text,
	`source_id` text NOT NULL,
	`citation_label` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_sources_uidx` ON `conversation_sources` (`conversation_id`,`message_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`case_id` text,
	`title` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversations_workspace_idx` ON `conversations` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `legal_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`official_url` text NOT NULL,
	`act_title` text NOT NULL,
	`act_identifier` text,
	`published_at` text,
	`revision_date` text,
	`locale` text NOT NULL,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'verified' NOT NULL,
	`last_checked_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_sources_url_locale_uidx` ON `legal_sources` (`official_url`,`locale`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subscription_id` text,
	`provider_payment_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`status` text NOT NULL,
	`receipt_object_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payments_workspace_idx` ON `payments` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`plan_code` text NOT NULL,
	`status` text NOT NULL,
	`current_period_ends_at` text,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_workspace_uidx` ON `subscriptions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `cases` ADD `workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
CREATE INDEX `cases_workspace_idx` ON `cases` (`workspace_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `consultation_bookings` ADD `workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `documents` ADD `workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `notifications` ADD `workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `email` text;
--> statement-breakpoint
UPDATE `cases`
SET `workspace_id` = (SELECT `default_workspace_id` FROM `user_profiles` WHERE `user_profiles`.`id` = `cases`.`owner_user_id`)
WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `documents`
SET `workspace_id` = (SELECT `default_workspace_id` FROM `user_profiles` WHERE `user_profiles`.`id` = `documents`.`owner_user_id`)
WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `notifications`
SET `workspace_id` = (SELECT `default_workspace_id` FROM `user_profiles` WHERE `user_profiles`.`id` = `notifications`.`user_id`)
WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `consultation_bookings`
SET `workspace_id` = (SELECT `default_workspace_id` FROM `user_profiles` WHERE `user_profiles`.`id` = `consultation_bookings`.`requester_user_id`)
WHERE `workspace_id` IS NULL;
