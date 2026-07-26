CREATE TABLE `auth_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`user_agent_hash` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_devices_user_idx` ON `auth_devices` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`device_id` text,
	`event_type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`auth_source` text,
	`assurance_level` text,
	`ip_hash` text,
	`user_agent_hash` text,
	`metadata_json` text,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_events_hash_uidx` ON `security_events` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `security_events_chain_uidx` ON `security_events` (`user_id`,`previous_hash`);--> statement-breakpoint
CREATE INDEX `security_events_user_idx` ON `security_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `security_events_type_idx` ON `security_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `security_events_no_update`
BEFORE UPDATE ON `security_events`
BEGIN
  SELECT RAISE(ABORT, 'security_events are append-only');
END;--> statement-breakpoint
CREATE TRIGGER `security_events_no_delete`
BEFORE DELETE ON `security_events`
BEGIN
  SELECT RAISE(ABORT, 'security_events are append-only');
END;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `device_id` text REFERENCES auth_devices(id);--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `auth_method` text DEFAULT 'email_otp' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `assurance_level` text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `authenticated_at` text;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `idle_expires_at` text;--> statement-breakpoint
CREATE INDEX `auth_sessions_device_idx` ON `auth_sessions` (`device_id`,`expires_at`);
