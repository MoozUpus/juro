CREATE TABLE `user_password_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`algorithm` text DEFAULT 'PBKDF2-SHA256' NOT NULL,
	`iterations` integer DEFAULT 600000 NOT NULL,
	`salt_base64url` text NOT NULL,
	`hash_base64url` text NOT NULL,
	`password_changed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_password_algorithm_check" CHECK("user_password_credentials"."algorithm" = 'PBKDF2-SHA256'),
	CONSTRAINT "user_password_iterations_check" CHECK("user_password_credentials"."iterations" BETWEEN 310000 AND 1000000),
	CONSTRAINT "user_password_salt_check" CHECK(length("user_password_credentials"."salt_base64url") BETWEEN 22 AND 64),
	CONSTRAINT "user_password_hash_check" CHECK(length("user_password_credentials"."hash_base64url") = 43)
);
--> statement-breakpoint
CREATE TABLE `auth_password_rate_limits` (
	`scope_key` text PRIMARY KEY NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "auth_password_rate_limit_count_check" CHECK("auth_password_rate_limits"."failure_count" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `auth_password_rate_limits_updated_idx` ON `auth_password_rate_limits` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `auth_password_attempt_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_key` text NOT NULL,
	`scope_kind` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "auth_password_attempt_scope_check" CHECK("auth_password_attempt_reservations"."scope_kind" IN ('email','ip')),
	CONSTRAINT "auth_password_attempt_expiry_check" CHECK("auth_password_attempt_reservations"."expires_at" > "auth_password_attempt_reservations"."created_at")
);
--> statement-breakpoint
CREATE INDEX `auth_password_attempt_scope_expiry_idx` ON `auth_password_attempt_reservations` (`scope_key`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `auth_password_attempt_expiry_idx` ON `auth_password_attempt_reservations` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `auth_mfa_attempt_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`user_scope_key` text NOT NULL,
	`ip_scope_key` text,
	`expires_at` text NOT NULL,
	`failure_claim_nonce` text,
	`failure_claimed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `auth_mfa_challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_mfa_attempt_expiry_check" CHECK("auth_mfa_attempt_reservations"."expires_at" > "auth_mfa_attempt_reservations"."created_at"),
	CONSTRAINT "auth_mfa_attempt_claim_check" CHECK(("auth_mfa_attempt_reservations"."failure_claim_nonce" IS NULL AND "auth_mfa_attempt_reservations"."failure_claimed_at" IS NULL) OR ("auth_mfa_attempt_reservations"."failure_claim_nonce" IS NOT NULL AND "auth_mfa_attempt_reservations"."failure_claimed_at" >= "auth_mfa_attempt_reservations"."created_at"))
);
--> statement-breakpoint
CREATE INDEX `auth_mfa_attempt_challenge_expiry_idx` ON `auth_mfa_attempt_reservations` (`challenge_id`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `auth_mfa_attempt_user_expiry_idx` ON `auth_mfa_attempt_reservations` (`user_scope_key`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `auth_mfa_attempt_ip_expiry_idx` ON `auth_mfa_attempt_reservations` (`ip_scope_key`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `auth_mfa_attempt_expiry_idx` ON `auth_mfa_attempt_reservations` (`expires_at`);
--> statement-breakpoint
ALTER TABLE `auth_mfa_challenges` ADD `primary_auth_method` text DEFAULT 'email_otp' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `email_verified_at` text;
--> statement-breakpoint
UPDATE `user_profiles`
SET `email_verified_at` = coalesce(`created_at`, datetime('now'))
WHERE `email_verified_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `auth_session_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`source_session_id` text NOT NULL,
	`source_host` text NOT NULL,
	`destination_host` text NOT NULL,
	`redirect_path` text NOT NULL,
	`remember_me` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumed_by_session_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `auth_session_handoffs_hash_check` CHECK(length(`token_hash`)=64 AND `token_hash` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `auth_session_handoffs_hosts_check` CHECK(`source_host` IN ('app.juro.uz','lawyer.juro.uz') AND `destination_host` IN ('app.juro.uz','lawyer.juro.uz') AND `source_host`<>`destination_host`),
	CONSTRAINT `auth_session_handoffs_redirect_check` CHECK(substr(`redirect_path`,1,1)='/' AND substr(`redirect_path`,1,2)<>'//'),
	CONSTRAINT `auth_session_handoffs_remember_check` CHECK(`remember_me` IN (0,1)),
	CONSTRAINT `auth_session_handoffs_expiry_check` CHECK(`expires_at`>`created_at`),
	CONSTRAINT `auth_session_handoffs_consumed_check` CHECK((`consumed_at` IS NULL AND `consumed_by_session_id` IS NULL) OR (`consumed_at` IS NOT NULL AND `consumed_by_session_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_handoffs_token_uidx` ON `auth_session_handoffs` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `auth_session_handoffs_source_idx` ON `auth_session_handoffs` (`source_session_id`,`expires_at`);
