CREATE TABLE `conflict_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`lawyer_request_id` text NOT NULL,
	`lawyer_profile_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_at` text,
	`reviewed_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conflict_checks_request_lawyer_uidx` ON `conflict_checks` (`lawyer_request_id`,`lawyer_profile_id`);--> statement-breakpoint
CREATE TABLE `lawyer_access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`lawyer_request_id` text NOT NULL,
	`case_id` text NOT NULL,
	`lawyer_user_id` text NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`revoke_reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lawyer_access_grants_case_idx` ON `lawyer_access_grants` (`case_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `lawyer_access_grants_lawyer_idx` ON `lawyer_access_grants` (`lawyer_user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `lawyer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`specialties_json` text DEFAULT '[]' NOT NULL,
	`languages_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`public_approved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_profiles_user_uidx` ON `lawyer_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `lawyer_profiles_status_idx` ON `lawyer_profiles` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `lawyer_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`case_id` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`lawyer_profile_id` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`anonymized_summary` text NOT NULL,
	`requested_scope_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requester_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lawyer_requests_workspace_idx` ON `lawyer_requests` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `lawyer_requests_lawyer_idx` ON `lawyer_requests` (`lawyer_profile_id`,`status`);