CREATE TABLE `auth_backup_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`code_hmac` text NOT NULL,
	`key_version` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `auth_totp_credentials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_backup_codes_hmac_uidx` ON `auth_backup_codes` (`code_hmac`);--> statement-breakpoint
CREATE INDEX `auth_backup_codes_user_batch_idx` ON `auth_backup_codes` (`user_id`,`batch_id`,`used_at`);--> statement-breakpoint
CREATE INDEX `auth_backup_codes_credential_idx` ON `auth_backup_codes` (`credential_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_mfa_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`email_otp_challenge_id` text NOT NULL,
	`purpose` text DEFAULT 'login' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`request_user_agent_hmac` text,
	`evidence_key_version` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`invalidated_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `auth_totp_credentials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`email_otp_challenge_id`) REFERENCES `auth_otp_challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_mfa_challenges_purpose_check" CHECK("auth_mfa_challenges"."purpose" IN ('login')),
	CONSTRAINT "auth_mfa_challenges_attempts_check" CHECK("auth_mfa_challenges"."attempt_count" >= 0 AND "auth_mfa_challenges"."max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_mfa_challenges_token_uidx` ON `auth_mfa_challenges` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_mfa_challenges_email_otp_uidx` ON `auth_mfa_challenges` (`email_otp_challenge_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_mfa_challenges_active_user_uidx` ON `auth_mfa_challenges` (`user_id`,`purpose`) WHERE "auth_mfa_challenges"."consumed_at" IS NULL AND "auth_mfa_challenges"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX `auth_mfa_challenges_expiry_idx` ON `auth_mfa_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_mfa_factor_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`factor_type` text NOT NULL,
	`factor_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `auth_totp_credentials`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_mfa_claims_factor_type_check" CHECK("auth_mfa_factor_claims"."factor_type" IN ('totp','backup_code'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_mfa_claims_operation_uidx` ON `auth_mfa_factor_claims` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_mfa_claims_factor_uidx` ON `auth_mfa_factor_claims` (`credential_id`,`factor_type`,`factor_key`);--> statement-breakpoint
CREATE INDEX `auth_mfa_claims_created_idx` ON `auth_mfa_factor_claims` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_totp_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`secret_iv` text NOT NULL,
	`key_version` text NOT NULL,
	`algorithm` text DEFAULT 'SHA1' NOT NULL,
	`digits` integer DEFAULT 6 NOT NULL,
	`period_seconds` integer DEFAULT 30 NOT NULL,
	`verification_attempt_count` integer DEFAULT 0 NOT NULL,
	`verification_max_attempts` integer DEFAULT 5 NOT NULL,
	`last_used_step` integer,
	`backup_batch_id` text,
	`backup_key_version` text,
	`enrollment_expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`verified_at` text,
	`disabled_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_totp_status_check" CHECK("auth_totp_credentials"."status" IN ('pending','active','disabled')),
	CONSTRAINT "auth_totp_algorithm_check" CHECK("auth_totp_credentials"."algorithm" = 'SHA1'),
	CONSTRAINT "auth_totp_digits_check" CHECK("auth_totp_credentials"."digits" = 6),
	CONSTRAINT "auth_totp_period_check" CHECK("auth_totp_credentials"."period_seconds" = 30),
	CONSTRAINT "auth_totp_attempts_check" CHECK("auth_totp_credentials"."verification_attempt_count" >= 0 AND "auth_totp_credentials"."verification_max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE INDEX `auth_totp_user_status_idx` ON `auth_totp_credentials` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_totp_live_user_uidx` ON `auth_totp_credentials` (`user_id`) WHERE "auth_totp_credentials"."status" IN ('pending','active');--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `mfa_verified_at` text;