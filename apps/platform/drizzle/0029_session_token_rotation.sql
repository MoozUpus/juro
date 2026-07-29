CREATE TABLE `auth_session_token_history` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`rotation_reason` text NOT NULL,
	`rotated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_session_token_history_reason_check" CHECK("auth_session_token_history"."rotation_reason" IN ('mfa_elevation','email_change','mfa_disabled','manual','periodic')),
	CONSTRAINT "auth_session_token_history_expiry_check" CHECK("auth_session_token_history"."expires_at" >= "auth_session_token_history"."rotated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_history_hash_uidx` ON `auth_session_token_history` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_session_token_history_session_idx` ON `auth_session_token_history` (`session_id`,`rotated_at`);--> statement-breakpoint
CREATE INDEX `auth_session_token_history_user_idx` ON `auth_session_token_history` (`user_id`,`rotated_at`);--> statement-breakpoint
CREATE INDEX `auth_session_token_history_expiry_idx` ON `auth_session_token_history` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_session_token_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`token_history_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`detected_at` text NOT NULL,
	`action` text NOT NULL,
	FOREIGN KEY (`token_history_id`) REFERENCES `auth_session_token_history`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_session_token_replays_action_check" CHECK("auth_session_token_replays"."action" = 'session_and_device_revoked')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_replays_history_uidx` ON `auth_session_token_replays` (`token_history_id`);--> statement-breakpoint
CREATE INDEX `auth_session_token_replays_user_idx` ON `auth_session_token_replays` (`user_id`,`detected_at`);--> statement-breakpoint
CREATE INDEX `auth_session_token_replays_session_idx` ON `auth_session_token_replays` (`session_id`,`detected_at`);